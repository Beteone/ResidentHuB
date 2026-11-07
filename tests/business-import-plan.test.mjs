// Pure planner rules for importing legacy browser data (no DB, no browser).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { planImport, executeImport, ORDER, SOURCE_KEYS } from '../tools/migration/business-import-plan.mjs';

function legacySource() {
  // The real demo generator, written under the LIVE keys as an old browser would hold them.
  const store = new Map();
  const c = vm.createContext({ console, Date, Math, JSON, dispatchEvent() {}, CustomEvent: class {},
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) } });
  c.window = c;
  for (const file of ['templates.js', 'data.js']) vm.runInContext(readFileSync(file, 'utf8'), c, { filename: file });
  c.RHD.setMode('demo');
  const source = {};
  for (const [key, value] of store) source[key.replace('residenthub_demo_', 'residenthub_live_')] = value;
  return source;
}
const asServer = source => Object.fromEntries(ORDER.map(entity => [entity, JSON.parse(source[SOURCE_KEYS[entity]] || '[]').map(p => ({ p, v: 1 }))]));
const source = legacySource();
const empty = Object.fromEntries(ORDER.map(entity => [entity, []]));

// Fresh server: everything is planned, parents before children.
let plan = planImport({ source, server: empty, members: ['u-manager-1'] });
assert.equal(plan.ok, true, JSON.stringify(plan.blocking));
assert.ok(plan.totals.insert > 10);
const sent = [];
await executeImport(plan, async (entity, changes) => { sent.push(entity); assert.ok(changes.every(c => c.version === 0 && c.op === 'upsert')); });
const position = entity => sent.indexOf(entity);
assert.ok(position('buildings') < position('apartments') && position('apartments') < position('contracts') && position('contracts') < position('invoices'));
assert.ok(position('customers') < position('contracts') && position('templates') < position('buildings'));

// Re-running after import: identical rows are skipped, nothing is duplicated.
plan = planImport({ source, server: asServer(source), members: [] });
assert.equal(plan.ok, true); assert.equal(plan.totals.insert, 0); assert.equal(plan.totals.identical, plan.totals.source);

// Same id, different content on the server = conflict for the operator; never overwritten.
const server = asServer(source);
server.apartments[0].p = { ...server.apartments[0].p, rentPrice: 1 };
plan = planImport({ source, server, members: [] });
assert.equal(plan.ok, false);
assert.deepEqual(plan.blocking.map(b => b.entity + ':' + b.id), ['apartments:' + server.apartments[0].p.id]);
await assert.rejects(() => executeImport(plan, async () => assert.fail('must not send')));

function mutated(entity, change) {
  const copy = { ...source };
  const rows = JSON.parse(copy[SOURCE_KEYS[entity]]);
  change(rows);
  copy[SOURCE_KEYS[entity]] = JSON.stringify(rows);
  return planImport({ source: copy, server: empty, members: ['u-manager-1'] });
}
const reasonOf = result => { assert.equal(result.ok, false); return result.blocking[0].reason; };
assert.match(reasonOf(mutated('contracts', rows => { rows[0].apartmentId = 'missing'; })), /Liên kết không tồn tại: apartmentId/);
assert.match(reasonOf(mutated('contracts', rows => { rows[0].tenantIds = ['ghost']; })), /tenantIds:ghost/);
assert.match(reasonOf(mutated('customers', rows => { rows[0].password = 'legacy'; })), /mật khẩu/);
assert.match(reasonOf(mutated('apartments', rows => { rows.push({ ...rows[0] }); })), /trùng/);
assert.match(reasonOf(mutated('buildings', rows => { rows[0].managerId = 'unknown-user'; })), /managerId/);
assert.match(reasonOf(mutated('meters', rows => { delete rows[0].buildingId; })), /Thiếu trường bắt buộc/);
assert.match(reasonOf(mutated('apartments', rows => { rows.push({ id: 'apt-x', name: 'X', buildingId: 'b-other' }); })), /buildingId/);
// Apartment belongs to another building than the one written on the meter.
const pair = { ...source };
pair.residenthub_live_buildings = JSON.stringify(JSON.parse(source.residenthub_live_buildings).concat([{ id: 'b-second', name: 'Second' }]));
pair.residenthub_live_apartments = JSON.stringify(JSON.parse(source.residenthub_live_apartments).concat([{ id: 'apt-second', name: 'S1', buildingId: 'b-second' }]));
const meters = JSON.parse(source.residenthub_live_meters); meters[0].apartmentId = 'apt-second';
pair.residenthub_live_meters = JSON.stringify(meters);
assert.match(reasonOf(planImport({ source: pair, server: empty, members: [] })), /không thuộc tòa nhà/);
const broken = { ...source, residenthub_live_invoices: '{not json' };
assert.match(reasonOf(planImport({ source: broken, server: empty, members: [] })), /JSON hỏng/);
console.log('PASS business import planner: dependency order, insert-only, idempotent re-run, conflicts/orphans/credentials/duplicates/required fields block the whole import');
