/*
 * ============================================================
 * ResidentHub - db.js  |  Database Module Trung Tâm  v1.0
 * ============================================================
 *
 * File này là nguồn dữ liệu duy nhất (single source of truth) cho
 * toàn bộ ResidentHub.  Dữ liệu được lưu trong localStorage, chia
 * thành 10 STORE riêng biệt để dễ quản lý và mở rộng.
 *
 * STORE            KEY localStorage            Mô tả
 * ---------------------------------------------------------
 * users            rh_db_users                 Tài khoản
 * sessions         rh_db_sessions              Lịch sử đăng nhập
 * buildings        rh_db_buildings             Toà nhà
 * apartments       rh_db_apartments            Căn hộ
 * customers        rh_db_customers             Khách hàng / cư dân
 * contracts        rh_db_contracts             Hợp đồng thuê
 * meters           rh_db_meters                Chỉ số điện / nước
 * invoices         rh_db_invoices              Hoá đơn
 * notifications    rh_db_notifications         Thông báo cư dân
 * activity_log     rh_db_activity_log          Nhật ký mọi hành động
 * ---------------------------------------------------------
 *
 * Hai chế độ dữ liệu độc lập chia sẻ cùng API qua RHDB.setMode():
 *  - 'live' : dữ liệu thực cho tài khoản đã đăng nhập  (rh_db_live_*)
 *  - 'demo' : sandbox cho "Xem không gian quản lý"      (rh_db_demo_*)
 *            bị giới hạn bởi DEMO_LIMITS để bản demo
 *            không thay thế được tài khoản trả phí.
 */
(function (global) {
    'use strict';

    /* ==============================================================
     * 1. CONSTANTS & ENUMERATIONS
     * ============================================================== */

    var STORES = ['users', 'sessions', 'buildings', 'apartments', 'customers',
                  'contracts', 'meters', 'invoices', 'notifications', 'activity_log'];

    var DEMO_LIMITS = {
        buildings: 2, apartments: 6, customers: 10,
        contracts: 6, meters: 12, invoices: 10, notifications: 20
    };

    var DEMO_LIMIT_LABELS = {
        buildings: 'toà nhà', apartments: 'căn hộ', customers: 'khách hàng',
        contracts: 'hợp đồng', meters: 'bản ghi chỉ số', invoices: 'hoá đơn', notifications: 'thông báo'
    };

    var ROLES = { MANAGER: 'manager', RESIDENT: 'resident' };

    var FEE_TYPES = [
        { id: 'rent', label: 'Tiền thuê nhà' }, { id: 'deposit', label: 'Tiền cọc' },
        { id: 'electricity', label: 'Tiền điện' }, { id: 'water', label: 'Tiền nước' },
        { id: 'cleaning', label: 'Tiền vệ sinh' }, { id: 'internet', label: 'Tiền internet' },
        { id: 'management', label: 'Phí quản lý' }, { id: 'parking', label: 'Phí gửi xe' },
        { id: 'service', label: 'Phí dịch vụ' }, { id: 'other', label: 'Phí khác' }
    ];

    var CALC_METHODS = [
        { id: 'fixed', label: 'Mức cố định' }, { id: 'meter', label: 'Theo chỉ số (điện/nước)' },
        { id: 'quantity', label: 'Theo số lượng' }, { id: 'apartment', label: 'Theo căn hộ' },
        { id: 'person', label: 'Theo đầu người' }, { id: 'cycle', label: 'Theo kỳ thanh toán' }
    ];

    var APARTMENT_STATUSES = [
        { id: 'vacant', label: 'Trống', color: '#1683ff', bg: '#eaf3ff' },
        { id: 'occupied', label: 'Đang ở', color: '#18a878', bg: '#e6f8ef' },
        { id: 'deposited', label: 'Đã đặt cọc', color: '#a5680c', bg: '#fff4df' },
        { id: 'maintenance', label: 'Đang bảo trì', color: '#ef4444', bg: '#fee2e2' }
    ];

    var CONTRACT_STATUSES = [
        { id: 'active', label: 'Đang hiệu lực', color: '#18a878', bg: '#e6f8ef' },
        { id: 'pending', label: 'Chờ ký', color: '#a5680c', bg: '#fff4df' },
        { id: 'ended', label: 'Đã kết thúc', color: '#61708a', bg: '#f1f5f9' },
        { id: 'terminated', label: 'Đã thanh lý', color: '#ef4444', bg: '#fee2e2' }
    ];

    var INVOICE_STATUSES = [
        { id: 'unpaid', label: 'Chưa thanh toán', color: '#a5680c', bg: '#fff4df' },
        { id: 'sent', label: 'Đã gửi', color: '#0d65d5', bg: '#eaf3ff' },
        { id: 'paid', label: 'Đã thanh toán', color: '#18a878', bg: '#e6f8ef' },
        { id: 'overdue', label: 'Quá hạn', color: '#ef4444', bg: '#fee2e2' }
    ];

    var NOTIFICATION_TYPES = [
        { id: 'info', label: 'Thông tin', icon: 'ℹ️' },
        { id: 'warning', label: 'Cảnh báo', icon: '⚠️' },
        { id: 'payment', label: 'Thanh toán', icon: '💳' },
        { id: 'contract', label: 'Hợp đồng', icon: '📄' },
        { id: 'meter', label: 'Chỉ số', icon: '📊' },
        { id: 'system', label: 'Hệ thống', icon: '⚙️' }
    ];

    var PAYMENT_CYCLES = [
        { id: 'monthly', label: 'Hàng tháng' },
        { id: 'quarterly', label: 'Hàng quý' },
        { id: 'yearly', label: 'Hàng năm' }
    ];

    var VEHICLE_TYPES = ['Ô tô', 'Ô tô điện', 'Xe máy', 'Xe máy điện', 'Xe đạp'];

    var METER_TYPES = [
        { id: 'electricity', label: 'Điện', unit: 'kWh', icon: '⚡' },
        { id: 'water', label: 'Nước', unit: 'm³', icon: '💧' }
    ];

    var PROVINCES = [
        'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ',
        'Thái Nguyên', 'Bắc Ninh', 'Nghệ An', 'Thanh Hóa', 'Khánh Hòa',
        'Lâm Đồng', 'Bình Dương', 'Đồng Nai', 'Quảng Ninh', 'Bắc Giang',
        'Vĩnh Phúc', 'Hưng Yên', 'Hải Dương', 'Quảng Nam', 'Bình Định'
    ];

    var WARD_SUGGESTIONS = {
        'Thái Nguyên': ['Phường Tích Lương', 'Phường Gia Sàng', 'Phường Phú Xá', 'Phường Hoàng Văn Thụ', 'Phường Trưng Vương'],
        'Hà Nội': ['Phường Cầu Giấy', 'Phường Ba Đình', 'Phường Hoàng Mai', 'Phường Đống Đa', 'Phường Thanh Xuân'],
        'TP. Hồ Chí Minh': ['Phường Bến Nghé', 'Phường Tân Định', 'Phường An Phú', 'Phường Thảo Điền', 'Phường Bình Thạnh'],
        'Đà Nẵng': ['Phường Hải Châu', 'Phường Thanh Khê', 'Phường Sơn Trà', 'Phường Ngũ Hành Sơn']
    };

    /* ==============================================================
     * 2. INTERNAL HELPERS
     * ============================================================== */

    function mode() { return global.RHDB_MODE || 'live'; }
    function prefix() { return 'rh_db_' + mode() + '_'; }
    function storeKey(store) { return prefix() + store; }

    function readStore(store) {
        try { var raw = localStorage.getItem(storeKey(store)); return raw ? JSON.parse(raw) : []; }
        catch (e) { return []; }
    }

    function writeStore(store, records) {
        try { localStorage.setItem(storeKey(store), JSON.stringify(records)); }
        catch (e) { console.error('[RHDB] writeStore error for "' + store + '":', e); }
    }

    function genId(pfx) {
        return (pfx || 'id') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }

    function pad(num, len) {
        var s = String(num);
        while (s.length < len) s = '0' + s;
        return s;
    }

    /* ==============================================================
     * 3. CORE CRUD API
     * ============================================================== */

    function list(store) { return readStore(store); }

    function get(store, id) {
        var records = readStore(store);
        for (var i = 0; i < records.length; i++) {
            if (records[i].id === id) return records[i];
        }
        return null;
    }

    function find(store, predicate) { return readStore(store).filter(predicate); }

    function limitInfo(store) {
        if (mode() !== 'demo' || DEMO_LIMITS[store] === undefined) return { limited: false };
        var max = DEMO_LIMITS[store];
        var cnt = readStore(store).length;
        var reached = cnt >= max;
        var near = !reached && cnt >= Math.ceil(max * 0.7);
        return { limited: true, max: max, count: cnt, reached: reached, near: near, label: DEMO_LIMIT_LABELS[store] || store };
    }

    function create(store, data) {
        if (mode() === 'demo' && DEMO_LIMITS[store] !== undefined) {
            var info = limitInfo(store);
            if (info.reached) return { ok: false, limitReached: true, error: 'Bạn đã đạt giới hạn ' + info.max + ' ' + info.label + ' trong bản Demo.' };
        }
        var records = readStore(store);
        var record = Object.assign({}, data, {
            id: data.id || genId(store),
            createdAt: data.createdAt || Date.now(),
            updatedAt: Date.now()
        });
        records.push(record);
        writeStore(store, records);
        _logActivity('create', store, record.id, null, record);
        return { ok: true, item: record };
    }

    function update(store, id, patch) {
        var records = readStore(store);
        var idx = -1;
        for (var i = 0; i < records.length; i++) { if (records[i].id === id) { idx = i; break; } }
        if (idx === -1) return { ok: false, error: 'Không tìm thấy bản ghi (id: ' + id + ').' };
        var before = Object.assign({}, records[idx]);
        records[idx] = Object.assign({}, records[idx], patch, {
            id: records[idx].id, createdAt: records[idx].createdAt, updatedAt: Date.now()
        });
        writeStore(store, records);
        _logActivity('update', store, id, before, records[idx]);
        return { ok: true, item: records[idx] };
    }

    function remove(store, id) {
        var records = readStore(store);
        var before = null;
        var next = records.filter(function (r) { if (r.id === id) { before = r; return false; } return true; });
        if (next.length === records.length) return { ok: false, error: 'Không tìm thấy bản ghi (id: ' + id + ').' };
        writeStore(store, next);
        _logActivity('delete', store, id, before, null);
        return { ok: true };
    }

    function count(store, predicate) {
        var records = readStore(store);
        return predicate ? records.filter(predicate).length : records.length;
    }

    function clear(store) {
        writeStore(store, []);
        _logActivity('clear', store, null, null, null);
    }

    /* ==============================================================
     * 4. DOMAIN HELPERS
     * ============================================================== */

    function buildingFullAddress(building) {
        if (!building) return '';
        return [building.addressDetail, building.ward, building.province].filter(Boolean).join(', ');
    }

    function apartmentsOf(buildingId) {
        return readStore('apartments').filter(function (a) { return a.buildingId === buildingId; });
    }

    function contractsOf(apartmentId) {
        return readStore('contracts').filter(function (c) { return c.apartmentId === apartmentId; });
    }

    function activeContractFor(apartmentId) {
        var contracts = contractsOf(apartmentId).filter(function (c) { return c.status !== 'ended' && c.status !== 'terminated'; });
        contracts.sort(function (a, b) { return b.createdAt - a.createdAt; });
        return contracts[0] || null;
    }

    function invoicesOf(contractId) {
        return readStore('invoices').filter(function (i) { return i.contractId === contractId; });
    }

    function metersOf(apartmentId, meterType) {
        return readStore('meters').filter(function (m) {
            return m.apartmentId === apartmentId && (!meterType || m.meterType === meterType);
        });
    }

    function latestMeter(apartmentId, meterType) {
        var readings = metersOf(apartmentId, meterType);
        readings.sort(function (a, b) { return b.createdAt - a.createdAt; });
        return readings[0] || null;
    }

    function notificationsFor(target) {
        return readStore('notifications').filter(function (n) {
            return n.customerId === target || n.apartmentId === target || n.buildingId === target || !n.customerId;
        }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    }

    function markNotificationRead(notifId) {
        return update('notifications', notifId, { isRead: true, readAt: Date.now() });
    }

    function markAllNotificationsRead(target) {
        var notifs = notificationsFor(target).filter(function (n) { return !n.isRead; });
        notifs.forEach(function (n) { update('notifications', n.id, { isRead: true, readAt: Date.now() }); });
        return { ok: true, count: notifs.length };
    }

    function countUnread(target) {
        var notifs = target ? notificationsFor(target) : readStore('notifications');
        return notifs.filter(function (n) { return !n.isRead; }).length;
    }

    function createNotification(data) {
        var result = create('notifications', {
            title: data.title || 'Thông báo',
            body: data.body || '',
            type: data.type || 'info',
            buildingId: data.buildingId || null,
            apartmentId: data.apartmentId || null,
            customerId: data.customerId || null,
            isRead: false,
            readAt: null
        });
        if (result.ok && global.RH && global.RH.syncManagerNotification) {
            global.RH.syncManagerNotification(result.item);
        }
        return result;
    }

    /* ==============================================================
     * 5. CODE GENERATORS
     * ============================================================== */

    function nextBuildingCode() { return 'TN' + pad(readStore('buildings').length + 1, 4); }

    function nextContractCode(building, apartment) {
        var year = new Date().getFullYear();
        var seq = readStore('contracts').length + 1;
        var bTag = (building && (building.shortName || building.name) || 'TN').toUpperCase().replace(/\s+/g, '').slice(0, 6);
        var aTag = (apartment && apartment.name || 'CH').toUpperCase().replace(/\s+/g, '');
        return bTag + '-' + aTag + '-' + year + '-' + pad(seq, 3);
    }

    function nextInvoiceCode() {
        return 'HD' + new Date().getFullYear() + '-' + pad(readStore('invoices').length + 1, 4);
    }

    function nextMeterCode(meterType) {
        var pfx = meterType === 'electricity' ? 'CTĐ' : 'CTN';
        var seq = readStore('meters').filter(function (m) { return m.meterType === meterType; }).length + 1;
        return pfx + '-' + pad(seq, 4);
    }

    /* ==============================================================
     * 6. FEE / INVOICE CALCULATION
     * ============================================================== */

    function calcServiceAmount(service, ctx) {
        ctx = ctx || {};
        var unitPrice = Number(service.unitPrice) || 0;
        var qty = 1;
        if (service.calcMethod === 'meter') {
            var reading = ctx.meterReading;
            qty = reading ? (Number(reading.consumption) || 0) : 0;
        } else if (service.calcMethod === 'quantity' || service.calcMethod === 'person') {
            qty = ctx.quantity != null ? Number(ctx.quantity) : 1;
        }
        var amount = unitPrice * qty;
        var tax = amount * (Number(service.taxRate) || 0) / 100;
        return { qty: qty, unitPrice: unitPrice, amount: amount, tax: tax, total: amount + tax };
    }

    function buildInvoiceLines(building, apartment, ctx) {
        ctx = ctx || {};
        var lines = [];
        if (!building || !building.services) return lines;
        building.services.forEach(function (svc) {
            var mctx = {};
            if (svc.feeType === 'electricity' && ctx.electricityMeter) mctx.meterReading = ctx.electricityMeter;
            else if (svc.feeType === 'water' && ctx.waterMeter) mctx.meterReading = ctx.waterMeter;
            if (svc.calcMethod === 'person') mctx.quantity = ctx.residentCount || 1;
            var calc = calcServiceAmount(svc, mctx);
            var label = svc.name;
            if (svc.calcMethod === 'meter' && calc.qty > 0) {
                label += ' (' + calc.qty + (svc.feeType === 'electricity' ? ' kWh' : ' m³') + ')';
            }
            lines.push({ serviceId: svc.id, label: label, qty: calc.qty, unitPrice: calc.unitPrice, amount: calc.amount, tax: calc.tax });
        });
        return lines;
    }

    /* ==============================================================
     * 7. AUTH
     * ============================================================== */

    var SESSION_KEY = 'rh_db_session_current';

    function authenticate(email, password) {
        var normalized = String(email || '').trim().toLowerCase();
        var users = readStore('users');
        for (var i = 0; i < users.length; i++) {
            if (users[i].email.toLowerCase() === normalized && users[i].password === password) return users[i];
        }
        return null;
    }

    function loginSession(user, remember) {
        var session = { id: user.id, name: user.name, email: user.email, role: user.role, unit: user.unit || '', plan: user.plan || null, loginAt: Date.now() };
        var data = JSON.stringify(session);
        if (remember) { localStorage.setItem(SESSION_KEY, data); sessionStorage.removeItem(SESSION_KEY); }
        else { sessionStorage.setItem(SESSION_KEY, data); localStorage.removeItem(SESSION_KEY); }
        create('sessions', { userId: user.id, userEmail: user.email, userName: user.name, loginAt: Date.now(), remember: !!remember, userAgent: navigator.userAgent || '' });
        return session;
    }

    function getSession() {
        try { var raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }
        catch (e) { return null; }
    }

    function logout() { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); }

    function requireRole(role) {
        var session = getSession();
        if (!session) { global.location.replace('index.html?authRequired=1'); return null; }
        if (session.role !== role) { global.location.replace((session.role === ROLES.MANAGER ? 'dashboard.html' : 'resident-web.html') + '?denied=1'); return null; }
        return session;
    }

    function findUserByEmail(email) {
        var normalized = String(email || '').trim().toLowerCase();
        var users = readStore('users');
        for (var i = 0; i < users.length; i++) { if (users[i].email.toLowerCase() === normalized) return users[i]; }
        return null;
    }

    function createUser(data) {
        var name = String(data.name || '').trim(), email = String(data.email || '').trim(), password = String(data.password || '');
        var role = data.role === ROLES.RESIDENT ? ROLES.RESIDENT : ROLES.MANAGER;
        if (!name || !email || !password) return { ok: false, error: 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu.' };
        if (password.length < 6) return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
        if (findUserByEmail(email)) return { ok: false, error: 'Email này đã được sử dụng cho một tài khoản khác.' };
        return create('users', { name: name, email: email, password: password, role: role, unit: data.unit ? String(data.unit).trim() : '', phone: data.phone || '', avatar: data.avatar || '', plan: data.plan || null, planStatus: data.plan ? 'active' : null });
    }

    function updateUser(id, patch) {
        if (patch.email) { var ex = findUserByEmail(patch.email); if (ex && ex.id !== id) return { ok: false, error: 'Email này đã được sử dụng cho một tài khoản khác.' }; }
        if (patch.password !== undefined && patch.password !== '' && patch.password.length < 6) return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
        var result = update('users', id, patch);
        if (result.ok) { var session = getSession(); if (session && session.id === id) loginSession(result.item, !!localStorage.getItem(SESSION_KEY)); }
        return result;
    }

    function deleteUser(id) {
        var session = getSession();
        if (session && session.id === id) return { ok: false, error: 'Bạn không thể xoá tài khoản đang đăng nhập.' };
        var users = readStore('users');
        var target = null;
        for (var i = 0; i < users.length; i++) { if (users[i].id === id) { target = users[i]; break; } }
        if (!target) return { ok: false, error: 'Không tìm thấy tài khoản.' };
        if (target.role === ROLES.MANAGER && users.filter(function (u) { return u.role === ROLES.MANAGER && u.id !== id; }).length === 0)
            return { ok: false, error: 'Phải có ít nhất một tài khoản Quản lý trong hệ thống.' };
        return remove('users', id);
    }

    /* ==============================================================
     * 8. ACTIVITY LOG
     * ============================================================== */

    function _logActivity(action, store, recordId, before, after) {
        try {
            var session = getSession();
            var logs = readStore('activity_log');
            logs.push({ id: genId('log'), action: action, store: store, recordId: recordId, userId: session ? session.id : null, userName: session ? session.name : null, before: before, after: after, timestamp: Date.now(), createdAt: Date.now() });
            if (logs.length > 1000) logs = logs.slice(logs.length - 1000);
            writeStore('activity_log', logs);
        } catch (e) { /* bỏ qua lỗi log */ }
    }

    function getActivityLog(options) {
        options = options || {};
        var logs = readStore('activity_log');
        if (options.store) logs = logs.filter(function (l) { return l.store === options.store; });
        if (options.action) logs = logs.filter(function (l) { return l.action === options.action; });
        logs.sort(function (a, b) { return b.timestamp - a.timestamp; });
        if (options.limit) logs = logs.slice(0, options.limit);
        return logs;
    }

    /* ==============================================================
     * 9. ANALYTICS
     * ============================================================== */

    function getStats() {
        var buildings = readStore('buildings'), apartments = readStore('apartments');
        var customers = readStore('customers'), contracts = readStore('contracts');
        var invoices = readStore('invoices');
        var totalRent = 0, totalPaid = 0, totalUnpaid = 0, overdueCount = 0, occupiedCount = 0, vacantCount = 0, activeContracts = 0;
        apartments.forEach(function (a) { if (a.status === 'occupied') occupiedCount++; if (a.status === 'vacant') vacantCount++; });
        contracts.forEach(function (c) { if (c.status === 'active') activeContracts++; });
        invoices.forEach(function (inv) {
            totalRent += inv.total || 0;
            if (inv.status === 'paid') totalPaid += inv.total || 0;
            if (inv.status === 'unpaid') totalUnpaid += inv.total || 0;
            if (inv.status === 'overdue') overdueCount++;
        });
        return {
            buildingCount: buildings.length, apartmentCount: apartments.length,
            customerCount: customers.length, contractCount: contracts.length, invoiceCount: invoices.length,
            occupiedCount: occupiedCount, vacantCount: vacantCount, activeContracts: activeContracts,
            occupancyRate: apartments.length > 0 ? Math.round(occupiedCount / apartments.length * 100) : 0,
            totalRent: totalRent, totalPaid: totalPaid, totalUnpaid: totalUnpaid, overdueCount: overdueCount
        };
    }

    function getRevenueByMonth(monthsBack) {
        monthsBack = monthsBack || 6;
        var invoices = readStore('invoices');
        var result = [];
        var now = new Date();
        for (var i = monthsBack - 1; i >= 0; i--) {
            var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            var ym = d.getFullYear() + '-' + pad(d.getMonth() + 1, 2);
            var paid = 0, unpaid = 0;
            invoices.forEach(function (inv) {
                if ((inv.period || '').slice(0, 7) === ym) {
                    if (inv.status === 'paid') paid += inv.total || 0;
                    else unpaid += inv.total || 0;
                }
            });
            result.push({ month: ym, paid: paid, unpaid: unpaid });
        }
        return result;
    }

    /* ==============================================================
     * 10. SEED DATA
     * ============================================================== */

    function _seedLive() {
        if (readStore('users').length > 0) return;
        writeStore('users', [
            { id: 'u-manager-1', name: 'Nguyễn Văn An', email: 'manager@residenthub.vn', password: 'Manager@123', role: ROLES.MANAGER, unit: '', phone: '', avatar: '', plan: null, planStatus: null, createdAt: Date.now(), updatedAt: Date.now() },
            { id: 'u-resident-1', name: 'Hương Nguyễn', email: 'resident@residenthub.vn', password: 'Resident@123', role: ROLES.RESIDENT, unit: 'A-1208', phone: '', avatar: '', plan: null, planStatus: null, createdAt: Date.now(), updatedAt: Date.now() }
        ]);
    }

    function _seedDemo() {
        if (readStore('buildings').length > 0) return;

        var building = {
            id: genId('building'), code: 'TN0001', name: 'Chung cư Riverside Residence', shortName: 'CT1',
            province: 'Thái Nguyên', ward: 'Phường Tích Lương', addressDetail: 'Tổ 14',
            totalFloors: 10, totalApartments: 3,
            services: [
                { id: genId('svc'), name: 'Tiền thuê nhà',         feeType: 'rent',        calcMethod: 'fixed',     unitPrice: 0,      taxRate: 0 },
                { id: genId('svc'), name: 'Tiền điện',             feeType: 'electricity', calcMethod: 'meter',     unitPrice: 3800,   taxRate: 8 },
                { id: genId('svc'), name: 'Tiền nước',             feeType: 'water',       calcMethod: 'meter',     unitPrice: 18000,  taxRate: 5 },
                { id: genId('svc'), name: 'Vệ sinh chung cư',      feeType: 'cleaning',    calcMethod: 'apartment', unitPrice: 50000,  taxRate: 0 },
                { id: genId('svc'), name: 'Internet cáp quang',    feeType: 'internet',    calcMethod: 'apartment', unitPrice: 100000, taxRate: 0 },
                { id: genId('svc'), name: 'Phí quản lý vận hành', feeType: 'management',  calcMethod: 'apartment', unitPrice: 150000, taxRate: 0 },
                { id: genId('svc'), name: 'Phí gửi xe máy',       feeType: 'parking',     calcMethod: 'quantity',  unitPrice: 100000, taxRate: 0 }
            ],
            config: { autoDebitAccount: '', eInvoiceEnabled: false, eInvoiceProvider: '', bankName: 'Vietcombank', bankAccountNumber: '', bankAccountHolder: '' },
            invoiceTemplates:  [{ id: genId('tpl'), name: 'Mẫu hoá đơn hợp đồng mới', isDefault: true }],
            contractTemplates: [{ id: genId('tpl'), name: 'Hợp đồng ký mới', isDefault: true }],
            createdAt: Date.now()
        };
        writeStore('buildings', [building]);

        var addr = buildingFullAddress(building);
        var apt1 = { id: genId('apartment'), buildingId: building.id, name: '501', floor: 'Tầng 5', area: 20, rentPrice: 2000000, depositPrice: 2000000, status: 'occupied',  address: addr, photos: [], note: '', createdAt: Date.now() };
        var apt2 = { id: genId('apartment'), buildingId: building.id, name: '502', floor: 'Tầng 5', area: 22, rentPrice: 2200000, depositPrice: 2200000, status: 'deposited', address: addr, photos: [], note: '', createdAt: Date.now() };
        var apt3 = { id: genId('apartment'), buildingId: building.id, name: '503', floor: 'Tầng 5', area: 18, rentPrice: 1800000, depositPrice: 1800000, status: 'vacant',    address: addr, photos: [], note: '', createdAt: Date.now() };
        writeStore('apartments', [apt1, apt2, apt3]);

        var cus1 = { id: genId('customer'), fullName: 'Nguyễn Thị Hoa', phone: '0984646471', email: 'hoa.nguyen@email.vn', dob: '1996-03-12', gender: 'Nữ', idNumber: '017296001234', idIssueDate: '2020-05-10', idFrontPhoto: '', idBackPhoto: '', province: 'Thái Nguyên', ward: 'Phường Tích Lương', addressDetail: 'Tổ 14', customerType: 'Cá nhân', note: '', consultantName: 'Trần Văn Bình', consultantPhone: '0912345678', doorFingerprintCode: 'VT-0231', isForeigner: false, nationality: '', passportNumber: '', passportType: '', passportExpiry: '', passportPhoto: '', vehicles: [{ id: genId('veh'), type: 'Xe máy', model: 'Honda Vision', plate: '20-H1 123.45', color: 'Trắng', photo: '', ticket: 'VX-0501' }], createdAt: Date.now() };
        var cus2 = { id: genId('customer'), fullName: 'Lê Minh Đức', phone: '0977123456', email: '', dob: '1990-11-02', gender: 'Nam', idNumber: '017290005678', idIssueDate: '2019-02-18', idFrontPhoto: '', idBackPhoto: '', province: 'Thái Nguyên', ward: 'Phường Tích Lương', addressDetail: 'Tổ 14', customerType: 'Cá nhân', note: 'Đã đặt cọc căn 502', consultantName: 'Trần Văn Bình', consultantPhone: '0912345678', doorFingerprintCode: 'VT-0232', isForeigner: false, nationality: '', passportNumber: '', passportType: '', passportExpiry: '', passportPhoto: '', vehicles: [], createdAt: Date.now() };
        writeStore('customers', [cus1, cus2]);

        var contract1 = { id: genId('contract'), code: building.shortName + '-501-' + new Date().getFullYear() + '-001', buildingId: building.id, apartmentId: apt1.id, customerId: cus1.id, startDate: '2026-01-01', endDate: '2026-12-31', signDate: '2025-12-28', contractTemplateId: building.contractTemplates[0].id, invoiceTemplateId: building.invoiceTemplates[0].id, rentPrice: apt1.rentPrice, depositPrice: apt1.depositPrice, paymentCycle: 'monthly', referrer: '', collaborator: 'Trần Văn Bình', note: '', files: [], status: 'active', createdAt: Date.now() };
        writeStore('contracts', [contract1]);

        var meter1 = { id: genId('meter'), buildingId: building.id, apartmentId: apt1.id, meterType: 'electricity', meterCode: 'CTĐ-0501', previousIndex: 80, latestIndex: 100, periodMonth: '2026-09', closingDate: '2026-09-30', consumption: 20, photo: '', createdAt: Date.now() };
        var meter2 = { id: genId('meter'), buildingId: building.id, apartmentId: apt1.id, meterType: 'water',       meterCode: 'CTN-0501', previousIndex: 10, latestIndex: 16,  periodMonth: '2026-09', closingDate: '2026-09-30', consumption: 6,  photo: '', createdAt: Date.now() };
        writeStore('meters', [meter1, meter2]);

        var elecLine  = calcServiceAmount(building.services[1], { meterReading: meter1 });
        var waterLine = calcServiceAmount(building.services[2], { meterReading: meter2 });
        var invItems = [
            { serviceId: building.services[0].id, label: 'Tiền thuê nhà',                     qty: 1, unitPrice: apt1.rentPrice,    amount: apt1.rentPrice,    tax: 0             },
            { serviceId: building.services[1].id, label: 'Tiền điện (20 kWh)',                qty: elecLine.qty,  unitPrice: elecLine.unitPrice,  amount: elecLine.amount,  tax: elecLine.tax  },
            { serviceId: building.services[2].id, label: 'Tiền nước (6 m³)',                  qty: waterLine.qty, unitPrice: waterLine.unitPrice, amount: waterLine.amount, tax: waterLine.tax }
        ];
        var subtotal = invItems.reduce(function (s, it) { return s + it.amount; }, 0);
        var taxTotal = invItems.reduce(function (s, it) { return s + it.tax;    }, 0);
        writeStore('invoices', [{ id: genId('invoice'), code: 'HD' + new Date().getFullYear() + '-0001', contractId: contract1.id, buildingId: building.id, apartmentId: apt1.id, customerId: cus1.id, period: '2026-09', issueDate: '2026-09-30', dueDate: '2026-10-10', items: invItems, subtotal: subtotal, tax: taxTotal, total: subtotal + taxTotal, status: 'unpaid', sentAt: null, paidAt: null, createdAt: Date.now() }]);

        writeStore('notifications', [
            { id: genId('notif'), title: 'Hoá đơn tháng 9 chưa thanh toán', body: 'Hoá đơn HD2026-0001 của căn 501 chưa được thanh toán. Hạn nộp: 10/10/2026.', type: 'payment', buildingId: building.id, apartmentId: apt1.id, customerId: cus1.id, isRead: false, readAt: null, createdAt: Date.now() },
            { id: genId('notif'), title: 'Hợp đồng sắp hết hạn', body: 'Hợp đồng ' + contract1.code + ' sẽ hết hạn vào 31/12/2026. Liên hệ gia hạn sớm.', type: 'contract', buildingId: building.id, apartmentId: apt1.id, customerId: cus1.id, isRead: false, readAt: null, createdAt: Date.now() - 86400000 },
            { id: genId('notif'), title: 'Chào mừng đến ResidentHub!', body: 'Bạn đang xem bản Demo. Mọi thay đổi trong demo được giữ trong session này.', type: 'system', buildingId: null, apartmentId: null, customerId: null, isRead: true, readAt: Date.now() - 3600000, createdAt: Date.now() - 7200000 }
        ]);
    }

    /* ==============================================================
     * 11. MODE MANAGEMENT
     * ============================================================== */

    function setMode(m) {
        global.RHDB_MODE = (m === 'demo') ? 'demo' : 'live';
        if (global.RHDB_MODE === 'demo') _seedDemo();
        else _seedLive();
    }

    function resetDemo() {
        var prev = global.RHDB_MODE;
        global.RHDB_MODE = 'demo';
        STORES.forEach(function (s) { localStorage.removeItem('rh_db_demo_' + s); });
        _seedDemo();
        global.RHDB_MODE = prev;
    }

    function purge(targetMode) {
        var p = 'rh_db_' + (targetMode || mode()) + '_';
        STORES.forEach(function (s) { localStorage.removeItem(p + s); });
    }

    /* ==============================================================
     * 12. INIT + PUBLIC API
     * ============================================================== */

    _seedLive();

    global.RHDB = {
        // Constants
        STORES: STORES, ROLES: ROLES, DEMO_LIMITS: DEMO_LIMITS,
        FEE_TYPES: FEE_TYPES, CALC_METHODS: CALC_METHODS,
        APARTMENT_STATUSES: APARTMENT_STATUSES, CONTRACT_STATUSES: CONTRACT_STATUSES,
        INVOICE_STATUSES: INVOICE_STATUSES, NOTIFICATION_TYPES: NOTIFICATION_TYPES,
        PAYMENT_CYCLES: PAYMENT_CYCLES, VEHICLE_TYPES: VEHICLE_TYPES,
        METER_TYPES: METER_TYPES, PROVINCES: PROVINCES, WARD_SUGGESTIONS: WARD_SUGGESTIONS,

        // Mode
        mode: mode, setMode: setMode, resetDemo: resetDemo, purge: purge,

        // Core CRUD
        list: list, get: get, find: find, create: create, update: update,
        remove: remove, count: count, clear: clear,

        // Limit info
        limitInfo: limitInfo,

        // Domain helpers
        buildingFullAddress: buildingFullAddress,
        apartmentsOf: apartmentsOf, contractsOf: contractsOf,
        activeContractFor: activeContractFor, invoicesOf: invoicesOf,
        metersOf: metersOf, latestMeter: latestMeter,

        // Code generators
        nextBuildingCode: nextBuildingCode, nextContractCode: nextContractCode,
        nextInvoiceCode: nextInvoiceCode, nextMeterCode: nextMeterCode,

        // Calculations
        calcServiceAmount: calcServiceAmount, buildInvoiceLines: buildInvoiceLines,

        // Auth
        authenticate: authenticate, loginSession: loginSession, getSession: getSession,
        logout: logout, requireRole: requireRole, findUserByEmail: findUserByEmail,
        createUser: createUser, updateUser: updateUser, deleteUser: deleteUser,

        // Notifications
        createNotification: createNotification, notificationsFor: notificationsFor,
        markNotificationRead: markNotificationRead, markAllNotificationsRead: markAllNotificationsRead,
        countUnread: countUnread,

        // Activity log
        getActivityLog: getActivityLog,

        // Analytics
        getStats: getStats, getRevenueByMonth: getRevenueByMonth
    };

})(window);

