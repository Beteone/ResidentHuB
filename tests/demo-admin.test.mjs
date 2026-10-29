import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const secret = 'fixture-only-password';
const legacy = { id:'u-manager-1', email:'manager@residenthub.vn', name:'Keep', password:secret, role:'manager', status:'active', accountTypeId:'at-building-manager', buildingIds:['keep'], note:'keep' };
const restricted = { id:'at-admin', name:'Limited on purpose', portal:'manager', system:true, fullAccess:false, permissions:['buildings.view'] };
function environment(initial={}, hostname='localhost', supplied=secret) {
 const store=new Map(Object.entries(initial)), session=new Map(); let prompts=0, confirmations=0;
 const storage=map=>({get length(){return map.size;},key:i=>Array.from(map.keys())[i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});
 const c=vm.createContext({console:{log(){},warn(){}},localStorage:storage(store),sessionStorage:storage(session),location:{hostname,protocol:'http:',replace(){}},prompt(){prompts++;return supplied;},confirm(){confirmations++;return true;},alert(){},addEventListener(){},dispatchEvent(){},CustomEvent:class{}});c.window=c;
 const reload=()=>['auth.js','permissions.js','data.js'].forEach(f=>vm.runInContext(readFileSync(f,'utf8'),c,{filename:f}));reload();
 return {c,store,reload,prompts:()=>prompts,confirmations:()=>confirmations,users:()=>JSON.parse(store.get('residenthub_users')||'[]')};
}
function login(e,id='u-manager-1') { const u=e.c.RH.getUsers().find(u=>u.id===id);e.c.RH.login(u,false); }
const a=environment(), b=environment();
for(const e of [a,b]) {
 const result=e.c.RH.authenticateDetailed(legacy.email,secret);assert.equal(result.ok,true);e.c.RH.login(result.user,false);
 assert.equal(e.c.RHP.can('buildings.create'),true);assert.equal(e.c.RHP.guard('buildings.create'),true);
 assert.equal(e.c.RHP.inspectDemoAdmin().status,'ready');assert.equal(e.c.RHP.buildingScope(),null);
 const before=e.store.get('residenthub_users');e.reload();assert.equal(e.store.get('residenthub_users'),before);assert.equal(e.prompts(),1);
 assert.equal(e.users().filter(u=>u.id===legacy.id).length,1);
}
assert.equal(JSON.stringify(a.c.RHP.typeOfUser(a.c.RHP.currentUser()).permissions),JSON.stringify(b.c.RHP.typeOfUser(b.c.RHP.currentUser()).permissions));
a.c.RHD.create('buildings',{id:'only-a'});assert.equal(b.c.RHD.list('buildings').length,0);
const ordinary={...legacy,id:'ordinary',email:'ordinary@example.test',accountTypeId:'at-admin'};
const initial={residenthub_users:JSON.stringify([legacy,ordinary]),residenthub_account_types:JSON.stringify([restricted,{id:'at-building-manager',portal:'manager',permissions:['buildings.view']}]),residenthub_live_buildings:JSON.stringify([{id:'keep-building'}])};
const old=environment(initial);
assert.equal(old.c.RHP.inspectDemoAdmin().status,'permission-conflict');
for(const [key,value] of Object.entries(initial)) assert.equal(old.store.get(key),value,'Startup must preserve old raw stores');
login(old);
assert.equal(old.c.RHP.can('buildings.create'),false);
assert.equal(old.c.RHP.can('buildings.create',ordinary),false);old.reload();assert.equal(old.c.RHP.can('buildings.create',ordinary),false);
old.c.confirm=()=>false;assert.equal(old.c.RHP.migrateDemoAdmin().reason,'canceled');assert.equal(old.store.has('residenthub_demo_admin_migration_v1'),false);
old.c.confirm=()=>true;old.c.prompt=()=> 'wrong';assert.equal(old.c.RHP.migrateDemoAdmin().reason,'authentication-failed');old.c.prompt=()=>secret;
const usersBefore=old.store.get('residenthub_users'),typesBefore=old.store.get('residenthub_account_types');
const migrated=old.c.RHP.migrateDemoAdmin();assert.equal(migrated.ok,true);
const backup=JSON.parse(old.store.get(migrated.backupKey));assert.equal(backup.usersRaw,usersBefore);assert.equal(backup.typesRaw,typesBefore);assert.equal(backup.status,'completed');
assert.equal(old.c.RHP.can('buildings.create'),true);assert.equal(old.c.RHP.can('buildings.create',ordinary),false);
const afterUser=old.users().find(u=>u.id===legacy.id);for(const [key,value] of Object.entries(legacy)) if(key!=='accountTypeId')assert.deepEqual(afterUser[key],value);
assert.equal(JSON.stringify(old.c.RHP.getType('at-admin')),JSON.stringify(restricted));
assert.equal(old.store.get('residenthub_live_buildings'),initial.residenthub_live_buildings);
assert.equal(old.c.RHP.migrateDemoAdmin().ok,false);old.reload();assert.equal(old.c.RHP.can('buildings.create',ordinary),false);
// Revocation remains revoked, even after an explicit migration has run once.
const types=JSON.parse(old.store.get('residenthub_account_types'));types.find(t=>t.id===afterUser.accountTypeId).fullAccess=false;old.store.set('residenthub_account_types',JSON.stringify(types));old.reload();assert.equal(old.c.RHP.can('buildings.create'),false);assert.equal(old.c.RHP.migrateDemoAdmin().reason,'already-recorded');
for(const patch of [{id:'partial'},{email:'partial@example.test'},{role:'staff'},{role:'resident'}]) {
 const record={...legacy,...patch};const e=environment({residenthub_users:JSON.stringify([record]),residenthub_account_types:JSON.stringify([restricted])});
 assert.equal(e.store.get('residenthub_users'),JSON.stringify([record]));assert.equal(e.c.RHP.migrateDemoAdmin().ok,false);
}
for(const type of ['', 'custom','at-admin']) {
 const record={...legacy,accountTypeId:type};const e=environment({residenthub_users:JSON.stringify([record]),residenthub_account_types:JSON.stringify([restricted])});
 assert.equal(e.users()[0].accountTypeId,type);assert.equal(e.c.RHP.inspectDemoAdmin().status,'permission-conflict');assert.equal(e.prompts(),0);
}
const collision=environment({residenthub_users:JSON.stringify([legacy,{...legacy,id:'other'}])});assert.equal(collision.c.RHP.migrateDemoAdmin().reason,'identity-conflict');
const aliasCollision=environment({residenthub_users:JSON.stringify([legacy,{...legacy,id:'other',email:'MANAGER @residenthub.vn'}])});assert.equal(aliasCollision.c.RHP.migrateDemoAdmin().reason,'identity-conflict');
const locked=environment({residenthub_users:JSON.stringify([{...legacy,status:'locked'}])});assert.equal(locked.c.RHP.migrateDemoAdmin().reason,'inactive-account');
for(const host of ['example.com','localhost.example.com','192.168.1.8']) {const e=environment(initial,host);assert.equal(e.prompts(),0);assert.equal(e.c.RHP.migrateDemoAdmin().reason,'disabled');assert.equal(e.store.get('residenthub_users'),initial.residenthub_users);}
for(const raw of ['{','null']) {const e=environment({residenthub_users:raw,residenthub_account_types:raw});assert.equal(e.store.get('residenthub_users'),raw);assert.equal(e.store.get('residenthub_account_types'),raw);}
for(const supplied of [null,'short']) {const e=environment({},'localhost',supplied);assert.equal(e.users().length,0);assert.equal(environment(Object.fromEntries(e.store)).users().some(u=>u.id===legacy.id),true);}
const resident={id:'u-resident-demo',email:'resident.demo@residenthub.test',password:'changed-fixture',role:'resident',status:'locked',accountTypeId:'at-resident'};
const r=environment({residenthub_users:JSON.stringify([resident])});r.reload();assert.equal(r.store.get('residenthub_users'),JSON.stringify([resident]));
for(const mode of ['live','demo']) for(const entity of ['buildings','apartments','customers','contracts','invoices','meters','deposits','depositTransactions','cashflows','supportRequests']) {
 const key='residenthub_'+mode+'_'+entity,raw=JSON.stringify([{id:'keep'}]);const e=environment({[key]:raw});e.c.RHD.setMode(mode);e.c.RHD.setMode(mode);assert.equal(e.store.get(key),raw);if(entity!=='buildings')assert.equal(e.store.has('residenthub_'+mode+'_buildings'),false);
}
const fresh=environment();fresh.c.RHD.setMode('live');assert.equal(fresh.c.RHD.list('buildings').length,0);fresh.c.RHD.setMode('demo');assert.equal(fresh.c.RHD.list('buildings').length,1);
const businessOnly=environment({residenthub_live_buildings:'[{"id":"legacy-building"}]'});assert.equal(businessOnly.prompts(),0);assert.equal(businessOnly.users().length,0);
const missingRegistry=environment({residenthub_users:JSON.stringify([{...legacy,accountTypeId:'at-admin'}])});assert.equal(missingRegistry.store.has('residenthub_account_types'),false);assert.equal(missingRegistry.c.RHP.inspectDemoAdmin().status,'permission-conflict');
const changed=environment(initial);changed.c.confirm=()=>{changed.store.set('residenthub_users',initial.residenthub_users+' ');return true;};assert.equal(changed.c.RHP.migrateDemoAdmin().reason,'store-changed');assert.equal(changed.store.has('residenthub_demo_admin_migration_v1'),false);
// Backup failure must stop before any account/type changes.
const fail=environment(initial);fail.c.localStorage.setItem=()=>{throw Error('quota');};assert.equal(fail.c.RHP.migrateDemoAdmin().reason,'storage-write-failed');assert.equal(fail.store.get('residenthub_users'),initial.residenthub_users);assert.equal(fail.store.get('residenthub_account_types'),initial.residenthub_account_types);
console.log('PASS A-G: independent clean environments, old permission conflicts, explicit backed-up migration, other at-admin account, revocation, resident credentials, business data and production exclusion.');
