import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { readSheet as readExcelSheet } from 'read-excel-file/browser';
import writeExcelFile from 'write-excel-file/browser';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataSource = readFileSync(resolve(root, 'data.js'), 'utf8');
const domainSource = readFileSync(resolve(root, 'rental-domain.js'), 'utf8');
const billingSource = readFileSync(resolve(root, 'billing.js'), 'utf8');
const managerSource = readFileSync(resolve(root, 'manager-modules.js'), 'utf8');
const depositsModuleSource = readFileSync(resolve(root, 'deposits-module.js'), 'utf8');
const contractsModuleSource = readFileSync(resolve(root, 'contracts-module.js'), 'utf8');
const excelToolsSource = readFileSync(resolve(root, 'src/excel-tools.js'), 'utf8');
const dashboardSource = readFileSync(resolve(root, 'dashboard.html'), 'utf8');
const meterServiceSource = readFileSync(resolve(root, 'src/meter-reading/meterService.ts'), 'utf8');

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
    context.RHD = window.RHD;
    vm.runInNewContext(domainSource, context, { filename: 'rental-domain.js' });
    vm.runInNewContext(billingSource, context, { filename: 'billing.js' });
    window.RHD.setMode('live');
    const building = window.RHD.create('buildings', {
        id: 'building-1', code: 'TN0001', shortName: 'CT1', name: 'Tòa CT1',
        services: [{ id: 'rent', name: 'Tiền thuê', feeType: 'rent' }, { id: 'wifi', name: 'Internet', feeType: 'internet', unitPrice: 100000 }]
    }).item;
    const apartment = window.RHD.create('apartments', {
        id: 'apartment-501', buildingId: building.id, name: '501', rentPrice: 2000000, depositPrice: 2000000, status: 'vacant'
    }).item;
    const customer = window.RHD.create('customers', { id: 'customer-1', fullName: 'Nguyễn Thị Hoa' }).item;
    return { RHD: window.RHD, RHLease: window.RHLease, RHB: window.RHB, building, apartment, customer };
}

function depositInput(env, overrides = {}) {
    return Object.assign({
        buildingId: env.building.id,
        apartmentId: env.apartment.id,
        tenantIds: [env.customer.id],
        occupantCount: 1,
        depositDate: '2026-10-01',
        moveInDate: '2026-11-01',
        rentStartDate: '2026-11-01',
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

test('defaults holding deposit to one rent month and allows changing the deposit amount', () => {
    const env = setup();
    const input = depositInput(env);
    delete input.depositMonths;
    delete input.depositFullAmount;
    const created = env.RHLease.createDeposit(input);
    assert.equal(created.ok, true);
    assert.equal(created.item.depositMonths, 1);
    assert.equal(created.item.depositFullAmount, env.apartment.rentPrice);

    const updated = env.RHLease.updateDeposit(created.item.id, { depositFullAmount: 2500000 });
    assert.equal(updated.ok, true);
    assert.equal(updated.item.depositMonths, 1);
    assert.equal(updated.item.depositFullAmount, 2500000);
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

test('blocks creating a contract over CT1-501-2026-001 and names the conflicting contract', () => {
    const env = setup();
    env.RHD.create('contracts', {
        id: 'contract-existing-501', code: 'CT1-501-2026-001', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, tenantIds: [env.customer.id], startDate: '2026-10-01', endDate: '2026-10-31', status: 'active'
    });
    const result = env.RHLease.saveContract({
        buildingId: env.building.id, apartmentId: env.apartment.id, customerId: env.customer.id,
        startDate: '2026-10-14', endDate: '2027-10-13', rentPrice: env.apartment.rentPrice
    });
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

test('partial-refund cancellation and zero-refund forfeiture record complete transaction history', () => {
    const env = setup();
    const partialApartment = env.RHD.create('apartments', {
        id: 'apartment-partial-refund', buildingId: env.building.id, name: '502', rentPrice: 2000000, status: 'vacant'
    }).item;
    const zeroApartment = env.RHD.create('apartments', {
        id: 'apartment-zero-refund', buildingId: env.building.id, name: '503', rentPrice: 2000000, status: 'vacant'
    }).item;
    const partialDeposit = env.RHLease.createDeposit(depositInput(env, { apartmentId: partialApartment.id })).item;
    const partial = env.RHLease.cancelDeposit(partialDeposit.id, { refundAmount: 500000, reason: 'Khách hủy' });
    assert.equal(partial.ok, true);
    assert.equal(partial.item.status, 'cancelled');
    assert.deepEqual(Array.from(env.RHLease.listDepositTransactions(partialDeposit.id), tx => [tx.type, tx.amount]), [
        ['receive', 1500000], ['refund', 500000], ['deduction', 1000000]
    ]);

    const zeroDeposit = env.RHLease.createDeposit(depositInput(env, { apartmentId: zeroApartment.id })).item;
    const zero = env.RHLease.cancelDeposit(zeroDeposit.id, { refundAmount: 0, reason: 'Khách bỏ cọc' });
    assert.equal(zero.ok, true);
    assert.equal(zero.item.status, 'forfeited');
    assert.deepEqual(Array.from(env.RHLease.listDepositTransactions(zeroDeposit.id), tx => [tx.type, tx.amount]), [
        ['receive', 1500000], ['deduction', 1500000]
    ]);
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
    const deposit = env.RHLease.createDeposit(depositInput(env, { roomId: 'P.303', bedId: 'G.02' })).item;
    const result = env.RHLease.createContractFromDeposit(deposit.id);
    assert.equal(result.ok, true);
    assert.equal(result.item.depositId, deposit.id);
    assert.equal(result.item.roomId, 'P.303');
    assert.equal(result.item.bedId, 'G.02');
    assert.equal(result.item.depositHeldAmount, 1500000);
    assert.equal(result.item.depositOutstandingAmount, 500000);
    assert.equal(result.deposit.status, 'contracted');
    assert.equal(result.deposit.contractId, result.item.id);
    assert.equal(env.RHLease.listDepositTransactions(deposit.id).at(-1).type, 'transfer');
    assert.equal(env.RHLease.currentResidence(env.customer.id).contract.id, result.item.id);
    assert.equal(env.RHLease.currentResidence(env.customer.id).deposit, null);
});

test('preserves an explicit contract code when signing from a deposit', () => {
    const env = setup();
    const deposit = env.RHLease.createDeposit(depositInput(env)).item;
    const result = env.RHLease.createContractFromDeposit(deposit.id, { code: 'CT1-501-IMPORT-001' });
    assert.equal(result.ok, true);
    assert.equal(result.item.code, 'CT1-501-IMPORT-001');
    assert.match(env.RHLease.listDepositTransactions(deposit.id).at(-1).note, /CT1-501-IMPORT-001/);
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

test('deposit UI delegates business rules to RHLease and is loaded by the manager dashboard', () => {
    assert.match(depositsModuleSource, /RHLease\.createDeposit\(/);
    assert.match(depositsModuleSource, /RHLease\.updateDeposit\(/);
    assert.match(depositsModuleSource, /RHLease\.validateDepositInput|RHLease\.checkDepositAvailability\(/);
    assert.match(depositsModuleSource, /RHLease\.calculateDepositFull\(/);
    assert.match(depositsModuleSource, /RHLease\.cancelDeposit\(/);
    assert.doesNotMatch(depositsModuleSource, /RHD\.(?:create|update)\(['"]deposits['"]/);
    assert.match(dashboardSource, /<script src="deposits-module\.js"><\/script>/);
});

test('deposit-to-contract UI locks reserved location and delegates transfer to RHLease', () => {
    assert.match(depositsModuleSource, /RHUI\.openContractFromDeposit\(item\.id\)/);
    assert.match(managerSource, /RHLease\.createContractFromDeposit\(depositId, data, actor\)/);
    assert.match(managerSource, /Tạo từ cọc /);
    assert.match(managerSource, /id="cfBuildingSel" required ' \+ \(locked \? 'disabled'/);
    assert.match(managerSource, /id="cfApartmentSel" required ' \+ \(locked \? 'disabled'/);
    assert.match(managerSource, /id="cfDepositHeld"/);
    assert.match(managerSource, /id="cfDepositOutstanding"/);
    assert.match(managerSource, /RHUI\.notifyDepositStage\('Đã ký hợp đồng '/);
    assert.match(depositsModuleSource, /Math\.min\(received, value\)/);
    assert.match(depositsModuleSource, /RHLease\.cancelDeposit\(/);
    assert.match(depositsModuleSource, /RHLease\.listDepositTransactions\(deposit\.id\)/);
    assert.match(depositsModuleSource, /function openHistory\(deposit\)/);
});

test('contract workflow module replaces the legacy renderer with exclusive status tabs and domain actions', () => {
    assert.match(dashboardSource, /<script src="contracts-module\.js"><\/script>/);
    assert.match(contractsModuleSource, /RHUI\.renderContractsTab = renderContractsTab/);
    assert.match(contractsModuleSource, /\['renting', 'Đang thuê'\]/);
    assert.match(contractsModuleSource, /\['expiring', 'Sắp hết hạn'\]/);
    assert.match(contractsModuleSource, /\['overdue', 'Quá hạn'\]/);
    assert.match(contractsModuleSource, /\['moving', 'Sắp chuyển đi'\]/);
    assert.doesNotMatch(contractsModuleSource, /Còn hạn/);
    ['renewContract', 'transferContract', 'registerMoveOut', 'assignContract', 'settleContract'].forEach(action => {
        assert.match(contractsModuleSource, new RegExp('RHLease\\.' + action + '\\('));
    });
    assert.match(contractsModuleSource, /RHLease\.deleteContract\)/);
    ['(1) Thông tin chung', '(2) Khách hàng', '(3) Tiền thuê & tiền cọc', '(4) Phí dịch vụ', '(5) Hồ sơ hợp đồng'].forEach(section => {
        assert.ok(contractsModuleSource.includes(section));
    });
});

test('contract workflow module parses as valid JavaScript', () => {
    assert.doesNotThrow(() => new vm.Script(contractsModuleSource, { filename: 'contracts-module.js' }));
});

test('contract workflow restores spaced responsive list and form styling', () => {
    assert.match(contractsModuleSource, /rh-contracts-module/);
    assert.ok(contractsModuleSource.includes('#contracts-tab .rh-contract-tabs{display:flex'));
    assert.ok(contractsModuleSource.includes('#contracts-tab .rh-contract-list{display:grid;gap:.6rem}'));
    assert.ok(contractsModuleSource.includes('#rhDrawerBody .rh-contract-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));'));
    assert.ok(contractsModuleSource.includes('@media(max-width:640px)'));
    assert.ok(contractsModuleSource.includes('#rhDrawerBody .rh-contract-form-grid{grid-template-columns:minmax(0,1fr)}'));
});

test('customer, deposit, and contract screens expose linked amounts and cross-navigation', () => {
    assert.match(managerSource, /<th>Đặt cọc \/ Hợp đồng<\/th>/);
    assert.match(managerSource, /customerContract\.depositHeldAmount/);
    assert.match(depositsModuleSource, /RHUI\.openContractForDeposit\(item\.id\)/);
    assert.match(depositsModuleSource, /RHUI\.openDepositRecord = function \(depositId\)/);
    assert.match(contractsModuleSource, /RHLease\.createDeposit\(\{/);
    assert.match(contractsModuleSource, /RHLease\.createContractFromDeposit\(createdDeposit\.item\.id, data, actor\(\)\)/);
    assert.match(contractsModuleSource, /data-view-linked-deposit/);
});

test('contract form supports manual entry and optional drag-and-drop contract files', () => {
    assert.match(contractsModuleSource, /Bạn có thể lưu hợp đồng bằng thông tin đã nhập/);
    assert.match(contractsModuleSource, /data-contract-file-drop/);
    assert.match(contractsModuleSource, /data-contract-file-picker/);
    assert.match(contractsModuleSource, /fileZone\.addEventListener\('drop'/);
    assert.match(contractsModuleSource, /data-contract-remove-file/);
});

test('deposit drawer form has its own responsive layout styles', () => {
    assert.ok(depositsModuleSource.includes('#rhDrawerBody .rh-deposit-form{display:grid'));
    assert.ok(depositsModuleSource.includes('#rhDrawerBody .rh-deposit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
    assert.ok(depositsModuleSource.includes('#rhDrawerBody .rh-deposit-inline{display:flex;align-items:center'));
    assert.ok(depositsModuleSource.includes('@media(max-width:640px){#rhDrawerBody'));
    assert.ok(depositsModuleSource.includes('#rhDrawerBody .rh-deposit-grid{grid-template-columns:minmax(0,1fr);'));
});

test('bulk contract import downloads a template, validates preview rows, and supports both error modes', () => {
    assert.match(contractsModuleSource, /data-import-template/);
    assert.match(contractsModuleSource, /data-import-drop/);
    assert.match(contractsModuleSource, /RHExcelTools\.readSheet\(file\)/);
    assert.match(contractsModuleSource, /RHExcelTools\.writeExcelFile/);
    assert.match(contractsModuleSource, /Tiền thuê\/tháng \*/);
    assert.match(contractsModuleSource, /format: '@'/);
    assert.match(contractsModuleSource, /Dừng toàn bộ nếu có lỗi/);
    assert.match(contractsModuleSource, /Bỏ qua dòng lỗi, nhập các dòng hợp lệ/);
    assert.match(contractsModuleSource, /RHLease\.checkDepositAvailability/);
    assert.match(contractsModuleSource, /createContractFromDeposit\(deposit\.item\.id/);
    assert.match(dashboardSource, /<script src="dist\/excel-tools\.js"><\/script>/);
    assert.match(excelToolsSource, /read-excel-file\/browser/);
    assert.match(excelToolsSource, /write-excel-file\/browser/);
});

test('Excel workbook round-trip keeps apartment codes and phone numbers as text', async () => {
    const workbook = await writeExcelFile([
        ['Mã căn hộ', 'Số điện thoại'],
        [
            { value: '001', type: String, format: '@' },
            { value: '0123456789', type: String, format: '@' }
        ]
    ]).toBlob();
    const rows = await readExcelSheet(workbook);
    assert.equal(rows[1][0], '001');
    assert.equal(rows[1][1], '0123456789');
});

test('contract workflows keep settlement previews and meter history scoped', () => {
    assert.match(contractsModuleSource, /finalUtilityAmount: meterTotal\.amount/);
    assert.match(contractsModuleSource, /root\.addEventListener\('input', function \(event\) \{ if \(event\.target\.matches\('\[data-final-meter\]'\)\)/);
    assert.ok(contractsModuleSource.includes("!/đặt cọc|deposit/i.test((template.name || '') + ' ' + (template.category || ''))"));
    assert.match(contractsModuleSource, /if \(selectedIds\.indexOf\(service\.id\) === -1\) return;/);
    assert.match(meterServiceSource, /!assignment \|\| r\.meterCode === assignment\.meterCode/);
});

test('calculates deposit full amount and returns field-scoped validation errors', () => {
    const env = setup();
    assert.equal(env.RHLease.calculateDepositFull(2000000, 1), 2000000);
    assert.equal(env.RHLease.calculateDepositFull(2200000, 2), 4400000);
    const result = env.RHLease.validateDepositInput(depositInput(env, { depositReceivedAmount: 2500000 }));
    assert.equal(result.ok, false);
    assert.match(result.fieldErrors.depositReceivedAmount, /không được lớn hơn/);
});

test('deposit availability enforces existing holding reservation independent of date range', () => {
    const env = setup();
    const existing = env.RHLease.createDeposit(depositInput(env)).item;
    const result = env.RHLease.checkDepositAvailability({
        buildingId: env.building.id,
        apartmentId: env.apartment.id,
        startDate: '2027-11-01',
        endDate: '2028-10-31'
    });
    assert.equal(result.ok, false);
    assert.match(result.error, new RegExp(existing.code));
});

test('contract alert categories are exclusive and honor the requested priority', () => {
    const env = setup();
    const asOf = '2026-10-14';
    assert.equal(env.RHLease.contractAlertStatus({ status: 'liquidated', endDate: '2026-10-01' }, asOf, 30), 'liquidated');
    assert.equal(env.RHLease.contractAlertStatus({ status: 'forfeited', endDate: '2026-10-01' }, asOf, 30), 'deposit');
    assert.equal(env.RHLease.contractAlertStatus({ status: 'active', endDate: '2026-10-13', expectedMoveOutDate: '2026-10-20' }, asOf, 30), 'overdue');
    assert.equal(env.RHLease.contractAlertStatus({ status: 'active', endDate: '2026-11-01', expectedMoveOutDate: '2026-10-20' }, asOf, 30), 'moving');
    assert.equal(env.RHLease.contractAlertStatus({ status: 'active', endDate: '2026-11-01', expectedMoveOutDate: '2026-10-01' }, asOf, 30), 'moving');
    assert.equal(env.RHLease.contractAlertStatus({ status: 'active', endDate: '2026-10-30' }, asOf, 30), 'expiring');
    assert.equal(env.RHLease.contractAlertStatus({ status: 'active', endDate: '2027-02-01' }, asOf, 30), 'renting');
});

test('14 October 2026 acceptance status: expired CT1-502-2025-002 is overdue and preserves move-out notice', () => {
    const env = setup();
    const contract = env.RHD.create('contracts', {
        id: 'contract-expired-502', code: 'CT1-502-2025-002', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, tenantIds: [env.customer.id], startDate: '2025-01-01', endDate: '2025-12-31', status: 'active'
    }).item;
    const asOf = '2026-10-14';
    assert.equal(env.RHLease.contractAlertStatus(contract, asOf, 30), 'overdue');

    const registered = env.RHLease.registerMoveOut(contract.id, '2025-12-30', { actorName: 'Quản lý' });
    assert.equal(registered.ok, true);
    assert.equal(registered.item.expectedMoveOutDate, '2025-12-30');
    assert.equal(env.RHLease.contractAlertStatus(registered.item, asOf, 30), 'overdue');
});

test('customer Nguyễn Thị Hoa residence resolves to building CT1 and apartment 501', () => {
    const env = setup();
    env.RHD.create('contracts', {
        id: 'contract-hoa-501', code: 'CT1-501-2026-001', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, tenantIds: [env.customer.id], startDate: '2026-10-01', endDate: '2027-09-30', status: 'active'
    });
    const residence = env.RHLease.currentResidence(env.customer.id, '2026-10-14');
    assert.equal(env.customer.fullName, 'Nguyễn Thị Hoa');
    assert.equal(residence.contract.code, 'CT1-501-2026-001');
    assert.equal(residence.buildingId, env.building.id);
    assert.equal(residence.apartmentId, env.apartment.id);
    assert.equal(env.RHD.get('apartments', residence.apartmentId).name, '501');
});

test('renewal, transfer, assignment, and move-out actions retain a dated contract history', () => {
    const env = setup();
    const otherCustomer = env.RHD.create('customers', { id: 'customer-action-2', fullName: 'Lê Minh Đức' }).item;
    const otherApartment = env.RHD.create('apartments', { id: 'apartment-503', buildingId: env.building.id, name: '503', rentPrice: 1800000, status: 'occupied' }).item;
    const contract = env.RHD.create('contracts', {
        id: 'contract-actions', code: 'CT1-501-2026-001', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, tenantIds: [env.customer.id], startDate: '2026-01-01', endDate: '2026-12-31', rentPrice: 2000000, status: 'active'
    }).item;
    env.RHD.create('contracts', {
        id: 'contract-other-apartment', code: 'CT1-503-2026-001', buildingId: env.building.id, apartmentId: otherApartment.id,
        customerId: otherCustomer.id, tenantIds: [otherCustomer.id], startDate: '2026-01-01', endDate: '2026-05-31', status: 'active'
    });
    const renewed = env.RHLease.renewContract(contract.id, { extensionMonths: 6, rentPrice: 2100000 }, { actorName: 'Quản lý' });
    assert.equal(renewed.ok, true);
    assert.equal(renewed.item.startDate, '2026-01-01');
    assert.equal(renewed.item.endDate, '2027-06-30');
    assert.equal(renewed.item.history.at(-1).type, 'renewed');
    const moved = env.RHLease.transferContract(contract.id, { buildingId: env.building.id, apartmentId: otherApartment.id, transferDate: '2026-06-01' }, { actorName: 'Quản lý' });
    assert.equal(moved.ok, true);
    assert.equal(moved.item.history.at(-1).from.apartmentId, env.apartment.id);
    assert.equal(moved.item.history.at(-1).to.apartmentId, otherApartment.id);
    const assigned = env.RHLease.assignContract(contract.id, [otherCustomer.id], { actorName: 'Quản lý', assignmentDate: '2026-06-02' });
    assert.equal(assigned.ok, true);
    assert.equal(assigned.item.history.at(-1).type, 'assigned');
    const moveOut = env.RHLease.registerMoveOut(contract.id, '2026-12-01', { actorName: 'Quản lý' });
    assert.equal(moveOut.ok, true);
    assert.equal(moveOut.item.expectedMoveOutDate, '2026-12-01');
    assert.equal(moveOut.item.history.at(-1).type, 'move_out_registered');
});

test('liquidation stores final meter as unapproved and waits for normal meter approval', () => {
    const env = setup();
    const building = env.RHD.get('buildings', env.building.id);
    building.services.push({ id: 'electricity', name: 'Điện', feeType: 'electricity', calcMethod: 'meter', unitPrice: 5000, taxRate: 0 });
    env.RHD.update('buildings', building.id, { services: building.services });
    const contract = env.RHD.create('contracts', {
        id: 'contract-meter-final', code: 'CT1-501-2026-001', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, tenantIds: [env.customer.id], startDate: '2026-01-01', endDate: '2026-12-31',
        rentPrice: 2000000, depositPrice: 2000000, depositHeldAmount: 2000000, status: 'active', serviceIds: ['electricity'],
        meterAssignments: [{ meterType: 'electricity', meterCode: 'CTD-501', initialIndex: 100 }]
    }).item;
    const request = { customerAbandoned: false, invoiceDebt: 0, overpayment: 0, penalties: 0, usedRent: 0, finalMeterPeriod: '2026-10', finalMeterClosingDate: '2026-10-14', finalReadings: [{ meterType: 'electricity', meterCode: 'CTD-501', latestIndex: 130 }] };
    const waiting = env.RHLease.settleContract(contract.id, request, { actorName: 'Quản lý' });
    assert.equal(waiting.ok, false);
    assert.equal(waiting.pendingApproval, true);
    assert.equal(env.RHD.get('contracts', contract.id).status, 'active');
    const meter = env.RHD.list('meters')[0];
    assert.equal(meter.approvalStatus, 'chưa_duyệt');
    const preview = env.RHLease.calculateFinalMeterAmount(contract.id, '2026-10', [{ meterType: 'electricity', meterCode: 'CTD-501', latestIndex: 130 }]);
    assert.equal(preview.amount, 150000);
    assert.equal(preview.waitingApproval, true);
    env.RHD.update('meters', meter.id, { approvalStatus: 'đã_duyệt', approvedAt: Date.now(), approvedBy: 'Duyệt' });
    const completed = env.RHLease.settleContract(contract.id, request, { actorName: 'Quản lý' });
    assert.equal(completed.ok, true);
    assert.equal(completed.item.status, 'liquidated');
    assert.equal(completed.item.settlement.finalUtilityAmount, 150000);
    assert.equal(completed.item.settlement.refundAmount, 1850000);
});

test('liquidation rolls outstanding debt into one issued settlement invoice', () => {
    const env = setup();
    const contract = env.RHD.create('contracts', {
        id: 'contract-settlement-invoice', code: 'CT1-501-2026-001', buildingId: env.building.id, apartmentId: env.apartment.id,
        customerId: env.customer.id, tenantIds: [env.customer.id], startDate: '2026-01-01', endDate: '2026-12-31',
        rentPrice: 2000000, depositPrice: 0, depositHeldAmount: 0, status: 'active'
    }).item;
    const debt = env.RHD.create('invoices', { id: 'invoice-unpaid', code: 'HD2026-0001', contractId: contract.id, buildingId: contract.buildingId, apartmentId: contract.apartmentId, customerId: contract.customerId, status: 'unpaid', total: 500000, items: [] }).item;
    const result = env.RHLease.settleContract(contract.id, { invoiceDebt: 500000, penalties: 0, usedRent: 0, createInvoice: true }, { actorName: 'Quản lý' });
    assert.equal(result.ok, true);
    assert.equal(result.invoice.type, 'liquidation');
    assert.equal(result.invoice.status, 'unpaid');
    assert.equal(result.invoice.total, 500000);
    assert.equal(env.RHD.get('invoices', debt.id).status, 'cancelled');
    assert.equal(result.item.status, 'liquidated');
});

test('contract meter utilities require an existing apartment meter and initial index', () => {
    const env = setup();
    const building = env.RHD.get('buildings', env.building.id);
    building.services.push({ id: 'electric-meter-service', name: 'Điện', feeType: 'electricity', calcMethod: 'meter', unitPrice: 5000, taxRate: 0 });
    env.RHD.update('buildings', building.id, { services: building.services });
    const meter = env.RHD.create('meters', { id: 'meter-electric', buildingId: building.id, apartmentId: env.apartment.id, meterType: 'electricity', meterCode: 'CTD-501', periodMonth: '2026-09', previousIndex: 50, latestIndex: 60, approvalStatus: 'đã_duyệt' }).item;
    const contractData = { buildingId: building.id, apartmentId: env.apartment.id, customerId: env.customer.id, tenantIds: [env.customer.id], serviceIds: ['electric-meter-service'], startDate: '2026-10-01', endDate: '2027-09-30' };
    const missing = env.RHLease.validateContractInput(contractData);
    assert.equal(missing.ok, false);
    assert.ok(missing.fieldErrors.meterAssignments);
    const valid = env.RHLease.validateContractInput(Object.assign({}, contractData, { meterAssignments: [{ meterType: 'electricity', meterCode: meter.meterCode, initialIndex: 60 }] }));
    assert.equal(valid.ok, true);
    const blankInitialIndex = env.RHLease.validateContractInput(Object.assign({}, contractData, { meterAssignments: [{ meterType: 'electricity', meterCode: meter.meterCode, initialIndex: '' }] }));
    assert.equal(blankInitialIndex.ok, false);
    assert.ok(blankInitialIndex.fieldErrors.meterAssignments);
});

test('monthly billing reads the meter assigned to the contract', () => {
    const env = setup();
    const building = env.RHD.get('buildings', env.building.id);
    building.services.push({ id: 'electric-meter-service', name: 'Điện', feeType: 'electricity', calcMethod: 'meter', unitPrice: 5000, taxRate: 0 });
    env.RHD.update('buildings', building.id, { services: building.services });
    const contract = {
        id: 'contract-meter-choice', buildingId: building.id, apartmentId: env.apartment.id, customerId: env.customer.id,
        startDate: '2026-01-01', endDate: '2027-12-31', rentPrice: 2000000, paymentCycle: 'monthly',
        serviceIds: ['electric-meter-service'], meterAssignments: [{ meterType: 'electricity', meterCode: 'CTD-501', initialIndex: 50 }]
    };
    env.RHD.create('meters', { id: 'assigned-meter', buildingId: building.id, apartmentId: env.apartment.id, meterType: 'electricity', meterCode: 'CTD-501', periodMonth: '2026-10', readingPeriod: '2026-10', previousIndex: 50, latestIndex: 80, status: undefined, approvalStatus: 'đã_duyệt' });
    env.RHD.create('meters', { id: 'other-meter', buildingId: building.id, apartmentId: env.apartment.id, meterType: 'electricity', meterCode: 'CTD-OTHER', periodMonth: '2026-10', readingPeriod: '2026-10', previousIndex: 10, latestIndex: 1000, status: undefined, approvalStatus: 'đã_duyệt' });
    const monthly = env.RHB.computeMonthly(contract, '2026-10');
    const meterLine = monthly.items.find(item => item.serviceId === 'electric-meter-service');
    assert.equal(meterLine.qty, 30);
    assert.equal(meterLine.meterId, 'assigned-meter');
});

test('monthly billing honors rent start date and contract discount months', () => {
    const env = setup();
    const contract = {
        id: 'contract-discount', buildingId: env.building.id, apartmentId: env.apartment.id, customerId: env.customer.id,
        startDate: '2026-01-01', rentStartDate: '2026-02-15', endDate: '2026-12-31', rentPrice: 2000000,
        paymentCycle: 'monthly', discountMonths: 2, discountAmountPerMonth: 200000
    };
    const january = env.RHB.computeMonthly(contract, '2026-01');
    const february = env.RHB.computeMonthly(contract, '2026-02');
    const march = env.RHB.computeMonthly(contract, '2026-03');
    assert.equal(january, null);
    assert.equal(february.total, 900000);
    assert.equal(march.total, 1800000);
    assert.equal(march.items.find(item => item.kind === 'discount').amount, -200000);
});