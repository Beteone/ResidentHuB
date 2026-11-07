// Real PostgreSQL engine (WASM), with a minimal Supabase Auth schema fixture.
// No network, Supabase project, SMTP or production data is used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const org = '10000000-0000-4000-a000-000000000001';
const otherOrg = '10000000-0000-4000-a000-000000000002';
const uid = n => `20000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const sid = n => `30000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
async function as(n, session = n) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: uid(n), session_id: sid(session), role: 'authenticated' })]);
  await db.exec('set role authenticated');
}
async function rpc(name, args = []) {
  return (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as result`, args)).rows[0].result;
}
async function denied(fn) { await assert.rejects(fn); }
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,encrypted_password text,email_confirmed_at timestamptz,invited_at timestamptz,created_at timestamptz default now());
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated;
  `);
  for (const file of ['202610210001_foundation.sql', '202611040001_identity.sql', '202611040002_identity_invites.sql']) {
    await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  }
  await db.query('insert into public.rh_organizations(id,name,identity_enabled) values ($1,$2,true),($3,$4,true)', [org, 'Fixture', otherOrg, 'Other fixture']);
  for (let n = 1; n <= 4; n++) {
    await db.query('insert into auth.users(id,email,encrypted_password,email_confirmed_at) values ($1,$2,$3,now())', [uid(n), `fixture${n}@example.invalid`, 'fixture-hash']);
    await db.query('insert into auth.sessions(id,user_id) values ($1,$2)', [sid(n), uid(n)]);
  }
  for (const [id, portal, system, full, permissions] of [
    ['at-admin','manager',true,true,[]],
    ['at-building-manager','manager',false,false,['buildings.view','users.view','users.update','users.lock','users.create','roles.create','roles.update']],
    ['at-staff','manager',false,false,['staffTasks.view']],
    ['at-resident','resident',true,false,[]]
  ]) await db.query('insert into public.rh_account_types(organization_id,id,name,portal,system_type,full_access,permissions) values ($1,$2,$2,$3,$4,$5,$6)', [org,id,portal,system,full,permissions]);
  for (const [n, id, type, role, all] of [
    [1,'u-manager-1','at-admin','manager',true], [2,'manager','at-building-manager','manager',false],
    [3,'staff','at-staff','staff',false], [4,'resident','at-resident','resident',false]
  ]) await db.query('insert into public.rh_memberships(organization_id,id,auth_user_id,account_type_id,role,status,name,all_buildings) values ($1,$2,$3,$4,$5,$6,$2,$7)', [org,id,uid(n),type,role,'active',all]);
  await db.query('insert into public.rh_buildings(organization_id,payload) values ($1,$2)',[org, {id:'b1',name:'Keep fixture'}]);
  await db.query('insert into public.rh_building_assignments values ($1,$2,$3)',[org,'manager','b1']);
  await as(1);
  let c = await rpc('rh_identity_context',[org]);
  assert.equal(c.user.id,'u-manager-1'); assert.equal(c.users.length,4);
  assert.equal(c.types.find(t=>t.id==='at-admin').fullAccess,true);
  assert.doesNotMatch(JSON.stringify(c),/encrypted_password|fixture-hash|session_valid_after/);
  await denied(()=>rpc('rh_identity_context',[otherOrg]));
  await db.exec('set role anon');
  await denied(()=>rpc('rh_identity_context',[org]));
  await as(2);
  c=await rpc('rh_identity_context',[org]); assert.equal(c.user.accountTypeId,'at-building-manager');
  assert.equal(c.types.find(t=>t.id===c.user.accountTypeId).fullAccess,false);
  assert.equal(c.users.some(u=>u.id==='u-manager-1'),false);
  await denied(()=>rpc('rh_identity_update_member',[org,'u-manager-1',{status:'locked'}]));
  await denied(()=>rpc('rh_identity_update_member',[org,'staff',{accountTypeId:'at-admin'}]));
  await denied(()=>rpc('rh_identity_update_member',[org,'staff',{allBuildings:true}]));
  await denied(()=>rpc('rh_identity_save_type',[org,'at-building-manager',{name:'Escalation',portal:'manager',permissions:['roles.delete']} ]));
  await denied(()=>rpc('rh_identity_save_type',[org,null,{name:'Escalation',portal:'manager',permissions:['roles.delete']} ]));
  await denied(()=>rpc('rh_identity_save_type',[org,null,{name:'Escalation',portal:'manager',permissions:[],fullAccess:true} ]));
  await denied(()=>rpc('rh_identity_update_member',[org,'staff',{password:'must-not-import'}]));
  // Staff has permissions outside the delegated editor's ceiling; not manageable.
  await denied(()=>rpc('rh_identity_update_member',[org,'staff',{status:'locked'}]));
  await as(3);
  await denied(()=>rpc('rh_identity_update_member',[org,'manager',{status:'locked'}]));
  await denied(()=>db.exec(`update public.rh_memberships set account_type_id='at-admin'`));
  await denied(()=>db.exec(`insert into public.rh_account_types(organization_id,id,name,portal) values ('${org}','hack','hack','manager')`));
  const profiled=await rpc('rh_identity_update_profile',[org,{phone:'0123456789',preferences:{theme:'dark'}}]);
  assert.equal(profiled.profileUpdateHistory[0].managerStatus,'new');
  await denied(()=>rpc('rh_identity_profile_follow_up',[org,'staff',profiled.profileUpdateHistory[0].id,{managerStatus:'resolved'}]));
  await as(1);
  assert.equal((await rpc('rh_identity_profile_follow_up',[org,'staff',profiled.profileUpdateHistory[0].id,{managerStatus:'contacted',managerNote:'Fixture follow-up'}])).managerStatus,'contacted');
  await as(3);
  await denied(()=>rpc('rh_identity_update_profile',[org,{accountTypeId:'at-admin'}]));
  await denied(()=>rpc('rh_identity_update_profile',[org,{preferences:{password:'never'}}]));
  await denied(()=>rpc('rh_identity_update_profile',[org,{preferences:{theme:'neon'}}]));
  await denied(()=>rpc('rh_identity_update_profile',[org,{preferences:{notifications:{channels:{email:true}}}}]));
  await as(4);
  c=await rpc('rh_identity_context',[org]); assert.equal(c.user.role,'resident'); assert.equal(c.users.length,1);
  await denied(()=>rpc('rh_identity_save_type',[org,null,{name:'hack',portal:'manager',permissions:[]} ]));
  await as(1);
  await rpc('rh_identity_update_member',[org,'staff',{status:'locked'}]);
  await as(3); await denied(()=>rpc('rh_identity_context',[org]));
  await as(1); await rpc('rh_identity_update_member',[org,'staff',{status:'active'}]);
  await as(3); await denied(()=>rpc('rh_identity_context',[org])); // old session stays revoked after unlock
  await db.exec('reset role');
  await db.query('insert into auth.sessions(id,user_id) values ($1,$2)',[sid(13),uid(3)]);
  await as(3,13); assert.equal((await rpc('rh_identity_context',[org])).user.status,'active');
  await as(1);
  await rpc('rh_identity_save_type',[org,'at-staff',{name:'Nhân viên',portal:'manager',permissions:['support.create']}]);
  await as(3,13); c=await rpc('rh_identity_context',[org]); assert.deepEqual(c.types[0].permissions,['support.create']);
  await db.exec('reset role');
  await db.query('update auth.users set encrypted_password=$1 where id=$2',['changed-fixture-hash',uid(3)]);
  await as(3,13); await denied(()=>rpc('rh_identity_context',[org]));
  await db.exec('reset role');
  await db.query('insert into auth.sessions(id,user_id) values ($1,$2)',[sid(23),uid(3)]);
  await as(3,23); assert.equal((await rpc('rh_identity_context',[org])).user.id,'staff');
  await db.exec('reset role'); await db.query('delete from auth.sessions where id=$1',[sid(23)]);
  await as(3,23); await denied(()=>rpc('rh_identity_context',[org]));
  await as(1);
  await denied(()=>rpc('rh_identity_delete_member',[org,'u-manager-1']));
  await denied(()=>rpc('rh_identity_delete_type',[org,'at-admin']));
  await denied(()=>rpc('rh_identity_invite_check',[org,{name:'No',email:'new@example.invalid',accountTypeId:'at-admin',role:'manager',status:'active'}]));
  await denied(()=>rpc('rh_identity_attach_invite',[org,{},uid(5),uid(1),sid(1),new Date().toISOString()])); // authenticated cannot use service RPC
  const member={name:'Invited',email:'fixture5@example.invalid',accountTypeId:'at-staff',role:'staff',status:'active',buildingIds:[]};
  const checked=await rpc('rh_identity_invite_check',[org,member]);
  assert.equal(checked.actor,uid(1));
  await db.exec('reset role'); await db.query('insert into auth.users(id,email,invited_at) values($1,$2,now())',[uid(5),member.email]);
  await as(1); await denied(()=>rpc('rh_identity_invite_check',[org,member])); // existing unconfirmed identity is not auto-linked
  await db.exec('set role service_role');
  const invited=await rpc('rh_identity_attach_invite',[org,member,uid(5),uid(1),sid(1),checked.checkedAt]);
  assert.equal(invited.invited,true);
  await denied(()=>rpc('rh_identity_attach_invite',[org,member,uid(5),uid(1),sid(1),checked.checkedAt]));
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from public.rh_buildings')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from public.rh_memberships where id=$1',['u-manager-1'])).rows[0].n,1);
  console.log('PASS PostgreSQL identity migrations/RPC/RLS: roles, isolation, grant ceilings, lock/unlock, password/session revocation, invitations, no business data loss');
} finally { await db.close(); }
