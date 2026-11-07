import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const legacy = JSON.stringify([{ id:'u-manager-1',email:'manager@residenthub.vn',password:'legacy-fixture-only',role:'manager',status:'active',accountTypeId:'at-admin' }]);
for(const config of [undefined,{mode:'supabase'}, {mode:'unexpected'},
  {mode:'supabase',url:'https://example.supabase.co',publicKey:'sb_secret_fixture',organizationId:'10000000-0000-4000-a000-000000000001'}]) {
  const local=new Map([['residenthub_users',legacy],['residenthub_account_types',JSON.stringify([{id:'at-admin',portal:'manager',fullAccess:true}])]]),session=new Map();
  let requests=0;
  const c=vm.createContext({ URL,AbortController,setTimeout,clearTimeout,atob,
    setInterval(){},addEventListener(){},dispatchEvent(){},CustomEvent:class{},
    location:{href:'http://localhost/index.html',protocol:'http:',hostname:'localhost'},
    prompt(){throw Error('Central mode must never provision a local demo');},
    localStorage:{getItem:k=>local.get(k)??null,setItem(){throw Error('Unexpected localStorage write');},removeItem(){throw Error('Unexpected localStorage delete');}},
    sessionStorage:{getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},
    fetch(){requests++;throw Error('Invalid configuration must not send credentials');},RH_AUTH_CONFIG:config });
  c.window=c;
  for(const file of ['central-auth.js','auth.js','permissions.js']) vm.runInContext(readFileSync(file,'utf8'),c,{filename:file});
  await c.RH.ready;
  assert.equal(c.RH.central,true);
  assert.equal((await c.RH.authenticateDetailed('manager@residenthub.vn','legacy-fixture-only')).ok,false);
  assert.equal(c.RH.login({id:'u-manager-1',role:'manager'}),null);
  c.RH_SESSION={id:'demo',demo:true};assert.equal(c.RHP.can('buildings.create'),false);
  assert.equal((await c.RH.createUser({password:'never-upload'})).ok,false);
  assert.equal((await c.RH.updateUser('u-manager-1',{password:'never-upload'})).ok,false);
  assert.equal(local.get('residenthub_users'),legacy);assert.equal(requests,0);
}
console.log('PASS central mode: missing/malformed config and secret keys fail closed, no local fallback, no provisioning or credential import');
