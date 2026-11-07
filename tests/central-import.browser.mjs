// End-to-end: legacy browser data -> tools/migration/central-import.html -> REAL
// PostgreSQL (fixture Auth). Proves dry-run first, insert-only import, idempotent
// re-run, and that the legacy localStorage copy is left untouched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { chrome } from './helpers/chrome.mjs';
import { centralFixture } from './helpers/central-fixture.mjs';

function legacySource() {
  const store = new Map();
  const c = vm.createContext({ console, Date, Math, JSON, dispatchEvent() {}, CustomEvent: class {},
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) } });
  c.window = c;
  for (const file of ['templates.js', 'data.js']) vm.runInContext(readFileSync(file, 'utf8'), c, { filename: file });
  c.RHD.setMode('demo');
  return Object.fromEntries([...store].map(([key, value]) => [key.replace('residenthub_demo_', 'residenthub_live_'), value]));
}
const fixture = await centralFixture({ dataAccess: true });
const browser = await chrome();
const sql = async (text, args = []) => (await fixture.db.query(text, args)).rows;
try {
  const source = legacySource();
  await browser.send('Page.navigate', { url: fixture.origin + '/theme.css' });
  await browser.until('document.readyState==="complete"');
  await browser.evaluate(`Object.entries(${JSON.stringify(source)}).forEach(([k,v])=>localStorage.setItem(k,v))`);
  // Every legacy business key (the central adapter only adds its own cross-tab signal key).
  const snapshot = 'JSON.stringify(Object.keys(localStorage).filter(k=>k.startsWith("residenthub_live_")).sort().map(k=>[k,localStorage.getItem(k)]))';
  const before = await browser.evaluate(snapshot);

  await browser.send('Page.navigate', { url: fixture.origin + '/index.html' });
  await browser.until('typeof handleLogin==="function"');
  await browser.evaluate(`showLoginModal();document.getElementById('loginEmail').value='manager@example.invalid';document.getElementById('loginPassword').value='fixture-only-password';handleLogin({preventDefault(){}});`);
  await browser.until('location.pathname.endsWith("dashboard.html") && !!window.RHCentralData && RHCentralData.status().loaded');
  assert.equal(await browser.evaluate('RHD.list("contracts").length'), 0, 'server starts without the legacy data');

  await browser.send('Page.navigate', { url: fixture.origin + '/tools/migration/central-import.html' });
  await browser.until('!document.getElementById("analyze").disabled');
  await browser.evaluate('document.getElementById("analyze").click()');
  await browser.until('document.getElementById("log").textContent.includes("Kế hoạch hợp lệ")');
  assert.equal((await sql('select count(*)::int n from public.rh_contracts'))[0].n, 0, 'dry-run wrote nothing');
  assert.equal(await browser.evaluate('document.getElementById("import").disabled'), true, 'needs explicit confirmation');
  await browser.evaluate('document.getElementById("confirm").click();document.getElementById("import").click()');
  await browser.until('document.getElementById("log").textContent.includes("Đã nhập")', 30000);
  assert.match(await browser.evaluate('document.getElementById("log").textContent'), /toàn bộ dữ liệu trình duyệt đã có trên máy chủ/);
  for (const [table, key] of [['rh_buildings', 'buildings'], ['rh_apartments', 'apartments'], ['rh_customers', 'customers'], ['rh_contracts', 'contracts'], ['rh_meters', 'meters'], ['rh_invoices', 'invoices'], ['rh_support_requests', 'supportRequests']]) {
    assert.equal((await sql(`select count(*)::int n from public.${table}`))[0].n, JSON.parse(source['residenthub_live_' + key]).length, table);
  }
  assert.equal((await sql('select count(*)::int n from public.rh_contract_tenants'))[0].n, 1);
  // Running it again plans nothing (no duplicates).
  await browser.evaluate('document.getElementById("analyze").click()');
  await browser.until('document.getElementById("log").textContent.includes("đã có đầy đủ")');
  // The legacy copy in this browser is byte-for-byte unchanged.
  assert.equal(await browser.evaluate(snapshot), before);
  // The application now reads the imported data from the server.
  await browser.send('Page.navigate', { url: fixture.origin + '/dashboard.html' });
  await browser.until('!!window.RHCentralData && RHCentralData.status().loaded && typeof RHD!=="undefined"');
  assert.equal(await browser.evaluate('RHD.list("contracts").length'), 1);
  assert.deepEqual(browser.errors, []);
  console.log('PASS legacy browser data import page: dry-run writes nothing, explicit confirmation, insert-only import in FK order, idempotent re-run, legacy localStorage untouched, app reads imported data');
} finally { browser.close(); await fixture.close(); }
