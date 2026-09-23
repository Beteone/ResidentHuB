/*
 * ResidentHub - shared business data module (RHD).
 * Same pattern as auth.js: no backend, localStorage is the source of truth.
 * Holds Buildings -> Apartments -> Customers -> Meter readings -> Contracts -> Invoices
 * and keeps every module cross-linked so data entered once is reused everywhere.
 *
 * Two independent datasets share this same API via RHD.setMode():
 *  - 'live'  : real data for a logged-in manager account (localStorage residenthub_live_*)
 *  - 'demo'  : sandboxed data for the unauthenticated "Xem không gian quản lý" demo
 *              (localStorage residenthub_demo_*), capped by DEMO_LIMITS so the free
 *              demo never becomes a substitute for a paid account.
 * Nothing under 'demo' is ever read by 'live' screens and vice versa.
 */
(function (global) {
    var ENTITIES = ['buildings', 'apartments', 'customers', 'meters', 'contracts', 'invoices'];

    // Single source of truth for Demo Mode caps — change values here only, every
    // screen (banner, add-buttons, block messages) reads through RHD.limitInfo().
    // Sized as: seed sample data + roughly one more round the visitor enters themselves.
    var DEMO_LIMITS = {
        buildings: 2,
        apartments: 6,
        customers: 10,
        meters: 12,
        contracts: 6,
        invoices: 10
    };

    var DEMO_LIMIT_LABELS = {
        buildings: 'tòa nhà',
        apartments: 'căn hộ',
        customers: 'khách hàng',
        meters: 'bản ghi chỉ số',
        contracts: 'hợp đồng',
        invoices: 'hóa đơn'
    };

    var FEE_TYPES = [
        { id: 'rent', label: 'Tiền nhà' },
        { id: 'deposit', label: 'Tiền cọc' },
        { id: 'electricity', label: 'Tiền điện' },
        { id: 'water', label: 'Tiền nước' },
        { id: 'cleaning', label: 'Tiền vệ sinh' },
        { id: 'internet', label: 'Tiền internet' },
        { id: 'management', label: 'Phí quản lý' },
        { id: 'parking', label: 'Phí gửi xe' },
        { id: 'service', label: 'Phí dịch vụ' },
        { id: 'other', label: 'Phí khác' }
    ];

    var CALC_METHODS = [
        { id: 'fixed', label: 'Mức cố định' },
        { id: 'meter', label: 'Theo chỉ số (điện/nước)' },
        { id: 'quantity', label: 'Theo số lượng' },
        { id: 'apartment', label: 'Theo căn hộ' },
        { id: 'person', label: 'Theo đầu người' },
        { id: 'cycle', label: 'Theo kỳ thanh toán' }
    ];

    var APARTMENT_STATUSES = [
        { id: 'vacant', label: 'Trống', color: '#1683ff', bg: '#eaf3ff' },
        { id: 'occupied', label: 'Đang ở', color: '#18a878', bg: '#e6f8ef' },
        { id: 'deposited', label: 'Đã đặt cọc', color: '#a5680c', bg: '#fff4df' },
        { id: 'maintenance', label: 'Đang bảo trì', color: '#ef4444', bg: '#fee2e2' }
    ];

    var VEHICLE_TYPES = ['Ô tô', 'Ô tô điện', 'Xe máy', 'Xe máy điện', 'Xe đạp'];

    var PAYMENT_CYCLES = [
        { id: 'monthly', label: 'Hàng tháng' },
        { id: 'quarterly', label: 'Hàng quý' },
        { id: 'yearly', label: 'Hàng năm' }
    ];

    var INVOICE_STATUSES = [
        { id: 'unpaid', label: 'Chưa thanh toán', color: '#a5680c', bg: '#fff4df' },
        { id: 'sent', label: 'Đã gửi', color: '#0d65d5', bg: '#eaf3ff' },
        { id: 'paid', label: 'Đã thanh toán', color: '#18a878', bg: '#e6f8ef' },
        { id: 'overdue', label: 'Quá hạn', color: '#ef4444', bg: '#fee2e2' }
    ];

    // Small reference list — not the full VN administrative dataset (out of scope for a
    // demo/pitch app). Wards are free-typed with suggestions instead of a full mapping.
    var PROVINCES = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Thái Nguyên',
        'Bắc Ninh', 'Nghệ An', 'Thanh Hóa', 'Khánh Hòa', 'Lâm Đồng', 'Bình Dương', 'Đồng Nai', 'Quảng Ninh'];
    var WARD_SUGGESTIONS = {
        'Thái Nguyên': ['Phường Tích Lương', 'Phường Gia Sàng', 'Phường Phú Xá'],
        'Hà Nội': ['Phường Cầu Giấy', 'Phường Ba Đình', 'Phường Hoàng Mai'],
        'TP. Hồ Chí Minh': ['Phường Bến Nghé', 'Phường Tân Định', 'Phường An Phú']
    };

    function mode() { return global.RHD_MODE || 'live'; }
    function prefix() { return 'residenthub_' + mode() + '_'; }
    function key(entity) { return prefix() + entity; }

    function readAll(entity) {
        try {
            var raw = localStorage.getItem(key(entity));
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function writeAll(entity, list) {
        localStorage.setItem(key(entity), JSON.stringify(list));
    }

    function genId(prefixStr) {
        return (prefixStr || 'id') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }

    function pad(num, len) {
        var s = String(num);
        while (s.length < len) s = '0' + s;
        return s;
    }

    function list(entity) { return readAll(entity); }

    function get(entity, id) {
        var items = readAll(entity);
        for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
        return null;
    }

    function limitInfo(entity) {
        if (mode() !== 'demo') return { limited: false };
        var max = DEMO_LIMITS[entity];
        var count = readAll(entity).length;
        var reached = count >= max;
        // "near" = warn before the visitor actually hits the wall (70% of the cap).
        var near = !reached && count >= Math.ceil(max * 0.7);
        return { limited: true, max: max, count: count, reached: reached, near: near, label: DEMO_LIMIT_LABELS[entity] };
    }

    function create(entity, data) {
        if (mode() === 'demo') {
            var info = limitInfo(entity);
            if (info.reached) {
                return { ok: false, limitReached: true, error: 'Bạn đã đạt giới hạn ' + info.max + ' ' + info.label + ' trong bản Demo.' };
            }
        }
        var items = readAll(entity);
        var record = Object.assign({ id: genId(entity), createdAt: Date.now() }, data);
        items.push(record);
        writeAll(entity, items);
        return { ok: true, item: record };
    }

    function update(entity, id, patch) {
        var items = readAll(entity);
        var idx = -1;
        for (var i = 0; i < items.length; i++) if (items[i].id === id) { idx = i; break; }
        if (idx === -1) return { ok: false, error: 'Không tìm thấy bản ghi.' };
        items[idx] = Object.assign({}, items[idx], patch, { id: items[idx].id, createdAt: items[idx].createdAt });
        writeAll(entity, items);
        return { ok: true, item: items[idx] };
    }

    function remove(entity, id) {
        var items = readAll(entity);
        var next = items.filter(function (r) { return r.id !== id; });
        if (next.length === items.length) return { ok: false, error: 'Không tìm thấy bản ghi.' };
        writeAll(entity, next);
        return { ok: true };
    }

    // ---- derived helpers -------------------------------------------------

    function buildingFullAddress(building) {
        if (!building) return '';
        return [building.addressDetail, building.ward, building.province].filter(Boolean).join(', ');
    }

    function apartmentsOf(buildingId) {
        return readAll('apartments').filter(function (a) { return a.buildingId === buildingId; });
    }

    function contractsOf(apartmentId) {
        return readAll('contracts').filter(function (c) { return c.apartmentId === apartmentId; });
    }

    function activeContractFor(apartmentId) {
        var contracts = contractsOf(apartmentId).filter(function (c) { return c.status !== 'ended'; });
        contracts.sort(function (a, b) { return b.createdAt - a.createdAt; });
        return contracts[0] || null;
    }

    function latestMeter(apartmentId, meterType) {
        var readings = readAll('meters').filter(function (m) { return m.apartmentId === apartmentId && m.meterType === meterType; });
        readings.sort(function (a, b) { return b.createdAt - a.createdAt; });
        return readings[0] || null;
    }

    // ---- code generators ---------------------------------------------------

    function nextBuildingCode() {
        var n = readAll('buildings').length + 1;
        return 'TN' + pad(n, 4);
    }

    function nextContractCode(building, apartment) {
        var year = new Date().getFullYear();
        var seq = readAll('contracts').length + 1;
        var buildingTag = (building && (building.shortName || building.name) || 'TN').toUpperCase().replace(/\s+/g, '').slice(0, 6);
        var aptTag = (apartment && apartment.name || 'CH').toUpperCase().replace(/\s+/g, '');
        return buildingTag + '-' + aptTag + '-' + year + '-' + pad(seq, 3);
    }

    function nextInvoiceCode() {
        var year = new Date().getFullYear();
        var seq = readAll('invoices').length + 1;
        return 'HD' + year + '-' + pad(seq, 4);
    }

    // ---- fee calculation ----------------------------------------------------

    // Computes one invoice line for a building service, using a meter reading
    // when the service is billed 'meter'-style (electricity/water) and a
    // generic quantity for the other calc methods. This is a pitch-ready
    // approximation, not a full billing engine.
    function calcServiceAmount(service, ctx) {
        ctx = ctx || {};
        var unitPrice = Number(service.unitPrice) || 0;
        var qty = 1;
        if (service.calcMethod === 'meter') {
            var reading = ctx.meterReading;
            qty = reading ? Number(reading.consumption) || 0 : 0;
        } else if (service.calcMethod === 'quantity' || service.calcMethod === 'person') {
            qty = ctx.quantity != null ? Number(ctx.quantity) : 1;
        } else {
            qty = 1;
        }
        var amount = unitPrice * qty;
        var tax = amount * (Number(service.taxRate) || 0) / 100;
        return { qty: qty, unitPrice: unitPrice, amount: amount, tax: tax, total: amount + tax };
    }

    // ---- demo seed -----------------------------------------------------------

    function seedDataset(targetMode) {
        var prevMode = global.RHD_MODE;
        global.RHD_MODE = targetMode;
        try {
            if (readAll('buildings').length > 0) return;

            var building = {
                id: genId('building'), code: 'TN0001', name: 'Chung cư Riverside Residence', shortName: 'CT1',
                province: 'Thái Nguyên', ward: 'Phường Tích Lương', addressDetail: 'Tổ 14',
                services: [
                    { id: genId('svc'), name: 'Tiền thuê nhà', feeType: 'rent', calcMethod: 'fixed', unitPrice: 0, taxRate: 0 },
                    { id: genId('svc'), name: 'Tiền điện', feeType: 'electricity', calcMethod: 'meter', unitPrice: 3800, taxRate: 8 },
                    { id: genId('svc'), name: 'Tiền nước', feeType: 'water', calcMethod: 'meter', unitPrice: 18000, taxRate: 5 },
                    { id: genId('svc'), name: 'Vệ sinh chung cư', feeType: 'cleaning', calcMethod: 'apartment', unitPrice: 50000, taxRate: 0 },
                    { id: genId('svc'), name: 'Internet cáp quang', feeType: 'internet', calcMethod: 'apartment', unitPrice: 100000, taxRate: 0 },
                    { id: genId('svc'), name: 'Phí quản lý vận hành', feeType: 'management', calcMethod: 'apartment', unitPrice: 150000, taxRate: 0 },
                    { id: genId('svc'), name: 'Phí gửi xe máy', feeType: 'parking', calcMethod: 'quantity', unitPrice: 100000, taxRate: 0 }
                ],
                config: {
                    autoDebitAccount: '', eInvoiceEnabled: false, eInvoiceProvider: '',
                    bankName: 'Vietcombank', bankAccountNumber: '', bankAccountHolder: ''
                },
                contractTemplateId: global.RHT ? (global.RHT.getDefault('CONTRACT') || {}).id : '',
                invoiceTemplateId: global.RHT ? (global.RHT.getDefault('INVOICE') || {}).id : '',
                createdAt: Date.now()
            };
            writeAll('buildings', [building]);

            var fullAddress = buildingFullAddress(building);
            var invoiceTemplateId = global.RHT ? (global.RHT.getDefault('INVOICE') || {}).id : '';
            var contractTemplateId = global.RHT ? (global.RHT.getDefault('CONTRACT') || {}).id : '';
            var apt1 = { id: genId('apartment'), buildingId: building.id, name: '501', floor: 'Tầng 5', area: 20, maxGuests: 2, rentPrice: 2000000, depositPrice: 2000000, status: 'occupied', active: true, invoiceTemplateId: invoiceTemplateId, contractTemplateId: contractTemplateId, address: fullAddress, photos: [], note: '', createdAt: Date.now() };
            var apt2 = { id: genId('apartment'), buildingId: building.id, name: '502', floor: 'Tầng 5', area: 22, maxGuests: 3, rentPrice: 2200000, depositPrice: 2200000, status: 'deposited', active: true, invoiceTemplateId: invoiceTemplateId, contractTemplateId: contractTemplateId, address: fullAddress, photos: [], note: '', createdAt: Date.now() };
            var apt3 = { id: genId('apartment'), buildingId: building.id, name: '503', floor: 'Tầng 5', area: 18, maxGuests: 2, rentPrice: 1800000, depositPrice: 1800000, status: 'vacant', active: true, invoiceTemplateId: invoiceTemplateId, contractTemplateId: contractTemplateId, address: fullAddress, photos: [], note: '', createdAt: Date.now() };
            writeAll('apartments', [apt1, apt2, apt3]);

            var cus1 = { id: genId('customer'), fullName: 'Nguyễn Thị Hoa', phone: '0984646471', email: 'hoa.nguyen@email.vn', dob: '1996-03-12', gender: 'Nữ', idNumber: '017296001234', idIssueDate: '2020-05-10', idFrontPhoto: '', idBackPhoto: '', province: 'Thái Nguyên', ward: 'Phường Tích Lương', addressDetail: 'Tổ 14', customerType: 'Cá nhân', note: '', consultantName: 'Trần Văn Bình', consultantPhone: '0912345678', doorFingerprintCode: 'VT-0231', isForeigner: false, nationality: '', passportNumber: '', passportType: '', passportExpiry: '', passportPhoto: '', vehicles: [{ id: genId('veh'), type: 'Xe máy', model: 'Honda Vision', plate: '20-H1 123.45', color: 'Trắng', photo: '', ticket: 'VX-0501' }], createdAt: Date.now() };
            var cus2 = { id: genId('customer'), fullName: 'Lê Minh Đức', phone: '0977123456', email: '', dob: '1990-11-02', gender: 'Nam', idNumber: '017290005678', idIssueDate: '2019-02-18', idFrontPhoto: '', idBackPhoto: '', province: 'Thái Nguyên', ward: 'Phường Tích Lương', addressDetail: 'Tổ 14', customerType: 'Cá nhân', note: 'Đã đặt cọc căn 502', consultantName: 'Trần Văn Bình', consultantPhone: '0912345678', doorFingerprintCode: 'VT-0232', isForeigner: false, nationality: '', passportNumber: '', passportType: '', passportExpiry: '', passportPhoto: '', vehicles: [], createdAt: Date.now() };
            writeAll('customers', [cus1, cus2]);

            var contract1 = {
                id: genId('contract'), code: building.shortName + '-501-' + new Date().getFullYear() + '-001',
                buildingId: building.id, apartmentId: apt1.id, customerId: cus1.id,
                startDate: '2026-01-01', endDate: '2026-12-31', signDate: '2025-12-28',
                contractTemplateId: building.contractTemplateId, invoiceTemplateId: building.invoiceTemplateId,
                rentPrice: apt1.rentPrice, depositPrice: apt1.depositPrice, paymentCycle: 'monthly',
                referrer: '', collaborator: 'Trần Văn Bình', note: '', files: [], status: 'active', createdAt: Date.now()
            };
            writeAll('contracts', [contract1]);

            var meter1 = { id: genId('meter'), buildingId: building.id, apartmentId: apt1.id, meterType: 'electricity', meterCode: 'CTĐ-501', previousIndex: 80, latestIndex: 100, periodMonth: '2026-09', closingDate: '2026-09-30', consumption: 20, photo: '', createdAt: Date.now() };
            var meter2 = { id: genId('meter'), buildingId: building.id, apartmentId: apt1.id, meterType: 'water', meterCode: 'CTN-501', previousIndex: 10, latestIndex: 16, periodMonth: '2026-09', closingDate: '2026-09-30', consumption: 6, photo: '', createdAt: Date.now() };
            writeAll('meters', [meter1, meter2]);

            var elecSvc = building.services[1], waterSvc = building.services[2];
            var elecLine = calcServiceAmount(elecSvc, { meterReading: meter1 });
            var waterLine = calcServiceAmount(waterSvc, { meterReading: meter2 });
            var rentLine = { qty: 1, unitPrice: apt1.rentPrice, amount: apt1.rentPrice, tax: 0, total: apt1.rentPrice };
            var items = [
                { serviceId: building.services[0].id, label: 'Tiền thuê nhà', qty: 1, unitPrice: rentLine.unitPrice, amount: rentLine.amount, tax: rentLine.tax },
                { serviceId: elecSvc.id, label: 'Tiền điện (' + elecLine.qty + ' kWh)', qty: elecLine.qty, unitPrice: elecLine.unitPrice, amount: elecLine.amount, tax: elecLine.tax },
                { serviceId: waterSvc.id, label: 'Tiền nước (' + waterLine.qty + ' m³)', qty: waterLine.qty, unitPrice: waterLine.unitPrice, amount: waterLine.amount, tax: waterLine.tax }
            ];
            var subtotal = items.reduce(function (s, it) { return s + it.amount; }, 0);
            var taxTotal = items.reduce(function (s, it) { return s + it.tax; }, 0);
            var invoice1 = {
                id: genId('invoice'), code: 'HD' + new Date().getFullYear() + '-0001', contractId: contract1.id,
                buildingId: building.id, apartmentId: apt1.id, customerId: cus1.id,
                period: '2026-09', issueDate: '2026-09-30', dueDate: '2026-10-10',
                items: items, subtotal: subtotal, tax: taxTotal, total: subtotal + taxTotal,
                status: 'unpaid', sentAt: null, paidAt: null, createdAt: Date.now()
            };
            writeAll('invoices', [invoice1]);
        } finally {
            global.RHD_MODE = prevMode;
        }
    }

    function setMode(m) {
        global.RHD_MODE = m === 'demo' ? 'demo' : 'live';
        // Template library seeds first — building seed data below references
        // RHT.getDefault() to pick its default contract/invoice template.
        if (global.RHT) global.RHT.seed();
        // Seeds once (seedDataset no-ops once a dataset already has data), so a demo
        // visitor always sees a complete sample system on first visit, and anything
        // they add afterwards persists alongside it instead of being wiped.
        // DEMO_LIMITS is sized with headroom above the seed so "Thêm" stays usable.
        seedDataset(global.RHD_MODE);
    }

    function resetDemo() {
        ENTITIES.forEach(function (entity) {
            localStorage.removeItem('residenthub_demo_' + entity);
        });
        localStorage.removeItem('residenthub_demo_templates');
        if (global.RHT) global.RHT.seed();
        seedDataset('demo');
    }

    global.RHD = {
        ENTITIES: ENTITIES,
        DEMO_LIMITS: DEMO_LIMITS,
        FEE_TYPES: FEE_TYPES,
        CALC_METHODS: CALC_METHODS,
        APARTMENT_STATUSES: APARTMENT_STATUSES,
        VEHICLE_TYPES: VEHICLE_TYPES,
        PAYMENT_CYCLES: PAYMENT_CYCLES,
        INVOICE_STATUSES: INVOICE_STATUSES,
        PROVINCES: PROVINCES,
        WARD_SUGGESTIONS: WARD_SUGGESTIONS,
        setMode: setMode,
        mode: mode,
        list: list,
        get: get,
        create: create,
        update: update,
        remove: remove,
        limitInfo: limitInfo,
        apartmentsOf: apartmentsOf,
        contractsOf: contractsOf,
        activeContractFor: activeContractFor,
        latestMeter: latestMeter,
        nextBuildingCode: nextBuildingCode,
        nextContractCode: nextContractCode,
        nextInvoiceCode: nextInvoiceCode,
        buildingFullAddress: buildingFullAddress,
        calcServiceAmount: calcServiceAmount,
        resetDemo: resetDemo
    };
})(window);
