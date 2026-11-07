// Two REAL Chrome processes/profiles, fixture Auth HTTP and real PostgreSQL RPC.
// Does not prove hosted Supabase Auth/email/CORS works. Never contacts VPS.
import assert from 'node:assert/strict';
import { chrome } from './helpers/chrome.mjs';
import { centralFixture } from './helpers/central-fixture.mjs';
const fixture=await centralFixture(), browsers=[];
const legacy=JSON.stringify([{id:'old-local',email:'keep@example.invalid',password:'legacy-fixture-only'}]);
async function login(browser,password='fixture-only-password',email='manager@example.invalid',page='dashboard.html'){
  await browser.send('Page.navigate',{url:fixture.origin+'/index.html'});
  await browser.until('typeof RH!=="undefined" && typeof handleLogin==="function"');
  await browser.evaluate(`localStorage.setItem('residenthub_users',${JSON.stringify(legacy)});localStorage.setItem('residenthub_live_buildings',JSON.stringify([{id:'keep-local-building',name:'Keep'}]));showLoginModal();document.getElementById('loginEmail').value=${JSON.stringify(email)};document.getElementById('loginPassword').value=${JSON.stringify(password)};handleLogin({preventDefault(){}});`);
  await browser.until(`location.pathname.endsWith(${JSON.stringify(page)}) && typeof RH_SESSION!=="undefined" && !!RH_SESSION && document.readyState==='complete'`);
  if(page==='dashboard.html')await browser.until('typeof switchTab==="function"');
}
try{
  const a=await chrome();browsers.push(a);const b=await chrome();browsers.push(b);
  await login(a);await login(b);
  assert.notEqual(a.profile,b.profile);
  const signature='JSON.stringify({user:RH.getSession(),type:RHP.typeOfUser(RH.getSession())})';
  assert.equal(await a.evaluate(signature),await b.evaluate(signature));
  assert.equal(await a.evaluate('RHP.can("buildings.create")'),true);
  for(const browser of browsers){
    assert.equal(await browser.evaluate('localStorage.getItem("residenthub_users")'),legacy);
    assert.equal(await browser.evaluate('RH.getUsers().some(u=>"password" in u)'),false);
    assert.equal(await browser.evaluate('RHD.get("buildings","keep-local-building").name'),'Keep');
  }
  // Exercise the existing role editor through its asynchronous form handler.
  await a.evaluate(`switchTab('roles');RHAccounts.openRole();document.getElementById('rfName').value='Browser fixture role';document.querySelector('.pm-perm[data-perm="buildings.view"]').checked=true;RHAccounts.submitRole({preventDefault(){}});`);
  await a.until('RHP.listTypes().some(t=>t.name==="Browser fixture role")');
  assert.equal(await a.evaluate('document.getElementById("rhDrawerOverlay").classList.contains("show")'),false);
  await a.evaluate('window.confirm=()=>true;RHAccounts.deleteRole(RHP.listTypes().find(t=>t.name==="Browser fixture role").id)');
  await a.until('!RHP.listTypes().some(t=>t.name==="Browser fixture role")');
  await a.send('Page.navigate',{url:fixture.origin+'/templates.html'});
  await a.until('location.pathname.endsWith("templates.html") && typeof renderContractTab==="function" && !!RH.getSession()');
  await a.send('Page.navigate',{url:fixture.origin+'/dashboard.html'});
  await a.until('location.pathname.endsWith("dashboard.html") && typeof switchTab==="function" && !!RH.getSession()');
  // Trusted fixture operator revokes Admin. Both independent browsers read DB context.
  await fixture.operator('rh_identity_update_member',{p_id:'u-manager-1',p_patch:{accountTypeId:'at-building-manager'}});
  for(const browser of browsers){
    assert.equal((await browser.evaluate('RH.refreshIdentity()')).ok,true);
    assert.equal(await browser.evaluate('RHP.can("buildings.create")'),false);
    assert.equal(await browser.evaluate('RHP.isAdmin()'),false);
  }
  assert.equal((await a.evaluate('RH.updateUser("operator",{status:"locked"})')).ok,false);
  assert.equal((await a.evaluate('RHP.saveType(null,{name:"Escalation",portal:"manager",permissions:["users.lock"]})')).ok,false);
  // Local grants/session spoofing never changes the central resolver.
  await b.evaluate(`localStorage.setItem('residenthub_account_types',JSON.stringify([{id:'at-building-manager',portal:'manager',fullAccess:true}]));window.RH_SESSION={id:'demo',demo:true};`);
  assert.equal(await b.evaluate('RHP.isAdmin()'),false);
  // Lock rejects the old sessions on both browsers; unlock does not restore them.
  await fixture.operator('rh_identity_update_member',{p_id:'u-manager-1',p_patch:{status:'locked'}});
  for(const browser of browsers){await browser.evaluate('RH.refreshIdentity()');await browser.until('location.pathname.endsWith("index.html") && typeof RH!=="undefined" && !!RH.central');}
  await fixture.operator('rh_identity_update_member',{p_id:'u-manager-1',p_patch:{status:'active'}});
  await login(a);await login(b);
  const changed=await a.evaluate('RH.beginOwnPasswordChange({currentPassword:"fixture-only-password",newPassword:"changed-fixture-password",confirmPassword:"changed-fixture-password"})');
  assert.equal(changed.passwordChanged,true);
  await b.evaluate('RH.refreshIdentity()');await b.until('location.pathname.endsWith("index.html") && typeof RH!=="undefined" && !!RH.central');
  assert.equal((await b.evaluate('RH.authenticateDetailed("manager@example.invalid","fixture-only-password")')).ok,false);
  await login(a,'changed-fixture-password');await login(b,'changed-fixture-password');
  // Failure never falls back to local legacy credentials/grants.
  fixture.setOffline(true);
  await a.evaluate('RH.refreshIdentity()');await a.until('location.pathname.endsWith("index.html") && typeof RH!=="undefined" && !!RH.central');
  assert.equal((await a.evaluate('RH.authenticateDetailed("keep@example.invalid","legacy-fixture-only")')).ok,false);
  assert.equal(await a.evaluate('localStorage.getItem("residenthub_users")'),legacy);
  assert.equal(await a.evaluate('RH.getSession()'),null);
  assert.equal(await a.evaluate('RHP.can("buildings.create")'),false);
  fixture.setOffline(false);
  await login(a,'fixture-staff-only','staff@example.invalid','staff.html');
  assert.equal(await a.evaluate('RH.getSession().role'),'staff');
  assert.equal(await a.evaluate('RHP.isAdmin()'),false);
  await b.evaluate('RH.logout()');
  await b.until('location.pathname.endsWith("index.html") && typeof RH!=="undefined"');
  await login(b,'fixture-resident-only','resident@example.invalid','resident-web.html');
  assert.equal(await b.evaluate('RH.getSession().role'),'resident');
  for(const browser of browsers)assert.deepEqual(browser.errors,[]);
  console.log('PASS two independent Chrome profiles + PostgreSQL RPC fixture: shared login/roles, revocation, locks, password change, legacy preservation, fail closed. Hosted Supabase NOT tested.');
}finally{for(const browser of browsers)browser.close();await fixture.close();}
