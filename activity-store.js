/* Shared append-only UI audit, reusing the existing activity_v1 store. No UI. */
(function (global) {
    'use strict';
    var failure = '';
    var allowed = {
        settings: ['notifyInvoice', 'notifyContract', 'notifySupportStatus', 'notifyBuildingActivity', 'invoiceReminderDays', 'contractReminderDays', 'notificationTemplates', 'notificationDelivery', 'financialAlerts'],
        users: ['id', 'name', 'role', 'status', 'accountTypeId', 'buildingIds', 'allBuildings', 'apartmentId', 'residentId'],
        roles: ['id', 'name', 'portal', 'permissions', 'fullAccess'],
        auth: ['id'],
        financialAccounts: ['id', 'code', 'name', 'type', 'bank', 'branch', 'openingBalance', 'openingDate', 'lockedThrough', 'ownerId', 'status'],
        cashflows: ['id', 'code', 'buildingId', 'financialAccountId', 'date', 'type', 'amount', 'status'],
        buildings: ['id', 'name', 'status'], apartments: ['id', 'name', 'buildingId', 'status'],
        customers: ['id', 'fullName', 'status'], contracts: ['id', 'code', 'buildingId', 'status', 'startDate', 'endDate'],
        invoices: ['id', 'code', 'buildingId', 'status', 'total', 'paidAmount', 'paidAt'],
        supportRequests: ['id', 'code', 'buildingId', 'status', 'assignee'],
        meters: ['id', 'buildingId', 'approvalStatus'], deposits: ['id', 'code', 'buildingId', 'status'],
        depositTransactions: ['id', 'buildingId', 'type', 'amount']
    };
    function mode() { return global.RHD && global.RHD.mode ? global.RHD.mode() : (global.RHD_MODE === 'demo' ? 'demo' : 'live'); }
    function key() { return 'residenthub_' + mode() + '_activity_v1'; }
    function read() {
        var rows = JSON.parse(localStorage.getItem(key()) || '[]');
        if (!Array.isArray(rows) || rows.some(function (r) { return !r || typeof r.id !== 'string' || typeof r.actorId !== 'string' || !Number.isFinite(Date.parse(r.at)); })) throw Error('Dữ liệu nhật ký không hợp lệ; không ghi đè dữ liệu cũ.');
        return rows;
    }
    function snapshot(entity, row) {
        if (!row) return null;
        var out = {};
        (allowed[entity] || []).forEach(function (field) { if (row[field] !== undefined) out[field] = row[field]; });
        if (entity === 'financialAccounts' && row.accountNumber) out.accountNumber = '••••' + String(row.accountNumber).slice(-4);
        return JSON.parse(JSON.stringify(out));
    }
    function roleLabel(user) {
        if (global.RHP) { var role = global.RHP.typeOfUser(user); if (role) return role.name; }
        var roles = JSON.parse(localStorage.getItem('residenthub_account_types') || '[]');
        var match = Array.isArray(roles) && roles.find(function (r) { return r.id === user.accountTypeId; });
        return match ? match.name : user.role === 'resident' ? 'Cư dân' : 'Quản lý';
    }
    function record(entity, action, before, after, context) {
        if (!allowed[entity]) return;
        try {
            context = context || {};
            var user = context.actor || (global.RHP && global.RHP.currentUser()) || (global.RH && global.RH.getSession());
            if (!user) return;
            var old = snapshot(entity, before), next = snapshot(entity, after);
            if (action === 'update' && JSON.stringify(old) === JSON.stringify(next)) {
                // Sensitive-only changes still get an action, without their values.
                if (entity !== 'users' && entity !== 'customers' && entity !== 'financialAccounts') return;
                if (JSON.stringify(before) === JSON.stringify(after)) return;
            }
            var row = after || before || {}, buildingId = row.buildingId || (entity === 'buildings' ? row.id : '');
            if (!buildingId && row.apartmentId && global.RHD) { var apt = global.RHD.get('apartments', row.apartmentId); buildingId = apt && apt.buildingId || ''; }
            var rows = read();
            rows.push({ id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2), at: new Date().toISOString(), actorId: user.id, actorName: user.name, role: roleLabel(user), module: entity, action: action, objectId: row.id || 'general-settings', buildingId: buildingId, result: context.result || 'Thành công', before: old, after: next });
            localStorage.setItem(key(), JSON.stringify(rows));
        } catch (e) { failure = 'Thao tác đã lưu nhưng không ghi được nhật ký: ' + e.message; if (global.console) console.error(failure); }
    }
    global.RHActivity = { read: read, record: record, error: function () { return failure; } };
})(window);
