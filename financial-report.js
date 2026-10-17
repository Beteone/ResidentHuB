(function (global) {
    'use strict';

    var state = {
        period: 'month',
        from: '',
        to: '',
        building: '',
        status: 'all',
        type: 'all',
        category: '',
        paymentMethod: '',
        search: '',
        section: 'transactions',
        page: 1,
        pageSize: 10,
        sort: 'date',
        direction: 'desc'
    };
    var charts = {};
    var lastData = null;
    var moneyFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }
    function money(value) { return moneyFormat.format(Number(value) || 0) + ' ₫'; }
    function iso(date) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    function dateLabel(value) {
        if (!value) return '—';
        var date = new Date(String(value).slice(0, 10) + 'T00:00:00');
        return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('vi-VN');
    }
    function amount(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
    function statusLabel(value) {
        return ({
            paid: 'Đã thanh toán', unpaid: 'Chưa thanh toán', sent: 'Chưa thanh toán',
            partial: 'Thanh toán một phần', partially_paid: 'Thanh toán một phần',
            overdue: 'Quá hạn', payment_pending: 'Chờ xác nhận', cancelled: 'Đã hủy',
            refunded: 'Đã hoàn tiền', confirmed: 'Đã xác nhận', pending: 'Chờ xác nhận',
            income: 'Đã ghi nhận', expense: 'Đã ghi nhận'
        })[value] || value || 'Đã ghi nhận';
    }
    function range() {
        var now = new Date();
        var today = iso(now);
        var first = new Date(now.getFullYear(), now.getMonth(), 1);
        var previousFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        var start;
        var end = today;
        if (state.period === 'today') start = today;
        else if (state.period === '7days') { var week = new Date(now); week.setDate(week.getDate() - 6); start = iso(week); }
        else if (state.period === 'lastMonth') { start = iso(previousFirst); end = iso(new Date(now.getFullYear(), now.getMonth(), 0)); }
        else if (state.period === 'quarter') start = iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
        else if (state.period === 'year') start = now.getFullYear() + '-01-01';
        else if (state.period === 'custom') { start = state.from || iso(first); end = state.to || today; }
        else { start = iso(first); end = today; }
        return { from: start, to: end };
    }
    function scoped(entity) {
        var rows = RHD.list(entity);
        return global.RHP ? global.RHP.scopeList(entity, rows) : rows;
    }
    function recordBuilding(row) {
        if (row.buildingId) return row.buildingId;
        if (row.apartmentId) return (RHD.get('apartments', row.apartmentId) || {}).buildingId || '';
        return '';
    }
    function collect() {
        var dates = range();
        var buildings = scoped('buildings');
        var buildingIds = buildings.map(function (b) { return b.id; });
        var cashflows = RHD.list('cashflows').filter(function (row) {
            return buildingIds.indexOf(recordBuilding(row)) !== -1;
        });
        var invoices = scoped('invoices');
        var contracts = scoped('contracts');
        var deposits = scoped('deposits');
        var customers = scoped('customers');
        var apartments = scoped('apartments');
        var transactions = RHD.list('depositTransactions');
        function inSelectedRange(value) {
            var day = String(value || '').slice(0, 10);
            return day >= dates.from && day <= dates.to;
        }
        var hasActivityInPeriod = cashflows.some(function (row) { return inSelectedRange(row.date); }) ||
            invoices.some(function (row) { return inSelectedRange(row.issueDate || (row.period ? row.period + '-01' : '')); }) ||
            deposits.some(function (row) { return inSelectedRange(row.depositDate); }) ||
            transactions.some(function (row) {
                return inSelectedRange(row.date) && deposits.some(function (deposit) { return deposit.id === row.depositId; });
            });
        var illustrative = !hasActivityInPeriod;
        if (illustrative) {
            var sampleBuilding = buildings.filter(function (building) { return building.id === state.building; })[0] || buildings[0] || { id: 'fr-sample-building', name: 'Tòa nhà minh họa' };
            var sampleApartment = { id: 'fr-sample-apartment', buildingId: sampleBuilding.id, name: 'A-101' };
            var sampleCustomer = { id: 'fr-sample-customer', fullName: 'Cư dân minh họa' };
            var sampleContract = { id: 'fr-sample-contract', code: 'HD-MH-2026-001' };
            var sampleDate = function (daysAgo) {
                var endDate = new Date(dates.to + 'T00:00:00');
                var startDate = new Date(dates.from + 'T00:00:00');
                if (isNaN(endDate.getTime())) endDate = new Date();
                if (isNaN(startDate.getTime())) startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
                endDate.setDate(endDate.getDate() - daysAgo);
                return iso(endDate < startDate ? startDate : endDate);
            };
            var sampleDueDate = new Date(dates.to + 'T00:00:00');
            if (isNaN(sampleDueDate.getTime())) sampleDueDate = new Date();
            sampleDueDate.setDate(sampleDueDate.getDate() + 7);
            buildings = buildings.length ? buildings : [sampleBuilding];
            apartments = apartments.concat([sampleApartment]);
            customers = customers.concat([sampleCustomer]);
            contracts = contracts.concat([sampleContract]);
            cashflows = [
                { id: 'fr-sample-income-1', code: 'PT-MH-001', date: sampleDate(1), buildingId: sampleBuilding.id, apartmentId: sampleApartment.id, type: 'income', amount: 2400000, category: 'Tiền thuê và dịch vụ', reference: 'HD-MH-001', personName: sampleCustomer.fullName, paymentMethod: 'Chuyển khoản', status: 'confirmed' },
                { id: 'fr-sample-income-2', code: 'PT-MH-002', date: sampleDate(3), buildingId: sampleBuilding.id, apartmentId: sampleApartment.id, type: 'income', amount: 400000, category: 'Tiền thuê và dịch vụ', reference: 'HD-MH-003', personName: sampleCustomer.fullName, paymentMethod: 'Chuyển khoản', status: 'confirmed' },
                { id: 'fr-sample-expense-1', code: 'PC-MH-001', date: sampleDate(2), buildingId: sampleBuilding.id, apartmentId: sampleApartment.id, type: 'expense', amount: 350000, category: 'Bảo trì', description: 'Bảo trì khu vực chung', paymentMethod: 'Tiền mặt', status: 'confirmed' },
                { id: 'fr-sample-expense-2', code: 'PC-MH-002', date: sampleDate(4), buildingId: sampleBuilding.id, apartmentId: sampleApartment.id, type: 'expense', amount: 120000, category: 'Vệ sinh', description: 'Vệ sinh khu vực chung', paymentMethod: 'Tiền mặt', status: 'confirmed' }
            ];
            invoices = invoices.concat([
                { id: 'fr-sample-invoice-1', code: 'HD-MH-001', contractId: sampleContract.id, buildingId: sampleBuilding.id, apartmentId: sampleApartment.id, customerId: sampleCustomer.id, issueDate: sampleDate(1), dueDate: sampleDate(1), status: 'paid', total: 2400000 },
                { id: 'fr-sample-invoice-2', code: 'HD-MH-002', contractId: sampleContract.id, buildingId: sampleBuilding.id, apartmentId: sampleApartment.id, customerId: sampleCustomer.id, issueDate: sampleDate(2), dueDate: iso(sampleDueDate), status: 'unpaid', total: 1500000 },
                { id: 'fr-sample-invoice-3', code: 'HD-MH-003', contractId: sampleContract.id, buildingId: sampleBuilding.id, apartmentId: sampleApartment.id, customerId: sampleCustomer.id, issueDate: sampleDate(3), dueDate: sampleDate(3), status: 'unpaid', total: 1000000, paidAmount: 400000 }
            ]);
            var sampleDeposit = { id: 'fr-sample-deposit', code: 'DC-MH-001', buildingId: sampleBuilding.id, apartmentId: sampleApartment.id, tenantIds: [sampleCustomer.id], depositDate: sampleDate(2), status: 'holding', depositFullAmount: 2000000, depositReceivedAmount: 2000000 };
            deposits = deposits.concat([sampleDeposit]);
            transactions = transactions.concat([
                { id: 'fr-sample-deposit-tx', code: 'GD-MH-001', depositId: sampleDeposit.id, type: 'receive', label: 'Nhận đặt cọc', date: sampleDate(2), amount: 2000000, status: 'confirmed' }
            ]);
        }
        var buildingMap = {};
        var apartmentMap = {};
        var customerMap = {};
        var depositMap = {};
        buildings.forEach(function (row) { buildingMap[row.id] = row; });
        apartments.forEach(function (row) { apartmentMap[row.id] = row; });
        customers.forEach(function (row) { customerMap[row.id] = row; });
        deposits.forEach(function (row) { depositMap[row.id] = row; });
        function dateIn(value) { var day = String(value || '').slice(0, 10); return day >= dates.from && day <= dates.to; }
        function matchesBuilding(row) { return !state.building || recordBuilding(row) === state.building; }
        var filteredCashflows = cashflows.filter(function (row) {
            if (!dateIn(row.date) || !matchesBuilding(row)) return false;
            if (state.type === 'income' && row.type !== 'income') return false;
            if (state.type === 'expense' && row.type !== 'expense') return false;
            if (state.type === 'deposit' || state.type === 'refund') return false;
            if (state.status !== 'all' && String(row.status || 'confirmed') !== state.status) return false;
            if (state.category && row.category !== state.category) return false;
            if (state.paymentMethod && (row.paymentMethod || row.accountName || '') !== state.paymentMethod) return false;
            var apartment = apartmentMap[row.apartmentId] || {};
            var linkedInvoice = invoices.filter(function (invoice) {
                var reference = String(row.reference || '');
                return (invoice.code && reference.indexOf(invoice.code) !== -1) || (invoice.id && reference.indexOf(invoice.id) !== -1);
            })[0] || {};
            var linkedContract = contracts.filter(function (contract) { return contract.id === linkedInvoice.contractId; })[0] || {};
            var linkedCustomer = customerMap[linkedInvoice.customerId] || {};
            var searchText = [row.code, row.category, row.description, row.reference, row.personName, row.paymentMethod,
                row.accountName, (buildingMap[recordBuilding(row)] || {}).name, apartment.name, apartment.code,
                linkedInvoice.code, linkedContract.code, linkedCustomer.fullName].join(' ').toLocaleLowerCase();
            return !state.search || searchText.indexOf(state.search.toLocaleLowerCase()) !== -1;
        }).map(function (row) {
            var building = buildingMap[recordBuilding(row)] || {};
            var apartment = apartmentMap[row.apartmentId] || {};
            var relatedInvoice = invoices.filter(function (invoice) {
                var reference = String(row.reference || '');
                return (invoice.code && reference.indexOf(invoice.code) !== -1) || (invoice.id && reference.indexOf(invoice.id) !== -1);
            })[0] || {};
            return {
                id: row.id, code: row.code || row.id, date: row.date || '', buildingId: recordBuilding(row),
                building: building.name || building.shortName || '—', apartment: apartment.name || apartment.code || '—',
                party: row.personName || '—', type: row.type === 'income' ? 'Thu' : 'Chi',
                category: row.category || 'Khác', reference: row.reference || '', invoiceId: relatedInvoice.id || '',
                contractId: relatedInvoice.contractId || '',
                value: amount(row.amount), method: row.paymentMethod || row.accountName || '—',
                status: statusLabel(row.status || 'confirmed'), actor: row.actorName || row.createdByName || '—',
                rawStatus: row.status || 'confirmed', source: row, kind: row.type === 'income' ? 'income' : 'expense'
            };
        });
        var filteredDepositTransactions = transactions.filter(function (row) {
            var deposit = depositMap[row.depositId];
            if (!deposit || !dateIn(row.date) || !matchesBuilding(deposit)) return false;
            if (state.type === 'deposit' && row.type !== 'receive' && row.type !== 'transfer' && row.type !== 'deduction') return false;
            if (state.type === 'refund' && row.type !== 'refund') return false;
            if (state.type !== 'all' && state.type !== 'deposit' && state.type !== 'refund') return false;
            if (state.status !== 'all' && state.status !== String(row.status || 'confirmed')) return false;
            if (state.category && state.category !== (row.label || row.type)) return false;
            if (state.paymentMethod) return false;
            var apartment = apartmentMap[deposit.apartmentId] || {};
            var tenants = (deposit.tenantIds || [deposit.customerId]).map(function (id) { return (customerMap[id] || {}).fullName; }).filter(Boolean).join(' ');
            var searchText = [row.code, row.label, row.note, deposit.code, tenants, apartment.name].join(' ').toLocaleLowerCase();
            return !state.search || searchText.indexOf(state.search.toLocaleLowerCase()) !== -1;
        }).map(function (row) {
            var deposit = depositMap[row.depositId];
            var apartment = apartmentMap[deposit.apartmentId] || {};
            var tenant = (deposit.tenantIds || [deposit.customerId]).map(function (id) { return (customerMap[id] || {}).fullName; }).filter(Boolean).join(', ') || '—';
            var kind = row.type === 'refund' ? 'refund' : 'deposit';
            return {
                id: row.id, code: row.code || deposit.code || row.id, date: row.date || '', buildingId: deposit.buildingId,
                building: (buildingMap[deposit.buildingId] || {}).name || '—', apartment: apartment.name || apartment.code || '—',
                party: tenant, type: row.label || (kind === 'refund' ? 'Hoàn cọc' : 'Đặt cọc'),
                category: row.label || 'Đặt cọc', reference: deposit.code || '', contractId: deposit.contractId || '',
                apartmentId: deposit.apartmentId || '',
                value: amount(row.amount), method: '—', status: statusLabel(row.status || 'confirmed'),
                rawStatus: row.status || 'confirmed', source: row, kind: kind
            };
        });
        var reportTransactions = filteredCashflows.concat(filteredDepositTransactions).sort(function (a, b) {
            return String(b.date).localeCompare(String(a.date));
        });
        var invoicesInPeriod = invoices.filter(function (inv) {
            return matchesBuilding(inv) && dateIn(inv.issueDate || (inv.period ? inv.period + '-01' : ''));
        });
        var currentInvoices = invoicesInPeriod.filter(function (inv) {
            return RHD.isIssuedInvoice(inv) && inv.status !== 'cancelled';
        });
        function linkedPayments(inv) {
            var identifier = String(inv.code || inv.id || '');
            if (!identifier) return 0;
            return cashflows.filter(function (row) {
                return row.type === 'income' && ['cancelled', 'refunded', 'pending', 'unconfirmed'].indexOf(row.status) === -1 &&
                    String(row.reference || '').indexOf(identifier) !== -1;
            }).reduce(function (sum, row) { return sum + amount(row.amount); }, 0);
        }
        var debtRows = currentInvoices.filter(function (inv) {
            if (inv.status === 'paid') return false;
            var paid = Math.min(amount(inv.total), Math.max(amount(inv.paidAmount || inv.amountPaid), linkedPayments(inv)));
            var partiallyPaid = paid > 0 && paid < amount(inv.total);
            var isOverdue = inv.status === 'overdue' || (!!inv.dueDate && inv.dueDate < iso(new Date()));
            if (state.status === 'overdue' && !isOverdue) return false;
            if (state.status === 'unpaid' && (partiallyPaid || (inv.status !== 'unpaid' && inv.status !== 'sent'))) return false;
            if (state.status === 'partial' && !partiallyPaid && inv.status !== 'partial' && inv.status !== 'partially_paid') return false;
            if (state.status !== 'all' && ['overdue', 'unpaid', 'partial', 'partially_paid', 'paid'].indexOf(state.status) === -1) return false;
            return Math.max(0, amount(inv.total) - paid) > 0;
        }).map(function (inv) {
            var apartment = apartmentMap[inv.apartmentId] || {};
            var customer = customerMap[inv.customerId] || {};
            var paid = Math.min(amount(inv.total), Math.max(amount(inv.paidAmount || inv.amountPaid), linkedPayments(inv)));
            var remaining = Math.max(0, amount(inv.total) - paid);
            var overdueDays = inv.dueDate && inv.dueDate < iso(new Date()) ? Math.floor((new Date(iso(new Date()) + 'T00:00:00') - new Date(inv.dueDate + 'T00:00:00')) / 86400000) : 0;
            return { invoice: inv, apartment: apartment, customer: customer, remaining: remaining, paid: paid, overdueDays: overdueDays, displayStatus: overdueDays > 0 ? 'overdue' : inv.status };
        });
        var invoiceStatusSummary = { paid: { amount: 0, count: 0 }, unpaid: { amount: 0, count: 0 }, partial: { amount: 0, count: 0 }, overdue: { amount: 0, count: 0 } };
        currentInvoices.forEach(function (inv) {
            var paid = Math.min(amount(inv.total), Math.max(amount(inv.paidAmount || inv.amountPaid), linkedPayments(inv)));
            var outstanding = Math.max(0, amount(inv.total) - paid);
            var overdue = inv.status === 'overdue' || (!!inv.dueDate && inv.dueDate < iso(new Date()));
            var key = inv.status === 'paid' ? 'paid' : (overdue ? 'overdue' : (paid > 0 ? 'partial' : 'unpaid'));
            if (state.status !== 'all' && key !== ({ paid: 'paid', unpaid: 'unpaid', partial: 'partial', overdue: 'overdue' })[state.status]) return;
            invoiceStatusSummary[key].count += 1;
            invoiceStatusSummary[key].amount += key === 'paid' ? amount(inv.total) : outstanding;
        });
        var heldDeposits = deposits.filter(function (item) {
            return !item.isDeleted && item.status === 'holding' && matchesBuilding(item) && dateIn(item.depositDate);
        }).map(function (item) {
            var history = transactions.filter(function (tx) { return tx.depositId === item.id; });
            var refunded = history.filter(function (tx) { return tx.type === 'refund'; }).reduce(function (sum, tx) { return sum + amount(tx.amount); }, 0);
            var deducted = history.filter(function (tx) { return tx.type === 'deduction'; }).reduce(function (sum, tx) { return sum + amount(tx.amount); }, 0);
            var tenantIds = item.tenantIds || [item.customerId];
            var apartment = apartmentMap[item.apartmentId] || {};
            return {
                deposit: item, apartment: apartment,
                residents: tenantIds.map(function (id) { return (customerMap[id] || {}).fullName; }).filter(Boolean).join(', ') || '—',
                contract: contracts.filter(function (c) { return c.id === item.contractId; })[0] || {},
                received: amount(item.depositReceivedAmount), refunded: refunded, deducted: deducted,
                held: Math.max(0, amount(item.depositReceivedAmount) - refunded - deducted)
            };
        });
        var revenue = filteredCashflows.filter(function (row) { return row.kind === 'income' && ['cancelled', 'refunded', 'pending', 'unconfirmed'].indexOf(row.rawStatus) === -1; }).reduce(function (sum, row) { return sum + row.value; }, 0);
        var expense = filteredCashflows.filter(function (row) { return row.kind === 'expense' && ['cancelled', 'pending', 'unconfirmed'].indexOf(row.rawStatus) === -1; }).reduce(function (sum, row) { return sum + row.value; }, 0);
        var debtTotal = debtRows.reduce(function (sum, row) { return sum + row.remaining; }, 0);
        var heldTotal = heldDeposits.reduce(function (sum, row) { return sum + row.held; }, 0);
        var categories = [];
        reportTransactions.forEach(function (row) {
            if (categories.indexOf(row.category) === -1) categories.push(row.category);
        });
        var methods = [];
        cashflows.forEach(function (row) {
            var method = row.paymentMethod || row.accountName || '';
            if (method && methods.indexOf(method) === -1) methods.push(method);
        });
        var availableStatuses = ['pending', 'confirmed', 'paid', 'unpaid', 'partial', 'overdue', 'cancelled', 'refunded'];
        var reconciliation = buildReconciliation(invoicesInPeriod, cashflows.filter(function (row) { return dateIn(row.date) && matchesBuilding(row); }));
        var buildingTotals = buildings.map(function (building) {
            var records = filteredCashflows.filter(function (row) { return recordBuilding(row) === building.id; });
            var income = records.filter(function (r) { return r.type === 'income' && ['cancelled', 'refunded', 'pending', 'unconfirmed'].indexOf(r.status) === -1; }).reduce(function (sum, r) { return sum + amount(r.amount); }, 0);
            var outgo = records.filter(function (r) { return r.type === 'expense' && ['cancelled', 'pending', 'unconfirmed'].indexOf(r.status) === -1; }).reduce(function (sum, r) { return sum + amount(r.amount); }, 0);
            return { building: building.name || building.shortName || 'Tòa nhà', income: income, expense: outgo, balance: income - outgo };
        });
        return {
            dates: dates, buildings: buildings, categories: categories, methods: methods, availableStatuses: availableStatuses,
            transactions: reportTransactions, cashflows: filteredCashflows, debtRows: debtRows, invoiceStatusSummary: invoiceStatusSummary,
            deposits: heldDeposits, reconciliation: reconciliation,
            revenue: revenue, expense: expense, balance: revenue - expense, debt: debtTotal, depositsHeld: heldTotal,
            buildingTotals: buildingTotals, illustrative: illustrative
        };
    }
    function buildReconciliation(invoices, cashflows) {
        var income = cashflows.filter(function (row) { return row.type === 'income' && row.status !== 'cancelled' && row.status !== 'refunded'; });
        var findings = [];
        var seenCodes = {};
        invoices.forEach(function (inv) {
            var linked = income.filter(function (row) {
                return String(row.reference || '').indexOf(inv.code || inv.id) !== -1 || String(row.code || '') === String(inv.code || '');
            });
            if (inv.status === 'cancelled') {
                if (linked.length) findings.push({ code: inv.code || inv.id, type: 'Hóa đơn đã hủy', object: inv.code, left: 0, right: linked.reduce(function (sum, row) { return sum + amount(row.amount); }, 0), delta: -linked.reduce(function (sum, row) { return sum + amount(row.amount); }, 0), status: 'Cần kiểm tra', detail: 'Hóa đơn đã hủy nhưng vẫn có phiếu thu tham chiếu.' });
                return;
            }
            if (!RHD.isIssuedInvoice(inv)) return;
            var paid = Math.min(amount(inv.total), Math.max(amount(inv.paidAmount || inv.amountPaid), linked.reduce(function (sum, row) { return sum + amount(row.amount); }, 0)));
            if (inv.status === 'paid' && !linked.length) findings.push({ code: inv.code || inv.id, type: 'Hóa đơn / giao dịch', object: inv.code, left: amount(inv.total), right: 0, delta: amount(inv.total), status: 'Thiếu dữ liệu', detail: 'Hóa đơn đã thanh toán nhưng chưa tìm thấy phiếu thu có mã hóa đơn tham chiếu.' });
            else if (linked.length && (linked.reduce(function (sum, row) { return sum + amount(row.amount); }, 0) > amount(inv.total) || (inv.status === 'paid' && Math.abs(linked.reduce(function (sum, row) { return sum + amount(row.amount); }, 0) - (amount(inv.paidAmount || inv.amountPaid) || amount(inv.total))) > 0))) {
                var total = linked.reduce(function (sum, row) { return sum + amount(row.amount); }, 0);
                findings.push({ code: inv.code || inv.id, type: 'Hóa đơn / giao dịch', object: inv.code, left: paid || amount(inv.total), right: total, delta: (paid || amount(inv.total)) - total, status: 'Chênh lệch', detail: 'Tổng phiếu thu tham chiếu không khớp số tiền đã ghi nhận trên hóa đơn.' });
            }
        });
        income.forEach(function (row) {
            if (row.code && seenCodes[row.code]) findings.push({ code: row.code, type: 'Giao dịch trùng mã', object: row.code, left: amount(row.amount), right: amount(seenCodes[row.code].amount), delta: amount(row.amount), status: 'Cần kiểm tra', detail: 'Có nhiều phiếu thu dùng cùng mã giao dịch.' });
            else if (row.code) seenCodes[row.code] = row;
            if (!row.reference) findings.push({ code: row.code || row.id, type: 'Giao dịch thiếu tham chiếu', object: row.code || row.id, left: amount(row.amount), right: 0, delta: amount(row.amount), status: 'Thiếu dữ liệu', detail: 'Phiếu thu chưa có mã hóa đơn hoặc chứng từ tham chiếu.' });
        });
        if (!findings.length) findings.push({ code: '—', type: 'Đối chiếu tổng quan', object: 'Hóa đơn và phiếu thu', left: 0, right: 0, delta: 0, status: 'Khớp', detail: 'Không phát hiện sai lệch theo các tham chiếu hiện có.' });
        return findings;
    }
    function ensureStyles() {
        if (document.getElementById('rh-finance-styles')) return;
        var style = document.createElement('style');
        style.id = 'rh-finance-styles';
        style.textContent = '#reports-tab .fr-page{display:grid;gap:1rem}.fr-head,.fr-card{background:#fff;border:1px solid #e4eaf2;border-radius:16px;padding:1.25rem;box-shadow:0 8px 24px rgba(15,35,65,.035)}.fr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}.fr-title{font-size:1.55rem;font-weight:800;color:#10213c}.fr-muted{color:#61708a;font-size:.85rem;margin-top:.35rem}.fr-sample-notice{display:grid;gap:.3rem;border:1px solid #f0c36d;border-radius:12px;background:#fff8e7;padding:.9rem 1rem;color:#754c00;font-size:.82rem;line-height:1.45}.fr-sample-notice strong{font-size:.78rem;letter-spacing:.03em}.fr-actions,.fr-filter-row,.fr-tabs,.fr-kpis{display:flex;gap:.65rem;flex-wrap:wrap}.fr-actions{justify-content:flex-end}.fr-btn,.fr-control{font:inherit;border:1px solid #dbe4ef;border-radius:9px;background:#fff;padding:.62rem .8rem;color:#334155}.fr-btn{cursor:pointer;font-weight:700}.fr-btn.primary{background:#1683ff;border-color:#1683ff;color:white}.fr-filter-row{align-items:end}.fr-filter{display:grid;gap:.35rem;min-width:130px;flex:1}.fr-filter label{font-size:.75rem;color:#61708a;font-weight:700}.fr-control{width:100%;min-width:0}.fr-custom-dates{display:contents}.fr-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}.fr-kpi{background:#fff;border:1px solid #e4eaf2;border-radius:14px;padding:1rem;min-width:0;cursor:pointer;text-align:left}.fr-kpi:hover{border-color:#1683ff;box-shadow:0 4px 14px rgba(22,131,255,.08)}.fr-kpi-label{color:#61708a;font-size:.78rem;font-weight:700}.fr-kpi-value{display:block;margin-top:.5rem;font-size:1.2rem;font-weight:800;color:#10213c;overflow-wrap:anywhere}.fr-kpi-help{display:block;color:#718096;font-size:.7rem;line-height:1.45;margin-top:.4rem}.fr-tabs{border-bottom:1px solid #e4eaf2;padding-bottom:.65rem}.fr-tab{border:0;background:transparent;padding:.65rem .8rem;color:#61708a;font:inherit;font-weight:700;cursor:pointer;border-radius:9px}.fr-tab.active{background:#eaf3ff;color:#0d65d5}.fr-charts{display:grid;grid-template-columns:2fr 1fr;gap:1rem}.fr-chart-wrap{height:290px;position:relative}.fr-table-wrap{overflow-x:auto}.fr-table{width:100%;border-collapse:collapse;font-size:.78rem;white-space:nowrap}.fr-table th,.fr-table td{padding:.7rem;border-bottom:1px solid #edf1f6;text-align:left}.fr-table th{color:#61708a;background:#f8fafc;font-weight:700;cursor:pointer}.fr-table td.num,.fr-table th.num{text-align:right}.fr-table tbody tr:hover{background:#f8fbff}.fr-badge{display:inline-flex;border-radius:999px;padding:.24rem .55rem;font-size:.7rem;font-weight:700;background:#eef2f7;color:#475569}.fr-badge.green{background:#e6f8ef;color:#178250}.fr-badge.red{background:#fee2e2;color:#b42318}.fr-badge.yellow{background:#fff4df;color:#9a6700}.fr-toolbar{display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap;margin-bottom:.8rem}.fr-pagination{display:flex;align-items:center;gap:.55rem;justify-content:flex-end;margin-top:.85rem;color:#61708a;font-size:.8rem}.fr-empty{padding:2rem;text-align:center;color:#718096}.fr-table a{color:#0d65d5}.fr-current{padding:.65rem .8rem;background:#f8fafc;border-radius:9px;color:#61708a;font-size:.75rem}.fr-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);display:grid;place-items:center;z-index:10001;padding:1rem}.fr-modal{background:white;border-radius:14px;width:min(480px,100%);padding:1.2rem;display:grid;gap:.85rem;box-shadow:0 18px 50px rgba(15,23,42,.25)}.fr-modal h3{font-size:1.1rem;font-weight:800}.fr-modal-actions{display:flex;justify-content:flex-end;gap:.6rem}@media(max-width:1050px){.fr-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){#reports-tab{padding:.75rem!important}.fr-head{display:grid}.fr-actions{justify-content:flex-start}.fr-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.fr-charts{grid-template-columns:1fr}.fr-chart-wrap{height:250px}.fr-filter{min-width:calc(50% - .5rem)}}@media(max-width:420px){.fr-kpis{grid-template-columns:1fr}.fr-title{font-size:1.3rem}.fr-filter{min-width:100%}}@media print{.fr-head .fr-actions,.fr-filter-row,.fr-tabs,.fr-toolbar,.fr-pagination{display:none!important}.fr-card,.fr-head{box-shadow:none;break-inside:avoid}}';
        document.head.appendChild(style);
    }
    function badge(value) {
        var tone = /quá hạn|chênh lệch|cần kiểm tra/i.test(value) ? 'red' : (/đã thanh toán|khớp|đã ghi nhận/i.test(value) ? 'green' : 'yellow');
        return '<span class="fr-badge ' + tone + '">' + esc(value) + '</span>';
    }
    function updateFilter(key, value) { state[key] = value; state.page = 1; render(); }
    function chartData(data) {
        var rows = data.transactions.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
        var buckets = {};
        var start = new Date(data.dates.from + 'T00:00:00');
        var end = new Date(data.dates.to + 'T00:00:00');
        var span = Math.ceil((end - start) / 86400000);
        rows.forEach(function (row) {
            if (row.kind !== 'income' && row.kind !== 'expense') return;
            var key = row.date || 'Không rõ ngày';
            if (span > 90 && key.length >= 7) key = key.slice(0, 7);
            else if (span > 31 && key.length >= 10) {
                var d = new Date(key + 'T00:00:00');
                d.setDate(d.getDate() - d.getDay());
                key = iso(d);
            }
            buckets[key] = buckets[key] || { income: 0, expense: 0 };
            if (row.kind === 'income') buckets[key].income += row.value;
            else buckets[key].expense += row.value;
        });
        var labels = Object.keys(buckets).sort();
        return { labels: labels.map(function (label) { return label.length === 7 ? label : dateLabel(label); }), income: labels.map(function (label) { return buckets[label].income; }), expense: labels.map(function (label) { return buckets[label].expense; }), balance: labels.map(function (label) { return buckets[label].income - buckets[label].expense; }) };
    }
    function drawCharts(data) {
        if (!global.Chart) {
            ['frTrend', 'frMix', 'frExpenseMix', 'frDebtStatus'].forEach(function (id) {
                var unavailable = document.getElementById(id);
                if (unavailable) unavailable.parentElement.innerHTML = '<div class="fr-empty">Không thể tải thư viện biểu đồ. Hãy làm mới trang để thử lại.</div>';
            });
            return;
        }
        Object.keys(charts).forEach(function (key) { if (charts[key]) charts[key].destroy(); });
        var trend = chartData(data);
        var line = document.getElementById('frTrend');
        var mix = document.getElementById('frMix');
        var expenseMix = document.getElementById('frExpenseMix');
        var debtStatus = document.getElementById('frDebtStatus');
        if (line && !data.transactions.length) line.parentElement.innerHTML = '<div class="fr-empty">Không có dữ liệu thu chi trong khoảng thời gian đã chọn.</div>';
        else if (line) charts.trend = new Chart(line, {
            type: 'line',
            data: { labels: trend.labels, datasets: [
                { label: 'Thực thu', data: trend.income, borderColor: '#1683ff', backgroundColor: 'rgba(22,131,255,.1)', tension: .28 },
                { label: 'Thực chi', data: trend.expense, borderColor: '#ef6a5b', backgroundColor: 'rgba(239,106,91,.1)', tension: .28 },
                { label: 'Thu chi ròng', data: trend.balance, borderColor: '#18a878', borderDash: [5, 4], tension: .25 }
            ] },
            options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + money(ctx.raw); } } }, legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: function (value) { return money(value); } } } } }
        });
        var totals = {};
        var expenseTotals = {};
        data.transactions.forEach(function (row) {
            if (row.kind === 'income') totals[row.category] = (totals[row.category] || 0) + row.value;
            else if (row.kind === 'expense') expenseTotals[row.category] = (expenseTotals[row.category] || 0) + row.value;
        });
        var cats = Object.keys(totals);
        if (mix && !cats.length) mix.parentElement.innerHTML = '<div class="fr-empty">Chưa có doanh thu theo danh mục.</div>';
        else if (mix) charts.mix = new Chart(mix, {
            type: 'doughnut',
            data: { labels: cats, datasets: [{ data: cats.map(function (key) { return totals[key]; }), backgroundColor: ['#1683ff', '#18a878', '#f0b44c', '#8b74d6', '#ef6a5b', '#52a9a2'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: function (ctx) { var value = ctx.raw || 0; var total = ctx.dataset.data.reduce(function (sum, n) { return sum + n; }, 0); return ctx.label + ': ' + money(value) + ' (' + (total ? Math.round(value * 100 / total) : 0) + '%)'; } } }, legend: { position: 'bottom' } } }
        });
        var expenseCategories = Object.keys(expenseTotals);
        if (expenseMix && !expenseCategories.length) expenseMix.parentElement.innerHTML = '<div class="fr-empty">Chưa có chi phí theo danh mục.</div>';
        else if (expenseMix) charts.expenseMix = new Chart(expenseMix, {
            type: 'doughnut',
            data: { labels: expenseCategories, datasets: [{ data: expenseCategories.map(function (key) { return expenseTotals[key]; }), backgroundColor: ['#ef6a5b', '#f0b44c', '#8b74d6', '#1683ff', '#18a878', '#52a9a2'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: function (ctx) { var value = ctx.raw || 0; var total = ctx.dataset.data.reduce(function (sum, n) { return sum + n; }, 0); return ctx.label + ': ' + money(value) + ' (' + (total ? Math.round(value * 100 / total) : 0) + '%)'; } } }, legend: { position: 'bottom' } } }
        });
        var debtGroups = ['Đã thanh toán', 'Chưa thanh toán', 'Thanh toán một phần', 'Quá hạn'];
        var debtKeys = ['paid', 'unpaid', 'partial', 'overdue'];
        if (debtStatus && !Object.keys(data.invoiceStatusSummary).some(function (key) { return data.invoiceStatusSummary[key].count > 0; })) debtStatus.parentElement.innerHTML = '<div class="fr-empty">Không có hóa đơn trong kỳ đã chọn.</div>';
        else if (debtStatus) charts.debt = new Chart(debtStatus, {
            type: 'bar',
            data: { labels: debtGroups, datasets: [
                { label: 'Số tiền (₫)', data: debtKeys.map(function (key) { return data.invoiceStatusSummary[key].amount; }), backgroundColor: '#1683ff', yAxisID: 'money' },
                { label: 'Số hóa đơn', data: debtKeys.map(function (key) { return data.invoiceStatusSummary[key].count; }), backgroundColor: '#f0b44c', yAxisID: 'count' }
            ] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label.indexOf('tiền') !== -1 ? ctx.dataset.label + ': ' + money(ctx.raw) : ctx.dataset.label + ': ' + ctx.raw; } } }, legend: { position: 'bottom' } }, scales: { money: { beginAtZero: true, position: 'left', ticks: { callback: function (value) { return money(value); } } }, count: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { precision: 0 } } } }
        });
    }
    function transactionTable(data) {
        var rows = data.transactions.slice();
        rows.sort(function (a, b) {
            var av = a[state.sort], bv = b[state.sort];
            if (typeof av === 'number') return (av - bv) * (state.direction === 'asc' ? 1 : -1);
            return String(av || '').localeCompare(String(bv || ''), 'vi') * (state.direction === 'asc' ? 1 : -1);
        });
        var pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
        state.page = Math.min(state.page, pages);
        var pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
        var body = pageRows.map(function (row, index) {
            var originalIndex = (state.page - 1) * state.pageSize + index + 1;
            var detail = 'RHFinancialReport.showTransaction(\'' + esc(row.id) + '\')';
            var reference = row.invoiceId && global.RHUI && global.RHUI.previewInvoice
                ? '<button class="fr-btn" onclick="event.stopPropagation();RHUI.previewInvoice(\'' + esc(row.invoiceId) + '\')">' + esc(row.reference) + '</button>'
                : esc(row.reference || '—');
            var apartmentId = row.apartmentId || (row.source && row.source.apartmentId) || '';
            var apartment = apartmentId && global.RHUI && global.RHUI.openApartmentDetail
                ? '<button class="fr-btn" onclick="event.stopPropagation();RHUI.openApartmentDetail(\'' + esc(apartmentId) + '\')">' + esc(row.apartment) + '</button>'
                : esc(row.apartment);
            return '<tr onclick="' + detail + '" style="cursor:pointer"><td>' + originalIndex + '</td><td><strong>' + esc(row.code) + '</strong></td><td>' + dateLabel(row.date) + '</td><td>' + esc(row.building) + '</td><td>' + apartment + '</td><td>' + esc(row.party) + '</td><td>' + esc(row.type) + '</td><td>' + esc(row.category) + '</td><td>' + reference + '</td><td>' + esc(row.contractId || '—') + '</td><td class="num">' + money(row.value) + '</td><td>' + esc(row.method) + '</td><td>' + badge(row.status) + '</td><td>' + esc(row.actor) + '</td><td>Chi tiết</td></tr>';
        }).join('');
        return '<div class="fr-toolbar"><div class="fr-current">Đang lọc: ' + esc(data.dates.from) + ' – ' + esc(data.dates.to) + (state.building ? ' · ' + esc((data.buildings.filter(function (b) { return b.id === state.building; })[0] || {}).name || 'Tòa nhà') : ' · Tất cả tòa nhà') + ' · ' + rows.length.toLocaleString('vi-VN') + ' giao dịch · Tổng thu ' + money(data.revenue) + ' · Tổng chi ' + money(data.expense) + '</div><label>Hiển thị <select class="fr-control" style="width:auto;display:inline-block" onchange="RHFinancialReport.changePageSize(this.value)"><option value="10"' + (state.pageSize === 10 ? ' selected' : '') + '>10</option><option value="25"' + (state.pageSize === 25 ? ' selected' : '') + '>25</option><option value="50"' + (state.pageSize === 50 ? ' selected' : '') + '>50</option></select></label></div>' +
            '<div class="fr-table-wrap"><table class="fr-table"><thead><tr>' +
            ['STT', 'Mã giao dịch', 'Ngày', 'Tòa nhà', 'Căn hộ', 'Cư dân/đối tác', 'Loại', 'Danh mục', 'Mã hóa đơn/chứng từ', 'Mã hợp đồng', 'Số tiền', 'Phương thức', 'Trạng thái', 'Người ghi nhận', 'Thao tác'].map(function (label) { var key = label === 'Ngày' ? 'date' : (label === 'Số tiền' ? 'value' : (label === 'Trạng thái' ? 'status' : '')); return '<th' + (key ? ' class="num"' : '') + (key ? ' onclick="RHFinancialReport.sortBy(\'' + key + '\')"' : '') + '>' + label + '</th>'; }).join('') +
            '</tr></thead><tbody>' + (body || '<tr><td colspan="15" class="fr-empty">Không có giao dịch phù hợp với điều kiện lọc.</td></tr>') + '</tbody></table></div>' +
            '<div class="fr-pagination"><span>Trang ' + state.page + ' / ' + pages + '</span><button class="fr-btn" onclick="RHFinancialReport.page(-1)"' + (state.page <= 1 ? ' disabled' : '') + '>Trước</button><button class="fr-btn" onclick="RHFinancialReport.page(1)"' + (state.page >= pages ? ' disabled' : '') + '>Sau</button></div>';
    }
    function debtSection(data) {
        var aging = { 'Chưa đến hạn': 0, '1–30 ngày': 0, '31–60 ngày': 0, '61–90 ngày': 0, 'Trên 90 ngày': 0 };
        data.debtRows.forEach(function (row) {
            var group = row.overdueDays <= 0 ? 'Chưa đến hạn' : (row.overdueDays <= 30 ? '1–30 ngày' : (row.overdueDays <= 60 ? '31–60 ngày' : (row.overdueDays <= 90 ? '61–90 ngày' : 'Trên 90 ngày')));
            aging[group] += row.remaining;
        });
        return '<div class="fr-kpis">' + Object.keys(aging).map(function (label) { return '<div class="fr-kpi"><span class="fr-kpi-label">' + label + '</span><strong class="fr-kpi-value">' + money(aging[label]) + '</strong></div>'; }).join('') + '</div>' +
            '<div class="fr-table-wrap"><table class="fr-table"><thead><tr><th>Hóa đơn</th><th>Tòa nhà</th><th>Căn hộ</th><th>Cư dân</th><th>Hạn thanh toán</th><th>Quá hạn</th><th class="num">Đã trả</th><th class="num">Còn phải trả</th><th>Trạng thái</th></tr></thead><tbody>' +
            (data.debtRows.map(function (row) { var building = (data.buildings.filter(function (b) { return b.id === row.invoice.buildingId; })[0] || {}).name || '—'; return '<tr><td>' + esc(row.invoice.code || '—') + '</td><td>' + esc(building) + '</td><td>' + esc(row.apartment.name || row.apartment.code || '—') + '</td><td>' + esc(row.customer.fullName || '—') + '</td><td>' + dateLabel(row.invoice.dueDate) + '</td><td>' + (row.overdueDays > 0 ? row.overdueDays + ' ngày' : '—') + '</td><td class="num">' + money(row.paid) + '</td><td class="num">' + money(row.remaining) + '</td><td>' + badge(statusLabel(row.displayStatus)) + '</td></tr>'; }).join('') || '<tr><td colspan="9" class="fr-empty">Không có công nợ trong khoảng thời gian đã chọn.</td></tr>') +
            '</tbody></table></div>';
    }
    function depositSection(data) {
        return '<div class="fr-current">Tiền cọc đang giữ được theo dõi riêng và không được tính vào doanh thu hoặc lợi nhuận.</div><div class="fr-table-wrap"><table class="fr-table"><thead><tr><th>Mã cọc / hợp đồng</th><th>Cư dân</th><th>Căn hộ</th><th>Ngày nhận</th><th class="num">Theo hợp đồng</th><th class="num">Thực nhận</th><th class="num">Hoàn trả</th><th class="num">Khấu trừ</th><th class="num">Đang giữ</th><th>Trạng thái</th></tr></thead><tbody>' +
            (data.deposits.map(function (row) { return '<tr><td>' + esc(row.deposit.code || row.contract.code || '—') + '</td><td>' + esc(row.residents) + '</td><td>' + esc(row.apartment.name || row.apartment.code || '—') + '</td><td>' + dateLabel(row.deposit.depositDate) + '</td><td class="num">' + money(row.deposit.depositFullAmount) + '</td><td class="num">' + money(row.received) + '</td><td class="num">' + money(row.refunded) + '</td><td class="num">' + money(row.deducted) + '</td><td class="num">' + money(row.held) + '</td><td>' + badge('Đang giữ') + '</td></tr>'; }).join('') || '<tr><td colspan="10" class="fr-empty">Không có tiền đặt cọc đang giữ phù hợp.</td></tr>') +
            '</tbody></table></div>';
    }
    function reconSection(data) {
        return '<div class="fr-current">Đối soát chỉ phát hiện và hiển thị sai lệch; hệ thống không tự sửa hoặc xóa dữ liệu tài chính.</div><div class="fr-table-wrap"><table class="fr-table"><thead><tr><th>Mã đối chiếu</th><th>Loại</th><th>Đối tượng</th><th class="num">Nguồn 1</th><th class="num">Nguồn 2</th><th class="num">Chênh lệch</th><th>Trạng thái</th><th>Ngày kiểm tra</th><th>Chi tiết</th></tr></thead><tbody>' +
            data.reconciliation.map(function (row) { return '<tr><td>' + esc(row.code) + '</td><td>' + esc(row.type) + '</td><td>' + esc(row.object) + '</td><td class="num">' + money(row.left) + '</td><td class="num">' + money(row.right) + '</td><td class="num">' + money(row.delta) + '</td><td>' + badge(row.status) + '</td><td>' + dateLabel(iso(new Date())) + '</td><td><button class="fr-btn" onclick="RHFinancialReport.showRecon(\'' + esc(row.code) + '\')">Xem nguyên nhân</button></td></tr>'; }).join('') +
            '</tbody></table></div>';
    }
    function render() {
        var root = document.getElementById('reports-tab');
        if (!root) return;
        ensureStyles();
        try {
            var data = collect();
            lastData = data;
            var dateRange = data.dates;
            var buildingOptions = '<option value="">Tất cả tòa nhà</option>' + data.buildings.map(function (b) { return '<option value="' + esc(b.id) + '"' + (state.building === b.id ? ' selected' : '') + '>' + esc(b.name || b.shortName || 'Tòa nhà') + '</option>'; }).join('');
            var categories = data.categories.map(function (v) { return '<option value="' + esc(v) + '"' + (state.category === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
            var methods = data.methods.map(function (v) { return '<option value="' + esc(v) + '"' + (state.paymentMethod === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
            var statuses = data.availableStatuses.map(function (v) { return '<option value="' + v + '"' + (state.status === v ? ' selected' : '') + '>' + esc(statusLabel(v)) + '</option>'; }).join('');
            root.innerHTML = '<div class="fr-page">' +
                '<header class="fr-head"><div><h1 class="fr-title">Báo cáo tài chính</h1><p class="fr-muted">Theo dõi doanh thu, chi phí, công nợ và dòng tiền của hệ thống quản lý cư dân</p></div><div class="fr-actions"><button class="fr-btn" onclick="RHFinancialReport.refresh()"><i class="fas fa-rotate"></i> Làm mới dữ liệu</button><button class="fr-btn" onclick="RHFinancialReport.openExport()"><i class="fas fa-file-export"></i> Xuất báo cáo</button><button class="fr-btn primary" onclick="RHFinancialReport.reconcile()"><i class="fas fa-scale-balanced"></i> Đối soát dữ liệu</button></div></header>' +
                '<section class="fr-card"><div class="fr-filter-row">' +
                '<div class="fr-filter"><label for="frPeriod">Khoảng thời gian</label><select class="fr-control" id="frPeriod"><option value="today">Hôm nay</option><option value="7days">7 ngày gần nhất</option><option value="month">Tháng này</option><option value="lastMonth">Tháng trước</option><option value="quarter">Quý này</option><option value="year">Năm nay</option><option value="custom">Tùy chỉnh</option></select></div>' +
                '<div class="fr-filter"><label for="frBuilding">Tòa nhà</label><select class="fr-control" id="frBuilding">' + buildingOptions + '</select></div>' +
                '<div class="fr-filter"><label for="frStatus">Trạng thái</label><select class="fr-control" id="frStatus"><option value="all">Tất cả trạng thái</option>' + statuses + '</select></div>' +
                '<div class="fr-filter"><label for="frType">Loại giao dịch</label><select class="fr-control" id="frType"><option value="all">Tất cả loại</option><option value="income">Thu</option><option value="expense">Chi</option><option value="refund">Hoàn cọc</option><option value="deposit">Giao dịch đặt cọc</option></select></div>' +
                '<div class="fr-filter"><label for="frCategory">Danh mục</label><select class="fr-control" id="frCategory"><option value="">Tất cả danh mục</option>' + categories + '</select></div>' +
                '<div class="fr-filter"><label for="frMethod">Phương thức thanh toán</label><select class="fr-control" id="frMethod"><option value="">Tất cả phương thức</option>' + methods + '</select></div>' +
                '<div class="fr-filter"><label for="frSearch">Tìm kiếm</label><input class="fr-control" id="frSearch" type="search" placeholder="Mã giao dịch, hóa đơn, cư dân, căn hộ..." value="' + esc(state.search) + '"></div>' +
                (state.period === 'custom' ? '<div class="fr-filter"><label for="frFrom">Từ ngày</label><input class="fr-control" id="frFrom" type="date" value="' + esc(state.from || dateRange.from) + '"></div><div class="fr-filter"><label for="frTo">Đến ngày</label><input class="fr-control" id="frTo" type="date" value="' + esc(state.to || dateRange.to) + '"></div>' : '') +
                '<button class="fr-btn" onclick="RHFinancialReport.clearFilters()">Xóa bộ lọc</button></div></section>' +
                '<section class="fr-kpis">' +
                '<button class="fr-kpi" onclick="RHFinancialReport.setType(\'income\')"><span class="fr-kpi-label">Tổng doanh thu thực thu</span><strong class="fr-kpi-value">' + money(data.revenue) + '</strong><small class="fr-kpi-help">Tổng các phiếu thu đã ghi nhận trong kỳ; không cộng hóa đơn hoặc tiền đặt cọc.</small></button>' +
                '<button class="fr-kpi" onclick="RHFinancialReport.setType(\'expense\')"><span class="fr-kpi-label">Tổng chi phí thực chi</span><strong class="fr-kpi-value">' + money(data.expense) + '</strong><small class="fr-kpi-help">Tổng phiếu chi đã ghi nhận; không gồm khoản chi dự kiến.</small></button>' +
                '<button class="fr-kpi"><span class="fr-kpi-label">Thu chi ròng</span><strong class="fr-kpi-value">' + money(data.balance) + '</strong><small class="fr-kpi-help">Thực thu − thực chi; tiền cọc không tính vào doanh thu.</small></button>' +
                '<button class="fr-kpi" onclick="RHFinancialReport.setSection(\'debt\')"><span class="fr-kpi-label">Công nợ phải thu</span><strong class="fr-kpi-value">' + money(data.debt) + '</strong><small class="fr-kpi-help">Hóa đơn còn hiệu lực, trừ số đã thanh toán được ghi nhận.</small></button>' +
                '<button class="fr-kpi" onclick="RHFinancialReport.setSection(\'deposits\')"><span class="fr-kpi-label">Tiền đặt cọc đang giữ</span><strong class="fr-kpi-value">' + money(data.depositsHeld) + '</strong><small class="fr-kpi-help">Cọc đã nhận, chưa hoàn trả/khấu trừ; tách biệt doanh thu.</small></button>' +
                '</section>' +
                '<section class="fr-charts"><div class="fr-card"><h2 style="font-weight:800;margin-bottom:.7rem">Thu chi theo thời gian</h2><div class="fr-chart-wrap"><canvas id="frTrend"></canvas></div></div><div class="fr-card"><h2 style="font-weight:800;margin-bottom:.7rem">Cơ cấu doanh thu theo danh mục</h2><div class="fr-chart-wrap"><canvas id="frMix"></canvas></div></div><div class="fr-card"><h2 style="font-weight:800;margin-bottom:.7rem">Cơ cấu chi phí theo danh mục</h2><div class="fr-chart-wrap"><canvas id="frExpenseMix"></canvas></div></div><div class="fr-card"><h2 style="font-weight:800;margin-bottom:.7rem">Tình trạng công nợ</h2><div class="fr-chart-wrap"><canvas id="frDebtStatus"></canvas></div></div></section>' +
                '<section class="fr-card"><div class="fr-kpis" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:1rem">' +
                data.buildingTotals.map(function (row) { return '<div class="fr-kpi"><span class="fr-kpi-label">' + esc(row.building) + '</span><strong class="fr-kpi-value">' + money(row.balance) + '</strong><small class="fr-kpi-help">Thu ' + money(row.income) + ' · Chi ' + money(row.expense) + '</small></div>'; }).join('') +
                '</div><div class="fr-tabs"><button class="fr-tab' + (state.section === 'transactions' ? ' active' : '') + '" onclick="RHFinancialReport.setSection(\'transactions\')">Giao dịch (' + data.transactions.length + ')</button><button class="fr-tab' + (state.section === 'debt' ? ' active' : '') + '" onclick="RHFinancialReport.setSection(\'debt\')">Công nợ (' + data.debtRows.length + ')</button><button class="fr-tab' + (state.section === 'deposits' ? ' active' : '') + '" onclick="RHFinancialReport.setSection(\'deposits\')">Tiền đặt cọc (' + data.deposits.length + ')</button><button class="fr-tab' + (state.section === 'reconcile' ? ' active' : '') + '" onclick="RHFinancialReport.setSection(\'reconcile\')">Đối soát (' + data.reconciliation.length + ')</button></div>' +
                (state.section === 'transactions' ? transactionTable(data) : (state.section === 'debt' ? debtSection(data) : (state.section === 'deposits' ? depositSection(data) : reconSection(data)))) +
                '</section></div>';
            document.getElementById('frPeriod').value = state.period;
            document.getElementById('frBuilding').value = state.building;
            document.getElementById('frStatus').value = state.status;
            document.getElementById('frType').value = state.type;
            document.getElementById('frCategory').value = state.category;
            document.getElementById('frMethod').value = state.paymentMethod;
            bind();
            drawCharts(data);
        } catch (error) {
            console.error('Không thể tải báo cáo tài chính.', error);
            root.innerHTML = '<div class="fr-card"><h2 style="font-weight:800">Không thể tải báo cáo</h2><p class="fr-muted">Đã xảy ra lỗi khi đọc dữ liệu tài chính. Vui lòng thử làm mới dữ liệu.</p><button class="fr-btn" onclick="RHFinancialReport.refresh()">Thử lại</button></div>';
        }
    }
    function bind() {
        document.getElementById('frPeriod').addEventListener('change', function () { state.period = this.value; render(); });
        document.getElementById('frBuilding').addEventListener('change', function () { updateFilter('building', this.value); });
        document.getElementById('frStatus').addEventListener('change', function () { updateFilter('status', this.value); });
        document.getElementById('frType').addEventListener('change', function () { updateFilter('type', this.value); });
        document.getElementById('frCategory').addEventListener('change', function () { updateFilter('category', this.value); });
        document.getElementById('frMethod').addEventListener('change', function () { updateFilter('paymentMethod', this.value); });
        document.getElementById('frSearch').addEventListener('input', function () { state.search = this.value; state.page = 1; render(); var input = document.getElementById('frSearch'); input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
        var from = document.getElementById('frFrom');
        var to = document.getElementById('frTo');
        if (from) from.addEventListener('change', function () { state.from = this.value; render(); });
        if (to) to.addEventListener('change', function () { state.to = this.value; render(); });
    }
    function csvCell(value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; }
    function exportRows(reportType) {
        if (!lastData) throw new Error('Chưa có dữ liệu báo cáo để xuất.');
        var section = reportType || state.section;
        if (section === 'summary') return {
            title: 'Tổng hợp tài chính',
            headers: ['Chỉ số', 'Giá trị (VND)', 'Cách tính'],
            rows: [
                ['Tổng doanh thu thực thu', lastData.revenue, 'Phiếu thu hợp lệ đã ghi nhận trong kỳ; loại trừ đặt cọc.'],
                ['Tổng chi phí thực chi', lastData.expense, 'Phiếu chi hợp lệ đã ghi nhận trong kỳ.'],
                ['Thu chi ròng', lastData.balance, 'Thực thu trừ thực chi.'],
                ['Công nợ phải thu', lastData.debt, 'Hóa đơn còn hiệu lực trừ thanh toán đã ghi nhận.'],
                ['Tiền đặt cọc đang giữ', lastData.depositsHeld, 'Tiền cọc thực nhận chưa hoàn trả/khấu trừ.']
            ]
        };
        if (section === 'revenue' || section === 'expense') {
            var transactionKind = section === 'revenue' ? 'income' : 'expense';
            return {
                title: section === 'revenue' ? 'Báo cáo doanh thu' : 'Báo cáo chi phí',
                headers: ['Mã giao dịch', 'Ngày', 'Tòa nhà', 'Căn hộ', 'Cư dân/đối tác', 'Danh mục', 'Mã tham chiếu', 'Số tiền', 'Phương thức', 'Trạng thái'],
                rows: lastData.transactions.filter(function (row) { return row.kind === transactionKind; }).map(function (row) {
                    return [row.code, row.date, row.building, row.apartment, row.party, row.category, row.reference, row.value, row.method, row.status];
                })
            };
        }
        if (section === 'debt') return {
            title: 'Báo cáo công nợ', headers: ['Mã hóa đơn', 'Tòa nhà', 'Căn hộ', 'Cư dân', 'Ngày đến hạn', 'Số ngày quá hạn', 'Đã thanh toán', 'Còn phải thanh toán', 'Trạng thái'],
            rows: lastData.debtRows.map(function (row) { return [row.invoice.code, (lastData.buildings.filter(function (b) { return b.id === row.invoice.buildingId; })[0] || {}).name || '', row.apartment.name || row.apartment.code, row.customer.fullName, row.invoice.dueDate, row.overdueDays, row.paid, row.remaining, statusLabel(row.invoice.status)]; })
        };
        if (section === 'deposits') return {
            title: 'Báo cáo tiền đặt cọc', headers: ['Mã cọc', 'Cư dân', 'Căn hộ', 'Ngày nhận', 'Theo hợp đồng', 'Thực nhận', 'Đã hoàn', 'Đã khấu trừ', 'Đang giữ', 'Trạng thái'],
            rows: lastData.deposits.map(function (row) { return [row.deposit.code, row.residents, row.apartment.name || row.apartment.code, row.deposit.depositDate, amount(row.deposit.depositFullAmount), row.received, row.refunded, row.deducted, row.held, 'Đang giữ']; })
        };
        if (section === 'reconcile') return {
            title: 'Kết quả đối soát', headers: ['Mã đối chiếu', 'Loại', 'Đối tượng', 'Nguồn 1', 'Nguồn 2', 'Chênh lệch', 'Trạng thái', 'Nguyên nhân'],
            rows: lastData.reconciliation.map(function (row) { return [row.code, row.type, row.object, row.left, row.right, row.delta, row.status, row.detail]; })
        };
        return {
            title: 'Giao dịch tài chính', headers: ['Mã giao dịch', 'Ngày', 'Tòa nhà', 'Căn hộ', 'Cư dân/đối tác', 'Loại', 'Danh mục', 'Mã tham chiếu', 'Số tiền', 'Phương thức', 'Trạng thái', 'Người ghi nhận'],
            rows: lastData.transactions.map(function (row) { return [row.code, row.date, row.building, row.apartment, row.party, row.type, row.category, row.reference, row.value, row.method, row.status, row.actor]; })
        };
    }
    function openExport() {
        if (!global.RHP || global.RHP.can('reports.view')) {
            var layer = document.createElement('div');
            layer.className = 'fr-modal-backdrop';
            layer.id = 'frExportModal';
            layer.innerHTML = '<div class="fr-modal" role="dialog" aria-modal="true" aria-labelledby="frExportTitle"><h3 id="frExportTitle">Xuất báo cáo tài chính</h3><div class="fr-current">Thời gian: ' + esc(range().from) + ' – ' + esc(range().to) + '<br>Tòa nhà: ' + esc(state.building ? ((lastData.buildings.filter(function (b) { return b.id === state.building; })[0] || {}).name || 'Đã chọn') : 'Tất cả trong phạm vi được cấp quyền') + '<br>Trạng thái: ' + esc(state.status === 'all' ? 'Tất cả' : statusLabel(state.status)) + ' · Loại: ' + esc(state.type) + '<br>Danh mục: ' + esc(state.category || 'Tất cả') + ' · Phương thức: ' + esc(state.paymentMethod || 'Tất cả') + '</div>' + (lastData && lastData.illustrative ? '<div class="fr-sample-notice"><strong>CHÚ Ý: BÁO CÁO CÓ DÒNG GIẢ LẬP</strong><span>Những dòng mã MH không phải số liệu thật; cảnh báo sẽ được ghi vào tệp xuất.</span></div>' : '') + '<label>Loại báo cáo<select id="frExportType" class="fr-control"><option value="summary">Tổng hợp tài chính</option><option value="revenue">Doanh thu</option><option value="expense">Chi phí</option><option value="debt">Công nợ</option><option value="deposits">Tiền đặt cọc</option><option value="transactions">Giao dịch</option><option value="reconcile">Kết quả đối soát</option></select></label><label>Định dạng<select id="frExportFormat" class="fr-control"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option><option value="pdf">PDF / In</option></select></label><label>Phạm vi<select id="frExportScope" class="fr-control"><option value="all">Tất cả bản ghi phù hợp bộ lọc</option><option value="page">Dữ liệu đang xem</option></select></label><div class="fr-modal-actions"><button class="fr-btn" onclick="RHFinancialReport.closeExport()">Hủy</button><button class="fr-btn primary" onclick="RHFinancialReport.export()">Xuất tệp</button></div></div>';
            document.body.appendChild(layer);
        } else alert('Bạn không có quyền xuất báo cáo tài chính.');
    }
    function download(name, data, type) {
        var url = URL.createObjectURL(new Blob([data], { type: type }));
        var anchor = document.createElement('a');
        anchor.href = url; anchor.download = name; anchor.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    function exportFile() {
        try {
            if (global.RHP && !global.RHP.can('reports.view')) { alert('Bạn không có quyền xuất báo cáo tài chính.'); return; }
            var reportType = document.getElementById('frExportType').value;
            var payload = exportRows(reportType);
            var format = document.getElementById('frExportFormat').value;
            var scope = document.getElementById('frExportScope').value;
            if (scope === 'page' && reportType === 'transactions') payload.rows = payload.rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
            if (lastData && lastData.illustrative) {
                var sampleWarning = 'MINH HỌA: Không phải số liệu thật; không dùng làm căn cứ kế toán.';
                payload.title = '[DỮ LIỆU MINH HỌA] ' + payload.title;
                payload.headers.unshift('Cảnh báo');
                payload.rows = payload.rows.map(function (row) { return [sampleWarning].concat(row); });
            }
            var stamp = iso(new Date());
            if (format === 'csv') {
                var csv = '\ufeff' + [payload.headers].concat(payload.rows).map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
                recordExport(format, payload.rows.length);
                download('residenthub-' + reportType + '-' + stamp + '.csv', csv, 'text/csv;charset=utf-8');
                closeExport();
            } else if (format === 'xlsx') {
                if (!global.RHFinancialExport || !global.RHFinancialExport.xlsx) throw new Error('Chưa tải được bộ xuất Excel.');
                global.RHFinancialExport.xlsx(payload.title, payload.headers, payload.rows, {
                    from: range().from, to: range().to, building: state.building || 'Tất cả tòa nhà',
                    exportedAt: new Date().toLocaleString('vi-VN')
                }).then(function (blob) {
                    recordExport(format, payload.rows.length);
                    download('residenthub-' + reportType + '-' + stamp + '.xlsx', blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                    closeExport();
                }).catch(function (error) { console.error('Xuất XLSX thất bại.', error); alert('Không thể tạo tệp Excel. Vui lòng thử CSV hoặc PDF.'); });
            } else {
                var printWindow = window.open('', '_blank');
                if (!printWindow) throw new Error('Trình duyệt đã chặn cửa sổ in. Cho phép cửa sổ bật lên rồi thử lại.');
                var html = '<!doctype html><html lang="vi"><meta charset="utf-8"><title>' + esc(payload.title) + '</title><style>body{font:12px Arial,sans-serif;color:#10213c;padding:24px}h1{font-size:20px}p{color:#526174}.fr-sample-warning{padding:10px;background:#fff4df;border:1px solid #e3b34d;color:#754c00;font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #dbe4ef;padding:7px;text-align:left}th{background:#eef4fb}@media print{body{padding:0}}</style><h1>' + esc(payload.title) + '</h1>' + (lastData && lastData.illustrative ? '<p class="fr-sample-warning">DỮ LIỆU MINH HỌA — KHÔNG PHẢI SỐ LIỆU THẬT. Không dùng làm căn cứ kế toán.</p>' : '') + '<p>Kỳ báo cáo: ' + esc(range().from) + ' – ' + esc(range().to) + '<br>Điều kiện lọc: ' + esc(state.building || 'Tất cả tòa nhà') + ' · Xuất lúc ' + esc(new Date().toLocaleString('vi-VN')) + '</p><table><thead><tr>' + payload.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</thead><tbody>' + payload.rows.map(function (row) { return '<tr>' + row.map(function (v) { return '<td>' + esc(typeof v === 'number' ? money(v) : v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table><script>window.onload=function(){window.print()}<\/script></html>';
                recordExport(format, payload.rows.length);
                printWindow.document.open(); printWindow.document.write(html); printWindow.document.close();
                closeExport();
            }
        } catch (error) {
            console.error('Không thể xuất báo cáo.', error);
            alert(error.message || 'Không thể xuất báo cáo. Vui lòng thử lại.');
        }
    }
    function closeExport() { var modal = document.getElementById('frExportModal'); if (modal) modal.remove(); }
    function recordExport(format, count) {
        var key = 'residenthub_' + (global.RHD_MODE || 'live') + '_report_activity';
        var raw = localStorage.getItem(key);
        var history = raw ? JSON.parse(raw) : [];
        var session = global.RH && global.RH.getSession ? global.RH.getSession() : null;
        history.push({ action: 'financial_report_export', format: format, count: count, at: new Date().toISOString(), actorId: session && session.id || '' });
        localStorage.setItem(key, JSON.stringify(history.slice(-100)));
    }
    function detailTransaction(id) {
        var record = RHD.get('cashflows', id);
        if (record && global.RHUI && global.RHUI.openCashflowDetail) {
            global.RHUI.openCashflowDetail(id);
            return;
        }
        if (!record) {
            var depositTransaction = RHD.get('depositTransactions', id);
            if (!depositTransaction) { alert('Không tìm thấy giao dịch.'); return; }
            var deposit = RHD.get('deposits', depositTransaction.depositId) || {};
            if (global.RHUI && global.RHUI.openDrawer) {
                global.RHUI.openDrawer('Chi tiết giao dịch đặt cọc', '<div style="padding:1rem"><p><strong>Mã đặt cọc:</strong> ' + esc(deposit.code || '—') + '</p><p style="margin-top:.6rem"><strong>Loại:</strong> ' + esc(depositTransaction.label || depositTransaction.type) + '</p><p style="margin-top:.6rem"><strong>Ngày:</strong> ' + dateLabel(depositTransaction.date) + '</p><p style="margin-top:.6rem"><strong>Số tiền:</strong> ' + money(depositTransaction.amount) + '</p><p style="margin-top:.6rem"><strong>Ghi chú:</strong> ' + esc(depositTransaction.note || '—') + '</p></div>');
                return;
            }
            record = depositTransaction;
        }
        alert([record.code || '', record.description || record.label || '', money(record.amount)].filter(Boolean).join('\n'));
    }
    function showRecon(code) {
        var row = lastData && lastData.reconciliation.filter(function (item) { return item.code === code; })[0];
        if (!row) return;
        if (global.RHUI && global.RHUI.openDrawer) global.RHUI.openDrawer('Chi tiết đối soát · ' + row.code,
            '<div style="padding:1rem"><p><strong>Loại đối chiếu:</strong> ' + esc(row.type) + '</p><p style="margin-top:.6rem"><strong>Đối tượng:</strong> ' + esc(row.object) + '</p><p style="margin-top:.6rem"><strong>Nguyên nhân:</strong> ' + esc(row.detail) + '</p><p style="margin-top:.6rem"><strong>Trạng thái:</strong> ' + esc(row.status) + '</p><p style="margin-top:.8rem;color:#9a6700">Không có dữ liệu nào được tự động điều chỉnh.</p></div>');
        else alert(row.detail);
    }
    global.RHFinancialReport = {
        render: render,
        refresh: render,
        setType: function (type) { state.type = type; state.section = 'transactions'; render(); },
        setSection: function (section) { state.section = section; render(); },
        clearFilters: function () { state = Object.assign(state, { period: 'month', from: '', to: '', building: '', status: 'all', type: 'all', category: '', paymentMethod: '', search: '', page: 1 }); render(); },
        page: function (step) { state.page += step; render(); },
        changePageSize: function (size) { state.pageSize = Number(size) || 10; state.page = 1; render(); },
        sortBy: function (key) { if (state.sort === key) state.direction = state.direction === 'asc' ? 'desc' : 'asc'; else { state.sort = key; state.direction = 'desc'; } render(); },
        openExport: openExport,
        closeExport: closeExport,
        export: exportFile,
        showTransaction: detailTransaction,
        showRecon: showRecon,
        reconcile: function () { state.section = 'reconcile'; render(); }
    };
    global.addEventListener('residenthub:business-data-changed', function (event) {
        var reportTab = document.getElementById('reports-tab');
        if (reportTab && event.detail && event.detail.mode === (global.RHD_MODE || 'live') && reportTab.style.display !== 'none') render();
    });
})(window);
