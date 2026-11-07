// Local test service: REAL PostgreSQL identity RPC/RLS + simulated Auth HTTP.
// This fixture is not a production backend and never contacts Supabase.
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
export async function centralFixture() {
  const db = new PGlite(), root = resolve('.');
  const org='10000000-0000-4000-a000-000000000001';
  const users = [
    { id:randomUUID(),member:'u-manager-1',email:'manager@example.invalid',password:'fixture-only-password' },
    { id:randomUUID(),member:'operator',email:'operator@example.invalid',password:'fixture-operator-only' },
    { id:randomUUID(),member:'staff',email:'staff@example.invalid',password:'fixture-staff-only',type:'at-staff',role:'staff' },
    { id:randomUUID(),member:'resident',email:'resident@example.invalid',password:'fixture-resident-only',type:'at-resident',role:'resident' }
  ];
  const tokens = new Map();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create table auth.users(id uuid primary key,email text,encrypted_password text,email_confirmed_at timestamptz,invited_at timestamptz,created_at timestamptz default now());
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated;`);
  for (const name of ['202610210001_foundation.sql','202611040001_identity.sql','202611040002_identity_invites.sql']) await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  await db.query('insert into public.rh_organizations(id,name,identity_enabled) values($1,$2,true)',[org,'Browser fixture']);
  await db.query(`insert into public.rh_account_types(organization_id,id,name,portal,system_type,full_access,permissions)
    values($1,'at-admin','Admin','manager',true,true,'{}'),($1,'at-building-manager','Quản lý tòa nhà','manager',false,false,ARRAY['dashboard.view','buildings.view','settings.view']),
    ($1,'at-staff','Nhân viên','manager',false,false,ARRAY['dashboard.view','staffTasks.view','staffIncome.view','support.create']),
    ($1,'at-resident','Cư dân','resident',true,false,'{}')`,[org]);
  for(const user of users){
    await db.query('insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())',[user.id,user.email,'fixture-hash']);
    await db.query(`insert into public.rh_memberships(organization_id,id,auth_user_id,account_type_id,role,status,name,all_buildings)
      values($1,$2,$3,$4,$5,'active',$2,$6)`,[org,user.member,user.id,user.type||'at-admin',user.role||'manager',!user.type]);
  }
  async function session(user) {
    const id=randomUUID(), token=randomUUID(),refresh=randomUUID();
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id,user.id]);
    const state={id,user,token,refresh};tokens.set(token,state);tokens.set(refresh,state);
    return {access_token:token,refresh_token:refresh,expires_in:3600,user:{id:user.id,email:user.email}};
  }
  async function rpc(state,name,args){
    if(!/^rh_identity_[a-z_]+$/.test(name))throw Error('Unknown RPC');
    return db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:state.user.id,session_id:state.id,role:'authenticated'})]);
      await tx.exec('set local role authenticated');
      // SQL named parameters, matching PostgREST rather than JS object order.
      const entries=Object.entries(args);if(entries.some(([key])=>!/^p_[a-z_]+$/.test(key)))throw Error('Invalid argument');
      return (await tx.query(`select public.${name}(${entries.map(([key],i)=>key+'=> $'+(i+1)).join(',')}) as result`,entries.map(([,v])=>v))).rows[0].result;
    });
  }
  const operator=await session(users[1]);
  let offline=false, origin;
  const server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://fixture').pathname;
    function json(status,data){res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(data));}
    if(path.startsWith('/__api/')){
      if(offline){json(503,{error:'Fixture offline'});return;}
      try{
        let raw='';for await(const chunk of req)raw+=chunk;
        const body=raw?JSON.parse(raw):{};
        const state=tokens.get((req.headers.authorization||'').replace(/^Bearer /,''));
        const endpoint=path.slice('/__api'.length);
        if(endpoint==='/auth/v1/token'){
          if(new URL(req.url,'http://fixture').searchParams.get('grant_type')==='refresh_token'){
            const old=tokens.get(body.refresh_token);if(!old)throw Error();
            return json(200,{access_token:old.token,refresh_token:old.refresh,expires_in:3600});
          }
          const user=users.find(u=>u.email===body.email&&u.password===body.password);
          if(!user)return json(400,{error:'Invalid'});
          return json(200,await session(user));
        }
        if(endpoint==='/auth/v1/recover')return json(200,{});
        if(!state)return json(401,{error:'Sign in required'});
        if(endpoint==='/auth/v1/user'){
          if(req.method==='PUT'){
            if(typeof body.password!=='string')throw Error();
            state.user.password=body.password;
            await db.query('update auth.users set encrypted_password=$1 where id=$2',[randomUUID(),state.user.id]);
          }
          return json(200,{id:state.user.id,email:state.user.email});
        }
        if(endpoint==='/auth/v1/logout'){
          if(new URL(req.url,'http://fixture').searchParams.get('scope')==='global') await db.query('delete from auth.sessions where user_id=$1',[state.user.id]);
          else await db.query('delete from auth.sessions where id=$1',[state.id]);
          return json(200,{});
        }
        if(endpoint.startsWith('/rest/v1/rpc/'))return json(200,await rpc(state,endpoint.split('/').at(-1),body));
        return json(404,{});
      }catch(_){return json(403,{error:'Denied by fixture database'});}
    }
    const file=resolve(root,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(root+sep))return json(403,{});
    try{
      let content=readFileSync(file);
      if(file.endsWith('auth-config.js'))content=Buffer.from('window.RH_AUTH_CONFIG='+JSON.stringify({mode:'supabase',url:'https://identity.example.test',publicKey:'sb_publishable_fixture',organizationId:org})+';');
      if(file.endsWith('central-auth.js'))content=Buffer.from(`{const real=window.fetch.bind(window);window.fetch=(url,args)=>real(String(url).replace('https://identity.example.test',location.origin+'/__api'),args);}\n`+content.toString());
      if(file.endsWith('.html'))content=Buffer.from(content.toString().replace(/<script[^>]*src="https?:[^"<>]+"[^>]*><\/script>/g,'').replace(/<link[^>]*href="https?:[^"<>]+"[^>]*>/g,''));
      res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(content);
    }catch(_){json(404,{});}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  return {origin,org,users,db,setOffline:value=>{offline=value;},operator:(name,args)=>rpc(tokens.get(operator.access_token),name,{p_org:org,...args}),close:async()=>{await new Promise(r=>server.close(r));await db.close();}};
}
