/*
 * ResidentHub - "Tài khoản" group: Loại tài khoản (account types + permission
 * matrix) and Người dùng (login accounts).
 *
 * - The permission matrix is rendered from RHP.SCHEMA (permissions.js) only;
 *   nothing here lists modules or actions by hand.
 * - Người dùng manages the single account store in auth.js (RH). Resident
 *   accounts still come only from the registration-approval flow, whose
 *   queue (dashboard.html: renderAccountRequestsTable/openAccountRequestDrawer)
 *   is shown as the "Chờ duyệt" sub-tab here.
 * - Non-admins can never escalate: they cannot assign/edit Admin, change their
 *   own account type or scope, or grant permissions they do not hold.
 * Depends on: auth.js (RH), permissions.js (RHP), data.js (RHD),
 * searchable-select.js (RHSelect), manager-modules.js (RHUI.util).
 */
(function (global) {
    var U = function () { return global.RHUI.util; };
    function byId(id) { return document.getElementById(id); }
    function esc(s) { return U().escapeHtml(s); }
    function fold(s) { return global.RHSelect ? global.RHSelect.fold(s) : String(s || '').toLowerCase(); }
    function me() { return global.RHP.currentUser(); }
    function isAdmin() { return global.RHP.isAdmin(); }

    function pill(label, color, bg) {
        return '<span class="acc-pill" style="background:' + bg + ';color:' + color + ';">' + esc(label) + '</span>';
    }

    function typePill(type) {
        if (!type) return pill('Không xác định', '#ef4444', '#fee2e2');
        if (type.fullAccess) return pill(type.name, '#7c3aed', '#f3e8ff');
        if (type.portal === 'resident') return pill(type.name, '#18a878', '#e6f8ef');
        return pill(type.name, '#0d65d5', '#eaf3ff');
    }

    function afterAccessChange() {
        if (typeof global.applyNavPermissions === 'function') global.applyNavPermissions();
        if (typeof global.renderCurrentUser === 'function') global.renderCurrentUser();
        if (global.RHUI && global.RHUI.renderDashboardCounts) global.RHUI.renderDashboardCounts();
    }

    // ===================================================== LOẠI TÀI KHOẢN

    var roleState = { id: null, readOnly: false };

    function renderRolesTab() {
        var tab = byId('roles-tab');
        if (!tab) return;
        var types = global.RHP.listTypes();
        var self = me();
        var rows = types.map(function (t) {
            var users = global.RHP.usersOfType(t.id).length;
            var permsLabel = t.fullAccess ? '<strong style="color:#7c3aed;">Toàn quyền</strong>'
                : t.portal === 'resident' ? '<span style="color:#94a3b8;">Cổng cư dân</span>'
                    : (t.permissions || []).length + ' quyền';
            var ownType = self && self.accountTypeId === t.id && !isAdmin();
            var editable = U().can('roles.update') && !t.fullAccess && !ownType;
            return '<tr class="rh-click-row" tabindex="0" onclick="RHAccounts.openRole(\'' + t.id + '\')" onkeydown="if(event.key===\'Enter\'&&event.target===this)RHAccounts.openRole(\'' + t.id + '\')">' +
                '<td><strong>' + esc(t.name) + '</strong>' + (t.system ? ' <span style="color:#94a3b8;font-size:.72rem;">· Hệ thống</span>' : '') + '</td>' +
                '<td style="color:#61708a;max-width:340px;">' + esc(t.description || '—') + '</td>' +
                '<td>' + (t.portal === 'resident' ? pill('Cổng cư dân', '#18a878', '#e6f8ef') : pill('Cổng quản lý', '#0d65d5', '#eaf3ff')) + '</td>' +
                '<td>' + permsLabel + '</td>' +
                '<td>' + users + '</td>' +
                '<td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()">' +
                (editable ? '<button class="rh-row-btn" title="Sửa" onclick="RHAccounts.openRole(\'' + t.id + '\')"><i class="fas fa-pen"></i></button>'
                    : '<button class="rh-row-btn" title="Xem" onclick="RHAccounts.openRole(\'' + t.id + '\')"><i class="fas fa-eye"></i></button>') +
                (U().can('roles.delete') && !t.system ? '<button class="rh-row-btn danger" title="Xoá" onclick="RHAccounts.deleteRole(\'' + t.id + '\')"><i class="fas fa-trash"></i></button>' : '') +
                '</td></tr>';
        }).join('');

        tab.innerHTML = '<div class="card">' +
            '<div class="acc-head"><div><h2>Loại tài khoản</h2><p>Mỗi loại tài khoản là một bộ quyền. Quyền được áp dụng ngay cho mọi người dùng thuộc loại đó — menu, trang, nút thao tác và phạm vi tòa nhà.</p></div>' +
            U().addButton('Thêm loại tài khoản', 'RHAccounts.openRole()', null, 'roles.create') + '</div>' +
            '<div class="table-container" style="margin-top:1.25rem;"><table><thead><tr><th>Tên loại tài khoản</th><th>Mô tả</th><th>Cổng</th><th>Quyền</th><th>Người dùng</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
            '</div>';
    }

    function matrixHtml(type, readOnly) {
        var granted = {};
        (type && type.permissions || []).forEach(function (k) { granted[k] = true; });
        var full = !!(type && type.fullAccess);
        var self = me();
        // Non-admins may only toggle permissions they hold themselves.
        var lockedKey = function (k) { return readOnly || full || (!isAdmin() && !global.RHP.can(k, self)); };
        var box = function (key, kind, label) {
            var dis = lockedKey(key);
            return '<label class="pm-check' + (dis ? ' is-disabled' : '') + '"><input type="checkbox" class="pm-perm" data-perm="' + key + '" data-module="' + key.split('.')[0] + '" data-kind="' + kind + '"' +
                (full || granted[key] ? ' checked' : '') + (dis ? ' disabled' : '') + '><span>' + esc(label) + '</span></label>';
        };
        var rows = global.RHP.SCHEMA.map(function (m) {
            var cells = global.RHP.ACTIONS.map(function (a) {
                return '<td>' + (m.actions.indexOf(a.id) !== -1 ? box(m.id + '.' + a.id, a.id === 'view' ? 'view' : 'other', a.label) : '') + '</td>';
            }).join('');
            var extra = (m.extra || []).map(function (x) { return box(m.id + '.' + x.id, 'other', x.label); }).join('');
            return '<tr><td><label class="pm-check pm-module' + (readOnly || full ? ' is-disabled' : '') + '"><input type="checkbox" class="pm-row" data-module="' + m.id + '"' + (readOnly || full ? ' disabled' : '') + '><span>' + esc(m.label) + '</span></label></td>' +
                cells + '<td class="pm-extra">' + extra + '</td></tr>';
        }).join('');
        return '<label class="pm-check pm-all' + (readOnly || full ? ' is-disabled' : '') + '"><input type="checkbox" id="pmAll"' + (readOnly || full ? ' disabled' : '') + '><span>Tất cả</span></label>' +
            '<div class="table-container pm-wrap"><table class="pm-table"><thead><tr><th>Nhóm quyền</th>' +
            global.RHP.ACTIONS.map(function (a) { return '<th>' + esc(a.label) + '</th>'; }).join('') +
            '<th>Quyền khác</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function syncMatrix() {
        var all = byId('pmAll');
        var perms = Array.prototype.slice.call(document.querySelectorAll('.pm-perm'));
        document.querySelectorAll('.pm-row').forEach(function (row) {
            var mine = perms.filter(function (p) { return p.dataset.module === row.dataset.module; });
            var on = mine.filter(function (p) { return p.checked; }).length;
            row.checked = on === mine.length && on > 0;
            row.indeterminate = on > 0 && on < mine.length;
        });
        if (all) {
            var on = perms.filter(function (p) { return p.checked; }).length;
            all.checked = on === perms.length;
            all.indeterminate = on > 0 && on < perms.length;
        }
    }

    function setChecked(list, value) {
        list.forEach(function (p) { if (!p.disabled) p.checked = value; });
    }

    function bindMatrix() {
        var table = document.querySelector('.pm-table');
        if (!table) return;
        table.addEventListener('change', function (ev) {
            var t = ev.target;
            var modulePerms = function (m) { return Array.prototype.slice.call(document.querySelectorAll('.pm-perm[data-module="' + m + '"]')); };
            if (t.classList.contains('pm-row')) {
                setChecked(modulePerms(t.dataset.module), t.checked);
            } else if (t.classList.contains('pm-perm')) {
                var mod = modulePerms(t.dataset.module);
                // Any action implies "Xem"; removing "Xem" removes the rest of the module.
                if (t.checked && t.dataset.kind !== 'view') setChecked(mod.filter(function (p) { return p.dataset.kind === 'view'; }), true);
                if (!t.checked && t.dataset.kind === 'view') setChecked(mod, false);
            }
            syncMatrix();
        });
        var all = byId('pmAll');
        if (all) all.addEventListener('change', function () {
            setChecked(Array.prototype.slice.call(document.querySelectorAll('.pm-perm')), all.checked);
            syncMatrix();
        });
        syncMatrix();
    }

    function openRole(id) {
        if (!U().guard(id ? 'roles.view' : 'roles.create')) return;
        var t = id ? global.RHP.getType(id) : null;
        if (id && !t) return;
        var self = me();
        var ownType = t && self && self.accountTypeId === t.id && !isAdmin();
        var readOnly = !!t && (!U().can('roles.update') || t.fullAccess || ownType);
        roleState = { id: id || null, readOnly: readOnly };
        var portal = t ? t.portal : 'manager';
        var dis = readOnly ? ' disabled' : '';

        var notes = '';
        if (t && t.fullAccess) notes = '<div class="pm-note"><i class="fas fa-crown"></i> Admin luôn có toàn quyền, kể cả các chức năng được bổ sung sau này. Quyền của loại này không thể chỉnh sửa.</div>';
        else if (ownType) notes = '<div class="pm-note"><i class="fas fa-lock"></i> Đây là loại tài khoản bạn đang dùng — bạn không thể tự thay đổi quyền của chính mình.</div>';
        else if (t && !U().can('roles.update')) notes = '<div class="pm-note"><i class="fas fa-eye"></i> Bạn chỉ có quyền xem loại tài khoản.</div>';
        else if (!isAdmin()) notes = '<div class="pm-note"><i class="fas fa-circle-info"></i> Bạn chỉ có thể cấp các quyền mà chính bạn đang có.</div>';

        var html = '<form onsubmit="RHAccounts.submitRole(event)">' + notes +
            '<div class="rh-field"><label>Tên loại tài khoản <span style="color:#ef4444;">*</span></label><input id="rfName" maxlength="60" value="' + esc(t ? t.name : '') + '" placeholder="VD: Quản lý tòa nhà"' + dis + '></div>' +
            '<div class="rh-field" style="margin-top:1rem;"><label>Mô tả</label><textarea id="rfDesc" rows="2" maxlength="300" placeholder="VD: Tài khoản dành cho nhân viên phụ trách tòa nhà"' + dis + '>' + esc(t ? t.description : '') + '</textarea></div>' +
            (t && t.system ? '' :
                '<div class="rh-field" style="margin-top:1rem;"><label>Cổng sử dụng</label><div style="display:flex;gap:.6rem;flex-wrap:wrap;">' +
                '<label class="rh-choice"><input type="radio" name="rfPortal" value="manager"' + (portal === 'manager' ? ' checked' : '') + dis + '> Cổng quản lý (nhân viên)</label>' +
                '<label class="rh-choice"><input type="radio" name="rfPortal" value="resident"' + (portal === 'resident' ? ' checked' : '') + dis + '> Cổng cư dân</label>' +
                '</div></div>') +
            '<div class="rh-section" id="rfMatrixSection"' + (portal === 'resident' ? ' style="display:none;"' : '') + '><div class="rh-section-title">Phân quyền</div>' + matrixHtml(t, readOnly) + '</div>' +
            '<div class="rh-section" id="rfResidentNote"' + (portal === 'resident' ? '' : ' style="display:none;"') + '><p style="color:#61708a;font-size:.88rem;"><i class="fas fa-house-user" style="color:#18a878;"></i> Tài khoản thuộc Cổng cư dân dùng ứng dụng cư dân; dữ liệu họ thấy được xác định bởi hồ sơ cư dân và hợp đồng liên kết, không dùng ma trận quyền quản lý.</p></div>' +
            '<div id="rfError" style="color:#ef4444;font-size:.85rem;margin-top:1rem;"></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;justify-content:flex-end;">' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">' + (readOnly ? 'Đóng' : 'Hủy bỏ') + '</button>' +
            (readOnly ? '' : '<button type="submit" class="btn-primary">Lưu</button>') +
            '</div></form>';
        global.RHUI.openDrawer(t ? (readOnly ? 'Loại tài khoản — ' + t.name : 'Sửa loại tài khoản') : 'Thêm loại tài khoản', html, { width: 960 });
        bindMatrix();
        document.querySelectorAll('input[name="rfPortal"]').forEach(function (r) {
            r.addEventListener('change', function () {
                byId('rfMatrixSection').style.display = this.value === 'resident' ? 'none' : '';
                byId('rfResidentNote').style.display = this.value === 'resident' ? '' : 'none';
            });
        });
        if (!readOnly) byId('rfName').focus();
    }

    function submitRole(ev) {
        ev.preventDefault();
        if (roleState.readOnly) return;
        if (!U().guard(roleState.id ? 'roles.update' : 'roles.create')) return;
        var portalEl = document.querySelector('input[name="rfPortal"]:checked');
        var res = global.RHP.saveType(roleState.id, {
            name: byId('rfName').value,
            description: byId('rfDesc').value,
            portal: portalEl ? portalEl.value : undefined,
            permissions: Array.prototype.filter.call(document.querySelectorAll('.pm-perm'), function (p) { return p.checked; }).map(function (p) { return p.dataset.perm; })
        });
        if (!res.ok) { byId('rfError').textContent = res.error; return; }
        global.RHUI.closeDrawer();
        renderRolesTab();
        afterAccessChange();
    }

    function deleteRole(id) {
        if (!U().guard('roles.delete')) return;
        var t = global.RHP.getType(id);
        if (!t || !confirm('Xoá loại tài khoản "' + t.name + '"?')) return;
        var res = global.RHP.deleteType(id);
        if (!res.ok) { alert(res.error); return; }
        renderRolesTab();
    }

    // ========================================================== NGƯỜI DÙNG

    var userState = { panel: 'users', q: '', typeId: '', status: '', editingId: null, fields: {} };

    var STATUS_META = {
        active: { label: 'Hoạt động', color: '#18a878', bg: '#e6f8ef' },
        inactive: { label: 'Ngừng hoạt động', color: '#61708a', bg: '#f1f5f9' },
        locked: { label: 'Đã khoá', color: '#ef4444', bg: '#fee2e2' }
    };

    // A non-admin may not act on Admin accounts (no privilege escalation).
    function canManageUser(u, perm) {
        if (!U().can(perm)) return false;
        if (!isAdmin() && global.RHP.isAdmin(u)) return false;
        return true;
    }

    function scopeCell(u) {
        if (u.role === 'resident') {
            return typeof global.residentLinkLabel === 'function' ? global.residentLinkLabel(u) : '—';
        }
        if (global.RHP.isAdmin(u) || u.allBuildings) return '<span style="color:#475569;">Tất cả tòa nhà</span>';
        var ids = global.RHP.buildingScope(u) || [];
        if (!ids.length) return '<span style="color:#ef4444;">Chưa gán tòa nhà</span>';
        var names = ids.map(function (id) { var b = RHD.get('buildings', id); return b ? (b.shortName || b.name) : null; }).filter(Boolean);
        return esc(names.slice(0, 3).join(', ')) + (names.length > 3 ? ' <span style="color:#94a3b8;">+' + (names.length - 3) + '</span>' : '');
    }

    function filteredUsers() {
        var q = fold(userState.q.trim());
        return global.RH.getUsers().filter(function (u) {
            if (userState.typeId && u.accountTypeId !== userState.typeId) return false;
            if (userState.status && u.status !== userState.status) return false;
            if (q && fold([u.name, u.phone, u.email, u.employeeCode, u.department, u.title].join(' ')).indexOf(q) === -1) return false;
            return true;
        }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'vi'); });
    }

    function renderUsersTable() {
        var body = byId('usersTableBody');
        if (!body) return;
        var self = me();
        var users = filteredUsers();
        body.innerHTML = users.map(function (u) {
            var st = STATUS_META[u.status] || STATUS_META.active;
            var isSelf = self && u.id === self.id;
            var locked = u.status === 'locked';
            return '<tr>' +
                '<td><div style="display:flex;align-items:center;gap:.6rem;">' + U().avatarHtml(u.name, 34) + '<div style="min-width:0;"><strong>' + esc(u.name) + '</strong>' +
                (isSelf ? ' <span style="color:#94a3b8;font-size:.75rem;">(bạn)</span>' : '') +
                (u.employeeCode ? '<div style="font-size:.75rem;color:#94a3b8;">' + esc(u.employeeCode) + '</div>' : '') + '</div></div></td>' +
                '<td>' + esc(u.phone || '—') + (u.email ? '<div style="font-size:.75rem;color:#94a3b8;">' + esc(u.email) + '</div>' : '') + '</td>' +
                '<td>' + typePill(global.RHP.getType(u.accountTypeId)) + '</td>' +
                '<td>' + esc(u.department || '—') + (u.title ? '<div style="font-size:.75rem;color:#94a3b8;">' + esc(u.title) + '</div>' : '') + '</td>' +
                '<td>' + scopeCell(u) + '</td>' +
                '<td>' + pill(st.label, st.color, st.bg) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;">' +
                (canManageUser(u, 'users.update') ? '<button class="acc-btn" onclick="RHAccounts.openUser(\'' + u.id + '\')" title="Sửa"><i class="fas fa-pen"></i></button>' : '') +
                (!isSelf && canManageUser(u, 'users.lock') ? '<button class="acc-btn" onclick="RHAccounts.toggleLock(\'' + u.id + '\')" title="' + (locked ? 'Mở khoá' : 'Khoá') + '"><i class="fas ' + (locked ? 'fa-lock-open' : 'fa-lock') + '"></i></button>' : '') +
                (!isSelf && canManageUser(u, 'users.delete') ? '<button class="acc-btn danger" onclick="RHAccounts.deleteUser(\'' + u.id + '\')" title="Xoá"><i class="fas fa-trash"></i></button>' : '') +
                '</td></tr>';
        }).join('') || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:1.5rem;">Không có người dùng phù hợp</td></tr>';
    }

    function renderUsersTab(filter) {
        var tab = byId('accounts-tab');
        if (!tab) return;
        var canUsers = U().can('users.view');
        var canRequests = U().can('users.approveResident');
        // Dashboard links pass a request filter ('pending', ...) to open the approval queue.
        if (filter && canRequests) userState.panel = 'requests';
        if (userState.panel === 'requests' && !canRequests) userState.panel = 'users';
        if (userState.panel === 'users' && !canUsers) userState.panel = 'requests';
        var pending = global.RH.listAccountRequests().filter(function (r) { return r.status === 'pending' && global.RHP.inScope(r.buildingId); }).length;
        var types = global.RHP.listTypes();

        tab.innerHTML = '<div class="card">' +
            '<div class="acc-head"><div><h2>Người dùng</h2><p>Tài khoản đăng nhập của Admin, nhân viên và cư dân. Quyền của mỗi người lấy từ Loại tài khoản; phạm vi dữ liệu theo tòa nhà phụ trách.</p></div>' +
            (userState.panel === 'users' ? U().addButton('Thêm người dùng', 'RHAccounts.openUser()', null, 'users.create') : '') + '</div>' +
            '<div class="acc-subtabs">' +
            (canUsers ? '<button type="button" class="' + (userState.panel === 'users' ? 'active' : '') + '" onclick="RHAccounts.showPanel(\'users\')"><i class="fas fa-users"></i> Danh sách người dùng <span>' + global.RH.getUsers().length + '</span></button>' : '') +
            (canRequests ? '<button type="button" class="' + (userState.panel === 'requests' ? 'active' : '') + '" onclick="RHAccounts.showPanel(\'requests\')"><i class="fas fa-user-clock"></i> Tài khoản cư dân chờ duyệt' + (pending ? ' <span class="rh-nav-badge" style="display:inline-flex;margin-left:.35rem;">' + pending + '</span>' : '') + '</button>' : '') +
            '</div>' +
            (userState.panel === 'users'
                ? '<div class="asset-filters" style="margin-top:1rem;">' +
                '<div class="asset-search"><i class="fas fa-search"></i><input id="usersFilterQ" type="search" placeholder="Tìm theo tên, SĐT, email, mã NV..." value="' + esc(userState.q) + '"></div>' +
                '<select id="usersFilterType" class="asset-filter">' + U().selectOptions(types, 'id', 'name', userState.typeId, 'Mọi loại tài khoản') + '</select>' +
                '<select id="usersFilterStatus" class="asset-filter">' + U().selectOptions(Object.keys(STATUS_META).map(function (k) { return { id: k, label: STATUS_META[k].label }; }), 'id', 'label', userState.status, 'Mọi trạng thái') + '</select>' +
                '</div>' +
                '<div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Người dùng</th><th>Liên hệ</th><th>Loại tài khoản</th><th>Bộ phận / Chức danh</th><th>Tòa nhà phụ trách / Hồ sơ</th><th>Trạng thái</th><th style="text-align:right;">Hành động</th></tr></thead><tbody id="usersTableBody"></tbody></table></div>'
                : '<p style="color:#94a3b8;font-size:.85rem;margin-top:1rem;">Cư dân đăng ký từ trang chủ ở trạng thái Chờ phê duyệt. Chỉ khi được phê duyệt, tài khoản mới được kích hoạt và liên kết với hồ sơ cư dân.</p>' +
                '<div class="acc-filters" id="accountRequestFilters"></div>' +
                '<div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Người đăng ký</th><th>Liên hệ</th><th>Tòa nhà / Căn hộ</th><th>Hồ sơ cư dân</th><th>Trạng thái</th><th>Ngày đăng ký</th><th style="text-align:right;">Hành động</th></tr></thead><tbody id="accountRequestsTableBody"></tbody></table></div>') +
            '</div>';

        if (userState.panel === 'users') {
            byId('usersFilterQ').addEventListener('input', function () { userState.q = this.value; renderUsersTable(); });
            byId('usersFilterType').addEventListener('change', function () { userState.typeId = this.value; renderUsersTable(); });
            byId('usersFilterStatus').addEventListener('change', function () { userState.status = this.value; renderUsersTable(); });
            renderUsersTable();
        } else if (typeof global.renderAccountRequestsTable === 'function') {
            global.renderAccountRequestsTable(filter);
        }
    }

    // ---------------------------------------------------------- user form

    function datalist(id, key) {
        var values = [];
        global.RH.getUsers().forEach(function (u) { if (u[key] && values.indexOf(u[key]) === -1) values.push(u[key]); });
        return '<datalist id="' + id + '">' + values.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>';
    }

    function typeOptionsFor(user) {
        var portal = user ? user.role : 'manager';
        return global.RHP.listTypes().filter(function (t) {
            if ((t.portal === 'resident' ? 'resident' : 'manager') !== portal) return false;
            if (t.fullAccess && !isAdmin()) return false;
            return true;
        }).map(function (t) { return { value: t.id, label: t.name, sub: t.description || '' }; });
    }

    function residentProfileSelect(user) {
        var linkedElsewhere = global.RH.getUsers().filter(function (u) { return u.role === 'resident' && u.residentId && u.id !== user.id; }).map(function (u) { return u.residentId; });
        var customers = RHD.list('customers').filter(function (c) { return linkedElsewhere.indexOf(c.id) === -1; });
        return '<select id="ufResident"><option value="">— Chưa liên kết —</option>' + customers.map(function (c) {
            return '<option value="' + c.id + '"' + (c.id === user.residentId ? ' selected' : '') + '>' + esc(c.fullName) + (c.phone ? ' • ' + esc(c.phone) : '') + '</option>';
        }).join('') + '</select>';
    }

    function passwordInput(id, placeholder) {
        return '<div class="uf-password"><input id="' + id + '" type="password" autocomplete="new-password" placeholder="' + placeholder + '">' +
            '<button type="button" tabindex="-1" title="Hiện / ẩn mật khẩu" onclick="var i=document.getElementById(\'' + id + '\');i.type=i.type===\'password\'?\'text\':\'password\';this.firstChild.className=\'fas \'+(i.type===\'password\'?\'fa-eye\':\'fa-eye-slash\')"><i class="fas fa-eye"></i></button></div>';
    }

    function syncScopeSection() {
        var typeId = userState.fields.type ? userState.fields.type.getValue() : '';
        var t = typeId ? global.RHP.getType(typeId) : null;
        var adminType = !!(t && t.fullAccess);
        var all = byId('ufAllBuildings');
        if (!all) return;
        var locked = all.dataset.locked === '1';
        all.disabled = adminType || locked || global.RHP.buildingScope() !== null;
        if (adminType) all.checked = true;
        byId('ufScopeNote').textContent = adminType ? 'Admin luôn quản lý tất cả tòa nhà.' : (locked ? 'Bạn không thể tự thay đổi phạm vi tòa nhà của chính mình.' : '');
        byId('ufBuildingsWrap').style.display = all.checked ? 'none' : '';
        if (userState.fields.buildings) userState.fields.buildings.setDisabled(locked);
    }

    function openUser(id) {
        var u = id ? global.RH.getUsers().filter(function (x) { return x.id === id; })[0] : null;
        if (id && !u) return;
        if (!U().guard(id ? 'users.update' : 'users.create')) return;
        if (u && !canManageUser(u, 'users.update')) { alert('Chỉ Admin mới được sửa tài khoản Admin.'); return; }
        userState.editingId = id || null;
        userState.fields = {};
        var self = me();
        var isSelf = !!(u && self && u.id === self.id);
        var resident = !!(u && u.role === 'resident');
        var v = function (k) { return esc(u ? u[k] || '' : ''); };
        // New staff start limited to the buildings explicitly assigned to them.
        var allBuildings = u ? (global.RHP.isAdmin(u) || u.allBuildings) : false;
        var lockScope = isSelf && !isAdmin();
        var managedByMe = u ? RHD.list('buildings').filter(function (b) { return b.managerId === u.id; }) : [];

        var html = '<form onsubmit="RHAccounts.submitUser(event)" autocomplete="off" novalidate>' +
            '<div class="uf-card"><div class="uf-card-head"><span>Thông tin cơ bản</span>' +
            '<label class="uf-active">Hoạt động <span class="rh-switch"><input type="checkbox" id="ufActive"' + (!u || u.status === 'active' ? ' checked' : '') + (isSelf ? ' disabled' : '') + '><span></span></span></label></div>' +
            '<div class="rh-grid-3 uf-card-body">' +
            '<div class="rh-field"><label>Họ tên <span style="color:#ef4444;">*</span></label><input id="ufName" maxlength="80" value="' + v('name') + '" placeholder="Nguyễn Văn A"></div>' +
            '<div class="rh-field"><label>Số điện thoại' + (resident ? '' : ' <span style="color:#ef4444;">*</span>') + '</label><input id="ufPhone" inputmode="tel" maxlength="20" value="' + v('phone') + '" placeholder="Nhập số điện thoại"></div>' +
            '<div class="rh-field"><label>Email</label><input id="ufEmail" type="email" maxlength="120" value="' + v('email') + '" placeholder="ten@congty.vn"></div>' +
            '<div class="rh-field"><label>Loại tài khoản <span style="color:#ef4444;">*</span></label><div id="ufTypeField"></div></div>' +
            (resident ? '<div class="rh-field" style="grid-column:span 2;"><label>Hồ sơ cư dân liên kết</label>' + residentProfileSelect(u) + '</div>'
                : '<div class="rh-field"><label>Bộ phận</label><input id="ufDept" list="ufDeptList" maxlength="60" value="' + v('department') + '" placeholder="Chọn hoặc nhập bộ phận">' + datalist('ufDeptList', 'department') + '</div>' +
                '<div class="rh-field"><label>Chức danh</label><input id="ufTitle" list="ufTitleList" maxlength="60" value="' + v('title') + '" placeholder="Chức danh">' + datalist('ufTitleList', 'title') + '</div>' +
                '<div class="rh-field"><label>Mã nhân viên</label><input id="ufCode" maxlength="30" value="' + v('employeeCode') + '" placeholder="Mã nhân viên"></div>') +
            '</div>' +
            (!u ? '<p class="uf-hint"><i class="fas fa-circle-info"></i> Tài khoản cư dân được tạo qua phê duyệt đăng ký (tab "Tài khoản cư dân chờ duyệt"), không tạo tại đây.</p>' : '') +
            '</div>' +

            '<div class="uf-card"><div class="uf-card-head"><span>Mật khẩu</span></div><div class="rh-grid-2 uf-card-body">' +
            '<div class="rh-field"><label>Mật khẩu' + (u ? '' : ' <span style="color:#ef4444;">*</span>') + '</label>' + passwordInput('ufPassword', u ? 'Để trống nếu không đổi' : 'Tối thiểu 6 ký tự') + '</div>' +
            '<div class="rh-field"><label>Xác nhận mật khẩu' + (u ? '' : ' <span style="color:#ef4444;">*</span>') + '</label>' + passwordInput('ufPassword2', 'Xác nhận mật khẩu') + '</div>' +
            '</div><p class="uf-hint">Người dùng đăng nhập bằng số điện thoại hoặc email cùng mật khẩu này.</p></div>' +

            (resident ? '' :
                '<div class="uf-card"><div class="uf-card-head"><span>Quản lý tòa nhà</span>' +
                '<label class="uf-active">Quản lý tất cả tòa nhà <span class="rh-switch"><input type="checkbox" id="ufAllBuildings" data-locked="' + (lockScope ? '1' : '0') + '"' + (allBuildings ? ' checked' : '') + '><span></span></span></label></div>' +
                '<div class="uf-card-body"><div id="ufBuildingsWrap"><label style="color:#475569;display:block;font-size:.8rem;font-weight:600;margin-bottom:.35rem;">Tòa nhà phụ trách</label><div id="ufBuildingsField"></div>' +
                (managedByMe.length ? '<p class="uf-hint" style="padding:0;margin-top:.5rem;">Tự động gồm tòa đang được phân công làm người quản lý: ' + esc(managedByMe.map(function (b) { return b.shortName || b.name; }).join(', ')) + '.</p>' : '') +
                '</div><p class="uf-hint" id="ufScopeNote" style="padding:0;"></p></div></div>') +

            '<div id="ufError" style="color:#ef4444;font-size:.85rem;margin-top:1rem;"></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;justify-content:flex-end;">' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Hủy bỏ</button>' +
            '<button type="submit" class="btn-primary">Lưu</button>' +
            '</div></form>';

        global.RHUI.openDrawer(u ? 'Sửa người dùng' : 'Thêm người dùng', html, { width: 820 });

        var defaultType = u ? u.accountTypeId : (typeOptionsFor(null).filter(function (o) { return o.value === 'at-staff'; })[0] || {}).value || '';
        userState.fields.type = RHSelect.create(byId('ufTypeField'), {
            inputId: 'ufType',
            value: defaultType,
            placeholder: 'Chọn loại tài khoản',
            searchPlaceholder: 'Tìm loại tài khoản...',
            noOptionsText: 'Chưa có loại tài khoản phù hợp',
            clearable: false,
            disabled: isSelf && !isAdmin(),
            options: function () { return typeOptionsFor(u); },
            onChange: syncScopeSection
        });
        if (!resident) {
            userState.fields.buildings = RHSelect.createMulti(byId('ufBuildingsField'), {
                values: u ? u.buildingIds : [],
                placeholder: 'Chọn tòa nhà phụ trách',
                searchPlaceholder: 'Tìm tòa nhà...',
                noOptionsText: 'Chưa có tòa nhà nào',
                options: function () {
                    return U().scoped('buildings').map(function (b) { return { value: b.id, label: b.name, sub: [b.shortName, RHD.buildingFullAddress(b)].filter(Boolean).join(' · '), keywords: [b.code] }; });
                }
            });
            byId('ufAllBuildings').addEventListener('change', syncScopeSection);
            syncScopeSection();
        }
        byId('ufName').focus();
    }

    function submitUser(ev) {
        ev.preventDefault();
        var id = userState.editingId;
        if (!U().guard(id ? 'users.update' : 'users.create')) return;
        var u = id ? global.RH.getUsers().filter(function (x) { return x.id === id; })[0] : null;
        var err = byId('ufError');
        var fail = function (msg) { err.textContent = msg; };
        var self = me();
        var isSelf = !!(u && self && u.id === self.id);
        var resident = !!(u && u.role === 'resident');

        var name = byId('ufName').value.trim();
        var phone = byId('ufPhone').value.trim();
        var email = byId('ufEmail').value.trim();
        var typeId = userState.fields.type.getValue();
        var pw = byId('ufPassword').value;
        var pw2 = byId('ufPassword2').value;
        var type = global.RHP.getType(typeId);

        if (!name) return fail('Vui lòng nhập họ tên.');
        if (!phone && !resident) return fail('Vui lòng nhập số điện thoại.');
        if (phone && !/^[+\d][\d\s.-]{7,18}$/.test(phone)) return fail('Số điện thoại không hợp lệ.');
        if (!phone && !email) return fail('Cần có số điện thoại hoặc email để đăng nhập.');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Email không hợp lệ.');
        if (!type) return fail('Vui lòng chọn loại tài khoản.');
        if (type.fullAccess && !isAdmin()) return fail('Chỉ Admin mới được gán loại tài khoản Admin.');
        if (!u && type.portal === 'resident') return fail('Tài khoản cư dân được tạo qua phê duyệt đăng ký.');
        if (!u || pw) {
            if (pw.length < 6) return fail('Mật khẩu phải có ít nhất 6 ký tự.');
            if (pw !== pw2) return fail('Mật khẩu xác nhận không khớp.');
        }

        var payload = { name: name, phone: phone, email: email, accountTypeId: typeId };
        if (!isSelf) payload.status = byId('ufActive').checked ? 'active' : 'inactive';
        if (isSelf && !isAdmin()) delete payload.accountTypeId;

        if (resident) {
            var residentId = byId('ufResident').value;
            // Keep the account's display cache in step with the Resident Profile's contract.
            var ctx = RHD.residentContext({ id: u.id, email: u.email, residentId: residentId, apartmentId: residentId === u.residentId ? u.apartmentId : '' });
            payload.residentId = residentId;
            payload.apartmentId = ctx && ctx.apartment ? ctx.apartment.id : '';
            payload.unit = ctx && ctx.apartment ? ctx.apartment.name : '';
            payload.building = ctx && ctx.building ? (ctx.building.shortName || ctx.building.name) : '';
        } else {
            payload.department = byId('ufDept').value.trim();
            payload.title = byId('ufTitle').value.trim();
            payload.employeeCode = byId('ufCode').value.trim();
            if (!(isSelf && !isAdmin())) {
                var all = !!(byId('ufAllBuildings').checked || type.fullAccess);
                var picked = userState.fields.buildings.getValues();
                // Buildings outside the editor's own scope are invisible in the
                // picker; keep them instead of silently dropping them.
                var hidden = (u ? u.buildingIds : []).filter(function (bid) { return !global.RHP.inScope(bid); });
                payload.allBuildings = global.RHP.buildingScope() === null ? all : !!(u && u.allBuildings);
                payload.buildingIds = picked.concat(hidden.filter(function (bid) { return picked.indexOf(bid) === -1; }));
                // No building yet is allowed (e.g. a manager assigned later via
                // Tòa nhà › Người quản lý); the list flags it as "Chưa gán tòa nhà".
            }
        }
        if (pw) payload.password = pw;

        var res = u ? global.RH.updateUser(u.id, payload) : global.RH.createUser(Object.assign({}, payload, { password: pw }));
        if (!res.ok) return fail(res.error);
        global.RHUI.closeDrawer();
        renderUsersTab();
        afterAccessChange();
    }

    function toggleLock(id) {
        if (!U().guard('users.lock')) return;
        var u = global.RH.getUsers().filter(function (x) { return x.id === id; })[0];
        if (!u || !canManageUser(u, 'users.lock')) return;
        var lock = u.status !== 'locked';
        if (lock && !confirm('Khoá tài khoản ' + u.name + '? Tài khoản sẽ không đăng nhập được cho đến khi mở khoá.')) return;
        var res = global.RH.updateUser(id, { status: lock ? 'locked' : 'active' });
        if (!res.ok) { alert(res.error); return; }
        renderUsersTable();
    }

    function deleteUser(id) {
        if (!U().guard('users.delete')) return;
        var u = global.RH.getUsers().filter(function (x) { return x.id === id; })[0];
        if (!u || !canManageUser(u, 'users.delete')) return;
        var managed = RHD.list('buildings').filter(function (b) { return b.managerId === id; });
        var msg = 'Xoá tài khoản ' + u.name + '? Hành động không thể hoàn tác.' +
            (managed.length ? '\n\nNgười này đang là quản lý của ' + managed.length + ' tòa nhà — các tòa sẽ hiển thị "Tài khoản không còn tồn tại" cho đến khi phân công lại.' : '');
        if (!confirm(msg)) return;
        var res = global.RH.deleteUser(id);
        if (!res.ok) { alert(res.error); return; }
        renderUsersTab();
    }

    global.RHAccounts = {
        renderRolesTab: renderRolesTab,
        openRole: openRole,
        submitRole: submitRole,
        deleteRole: deleteRole,
        renderUsersTab: renderUsersTab,
        renderUsersTable: renderUsersTable,
        showPanel: function (panel) { userState.panel = panel; renderUsersTab(); },
        openUser: openUser,
        submitUser: submitUser,
        toggleLock: toggleLock,
        deleteUser: deleteUser
    };
})(window);
