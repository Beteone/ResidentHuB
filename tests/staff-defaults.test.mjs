import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync('permissions.js', 'utf8');
const key = 'residenthub_account_types';
const baseline = ['dashboard.view', 'staffTasks.view', 'staffTasks.accept', 'staffTasks.update', 'staffTasks.report', 'staffIncome.view', 'support.create'];
function environment(types) {
    const store = new Map(types ? [[key, JSON.stringify(types)]] : []);
    const context = { console, localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
    context.window = context;
    vm.createContext(context);
    const reload = () => vm.runInContext(source, context);
    reload();
    return { context, store, reload, types: () => JSON.parse(store.get(key)) };
}
const fresh = environment();
assert.deepEqual(fresh.types().find(t => t.id === 'at-staff').permissions, baseline);
const original = fresh.store.get(key);
fresh.reload(); fresh.reload();
assert.equal(fresh.store.get(key), original, 'Repeated startup makes no writes or duplicates');
assert.equal(fresh.types().filter(t => t.name === 'Nhân viên').length, 1);
assert.deepEqual(Array.from(fresh.context.RHP.undeclaredPermissions(baseline)), []);
for (const staffGroup of ['technical', 'cleaning', 'security']) {
    const user = { id: staffGroup, role: 'manager', accountTypeId: 'at-staff', staffGroup };
    for (const permission of baseline) assert.equal(fresh.context.RHP.can(permission, user), true);
    for (const permission of ['users.update', 'roles.update', 'customers.update', 'buildings.update', 'support.view', 'support.update', 'settings.update']) assert.equal(fresh.context.RHP.can(permission, user), false);
}
const legacy = { id: 'at-staff', name: 'Nhân viên', portal: 'manager', createdAt: 123,
    description: 'Nhân viên vận hành: ghi chỉ số, tài sản, xử lý yêu cầu.',
    permissions: ['dashboard.view', 'buildings.view', 'apartments.view', 'assets.view', 'assets.create', 'assets.update', 'assetTypes.view', 'assetTypes.create', 'customers.view', 'customers.create', 'customers.update', 'meters.view', 'meters.create', 'meters.update', 'contracts.view', 'invoices.view', 'support.view', 'support.update'] };
const unrelated = { id: 'custom', name: 'Custom', portal: 'manager', permissions: ['support.update', 'retired.permission'], extra: { keep: true } };
const migrated = environment([legacy, unrelated]);
assert.deepEqual(migrated.types().find(t => t.id === 'at-staff').permissions, legacy.permissions, 'Startup preserves historical staff permissions instead of guessing intent');
assert.equal(migrated.types().find(t => t.id === 'at-staff').createdAt, 123);
assert.deepEqual(migrated.types().find(t => t.id === 'custom'), unrelated);
const migratedRaw = migrated.store.get(key);
migrated.reload(); assert.equal(migrated.store.get(key), migratedRaw);
for (const custom of [{ ...legacy, updatedAt: 456 }, { ...legacy, permissions: ['dashboard.view'] }, { ...legacy, name: 'Renamed staff' }]) {
    assert.deepEqual(environment([custom]).types().find(t => t.id === 'at-staff'), custom, 'Previously customized roles stay untouched');
}
const revoked = fresh.types();
revoked.find(t => t.id === 'at-staff').permissions = ['dashboard.view'];
fresh.store.set(key, JSON.stringify(revoked)); fresh.reload();
assert.deepEqual(fresh.types().find(t => t.id === 'at-staff').permissions, ['dashboard.view'], 'Startup cannot undo revocations');
assert.equal(environment([unrelated]).types().filter(t => t.id === 'at-staff').length, 0, 'Existing type stores are not silently extended');
const alias = { ...unrelated, name: 'Nhân viên' };
assert.equal(environment([alias]).types().filter(t => t.name === 'Nhân viên').length, 1, 'Do not duplicate an existing same-name custom role');
console.log('Staff defaults: clean seed, three groups, least privilege, historical grants/revocations, idempotence and custom data preservation passed.');
