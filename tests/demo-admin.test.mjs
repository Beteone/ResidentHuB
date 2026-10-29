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
 return {c,store,session,reload,prompts:()=>prompts,confirmations:()=>confirmations,users:()=>JSON.parse(store.get('residenthub_users')||'[]')};
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
const snapshot=JSON.stringify([...old.store]);
assert.equal(old.c.RHP.migrateDemoAdmin().reason,'requires-trusted-reprovisioning');
assert.equal(JSON.stringify([...old.store]),snapshot);
assert.equal(old.prompts(),0);assert.equal(old.confirmations(),0);
assert.equal(old.c.RHP.can('buildings.create'),false);
assert.equal(old.c.RHP.can('buildings.create',ordinary),false);
for(const patch of [{id:'partial'},{email:'partial@example.test'},{role:'staff'},{role:'resident'}]) {
 const record={...legacy,...patch};const e=environment({residenthub_users:JSON.stringify([record]),residenthub_account_types:JSON.stringify([restricted])});
 assert.equal(e.store.get('residenthub_users'),JSON.stringify([record]));assert.equal(e.c.RHP.migrateDemoAdmin().ok,false);
}
for(const type of ['', 'custom','at-admin']) {
 const record={...legacy,accountTypeId:type};const e=environment({residenthub_users:JSON.stringify([record]),residenthub_account_types:JSON.stringify([restricted])});
 assert.equal(e.users()[0].accountTypeId,type);assert.equal(e.c.RHP.inspectDemoAdmin().status,'permission-conflict');assert.equal(e.prompts(),0);
}
const collision=environment({residenthub_users:JSON.stringify([legacy,{...legacy,id:'other'}])});assert.equal(collision.c.RHP.migrateDemoAdmin().reason,'requires-trusted-reprovisioning');
const aliasCollision=environment({residenthub_users:JSON.stringify([legacy,{...legacy,id:'other',email:'MANAGER @residenthub.vn'}])});assert.equal(aliasCollision.c.RHP.migrateDemoAdmin().reason,'requires-trusted-reprovisioning');
const locked=environment({residenthub_users:JSON.stringify([{...legacy,status:'locked'}])});assert.equal(locked.c.RHP.migrateDemoAdmin().reason,'requires-trusted-reprovisioning');
for(const host of ['example.com','localhost.example.com','192.168.1.8']) {const e=environment(initial,host);assert.equal(e.prompts(),0);assert.equal(e.c.RHP.migrateDemoAdmin().reason,'requires-trusted-reprovisioning');assert.equal(e.store.get('residenthub_users'),initial.residenthub_users);}
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
const changed=environment(initial);changed.c.confirm=()=>{changed.store.set('residenthub_users',initial.residenthub_users+' ');return true;};assert.equal(changed.c.RHP.migrateDemoAdmin().reason,'requires-trusted-reprovisioning');assert.equal(changed.store.has('residenthub_demo_admin_migration_v1'),false);
// Even when writes fail, the disabled entry point does not attempt recovery.
const fail=environment(initial);fail.c.localStorage.setItem=()=>{throw Error('quota');};assert.equal(fail.c.RHP.migrateDemoAdmin().reason,'requires-trusted-reprovisioning');assert.equal(fail.store.get('residenthub_users'),initial.residenthub_users);assert.equal(fail.store.get('residenthub_account_types'),initial.residenthub_account_types);
// Read-only diagnostics and explicit-user checks.
login(a);const beforeDiagnostic=JSON.stringify([...a.store]);
const report=a.c.RHP.diagnoseBuildingCreate();
assert.equal(report.buildingsCreate,true);assert.equal(report.openFormCheck,report.renderCheck);
assert.equal(JSON.stringify([...a.store]),beforeDiagnostic);assert.equal(JSON.stringify(report).includes(secret),false);
const lockedUsers=a.users();lockedUsers.find(u=>u.id===legacy.id).status='locked';
a.store.set('residenthub_users',JSON.stringify(lockedUsers));
const lockedSnapshot=JSON.stringify([[...a.store],[...a.session]]);
assert.equal(a.c.RHP.diagnoseBuildingCreate().sessionValid,false);
assert.equal(JSON.stringify([[...a.store],[...a.session]]),lockedSnapshot);
assert.equal(a.c.RHP.can('buildings.create'),false);assert.equal(a.c.RHP.guard('buildings.create'),false);
console.log('PASS clean stores, restricted roles, read-only diagnostics, locked session, no client privilege restoration, data preservation.');

// Explicit compatibility recovery only for the exact, active demo with no type.
const standardTypes=a.store.get('residenthub_account_types');
const backupKey='residenthub_demo_admin_link_recovery_v2';
for(const missing of [undefined,null,'','  ']) {
 const demo={...legacy,accountTypeId:missing};
 const others=[ordinary,{...resident,id:'other-resident'}];
 const e=environment({residenthub_users:JSON.stringify([demo,...others]),residenthub_account_types:standardTypes,residenthub_live_buildings:initial.residenthub_live_buildings});
 const before=e.store.get('residenthub_users');assert.equal(e.prompts(),0);
 assert.equal(e.c.RHP.migrateDemoAdmin().reason,'demo-login-required');
 e.session.set('residenthub_session',JSON.stringify({id:legacy.id,credentialVersion:0}));
 assert.equal(e.c.RHP.diagnoseBuildingCreate().buildingsCreate,false);
 e.c.prompt=()=>null;assert.equal(e.c.RHP.migrateDemoAdmin().reason,'canceled');
 e.c.prompt=()=> 'KHOI PHUC ADMIN DEMO';e.c.confirm=()=>false;
 assert.equal(e.c.RHP.migrateDemoAdmin().reason,'canceled');assert.equal(e.store.get('residenthub_users'),before);
 e.c.confirm=()=>true;assert.equal(e.c.RHP.migrateDemoAdmin().ok,true);
 assert.equal(e.store.get('residenthub_account_types'),standardTypes);
 assert.equal(e.store.get('residenthub_live_buildings'),initial.residenthub_live_buildings);
 assert.equal(JSON.parse(e.store.get(backupKey)).usersRaw,before);
 const after=e.users();assert.equal(after[0].accountTypeId,'at-admin');
 for(const [key,value] of Object.entries(demo))if(key!=='accountTypeId')assert.deepEqual(after[0][key],value);
 assert.deepEqual(after.slice(1),others);
 assert.equal(e.c.RHP.can('buildings.create'),true);assert.equal(e.c.RHP.guard('buildings.create'),true);
 const snapshot=JSON.stringify([...e.store]);assert.equal(e.c.RHP.migrateDemoAdmin().ok,false);e.reload();assert.equal(JSON.stringify([...e.store]),snapshot);
 // Removing the link later must not permit repeated recovery after revocation.
 after[0].accountTypeId='';e.store.set('residenthub_users',JSON.stringify(after));
 assert.equal(e.c.RHP.migrateDemoAdmin().reason,'already-recorded');
}
function recoverable(patch={},typeRaw=standardTypes,host='localhost') {
 const e=environment({residenthub_users:JSON.stringify([{...legacy,accountTypeId:'',...patch}]),residenthub_account_types:typeRaw},host);
 if(host==='localhost')e.session.set('residenthub_session',JSON.stringify({id:legacy.id,credentialVersion:0}));e.c.prompt=()=> 'KHOI PHUC ADMIN DEMO';return e;
}
for(const status of ['locked','inactive'])assert.equal(recoverable({status}).c.RHP.migrateDemoAdmin().reason,'inactive-account');
assert.equal(recoverable({},JSON.stringify([restricted])).c.RHP.migrateDemoAdmin().reason,'admin-type-conflict');
assert.equal(recoverable({},JSON.stringify([])).c.RHP.migrateDemoAdmin().reason,'admin-type-conflict');
assert.equal(recoverable({},standardTypes,'example.com').c.RHP.migrateDemoAdmin().ok,false);
for(const accountTypeId of ['at-building-manager','at-admin','unknown',0,false,{}])assert.equal(recoverable({accountTypeId}).c.RHP.migrateDemoAdmin().ok,false);
const raced=recoverable();raced.c.confirm=()=>{raced.store.set('residenthub_users',raced.store.get('residenthub_users')+' ');return true;};
assert.equal(raced.c.RHP.migrateDemoAdmin().reason,'store-changed');assert.equal(raced.store.has(backupKey),false);
const quota=recoverable();const quotaBefore=quota.store.get('residenthub_users');quota.c.localStorage.setItem=()=>{throw Error('quota');};
assert.equal(quota.c.RHP.migrateDemoAdmin().reason,'storage-write-failed');assert.equal(quota.store.get('residenthub_users'),quotaBefore);
const partial=recoverable();const partialBefore=partial.store.get('residenthub_users');const set=partial.c.localStorage.setItem;
partial.c.localStorage.setItem=(key,value)=>{if(key==='residenthub_users')throw Error('quota');set(key,value);};
assert.equal(partial.c.RHP.migrateDemoAdmin().reason,'storage-write-failed');assert.equal(partial.store.get('residenthub_users'),partialBefore);
assert.equal(partial.c.RHP.migrateDemoAdmin().reason,'already-recorded');
console.log('PASS explicit missing-link recovery, cancellation, revocation, restricted/missing Admin, scope/password/status preservation, race and write failures.');
