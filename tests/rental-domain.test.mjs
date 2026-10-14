import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataSource = readFileSync(resolve(root, 'data.js'), 'utf8');
const domainSource = readFileSync(resolve(root, 'rental-domain.js'), 'utf8');
const managerSource = readFileSync(resolve(root, 'manager-modules.js'), 'utf8');

function setup() {
    const values = new Map();
    const localStorage = {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
    const window = {};
    const context = { window, localStorage, console };
    vm.runInNewContext(dataSource, context, { filename: 'data.js' });
    vm.runInNewContext(domainSource, context, { filename: 'rental-domain.js' });
    window.RHD.setMode('live');
    const building = window.RHD.create('buildings', {
        id: 'building-1', code: 'TN0001', shortName: 'CT1', name: 'Tòa CT1',
        services: [{ id: 'rent', name: 'Tiền thuê', feeType: 'rent' }, { id: 'wifi', name: 'Internet', feeType: 'internet', unitPrice: 100000 }]
    }).item;
    const apartment = window.RHD.create('apartments', {
        id: 'apartment-501', buildingId: building.id, name: '501', rentPrice: 2000000, depositPrice: 2000000, status: 'vacant'
    }).item;
    const customer = window.RHD.create('customers', { id: 'customer-1', fullName: 'Nguyễn Thị Hoa' }).item;
    return { RHD: window.RHD, RHLease: window.RHLease, building, apartment, customer };
}

function depositInput(env, overrides = {}) {
    return Object.assign({
        buildingId: env.building.id,
        apartmentId: env.apartment.id,
        tenantIds: [env.customer.id],
        occupantCount: 1,
        depositDate: '2026-10-01',
        moveInDate: '2026-11-01',
        leaseStartDate: '2026-11-01',
        leaseEndDate: '2027-10-31',
        rentPrice: 2000000,
        depositMonths: 1,
        depositReceivedAmount: 1500000,
        paymentCycle: 'monthly'
    }, overrides);
}

test('creates a uniquely coded holding deposit, calculates balances, and records receipt', () => {
    const env = setup();
    const first = env.RHLease.createDeposit(depositInput(env));
    const second = env.RHLease.createDeposit(depositInput(env, { apartmentId: env.apartment.id, leaseStartDate: '2027-11-01', leaseEndDate: '2028-10-31' }));
    assert.equal(first.ok, true);
    assert.equal(first.item.code, 'DC-CT1-501-001');
    assert.equal(first.item.depositFullAmount, 2000000);
    assert.equal(first.item.depositRemainingAmount, 500000);
    assert.equal(first.item.status, 'holding');
    assert.equal(env.RHLease.listDepositTransactions(first.item.id).length, 1);
    assert.equal(second.ok, false, 'only one holding deposit may reserve a space');
});

test('blocks inclusive schedule overlap with a contract and names the conflicting code', () => {
    const env = setup();
    env.RHD.create('contracts', {
        id: 'contract-1', code: 'CT1-501-2026-001', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, tenantIds: [env.customer.id], startDate: '2026-10-01', endDate: '2026-11-01', status: 'active'
    });
    const result = env.RHLease.createDeposit(depositInput(env));
    assert.equal(result.ok, false);
    assert.match(result.error, /CT1-501-2026-001/);
});

test('ignores liquidated contracts and permits non-overlapping dates', () => {
    const env = setup();
    env.RHD.create('contracts', {
        id: 'contract-old', code: 'OLD-1', buildingId: env.building.id, apartmentId: env.apartment.id,
        startDate: '2026-01-01', endDate: '2026-10-31', status: 'liquidated'
    });
    assert.equal(env.RHLease.checkAvailability({
        buildingId: env.building.id, apartmentId: env.apartment.id, startDate: '2026-11-01', endDate: '2027-10-31'
    }).ok, true);
});

test('enforces deposit amount, cancellation reason and refund ceiling with immutable transactions', () => {
    const env = setup();
    const created = env.RHLease.createDeposit(depositInput(env));
    assert.equal(env.RHLease.updateDeposit(created.item.id, { depositReceivedAmount: 2100000 }).ok, false);
    assert.equal(env.RHLease.cancelDeposit(created.item.id, { refundAmount: 1500001, reason: 'Hủy' }).ok, false);
    assert.equal(env.RHLease.cancelDeposit(created.item.id, { refundAmount: 1000000 }).ok, false);
    const cancelled = env.RHLease.cancelDeposit(created.item.id, { refundAmount: 1000000, reason: 'Khách đổi kế hoạch' });
    assert.equal(cancelled.item.status, 'cancelled');
    assert.equal(cancelled.item.cancellation.deductionAmount, 500000);
    assert.deepEqual(Array.from(env.RHLease.listDepositTransactions(created.item.id), item => item.type), ['receive', 'refund', 'deduction']);
    assert.equal(env.RHLease.updateDeposit(created.item.id, { note: 'sửa' }).ok, false);
});

test('derives customer residence and apartment occupancy from active contract/deposit', () => {
    const env = setup();
    const created = env.RHLease.createDeposit(depositInput(env));
    assert.equal(env.RHLease.currentResidence(env.customer.id).source, 'deposit');
    assert.equal(env.RHLease.apartmentStatus(env.apartment.id), 'deposited');
    env.RHD.create('contracts', {
        id: 'contract-1', code: 'CT1-501-2026-001', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, tenantIds: [env.customer.id], startDate: '2026-11-01', endDate: '2027-10-31', status: 'active'
    });
    assert.equal(env.RHLease.currentResidence(env.customer.id).source, 'contract');
    assert.equal(env.RHLease.apartmentStatus(env.apartment.id), 'occupied');
    assert.equal(created.item.isDeleted, false);
});

test('keeps overdue holding deposits linked to customers and exposes a warning only', () => {
    const env = setup();
    const deposit = env.RHLease.createDeposit(depositInput(env, { moveInDate: '2026-09-30', leaseStartDate: '2026-09-30', leaseEndDate: '2027-09-29' })).item;
    assert.equal(env.RHLease.currentResidence(env.customer.id).deposit.id, deposit.id);
    assert.equal(env.RHLease.depositAlert(deposit, '2026-10-01'), 'overdue_move_in');
    assert.equal(env.RHD.get('deposits', deposit.id).status, 'holding');
});

test('creates a contract from a deposit and stores linkage and transfer transaction', () => {
    const env = setup();
    const deposit = env.RHLease.createDeposit(depositInput(env)).item;
    const result = env.RHLease.createContractFromDeposit(deposit.id);
    assert.equal(result.ok, true);
    assert.equal(result.item.depositId, deposit.id);
    assert.equal(result.item.depositHeldAmount, 1500000);
    assert.equal(result.item.depositOutstandingAmount, 500000);
    assert.equal(result.deposit.status, 'contracted');
    assert.equal(result.deposit.contractId, result.item.id);
    assert.equal(env.RHLease.listDepositTransactions(deposit.id).at(-1).type, 'transfer');
});

test('blocks contract deletion when it has an invoice', () => {
    const env = setup();
    const contract = env.RHD.create('contracts', {
        id: 'contract-invoice', code: 'CT1-501-2026-001', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, startDate: '2026-10-01', endDate: '2027-09-30', status: 'active'
    }).item;
    env.RHD.create('invoices', { id: 'invoice-1', contractId: contract.id, total: 2000000 });
    assert.match(env.RHLease.contractDeleteBlock(contract.id), /hóa đơn/);
    assert.equal(env.RHLease.deleteContract(contract.id).ok, false);
    assert.ok(env.RHD.get('contracts', contract.id));
});

test('blocks contract deletion after an in-term meter record and computes settlement', () => {
    const env = setup();
    const contract = env.RHD.create('contracts', {
        id: 'contract-1', code: 'CT1-501-2026-001', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, startDate: '2026-10-01', endDate: '2027-09-30', status: 'active', depositHeldAmount: 2000000
    }).item;
    env.RHD.create('meters', { id: 'meter-1', apartmentId: env.apartment.id, periodMonth: '2026-10' });
    assert.match(env.RHLease.contractDeleteBlock(contract.id), /bản ghi chỉ số/);
    const settlement = env.RHLease.calculateSettlement(contract, { invoiceDebt: 300000, penalties: 200000, usedRent: 500000 });
    assert.equal(settlement.refundAmount, 1000000);
    assert.equal(settlement.amountToCollect, 0);
    assert.equal(env.RHLease.calculateSettlement(contract, { customerAbandoned: true }).refundAmount, 0);
});

test('saveContract generates the established code and creates/updates through RHD', () => {
    const env = setup();
    const result = env.RHLease.saveContract({
        buildingId: env.building.id,
        apartmentId: env.apartment.id,
        customerId: env.customer.id,
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        rentPrice: 2000000
    });
    assert.equal(result.ok, true);
    assert.equal(result.item.code, 'CT1-501-' + new Date().getFullYear() + '-001');
    assert.equal(env.RHD.get('contracts', result.item.id).id, result.item.id);
    const updated = env.RHLease.saveContract({ note: 'Cập nhật' }, result.item.id);
    assert.equal(updated.ok, true);
    assert.equal(updated.item.code, result.item.code);
    assert.equal(updated.item.note, 'Cập nhật');
    assert.equal(env.RHD.get('contracts', result.item.id).note, 'Cập nhật');
});

test('saveContract respects the shared Demo create limit while updates remain available', () => {
    const env = setup();
    env.RHD.setMode('demo');
    const building = env.RHD.list('buildings')[0];
    const apartment = env.RHD.list('apartments')[0];
    const customer = env.RHD.list('customers')[0];
    const created = [];
    for (let year = 2027; year <= 2031; year += 1) {
        const result = env.RHLease.saveContract({
            buildingId: building.id,
            apartmentId: apartment.id,
            customerId: customer.id,
            startDate: year + '-01-01',
            endDate: year + '-12-31',
            rentPrice: apartment.rentPrice
        });
        assert.equal(result.ok, true);
        created.push(result.item);
    }
    const blocked = env.RHLease.saveContract({
        buildingId: building.id,
        apartmentId: apartment.id,
        customerId: customer.id,
        startDate: '2032-01-01',
        endDate: '2032-12-31',
        rentPrice: apartment.rentPrice
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.limitReached, true);
    const updated = env.RHLease.saveContract({ note: 'Chỉnh sửa ở mức giới hạn' }, created[0].id);
    assert.equal(updated.ok, true);
});

test('contract delete UI delegates to app confirmDelete and contains no native dialogs', () => {
    const handler = managerSource.match(/RHUI\.deleteContract = function \(id\) \{([\s\S]*?)\n    \};/);
    const helper = managerSource.match(/function confirmDelete\([^\n]+\) \{([\s\S]*?)\n    \}/);
    assert.ok(handler, 'contract delete handler exists');
    assert.ok(helper, 'shared delete helper exists');
    assert.match(handler[1], /confirmDelete\(/);
    assert.match(handler[1], /RHLease\.deleteContract\(/);
    assert.doesNotMatch(handler[1], /\b(?:confirm|alert)\s*\(/);
    assert.doesNotMatch(helper[1], /\b(?:confirm|alert)\s*\(/);
    assert.match(helper[1], /role', 'alertdialog'/);
});

test('preserves multi-tenant and legacy deposit fields when editing a contract', () => {
    const env = setup();
    const customer2 = env.RHD.create('customers', { id: 'customer-2', fullName: 'Lê Minh Đức' }).item;
    env.RHD.create('deposits', { id: 'deposit-existing', status: 'contracted' });
    const contract = env.RHD.create('contracts', {
        id: 'contract-1', code: 'CT1-501-2026-001', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, tenantIds: [env.customer.id, customer2.id], depositId: 'deposit-existing',
        depositPrice: 2000000, depositBalanceNeedsReview: true, startDate: '2026-10-01', endDate: '2027-09-30', status: 'active'
    }).item;
    const result = env.RHLease.saveContract({ buildingId: env.building.id, apartmentId: env.apartment.id, customerId: env.customer.id, startDate: contract.startDate, endDate: contract.endDate }, contract.id);
    assert.equal(result.ok, true);
    assert.equal(result.item.tenantIds.length, 2);
    assert.equal(result.item.depositId, 'deposit-existing');
    assert.equal(result.item.depositPrice, 2000000);
    assert.equal(result.item.depositBalanceNeedsReview, true);
    assert.equal(env.RHLease.deleteContract(contract.id).ok, false);
});

test('migration preserves legacy contract fields and marks unknown deposit balance for review', () => {
    const env = setup();
    const customer2 = env.RHD.create('customers', { id: 'customer-legacy-2', fullName: 'Lê Minh Đức' }).item;
    const legacy = env.RHD.create('contracts', {
        id: 'legacy', code: 'CT1-501-2026-001', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, customerIds: [env.customer.id, customer2.id], startDate: '2026-01-01', endDate: '2026-12-31', depositPrice: 2000000, status: 'active'
    }).item;
    env.RHLease.initialize();
    const migrated = env.RHD.get('contracts', legacy.id);
    assert.equal(migrated.depositPrice, 2000000);
    assert.equal(migrated.lifecycleStatus, 'active');
    assert.equal(migrated.tenantIds.length, 2);
    assert.equal(Object.hasOwn(migrated, 'customerIds'), false);
    assert.equal(migrated.depositBalanceNeedsReview, true);
    const contractsBefore = JSON.stringify(env.RHD.list('contracts'));
    const depositsBefore = JSON.stringify(env.RHD.list('deposits'));
    const transactionsBefore = JSON.stringify(env.RHD.list('depositTransactions'));
    assert.equal(env.RHLease.initialize().migrated, false);
    assert.equal(JSON.stringify(env.RHD.list('contracts')), contractsBefore);
    assert.equal(JSON.stringify(env.RHD.list('deposits')), depositsBefore);
    assert.equal(JSON.stringify(env.RHD.list('depositTransactions')), transactionsBefore);
});

test('dashboard excludes expired active-status contracts from current counts and tracks overdue separately', () => {
    const env = setup();
    const secondCustomer = env.RHD.create('customers', { id: 'customer-2', fullName: 'Lê Minh Đức' }).item;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const expiredOn = [yesterday.getFullYear(), String(yesterday.getMonth() + 1).padStart(2, '0'), String(yesterday.getDate()).padStart(2, '0')].join('-');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endsTomorrow = [tomorrow.getFullYear(), String(tomorrow.getMonth() + 1).padStart(2, '0'), String(tomorrow.getDate()).padStart(2, '0')].join('-');
    env.RHD.create('contracts', {
        id: 'contract-expired', code: 'CT1-502-2025-002', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, tenantIds: [env.customer.id], startDate: '2025-01-01', endDate: expiredOn, status: 'active'
    });
    env.RHD.create('contracts', {
        id: 'contract-current', code: 'CT1-503-2026-003', buildingId: env.building.id, apartmentId: 'apartment-503',
        customerId: secondCustomer.id, tenantIds: [secondCustomer.id], startDate: '2026-01-01', endDate: endsTomorrow, status: 'active'
    });
    const stats = env.RHD.dashboardStats();
    const expired = env.RHD.get('contracts', 'contract-expired');
    assert.equal(env.RHLease.isActiveContract(expired), true);
    assert.equal(env.RHLease.isCurrentContract(expired), false);
    assert.equal(env.RHLease.contractAlertStatus(expired), 'overdue');
    assert.equal(stats.activeContracts.length, 1);
    assert.equal(stats.overdueContracts.length, 1);
    assert.equal(stats.endedContracts.length, 0);
    assert.equal(stats.customersWithoutContract, 1);
});