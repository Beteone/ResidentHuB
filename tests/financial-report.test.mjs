import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

globalThis.window = globalThis;
const today = new Date().toISOString().slice(0, 10);
const stores = {
    buildings: [{ id: 'b1', name: 'Building A' }, { id: 'b2', name: 'Building B' }],
    apartments: [{ id: 'a1', buildingId: 'b1', name: '101' }, { id: 'a2', buildingId: 'b2', name: '202' }],
    customers: [{ id: 'c1', fullName: 'Resident A' }, { id: 'c2', fullName: 'Resident B' }],
    cashflows: [
        { id: 'r1', code: 'PT1', date: today, buildingId: 'b1', apartmentId: 'a1', type: 'income', amount: 1000000, category: 'Rent', reference: 'HD1' },
        { id: 'r2', code: 'PC1', date: today, buildingId: 'b1', apartmentId: 'a1', type: 'expense', amount: 250000, category: 'Maintenance' },
        { id: 'r3', code: 'PENDING', date: today, buildingId: 'b1', type: 'income', amount: 99000, status: 'pending' },
        { id: 'r4', code: 'CANCEL', date: today, buildingId: 'b1', type: 'expense', amount: 100000, status: 'cancelled' },
        { id: 'r5', code: 'PT2', date: today, buildingId: 'b2', apartmentId: 'a2', type: 'income', amount: 400000, category: 'Rent', reference: 'HD3' }
    ],
    invoices: [
        { id: 'i1', code: 'HD1', buildingId: 'b1', apartmentId: 'a1', customerId: 'c1', issueDate: today, dueDate: today, status: 'unpaid', total: 1500000 },
        { id: 'i2', code: 'HD2', buildingId: 'b1', apartmentId: 'a1', customerId: 'c1', issueDate: today, dueDate: today, status: 'paid', total: 1200000 },
        { id: 'i3', code: 'HD3', buildingId: 'b2', apartmentId: 'a2', customerId: 'c2', issueDate: today, dueDate: today, status: 'unpaid', total: 1000000 }
    ],
    contracts: [],
    deposits: [
        { id: 'd1', code: 'DC1', buildingId: 'b1', apartmentId: 'a1', tenantIds: ['c1'], depositDate: today, status: 'holding', depositFullAmount: 500000, depositReceivedAmount: 400000 },
        { id: 'd2', code: 'DC2', buildingId: 'b2', apartmentId: 'a2', tenantIds: ['c2'], depositDate: today, status: 'holding', depositFullAmount: 800000, depositReceivedAmount: 800000 }
    ],
    depositTransactions: [
        { id: 'dt1', depositId: 'd1', type: 'receive', label: 'Receive deposit', date: today, amount: 400000 },
        { id: 'dt2', depositId: 'd2', type: 'receive', label: 'Receive deposit', date: today, amount: 800000 }
    ]
};

globalThis.RHD = {
    list: (entity) => stores[entity] || [],
    get: (entity, id) => (stores[entity] || []).find((record) => record.id === id) || null,
    isIssuedInvoice: (invoice) => ['unpaid', 'sent', 'paid', 'overdue'].includes(invoice.status)
};
globalThis.RHP = { scopeList: (_entity, records) => records };
globalThis.RH = { getSession: () => ({ id: 'test-user' }) };
globalThis.Chart = undefined;

const elements = new Map();
let reportMounted = true;
let dataChangedListener;
const root = {
    style: { display: 'block' },
    _html: '',
    set innerHTML(value) { this._html = value; elements.clear(); },
    get innerHTML() { return this._html; }
};
globalThis.document = {
    head: { appendChild() {} },
    createElement: () => ({}),
    getElementById(id) {
        if (id === 'reports-tab') return reportMounted ? root : null;
        if (!elements.has(id)) {
            elements.set(id, {
                value: '',
                listeners: {},
                parentElement: { innerHTML: '' },
                addEventListener(type, listener) { this.listeners[type] = listener; },
                focus() {},
                setSelectionRange() {}
            });
        }
        return elements.get(id);
    }
};
globalThis.addEventListener = (event, listener) => {
    if (event === 'residenthub:business-data-changed') dataChangedListener = listener;
};

vm.runInThisContext(readFileSync(new URL('../financial-report.js', import.meta.url), 'utf8'));
function kpis() {
    return Array.from(root.innerHTML.matchAll(/class="fr-kpi-value">([^<]+)</g), (match) => Number(match[1].replace(/\D/g, '')));
}

RHFinancialReport.render();
assert.deepEqual(kpis().slice(0, 5), [1400000, 250000, 1150000, 1100000, 1200000]);

const buildingFilter = document.getElementById('frBuilding');
buildingFilter.value = 'b2';
buildingFilter.listeners.change.call(buildingFilter);
assert.deepEqual(kpis().slice(0, 5), [400000, 0, 400000, 600000, 800000]);

const typeFilter = document.getElementById('frType');
typeFilter.value = 'deposit';
typeFilter.listeners.change.call(typeFilter);
assert.deepEqual(kpis().slice(0, 5), [0, 0, 0, 600000, 800000]);
assert.match(root.innerHTML, /DC2/);

reportMounted = false;
assert.doesNotThrow(() => dataChangedListener({ detail: { mode: 'live' } }), 'Data events are safe before the report tab is mounted');

reportMounted = true;
for (const entity of ['cashflows', 'invoices', 'deposits', 'depositTransactions']) stores[entity] = [];
RHFinancialReport.clearFilters();
assert.doesNotMatch(root.innerHTML, /DỮ LIỆU MINH HỌA — KHÔNG PHẢI SỐ LIỆU THẬT/, 'The report page does not show the removed illustrative-data notice');
assert.deepEqual(kpis().slice(0, 5), [2800000, 470000, 2330000, 2100000, 2000000]);
assert.match(root.innerHTML, /PT-MH-001/);
assert.equal(stores.cashflows.length, 0, 'Illustrative report entries are never persisted to the real ledger');
assert.equal(stores.invoices.length, 0, 'Illustrative invoices are never persisted to business data');

stores.invoices = [{ id: 'old-invoice', buildingId: 'b1', issueDate: '2020-01-01', status: 'unpaid', total: 1000 }];
RHFinancialReport.clearFilters();
assert.doesNotMatch(root.innerHTML, /DỮ LIỆU MINH HỌA — KHÔNG PHẢI SỐ LIỆU THẬT/);
assert.match(root.innerHTML, /PT-MH-001/, 'An empty selected period still gets illustrative report data');
assert.equal(stores.invoices.length, 1, 'Showing an illustrative preview preserves existing out-of-period invoices');
assert.equal(stores.invoices[0].id, 'old-invoice');

console.log('Financial report calculations and filters passed.');
