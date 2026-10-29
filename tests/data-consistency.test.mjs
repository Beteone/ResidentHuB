import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const local = new Map();
local.set('residenthub_users', JSON.stringify([{ id: 'consistency-admin', email: 'consistency@example.test', name: 'Fixture administrator', password: 'fixture-only-password', role: 'manager', status: 'active' }]));
const session = new Map();
const storage = (map) => ({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
});
const context = vm.createContext({
    console,
    Date,
    Math,
    Set,
    JSON,
    Number,
    String,
    Array,
    Object,
    localStorage: storage(local),
    sessionStorage: storage(session),
    location: { hash: '', href: '', replace() {} },
    CustomEvent: class {},
    dispatchEvent() {},
    addEventListener() {},
    alert() {}
});
context.window = context;
// Explicit standard-role fixture for this existing-account integration test.
vm.runInContext(readFileSync('permissions.js', 'utf8'), context);
for (const file of ['auth.js', 'permissions.js', 'data.js', 'billing.js']) {
    vm.runInContext(readFileSync(file, 'utf8'), context, { filename: file });
}

const { RH, RHP, RHD } = context;
const admin = RH.getUsers()[0];
// Seed the test administrator directly; assigning Admin now requires an Admin actor.
local.set('residenthub_users', JSON.stringify(RH.getUsers().map(user => user.id === admin.id
    ? { ...user, accountTypeId: RHP.ADMIN_TYPE_ID, allBuildings: true } : user)));
RH.login(RH.getUsers().find((user) => user.id === admin.id), false);
const created = RH.createUser({
    name: 'Scoped staff',
    email: 'scoped.staff@example.test',
    password: 'test-password',
    role: 'manager',
    accountTypeId: 'at-staff',
    buildingIds: ['building-a', 'building-a', 'building-b'],
    allBuildings: false,
    department: 'Vận hành',
    title: 'Nhân viên',
    employeeCode: 'NV-01',
    staffGroup: 'technical',
    status: 'inactive'
});
assert.equal(created.ok, true);
assert.deepEqual(Array.from(created.user.buildingIds), ['building-a', 'building-b']);
assert.equal(created.user.department, 'Vận hành');
assert.equal(created.user.staffGroup, 'technical');
assert.equal(created.user.status, 'inactive');

const updated = RH.updateUser(created.user.id, {
    buildingIds: ['building-b'],
    allBuildings: false,
    department: 'Kỹ thuật',
    title: 'Kỹ thuật viên',
    employeeCode: 'NV-02',
    staffGroup: 'cleaning',
    status: 'locked'
});
assert.equal(updated.ok, true);
const persisted = RH.getUsers().find((user) => user.id === created.user.id);
assert.deepEqual(Array.from(persisted.buildingIds), ['building-b']);
assert.equal(persisted.department, 'Kỹ thuật');
assert.equal(persisted.title, 'Kỹ thuật viên');
assert.equal(persisted.employeeCode, 'NV-02');
assert.equal(persisted.staffGroup, 'cleaning');
assert.equal(persisted.status, 'locked');
assert.equal(RH.updateUser(persisted.id, { status: 'unknown' }).ok, false);

RHD.setMode('live');
RHD.create('buildings', { id: 'building-consistency', name: 'Consistency Building' });
RHD.create('apartments', { id: 'apartment-consistency', buildingId: 'building-consistency', name: '201' });
RHD.create('customers', { id: 'tenant-primary', fullName: 'Primary Tenant' });
RHD.create('customers', { id: 'tenant-secondary', fullName: 'Secondary Tenant' });
const sharedContract = RHD.create('contracts', {
    id: 'shared-contract',
    buildingId: 'building-consistency',
    apartmentId: 'apartment-consistency',
    customerId: 'tenant-primary',
    tenantIds: ['tenant-primary', 'tenant-secondary'],
    status: 'active',
    startDate: '2026-10-01',
    endDate: '2027-09-30'
});
assert.equal(sharedContract.ok, true);
RHD.create('invoices', { id: 'shared-invoice', contractId: 'shared-contract', apartmentId: 'apartment-consistency', customerId: 'tenant-primary', status: 'unpaid' });
const resident = RH.createUser({
    name: 'Resident',
    email: 'resident@example.test',
    password: 'test-password',
    role: 'resident',
    residentId: 'tenant-secondary',
    apartmentId: 'apartment-consistency'
});
assert.equal(resident.ok, true);
assert.equal(resident.user.accountTypeId, RHP.RESIDENT_TYPE_ID);
assert.equal(RHP.can('dashboard.view', Object.assign({}, resident.user, { accountTypeId: RHP.ADMIN_TYPE_ID })), false);
const residentView = RHD.residentContext({ id: resident.user.id, role: 'resident' });
assert.equal(residentView.contract.id, 'shared-contract', 'A non-representative co-tenant resolves the shared contract');
assert.equal(residentView.customer.id, 'tenant-secondary', 'Resident context keeps the linked resident profile');
assert.equal(residentView.invoices.some((invoice) => invoice.id === 'shared-invoice'), true, 'The co-tenant sees invoices linked to the shared contract');
assert.equal(RHD.residentPlacement('tenant-secondary').contract.id, 'shared-contract');
assert.equal(RHD.dashboardStats(['building-consistency']).customers, 2, 'Dashboard counts all contract tenants');

RHD.create('cashflows', { id: 'live-receipt', type: 'income', amount: 100 });
RHD.setMode('demo');
RHD.create('cashflows', { id: 'demo-receipt', type: 'income', amount: 50 });
RHD.resetDemo();
assert.equal(RHD.list('cashflows').length, 0, 'Resetting demo also clears its cashflow ledger');
RHD.setMode('live');
assert.equal(RHD.get('cashflows', 'live-receipt').amount, 100, 'Resetting demo leaves live cashflows untouched');

console.log('Account metadata, role isolation, cashflow reset, and live/demo data consistency passed.');
