import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const compile = source => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64');
const domainUrl = compile(readFileSync(new URL('./domain.ts', import.meta.url), 'utf8'));
const domain = await import(domainUrl);
const storage = new Map();
globalThis.window = { setTimeout, RHD: undefined };
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const service = await import(compile(readFileSync(new URL('./invoiceService.ts', import.meta.url), 'utf8').replace("from './domain'", `from '${domainUrl}'`)));
const room = service.rooms()[0];
const draft = service.draft(room, '2026-09');
assert.equal(draft.tongTien, 2345000);
assert.equal(draft.chiTietThu.dien.thanhTien, 70000);
assert.equal(draft.chiTietThu.nuoc.thanhTien, 125000);
assert.equal(draft.hanThanhToan, '2026-10-05');
assert.equal(service.draft(room, '2026-12').hanThanhToan, '2027-01-05');
const issued = domain.issue(draft);
assert.equal(domain.overdue(issued, '2026-10-05'), false);
assert.equal(domain.overdue(issued, '2026-10-06'), true);
const partial = domain.collect(issued, 1000000);
assert.equal(partial.conNo, 1345000);
assert.equal(partial.status, 'phat_hanh');
assert.throws(() => domain.cancel(partial));
const paid = domain.collect(partial, partial.conNo);
assert.equal(paid.status, 'da_thu_du');
assert.equal(paid.conNo, 0);
assert.throws(() => domain.collect(paid, 1));
assert.throws(() => domain.collect(issued, issued.conNo + 1));
assert.throws(() => domain.issue(issued));
assert.throws(() => domain.issue({ ...draft, missingReadings: ['Điện'] }));
assert.equal(domain.cancel(issued).status, 'huy');
service.save([partial]);
assert.deepEqual(service.load(), [partial]);
window.RHD = { list: entity => entity === 'contracts' ? [{ apartmentId: room.id, startDate: '2026-01-01', endDate: '2026-12-31', rentPrice: 2000000, serviceIds: ['electricity', 'water'] }] : entity === 'buildings' ? [{ id: room.buildingId, services: ['electricity', 'water'].map(feeType => ({ id: feeType, feeType, calcMethod: 'meter', unitPrice: feeType === 'water' ? 25000 : 3500 })) }] : entity === 'meters' ? [
    { apartmentId: room.id, meterType: 'electricity', periodMonth: '2026-09', previousIndex: 80, latestIndex: 100, consumption: 20, recordedAt: 1, approvalStatus: 'đã_duyệt' },
    { apartmentId: room.id, meterType: 'electricity', periodMonth: '2026-09', previousIndex: 80, latestIndex: 110, consumption: 9999, recordedAt: 2, approvalStatus: 'đã_duyệt' },
    { apartmentId: room.id, meterType: 'water', periodMonth: '2026-08', latestIndex: 10, consumption: 5 }
] : [], mode: () => 'demo' };
const connected = service.draft(room, '2026-09');
assert.equal(connected.chiTietThu.dien.soLuong, 30);
assert.match(connected.missingReadings[0], /Nước kỳ 09\/2026/);
assert.throws(() => domain.issue(connected));
assert.equal(service.load().length, 0); // No fabricated readings/invoices with real shared data.
// Default fixed utility services still require readings in the adapter.
const list = window.RHD.list;
window.RHD.list = entity => entity === 'buildings' ? list(entity).map(b => ({ ...b, services: b.services.map(s => ({ ...s, calcMethod: 'fixed' })) })) : list(entity);
assert.equal(service.draft(room, '2026-09').chiTietThu.dien.soLuong, 30);
assert.equal(service.draft(room, '2026-10').chiTietThu.dien.thanhTien, 0);
assert.equal(service.draft(room, '2026-10').chiTietThu.phiDichVu, 0);
// When connected, the adapter uses the same meter selector as the billing engine.
let requested;
window.RHB = { approvedReading: (...args) => { requested = args; return { reading: null, state: 'missing' }; } };
assert.equal(service.draft(room, '2026-09').chiTietThu.dien.thanhTien, 0);
assert.deepEqual(requested, [room.id, 'water', '2026-09']);
delete window.RHB;
console.log('Passed: totals, due dates, lifecycle, partial/full payments, persistence, latest reading and missing-period guards.');
