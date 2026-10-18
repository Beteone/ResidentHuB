import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

globalThis.window = globalThis;
globalThis.RHP = { scopeList: (_entity, rows) => rows };
globalThis.RHD = {
    list: () => [],
    isIssuedInvoice: (invoice) => ['unpaid', 'sent', 'paid', 'overdue'].includes(invoice.status)
};
globalThis.addEventListener = () => {};
vm.runInThisContext(readFileSync(new URL('../statistics-report.js', import.meta.url), 'utf8'));

const today = new Date(2026, 9, 17, 12);
const stamp = (day) => new Date(2026, 9, day, 12).getTime();
const fixture = {
    buildings: [{ id: 'b1', name: 'Tòa nhà Một' }, { id: 'b2', name: 'Tòa nhà Hai' }],
    apartments: [
        { id: 'a1', buildingId: 'b1', name: '101', status: 'occupied' },
        { id: 'a2', buildingId: 'b1', name: '102', status: 'vacant' },
        { id: 'a3', buildingId: 'b1', name: '103', status: 'maintenance' },
        { id: 'a4', buildingId: 'b2', name: '201', status: 'vacant' }
    ],
    customers: [
        { id: 'c1', fullName: 'Cư dân Một', idNumber: 'ID-01', createdAt: stamp(10) },
        { id: 'c2', fullName: 'Cư dân Hai', createdAt: stamp(15) },
        { id: 'c3', fullName: 'Cư dân Ba', createdAt: stamp(16) },
        { id: 'c4', fullName: 'Hồ sơ trùng cư dân Một', idNumber: 'ID-01', createdAt: stamp(16) }
    ],
    contracts: [
        { id: 'k1', code: 'K-7', buildingId: 'b1', apartmentId: 'a1', tenantIds: ['c1', 'c2', 'c4'], status: 'active', startDate: '2026-01-01', endDate: '2026-10-24' },
        { id: 'k2', code: 'K-30', buildingId: 'b1', apartmentId: 'a1', customerId: 'c1', status: 'active', startDate: '2026-01-01', endDate: '2026-11-16' },
        { id: 'k3', code: 'K-expired', buildingId: 'b1', apartmentId: 'a2', customerId: 'c3', status: 'active', startDate: '2025-01-01', endDate: '2026-10-16' },
        { id: 'k4', code: 'K-ended', buildingId: 'b1', apartmentId: 'a2', customerId: 'c3', status: 'terminated', startDate: '2025-01-01', endDate: '2026-10-16' },
        { id: 'k5', code: 'K-draft', buildingId: 'b1', apartmentId: 'a2', customerId: 'c3', status: 'draft', startDate: '2026-10-20', endDate: '2027-10-19' },
        { id: 'k6', code: 'K-other', buildingId: 'b2', apartmentId: 'a4', customerId: 'c3', status: 'active', startDate: '2026-01-01', endDate: '2027-01-01' }
    ],
    invoices: [
        { id: 'i-paid', code: 'HD-PAID', buildingId: 'b1', apartmentId: 'a1', customerId: 'c1', status: 'paid', total: 1000, paidAmount: 900, dueDate: '2026-10-20' },
        { id: 'i-unpaid', code: 'HD-UNPAID', buildingId: 'b1', apartmentId: 'a2', customerId: 'c3', status: 'unpaid', total: 1000, dueDate: '2026-10-20' },
        { id: 'i-partial', code: 'HD-PARTIAL', buildingId: 'b1', apartmentId: 'a1', customerId: 'c1', status: 'partial', total: 1000, paidAmount: 400, dueDate: '2026-10-20' },
        { id: 'i-overdue', code: 'HD-OVERDUE', buildingId: 'b1', apartmentId: 'a2', customerId: 'c3', status: 'overdue', total: 500, paidAmount: 100, dueDate: '2026-10-01' },
        { id: 'i-cancelled', code: 'HD-CANCELLED', buildingId: 'b1', apartmentId: 'a2', customerId: 'c3', status: 'cancelled', total: 100000, dueDate: '2026-10-01' },
        { id: 'i-other-building', code: 'HD-OTHER', buildingId: 'b2', apartmentId: 'a4', customerId: 'c3', status: 'paid', total: 200, dueDate: '2026-10-20' }
    ],
    cashflows: [
        { id: 'pay-paid', buildingId: 'b1', type: 'income', reference: 'HD-PAID', amount: 900 },
        { id: 'pay-partial', buildingId: 'b1', type: 'income', reference: 'HD-PARTIAL', amount: 500 },
        { id: 'refund-partial', buildingId: 'b1', type: 'expense', category: 'Hoàn tiền', reference: 'HD-PARTIAL', amount: 100 }
    ],
    supportRequests: [
        { id: 'r-new', code: 'YC-1', buildingId: 'b1', status: 'new', createdAt: stamp(16), title: 'Yêu cầu mới' },
        { id: 'r-work', code: 'YC-2', buildingId: 'b1', status: 'in_progress', createdAt: stamp(1), title: 'Yêu cầu đang xử lý' },
        { id: 'r-done', code: 'YC-3', buildingId: 'b1', status: 'resolved', createdAt: stamp(15), title: 'Yêu cầu đã xử lý' },
        { id: 'r-other', code: 'YC-4', buildingId: 'b2', status: 'new', createdAt: stamp(17), title: 'Yêu cầu tòa hai' }
    ]
};

const all = RHStatisticsReport.calculate(fixture, { now: today, filters: { building: '', period: 'month', contractStatus: 'all', invoiceStatus: 'all', supportStatus: 'all' } });
assert.equal(all.totalBuildings, 2);
assert.equal(all.totalApartments, 4);
assert.equal(all.eligibleApartments, 3);
assert.equal(all.occupiedApartments, 2, 'A multi-contract apartment is counted only once; the other building has one occupied unit');
assert.equal(all.vacantApartments, 1);
assert.equal(all.maintenanceApartments, 1);
assert.equal(all.occupancyRate, 200 / 3);
assert.equal(all.contracts.active, 3);
assert.equal(all.contracts.expiring7, 1);
assert.equal(all.contracts.expiring30, 2);
assert.equal(all.contracts.expired, 1);
assert.equal(all.contracts.terminated, 1);
assert.equal(all.residents.current, 3, 'A co-tenant is unique across overlapping contracts');
assert.equal(all.residents.totalProfiles, 3, 'Customer profiles sharing a verified identity are counted once');
assert.equal(all.residents.newInPeriod, 3, 'Numeric creation timestamps use the selected period');
assert.equal(all.invoiceSummary.paidCount, 2);
assert.equal(all.invoiceSummary.paidTotal, 1200);
assert.equal(all.invoiceSummary.collected, 1400, 'Collected value uses actual payment records and subtracts linked refunds');
assert.equal(all.invoiceSummary.unpaidCount, 3);
assert.equal(all.invoiceSummary.debt, 2000);
assert.equal(all.invoiceSummary.overdueDebt, 400);
assert.equal(all.invoiceRows.find((row) => row.id === 'i-other-building').paid, 0, 'Paid invoice status does not invent an actual receipt without payment evidence');
assert.equal(all.invoiceRows.find((row) => row.id === 'i-other-building').remaining, 0, 'Paid invoice status clears receivable balance');
assert.equal(all.support.createdInPeriod, 4);
assert.equal(all.support.backlog, 3, 'Backlog is current state and includes older requests');

const missingTenantProfile = RHStatisticsReport.calculate({
    ...fixture,
    contracts: [...fixture.contracts, {
        id: 'k-missing-profile', buildingId: 'b1', apartmentId: 'a2', tenantIds: ['tenant-without-profile'],
        status: 'active', startDate: '2026-01-01', endDate: '2027-01-01'
    }]
}, { now: today });
assert.equal(missingTenantProfile.residents.current, 4, 'Current residents include unique tenants on active contracts even when their customer profile is missing');
const directlyLinkedResident = RHStatisticsReport.calculate({
    ...fixture,
    customers: [...fixture.customers, { id: 'c5', fullName: 'Cư dân gắn căn hộ', apartmentId: 'a4', status: 'active' }]
}, { now: today });
assert.equal(directlyLinkedResident.residents.current, 4, 'An active customer directly linked to an occupied apartment is counted');
const inactiveProfiles = RHStatisticsReport.calculate({
    ...fixture,
    customers: [...fixture.customers, { id: 'c5', fullName: 'Hồ sơ ngừng hoạt động', status: 'inactive', createdAt: stamp(16) }]
}, { now: today });
assert.equal(inactiveProfiles.residents.totalProfiles, 4, 'Total customer profiles remain distinct from active status');
assert.equal(inactiveProfiles.residents.newInPeriod, 4, 'New profile count measures profiles created in the period, regardless of current status');

const oneBuilding = RHStatisticsReport.calculate(fixture, { now: today, filters: { building: 'b1', period: 'today', contractStatus: 'all', invoiceStatus: 'all', supportStatus: 'new' } });
assert.equal(oneBuilding.totalBuildings, 1);
assert.equal(oneBuilding.totalApartments, 3);
assert.equal(oneBuilding.residents.current, 2);
assert.equal(oneBuilding.support.createdInPeriod, 0);
assert.equal(oneBuilding.support.new, 1);
assert.equal(oneBuilding.support.backlog, 1);
assert.equal(oneBuilding.invoiceSummary.paidCount, 1);

const unpaid = RHStatisticsReport.calculate(fixture, { now: today, filters: { building: 'b1', period: 'month', contractStatus: 'all', invoiceStatus: 'unpaid', supportStatus: 'all' } });
assert.equal(unpaid.invoiceRows.length, 1);
assert.equal(unpaid.invoiceSummary.debt, 1000);
assert.equal(unpaid.invoiceSummary.overdueDebt, 0);
const partialPayments = RHStatisticsReport.calculate({
    ...fixture,
    invoices: [...fixture.invoices, { ...fixture.invoices.find((invoice) => invoice.id === 'i-partial'), id: 'i-partially-paid', status: 'partially_paid' }]
}, { now: today, filters: { building: 'b1', period: 'month', contractStatus: 'all', invoiceStatus: 'partial', supportStatus: 'all' } });
assert.deepEqual(partialPayments.invoiceRows.map((invoice) => invoice.id).sort(), ['i-partial', 'i-partially-paid']);
const activeContracts = RHStatisticsReport.calculate(fixture, { now: today, filters: { building: 'b1', period: 'month', contractStatus: 'active', invoiceStatus: 'all', supportStatus: 'all' } });
assert.equal(activeContracts.contractRows.length, 2);
assert.equal(activeContracts.contractRows.every((row) => row.category === 'active'), true);
const noApartments = RHStatisticsReport.calculate({ ...fixture, apartments: [] }, { now: today });
assert.equal(noApartments.occupancyRate, null);
assert.equal(noApartments.occupiedApartments, 0);
assert.throws(() => RHStatisticsReport.calculate(fixture, { now: today, filters: { period: 'custom', from: '2026-10-20', to: '2026-10-01' } }), /Ngày bắt đầu/);
const empty = RHStatisticsReport.calculate({ buildings: [], apartments: [], customers: [], contracts: [], invoices: [], cashflows: [], supportRequests: [] }, { now: today });
assert.equal(empty.empty, true);
assert.equal(empty.totalBuildings, 0, 'A successful empty read shows real zeros, not fabricated figures');

const sample = RHStatisticsReport.createSampleDataset(today);
const sampleReport = RHStatisticsReport.calculate(sample, { now: today });
assert.equal(sample.source, 'residenthub-statistics-sample');
assert.equal(sample.buildings.every((building) => building.synthetic && building.code.startsWith('MH-')), true);
assert.equal(sampleReport.totalBuildings, 2);
assert.equal(sampleReport.totalApartments, 6);
assert.equal(sampleReport.eligibleApartments, 5);
assert.equal(sampleReport.occupiedApartments, 3);
assert.equal(sampleReport.maintenanceApartments, 1);
assert.equal(sampleReport.occupancyRate, 60);
assert.equal(sampleReport.contracts.expiring7, 1);
assert.equal(sampleReport.contracts.expiring30, 2);
assert.equal(sampleReport.contracts.expired, 1);
assert.equal(sampleReport.contracts.terminated, 1);
assert.equal(sampleReport.invoiceSummary.paidCount, 1);
assert.equal(sampleReport.invoiceSummary.paidTotal, 1500000);
assert.equal(sampleReport.invoiceSummary.collected, 1750000);
assert.equal(sampleReport.invoiceSummary.debt, 1500000);
assert.equal(sampleReport.invoiceSummary.overdueDebt, 600000);
assert.equal(sampleReport.support.createdInPeriod, 3);
assert.equal(sampleReport.support.backlog, 2);

console.log('Statistics report aggregation, status filters, period filters, de-duplication, and empty cases passed.');
