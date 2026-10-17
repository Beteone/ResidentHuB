(function (global) {
    'use strict';

    var state = {
        applied: { building: '', period: 'month', from: '', to: '', contractStatus: 'all', invoiceStatus: 'all', supportStatus: 'all' },
        draft: null,
        search: '',
        page: { contracts: 1, invoices: 1, requests: 1 },
        pageSize: 10
    };
    var generation = 0;
    var charts = {};
    var cached = null;
    var moneyFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }
    function localDate(date) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    function dateValue(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return localDate(new Date(value));
        var text = String(value || '').slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
    }
    function money(value) { return moneyFormat.format(Number(value) || 0) + ' ₫'; }
    function dateLabel(value) {
        var day = dateValue(value);
        if (!day) return '—';
        var parts = day.split('-');
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    function amount(value) {
        var number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }
    function unique(values) {
        return values.filter(function (value, index) { return value && values.indexOf(value) === index; });
    }
    function tenantIds(contract) {
        return unique((contract.tenantIds && contract.tenantIds.length ? contract.tenantIds :
            (contract.customerIds && contract.customerIds.length ? contract.customerIds : [contract.customerId])).filter(Boolean));
    }
    function residentIdentity(customer) {
        var identity = customer && (customer.idNumber || customer.identityNumber || customer.nationalId || customer.idNo);
        if (identity) return 'id:' + String(identity).trim().toLocaleLowerCase().replace(/\s+/g, '');
        if (customer && customer.email) return 'email:' + String(customer.email).trim().toLocaleLowerCase();
        return 'record:' + String(customer && customer.id || '');
    }
    function uniqueResidents(records) {
        var seen = Object.create(null);
        return records.filter(function (customer) {
            var key = residentIdentity(customer);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }
    function scoped(entity) {
        var rows = global.RHD.list(entity);
        return global.RHP ? global.RHP.scopeList(entity, rows) : rows;
    }
    function addDays(date, days) {
        var result = new Date(date);
        result.setDate(result.getDate() + days);
        return localDate(result);
    }
    function createSampleDataset(now) {
        now = now instanceof Date ? now : new Date();
        var today = localDate(now);
        var updatedAt = now.toISOString();
        var buildings = [
            { id: 'sample-building-1', code: 'MH-T1', name: 'Dữ liệu mẫu · Tòa nhà Minh Họa 01', synthetic: true, updatedAt: updatedAt },
            { id: 'sample-building-2', code: 'MH-T2', name: 'Dữ liệu mẫu · Tòa nhà Minh Họa 02', synthetic: true, updatedAt: updatedAt }
        ];
        var apartments = [
            { id: 'sample-apartment-101', buildingId: buildings[0].id, code: 'MH-101', name: 'MH-101', status: 'occupied', synthetic: true, updatedAt: updatedAt },
            { id: 'sample-apartment-102', buildingId: buildings[0].id, code: 'MH-102', name: 'MH-102', status: 'vacant', synthetic: true, updatedAt: updatedAt },
            { id: 'sample-apartment-103', buildingId: buildings[0].id, code: 'MH-103', name: 'MH-103', status: 'maintenance', synthetic: true, updatedAt: updatedAt },
            { id: 'sample-apartment-104', buildingId: buildings[0].id, code: 'MH-104', name: 'MH-104', status: 'occupied', synthetic: true, updatedAt: updatedAt },
            { id: 'sample-apartment-201', buildingId: buildings[1].id, code: 'MH-201', name: 'MH-201', status: 'occupied', synthetic: true, updatedAt: updatedAt },
            { id: 'sample-apartment-202', buildingId: buildings[1].id, code: 'MH-202', name: 'MH-202', status: 'vacant', synthetic: true, updatedAt: updatedAt }
        ];
        var customers = [1, 2, 3, 4, 5].map(function (number) {
            var suffix = String(number).padStart(2, '0');
            return {
                id: 'sample-customer-' + suffix, fullName: 'Cư dân minh họa ' + suffix,
                email: 'resident-' + suffix + '@example.invalid', status: 'active',
                createdAt: addDays(now, -number), updatedAt: updatedAt, synthetic: true
            };
        });
        var contracts = [
            { id: 'sample-contract-01', code: 'MH-HD-001', buildingId: buildings[0].id, apartmentId: apartments[0].id, tenantIds: [customers[0].id, customers[1].id], status: 'active', startDate: addDays(now, -180), endDate: addDays(now, 5), updatedAt: updatedAt, synthetic: true },
            { id: 'sample-contract-02', code: 'MH-HD-002', buildingId: buildings[0].id, apartmentId: apartments[3].id, customerId: customers[2].id, status: 'active', startDate: addDays(now, -120), endDate: addDays(now, 20), updatedAt: updatedAt, synthetic: true },
            { id: 'sample-contract-03', code: 'MH-HD-003', buildingId: buildings[1].id, apartmentId: apartments[4].id, customerId: customers[3].id, status: 'active', startDate: addDays(now, -90), endDate: addDays(now, 120), updatedAt: updatedAt, synthetic: true },
            { id: 'sample-contract-04', code: 'MH-HD-004', buildingId: buildings[0].id, apartmentId: apartments[1].id, customerId: customers[4].id, status: 'expired', startDate: addDays(now, -400), endDate: addDays(now, -1), updatedAt: updatedAt, synthetic: true },
            { id: 'sample-contract-05', code: 'MH-HD-005', buildingId: buildings[1].id, apartmentId: apartments[5].id, customerId: customers[4].id, status: 'terminated', startDate: addDays(now, -300), endDate: addDays(now, -20), updatedAt: updatedAt, synthetic: true },
            { id: 'sample-contract-06', code: 'MH-HD-006', buildingId: buildings[0].id, apartmentId: apartments[1].id, customerId: customers[4].id, status: 'draft', startDate: addDays(now, 1), endDate: addDays(now, 365), updatedAt: updatedAt, synthetic: true }
        ];
        var invoices = [
            { id: 'sample-invoice-01', code: 'MH-HD-TT-001', buildingId: buildings[0].id, apartmentId: apartments[0].id, customerId: customers[0].id, status: 'paid', total: 1500000, paidAmount: 1500000, dueDate: addDays(now, -2), synthetic: true },
            { id: 'sample-invoice-02', code: 'MH-HD-TT-002', buildingId: buildings[0].id, apartmentId: apartments[3].id, customerId: customers[2].id, status: 'partial', total: 800000, paidAmount: 250000, dueDate: addDays(now, 10), synthetic: true },
            { id: 'sample-invoice-03', code: 'MH-HD-TT-003', buildingId: buildings[1].id, apartmentId: apartments[4].id, customerId: customers[3].id, status: 'overdue', total: 600000, paidAmount: 0, dueDate: addDays(now, -4), synthetic: true },
            { id: 'sample-invoice-04', code: 'MH-HD-TT-004', buildingId: buildings[1].id, apartmentId: apartments[5].id, customerId: customers[4].id, status: 'unpaid', total: 350000, paidAmount: 0, dueDate: addDays(now, 7), synthetic: true },
            { id: 'sample-invoice-05', code: 'MH-HD-TT-005', buildingId: buildings[0].id, apartmentId: apartments[1].id, customerId: customers[4].id, status: 'cancelled', total: 999999, paidAmount: 0, dueDate: addDays(now, -3), synthetic: true }
        ];
        var cashflows = [
            { id: 'sample-receipt-01', buildingId: buildings[0].id, type: 'income', reference: invoices[0].code, amount: 1500000, status: 'confirmed', createdAt: today, synthetic: true },
            { id: 'sample-receipt-02', buildingId: buildings[0].id, type: 'income', reference: invoices[1].code, amount: 300000, status: 'confirmed', createdAt: today, synthetic: true },
            { id: 'sample-refund-02', buildingId: buildings[0].id, type: 'expense', category: 'Hoàn tiền mẫu', reference: invoices[1].code, amount: 50000, status: 'confirmed', createdAt: today, synthetic: true }
        ];
        var supportRequests = [
            { id: 'sample-request-01', code: 'MH-YC-001', title: 'Minh họa yêu cầu mới', residentName: customers[0].fullName, customerId: customers[0].id, buildingId: buildings[0].id, apartmentId: apartments[0].id, status: 'new', createdAt: addDays(now, -1), updatedAt: updatedAt, synthetic: true },
            { id: 'sample-request-02', code: 'MH-YC-002', title: 'Minh họa yêu cầu đang xử lý', residentName: customers[2].fullName, customerId: customers[2].id, buildingId: buildings[0].id, apartmentId: apartments[3].id, status: 'in_progress', createdAt: addDays(now, -8), updatedAt: updatedAt, synthetic: true },
            { id: 'sample-request-03', code: 'MH-YC-003', title: 'Minh họa yêu cầu đã giải quyết', residentName: customers[3].fullName, customerId: customers[3].id, buildingId: buildings[1].id, apartmentId: apartments[4].id, status: 'resolved', createdAt: addDays(now, -3), updatedAt: updatedAt, synthetic: true },
            { id: 'sample-request-04', code: 'MH-YC-004', title: 'Minh họa yêu cầu đã đóng', residentName: customers[4].fullName, customerId: customers[4].id, buildingId: buildings[1].id, apartmentId: apartments[5].id, status: 'closed', createdAt: addDays(now, -45), updatedAt: updatedAt, synthetic: true }
        ];
        return {
            version: 1, source: 'residenthub-statistics-sample', createdAt: updatedAt,
            buildings: buildings, apartments: apartments, customers: customers, contracts: contracts,
            invoices: invoices, cashflows: cashflows, supportRequests: supportRequests
        };
    }
    function sampleStorageKey() {
        return 'residenthub_' + (global.RHD_MODE || 'live') + '_statistics_sample_data';
    }
    function readSampleDataset() {
        var stored = global.localStorage.getItem(sampleStorageKey());
        if (!stored) return null;
        var data = JSON.parse(stored);
        var entities = ['buildings', 'apartments', 'customers', 'contracts', 'invoices', 'cashflows', 'supportRequests'];
        if (!data || data.version !== 1 || entities.some(function (entity) { return !Array.isArray(data[entity]); })) {
            throw new Error('Bộ dữ liệu giả lập thống kê không hợp lệ. Hãy xóa và tạo lại bộ dữ liệu.');
        }
        return data;
    }
    function periodRange(filters, now) {
        var today = localDate(now);
        var start = new Date(now.getFullYear(), now.getMonth(), 1);
        var from, to = today;
        if (filters.period === 'today') from = today;
        else if (filters.period === '7days') { start = new Date(now); start.setDate(start.getDate() - 6); from = localDate(start); }
        else if (filters.period === '30days') { start = new Date(now); start.setDate(start.getDate() - 29); from = localDate(start); }
        else if (filters.period === 'quarter') from = localDate(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
        else if (filters.period === 'year') from = now.getFullYear() + '-01-01';
        else if (filters.period === 'custom') { from = filters.from; to = filters.to; }
        else from = localDate(start);
        return { from: from, to: to };
    }
    function contractCategory(contract, today) {
        var status = String(contract.status || '').toLowerCase();
        if (['cancelled', 'canceled', 'terminated', 'ended', 'liquidated', 'settled', 'closed'].indexOf(status) !== -1) return 'terminated';
        if (status === 'expired') return 'expired';
        if (['draft', 'pending', 'approved', 'deposit', 'deposited', 'forfeited', 'deposit_forfeited'].indexOf(status) !== -1) return 'other';
        var start = dateValue(contract.startDate);
        var end = dateValue(contract.endDate);
        if (end && end < today) return 'expired';
        if (start && start > today) return 'other';
        if (['active', 'signed', 'renewed', 'moving', 'moving_out', 'move_out', 'notice_to_move', ''].indexOf(status) === -1) return 'other';
        return 'active';
    }
    function invoiceStatus(invoice) {
        return String(invoice.status || 'unpaid').toLowerCase();
    }
    function validInvoice(invoice) {
        return global.RHD.isIssuedInvoice ? (global.RHD.isIssuedInvoice(invoice) || ['partial', 'partially_paid'].indexOf(invoiceStatus(invoice)) !== -1) && invoiceStatus(invoice) !== 'cancelled' :
            ['unpaid', 'sent', 'paid', 'overdue', 'partial', 'partially_paid'].indexOf(invoiceStatus(invoice)) !== -1;
    }
    function calculate(input, options) {
        input = input || {};
        options = options || {};
        var now = options.now instanceof Date ? options.now : new Date();
        var today = localDate(now);
        var filters = Object.assign({}, state.applied, options.filters || {});
        var dates = periodRange(filters, now);
        if (dates.from > dates.to) throw new Error('Ngày bắt đầu không được lớn hơn ngày kết thúc.');

        var buildings = (input.buildings || []).slice();
        var allBuildings = buildings;
        var buildingIds = buildings.map(function (building) { return building.id; });
        var selectedIds = filters.building ? [filters.building] : buildingIds;
        buildings = buildings.filter(function (building) { return selectedIds.indexOf(building.id) !== -1; });
        var allApartments = (input.apartments || []).filter(function (apartment) { return selectedIds.indexOf(apartment.buildingId) !== -1; });
        var apartments = allApartments;
        var contracts = (input.contracts || []).filter(function (contract) { return selectedIds.indexOf(contract.buildingId) !== -1; });
        var customers = (input.customers || []).slice();
        var customersById = Object.create(null);
        customers.forEach(function (customer) { customersById[customer.id] = customer; });
        var apartmentsById = Object.create(null);
        allApartments.forEach(function (apartment) { apartmentsById[apartment.id] = apartment; });
        var buildingsById = Object.create(null);
        allBuildings.forEach(function (building) { buildingsById[building.id] = building; });

        var activeContracts = contracts.filter(function (contract) { return contractCategory(contract, today) === 'active'; });
        var occupiedApartmentIds = unique(activeContracts.map(function (contract) { return contract.apartmentId; }));
        apartments.forEach(function (apartment) {
            if (apartment.status === 'occupied' && apartment.active !== false) occupiedApartmentIds.push(apartment.id);
        });
        occupiedApartmentIds = unique(occupiedApartmentIds);
        var eligibleApartments = apartments.filter(function (apartment) {
            var status = String(apartment.status || 'vacant').toLowerCase();
            return apartment.active !== false && ['maintenance', 'unavailable', 'disabled', 'inactive', 'not_usable', 'unusable'].indexOf(status) === -1;
        });
        var vacantApartments = eligibleApartments.filter(function (apartment) {
            var status = String(apartment.status || 'vacant').toLowerCase();
            return ['vacant', 'available', 'unoccupied', ''].indexOf(status) !== -1 && occupiedApartmentIds.indexOf(apartment.id) === -1;
        });
        var maintenanceApartments = apartments.filter(function (apartment) {
            return apartment.active === false || ['maintenance', 'unavailable', 'disabled', 'inactive', 'not_usable', 'unusable'].indexOf(String(apartment.status || '').toLowerCase()) !== -1;
        });
        var fillRate = eligibleApartments.length ? occupiedApartmentIds.filter(function (id) {
            return eligibleApartments.some(function (apartment) { return apartment.id === id; });
        }).length * 100 / eligibleApartments.length : null;

        var contractRows = contracts.filter(function (contract) {
            return filters.contractStatus === 'all' || contractCategory(contract, today) === filters.contractStatus;
        }).map(function (contract) {
            var category = contractCategory(contract, today);
            var end = dateValue(contract.endDate);
            var daysLeft = end ? Math.ceil((new Date(end + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) : null;
            var tenantProfiles = uniqueResidents(tenantIds(contract).map(function (id) { return customersById[id]; }).filter(Boolean));
            var names = tenantProfiles.map(function (customer) {
                return customer.fullName || customer.name || contract.customerName || '';
            }).filter(Boolean);
            var apartment = apartmentsById[contract.apartmentId] || {};
            var building = buildingsById[contract.buildingId] || {};
            return {
                id: contract.id, code: contract.code || contract.id, tenants: names.join(', ') || contract.customerName || '—',
                building: building.name || building.shortName || '—', apartment: apartment.name || apartment.code || '—',
                startDate: contract.startDate || '', endDate: contract.endDate || '', daysLeft: daysLeft,
                category: category, status: contract.status || '—', record: contract
            };
        });
        var expiringContracts = contractRows.filter(function (row) {
            return row.category === 'active' && row.daysLeft !== null && row.daysLeft >= 0 && row.daysLeft <= 30;
        }).sort(function (a, b) { return a.daysLeft - b.daysLeft; });
        var contractsByStatus = {
            active: contractRows.filter(function (row) { return row.category === 'active' && (row.daysLeft === null || row.daysLeft > 30); }).length,
            expiring: expiringContracts.length,
            expired: contractRows.filter(function (row) { return row.category === 'expired'; }).length,
            terminated: contractRows.filter(function (row) { return row.category === 'terminated'; }).length,
            other: contractRows.filter(function (row) { return row.category === 'other'; }).length
        };
        var currentResidentRecords = [];
        activeContracts.forEach(function (contract) {
            tenantIds(contract).forEach(function (id) {
                var customer = customersById[id];
                if (customer && ['inactive', 'moved_out', 'moved-out', 'đã chuyển đi'].indexOf(String(customer.status || '').toLowerCase()) !== -1) return;
                currentResidentRecords.push(customer || { id: 'contract-tenant:' + id });
            });
        });
        customers.forEach(function (customer) {
            var apartment = apartmentsById[customer.apartmentId];
            if (apartment && occupiedApartmentIds.indexOf(apartment.id) !== -1 &&
                ['inactive', 'moved_out', 'moved-out', 'đã chuyển đi'].indexOf(String(customer.status || '').toLowerCase()) === -1) {
                currentResidentRecords.push(customer);
            }
        });
        var relevantCustomerIds = Object.create(null);
        contracts.forEach(function (contract) { tenantIds(contract).forEach(function (id) { relevantCustomerIds[id] = true; }); });
        customers.forEach(function (customer) {
            var apartment = (input.apartments || []).filter(function (row) { return row.id === customer.apartmentId; })[0];
            if (apartment && selectedIds.indexOf(apartment.buildingId) !== -1) relevantCustomerIds[customer.id] = true;
        });
        var customerRows = customers.filter(function (customer) {
            if (filters.building && !relevantCustomerIds[customer.id]) return false;
            var created = dateValue(customer.createdAt || customer.registeredAt);
            return created && created >= dates.from && created <= dates.to;
        });
        var totalProfiles = uniqueResidents(customers.filter(function (customer) {
            return !filters.building || !!relevantCustomerIds[customer.id];
        }));

        var cashflows = (input.cashflows || []).filter(function (row) {
            return selectedIds.indexOf(row.buildingId || (apartmentsById[row.apartmentId] || {}).buildingId) !== -1;
        });
        var invoices = (input.invoices || []).filter(function (invoice) {
            return selectedIds.indexOf(invoice.buildingId || (apartmentsById[invoice.apartmentId] || {}).buildingId) !== -1 &&
                validInvoice(invoice) && (filters.invoiceStatus === 'all' || invoiceStatus(invoice) === filters.invoiceStatus);
        });
        function linkedAmounts(invoice) {
            var identifier = String(invoice.code || invoice.id || '');
            var matches = cashflows.filter(function (row) {
                return row.type === 'income' && String(row.reference || '').indexOf(identifier) !== -1 &&
                    ['cancelled', 'refunded', 'pending', 'unconfirmed'].indexOf(String(row.status || '').toLowerCase()) === -1;
            });
            var refunds = cashflows.filter(function (row) {
                return row.type === 'expense' && String(row.reference || '').indexOf(identifier) !== -1 &&
                    (/refund|hoàn/i.test(String(row.category || row.description || ''))) &&
                    ['cancelled', 'pending', 'unconfirmed'].indexOf(String(row.status || '').toLowerCase()) === -1;
            });
            return {
                received: matches.reduce(function (sum, row) { return sum + amount(row.amount); }, 0),
                refunded: refunds.reduce(function (sum, row) { return sum + amount(row.amount); }, 0)
            };
        }
        var invoiceRows = invoices.map(function (invoice) {
            var link = linkedAmounts(invoice);
            var total = Math.max(0, amount(invoice.total));
            var explicitPaid = invoice.paidAmount != null ? amount(invoice.paidAmount) : (invoice.amountPaid != null ? amount(invoice.amountPaid) : null);
            var reportedPaid = explicitPaid === null ? link.received : Math.max(explicitPaid, link.received);
            var paid = Math.max(0, Math.min(total, reportedPaid - link.refunded));
            var remaining = invoiceStatus(invoice) === 'paid' ? 0 : Math.max(0, total - paid);
            var dueDate = dateValue(invoice.dueDate);
            var overdue = remaining > 0 && !!dueDate && dueDate < today;
            var apartment = apartmentsById[invoice.apartmentId] || {};
            var building = buildingsById[invoice.buildingId || apartment.buildingId] || {};
            var customer = customersById[invoice.customerId] || {};
            return {
                id: invoice.id, code: invoice.code || invoice.id, apartment: apartment.name || apartment.code || '—',
                building: building.name || building.shortName || '—', customer: customer.fullName || customer.name || invoice.customerName || '—',
                dueDate: invoice.dueDate || '', status: invoiceStatus(invoice), total: total, paid: paid, remaining: remaining,
                overdue: overdue, record: invoice
            };
        });
        var invoiceSummary = {
            paidCount: invoiceRows.filter(function (row) { return row.status === 'paid'; }).length,
            paidTotal: invoiceRows.filter(function (row) { return row.status === 'paid'; }).reduce(function (sum, row) { return sum + row.total; }, 0),
            collected: invoiceRows.reduce(function (sum, row) { return sum + row.paid; }, 0),
            unpaidCount: invoiceRows.filter(function (row) { return row.remaining > 0; }).length,
            debt: invoiceRows.reduce(function (sum, row) { return sum + row.remaining; }, 0),
            overdueDebt: invoiceRows.filter(function (row) { return row.overdue; }).reduce(function (sum, row) { return sum + row.remaining; }, 0)
        };

        var requests = (input.supportRequests || []).filter(function (request) {
            var buildingId = request.buildingId || (apartmentsById[request.apartmentId] || {}).buildingId;
            return selectedIds.indexOf(buildingId) !== -1 && (filters.supportStatus === 'all' || String(request.status || 'new') === filters.supportStatus);
        });
        var requestRows = requests.map(function (request) {
            var apartment = apartmentsById[request.apartmentId] || {};
            var building = buildingsById[request.buildingId || apartment.buildingId] || {};
            return {
                id: request.id, code: request.code || request.id, title: request.title || request.subject || 'Yêu cầu hỗ trợ',
                sender: request.residentName || request.customerName || (customersById[request.customerId] || {}).fullName || '—',
                building: building.name || building.shortName || '—', apartment: apartment.name || apartment.code || '—',
                createdAt: request.createdAt || '', status: request.status || 'new', record: request
            };
        });
        var periodRequests = requestRows.filter(function (request) {
            var created = dateValue(request.createdAt);
            return created && created >= dates.from && created <= dates.to;
        });
        var activeRequests = requestRows.filter(function (request) { return ['resolved', 'closed', 'cancelled', 'canceled'].indexOf(String(request.status).toLowerCase()) === -1; });
        var requestStatusCounts = Object.create(null);
        requestRows.forEach(function (request) {
            requestStatusCounts[request.status] = (requestStatusCounts[request.status] || 0) + 1;
        });
        var requestTimeline = Object.create(null);
        periodRequests.forEach(function (request) {
            var day = dateValue(request.createdAt);
            if (!day) return;
            var month = day.slice(0, 7);
            requestTimeline[month] = (requestTimeline[month] || 0) + 1;
        });

        var relevantCustomers = customers.filter(function (customer) { return !filters.building || !!relevantCustomerIds[customer.id]; });
        var updateCandidates = [];
        [
            buildings,
            apartments,
            relevantCustomers,
            contracts,
            invoiceRows.map(function (row) { return row.record; }),
            requestRows.map(function (row) { return row.record; })
        ].forEach(function (records) {
            records.forEach(function (record) {
                var updated = record.updatedAt || record.createdAt;
                if (typeof updated === 'number' && Number.isFinite(updated)) updateCandidates.push(updated);
                else if (updated && !isNaN(new Date(updated).getTime())) updateCandidates.push(new Date(updated).getTime());
            });
        });
        return {
            dates: dates,
            buildings: buildings,
            totalBuildings: buildings.length,
            totalApartments: apartments.length,
            eligibleApartments: eligibleApartments.length,
            occupiedApartments: occupiedApartmentIds.filter(function (id) { return eligibleApartments.some(function (apartment) { return apartment.id === id; }); }).length,
            vacantApartments: vacantApartments.length,
            maintenanceApartments: maintenanceApartments.length,
            occupancyRate: fillRate,
            residents: { totalProfiles: totalProfiles.length, current: uniqueResidents(currentResidentRecords).length, newInPeriod: uniqueResidents(customerRows).length },
            contractRows: contractRows,
            expiringContracts: expiringContracts,
            contracts: {
                active: contractRows.filter(function (row) { return row.category === 'active'; }).length,
                expiring7: expiringContracts.filter(function (row) { return row.daysLeft <= 7; }).length,
                expiring30: expiringContracts.length,
                expired: contractsByStatus.expired,
                terminated: contractsByStatus.terminated,
                statusCounts: contractsByStatus
            },
            invoiceRows: invoiceRows,
            invoiceSummary: invoiceSummary,
            requestRows: requestRows, periodRequests: periodRequests,
            support: { createdInPeriod: periodRequests.length, new: requestRows.filter(function (row) { return row.status === 'new'; }).length,
                inProgress: requestRows.filter(function (row) { return ['accepted', 'in_progress'].indexOf(row.status) !== -1; }).length,
                resolved: requestRows.filter(function (row) { return ['resolved', 'closed'].indexOf(row.status) !== -1; }).length,
                backlog: activeRequests.length, statusCounts: requestStatusCounts, timeline: requestTimeline },
            lastUpdated: updateCandidates.length ? Math.max.apply(Math, updateCandidates) : null,
            empty: !buildings.length && !apartments.length && !customers.length && !contracts.length && !invoices.length && !requestRows.length
        };
    }
    function readData(filters) {
        var lists = {
            buildings: scoped('buildings'), apartments: scoped('apartments'), customers: scoped('customers'),
            contracts: scoped('contracts'), invoices: scoped('invoices'), supportRequests: scoped('supportRequests'),
            cashflows: global.RHD.list('cashflows')
        };
        var sample = readSampleDataset();
        if (sample) {
            ['buildings', 'apartments', 'customers', 'contracts', 'invoices', 'supportRequests', 'cashflows'].forEach(function (entity) {
                lists[entity] = lists[entity].concat(sample[entity]);
            });
        }
        var data = calculate(lists, { now: new Date(), filters: filters });
        data.sampleActive = !!sample;
        return data;
    }
    function statusLabel(value, entity) {
        var labels = {
            active: 'Còn hiệu lực', expired: 'Đã hết hạn', terminated: 'Đã chấm dứt / hủy', other: 'Khác',
            new: 'Mới tiếp nhận', accepted: 'Đã tiếp nhận', in_progress: 'Đang xử lý', resolved: 'Đã giải quyết', closed: 'Đã đóng',
            paid: 'Đã thanh toán', unpaid: 'Chưa thanh toán', sent: 'Đã gửi', overdue: 'Quá hạn', partial: 'Thanh toán một phần', partially_paid: 'Thanh toán một phần'
        };
        return labels[value] || value || (entity === 'contracts' ? 'Khác' : 'Chưa xác định');
    }
    function selectOptions(items, selected) {
        return items.map(function (item) {
            return '<option value="' + esc(item[0]) + '"' + (selected === item[0] ? ' selected' : '') + '>' + esc(item[1]) + '</option>';
        }).join('');
    }
    function kpi(label, value, sub, icon) {
        return '<article class="sr-kpi"><span class="sr-kpi-icon"><i class="fas ' + icon + '"></i></span><div><span class="sr-kpi-label">' + esc(label) + '</span><strong class="sr-kpi-value">' + esc(value) + '</strong><small>' + esc(sub) + '</small></div></article>';
    }
    function empty(message) { return '<div class="sr-empty">' + esc(message || 'Không có dữ liệu phù hợp với điều kiện thống kê đã chọn') + '</div>'; }
    function searched(rows) {
        var term = state.search.trim().toLocaleLowerCase();
        if (!term) return rows;
        return rows.filter(function (row) { return Object.keys(row).some(function (key) {
            return typeof row[key] !== 'object' && String(row[key] == null ? '' : row[key]).toLocaleLowerCase().indexOf(term) !== -1;
        }); });
    }
    function pageRows(rows, key) {
        var pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
        state.page[key] = Math.min(Math.max(1, state.page[key]), pages);
        var start = (state.page[key] - 1) * state.pageSize;
        return { rows: rows.slice(start, start + state.pageSize), page: state.page[key], pages: pages, total: rows.length };
    }
    function pagination(info, key) {
        return '<div class="sr-pagination"><span>' + (info.total ? ('Hiển thị ' + ((info.page - 1) * state.pageSize + 1) + '–' + Math.min(info.page * state.pageSize, info.total) + ' / ' + info.total) : '0 kết quả') + '</span><button type="button" data-page="' + key + '" data-step="-1"' + (info.page <= 1 ? ' disabled' : '') + '>Trước</button><span>Trang ' + info.page + ' / ' + info.pages + '</span><button type="button" data-page="' + key + '" data-step="1"' + (info.page >= info.pages ? ' disabled' : '') + '>Sau</button></div>';
    }
    function table(rows, key, kind) {
        var info = pageRows(searched(rows), key);
        var content;
        if (kind === 'contracts') {
            content = info.rows.map(function (row) {
                return '<tr><td><button type="button" class="sr-link" data-open-contract="' + esc(row.id) + '">' + esc(row.code) + '</button></td><td>' + esc(row.tenants) + '</td><td>' + esc(row.building) + '</td><td>' + esc(row.apartment) + '</td><td>' + dateLabel(row.startDate) + '</td><td>' + dateLabel(row.endDate) + '</td><td>' + (row.daysLeft === null ? '—' : row.daysLeft) + '</td><td>' + esc(statusLabel(row.category)) + '</td></tr>';
            }).join('');
            return '<div class="sr-table-wrap"><table><thead><tr><th>Mã hợp đồng</th><th>Người thuê</th><th>Tòa nhà</th><th>Căn hộ</th><th>Bắt đầu</th><th>Kết thúc</th><th>Còn (ngày)</th><th>Trạng thái</th></tr></thead><tbody>' + (content || '<tr><td colspan="8">' + empty() + '</td></tr>') + '</tbody></table></div>' + pagination(info, key);
        }
        if (kind === 'invoices') {
            content = info.rows.map(function (row) {
                return '<tr><td><button type="button" class="sr-link" data-open-invoice="' + esc(row.id) + '">' + esc(row.code) + '</button></td><td>' + esc(row.customer) + '</td><td>' + esc(row.building) + '</td><td>' + esc(row.apartment) + '</td><td>' + dateLabel(row.dueDate) + '</td><td>' + money(row.total) + '</td><td>' + money(row.paid) + '</td><td>' + money(row.remaining) + '</td><td>' + esc(statusLabel(row.status)) + (row.overdue ? ' · Quá hạn' : '') + '</td></tr>';
            }).join('');
            return '<div class="sr-table-wrap"><table><thead><tr><th>Mã hóa đơn</th><th>Cư dân</th><th>Tòa nhà</th><th>Căn hộ</th><th>Hạn thanh toán</th><th>Giá trị</th><th>Đã thu</th><th>Còn nợ</th><th>Trạng thái</th></tr></thead><tbody>' + (content || '<tr><td colspan="9">' + empty() + '</td></tr>') + '</tbody></table></div>' + pagination(info, key);
        }
        content = info.rows.map(function (row) {
            return '<tr><td><button type="button" class="sr-link" data-open-request="' + esc(row.id) + '">' + esc(row.code) + '</button></td><td>' + esc(row.title) + '</td><td>' + esc(row.sender) + '</td><td>' + esc(row.building) + '</td><td>' + esc(row.apartment) + '</td><td>' + dateLabel(row.createdAt) + '</td><td>' + esc(statusLabel(row.status)) + '</td></tr>';
        }).join('');
        return '<div class="sr-table-wrap"><table><thead><tr><th>Mã yêu cầu</th><th>Tiêu đề</th><th>Người gửi</th><th>Tòa nhà</th><th>Căn hộ</th><th>Ngày tạo</th><th>Trạng thái</th></tr></thead><tbody>' + (content || '<tr><td colspan="7">' + empty() + '</td></tr>') + '</tbody></table></div>' + pagination(info, key);
    }
    function chartCanvas(id, label, labels, values, color, type) {
        if (!labels.length) return empty('Chưa có dữ liệu biểu đồ trong phạm vi đã chọn.');
        if (typeof global.Chart !== 'function') {
            var max = Math.max.apply(Math, values.concat([1]));
            return '<div class="sr-bars" aria-label="' + esc(label) + '">' + labels.map(function (name, index) {
                return '<div class="sr-bar-row"><span>' + esc(name) + '</span><div><i style="width:' + Math.max(2, values[index] / max * 100) + '%"></i></div><b>' + esc(values[index]) + '</b></div>';
            }).join('') + '</div>';
        }
        return '<div class="sr-chart"><canvas id="' + id + '" aria-label="' + esc(label) + '"></canvas></div>';
    }
    function buildCharts(data) {
        Object.keys(charts).forEach(function (key) {
            try { charts[key].destroy(); } catch (error) { console.error('Không thể dọn biểu đồ thống kê.', error); }
        });
        charts = {};
        if (typeof global.Chart !== 'function') return;
        [
            ['apartments', 'sr-apartment-chart', 'Trạng thái căn hộ', ['Đang ở', 'Còn trống', 'Bảo trì / không khai thác'],
                [data.occupiedApartments, data.vacantApartments, data.maintenanceApartments], 'doughnut'],
            ['contracts', 'sr-contract-chart', 'Trạng thái hợp đồng', ['Hiệu lực (>30 ngày)', 'Sắp hết hạn', 'Đã hết hạn', 'Đã chấm dứt / hủy', 'Khác'],
                [data.contracts.statusCounts.active, data.contracts.statusCounts.expiring, data.contracts.statusCounts.expired, data.contracts.statusCounts.terminated, data.contracts.statusCounts.other], 'doughnut'],
            ['supportStatus', 'sr-support-status-chart', 'Trạng thái yêu cầu hỗ trợ', Object.keys(data.support.statusCounts).map(function (key) { return statusLabel(key); }),
                Object.keys(data.support.statusCounts).map(function (key) { return data.support.statusCounts[key]; }), 'doughnut'],
            ['supportTimeline', 'sr-support-timeline-chart', 'Yêu cầu hỗ trợ theo tháng', Object.keys(data.support.timeline).sort(),
                Object.keys(data.support.timeline).sort().map(function (key) { return data.support.timeline[key]; }), 'bar']
        ].forEach(function (entry) {
            var canvas = document.getElementById(entry[1]);
            if (!canvas) return;
            try {
                charts[entry[0]] = new global.Chart(canvas.getContext('2d'), {
                    type: entry[5],
                    data: { labels: entry[3], datasets: [{ label: entry[2], data: entry[4], backgroundColor: ['#1683ff', '#36a37a', '#f2a93b', '#e15b64', '#8b72c7'], borderWidth: 0 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: entry[5] === 'bar' || entry[0] === 'apartments' ? 'bottom' : 'right' } }, scales: entry[5] === 'bar' ? { y: { beginAtZero: true, ticks: { precision: 0 } } } : undefined }
                });
            } catch (error) {
                console.error('Không thể dựng biểu đồ thống kê.', error);
                canvas.parentElement.innerHTML = empty('Không thể hiển thị biểu đồ; dữ liệu chi tiết vẫn khả dụng.');
            }
        });
    }
    function styles() {
        if (document.getElementById('rh-statistics-styles')) return;
        var style = document.createElement('style');
        style.id = 'rh-statistics-styles';
        style.textContent = '#statistics-tab{padding-bottom:2rem;color:#172b45}#statistics-tab .sr-page{display:grid;gap:1rem}.sr-head,.sr-card{background:#fff;border:1px solid #e4eaf2;border-radius:15px;padding:1.15rem;box-shadow:0 6px 18px rgba(15,35,65,.035)}.sr-breadcrumb{font-size:.78rem;color:#7a8ba1;margin-bottom:.55rem}.sr-breadcrumb b{color:#1683ff}.sr-head h1{font-size:1.5rem;font-weight:800;color:#10213c}.sr-head p{color:#687c95;margin-top:.35rem;font-size:.87rem}.sr-meta{color:#8393a8;font-size:.75rem;margin-top:.6rem}.sr-filters{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:.7rem;align-items:end}.sr-filters label{display:grid;gap:.35rem;color:#61708a;font-size:.73rem;font-weight:700}.sr-filters select,.sr-filters input,.sr-search{width:100%;min-width:0;padding:.62rem .7rem;border:1px solid #dbe4ef;border-radius:8px;background:white;color:#334155;font:inherit;font-size:.82rem}.sr-filter-actions{display:flex;gap:.5rem;grid-column:1/-1;justify-content:flex-end}.sr-btn{border:1px solid #dbe4ef;border-radius:8px;background:#fff;padding:.62rem .8rem;color:#334155;font:600 .8rem inherit;cursor:pointer}.sr-btn.primary{background:#1683ff;color:#fff;border-color:#1683ff}.sr-group-title{display:flex;align-items:center;justify-content:space-between;gap:.7rem;margin-bottom:.8rem}.sr-group-title h2{font-size:1rem;font-weight:800;color:#173451}.sr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:.7rem}.sr-kpi{display:flex;align-items:flex-start;gap:.7rem;padding:.9rem;border:1px solid #e6edf5;border-radius:12px;background:#fff;min-width:0}.sr-kpi-icon{display:grid;place-items:center;flex:0 0 36px;height:36px;border-radius:10px;background:#eaf3ff;color:#1683ff}.sr-kpi-label{display:block;color:#71839a;font-size:.72rem;font-weight:700}.sr-kpi-value{display:block;margin-top:.23rem;color:#10213c;font-size:1.15rem;font-weight:800;overflow-wrap:anywhere}.sr-kpi small{display:block;margin-top:.23rem;color:#91a0b3;font-size:.68rem}.sr-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.sr-chart{height:265px;position:relative}.sr-bars{display:grid;gap:.65rem}.sr-bar-row{display:grid;grid-template-columns:minmax(90px,1fr) 3fr 35px;gap:.5rem;align-items:center;font-size:.76rem;color:#61708a}.sr-bar-row>div{height:10px;border-radius:9px;background:#edf3fa;overflow:hidden}.sr-bar-row i{display:block;height:100%;background:#1683ff;border-radius:9px}.sr-bar-row b{text-align:right;color:#233e5b}.sr-toolbar{display:flex;justify-content:space-between;gap:.7rem;align-items:center;margin-bottom:.75rem}.sr-toolbar h2{font-size:1rem;font-weight:800}.sr-table-wrap{overflow:auto}#statistics-tab table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:.76rem}#statistics-tab th,#statistics-tab td{padding:.65rem .7rem;border-bottom:1px solid #edf1f6;text-align:left}#statistics-tab th{background:#f8fafc;color:#647790;font-size:.7rem}#statistics-tab tbody tr:hover{background:#f8fbff}.sr-link{border:0;background:none;color:#0d65d5;text-decoration:underline;cursor:pointer;font:inherit;font-weight:700}.sr-pagination{display:flex;align-items:center;justify-content:flex-end;gap:.6rem;margin-top:.75rem;color:#74859b;font-size:.75rem}.sr-pagination button{padding:.35rem .55rem;border:1px solid #dbe4ef;border-radius:7px;background:#fff;cursor:pointer}.sr-pagination button:disabled{opacity:.45;cursor:default}.sr-empty{padding:1.2rem;text-align:center;color:#8a9ab0;font-size:.82rem}.sr-error{border:1px solid #f1b7b7;border-radius:12px;background:#fff5f5;padding:1rem;color:#9b2626}.sr-skeleton{height:84px;border-radius:10px;background:linear-gradient(90deg,#f1f4f8,#e6edf5,#f1f4f8);background-size:200% 100%;animation:sr-shimmer 1.2s infinite}@keyframes sr-shimmer{to{background-position:-200% 0}}.sr-search-wrap{display:flex;gap:.5rem;align-items:center}.sr-search{max-width:300px}@media(max-width:900px){.sr-filters{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:620px){.sr-head,.sr-card{padding:.85rem}.sr-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.sr-chart-grid{grid-template-columns:1fr}.sr-toolbar{align-items:flex-start;flex-direction:column}.sr-search{max-width:none}.sr-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.sr-kpi{padding:.7rem;gap:.45rem}.sr-kpi-icon{flex-basis:30px;height:30px}.sr-kpi-value{font-size:1rem}}@media print{.sr-filters,.sr-actions,.sr-pagination,.sr-search-wrap{display:none!important}.sr-card,.sr-head{box-shadow:none;break-inside:avoid}}';
        style.textContent += '.sr-actions{display:flex;justify-content:space-between;flex-wrap:wrap;gap:.75rem}.sr-actions>div{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem}.sr-sample-status{color:#71839a;font-size:.75rem}.sr-apartment-chart-card{padding:1rem 1.2rem}.sr-apartment-chart-content{width:min(100%,calc(100vw - 2rem),760px);margin:0 auto}.sr-apartment-chart-content .sr-chart{height:300px}.sr-apartment-chart-content .sr-bars{max-width:700px;margin:0 auto;padding:.75rem 0}@media(max-width:620px){.sr-apartment-chart-card{padding:.85rem}.sr-apartment-chart-content .sr-chart{height:240px}}';
        document.head.appendChild(style);
    }
    function renderError(root, error) {
        Object.keys(charts).forEach(function (key) { try { charts[key].destroy(); } catch (destroyError) { console.error('Không thể dọn biểu đồ thống kê.', destroyError); } });
        charts = {};
        root.innerHTML = '<div class="sr-page"><section class="sr-error" role="alert"><strong>Không thể tải dữ liệu thống kê. Vui lòng thử lại.</strong><p>' + esc(error && error.message ? error.message : '') + '</p><button class="sr-btn primary" type="button" data-retry-statistics>Thử lại</button></section></div>';
    }
    function renderContent(root, data, draft, error) {
        if (error) { renderError(root, error); return; }
        styles();
        var period = data.dates;
        var apartmentRate = data.occupancyRate === null ? 'Chưa đủ dữ liệu' : data.occupancyRate.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%';
        var contractsForTable = data.expiringContracts;
        var pageStatusContract = state.applied.contractStatus;
        if (pageStatusContract !== 'all') contractsForTable = contractsForTable.filter(function (row) { return row.category === pageStatusContract; });
        var apartmentStatusCounts = { occupied: data.occupiedApartments, vacant: data.vacantApartments, maintenance: data.maintenanceApartments };
        var contractChartLabels = ['Hiệu lực (>30 ngày)', 'Sắp hết hạn', 'Đã hết hạn', 'Đã chấm dứt / hủy', 'Khác'];
        var contractChartValues = [data.contracts.statusCounts.active, data.contracts.statusCounts.expiring, data.contracts.statusCounts.expired, data.contracts.statusCounts.terminated, data.contracts.statusCounts.other];
        var supportChartLabels = Object.keys(data.support.statusCounts).map(function (key) { return statusLabel(key); });
        var supportChartValues = Object.keys(data.support.statusCounts).map(function (key) { return data.support.statusCounts[key]; });
        var months = Object.keys(data.support.timeline).sort();
        var buildings = data.buildings;
        var periodOptions = [['today', 'Hôm nay'], ['7days', '7 ngày gần nhất'], ['30days', '30 ngày gần nhất'], ['month', 'Tháng này'], ['quarter', 'Quý này'], ['year', 'Năm nay'], ['custom', 'Tùy chỉnh']];
        var contractStatuses = [['all', 'Tất cả trạng thái'], ['active', 'Còn hiệu lực'], ['expired', 'Đã hết hạn'], ['terminated', 'Đã chấm dứt / hủy'], ['other', 'Khác']];
        var invoiceStatuses = [['all', 'Tất cả trạng thái'], ['paid', 'Đã thanh toán'], ['unpaid', 'Chưa thanh toán'], ['sent', 'Đã gửi'], ['overdue', 'Quá hạn'], ['partial', 'Thanh toán một phần'], ['partially_paid', 'Thanh toán một phần']];
        var supportStatuses = [['all', 'Tất cả trạng thái'], ['new', 'Mới tiếp nhận'], ['accepted', 'Đã tiếp nhận'], ['in_progress', 'Đang xử lý'], ['resolved', 'Đã giải quyết'], ['closed', 'Đã đóng']];
        var lastUpdated = data.lastUpdated ? new Date(data.lastUpdated).toLocaleString('vi-VN') : 'Chưa có dấu thời gian cập nhật từ dữ liệu';
        root.innerHTML = '<div class="sr-page">' +
            '<header class="sr-head"><div class="sr-breadcrumb">Báo cáo <span aria-hidden="true">/</span> <b>Thống kê</b></div><h1>Thống kê</h1><p>Theo dõi tình hình tòa nhà, căn hộ, cư dân, hợp đồng, hóa đơn và yêu cầu hỗ trợ trong hệ thống</p><div class="sr-meta">Dữ liệu cập nhật gần nhất: ' + esc(lastUpdated) + '</div></header>' +
            '<section class="sr-card"><div class="sr-filters"><label>Tòa nhà<select id="srBuilding">' + '<option value="">Tất cả tòa nhà</option>' + buildings.map(function (building) { return '<option value="' + esc(building.id) + '"' + (draft.building === building.id ? ' selected' : '') + '>' + esc(building.name || building.shortName || building.id) + '</option>'; }).join('') + '</select></label>' +
            '<label>Khoảng thời gian<select id="srPeriod">' + selectOptions(periodOptions, draft.period) + '</select></label>' +
            (draft.period === 'custom' ? '<label>Từ ngày<input id="srFrom" type="date" value="' + esc(draft.from || period.from) + '"></label><label>Đến ngày<input id="srTo" type="date" value="' + esc(draft.to || period.to) + '"></label>' : '') +
            '<label>Trạng thái hợp đồng<select id="srContractStatus">' + selectOptions(contractStatuses, draft.contractStatus) + '</select></label><label>Trạng thái hóa đơn<select id="srInvoiceStatus">' + selectOptions(invoiceStatuses, draft.invoiceStatus) + '</select></label><label>Trạng thái hỗ trợ<select id="srSupportStatus">' + selectOptions(supportStatuses, draft.supportStatus) + '</select></label>' +
            '<div class="sr-filter-actions"><button class="sr-btn" type="button" data-reset-statistics>Đặt lại</button><button class="sr-btn primary" type="button" data-apply-statistics>Áp dụng bộ lọc</button></div></div></section>' +
            (data.empty ? '<section class="sr-card">' + empty('Không có dữ liệu phù hợp với điều kiện thống kê đã chọn') + '<div style="text-align:center"><button type="button" class="sr-btn" data-reset-statistics>Đặt lại bộ lọc</button></div></section>' : '') +
            '<section><div class="sr-group-title"><h2>Tòa nhà và căn hộ</h2></div><div class="sr-kpis">' +
            kpi('Tổng số tòa nhà', data.totalBuildings, 'Theo phạm vi được cấp quyền và bộ lọc tòa nhà', 'fa-building') +
            kpi('Tổng số căn hộ', data.totalApartments, 'Các căn hộ thuộc lựa chọn tòa nhà', 'fa-door-closed') +
            kpi('Đang có người ở', data.occupiedApartments, 'Đếm theo căn hộ duy nhất có cư trú hiện hành', 'fa-house-user') +
            kpi('Còn trống', data.vacantApartments, 'Căn hộ đủ điều kiện và đang sẵn sàng', 'fa-door-open') +
            kpi('Bảo trì / không khai thác', data.maintenanceApartments, 'Không tính vào mẫu số lấp đầy', 'fa-screwdriver-wrench') +
            kpi('Tỷ lệ lấp đầy', apartmentRate, data.eligibleApartments + ' căn hộ đủ điều kiện khai thác', 'fa-chart-pie') +
            '</div><div class="sr-card sr-apartment-chart-card" style="margin-top:.75rem"><div class="sr-group-title"><h2>Phân loại căn hộ</h2></div><div class="sr-apartment-chart-content">' + chartCanvas('sr-apartment-chart', 'Trạng thái căn hộ', ['Đang ở', 'Còn trống', 'Bảo trì / không khai thác'], [apartmentStatusCounts.occupied, apartmentStatusCounts.vacant, apartmentStatusCounts.maintenance], '#1683ff', 'doughnut') + '</div></div></section>' +
            '<section><div class="sr-group-title"><h2>Cư dân</h2></div><div class="sr-kpis">' +
            kpi('Tổng hồ sơ khách hàng', data.residents.totalProfiles, 'Số hồ sơ duy nhất trong phạm vi đã chọn', 'fa-users') +
            kpi('Người đang cư trú', data.residents.current, 'Người duy nhất có hợp đồng hiệu lực hoặc căn hộ đang ở', 'fa-user-check') +
            kpi('Hồ sơ tạo mới', data.residents.newInPeriod, 'Trong kỳ ' + dateLabel(period.from) + ' – ' + dateLabel(period.to), 'fa-user-plus') +
            '</div></section>' +
            '<section><div class="sr-group-title"><h2>Hợp đồng</h2></div><div class="sr-kpis">' +
            kpi('Còn hiệu lực', data.contracts.active, 'Theo trạng thái và ngày bắt đầu / kết thúc hiện tại', 'fa-file-signature') +
            kpi('Hết hạn trong 7 ngày', data.contracts.expiring7, 'Đang có hiệu lực; tính từ hôm nay', 'fa-clock') +
            kpi('Hết hạn trong 30 ngày', data.contracts.expiring30, 'Đang có hiệu lực; tính từ hôm nay', 'fa-calendar-days') +
            kpi('Đã hết hạn', data.contracts.expired, 'Không tính hợp đồng đã chấm dứt / hủy', 'fa-calendar-xmark') +
            kpi('Đã chấm dứt / hủy', data.contracts.terminated, 'Nhóm trạng thái loại trừ riêng', 'fa-ban') +
            '</div><div class="sr-chart-grid" style="margin-top:.75rem"><div class="sr-card"><div class="sr-group-title"><h2>Cơ cấu trạng thái hợp đồng</h2></div>' + chartCanvas('sr-contract-chart', 'Cơ cấu hợp đồng', contractChartLabels, contractChartValues, '#1683ff', 'doughnut') + '</div><div class="sr-card"><div class="sr-toolbar"><h2>Hợp đồng sắp hết hạn</h2><div class="sr-search-wrap"><input class="sr-search" type="search" data-statistics-search placeholder="Tìm mã, căn hộ, người thuê..." value="' + esc(state.search) + '"></div></div>' + table(contractsForTable, 'contracts', 'contracts') + '</div></div></section>' +
            '<section><div class="sr-group-title"><h2>Hóa đơn và công nợ</h2></div><div class="sr-kpis">' +
            kpi('Hóa đơn đã thanh toán', data.invoiceSummary.paidCount, 'Số hóa đơn, không phải số tiền', 'fa-file-circle-check') +
            kpi('Giá trị hóa đơn đã thanh toán', money(data.invoiceSummary.paidTotal), 'Tổng giá trị của hóa đơn có trạng thái đã thanh toán', 'fa-money-bill-wave') +
            kpi('Thực thu ghi nhận', money(data.invoiceSummary.collected), 'Thanh toán trừ giao dịch hoàn tiền được liên kết', 'fa-circle-dollar-to-slot') +
            kpi('Hóa đơn còn nợ', data.invoiceSummary.unpaidCount, 'Chưa thanh toán hoặc thanh toán một phần', 'fa-file-invoice') +
            kpi('Tổng công nợ', money(data.invoiceSummary.debt), 'Số dư hóa đơn còn phải thu; không gồm hóa đơn hủy', 'fa-hand-holding-dollar') +
            kpi('Công nợ quá hạn', money(data.invoiceSummary.overdueDebt), 'Phần dư chưa thanh toán sau ngày đến hạn', 'fa-triangle-exclamation') +
            '</div><div class="sr-card" style="margin-top:.75rem"><div class="sr-toolbar"><h2>Chi tiết hóa đơn</h2><div class="sr-search-wrap"><input class="sr-search" type="search" data-statistics-search placeholder="Tìm mã hóa đơn, căn hộ, cư dân..." value="' + esc(state.search) + '"></div></div>' + table(data.invoiceRows, 'invoices', 'invoices') + '</div></section>' +
            '<section><div class="sr-group-title"><h2>Yêu cầu hỗ trợ</h2><span>' + dateLabel(period.from) + ' – ' + dateLabel(period.to) + '</span></div><div class="sr-kpis">' +
            kpi('Tạo trong kỳ', data.support.createdInPeriod, 'Theo ngày tạo; tôn trọng bộ lọc thời gian', 'fa-calendar-plus') +
            kpi('Mới tiếp nhận', data.support.new, 'Tồn tại tại thời điểm báo cáo', 'fa-inbox') +
            kpi('Đang xử lý', data.support.inProgress, 'Đã tiếp nhận hoặc đang xử lý', 'fa-spinner') +
            kpi('Đã giải quyết', data.support.resolved, 'Đã xử lý hoặc đã đóng', 'fa-circle-check') +
            kpi('Đang tồn đọng', data.support.backlog, 'Hiện trạng; không giới hạn theo thời gian tạo', 'fa-hourglass-half') +
            '</div><div class="sr-chart-grid" style="margin-top:.75rem"><div class="sr-card"><div class="sr-group-title"><h2>Yêu cầu tạo theo tháng</h2></div>' + chartCanvas('sr-support-timeline-chart', 'Yêu cầu hỗ trợ theo tháng', months, months.map(function (month) { return data.support.timeline[month]; }), '#1683ff', 'bar') + '</div><div class="sr-card"><div class="sr-group-title"><h2>Cơ cấu trạng thái yêu cầu</h2></div>' + chartCanvas('sr-support-status-chart', 'Trạng thái yêu cầu hỗ trợ', supportChartLabels, supportChartValues, '#1683ff', 'doughnut') + '</div></div><div class="sr-card" style="margin-top:.75rem"><div class="sr-toolbar"><h2>Danh sách yêu cầu trong kỳ</h2><div class="sr-search-wrap"><input class="sr-search" type="search" data-statistics-search placeholder="Tìm mã yêu cầu, tiêu đề, cư dân..." value="' + esc(state.search) + '"></div></div>' + table(data.periodRequests, 'requests', 'requests') + '</div></section>' +
            '<footer class="sr-actions"><div><button class="sr-btn" type="button" data-create-statistics-sample>Tạo bộ dữ liệu giả lập</button>' +
            (data.sampleActive ? ' <button class="sr-btn" type="button" data-remove-statistics-sample>Xóa bộ dữ liệu giả lập</button><span class="sr-sample-status">Đang bật trong trang Thống kê</span>' : '') +
            '</div><div><button class="sr-btn" type="button" data-export-statistics>Xuất CSV</button><button class="sr-btn" type="button" data-print-statistics>In báo cáo</button></div></footer></div>';
        buildCharts(data);
    }
    function renderLoading(root) {
        Object.keys(charts).forEach(function (key) { try { charts[key].destroy(); } catch (error) { console.error('Không thể dọn biểu đồ thống kê.', error); } });
        charts = {};
        root.innerHTML = '<div class="sr-page" aria-busy="true"><div class="sr-skeleton"></div><div class="sr-skeleton"></div><div class="sr-skeleton"></div></div>';
    }
    function render() {
        var root = document.getElementById('statistics-tab');
        if (!root) return;
        styles();
        var request = ++generation;
        var draft = Object.assign({}, state.draft || state.applied);
        renderLoading(root);
        global.setTimeout(function () {
            if (request !== generation || !document.getElementById('statistics-tab')) return;
            try {
                var data = readData(state.applied);
                cached = data;
                renderContent(root, data, draft, null);
                bind(root);
            } catch (error) {
                console.error('Không thể tải dữ liệu thống kê.', error);
                renderContent(root, null, draft, error);
                bind(root);
            }
        }, 0);
    }
    function bind(root) {
        function readDraft() {
            var draft = Object.assign({}, state.draft || state.applied);
            var value = function (selector, fallback) {
                var element = root.querySelector(selector);
                return element ? element.value : fallback;
            };
            draft.building = value('#srBuilding', draft.building);
            draft.period = value('#srPeriod', draft.period);
            draft.from = value('#srFrom', draft.from);
            draft.to = value('#srTo', draft.to);
            draft.contractStatus = value('#srContractStatus', draft.contractStatus);
            draft.invoiceStatus = value('#srInvoiceStatus', draft.invoiceStatus);
            draft.supportStatus = value('#srSupportStatus', draft.supportStatus);
            state.draft = draft;
            return draft;
        }
        root.querySelectorAll('#srBuilding, #srPeriod, #srContractStatus, #srInvoiceStatus, #srSupportStatus').forEach(function (control) {
            control.onchange = function () {
                var draft = readDraft();
                if (control.id === 'srPeriod') render();
                else {
                    var message = root.querySelector('[data-filter-error]');
                    if (message) message.remove();
                }
                if (draft.period === 'custom' && control.id === 'srPeriod') return;
            };
        });
        root.querySelectorAll('#srFrom, #srTo').forEach(function (control) {
            control.onchange = function () {
                readDraft();
                var message = root.querySelector('[data-filter-error]');
                if (message) message.remove();
            };
        });
        root.querySelectorAll('[data-apply-statistics]').forEach(function (button) {
            button.onclick = function () {
                var draft = readDraft();
                var period = draft.period;
                var from = draft.from;
                var to = draft.to;
                if (period === 'custom' && (!from || !to || from > to)) {
                    var message = root.querySelector('[data-filter-error]');
                    if (!message) {
                        message = document.createElement('p');
                        message.setAttribute('data-filter-error', '');
                        message.className = 'sr-error';
                        root.querySelector('.sr-filter-actions').before(message);
                    }
                    message.textContent = 'Ngày bắt đầu không được lớn hơn ngày kết thúc; hãy chọn đầy đủ cả hai ngày.';
                    return;
                }
                state.applied = {
                    building: root.querySelector('#srBuilding').value, period: period, from: from, to: to,
                    contractStatus: root.querySelector('#srContractStatus').value,
                    invoiceStatus: root.querySelector('#srInvoiceStatus').value,
                    supportStatus: root.querySelector('#srSupportStatus').value
                };
                state.draft = Object.assign({}, state.applied);
                state.page = { contracts: 1, invoices: 1, requests: 1 };
                render();
            };
        });
        root.querySelectorAll('[data-reset-statistics]').forEach(function (button) {
            button.onclick = function () {
                state.applied = { building: '', period: 'month', from: '', to: '', contractStatus: 'all', invoiceStatus: 'all', supportStatus: 'all' };
                state.draft = null;
                state.search = '';
                state.page = { contracts: 1, invoices: 1, requests: 1 };
                render();
            };
        });
        root.querySelectorAll('[data-page]').forEach(function (button) {
            button.onclick = function () {
                var key = button.getAttribute('data-page');
                state.page[key] += Number(button.getAttribute('data-step')) || 0;
                render();
            };
        });
        root.querySelectorAll('[data-statistics-search]').forEach(function (input) {
            input.oninput = function () {
                var fields = Array.prototype.slice.call(root.querySelectorAll('[data-statistics-search]'));
                var fieldIndex = fields.indexOf(input);
                state.search = input.value;
                state.page = { contracts: 1, invoices: 1, requests: 1 };
                render();
                global.setTimeout(function () {
                    var updatedFields = document.querySelectorAll('#statistics-tab [data-statistics-search]');
                    var field = updatedFields[fieldIndex];
                    if (field && field.value === state.search) {
                        field.focus();
                        if (typeof field.setSelectionRange === 'function') field.setSelectionRange(state.search.length, state.search.length);
                    }
                }, 0);
            };
        });
        root.querySelectorAll('[data-retry-statistics]').forEach(function (button) { button.onclick = render; });
        root.querySelectorAll('[data-create-statistics-sample]').forEach(function (button) {
            button.onclick = function () {
                if (!global.confirm('Tạo bộ dữ liệu minh họa riêng cho trang Thống kê? Dữ liệu này không được ghi vào hồ sơ nghiệp vụ, hóa đơn hay sổ thu chi.')) return;
                try {
                    global.localStorage.setItem(sampleStorageKey(), JSON.stringify(createSampleDataset()));
                    render();
                } catch (error) {
                    console.error('Không thể tạo bộ dữ liệu giả lập thống kê.', error);
                    global.alert('Không thể tạo bộ dữ liệu giả lập. Vui lòng thử lại.');
                }
            };
        });
        root.querySelectorAll('[data-remove-statistics-sample]').forEach(function (button) {
            button.onclick = function () {
                if (!global.confirm('Xóa riêng bộ dữ liệu giả lập khỏi trang Thống kê? Dữ liệu nghiệp vụ khác sẽ được giữ nguyên.')) return;
                try {
                    global.localStorage.removeItem(sampleStorageKey());
                    render();
                } catch (error) {
                    console.error('Không thể xóa bộ dữ liệu giả lập thống kê.', error);
                    global.alert('Không thể xóa bộ dữ liệu giả lập. Vui lòng thử lại.');
                }
            };
        });
        root.querySelectorAll('[data-open-contract]').forEach(function (button) {
            button.onclick = function () {
                var id = button.getAttribute('data-open-contract');
                if (global.RHUI && global.RHUI.openContractForm) { global.RHUI.openContractForm(id); return; }
                global.switchTab('contracts');
            };
        });
        root.querySelectorAll('[data-open-invoice]').forEach(function (button) {
            button.onclick = function () {
                var id = button.getAttribute('data-open-invoice');
                if (global.RHUI && global.RHUI.previewInvoice) { global.RHUI.previewInvoice(id); return; }
                global.switchTab('invoices');
            };
        });
        root.querySelectorAll('[data-open-request]').forEach(function (button) {
            button.onclick = function () {
                var id = button.getAttribute('data-open-request');
                if (global.RHUI && global.RHUI.openSupportForm) { global.RHUI.openSupportForm(id); return; }
                global.switchTab('support');
            };
        });
        root.querySelectorAll('[data-export-statistics]').forEach(function (button) { button.onclick = exportCsv; });
        root.querySelectorAll('[data-print-statistics]').forEach(function (button) { button.onclick = function () { global.print(); }; });
    }
    function exportCsv() {
        if (!cached) return;
        var rows = [
            ['Nhóm', 'Mã', 'Tên / nội dung', 'Tòa nhà', 'Căn hộ', 'Trạng thái', 'Ngày', 'Giá trị', 'Đã thu', 'Còn nợ']
        ];
        searched(cached.expiringContracts).forEach(function (row) { rows.push(['Hợp đồng sắp hết hạn', row.code, row.tenants, row.building, row.apartment, statusLabel(row.category), row.startDate + ' - ' + row.endDate, '', '', '']); });
        searched(cached.invoiceRows).forEach(function (row) { rows.push(['Hóa đơn', row.code, row.customer, row.building, row.apartment, statusLabel(row.status), row.dueDate, row.total, row.paid, row.remaining]); });
        searched(cached.periodRequests).forEach(function (row) { rows.push(['Yêu cầu hỗ trợ trong kỳ', row.code, row.title + ' · ' + row.sender, row.building, row.apartment, statusLabel(row.status), row.createdAt, '', '', '']); });
        var csv = '\ufeff' + rows.map(function (row) { return row.map(function (cell) { return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
        var link = document.createElement('a');
        var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        link.href = url;
        link.download = 'residenthub-statistics-' + localDate(new Date()) + '.csv';
        link.click();
        global.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    global.RHStatisticsReport = {
        render: render,
        refresh: render,
        calculate: calculate,
        createSampleDataset: createSampleDataset,
        getState: function () { return { applied: Object.assign({}, state.applied), search: state.search }; }
    };
    global.addEventListener('residenthub:business-data-changed', function (event) {
        var root = document.getElementById('statistics-tab');
        if (root && event.detail && event.detail.mode === (global.RHD_MODE || 'live') && root.style.display !== 'none') render();
    });
    global.addEventListener('storage', function (event) {
        var root = document.getElementById('statistics-tab');
        var prefix = 'residenthub_' + (global.RHD_MODE || 'live') + '_';
        if (root && root.style.display !== 'none' && (!event.key || event.key.indexOf(prefix) === 0)) render();
    });
})(window);
