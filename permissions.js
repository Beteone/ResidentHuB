/*
 * ResidentHub - account types (Loại tài khoản) + permission resolver (RHP).
 *
 *   User --accountTypeId--> AccountType --permissions[]--> "module.action" keys
 *
 * PERMISSION_SCHEMA below is the single registry; shared module scripts may
 * extend it with RHP.registerModule() at startup on both manager/staff pages. The
 * permission matrix in "Loại tài khoản" renders straight from it, and every
 * screen asks RHP.can('module.action') — so a new module only needs one entry
 * here (plus its can() checks), never a redesign. Account types store the
 * granted keys; keys that no longer exist in the schema are simply ignored.
 *
 * Data scope: a user either manages all buildings (allBuildings) or only the
 * buildings in user.buildingIds plus any building whose managerId is the user.
 * RHP.scopeList() applies that to every building-linked entity.
 *
 * Account types are global (like login accounts in auth.js), not split by the
 * RHD live/demo mode. Depends on auth.js (RH); data.js (RHD) is used lazily.
 */
(function (global) {
    var TYPES_KEY = 'residenthub_account_types';
    var ADMIN_TYPE_ID = 'at-admin';
    var DEFAULT_MANAGER_TYPE_ID = 'at-building-manager';
    var RESIDENT_TYPE_ID = 'at-resident';

    var ACTIONS = [
        { id: 'view', label: 'Xem' },
        { id: 'create', label: 'Thêm' },
        { id: 'update', label: 'Sửa' },
        { id: 'delete', label: 'Xóa' }
    ];

    // module -> standard actions it supports + business-specific extras.
    // Only modules/actions that really exist in this project are listed.
    var PERMISSION_SCHEMA = [
        { id: 'dashboard', label: 'Bảng tin', actions: ['view'] },
        { id: 'buildings', label: 'Tòa nhà', actions: ['view', 'create', 'update', 'delete'],
            extra: [{ id: 'assignable', label: 'Được phân công làm người quản lý tòa' }] },
        { id: 'apartments', label: 'Căn hộ', actions: ['view', 'create', 'update', 'delete'] },
        { id: 'assets', label: 'Tài sản', actions: ['view', 'create', 'update', 'delete'] },
        { id: 'assetTypes', label: 'Loại tài sản', actions: ['view', 'create', 'update', 'delete'] },
        { id: 'customers', label: 'Khách hàng / Cư dân', actions: ['view', 'create', 'update', 'delete'] },
        { id: 'meters', label: 'Ghi chỉ số', actions: ['view', 'create', 'update', 'delete'],
            extra: [{ id: 'approve', label: 'Duyệt / bỏ duyệt chỉ số' }] },
        { id: 'contracts', label: 'Hợp đồng', actions: ['view', 'create', 'update', 'delete'] },
        { id: 'invoices', label: 'Hóa đơn', actions: ['view', 'create', 'update', 'delete'],
            extra: [{ id: 'approve', label: 'Duyệt hóa đơn nháp' }, { id: 'issue', label: 'Phát hành hóa đơn' }, { id: 'send', label: 'Gửi hóa đơn cho cư dân' }, { id: 'collect', label: 'Xác nhận đã thu tiền' }, { id: 'adjust', label: 'Điều chỉnh / hủy hóa đơn đã phát hành' }] },
        { id: 'support', label: 'Yêu cầu hỗ trợ', actions: ['view', 'update'], extra: [{ id: 'create', label: 'Gửi yêu cầu hỗ trợ' }] },
        { id: 'staffTasks', label: 'Nhiệm vụ nhân viên', actions: ['view', 'update'], extra: [
            { id: 'accept', label: 'Tiếp nhận nhiệm vụ' }, { id: 'report', label: 'Gửi báo cáo kết quả' }
        ] },
        { id: 'staffIncome', label: 'Tiền công cá nhân', actions: ['view'] },
        { id: 'notifications', label: 'Quản lý thông báo', actions: ['view', 'create', 'update', 'delete'] },
        { id: 'reports', label: 'Báo cáo', actions: ['view'] },
        { id: 'roles', label: 'Loại tài khoản', actions: ['view', 'create', 'update', 'delete'] },
        { id: 'users', label: 'Người dùng', actions: ['view', 'create', 'update', 'delete'],
            extra: [{ id: 'createResident', label: 'Tạo tài khoản cư dân' }, { id: 'approveResident', label: 'Duyệt tài khoản cư dân' }, { id: 'lock', label: 'Khóa / mở khóa tài khoản' }] },
        { id: 'templates', label: 'Biểu mẫu', actions: ['view', 'create', 'update', 'delete'] },
        { id: 'settings', label: 'Cài đặt hệ thống', actions: ['view', 'update'] }
    ];

    function allKeys() {
        var keys = [];
        PERMISSION_SCHEMA.forEach(function (m) {
            m.actions.forEach(function (a) { keys.push(m.id + '.' + a); });
            (m.extra || []).forEach(function (x) { keys.push(m.id + '.' + x.id); });
        });
        return keys;
    }

    // Extend the existing schema and editor; registration never grants permissions.
    function registerModule(module) {
        if (!module || !/^[a-zA-Z][\w-]*$/.test(module.id || '')) throw new Error('Mã module quyền không hợp lệ.');
        var actions = module.actions || [], extra = module.extra || [];
        if (!Array.isArray(actions) || !Array.isArray(extra) || actions.some(function (id) { return !ACTIONS.some(function (a) { return a.id === id; }); }) || extra.some(function (a) { return !a || !/^[a-zA-Z][\w-]*$/.test(a.id || '') || !a.label; })) throw new Error('Khai báo quyền không hợp lệ.');
        var existing = PERMISSION_SCHEMA.filter(function (m) { return m.id === module.id; })[0];
        if (!existing) { existing = { id: module.id, label: module.label || module.id, actions: [], extra: [] }; PERMISSION_SCHEMA.push(existing); }
        actions.forEach(function (id) { if (existing.actions.indexOf(id) === -1 && !(existing.extra || []).some(function (a) { return a.id === id; })) existing.actions.push(id); });
        extra.forEach(function (a) { if (existing.actions.indexOf(a.id) === -1 && !(existing.extra || []).some(function (x) { return x.id === a.id; })) (existing.extra || (existing.extra = [])).push({ id: a.id, label: a.label }); });
        cache.key = null;
        return existing;
    }
    function undeclaredPermissions(keys) { var known = allKeys(); return (keys || []).filter(function (key) { return known.indexOf(key) === -1; }); }

    function moduleOf(key) { return String(key).split('.')[0]; }

    function labelOf(key) {
        var parts = String(key).split('.');
        var m = PERMISSION_SCHEMA.filter(function (x) { return x.id === parts[0]; })[0];
        if (!m) return key;
        var a = ACTIONS.filter(function (x) { return x.id === parts[1]; })[0] || (m.extra || []).filter(function (x) { return x.id === parts[1]; })[0];
        return (a ? a.label : parts[1]) + ' · ' + m.label;
    }

    // Exact historical template: migrate only untouched, unedited seed records.
    var LEGACY_STAFF_PERMISSIONS = ['dashboard.view', 'buildings.view', 'apartments.view',
        'assets.view', 'assets.create', 'assets.update', 'assetTypes.view', 'assetTypes.create',
        'customers.view', 'customers.create', 'customers.update',
        'meters.view', 'meters.create', 'meters.update', 'contracts.view', 'invoices.view',
        'support.view', 'support.update'];
    var STAFF_DEFAULT_PERMISSIONS = ['dashboard.view', 'staffTasks.view', 'staffTasks.accept',
        'staffTasks.update', 'staffTasks.report', 'staffIncome.view', 'support.create'];

    // Starting templates for the two editable staff roles. They are ordinary
    // account types afterwards: rename, re-grant or delete them freely.
    var DEFAULT_TYPES = [
        {
            id: ADMIN_TYPE_ID, name: 'Admin', portal: 'manager', system: true, fullAccess: true,
            description: 'Toàn quyền hệ thống, kể cả các chức năng được bổ sung sau này.', permissions: []
        },
        {
            id: 'at-building-manager', name: 'Quản lý tòa nhà', portal: 'manager',
            description: 'Phụ trách vận hành các tòa nhà được giao.',
            permissions: ['dashboard.view', 'buildings.view', 'buildings.update', 'buildings.assignable',
                'apartments.view', 'apartments.create', 'apartments.update', 'apartments.delete',
                'assets.view', 'assets.create', 'assets.update', 'assets.delete', 'assetTypes.view', 'assetTypes.create', 'assetTypes.update',
                'customers.view', 'customers.create', 'customers.update', 'customers.delete',
                'meters.view', 'meters.create', 'meters.update', 'meters.delete', 'meters.approve',
                'contracts.view', 'contracts.create', 'contracts.update', 'contracts.delete',
                'invoices.view', 'invoices.create', 'invoices.update', 'invoices.delete', 'invoices.approve', 'invoices.issue', 'invoices.send', 'invoices.collect', 'invoices.adjust',
                'support.view', 'support.update', 'reports.view', 'users.view', 'users.approveResident', 'templates.view']
        },
        {
            id: 'at-staff', name: 'Nhân viên', portal: 'manager',
            description: 'Nhiệm vụ được giao, tiền công cá nhân và gửi yêu cầu hỗ trợ; dùng chung cho Kỹ thuật, Vệ sinh, An ninh.',
            permissions: STAFF_DEFAULT_PERMISSIONS,
            staffDefaultsVersion: 1
        },
        {
            id: RESIDENT_TYPE_ID, name: 'Cư dân', portal: 'resident', system: true,
            description: 'Tài khoản cư dân dùng Cổng cư dân, được tạo qua phê duyệt đăng ký.', permissions: []
        }
    ];

    // ---------------------------------------------------------------- store

    function readTypes() {
        try {
            var raw = localStorage.getItem(TYPES_KEY);
            var parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? parsed : null;
        } catch (e) { return null; }
    }

    function writeTypes(list) {
        localStorage.setItem(TYPES_KEY, JSON.stringify(list));
        cache.key = null;
    }

    function seed() {
        // Existing (including malformed) stores are never repaired implicitly.
        if (localStorage.getItem(TYPES_KEY) !== null) return;
        if (global.RH && !(global.RH.wasDemoAdminCreated && global.RH.wasDemoAdminCreated())) {
            try {
                var users = JSON.parse(localStorage.getItem('residenthub_users') || '[]');
                if (!Array.isArray(users) || users.length) return;
            } catch (e) { return; }
        }
        writeTypes(DEFAULT_TYPES.map(function (t) { return Object.assign({ createdAt: Date.now() }, t); }));
    }

    function listTypes() { return readTypes() || []; }
    function getType(id) { return listTypes().filter(function (t) { return t.id === id; })[0] || null; }

    function typeForUser(user) {
        if (!user) return null;
        var type = getType(user.accountTypeId);
        var portal = user.role === 'resident' ? 'resident' : 'manager';
        if (type && type.portal === portal) return type;
        if (user.role === 'staff') return getType('at-staff');
        return portal === 'resident' ? getType(RESIDENT_TYPE_ID) : getType(DEFAULT_MANAGER_TYPE_ID);
    }

    function foldName(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').trim().toLowerCase();
    }

    function cleanPermissions(perms) {
        var valid = allKeys();
        var seen = {};
        return (perms || []).filter(function (k) {
            if (valid.indexOf(k) === -1 || seen[k]) return false;
            seen[k] = true;
            return true;
        });
    }

    function usersOfType(typeId) {
        return global.RH ? global.RH.getUsers().filter(function (u) { return u.accountTypeId === typeId; }) : [];
    }

    function saveType(id, data) {
        var me = currentUser();
        var name = String(data.name || '').trim();
        if (!name) return { ok: false, error: 'Vui lòng nhập tên loại tài khoản.' };
        var list = listTypes();
        if (list.some(function (t) { return t.id !== id && foldName(t.name) === foldName(name); })) {
            return { ok: false, error: 'Đã có loại tài khoản tên "' + name + '".' };
        }
        var existing = id ? list.filter(function (t) { return t.id === id; })[0] : null;
        if (id && !existing) return { ok: false, error: 'Không tìm thấy loại tài khoản.' };
        if (existing && !isAdmin(me) && me && me.accountTypeId === existing.id) {
            return { ok: false, error: 'Bạn không thể tự sửa quyền của loại tài khoản mình đang dùng.' };
        }
        var portal = existing && existing.system ? existing.portal : (data.portal === 'resident' ? 'resident' : 'manager');
        var requested = portal === 'manager' && !(existing && existing.fullAccess) ? cleanPermissions(data.permissions) : [];
        // Non-admins can only grant/revoke what they hold themselves; anything
        // else keeps its previous value (no privilege escalation via roles).
        if (!isAdmin(me)) {
            var before = existing ? existing.permissions || [] : [];
            requested = allKeys().filter(function (k) {
                return can(k, me) ? requested.indexOf(k) !== -1 : before.indexOf(k) !== -1;
            });
        }
        (existing && existing.permissions || []).forEach(function (key) { if (allKeys().indexOf(key) === -1 && requested.indexOf(key) === -1) requested.push(key); });
        var record = Object.assign({}, existing || { id: 'at-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), createdAt: Date.now() }, {
            name: name,
            description: String(data.description || '').trim(),
            portal: portal,
            permissions: requested,
            updatedAt: Date.now()
        });
        if (existing) list = list.map(function (t) { return t.id === id ? record : t; });
        else list.push(record);
        writeTypes(list);
        if (global.RHActivity) global.RHActivity.record('roles', existing ? 'update' : 'create', existing, record, { actor: me });
        return { ok: true, item: record };
    }

    function deleteType(id) {
        var t = getType(id);
        if (!t) return { ok: false, error: 'Không tìm thấy loại tài khoản.' };
        if (t.system) return { ok: false, error: 'Không thể xoá loại tài khoản hệ thống.' };
        var used = usersOfType(id).length;
        if (used) return { ok: false, error: 'Không thể xoá: còn ' + used + ' người dùng thuộc loại tài khoản này.' };
        writeTypes(listTypes().filter(function (x) { return x.id !== id; }));
        if (global.RHActivity) global.RHActivity.record('roles', 'delete', t, null);
        return { ok: true };
    }

    // ------------------------------------------------------------ resolution
    // Cached by the raw localStorage strings so can() is cheap to call per row.

    var cache = { key: null, user: null, type: null, set: null };

    function sessionUserId() {
        var s = global.RH_SESSION;
        if (s && s.demo) return 'demo';
        var live = global.RH && global.RH.getSession ? global.RH.getSession() : null;
        return live ? live.id : (global.RH ? null : (s ? s.id : null));
    }

    function resolve() {
        var id = sessionUserId();
        var key = id + '|' + (localStorage.getItem('residenthub_users') || '') + '|' + (localStorage.getItem(TYPES_KEY) || '');
        if (cache.key === key) return cache;
        cache.key = key;
        if (id === 'demo') {
            // The sandboxed demo workspace is a full-access preview.
            cache.user = { id: 'demo', name: 'Khách demo', accountTypeId: ADMIN_TYPE_ID, allBuildings: true, buildingIds: [] };
        } else {
            cache.user = id && global.RH ? global.RH.getUsers().filter(function (u) { return u.id === id; })[0] || null : null;
        }
        cache.type = typeForUser(cache.user);
        cache.set = {};
        (cache.type && cache.type.permissions || []).forEach(function (k) { cache.set[k] = true; });
        return cache;
    }

    function currentUser() { return resolve().user; }

    function typeOfUser(user) {
        if (!user) return null;
        var c = resolve();
        return c.user && c.user.id === user.id ? c.type : typeForUser(user);
    }

    function isAdmin(user) {
        var t = typeOfUser(user === undefined ? currentUser() : user);
        return !!(t && t.fullAccess);
    }

    // can('buildings.update') for the signed-in user, or for any given user.
    function can(key, user) {
        if (allKeys().indexOf(key) === -1) { if (global.console) global.console.warn('Quyền chưa được khai báo:', key); return false; }
        if (user === undefined) {
            var c = resolve();
            if (!c.user || !c.type || c.type.portal !== 'manager') return false;
            return !!c.type.fullAccess || !!c.set[key];
        }
        var t = typeOfUser(user);
        if (!t || t.portal !== 'manager') return false;
        return !!t.fullAccess || (t.permissions || []).indexOf(key) !== -1;
    }

    function canAny(keys, user) {
        return [].concat(keys).some(function (k) { return can(k, user); });
    }

    // null = every building; otherwise the list of building ids in scope.
    function buildingScope(user) {
        user = user === undefined ? currentUser() : user;
        if (!user) return [];
        if (isAdmin(user) || user.allBuildings) return null;
        var ids = (user.buildingIds || []).slice();
        if (global.RHD) {
            global.RHD.list('buildings').forEach(function (b) {
                if (b.managerId === user.id && ids.indexOf(b.id) === -1) ids.push(b.id);
            });
        }
        return ids;
    }

    function inScope(buildingId, user) {
        var scope = buildingScope(user);
        return scope === null || scope.indexOf(buildingId) !== -1;
    }

    // Applies the data scope to a list read from RHD. Every building-linked
    // entity carries buildingId; customers are scoped through their contracts
    // (a customer with no contract yet is visible so a contract can be made).
    function scopeList(entity, items) {
        var scope = buildingScope();
        if (scope === null) return items;
        if (entity === 'buildings') return items.filter(function (b) { return scope.indexOf(b.id) !== -1; });
        if (entity === 'customers') {
            var contracts = global.RHD ? global.RHD.list('contracts') : [];
            return items.filter(function (c) {
                var own = contracts.filter(function (k) {
                    var tenantIds = k.tenantIds && k.tenantIds.length ? k.tenantIds : (k.customerIds && k.customerIds.length ? k.customerIds : [k.customerId]);
                    return tenantIds.indexOf(c.id) !== -1;
                });
                return !own.length || own.some(function (k) { return scope.indexOf(k.buildingId) !== -1; });
            });
        }
        return items.filter(function (r) { return scope.indexOf(r.buildingId) !== -1; });
    }

    // Staff accounts that may be picked as Building.managerId.
    function eligibleManagers() {
        if (!global.RH) return [];
        return global.RH.getUsers().filter(function (u) {
            return u.role === 'manager' && u.status === 'active' && can('buildings.assignable', u);
        });
    }

    function deniedMessage(key) {
        return 'Bạn không có quyền: ' + labelOf(key) + '. Liên hệ quản trị viên để được cấp quyền.';
    }

    // Use at the top of every mutating handler: if (!RHP.guard('x.update')) return;
    function guard(key) {
        if (can(key)) return true;
        alert(deniedMessage(key));
        return false;
    }

    var DEMO_MIGRATION_KEY = 'residenthub_demo_admin_migration_v1';
    var DEMO_LINK_RECOVERY_KEY = 'residenthub_demo_admin_link_recovery_v2';

    function demoAdminState() {
        if (!global.RH || !global.RH.isLocalDemoEnvironment || !global.RH.isLocalDemoEnvironment()) return { status: 'disabled' };
        var usersRaw = localStorage.getItem('residenthub_users');
        var typesRaw = localStorage.getItem(TYPES_KEY);
        try {
            var users = JSON.parse(usersRaw || '[]'), types = JSON.parse(typesRaw || '[]');
            if (!Array.isArray(users) || !Array.isArray(types)) return { status: 'invalid-store' };
            var emailOf = function (u) { return String(u.email || '').trim().toLowerCase().replace(/\s+/g, ''); };
            var matches = users.filter(function (u) { return u && (u.id === 'u-manager-1' || emailOf(u) === 'manager@residenthub.vn'); });
            if (!matches.length) return { status: 'missing' };
            var user = matches[0];
            if (matches.length !== 1 || user.id !== 'u-manager-1' || emailOf(user) !== 'manager@residenthub.vn' || user.role !== 'manager') return { status: 'identity-conflict' };
            var linked = types.filter(function (t) { return t && t.id === user.accountTypeId; });
            var healthy = linked.length === 1 && linked[0].portal === 'manager' && linked[0].fullAccess === true;
            return { status: healthy ? 'ready' : 'permission-conflict', user: user, users: users, types: types, usersRaw: usersRaw, typesRaw: typesRaw };
        } catch (e) { return { status: 'invalid-store' }; }
    }

    // Read-only diagnostic; no passwords or full account records in its result.
    function inspectDemoAdmin() {
        var state = demoAdminState();
        return { status: state.status, accountTypeId: state.user ? state.user.accountTypeId || '' : null,
            accountStatus: state.user ? state.user.status || 'active' : null,
            migrationRecorded: localStorage.getItem(DEMO_MIGRATION_KEY) !== null || localStorage.getItem(DEMO_LINK_RECOVERY_KEY) !== null,
            message: state.status === 'permission-conflict' ? 'Quyền Admin demo khác cấu hình chuẩn. Không thể suy ra đây là lỗi hay thu hồi có chủ đích; không tự thay đổi.' : '' };
    }

    // Explicit local-demo compatibility repair, never called at startup.
    // An assigned/restricted type is ambiguous and must not be replaced.
    function migrateDemoAdmin() {
        var state = demoAdminState();
        if (state.status !== 'permission-conflict' || !state.user ||
            (state.user.accountTypeId != null && (typeof state.user.accountTypeId !== 'string' || state.user.accountTypeId.trim()))) {
            return { ok: false, reason: 'requires-trusted-reprovisioning' };
        }
        var admins = state.types.filter(function (t) { return t && t.id === ADMIN_TYPE_ID; });
        if (admins.length !== 1 || admins[0].portal !== 'manager' || admins[0].fullAccess !== true) {
            return { ok: false, reason: 'admin-type-conflict' };
        }
        if (state.user.status !== 'active') return { ok: false, reason: 'inactive-account' };
        // getSession() reads/normalizes all users in some versions; use the
        // read-only snapshot so recovery changes only the one missing link.
        var session = diagnoseBuildingCreate();
        if (!session.sessionValid || !session.account || session.account.id !== state.user.id || session.sessionSource === 'demo-preview') return { ok: false, reason: 'demo-login-required' };
        var backupKey = DEMO_LINK_RECOVERY_KEY;
        if (localStorage.getItem(DEMO_MIGRATION_KEY) !== null || localStorage.getItem(backupKey) !== null) return { ok: false, reason: 'already-recorded' };
        if (typeof global.prompt !== 'function' || typeof global.confirm !== 'function') return { ok: false, reason: 'confirmation-unavailable' };
        if (global.prompt('CHỈ DEMO: thiếu loại có thể là thu hồi quyền có chủ đích. Chỉ người phụ trách xác nhận đây là dữ liệu cũ cần khôi phục mới tiếp tục. Đóng các tab ResidentHub khác. Nhập KHOI PHUC ADMIN DEMO để cho phép liên kết u-manager-1 với at-admin:') !== 'KHOI PHUC ADMIN DEMO') return { ok: false, reason: 'canceled' };
        if (!global.confirm('Xác nhận cấp lại quyền Admin demo cho u-manager-1 / manager@residenthub.vn đang thiếu loại. Chỉ đổi accountTypeId thành at-admin; giữ nguyên mật khẩu, trạng thái, loại quyền và nghiệp vụ. Lưu bản sao users trước khi ghi; bản sao chứa dữ liệu nhạy cảm, không chia sẻ.')) return { ok: false, reason: 'canceled' };
        var liveSession = diagnoseBuildingCreate();
        if (!liveSession.sessionValid || !liveSession.account || liveSession.account.id !== state.user.id || liveSession.sessionSource === 'demo-preview') return { ok: false, reason: 'session-changed' };
        if (localStorage.getItem('residenthub_users') !== state.usersRaw || localStorage.getItem(TYPES_KEY) !== state.typesRaw || localStorage.getItem(DEMO_MIGRATION_KEY) !== null || localStorage.getItem(backupKey) !== null) return { ok: false, reason: 'store-changed' };
        try {
            localStorage.setItem(backupKey, JSON.stringify({ version: 2, createdAt: Date.now(), usersRaw: state.usersRaw, accountId: state.user.id, toTypeId: ADMIN_TYPE_ID }));
            localStorage.setItem('residenthub_users', JSON.stringify(state.users.map(function (u) {
                return u === state.user ? Object.assign({}, u, { accountTypeId: ADMIN_TYPE_ID }) : u;
            })));
            cache.key = null;
            return { ok: true, accountTypeId: ADMIN_TYPE_ID, backupKey: backupKey, reloadRequired: true };
        } catch (e) {
            return { ok: false, reason: 'storage-write-failed', backupKey: backupKey };
        }
    }

    // Read-only: current policy decisions, not claims that an action ran.
    function diagnoseBuildingCreate() {
        // Do not call getSession()/resolve(): invalid sessions are logged out
        // by getSession(), which would make this diagnostic mutate storage.
        var user = null, sessionValid = false, sessionSource = null;
        try {
            var tabRaw = sessionStorage.getItem('residenthub_session');
            var raw = tabRaw || localStorage.getItem('residenthub_session');
            sessionSource = raw ? (tabRaw ? 'sessionStorage' : 'localStorage') : null;
            var session = JSON.parse(raw || 'null');
            var users = JSON.parse(localStorage.getItem('residenthub_users') || '[]');
            var candidate = Array.isArray(users) && session ? users.filter(function (u) { return u && u.id === session.id; })[0] : null;
            sessionValid = !!(candidate && candidate.status === 'active' && Number(session.credentialVersion || 0) === Number(candidate.credentialVersion || 0));
            if (sessionValid) user = candidate;
            if (global.RH_SESSION && global.RH_SESSION.demo) {
                user = { id: 'demo', accountTypeId: ADMIN_TYPE_ID, role: 'manager' };
                sessionValid = true;
                sessionSource = 'demo-preview';
            }
        } catch (e) { sessionValid = false; }
        var type = typeForUser(user);
        var allowed = !!(sessionValid && type && type.portal === 'manager' && (type.fullAccess || (type.permissions || []).indexOf('buildings.create') !== -1));
        var button = global.document && global.document.querySelector('.db-add');
        return {
            version: 'building-permissions-2026-10-30-v3',
            origin: global.location && global.location.origin || null,
            sessionValid: sessionValid, sessionSource: sessionSource,
            initialization: 'empty-local-demo-only; missing demo link requires explicit owner confirmation',
            account: user ? { id: user.id, role: user.role, status: user.status || null, accountTypeId: user.accountTypeId || '' } : null,
            resolvedType: type ? { id: type.id, portal: type.portal, fullAccess: type.fullAccess === true,
                buildingsCreate: (type.permissions || []).indexOf('buildings.create') !== -1 } : null,
            fallbackUsed: !!(user && type && user.accountTypeId !== type.id),
            buildingsCreate: allowed, renderCheck: allowed, openFormCheck: allowed, saveCheck: allowed,
            dashboardButtonVisible: button && global.getComputedStyle ? global.getComputedStyle(button).display !== 'none' : null,
            demo: inspectDemoAdmin()
        };
    }

    seed();
    var demoDiagnostic = inspectDemoAdmin();
    if (['permission-conflict', 'identity-conflict', 'invalid-store'].indexOf(demoDiagnostic.status) !== -1 && global.console) global.console.warn('ResidentHub Admin demo:', demoDiagnostic);

    global.RHP = {
        ADMIN_TYPE_ID: ADMIN_TYPE_ID,
        inspectDemoAdmin: inspectDemoAdmin,
        diagnoseBuildingCreate: diagnoseBuildingCreate,
        migrateDemoAdmin: migrateDemoAdmin,
        RESIDENT_TYPE_ID: RESIDENT_TYPE_ID,
        ACTIONS: ACTIONS,
        SCHEMA: PERMISSION_SCHEMA,
        registerModule: registerModule,
        undeclaredPermissions: undeclaredPermissions,
        allKeys: allKeys,
        moduleOf: moduleOf,
        labelOf: labelOf,
        listTypes: listTypes,
        getType: getType,
        saveType: saveType,
        deleteType: deleteType,
        usersOfType: usersOfType,
        currentUser: currentUser,
        typeOfUser: typeOfUser,
        isAdmin: isAdmin,
        can: can,
        canAny: canAny,
        guard: guard,
        deniedMessage: deniedMessage,
        buildingScope: buildingScope,
        inScope: inScope,
        scopeList: scopeList,
        eligibleManagers: eligibleManagers
    };
})(window);
