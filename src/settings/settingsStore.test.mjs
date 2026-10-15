import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(readFileSync(new URL('./settingsStore.ts', import.meta.url), 'utf8'));
const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const storage = new Map([['residenthub_live_invoices', 'untouched'], ['residenthub_live_meters', 'untouched']]);
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const manager = { id: 'test-manager', name: 'Nguyễn An', role: 'manager' };
const staff = { ...manager, role: 'staff' };
const financial = { bank: 'Vietcombank', accountNumber: '001234567890', accountHolder: 'NGUYỄN AN', branch: '', transfer: true, cash: true, pos: false };
assert.equal(api.canEditFinancial('manager'), true);
assert.equal(api.canEditFinancial('chief_accountant'), true);
assert.equal(api.canEditFinancial('staff'), false);
assert.throws(() => api.saveSection(staff, 'financial', financial), /không có quyền/);
assert.equal(storage.has(api.storageKey(manager.id)), false);
assert.ok(api.validateFinancial({ ...financial, accountNumber: 'invalid' }));
assert.ok(api.validateFinancial({ ...financial, transfer: false, cash: false, pos: false }));
let saved = api.saveSection(manager, 'financial', financial);
assert.equal(saved.financial.accountNumber, '001234567890');
assert.equal(saved.activity.length, 1);
assert.equal(saved.activity[0].detail.includes(financial.accountNumber), false);
const notifications = api.defaultSettings().notifications;
notifications[0].template = 'Xin chào {Ten_Khach_Hang}';
notifications[0].email = false;
saved = api.saveSection(manager, 'notifications', notifications);
assert.deepEqual(saved.financial, financial);
assert.equal(saved.activity.length, 2);
assert.equal(api.loadSettings(manager.id).notifications[0].email, false);
assert.throws(() => api.saveSection(manager, 'notifications', [{ ...notifications[0], template: ' ' }]), /để trống/);
assert.deepEqual(api.loadSettings('another-user'), api.defaultSettings());
const logs = [
    { id: '1', at: '2026-10-13T17:01:00Z', actorName: 'Nguyễn An', module: 'Cài đặt' },
    { id: '2', at: '2026-10-14T16:59:00Z', actorName: 'Nguyễn An', module: 'Cài đặt' },
    { id: '3', at: '2026-10-14T17:00:00Z', actorName: 'Trần Hà', module: 'Hợp đồng' }
];
assert.equal(api.bangkokDate(logs[0].at), '2026-10-14');
assert.deepEqual(api.filterActivity(logs, ' NGUYỄN ', '2026-10-14', '2026-10-14', 'Cài đặt').map(row => row.id), ['2', '1']);
assert.equal(storage.get('residenthub_live_invoices'), 'untouched');
assert.equal(storage.get('residenthub_live_meters'), 'untouched');
storage.set(api.storageKey(manager.id), '{broken');
assert.throws(() => api.loadSettings(manager.id));
assert.throws(() => api.saveSection(manager, 'financial', financial));
assert.equal(storage.get(api.storageKey(manager.id)), '{broken');
console.log('Passed settings: role guards, validation, account leading zero, isolated persistence, section preservation, audit, inclusive Bangkok date filters, corrupt data protection.');
