// Two REAL Chrome processes/profiles (= two machines) against one fixture server:
// simulated Auth HTTP + REAL PostgreSQL running every migration incl. business data.
// Exercises the existing UI handlers (RHUI.*) and RHD API. Does NOT contact
// Supabase or the VPS; hosted Auth/CORS/network latency are not covered here.
import assert from 'node:assert/strict';
import { chrome } from './helpers/chrome.mjs';
import { centralFixture } from './helpers/central-fixture.mjs';

const fixture = await centralFixture({ dataAccess: true }), browsers = [];
const legacyBuildings = JSON.stringify([{ id: 'keep-local-building', name: 'Dữ liệu cũ trên máy này' }]);
// A same-origin document that loads no ResidentHub script = the raw browser store.
async function rawStore(browser, expression) {
  await browser.send('Page.navigate', { url: fixture.origin + '/theme.css' });
  await browser.until('document.readyState==="complete"');
  return browser.evaluate(expression);
}
async function login(browser, { email = 'manager@example.invalid', password = 'fixture-only-password', page = 'dashboard.html' } = {}) {
  await browser.send('Page.navigate', { url: fixture.origin + '/index.html' });
  await browser.until('typeof RH!=="undefined" && typeof handleLogin==="function"');
  await browser.evaluate(`showLoginModal();document.getElementById('loginEmail').value=${JSON.stringify(email)};document.getElementById('loginPassword').value=${JSON.stringify(password)};handleLogin({preventDefault(){}});`);
  await browser.until(`location.pathname.endsWith(${JSON.stringify(page)}) && typeof RH_SESSION!=="undefined" && !!RH_SESSION && document.readyState==='complete'`);
  if (page === 'dashboard.html') await browser.until('typeof switchTab==="function" && typeof RHUI!=="undefined"');
}
async function reload(browser, page = 'dashboard.html') {
  await browser.send('Page.navigate', { url: fixture.origin + '/' + page });
  await browser.until(`location.pathname.endsWith(${JSON.stringify(page)}) && !!window.RHCentralData && RHCentralData.status().loaded && typeof RH_SESSION!=="undefined" && !!RH_SESSION`);
  if (page === 'dashboard.html') await browser.until('typeof switchTab==="function" && typeof RHUI!=="undefined"');
}
const sql = async (text, args = []) => (await fixture.db.query(text, args)).rows;

try {
  const a = await chrome(); browsers.push(a);
  const b = await chrome(); browsers.push(b);
  assert.notEqual(a.profile, b.profile);
  // Each machine already has its own legacy browser data from the localStorage era.
  for (const browser of browsers) await rawStore(browser, `localStorage.setItem('residenthub_live_buildings',${JSON.stringify(legacyBuildings)})`);

  // 1. Same account, same identity/permissions on both machines.
  await login(a); await login(b);
  const signature = 'JSON.stringify({user:RH.getSession(),type:RHP.typeOfUser(RH.getSession()),create:RHP.can("buildings.create")})';
  assert.equal(await a.evaluate(signature), await b.evaluate(signature));
  for (const browser of browsers) {
    assert.equal(await browser.evaluate('RH.inspectAuthEnvironment().businessData'), 'central');
    // The legacy browser store is hidden from the app but left untouched.
    assert.equal(await browser.evaluate('RHD.list("buildings").some(b=>b.id==="keep-local-building")'), false);
  }
  // First Admin load stored the system templates once on the server, not per machine.
  const templateCount = (await sql('select count(*)::int n from public.rh_templates'))[0].n;
  assert.ok(templateCount > 0);
  assert.equal(await b.evaluate('RHT.list ? RHT.list().length : JSON.parse(localStorage.getItem("residenthub_live_templates")).length'), templateCount);

  // 2. Machine A creates a building through the real form handler; B reads it after reload.
  await a.evaluate(`switchTab("buildings");RHUI.openBuildingForm();document.getElementById('bfName').value='Tòa Đồng Bộ';document.getElementById('bfShort').value='SYNC';document.getElementById('bfProvince').value='Hà Nội';document.getElementById('bfWard').value='Cầu Giấy';document.getElementById('bfAddress').value='1 Đường Test';RHUI.submitBuildingForm({preventDefault(){}})`);
  await a.until('RHD.list("buildings").some(b=>b.name==="Tòa Đồng Bộ")');
  assert.equal((await sql(`select count(*)::int n from public.rh_buildings where payload->>'name'='Tòa Đồng Bộ'`))[0].n, 1, 'committed to the database');
  const buildingId = await a.evaluate('RHD.list("buildings").find(b=>b.name==="Tòa Đồng Bộ").id');
  await reload(b);
  assert.equal(await b.evaluate(`RHD.get("buildings",${JSON.stringify(buildingId)}).name`), 'Tòa Đồng Bộ');
  await b.evaluate('switchTab("buildings")');
  await b.until('document.getElementById("buildings-tab").textContent.includes("Tòa Đồng Bộ")');

  // 3. A creates then edits an apartment via the form; B sees the new values.
  await a.evaluate(`switchTab("apartments");RHUI.openApartmentForm();document.getElementById('afBuilding').value=${JSON.stringify(buildingId)};document.getElementById('afBuilding').dispatchEvent(new Event('change'));document.getElementById('afFloor').value='2';document.getElementById('afName').value='P201';document.getElementById('afRent').value='3500000';document.getElementById('afDeposit').value='3500000';document.getElementById('afArea').value='30';document.getElementById('afMaxGuests').value='2';RHUI.submitApartmentForm({preventDefault(){}})`);
  await a.until('RHD.list("apartments").some(x=>x.name==="P201")');
  const apartmentId = await a.evaluate('RHD.list("apartments").find(x=>x.name==="P201").id');
  await reload(b);
  assert.equal(await b.evaluate(`RHD.get("apartments",${JSON.stringify(apartmentId)}).rentPrice`), 3500000);
  await a.evaluate(`RHUI.openApartmentForm(${JSON.stringify(apartmentId)});document.getElementById('afRent').value='4200000';RHUI.submitApartmentForm({preventDefault(){}})`);
  await a.until(`RHD.get("apartments",${JSON.stringify(apartmentId)}).rentPrice===4200000`);
  await reload(b);
  assert.equal(await b.evaluate(`RHD.get("apartments",${JSON.stringify(apartmentId)}).rentPrice`), 4200000);

  // 3b. B still holds a stale snapshot if it edits without reloading: server rejects, no overwrite.
  await a.evaluate(`RHD.update("apartments",${JSON.stringify(apartmentId)},{rentPrice:4300000})`);
  const stale = await b.evaluate(`RHD.update("apartments",${JSON.stringify(apartmentId)},{rentPrice:1})`);
  assert.equal(stale.ok, false); assert.equal(stale.conflict, true);
  assert.equal((await sql(`select (payload->>'rentPrice')::int r from public.rh_apartments where id=$1`, [apartmentId]))[0].r, 4300000);
  await b.until(`RHD.get("apartments",${JSON.stringify(apartmentId)}).rentPrice===4300000`); // auto-reloaded after conflict

  // 3c. Cross-module consistency: customer + contract + invoice created on A, all linked on B.
  const linked = await a.evaluate(`(()=>{const c=RHD.create("customers",{fullName:"Khách Đồng Bộ",phone:"0900000000"});
    const k=RHD.create("contracts",{code:"HD-SYNC",buildingId:${JSON.stringify(buildingId)},apartmentId:${JSON.stringify(apartmentId)},customerId:c.item.id,tenantIds:[c.item.id],startDate:"2026-11-01",endDate:"2027-10-31",status:"active",rentPrice:4300000});
    const i=RHD.create("invoices",{code:"HD-SYNC-1",contractId:k.item.id,buildingId:${JSON.stringify(buildingId)},apartmentId:${JSON.stringify(apartmentId)},customerId:c.item.id,period:"2026-11",total:4300000,status:"draft"});
    return {ok:c.ok&&k.ok&&i.ok,customer:c.item.id,contract:k.item.id,invoice:i.item.id};})()`);
  assert.equal(linked.ok, true);
  await reload(b);
  assert.equal(await b.evaluate(`RHD.residentPlacement(${JSON.stringify(linked.customer)}).apartment.id`), apartmentId);
  assert.equal(await b.evaluate(`RHD.get("invoices",${JSON.stringify(linked.invoice)}).contractId`), linked.contract);
  // Deleting a building that still has apartments is refused by the database.
  const blocked = await b.evaluate(`RHD.remove("buildings",${JSON.stringify(buildingId)})`);
  assert.equal(blocked.ok, false);
  assert.equal((await sql('select count(*)::int n from public.rh_buildings where id=$1', [buildingId]))[0].n, 1);

  // 4. Permission change applies on both machines after refresh; UI and DB agree.
  await fixture.operator('rh_identity_save_type', { p_id: 'at-building-manager', p_data: { name: 'Quản lý tòa nhà', portal: 'manager', permissions: ['dashboard.view', 'buildings.view', 'apartments.view', 'apartments.update'] } });
  await fixture.operator('rh_identity_update_member', { p_id: 'u-manager-1', p_patch: { accountTypeId: 'at-building-manager', allBuildings: false, buildingIds: [buildingId] } });
  for (const browser of browsers) {
    await reload(browser);
    assert.equal(await browser.evaluate('RHP.can("buildings.create")'), false);
    assert.equal(await browser.evaluate('RHD.list("buildings").map(b=>b.id).join()'), buildingId); // scope from DB
  }
  // UI guard path: the form refuses; the record count does not change.
  const before = await a.evaluate('RHD.list("buildings").length');
  await a.evaluate('window.alert=()=>{};RHUI.openBuildingForm();');
  assert.equal(await a.evaluate('RHD.list("buildings").length'), before);
  // 6. Bypassing the UI: direct API + forged local grants are still rejected by the server.
  await a.evaluate(`localStorage.setItem('residenthub_account_types',JSON.stringify([{id:'at-building-manager',portal:'manager',fullAccess:true}]));window.RH_SESSION={id:'demo',demo:true}`);
  const forged = await a.evaluate(`RHD.create("buildings",{name:"Vượt quyền",managerId:"u-manager-1"})`);
  assert.equal(forged.ok, false);
  const raw = await a.evaluate(`(()=>{try{RHCentral.dataRpcSync("rh_data_apply",{p_entity:"buildings",p_changes:[{op:"upsert",id:"b-raw",version:0,payload:{id:"b-raw",name:"Raw"}}]});return "accepted";}catch(e){return e.status+":"+e.code;}})()`);
  assert.equal(raw, '403:42501');
  assert.equal((await sql(`select count(*)::int n from public.rh_buildings where payload->>'name' in ('Vượt quyền','Raw')`))[0].n, 0);
  // Allowed operation still works for the reduced role (apartments.update in scope).
  assert.equal((await b.evaluate(`RHD.update("apartments",${JSON.stringify(apartmentId)},{note:"đổi bởi quản lý"})`)).ok, true);

  // 5. Lock: protected operations fail on BOTH machines immediately, before any refresh.
  await fixture.operator('rh_identity_update_member', { p_id: 'u-manager-1', p_patch: { status: 'locked' } });
  for (const browser of browsers) {
    const result = await browser.evaluate(`RHD.update("apartments",${JSON.stringify(apartmentId)},{note:"sau khi khóa"})`);
    assert.equal(result.ok, false);
  }
  assert.equal((await sql(`select payload->>'note' n from public.rh_apartments where id=$1`, [apartmentId]))[0].n, 'đổi bởi quản lý');
  for (const browser of browsers) { await browser.evaluate('RH.refreshIdentity()'); await browser.until('location.pathname.endsWith("index.html")'); }

  // 8. Unlock + restore Admin, log in again: nothing was lost; legacy local data untouched.
  await fixture.operator('rh_identity_update_member', { p_id: 'u-manager-1', p_patch: { status: 'active', accountTypeId: 'at-admin', allBuildings: true } });
  await login(a); await login(b);
  for (const browser of browsers) {
    assert.equal(await browser.evaluate(`RHD.get("apartments",${JSON.stringify(apartmentId)}).note`), 'đổi bởi quản lý');
    assert.equal(await browser.evaluate(`!!RHD.get("contracts",${JSON.stringify(linked.contract)})`), true);
    await browser.evaluate('RH.logout()');
    await browser.until('location.pathname.endsWith("index.html") && typeof RH!=="undefined"');
    assert.equal(await rawStore(browser, 'localStorage.getItem("residenthub_live_buildings")'), legacyBuildings);
  }

  // 7. Other portals keep working against the shared data (staff + resident pages load).
  await sql(`update public.rh_memberships set resident_id=$1, profile=profile||jsonb_build_object('apartmentId',$2::text) where id='resident'`, [linked.customer, apartmentId]);
  await login(a, { email: 'resident@example.invalid', password: 'fixture-resident-only', page: 'resident-web.html' });
  assert.equal(await a.evaluate('RHD.list("contracts").map(c=>c.code).join()'), 'HD-SYNC');
  assert.equal(await a.evaluate('RHD.list("buildings").length'), 1);
  assert.equal(await a.evaluate('RHD.list("invoices").length'), 0, 'draft invoices are not visible to residents');
  await login(b, { email: 'staff@example.invalid', password: 'fixture-staff-only', page: 'staff.html' });
  assert.equal(await b.evaluate('RHD.list("contracts").length'), 0);
  for (const browser of browsers) assert.deepEqual(browser.errors, []);
  console.log('PASS two independent Chrome profiles + REAL PostgreSQL business-data RPC: same login/roles, building/apartment/contract/invoice sync through the existing UI, stale-write conflict, FK protection, DB-enforced scope/permission changes, UI/API bypass rejected, lock on both machines, no data loss on logout/login, staff/resident portals load. Hosted Supabase/VPS NOT tested.');
} finally { for (const browser of browsers) browser.close(); await fixture.close(); }
