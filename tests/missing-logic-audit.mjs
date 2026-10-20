// Diagnostic probes only. All writes go to disposable, in-memory storage.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function environment() {
    const local = new Map(), session = new Map();
    const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
    const sandbox = { console, Date, localStorage: storage(local), sessionStorage: storage(session), location: { hash: '', href: '', replace() {} }, CustomEvent: class {}, dispatchEvent() {}, addEventListener() {}, alert() {} };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    for (const file of ['auth.js', 'permissions.js', 'templates.js', 'data.js', 'billing.js', 'contract-documents.js']) vm.runInContext(readFileSync(file, 'utf8'), sandbox, { filename: file });
    return sandbox;
}
const context = environment();
const { RH, RHP, RHD } = context;
context.RHP = Object.assign({}, RHP, { can: () => true });
const account = RH.createUser({ name: 'Audit Staff', email: 'audit@example.test', password: 'audit-test-password', role: 'manager', accountTypeId: RHP.ADMIN_TYPE_ID, allBuildings: true, buildingIds: ['audit-building'], department: 'Audit' });
if (!account.ok) throw Error(account.error);
RH.login(account.user, false);
RH.updateUser(account.user.id, { accountTypeId: RHP.ADMIN_TYPE_ID, allBuildings: true, buildingIds: ['audit-building'], department: 'Updated' });
const saved = RH.getUsers().find(user => user.id === account.user.id);
console.log('ACCOUNT_PERSISTENCE', JSON.stringify({ created: account.ok, accountTypeId: saved.accountTypeId ?? null, buildingIds: saved.buildingIds ?? null, allBuildings: saved.allBuildings ?? null, department: saved.department ?? null, canViewDashboard: RHP.can('dashboard.view') }));
console.log('ASSET_DEPENDENCIES', JSON.stringify({ conditions: typeof RHD.ASSET_CONDITIONS, nextCode: typeof RHD.nextAssetCode, entities: RHD.ENTITIES.filter(name => ['assets', 'assetTypes'].includes(name)) }));
const billingContext = environment();
const d = billingContext.RHD;
d.create('buildings', { id: 'b', name: 'Audit Building', active: true, billingDay: 5, autoInvoice: true, autoInvoiceFrom: '2026-10', services: [] });
d.create('apartments', { id: 'a', buildingId: 'b', name: '101' });
d.create('customers', { id: 'c', fullName: 'Audit Tenant' });
d.create('contracts', { id: 'contract', buildingId: 'b', apartmentId: 'a', customerId: 'c', startDate: '2026-01-01', endDate: '2027-12-31', status: 'active', rentPrice: 1000000, serviceIds: [], paymentCycle: 'monthly' });
const before = d.list('invoices').length;
const run = billingContext.RHB.run({ today: '2026-10-16' });
console.log('BILLING_MANUAL_ENGINE', JSON.stringify({ before, createdByExplicitRun: run.created.length, after: d.list('invoices').length }));
let calls = 0;
billingContext.RHB.meterChanged = () => { calls++; };
const meter = d.create('meters', { id: 'meter', buildingId: 'b', apartmentId: 'a', meterType: 'electricity', readingPeriod: '2026-10', previousIndex: 0, latestIndex: 10 }).item;
d.update('meters', meter.id, { latestIndex: 20 });
d.remove('meters', meter.id);
console.log('METER_HOOK', JSON.stringify({ callsAfterCreateUpdateDelete: calls }));
// Check the real validator, then the actual storage entry point with the same record.
const assetsContext = environment(), ad = assetsContext.RHD;
assetsContext.RHP = { can: () => true, inScope: () => true };
ad.create('buildings', { id: 'b', name: 'Building' });
ad.create('apartments', { id: 'a', buildingId: 'b', name: '101', maxGuests: 1 });
ad.create('customers', { id: 'c', fullName: 'Tenant' });
ad.create('assets', { id: 'asset', apartmentId: 'a', quantity: 1 });
const contract = { buildingId: 'b', apartmentId: 'a', customerId: 'c', customerIds: ['c'], status: 'active', startDate: '2026-01-01', endDate: '2027-01-01', rentPrice: 1, depositPrice: 1, handoverAssets: [{ assetId: 'asset', quantity: 2 }] };
console.log('CONTRACT_ASSET_GUARD', JSON.stringify({ validationError: assetsContext.RHDocuments.validate(contract), acceptedByStorage: ad.create('contracts', contract).ok }));
