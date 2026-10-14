import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const store = new Map();
const sandbox = { console, Date, localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) } };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['data.js', 'billing.js']) vm.runInContext(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), sandbox);
const { RHD, RHB } = sandbox;
const put = (entity, rows) => store.set('residenthub_live_' + entity, JSON.stringify(rows));
const services = [
    { id: 'electric', name: 'Tiền điện', feeType: 'electricity', calcMethod: 'meter', unitPrice: 3500, taxRate: 0 },
    { id: 'water', name: 'Tiền nước', feeType: 'water', calcMethod: 'meter', unitPrice: 25000, taxRate: 0 },
    { id: 'wifi', name: 'Wifi', feeType: 'internet', calcMethod: 'fixed', unitPrice: 100000 }
];
const contract = { id: 'c1', apartmentId: 'a1', buildingId: 'b1', customerId: 'u1', status: 'active', startDate: '2026-01-01', endDate: '2026-12-31', rentPrice: 2000000, paymentCycle: 'monthly', serviceIds: services.map(s => s.id) };
put('buildings', [{ id: 'b1', services, meterPeriod: 'previous', autoInvoice: true, autoInvoiceFrom: '2026-10', billingDay: 5 }]);
put('contracts', [contract]);
const reading = (type, period = '2026-10', approved = true, previous = 100, latest = 120) => ({ id: type + period, apartmentId: 'a1', buildingId: 'b1', meterType: type, periodMonth: period, readingPeriod: period, closingDate: '2026-11-02', recordedAt: Date.parse('2026-11-02'), previousIndex: previous, latestIndex: latest, consumption: 9999, approvalStatus: approved ? 'đã_duyệt' : 'chưa_duyệt' });
const calc = () => RHB.computeMonthly(contract, '2026-10');
const charge = (c, id) => c.items.find(i => i.serviceId === id) || { amount: 0, qty: 0 };
// 1: September cannot supply October, despite the legacy building configuration.
put('meters', [reading('electricity', '2026-09'), reading('water', '2026-09')]);
assert.equal(charge(calc(), 'electric').amount, 0);
assert.equal(charge(calc(), 'water').amount, 0);
assert.equal(calc().issues.length, 2);
assert.equal(calc().items.some(i => i.kind === 'meter'), false);
// 2: Electricity and water are independent.
put('meters', [reading('electricity')]);
assert.equal(charge(calc(), 'electric').amount, 70000);
assert.equal(charge(calc(), 'water').amount, 0);
// 3: Closing without approval is not billable.
put('meters', [reading('electricity', '2026-10', false)]);
assert.equal(charge(calc(), 'electric').amount, 0);
assert.match(calc().issues[0], /chưa được duyệt/);
// 4 + 5: Index difference, not stale consumption; Nov 2 closing stays in October.
put('meters', [reading('electricity'), reading('water', '2026-10', true, 10, 15)]);
assert.equal(charge(calc(), 'electric').qty, 20);
assert.equal(charge(calc(), 'water').amount, 125000);
assert.equal(calc().issues.length, 0);
assert.equal(charge(calc(), 'electric').consumptionPeriod, '2026-10');
assert.equal(calc().total, 2295000);
// Valid zero; no utility requirement for an unselected service.
put('meters', [reading('electricity', '2026-10', true, 100, 100), reading('water', '2026-10', true, 10, 10)]);
assert.equal(calc().issues.length, 0);
assert.equal(charge(calc(), 'electric').amount, 0);
assert.equal(RHB.computeMonthly({ ...contract, serviceIds: ['wifi'] }, '2026-10').issues.length, 0);
// Generator creates an incomplete draft once, never invents quantities.
put('meters', []);
put('invoices', []); put('billingRuns', []);
const generated = RHB.run({ today: '2026-10-05' });
assert.equal(generated.created.length, 1);
assert.equal(generated.created[0].issues.length, 2);
assert.equal(charge(generated.created[0], 'electric').amount, 0);
assert.equal(RHB.run({ today: '2026-10-06' }).created.length, 0);
assert.equal(RHB.approve(generated.created[0].id, 'test').ok, false);
// 6: September edit does not affect October draft or fill its missing data.
const draftId = generated.created[0].id;
const beforeSeptember = JSON.stringify(RHD.get('invoices', draftId));
const september = RHD.create('meters', reading('electricity', '2026-09')).item;
RHD.update('meters', september.id, { latestIndex: 130 });
assert.equal(JSON.stringify(RHD.get('invoices', draftId)), beforeSeptember);
// Matching-period readings mark draft stale, then explicit recalculation refreshes it.
RHD.create('meters', reading('electricity'));
RHD.create('meters', reading('water', '2026-10', true, 10, 15));
assert.equal(RHD.get('invoices', draftId).needsRecalculation, true);
assert.equal(RHB.recalculate(draftId, 'test').ok, true);
assert.equal(RHD.get('invoices', draftId).issues.length, 0);
// Edits require confirmation and retain explicit manual provenance.
const edited = RHD.get('invoices', draftId);
edited.items[0].unitPrice = 2100000;
edited.items.find(i => i.serviceId === 'electric').qty = 25;
const normalized = RHB.normalizeLines(edited.items);
assert.equal(normalized.items[0].source, 'manual');
RHD.update('invoices', draftId, { items: normalized.items });
const beforeRecalc = JSON.stringify(RHD.get('invoices', draftId));
assert.equal(RHB.recalculate(draftId, 'test').requiresConfirmation, true);
assert.equal(JSON.stringify(RHD.get('invoices', draftId)), beforeRecalc);
assert.equal(RHB.recalculate(draftId, 'test', true).ok, true);
assert.equal(RHD.get('invoices', draftId).items[0].unitPrice, 2100000);
assert.equal(charge(RHD.get('invoices', draftId), 'electric').qty, 20);
// Approval/issue revalidate latest readings, even when saved issues are empty.
assert.equal(RHB.approve(draftId, 'test').ok, true);
RHD.update('meters', 'electricity2026-10', { approvalStatus: 'chưa_duyệt' });
assert.equal(RHB.issue(draftId, 'test').ok, false);
RHD.update('meters', 'electricity2026-10', { approvalStatus: 'đã_duyệt' });
assert.equal(RHB.issue(draftId, 'test').ok, true);
// 7: Paid/issued invoices are byte-for-byte unchanged by edits and recalculation.
RHD.update('invoices', draftId, { status: 'paid' });
const paidBefore = JSON.stringify(RHD.get('invoices', draftId));
RHD.update('meters', 'electricity2026-10', { latestIndex: 140 });
assert.equal(RHB.recalculate(draftId, 'test', true).ok, false);
assert.equal(JSON.stringify(RHD.get('invoices', draftId)), paidBefore);
// Audit reports errors without writing any data.
const storeBeforeAudit = JSON.stringify([...store]);
assert.equal(RHB.auditInvoices().some(i => i.id === draftId && i.issued), true);
assert.equal(JSON.stringify([...store]), storeBeforeAudit);
// Manual non-monthly invoices remain independent from meter data.
RHD.create('invoices', { id: 'manual', type: 'incidental', period: '2026-10', status: 'draft', items: [{ label: 'Sửa khóa', qty: 1, unitPrice: 150000 }], issues: [] });
assert.equal(RHB.approve('manual', 'test').ok, true);
assert.equal(RHB.issue('manual', 'test').ok, true);
assert.equal(RHD.calcServiceAmount(services[0], { meterReading: reading('electricity', '2026-09'), readingPeriod: '2026-10' }).amount, 0);
// Explicit readingPeriod takes precedence over legacy periodMonth and timestamps.
put('meters', [{ ...reading('electricity'), periodMonth: '2026-11' }, reading('water', '2026-10', true, 10, 15)]);
assert.equal(charge(calc(), 'electric').amount, 70000);
// A newer unapproved reading cannot fall back to an older approved reading.
RHD.create('meters', { ...reading('electricity', '2026-10', false), id: 'new-unapproved', recordedAt: '2026-11-03' });
assert.equal(charge(calc(), 'electric').amount, 0);
assert.match(calc().issues[0], /chưa được duyệt/);
// Typing an amount into a missing-data monthly line does not remove the guard.
const missing = [{ serviceId: 'electric', label: 'Điện thiếu chỉ số', qty: 20, unitPrice: 3500, missing: true, kind: 'meter' }];
const typed = RHB.normalizeLines(missing);
assert.equal(typed.items.find(i => i.serviceId === 'electric').missing, true);
assert.ok(typed.issues.length);
// Regression: default fixed electricity/water must not become qty=1 charges.
const defaultServices = services.map(s => s.id === 'wifi' ? s : { ...s, calcMethod: 'fixed', unitPrice: s.id === 'electric' ? 4000 : 30000 });
put('buildings', [{ id: 'b1', services: defaultServices, autoInvoice: true, autoInvoiceFrom: '2026-10', billingDay: 5 }]);
put('meters', []);
assert.equal(calc().items.some(i => i.serviceId === 'electric' || i.serviceId === 'water'), false);
assert.equal(calc().total, 2100000);
assert.equal(calc().issues.length, 2);
assert.equal(RHB.prefill('monthly', contract, '2026-10').total, 2100000);
assert.equal(RHD.calcServiceAmount(defaultServices[0], {}).amount, 0);
put('meters', [reading('electricity'), reading('water', '2026-10', true, 10, 10)]);
assert.equal(charge(calc(), 'electric').amount, 80000);
assert.equal(charge(calc(), 'water').amount, 0);
assert.equal(calc().issues.length, 0);
// Explicit flat packages are billed separately and do not require readings.
put('buildings', [{ id: 'b1', services: defaultServices.map(s => s.id === 'electric' ? { ...s, name: 'Điện trọn gói', unitPrice: 150000 } : s) }]);
put('meters', []);
assert.equal(charge(calc(), 'electric').amount, 150000);
assert.equal(calc().issues.length, 1);
// Legacy drafts with wrong qty=1 are repairable; rent, wifi and custom fees stay intact.
put('buildings', [{ id: 'b1', services: defaultServices }]);
RHD.create('invoices', { id: 'bad-october', type: 'monthly', contractId: contract.id, apartmentId: 'a1', period: '2026-10', status: 'draft', items: [
    { serviceId: 'rent', qty: 1, unitPrice: 2200000, amount: 2200000, label: 'Thuê chỉnh tay', source: 'manual' },
    { serviceId: 'wifi', qty: 1, unitPrice: 120000, amount: 120000, label: 'Wifi chỉnh tay', source: 'manual' },
    { serviceId: 'electric', qty: 1, unitPrice: 4000, amount: 4000, label: 'Điện' },
    { serviceId: 'water', qty: 1, unitPrice: 30000, amount: 30000, label: 'Nước' },
    { serviceId: 'custom', qty: 1, unitPrice: 50000, amount: 50000, label: 'Sửa khóa', source: 'manual' }
] });
assert.equal(RHB.recalculate('bad-october', 'test').requiresConfirmation, true);
assert.equal(RHB.recalculate('bad-october', 'test', true).ok, true);
const repaired = RHD.get('invoices', 'bad-october');
assert.equal(repaired.items.length, 3);
assert.equal(repaired.total, 2370000);
assert.equal(repaired.issues.length, 2);
// Other manual invoice types still prefill and normalize independently.
for (const type of ['deposit', 'deposit_refund', 'incidental', 'liquidation', 'renewal', 'adjustment']) {
    const manual = RHB.prefill(type, { ...contract, depositPrice: 2000000 }, '2026-10');
    assert.equal(manual.issues.length, 0);
    assert.equal(RHB.normalizeLines(manual.items).issues.length, 0);
}
console.log('Passed: all 7 requested cases, zero usage, non-applicable utilities, automatic drafts, duplicate prevention, manual confirmation, read-only audit and manual invoices.');
