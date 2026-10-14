/*
 * ResidentHub - account types (Loại tài khoản) + permission resolver (RHP).
 *
 *   User --accountTypeId--> AccountType --permissions[]--> "module.action" keys
 *
 * PERMISSION_SCHEMA below is the ONLY place permissions are declared. The
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
        { id: 'support', label: 'Yêu cầu hỗ trợ', actions: ['view', 'update'] },
        { id: 'reports', label: 'Báo cáo', actions: ['view'] },
        { id: 'roles', label: 'Loại tài khoản', actions: ['view', 'create', 'update', 'delete'] },
        { id: 'users', label: 'Người dùng', actions: ['view', 'create', 'update', 'delete'],
            extra: [{ id: 'approveResident', label: 'Duyệt tài khoản cư dân' }, { id: 'lock', label: 'Khóa / mở khóa tài khoản' }] },
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

    function moduleOf(key) { return String(key).split('.')[0]; }

    function labelOf(key) {
        var parts = String(key).split('.');
        var m = PERMISSION_SCHEMA.filter(function (x) { return x.id === parts[0]; })[0];
        if (!m) return key;
        var a = ACTIONS.filter(function (x) { return x.id === parts[1]; })[0] || (m.extra || []).filter(function (x) { return x.id === parts[1]; })[0];
        return (a ? a.label : parts[1]) + ' · ' + m.label;
    }

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
            description: 'Nhân viên vận hành: ghi chỉ số, tài sản, xử lý yêu cầu.',
            permissions: ['dashboard.view', 'buildings.view', 'apartments.view',
                'assets.view', 'assets.create', 'assets.update', 'assetTypes.view', 'assetTypes.create',
                'customers.view', 'customers.create', 'customers.update',
                'meters.view', 'meters.create', 'meters.update', 'contracts.view', 'invoices.view',
                'support.view', 'support.update']
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
        var list = readTypes();
        if (!list) { writeTypes(DEFAULT_TYPES.map(function (t) { return Object.assign({ createdAt: Date.now() }, t); })); return; }
        // The two system types must always exist (users fall back to them).
        var changed = false;
        [ADMIN_TYPE_ID, RESIDENT_TYPE_ID].forEach(function (id) {
            if (!list.some(function (t) { return t.id === id; })) {
                list.push(Object.assign({ createdAt: Date.now() }, DEFAULT_TYPES.filter(function (t) { return t.id === id; })[0]));
                changed = true;
            }
        });
        if (changed) writeTypes(list);
    }

    function listTypes() { return readTypes() || []; }
    function getType(id) { return listTypes().filter(function (t) { return t.id === id; })[0] || null; }

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
        return { ok: true, item: record };
    }

    function deleteType(id) {
        var t = getType(id);
        if (!t) return { ok: false, error: 'Không tìm thấy loại tài khoản.' };
        if (t.system) return { ok: false, error: 'Không thể xoá loại tài khoản hệ thống.' };
        var used = usersOfType(id).length;
        if (used) return { ok: false, error: 'Không thể xoá: còn ' + used + ' người dùng thuộc loại tài khoản này.' };
        writeTypes(listTypes().filter(function (x) { return x.id !== id; }));
        return { ok: true };
    }

    // ------------------------------------------------------------ resolution
    // Cached by the raw localStorage strings so can() is cheap to call per row.

    var cache = { key: null, user: null, type: null, set: null };

    function sessionUserId() {
        var s = global.RH_SESSION;
        if (s && s.demo) return 'demo';
        var live = global.RH && global.RH.getSession ? global.RH.getSession() : null;
        return live ? live.id : (s ? s.id : null);
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
        cache.type = cache.user ? getType(cache.user.accountTypeId) : null;
        cache.set = {};
        (cache.type && cache.type.permissions || []).forEach(function (k) { cache.set[k] = true; });
        return cache;
    }

    function currentUser() { return resolve().user; }

    function typeOfUser(user) {
        if (!user) return null;
        var c = resolve();
        return c.user && c.user.id === user.id ? c.type : getType(user.accountTypeId);
    }

    function isAdmin(user) {
        var t = typeOfUser(user === undefined ? currentUser() : user);
        return !!(t && t.fullAccess);
    }

    // can('buildings.update') for the signed-in user, or for any given user.
    function can(key, user) {
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
                var own = contracts.filter(function (k) { return k.customerId === c.id; });
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

    seed();

    global.RHP = {
        ADMIN_TYPE_ID: ADMIN_TYPE_ID,
        RESIDENT_TYPE_ID: RESIDENT_TYPE_ID,
        ACTIONS: ACTIONS,
        SCHEMA: PERMISSION_SCHEMA,
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
