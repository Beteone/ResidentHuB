// Opt-in smoke test against an APPROVED staging deployment. No account/role or
// business mutations. Login/logout create/remove only these test Auth sessions.
import assert from 'node:assert/strict';
import { chrome } from './helpers/chrome.mjs';
const { RH_LIVE_BASE_URL, RH_TEST_EMAIL, RH_TEST_PASSWORD, RH_LIVE_ALLOW_AUTH } = process.env;
if (RH_LIVE_ALLOW_AUTH !== 'staging' || !RH_LIVE_BASE_URL || !RH_TEST_EMAIL || !RH_TEST_PASSWORD) {
  console.log('SKIP hosted Supabase: set staging URL, explicit RH_LIVE_ALLOW_AUTH=staging and test account credentials in environment.');
  process.exit(0);
}
const base = new URL(RH_LIVE_BASE_URL);
assert.equal(base.protocol,'https:','Hosted Auth smoke test requires HTTPS');
assert.equal(base.username+base.password+base.search+base.hash,'','Use a plain staging URL');
const browsers=[];
try {
  for (let n=0;n<2;n++) {
    const browser=await chrome();browsers.push(browser);
    await browser.send('Page.navigate',{url:new URL('index.html',base).href});
    await browser.until('typeof RH!=="undefined" && typeof RHCentral!=="undefined" && typeof handleLogin==="function"');
    assert.equal(await browser.evaluate('location.origin'),base.origin);
    assert.equal(await browser.evaluate('RH.central'),true,'Must not send staging credentials to legacy local auth');
    await browser.evaluate(`showLoginModal();document.getElementById('loginEmail').value=${JSON.stringify(RH_TEST_EMAIL)};document.getElementById('loginPassword').value=${JSON.stringify(RH_TEST_PASSWORD)};handleLogin({preventDefault(){}});`);
    await browser.until('!location.pathname.endsWith("index.html") && typeof RH!=="undefined" && !!RH.getSession() && document.readyState==="complete"');
    assert.equal((await browser.evaluate('RH.refreshIdentity()')).ok,true);
    assert.equal(await browser.evaluate('RH.getUsers().some(u=>"password" in u || "pass" in u)'),false);
  }
  const expression=`JSON.stringify((()=>{const u=RH.getSession(),t=RHCentral.types().find(t=>t.id===u.accountTypeId);return {id:u.id,role:u.role,accountTypeId:u.accountTypeId,allBuildings:u.allBuildings,buildingIds:[...u.buildingIds].sort(),type:t&&{id:t.id,portal:t.portal,fullAccess:t.fullAccess,permissions:[...t.permissions].sort()}}})())`;
  assert.equal(await browsers[0].evaluate(expression),await browsers[1].evaluate(expression));
  for(const browser of browsers)assert.deepEqual(browser.errors,[]);
  console.log('PASS hosted staging: two independent browsers authenticated and read identical identity/permissions. No mutation acceptance tests run.');
} finally {
  for(const browser of browsers){await browser.evaluate('typeof RH!=="undefined" && RH.central ? RH.logout() : null').catch(()=>{});browser.close();}
}
