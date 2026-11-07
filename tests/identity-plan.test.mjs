import assert from 'node:assert/strict';
import { identityPlan } from '../tools/migration/identity-plan.mjs';
import { publicConfig } from '../tools/auth-config.mjs';
const org='10000000-0000-4000-a000-000000000001',authUserId='20000000-0000-4000-a000-000000000001';
const user={id:'u-manager-1',email:'manager@residenthub.vn',name:'Keep',password:'legacy-fixture-secret',role:'manager',status:'locked',accountTypeId:'at-admin',buildingIds:['keep']};
const type={id:'at-admin',name:'Admin',portal:'manager',system:true,fullAccess:true,permissions:['customBusiness.approve']};
const link={legacyId:user.id,authUserId,verified:true,confirmedEmail:user.email,approveAdmin:true};
const input={organizationId:org,users:[user],types:[type],links:[link],existingMemberships:[]};
const before=JSON.stringify(input),result=identityPlan(input);
assert.equal(result.ok,true);assert.equal(result.dryRun,true);assert.equal(result.members[0].status,'locked');
assert.deepEqual(result.types[0].permissions,['customBusiness.approve']);assert.deepEqual(result.members[0].buildingIds,['keep']);
assert.doesNotMatch(JSON.stringify(result),/password|legacy-fixture-secret/);assert.equal(JSON.stringify(input),before);
for(const change of [
 {links:[{...link,verified:false}]},{links:[{...link,approveAdmin:false}]},
 {links:[{...link,confirmedEmail:'other@example.invalid'}]}, {users:[user,user]},
 {users:[{...user,id:'other'}]}, {existingMemberships:[{organizationId:org,id:user.id,authUserId}]},
 {types:[]}, {users:[{...user,status:undefined}]}
]){const failed=identityPlan({...input,...change});assert.equal(failed.ok,false);assert.deepEqual(failed.members,[]);}
const env={VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',VITE_SUPABASE_ORGANIZATION_ID:org};
assert.equal(publicConfig(env).mode,'supabase');
for(const key of ['sb_secret_fixture','a.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.c'])assert.throws(()=>publicConfig({...env,VITE_SUPABASE_PUBLISHABLE_KEY:key}));
assert.throws(()=>publicConfig({...env,VITE_SUPABASE_URL:'http://example.supabase.co'}));
assert.throws(()=>publicConfig({...env,VITE_SUPABASE_ORGANIZATION_ID:''}));
console.log('PASS offline identity dry-run: explicit verified mapping, no overwrite/auto-escalation/credentials; public config rejects service secrets');
