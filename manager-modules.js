/*
 * ResidentHub - manager workflow UI: Tòa nhà -> Căn hộ -> Khách hàng -> Ghi chỉ số
 * -> Hợp đồng -> Hóa đơn. Renders into the tab containers already present in
 * dashboard.html and reads/writes through the RHD data module (data.js), so every
 * module reuses data entered in the previous one instead of asking for it again.
 * Depends on: auth.js (RH), data.js (RHD). Loaded by dashboard.html only.
 */
(function (global) {
    var RHUI = {
        drawerEntity: null,
        drawerId: null,
        buildingServices: [],
        buildingInvoiceTemplates: [],
        buildingContractTemplates: [],
        customerVehicles: [],
        contractServiceSel: {}
    };

    // ---------------------------------------------------------------- utils

    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function money(n) {
        n = Number(n) || 0;
        return n.toLocaleString('vi-VN') + 'đ';
    }

    function fmtDate(d) {
        if (!d) return '—';
        var parts = String(d).split('-');
        if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
        return d;
    }

    function badge(label, color, bg) {
        return '<span style="background:' + bg + ';color:' + color + ';font-size:.72rem;font-weight:700;padding:.25rem .6rem;border-radius:999px;white-space:nowrap;">' + escapeHtml(label) + '</span>';
    }

    function statusMeta(list, id) {
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return { label: id || '—', color: '#61708a', bg: '#f1f5f9' };
    }

    function apartmentDetailStatus(apartment) {
        var status = apartment && apartment.status ? apartment.status : (apartment && apartment.active === false ? 'maintenance' : 'vacant');
        return statusMeta(RHD.APARTMENT_STATUSES || [], status);
    }

    function apartmentDetailLeaseStatus(contract) {
        if (!contract) return { label: 'Chưa thuê', color: '#64748b', bg: '#f1f5f9' };
        var map = {
            active: { label: 'Đang thuê', color: '#18a878', bg: '#e6f8ef' },
            pending: { label: 'Chờ ký', color: '#a5680c', bg: '#fff4df' },
            ended: { label: 'Đã kết thúc', color: '#64748b', bg: '#f1f5f9' },
            terminated: { label: 'Đã thanh lý', color: '#ef4444', bg: '#fee2e2' },
            draft: { label: 'Bản nháp', color: '#61708a', bg: '#f1f5f9' }
        };
        return map[contract.status] || { label: 'Đang thuê', color: '#18a878', bg: '#e6f8ef' };
    }

    function normalizeApartmentRecord(apartment) {
        if (!apartment) return null;
        return {
            id: apartment.id || apartment.code || '',
            name: apartment.name || apartment.code || 'Căn hộ',
            code: apartment.code || apartment.unitCode || '',
            buildingId: apartment.buildingId || apartment.building_id || '',
            buildingName: apartment.buildingName || apartment.building || '',
            buildingCode: apartment.buildingCode || apartment.codeBuilding || '',
            floor: apartment.floor || (apartment.level ? 'Tầng ' + apartment.level : ''),
            area: apartment.area || apartment.square || apartment.size || 0,
            rentPrice: apartment.rentPrice != null ? apartment.rentPrice : (apartment.rent != null ? apartment.rent : 0),
            depositPrice: apartment.depositPrice != null ? apartment.depositPrice : (apartment.deposit != null ? apartment.deposit : 0),
            status: apartment.status || (apartment.active === false ? 'maintenance' : 'vacant'),
            active: apartment.active !== false,
            photos: Array.isArray(apartment.photos) ? apartment.photos : (Array.isArray(apartment.images) ? apartment.images : []),
            address: apartment.address || apartment.location || '',
            note: apartment.note || ''
        };
    }

    function readFileAsDataUrl(input, cb) {
        var file = input.files && input.files[0];
        if (!file) { cb(''); return; }
        var reader = new FileReader();
        reader.onload = function () { cb(reader.result); };
        reader.readAsDataURL(file);
    }

    function selectOptions(items, valueKey, labelKey, selected, placeholder) {
        var html = placeholder ? '<option value="">' + escapeHtml(placeholder) + '</option>' : '';
        html += items.map(function (it) {
            var v = typeof valueKey === 'function' ? valueKey(it) : it[valueKey];
            var l = typeof labelKey === 'function' ? labelKey(it) : it[labelKey];
            return '<option value="' + escapeHtml(v) + '"' + (v === selected ? ' selected' : '') + '>' + escapeHtml(l) + '</option>';
        }).join('');
        return html;
    }

    function byId(id) { return document.getElementById(id); }

    // ------------------------------------------------- permissions & scope
    // permissions.js (RHP) decides what the signed-in user may see and do.
    // Buttons are hidden with can(); every mutating handler re-checks with
    // guard(), so a stale button or a console call cannot bypass it.

    function can(key) { return !global.RHP || global.RHP.can(key); }
    function guard(key) { return !global.RHP || global.RHP.guard(key); }

    // RHD.list() narrowed to the user's building scope.
    function scoped(entity) {
        var items = RHD.list(entity);
        return global.RHP ? global.RHP.scopeList(entity, items) : items;
    }

    // Argument for RHD.dashboardStats(): null = all, else the in-scope ids.
    function scopeArg() { return global.RHP ? global.RHP.buildingScope() : null; }

    function rowButton(perm, onclick, icon, title, danger) {
        if (perm && !can(perm)) return '';
        return '<button onclick="' + onclick + '" class="rh-row-btn' + (danger ? ' danger' : '') + '" title="' + escapeHtml(title) + '"><i class="fas ' + icon + '"></i></button>';
    }

    // ------------------------------------------------------------- drawer

    function ensureDrawer() {
        if (byId('rhDrawerOverlay')) return;
        var el = document.createElement('div');
        el.id = 'rhDrawerOverlay';
        el.className = 'rh-drawer-overlay';
        el.innerHTML = '<div class="rh-drawer">' +
            '<div class="rh-drawer-header"><h3 id="rhDrawerTitle" style="font:700 1.15rem \'Plus Jakarta Sans\',sans-serif;color:#10213c;">—</h3>' +
            '<button type="button" class="btn-icon" onclick="RHUI.closeDrawer()"><i class="fas fa-xmark"></i></button></div>' +
            '<div class="rh-drawer-body" id="rhDrawerBody"></div>' +
            '</div>';
        document.body.appendChild(el);
        el.addEventListener('click', function (ev) { if (ev.target === el) RHUI.closeDrawer(); });
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && !ev.defaultPrevented && el.classList.contains('show')) RHUI.closeDrawer();
        });
    }

    // Id of the building whose read-only detail is showing; any other drawer
    // content (forms, other modules) clears it so it is never auto-refreshed.
    var detailBuildingId = null;

    // opts.width widens the panel (e.g. the permission matrix).
    function openDrawer(title, bodyHtml, opts) {
        ensureDrawer();
        detailBuildingId = null;
        byId('rhDrawerOverlay').querySelector('.rh-drawer').style.width = opts && opts.width ? opts.width + 'px' : '';
        byId('rhDrawerTitle').textContent = title;
        byId('rhDrawerBody').innerHTML = bodyHtml;
        byId('rhDrawerOverlay').classList.add('show');
    }

    function closeDrawer() {
        var el = byId('rhDrawerOverlay');
        if (el) el.classList.remove('show');
        detailBuildingId = null;
    }

    // -------------------------------------------------------- demo banner

    function demoLimitReached(entity) {
        var info = RHD.limitInfo(entity);
        return info.limited && info.reached;
    }

    function addButton(label, onclick, entity, perm) {
        if (perm && !can(perm)) return '';
        var blocked = entity && demoLimitReached(entity);
        var attrs = blocked ? ' disabled title="Đã đạt giới hạn bản Demo"' : ' onclick="' + onclick + '"';
        var style = 'background:linear-gradient(135deg,#1683ff 0%,#0d65d5 100%);color:#fff;border:0;border-radius:10px;padding:.65rem 1.1rem;font:inherit;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:.5rem;' + (blocked ? 'opacity:.5;cursor:not-allowed;' : '');
        return '<button' + attrs + ' style="' + style + '"><i class="fas fa-plus"></i> ' + escapeHtml(label) + '</button>';
    }

    function renderDemoBanner(entity) {
        if (RHD.mode() !== 'demo') return '';
        var info = RHD.limitInfo(entity);
        var stateClass = info.reached ? ' blocked' : (info.near ? ' warn' : '');
        var message = 'Demo: <strong>' + info.count + '/' + info.max + ' ' + escapeHtml(info.label) + '</strong> đã sử dụng.';
        var cta = '';
        if (info.reached) {
            message = 'Bạn đã đạt giới hạn của bản Demo (' + info.count + '/' + info.max + ' ' + escapeHtml(info.label) + '). Đăng ký để tiếp tục quản lý không giới hạn theo gói dịch vụ.';
            cta = '<a href="index.html#pricing" class="btn-primary" style="text-decoration:none;white-space:nowrap;">Đăng ký ngay</a>';
        } else if (info.near) {
            message = 'Bạn đang sử dụng gần hết giới hạn Demo (' + info.count + '/' + info.max + ' ' + escapeHtml(info.label) + '). Đăng ký ngay để sử dụng đầy đủ hệ thống.';
            cta = '<a href="index.html#pricing" style="color:#a5680c;font-weight:700;text-decoration:none;white-space:nowrap;">Đăng ký ngay <i class="fas fa-arrow-right"></i></a>';
        }
        return '<div class="rh-demo-banner' + stateClass + '">' +
            '<div><span class="rh-demo-tag"><i class="fas fa-flask"></i> DEMO</span> ' + message + '</div>' +
            cta +
            '</div>';
    }

    function emptyState(icon, text) {
        return '<div class="rh-empty"><i class="fas ' + icon + '"></i><p>' + escapeHtml(text) + '</p></div>';
    }

    function confirmDelete(entity, id, afterDeleteFn, blockMsg) {
        if (blockMsg) { alert(blockMsg); return; }
        if (!confirm('Xoá bản ghi này? Hành động không thể hoàn tác.')) return;
        var res = RHD.remove(entity, id);
        if (!res.ok) { alert(res.error); return; }
        afterDeleteFn();
    }

    // ============================================================ BUILDINGS

    // "Người quản lý" cell: the name is resolved from Building.managerId on every
    // render, so renaming/removing the account is reflected immediately.
    function managerCellHtml(b) {
        if (!b.managerId) return '<span style="color:#94a3b8;">Chưa phân công</span>';
        var m = RHD.buildingManager(b);
        if (!m) return '<span style="color:#ef4444;">Tài khoản không còn tồn tại</span>';
        return '<div style="display:flex;align-items:center;gap:.5rem;">' + avatarHtml(m.name, 28) +
            '<div style="min-width:0;"><div style="font-weight:600;">' + escapeHtml(m.name) + '</div>' +
            (m.email ? '<div style="font-size:.75rem;color:#94a3b8;">' + escapeHtml(m.email) + '</div>' : '') + '</div></div>';
    }

    function avatarHtml(name, size) {
        // First + last word, ignoring notes like "(Trưởng BQL)": "Nguyễn Văn An" -> "NA".
        var words = String(name || '').replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean);
        var initials = words.length ? (words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '')).toUpperCase() : '?';
        return '<span style="align-items:center;background:#eaf3ff;border-radius:50%;color:#0d65d5;display:inline-flex;flex:0 0 ' + size + 'px;font-size:' + Math.round(size * 0.38) + 'px;font-weight:700;height:' + size + 'px;justify-content:center;width:' + size + 'px;">' + escapeHtml(initials) + '</span>';
    }

    // Legacy buildings have no `active` flag: they are active.
    function buildingActive(b) { return b.active !== false; }

    function foldText(s) { return global.RHSelect ? global.RHSelect.fold(s) : String(s || '').toLowerCase(); }

    var buildingFilters = { q: '', status: 'all', province: '', ward: '' };

    function filteredBuildings() {
        var f = buildingFilters;
        var q = foldText(f.q.trim());
        return scoped('buildings').filter(function (b) {
            if (f.status === 'active' && !buildingActive(b)) return false;
            if (f.status === 'inactive' && buildingActive(b)) return false;
            if (f.province && b.province !== f.province) return false;
            if (f.ward && b.ward !== f.ward) return false;
            if (q && foldText([b.name, b.code, b.shortName].join(' ')).indexOf(q) === -1) return false;
            return true;
        });
    }

    function billingCellHtml(b) {
        if (!b.billingDay) return '<span style="color:#cbd5e1;">Chưa thiết lập</span>';
        return 'Ngày ' + escapeHtml(b.billingDay) + '<div style="font-size:.72rem;color:' + (b.autoInvoice ? '#18a878' : '#94a3b8') + ';">' + (b.autoInvoice ? 'Tự động lập HĐ' : 'Lập thủ công') + '</div>';
    }

    function renderBuildingRows() {
        var wrap = byId('bldListWrap');
        if (!wrap) return;
        var list = filteredBuildings();
        var total = scoped('buildings').length;
        var f = buildingFilters;
        var filtering = f.q || f.status !== 'all' || f.province || f.ward;
        byId('bldClear').style.visibility = filtering ? 'visible' : 'hidden';
        if (!list.length) {
            wrap.innerHTML = emptyState('fa-building', total ? 'Không có tòa nhà phù hợp bộ lọc.' : 'Chưa có tòa nhà nào. Thêm tòa nhà đầu tiên để bắt đầu quy trình.');
            return;
        }
        var rows = list.map(function (b) {
            var apts = RHD.apartmentsOf(b.id).length;
            var on = buildingActive(b);
            return '<tr class="rh-click-row" tabindex="0" title="Xem chi tiết tòa nhà" onclick="RHUI.openBuildingDetail(\'' + b.id + '\')" onkeydown="if(event.key===\'Enter\'&&event.target===this)RHUI.openBuildingDetail(\'' + b.id + '\')">' +
                '<td><strong>' + escapeHtml(b.name) + '</strong><div style="font-size:.75rem;color:#94a3b8;">' + escapeHtml(b.code) + ' · ' + escapeHtml(b.shortName || '') + '</div></td>' +
                '<td>' + escapeHtml(RHD.buildingFullAddress(b)) + '</td>' +
                '<td>' + managerCellHtml(b) + '</td>' +
                '<td>' + apts + ' căn hộ</td>' +
                '<td>' + billingCellHtml(b) + '</td>' +
                '<td>' + badge(on ? 'Hoạt động' : 'Tạm ngừng', on ? '#18a878' : '#61708a', on ? '#e6f8ef' : '#f1f5f9') + '</td>' +
                '<td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()">' +
                rowButton('buildings.update', "RHUI.openBuildingForm('" + b.id + "')", 'fa-pen', 'Sửa') +
                rowButton('buildings.delete', "RHUI.deleteBuilding('" + b.id + "')", 'fa-trash', 'Xoá', true) +
                '</td></tr>';
        }).join('');
        wrap.innerHTML = '<div style="color:#61708a;font-size:.82rem;margin-bottom:.6rem;">Hiển thị <strong style="color:#10213c;">' + list.length + '</strong> / ' + total + ' tòa nhà</div>' +
            '<div class="table-container"><table><thead><tr><th>Tòa nhà</th><th>Địa chỉ</th><th>Người quản lý</th><th>Căn hộ</th><th>Ngày tính tiền</th><th>Trạng thái</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    // Distinct saved values (never a fixed list) for the area pickers.
    function distinctBuildingValues(key, filterFn) {
        var seen = {};
        scoped('buildings').filter(filterFn || function () { return true; }).forEach(function (b) { if (b[key]) seen[b[key]] = (seen[b[key]] || 0) + 1; });
        return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'vi'); }).map(function (v) { return { value: v, label: v, sub: seen[v] + ' tòa nhà' }; });
    }

    function renderBuildingsTab() {
        var tab = byId('buildings-tab');
        if (!tab) return;
        var all = scoped('buildings');
        var active = all.filter(buildingActive).length;
        var f = buildingFilters;
        var kpi = function (status, icon, tone, value, label) {
            return '<button type="button" class="bld-kpi' + (f.status === status ? ' active' : '') + '" data-bld-status="' + status + '">' +
                '<span class="hex-icon"><i class="fas ' + icon + ' ' + tone + '"></i></span><span><strong>' + value + '</strong><small>' + label + '</small></span></button>';
        };
        tab.innerHTML = renderDemoBanner('buildings') +
            '<div class="bld-kpis">' +
            kpi('all', 'fa-building', 'tone-blue', all.length, 'Tổng số tòa nhà') +
            kpi('active', 'fa-circle-check', 'tone-green', active, 'Đang hoạt động') +
            kpi('inactive', 'fa-circle-pause', 'tone-red', all.length - active, 'Ngừng hoạt động') +
            '</div>' +
            '<div class="card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div><h2 style="font-size:1.4rem;font-weight:700;color:#10213c;">Tòa nhà</h2><p style="color:#94a3b8;font-size:.875rem;margin-top:.25rem;">Thông tin tòa nhà, dịch vụ và ngày tính tiền được tái sử dụng khi lập hợp đồng và hóa đơn.</p></div>' +
            addButton('Thêm tòa nhà', "RHUI.openBuildingForm()", 'buildings', 'buildings.create') +
            '</div>' +
            '<div class="bld-filters">' +
            '<div class="asset-search"><i class="fas fa-search"></i><input id="bldQ" type="search" placeholder="Tìm theo tên hoặc mã tòa nhà..." value="' + escapeHtml(f.q) + '"></div>' +
            '<select id="bldStatus" class="asset-filter" aria-label="Lọc trạng thái">' + selectOptions([{ id: 'all', label: 'Tất cả trạng thái' }, { id: 'active', label: 'Hoạt động' }, { id: 'inactive', label: 'Tạm ngừng' }], 'id', 'label', f.status) + '</select>' +
            '<div id="bldProvince"></div><div id="bldWard"></div>' +
            '<button type="button" id="bldClear" class="bld-clear"><i class="fas fa-xmark"></i> Xóa lọc</button>' +
            '</div>' +
            '<div id="bldListWrap"></div>' +
            '</div>';

        var province = RHSelect.create(byId('bldProvince'), {
            value: f.province, placeholder: 'Tỉnh / Thành phố', searchPlaceholder: 'Tìm tỉnh/thành...', noOptionsText: 'Chưa có địa chỉ nào được lưu',
            options: function () { return distinctBuildingValues('province'); },
            onChange: function (v) { f.province = v; f.ward = ''; ward.setValue(''); ward.refresh(); renderBuildingRows(); }
        });
        var ward = RHSelect.create(byId('bldWard'), {
            value: f.ward, placeholder: 'Phường / Xã', searchPlaceholder: 'Tìm phường/xã...', noOptionsText: 'Chưa có phường/xã nào',
            options: function () { return distinctBuildingValues('ward', function (b) { return !f.province || b.province === f.province; }); },
            onChange: function (v) { f.ward = v; renderBuildingRows(); }
        });
        byId('bldQ').addEventListener('input', function () { f.q = this.value; renderBuildingRows(); });
        byId('bldStatus').addEventListener('change', function () { f.status = this.value; renderBuildingsTab(); });
        byId('bldClear').addEventListener('click', function () { buildingFilters = { q: '', status: 'all', province: '', ward: '' }; renderBuildingsTab(); });
        tab.querySelectorAll('[data-bld-status]').forEach(function (btn) {
            btn.addEventListener('click', function () { f.status = this.getAttribute('data-bld-status'); renderBuildingsTab(); });
        });
        renderBuildingRows();
    }

    function feeTypeLabel(id) { return statusMeta(RHD.FEE_TYPES, id).label || id; }
    function calcMethodLabel(id) { return statusMeta(RHD.CALC_METHODS, id).label || id; }

    function serviceRowHtml(svc, idx) {
        return '<div class="rh-service-row" data-idx="' + idx + '">' +
            '<div class="rh-grid-2">' +
            '<div class="rh-field"><label>Tên dịch vụ</label><input type="text" value="' + escapeHtml(svc.name || '') + '" oninput="RHUI.buildingServices[' + idx + '].name=this.value"></div>' +
            '<div class="rh-field"><label>Loại phí</label><select onchange="RHUI.buildingServices[' + idx + '].feeType=this.value">' + selectOptions(RHD.FEE_TYPES, 'id', 'label', svc.feeType) + '</select></div>' +
            '<div class="rh-field"><label>Cách tính phí</label><select onchange="RHUI.buildingServices[' + idx + '].calcMethod=this.value">' + selectOptions(RHD.CALC_METHODS, 'id', 'label', svc.calcMethod) + '</select></div>' +
            '<div class="rh-field"><label>Đơn giá (đ)</label><input type="number" min="0" value="' + (svc.unitPrice || 0) + '" oninput="RHUI.buildingServices[' + idx + '].unitPrice=this.value"></div>' +
            '<div class="rh-field"><label>Thuế suất (%)</label><input type="number" min="0" max="100" value="' + (svc.taxRate || 0) + '" oninput="RHUI.buildingServices[' + idx + '].taxRate=this.value"></div>' +
            '</div>' +
            '<button type="button" class="rh-row-btn danger" style="margin-top:.5rem;" onclick="RHUI.removeBuildingService(' + idx + ')"><i class="fas fa-trash"></i> Xoá dịch vụ</button>' +
            '</div>';
    }

    function renderBuildingServicesList() {
        var container = byId('rhBuildingServicesList');
        if (!container) return;
        container.innerHTML = RHUI.buildingServices.map(function (s, i) { return serviceRowHtml(s, i); }).join('') || '<p style="color:#94a3b8;font-size:.85rem;">Chưa có dịch vụ nào.</p>';
    }

    RHUI.addBuildingService = function () {
        RHUI.buildingServices.push({ id: 'svc-' + Date.now() + Math.random().toString(36).slice(2, 6), name: '', feeType: 'service', calcMethod: 'fixed', unitPrice: 0, taxRate: 0 });
        renderBuildingServicesList();
    };
    RHUI.removeBuildingService = function (idx) { RHUI.buildingServices.splice(idx, 1); renderBuildingServicesList(); };

    // Template selection now sources the shared system library (templates.js /
    // RHT) instead of each building keeping its own ad-hoc name list.
    function templatePickerHtml(fieldId, type, selectedId) {
        var options = RHT.list(type);
        return '<div class="rh-field"><label>' + (type === 'CONTRACT' ? 'Mẫu hợp đồng áp dụng' : 'Mẫu hóa đơn áp dụng') + '</label>' +
            '<div style="display:flex;gap:.5rem;">' +
            '<select id="' + fieldId + '" style="flex:1;">' + selectOptions(options, 'id', 'name', selectedId) + '</select>' +
            '<button type="button" class="rh-row-btn" title="Xem trước mẫu" onclick="RHUI.previewTemplateField(\'' + fieldId + '\')"><i class="fas fa-eye"></i></button>' +
            '<a href="templates.html' + (RHD.mode() === 'demo' ? '#demo=1' : '') + '" target="_blank" class="rh-row-btn" title="Tùy chỉnh mẫu" style="display:inline-flex;align-items:center;text-decoration:none;"><i class="fas fa-pen-to-square"></i></a>' +
            '</div></div>';
    }

    RHUI.previewTemplateField = function (fieldId) {
        var tplId = byId(fieldId).value;
        RHUI.previewTemplateById(tplId);
    };

    RHUI.openBuildingForm = function (id) {
        if (!guard(id ? 'buildings.update' : 'buildings.create')) return;
        var b = id ? RHD.get('buildings', id) : null;
        RHUI.drawerEntity = 'buildings';
        RHUI.drawerId = id || null;
        RHUI.buildingServices = b ? JSON.parse(JSON.stringify(b.services || [])) : [];
        var cfg = (b && b.config) || {};

        var html = '<form onsubmit="RHUI.submitBuildingForm(event)">' +
            '<div class="rh-section-title">Thông tin cơ bản</div>' +
            '<div class="rh-grid-2">' +
            '<div class="rh-field"><label>Tên tòa nhà *</label><input id="bfName" required value="' + escapeHtml(b ? b.name : '') + '"></div>' +
            '<div class="rh-field"><label>Tên viết tắt / Mã tòa</label><input id="bfShort" value="' + escapeHtml(b ? b.shortName : '') + '" placeholder="VD: CT1"></div>' +
            '<div class="rh-field"><label>Tỉnh / Thành phố *</label><select id="bfProvince" required>' + selectOptions(RHD.PROVINCES.map(function (p) { return { p: p }; }), 'p', 'p', b ? b.province : '', 'Chọn tỉnh/thành') + '</select></div>' +
            '<div class="rh-field"><label>Xã / Phường *</label><input id="bfWard" list="rhWardSuggestions" required value="' + escapeHtml(b ? b.ward : '') + '" placeholder="VD: Phường Tích Lương"></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Địa chỉ chi tiết *</label><input id="bfAddress" required value="' + escapeHtml(b ? b.addressDetail : '') + '"></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Người quản lý</label><div id="bfManagerField"></div>' +
            '<div style="color:#94a3b8;font-size:.75rem;margin-top:.3rem;">Chọn từ Người dùng có quyền "Được phân công làm người quản lý tòa" (Tài khoản › Loại tài khoản).</div></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label style="display:flex;align-items:center;gap:.7rem;cursor:pointer;margin:0;">Trạng thái hoạt động <span class="rh-switch"><input type="checkbox" id="bfActive"' + (!b || buildingActive(b) ? ' checked' : '') + '><span></span></span> <span id="bfActiveLabel" style="font-weight:500;color:#61708a;"></span></label></div>' +
            '</div><datalist id="rhWardSuggestions"></datalist>' +

            '<div class="rh-section">' +
            '<div class="rh-section-title">Hóa đơn &amp; ngày tính tiền</div>' +
            '<div class="rh-grid-2">' +
            '<div class="rh-field"><label>Ngày tính tiền hàng tháng</label><select id="bfBillingDay">' + billingDayOptions(b ? b.billingDay : '') + '</select>' +
            '<div style="color:#94a3b8;font-size:.75rem;margin-top:.3rem;">Tháng không có ngày đã chọn (VD ngày 31) sẽ lập vào ngày cuối tháng.</div></div>' +
            '<div class="rh-field"><label>Hạn thanh toán (số ngày sau ngày lập)</label><input id="bfDueDays" type="number" min="0" max="90" value="' + escapeHtml(b && b.dueDays != null ? b.dueDays : '') + '" placeholder="Theo Cài đặt (' + RHD.getSettings().invoiceDueDays + ' ngày)"></div>' +
            '<div class="rh-field"><label>Chỉ số điện / nước áp dụng</label><select id="bfMeterPeriod">' + selectOptions([{ id: 'previous', label: 'Tháng trước kỳ hóa đơn (mặc định)' }, { id: 'current', label: 'Cùng tháng với kỳ hóa đơn' }], 'id', 'label', b && b.meterPeriod || 'previous') + '</select></div>' +
            '<div class="rh-field"><label>Tự động lập hóa đơn từ kỳ</label><input id="bfAutoFrom" type="month" value="' + escapeHtml(b && b.autoInvoiceFrom || new Date().toISOString().slice(0, 7)) + '"></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label style="display:flex;align-items:center;gap:.7rem;cursor:pointer;margin:0;">Tự động lập hóa đơn hàng tháng <span class="rh-switch"><input type="checkbox" id="bfAutoInvoice"' + (b && b.autoInvoice ? ' checked' : '') + '><span></span></span></label>' +
            '<div style="color:#94a3b8;font-size:.75rem;margin-top:.35rem;">Đến ngày tính tiền, hệ thống tạo <strong>Bản nháp</strong> cho mỗi hợp đồng đang hiệu lực từ giá thuê, dịch vụ và chỉ số điện/nước <strong>đã duyệt</strong>. Quản lý kiểm tra, duyệt rồi mới phát hành cho cư dân. Tiền thuê theo chu kỳ thanh toán của từng hợp đồng.</div></div>' +
            '</div></div>' +

            '<div class="rh-section">' +
            '<div class="rh-section-title" style="display:flex;justify-content:space-between;align-items:center;">Dịch vụ của tòa nhà <button type="button" class="rh-link-btn" onclick="RHUI.addBuildingService()"><i class="fas fa-plus"></i> Thêm dịch vụ</button></div>' +
            '<div id="rhBuildingServicesList"></div>' +
            '</div>' +

            '<div class="rh-section">' +
            '<div class="rh-section-title">Cấu hình</div>' +
            '<div class="rh-grid-2">' +
            '<div class="rh-field"><label>Tài khoản gạch nợ tự động</label><input id="bfAutoDebit" value="' + escapeHtml(cfg.autoDebitAccount || '') + '"></div>' +
            '<div class="rh-field"><label>Nhà cung cấp hóa đơn điện tử</label><input id="bfEinvoice" value="' + escapeHtml(cfg.eInvoiceProvider || '') + '" placeholder="VD: VNPT, Viettel..."></div>' +
            '<div class="rh-field"><label>Ngân hàng</label><input id="bfBankName" value="' + escapeHtml(cfg.bankName || '') + '"></div>' +
            '<div class="rh-field"><label>Số tài khoản</label><input id="bfBankNumber" value="' + escapeHtml(cfg.bankAccountNumber || '') + '"></div>' +
            '<div class="rh-field"><label>Chủ tài khoản</label><input id="bfBankHolder" value="' + escapeHtml(cfg.bankAccountHolder || '') + '"></div>' +
            '</div>' +
            '<div class="rh-grid-2" style="margin-top:1rem;">' +
            templatePickerHtml('bfInvoiceTpl', 'INVOICE', b ? b.invoiceTemplateId : (RHT.getDefault('INVOICE') || {}).id) +
            templatePickerHtml('bfContractTpl', 'CONTRACT', b ? b.contractTemplateId : (RHT.getDefault('CONTRACT') || {}).id) +
            '</div>' +
            '</div>' +

            '<div id="bfError" style="color:#ef4444;font-size:.85rem;margin-top:1rem;"></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;">' +
            '<button type="submit" class="btn-primary">Lưu tòa nhà</button>' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Huỷ</button>' +
            '</div></form>';

        openDrawer(b ? 'Sửa tòa nhà' : 'Thêm tòa nhà', html);
        RHSelect.create(byId('bfManagerField'), {
            inputId: 'bfManager',
            value: b ? b.managerId || '' : '',
            placeholder: 'Chọn người quản lý tòa',
            searchPlaceholder: 'Tìm theo tên, email, số điện thoại...',
            noOptionsText: 'Chưa có người dùng nào được phép quản lý tòa',
            options: function () { return managerOptions(b ? b.managerId : ''); }
        });
        renderBuildingServicesList();
        var syncActiveLabel = function () { byId('bfActiveLabel').textContent = byId('bfActive').checked ? 'Đang hoạt động' : 'Tạm ngừng (không tự lập hóa đơn)'; };
        byId('bfActive').addEventListener('change', syncActiveLabel);
        syncActiveLabel();
        byId('bfProvince').addEventListener('change', function () {
            var wards = RHD.WARD_SUGGESTIONS[this.value] || [];
            byId('rhWardSuggestions').innerHTML = wards.map(function (w) { return '<option value="' + escapeHtml(w) + '">'; }).join('');
        });
    };

    RHUI.submitBuildingForm = function (ev) {
        ev.preventDefault();
        if (!guard(RHUI.drawerId ? 'buildings.update' : 'buildings.create')) return;
        var data = {
            name: byId('bfName').value.trim(),
            shortName: byId('bfShort').value.trim(),
            province: byId('bfProvince').value,
            ward: byId('bfWard').value.trim(),
            addressDetail: byId('bfAddress').value.trim(),
            managerId: byId('bfManager').value,
            services: RHUI.buildingServices,
            invoiceTemplateId: byId('bfInvoiceTpl').value,
            contractTemplateId: byId('bfContractTpl').value,
            active: byId('bfActive').checked,
            billingDay: byId('bfBillingDay').value ? Number(byId('bfBillingDay').value) : null,
            dueDays: byId('bfDueDays').value === '' ? null : Math.max(0, Math.min(90, Math.round(Number(byId('bfDueDays').value)))),
            meterPeriod: byId('bfMeterPeriod').value,
            autoInvoice: byId('bfAutoInvoice').checked,
            autoInvoiceFrom: byId('bfAutoFrom').value || new Date().toISOString().slice(0, 7),
            config: {
                autoDebitAccount: byId('bfAutoDebit').value.trim(),
                eInvoiceEnabled: !!byId('bfEinvoice').value.trim(),
                eInvoiceProvider: byId('bfEinvoice').value.trim(),
                bankName: byId('bfBankName').value.trim(),
                bankAccountNumber: byId('bfBankNumber').value.trim(),
                bankAccountHolder: byId('bfBankHolder').value.trim()
            }
        };
        if (data.autoInvoice && !data.billingDay) { byId('bfError').textContent = 'Chọn "Ngày tính tiền hàng tháng" trước khi bật tự động lập hóa đơn.'; return; }
        var res;
        if (RHUI.drawerId) {
            res = RHD.update('buildings', RHUI.drawerId, data);
        } else {
            data.code = RHD.nextBuildingCode();
            res = RHD.create('buildings', data);
        }
        if (!res.ok) { byId('bfError').textContent = res.error; return; }
        closeDrawer();
        // A billing day that has already passed is generated right away (catch-up).
        if (res.item.autoInvoice && global.RHB) global.RHB.run();
        renderBuildingsTab();
        renderDashboardCounts();
    };

    function billingDayOptions(selected) {
        var html = '<option value="">— Chưa thiết lập —</option>';
        for (var d = 1; d <= 31; d++) {
            html += '<option value="' + d + '"' + (Number(selected) === d ? ' selected' : '') + '>Ngày ' + d + (d > 28 ? ' (cuối tháng nếu tháng ngắn hơn)' : '') + '</option>';
        }
        return html;
    }

    RHUI.deleteBuilding = function (id) {
        if (!guard('buildings.delete')) return;
        var block = RHD.apartmentsOf(id).length ? 'Không thể xoá: vẫn còn căn hộ thuộc tòa nhà này.'
            : RHD.assetsOf('buildingId', id).length ? 'Không thể xoá: vẫn còn tài sản gắn với tòa nhà này.' : null;
        confirmDelete('buildings', id, function () { renderBuildingsTab(); renderDashboardCounts(); }, block);
    };

    // Options for every "Người quản lý" picker — read from Người dùng on each
    // open, never a fixed list: only accounts whose type grants
    // buildings.assignable. The building's current manager stays listed (with a
    // note) even if no longer eligible, so saving never silently drops it.
    function managerOptions(currentId) {
        var list = RHD.eligibleManagers();
        if (currentId && !list.some(function (u) { return u.id === currentId; })) {
            var current = RHD.managerAccounts().filter(function (u) { return u.id === currentId; })[0];
            if (current) list = list.concat([Object.assign({}, current, { notEligible: true })]);
        }
        return list.map(function (u) {
            var managed = RHD.list('buildings').filter(function (b) { return b.managerId === u.id; }).length;
            var type = global.RHP && u.accountTypeId ? global.RHP.getType(u.accountTypeId) : null;
            return {
                value: u.id,
                label: u.name + (u.status === 'locked' ? ' (đã khoá)' : u.notEligible ? ' (không còn quyền quản lý tòa)' : ''),
                sub: [type ? type.name : '', u.phone, u.email, managed ? 'Đang quản lý ' + managed + ' tòa' : ''].filter(Boolean).join(' · '),
                keywords: [u.email, u.phone]
            };
        });
    }

    // ------------------------------------------------ building detail drawer

    function detailItem(label, valueHtml, full) {
        return '<div' + (full ? ' style="grid-column:1/-1;"' : '') + '><div style="color:#94a3b8;font-size:.75rem;margin-bottom:.2rem;">' + escapeHtml(label) + '</div>' +
            '<div style="color:#10213c;font-weight:600;word-break:break-word;">' + (valueHtml === '' || valueHtml == null ? '<span style="color:#cbd5e1;font-weight:400;">—</span>' : valueHtml) + '</div></div>';
    }

    function buildingDetailHtml(b) {
        var apartments = RHD.apartmentsOf(b.id);
        var contracts = RHD.list('contracts').filter(function (c) { return c.buildingId === b.id; });
        var today = new Date().toISOString().slice(0, 10);
        var activeContracts = contracts.filter(function (c) { return c.status !== 'ended' && !(c.endDate && c.endDate < today); });
        var residentIds = {};
        activeContracts.forEach(function (c) { if (c.customerId) residentIds[c.customerId] = true; });
        var manager = RHD.buildingManager(b);
        var cfg = b.config || {};
        var invoiceTpl = b.invoiceTemplateId ? RHT.get(b.invoiceTemplateId) : null;
        var contractTpl = b.contractTemplateId ? RHT.get(b.contractTemplateId) : null;
        var openRequests = RHD.list('supportRequests').filter(function (r) { return r.buildingId === b.id && (r.status === 'new' || r.status === 'in_progress'); }).length;

        var managerHtml;
        if (manager) {
            managerHtml = '<div style="display:flex;align-items:center;gap:.75rem;">' + avatarHtml(manager.name, 40) +
                '<div style="min-width:0;"><div style="font-weight:700;color:#10213c;">' + escapeHtml(manager.name) + '</div>' +
                '<div style="color:#61708a;font-size:.82rem;">' + [manager.email, manager.phone].filter(Boolean).map(escapeHtml).join(' · ') + '</div></div></div>';
        } else {
            managerHtml = '<div style="color:' + (b.managerId ? '#ef4444' : '#94a3b8') + ';font-size:.88rem;">' +
                (b.managerId ? '<i class="fas fa-triangle-exclamation"></i> Tài khoản quản lý đã gán không còn tồn tại.' : 'Chưa phân công người quản lý.') +
                (can('buildings.update') ? ' <button type="button" class="rh-link-btn" onclick="RHUI.openBuildingForm(\'' + b.id + '\')">Phân công</button>' : '') + '</div>';
        }

        var statusChips = RHD.APARTMENT_STATUSES.map(function (st) {
            var n = apartments.filter(function (a) { return a.status === st.id; }).length;
            return '<div style="background:' + st.bg + ';border-radius:10px;padding:.6rem .75rem;">' +
                '<div style="color:' + st.color + ';font:800 1.25rem \'Plus Jakarta Sans\',sans-serif;">' + n + '</div>' +
                '<div style="color:' + st.color + ';font-size:.75rem;font-weight:600;">' + escapeHtml(st.label) + '</div></div>';
        }).join('');

        var aptRows = apartments.slice().sort(function (x, y) { return String(x.name).localeCompare(String(y.name), 'vi', { numeric: true }); }).map(function (a) {
            var st = statusMeta(RHD.APARTMENT_STATUSES, a.status);
            var contract = RHD.activeContractFor(a.id);
            var customer = contract ? RHD.get('customers', contract.customerId) : null;
            return '<tr><td><strong>' + escapeHtml(a.name) + '</strong><div style="font-size:.72rem;color:#94a3b8;">' + escapeHtml(a.floor || '') + (a.area ? ' · ' + escapeHtml(a.area) + ' m²' : '') + '</div></td>' +
                '<td>' + (customer ? escapeHtml(customer.fullName) + (contract.code ? '<div style="font-size:.72rem;color:#94a3b8;">' + escapeHtml(contract.code) + '</div>' : '') : '<span style="color:#cbd5e1;">—</span>') + '</td>' +
                '<td style="white-space:nowrap;">' + money(a.rentPrice) + '</td>' +
                '<td>' + badge(st.label, st.color, st.bg) + '</td></tr>';
        }).join('');

        var serviceRows = (b.services || []).map(function (s) {
            return '<tr><td><strong>' + escapeHtml(s.name || '—') + '</strong><div style="font-size:.72rem;color:#94a3b8;">' + escapeHtml(feeTypeLabel(s.feeType)) + '</div></td>' +
                '<td>' + escapeHtml(calcMethodLabel(s.calcMethod)) + '</td>' +
                '<td style="white-space:nowrap;text-align:right;">' + money(s.unitPrice) + '</td>' +
                '<td style="text-align:right;">' + (Number(s.taxRate) || 0) + '%</td></tr>';
        }).join('');

        var miniTable = function (head, body, empty) {
            return body ? '<div class="table-container"><table style="min-width:0;"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>'
                : '<p style="color:#94a3b8;font-size:.85rem;">' + escapeHtml(empty) + '</p>';
        };

        return '<div class="rh-detail">' +
            '<div style="display:flex;align-items:flex-start;gap:1rem;">' +
            '<span style="align-items:center;background:linear-gradient(135deg,#1683ff 0%,#0d65d5 100%);border-radius:14px;color:#fff;display:inline-flex;flex:0 0 52px;font-size:1.3rem;height:52px;justify-content:center;"><i class="fas fa-building"></i></span>' +
            '<div style="min-width:0;flex:1;"><div style="color:#10213c;font:800 1.2rem \'Plus Jakarta Sans\',sans-serif;">' + escapeHtml(b.name) + '</div>' +
            '<div style="color:#61708a;font-size:.85rem;margin-top:.15rem;">' + escapeHtml(b.code || '') + (b.shortName ? ' · ' + escapeHtml(b.shortName) : '') + '</div>' +
            '<div style="color:#61708a;font-size:.85rem;margin-top:.35rem;"><i class="fas fa-location-dot" style="color:#94a3b8;"></i> ' + escapeHtml(RHD.buildingFullAddress(b) || '—') + '</div></div></div>' +

            '<div class="rh-detail-kpis">' +
            '<div><strong>' + apartments.length + '</strong><span>Căn hộ</span></div>' +
            '<div><strong>' + Object.keys(residentIds).length + '</strong><span>Cư dân có HĐ</span></div>' +
            '<div><strong>' + activeContracts.length + '</strong><span>HĐ hiệu lực</span></div>' +
            '<div><strong>' + openRequests + '</strong><span>Yêu cầu mở</span></div>' +
            '</div>' +

            '<div class="rh-section"><div class="rh-section-title">Người quản lý</div>' + managerHtml + '</div>' +

            '<div class="rh-section"><div class="rh-section-title">Hóa đơn &amp; ngày tính tiền</div><div class="rh-grid-2">' +
            detailItem('Trạng thái', buildingActive(b) ? badge('Hoạt động', '#18a878', '#e6f8ef') : badge('Tạm ngừng', '#61708a', '#f1f5f9')) +
            detailItem('Ngày tính tiền hàng tháng', b.billingDay ? 'Ngày ' + escapeHtml(b.billingDay) : '') +
            detailItem('Tự động lập hóa đơn', b.autoInvoice ? 'Bật · từ kỳ ' + escapeHtml(global.RHB ? global.RHB.periodLabel(b.autoInvoiceFrom) : b.autoInvoiceFrom) : 'Tắt') +
            detailItem('Kỳ lập tiếp theo', b.billingDay && global.RHB ? fmtDate(global.RHB.nextBillingDate(b)) : '') +
            detailItem('Hạn thanh toán', b.dueDays != null ? escapeHtml(b.dueDays) + ' ngày sau ngày lập' : 'Theo Cài đặt (' + RHD.getSettings().invoiceDueDays + ' ngày)') +
            detailItem('Chỉ số điện/nước', b.meterPeriod === 'current' ? 'Cùng tháng kỳ hóa đơn' : 'Tháng trước kỳ hóa đơn') +
            '</div></div>' +

            '<div class="rh-section"><div class="rh-section-title">Thông tin chung</div><div class="rh-grid-2">' +
            detailItem('Mã tòa', escapeHtml(b.code || '')) +
            detailItem('Tên viết tắt', escapeHtml(b.shortName || '')) +
            detailItem('Tỉnh / Thành phố', escapeHtml(b.province || '')) +
            detailItem('Xã / Phường', escapeHtml(b.ward || '')) +
            detailItem('Địa chỉ chi tiết', escapeHtml(b.addressDetail || ''), true) +
            detailItem('Ngày tạo', b.createdAt ? new Date(b.createdAt).toLocaleDateString('vi-VN') : '') +
            (b.floorCount ? detailItem('Số tầng', escapeHtml(b.floorCount)) : '') +
            '</div></div>' +

            '<div class="rh-section"><div class="rh-section-title" style="display:flex;justify-content:space-between;align-items:center;">Căn hộ (' + apartments.length + ')' +
            '<button type="button" class="rh-link-btn" onclick="RHUI.closeDrawer();switchTab(\'apartments\')">Mở Căn hộ <i class="fas fa-arrow-right"></i></button></div>' +
            (apartments.length ? '<div class="rh-detail-status">' + statusChips + '</div>' : '') +
            miniTable('<th>Căn</th><th>Cư dân / HĐ</th><th>Giá thuê</th><th>Trạng thái</th>', aptRows, 'Chưa có căn hộ nào thuộc tòa nhà này.') +
            '</div>' +

            '<div class="rh-section"><div class="rh-section-title">Dịch vụ (' + (b.services || []).length + ')</div>' +
            miniTable('<th>Dịch vụ</th><th>Cách tính</th><th style="text-align:right;">Đơn giá</th><th style="text-align:right;">Thuế</th>', serviceRows, 'Chưa cấu hình dịch vụ.') +
            '</div>' +

            '<div class="rh-section"><div class="rh-section-title">Cấu hình</div><div class="rh-grid-2">' +
            detailItem('Ngân hàng', escapeHtml(cfg.bankName || '')) +
            detailItem('Số tài khoản', escapeHtml(cfg.bankAccountNumber || '')) +
            detailItem('Chủ tài khoản', escapeHtml(cfg.bankAccountHolder || '')) +
            detailItem('Tài khoản gạch nợ tự động', escapeHtml(cfg.autoDebitAccount || '')) +
            detailItem('Hóa đơn điện tử', cfg.eInvoiceProvider ? escapeHtml(cfg.eInvoiceProvider) : 'Chưa bật') +
            detailItem('Mẫu hóa đơn', invoiceTpl ? escapeHtml(invoiceTpl.name) : '') +
            detailItem('Mẫu hợp đồng', contractTpl ? escapeHtml(contractTpl.name) : '') +
            '</div></div>' +

            '<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.5rem;">' +
            (can('buildings.update') ? '<button type="button" class="btn-primary" onclick="RHUI.openBuildingForm(\'' + b.id + '\')"><i class="fas fa-pen"></i> Sửa tòa nhà</button>' : '') +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Đóng</button>' +
            '</div></div>';
    }

    RHUI.openBuildingDetail = function (id) {
        var b = RHD.get('buildings', id);
        if (!b) return;
        openDrawer('Chi tiết tòa nhà', buildingDetailHtml(b));
        detailBuildingId = id;
    };

    // Re-renders a read-only detail drawer after the source data changed
    // (e.g. another tab edited it). Forms are left alone so input isn't lost.
    function refreshOpenDrawer() {
        var overlay = byId('rhDrawerOverlay');
        if (!overlay || !overlay.classList.contains('show') || !detailBuildingId) return false;
        var b = RHD.get('buildings', detailBuildingId);
        if (!b) { closeDrawer(); return true; }
        var body = byId('rhDrawerBody');
        var scroll = body.scrollTop;
        body.innerHTML = buildingDetailHtml(b);
        body.scrollTop = scroll;
        return true;
    }

    // ============================================================ APARTMENTS

    function renderApartmentsTab() {
        var tab = byId('apartments-tab');
        if (!tab) return;
        var buildings = scoped('buildings');
        var apartments = scoped('apartments').map(normalizeApartmentRecord);

        if (!buildings.length) {
            tab.innerHTML = renderDemoBanner('apartments') + '<div class="card">' + emptyState('fa-building', 'Hãy tạo tòa nhà trước khi thêm căn hộ.') + '</div>';
            return;
        }

        var contracts = RHD.list('contracts');
        var viewApartments = apartments.map(function (apartment) {
            var building = RHD.get('buildings', apartment.buildingId);
            var contract = contracts.filter(function (item) {
                return item.apartmentId === apartment.id && item.status !== 'ended' && item.status !== 'terminated';
            }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })[0];
            var customer = contract && contract.customerId ? RHD.get('customers', contract.customerId) : null;
            apartment.buildingLabel = building ? (building.shortName || building.name) : (apartment.buildingName || '—');
            apartment.residentName = customer ? (customer.fullName || customer.name || '') : (contract && contract.customerName || '');
            apartment.statusGroup = apartment.status === 'maintenance' ? 'maintenance' : (apartment.status === 'deposited' ? 'deposited' : (apartment.status === 'occupied' || contract && contract.status === 'active' ? 'occupied' : 'vacant'));
            return apartment;
        });
        var statusCounts = { all: viewApartments.length, occupied: 0, vacant: 0, maintenance: 0, deposited: 0 };
        viewApartments.forEach(function (apartment) { statusCounts[apartment.statusGroup] += 1; });
        var buildingOptions = buildings.map(function (building) {
            return '<option value="' + escapeHtml(building.id) + '">' + escapeHtml(building.shortName || building.name) + '</option>';
        }).join('');
        var floors = viewApartments.map(function (apartment) { return apartment.floor; }).filter(Boolean).filter(function (floor, index, all) { return all.indexOf(floor) === index; });
        var floorOptions = floors.map(function (floor) { return '<option value="' + escapeHtml(floor) + '">' + escapeHtml(floor) + '</option>'; }).join('');

        tab.innerHTML = renderDemoBanner('apartments') +
            '<style>' +
            '.apartment-browser{padding:1.25rem!important;margin-bottom:1rem!important}.apartment-browser [hidden]{display:none!important}.apartment-browser-head{align-items:center;display:flex;justify-content:space-between;gap:1rem}.apartment-browser-title h2{color:#10213c;font:800 1.55rem "Plus Jakarta Sans","Be Vietnam Pro",sans-serif;margin:0}.apartment-browser-title p{color:#8aa0bc;font-size:.9rem;margin:.35rem 0 0}.apartment-browser-tools{align-items:center;display:flex;gap:.55rem}.apartment-browser-icon{align-items:center;background:#f2f6fb;border:1px solid #dfeaf7;border-radius:12px;color:#1c3356;cursor:pointer;display:inline-flex;height:42px;justify-content:center;width:42px}.apartment-browser-icon.active{background:#e5f1ff;border-color:#bddaff;color:#0d65d5}.apartment-browser-search{margin-top:1rem}.apartment-browser-search input,.apartment-browser-filters input,.apartment-browser-filters select{background:#fff;border:1px solid #d8e3f0;border-radius:10px;color:#10213c;font:inherit;min-height:42px;padding:.6rem .75rem;width:100%}.apartment-browser-search input:focus,.apartment-browser-filters input:focus,.apartment-browser-filters select:focus{border-color:#1683ff;box-shadow:0 0 0 3px rgba(22,131,255,.12);outline:none}.apartment-browser-filters{background:#fbfdff;border:1px solid #e5edf8;border-radius:14px;display:grid;gap:.8rem;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:1rem;padding:1rem}.apartment-browser-filter-actions{display:flex;gap:.6rem;grid-column:1/-1;justify-content:flex-end}.apartment-browser-chips{display:flex;gap:.65rem;margin-top:1rem;overflow-x:auto;padding-bottom:.25rem}.apartment-browser-chip{align-items:center;background:#f1f7fb;border:1px solid #dfeaf7;border-radius:999px;color:#476484;cursor:pointer;display:inline-flex;flex:none;font:600 .82rem "Plus Jakarta Sans","Be Vietnam Pro",sans-serif;gap:.5rem;min-height:42px;padding:.45rem .8rem;white-space:nowrap}.apartment-browser-chip.active{background:#eaf3ff;border-color:#b9d8ff;color:#0d65d5}.apartment-browser-chip[data-status="occupied"].active{background:#e6f8ef;border-color:#9ce0b6;color:#0d7a4f}.apartment-browser-chip-count{background:rgba(91,122,164,.11);border-radius:999px;font-size:.75rem;min-width:1.65rem;padding:.18rem .4rem;text-align:center}.apartment-browser-grid{display:grid;gap:.85rem;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));padding:.15rem}.apartment-browser-tile{align-items:center;border:1px solid transparent;border-radius:12px;color:#fff;cursor:pointer;display:flex;flex-direction:column;justify-content:center;min-height:145px;padding:1rem .7rem;position:relative;text-align:center;transition:transform .15s,box-shadow .15s}.apartment-browser-tile:hover{box-shadow:0 8px 20px rgba(15,23,42,.14);transform:translateY(-2px)}.apartment-browser-tile.status-occupied{background:#218f58}.apartment-browser-tile.status-vacant{background:#ed5050}.apartment-browser-tile.status-maintenance{background:#d99120}.apartment-browser-tile.status-deposited{background:#3478c6}.apartment-browser-name{font-size:.95rem;font-weight:700;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.apartment-browser-floor{font-size:.82rem;margin-top:.25rem;opacity:.78}.apartment-browser-status{font-size:.85rem;font-weight:700;margin-top:.12rem}.apartment-browser-card-tools{display:flex;gap:.35rem;position:absolute;right:.4rem;top:.4rem}.apartment-browser-card-tools button{align-items:center;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);border-radius:7px;color:#fff;cursor:pointer;display:inline-flex;height:28px;justify-content:center;width:29px}.apartment-browser-empty{color:#70839d;grid-column:1/-1;padding:2.5rem 1rem;text-align:center}.apartment-browser-results{color:#70839d;font-size:.82rem;margin:.85rem .2rem .25rem}@media(max-width:700px){.apartment-browser{padding:1rem!important}.apartment-browser-head{align-items:flex-start}.apartment-browser-title h2{font-size:1.25rem}.apartment-browser-title p{font-size:.78rem}.apartment-browser-tools{gap:.35rem}.apartment-browser-icon{height:38px;width:38px}.apartment-browser-filters{grid-template-columns:repeat(2,minmax(0,1fr));padding:.8rem}.apartment-browser-grid{gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(125px,1fr))}.apartment-browser-tile{min-height:125px}}@media(max-width:420px){.apartment-browser-title p{display:none}.apartment-browser-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
            '</style>' +
            '<div class="card apartment-browser">' +
            '<div class="apartment-browser-head"><div class="apartment-browser-title"><h2>Danh sách căn hộ</h2><p>Giá thuê và tiền cọc sẽ tự động điền khi lập hợp đồng.</p></div>' +
            '<div class="apartment-browser-tools"><button class="apartment-browser-icon" id="apartmentBrowseSearchToggle" type="button" title="Tìm kiếm" aria-label="Tìm kiếm căn hộ"><i class="fas fa-magnifying-glass"></i></button>' +
            '<button class="apartment-browser-icon" id="apartmentBrowseFilterToggle" type="button" title="Bộ lọc" aria-label="Lọc căn hộ"><i class="fas fa-sliders"></i></button>' +
            addButton('Thêm', "RHUI.openApartmentForm()", 'apartments', 'apartments.create') + '</div></div>' +
            '<div class="apartment-browser-search" id="apartmentBrowseSearch" hidden><input id="apartmentBrowseQuery" type="search" placeholder="Tìm mã căn hộ, tòa nhà hoặc cư dân..." aria-label="Tìm căn hộ"></div>' +
            '<div class="apartment-browser-filters" id="apartmentBrowseFilters" hidden>' +
            '<select id="apartmentBrowseBuilding" aria-label="Lọc theo tòa nhà"><option value="">Tất cả tòa nhà</option>' + buildingOptions + '</select>' +
            '<select id="apartmentBrowseFloor" aria-label="Lọc theo tầng"><option value="">Tất cả tầng</option>' + floorOptions + '</select>' +
            '<input id="apartmentBrowseAreaMin" type="number" min="0" placeholder="Diện tích từ (m²)" aria-label="Diện tích tối thiểu">' +
            '<input id="apartmentBrowseAreaMax" type="number" min="0" placeholder="Diện tích đến (m²)" aria-label="Diện tích tối đa">' +
            '<input id="apartmentBrowseRentMin" type="number" min="0" placeholder="Giá thuê từ" aria-label="Giá thuê tối thiểu">' +
            '<input id="apartmentBrowseRentMax" type="number" min="0" placeholder="Giá thuê đến" aria-label="Giá thuê tối đa">' +
            '<div class="apartment-browser-filter-actions"><button class="btn-secondary" id="apartmentBrowseClear" type="button">Xóa lọc</button><button class="btn-primary" id="apartmentBrowseApply" type="button">Áp dụng</button></div></div>' +
            '<div class="apartment-browser-chips" id="apartmentBrowseChips">' +
            '<button class="apartment-browser-chip active" data-status="all" type="button"><i class="fas fa-door-open"></i> Danh sách căn hộ <span class="apartment-browser-chip-count">' + statusCounts.all + '</span></button>' +
            '<button class="apartment-browser-chip" data-status="occupied" type="button"><i class="far fa-circle-check"></i> Đang ở <span class="apartment-browser-chip-count">' + statusCounts.occupied + '</span></button>' +
            '<button class="apartment-browser-chip" data-status="vacant" type="button"><i class="fas fa-door-closed"></i> Trống <span class="apartment-browser-chip-count">' + statusCounts.vacant + '</span></button>' +
            '<button class="apartment-browser-chip" data-status="maintenance" type="button"><i class="fas fa-screwdriver-wrench"></i> Bảo trì <span class="apartment-browser-chip-count">' + statusCounts.maintenance + '</span></button>' +
            (statusCounts.deposited ? '<button class="apartment-browser-chip" data-status="deposited" type="button"><i class="fas fa-file-signature"></i> Đã đặt cọc <span class="apartment-browser-chip-count">' + statusCounts.deposited + '</span></button>' : '') +
            '</div></div>' +
            '<div class="card" style="padding:1rem;"><div class="apartment-browser-results" id="apartmentBrowseResults"></div><div class="apartment-browser-grid" id="apartmentBrowseGrid"></div></div>';

        var selectedStatus = 'all';
        var appliedFilters = { building: '', floor: '', areaMin: '', areaMax: '', rentMin: '', rentMax: '' };
        var searchToggle = byId('apartmentBrowseSearchToggle');
        var filterToggle = byId('apartmentBrowseFilterToggle');
        var searchPanel = byId('apartmentBrowseSearch');
        var filterPanel = byId('apartmentBrowseFilters');
        var queryInput = byId('apartmentBrowseQuery');

        function renderApartmentCards() {
            var query = (queryInput.value || '').trim().toLocaleLowerCase();
            var filtered = viewApartments.filter(function (apartment) {
                if (selectedStatus !== 'all' && apartment.statusGroup !== selectedStatus) return false;
                if (appliedFilters.building && apartment.buildingId !== appliedFilters.building) return false;
                if (appliedFilters.floor && apartment.floor !== appliedFilters.floor) return false;
                if (appliedFilters.areaMin !== '' && Number(apartment.area || 0) < Number(appliedFilters.areaMin)) return false;
                if (appliedFilters.areaMax !== '' && Number(apartment.area || 0) > Number(appliedFilters.areaMax)) return false;
                if (appliedFilters.rentMin !== '' && Number(apartment.rentPrice || 0) < Number(appliedFilters.rentMin)) return false;
                if (appliedFilters.rentMax !== '' && Number(apartment.rentPrice || 0) > Number(appliedFilters.rentMax)) return false;
                var searchable = [apartment.name, apartment.code, apartment.id, apartment.buildingLabel, apartment.buildingName, apartment.buildingCode, apartment.floor, apartment.residentName].join(' ').toLocaleLowerCase();
                return !query || searchable.indexOf(query) !== -1;
            });
            var grid = byId('apartmentBrowseGrid');
            byId('apartmentBrowseResults').textContent = 'Hiển thị ' + filtered.length + ' / ' + viewApartments.length + ' căn hộ';
            if (!filtered.length) {
                grid.innerHTML = '<div class="apartment-browser-empty"><i class="fas fa-magnifying-glass"></i><p>Không tìm thấy căn hộ phù hợp. Hãy thử thay đổi từ khóa hoặc bộ lọc.</p></div>';
                return;
            }
            grid.innerHTML = filtered.map(function (apartment) {
                var status = statusMeta(RHD.APARTMENT_STATUSES || [], apartment.statusGroup);
                var statusLabel = apartment.active ? status.label : 'Ngừng hoạt động';
                return '<article class="apartment-browser-tile status-' + escapeHtml(apartment.statusGroup) + '" data-apartment-id="' + escapeHtml(apartment.id) + '" tabindex="0" role="button" aria-label="' + escapeHtml(apartment.name + ', ' + statusLabel) + '">' +
                    '<div class="apartment-browser-card-tools">' +
                    (can('apartments.update') ? '<button type="button" data-action="edit" title="Chỉnh sửa" aria-label="Chỉnh sửa căn hộ"><i class="fas fa-pen"></i></button>' : '') +
                    (can('apartments.delete') ? '<button type="button" data-action="delete" title="Xóa" aria-label="Xóa căn hộ"><i class="fas fa-trash"></i></button>' : '') + '</div>' +
                    '<span class="apartment-browser-name">' + escapeHtml(apartment.name) + '</span><span class="apartment-browser-floor">' + escapeHtml(apartment.floor || 'Chưa có tầng') + '</span>' +
                    '<span class="apartment-browser-status">' + escapeHtml(statusLabel) + '</span>' +
                    (apartment.photos.length ? '<i class="fas fa-image" style="margin-top:.4rem;opacity:.8" title="Có hình ảnh"></i>' : '') + '</article>';
            }).join('');
            grid.querySelectorAll('.apartment-browser-tile').forEach(function (card) {
                var apartmentId = card.getAttribute('data-apartment-id');
                card.addEventListener('click', function (event) {
                    var action = event.target.closest('[data-action]');
                    if (action) {
                        event.stopPropagation();
                        if (action.getAttribute('data-action') === 'edit') RHUI.openApartmentForm(apartmentId);
                        else RHUI.deleteApartment(apartmentId);
                        return;
                    }
                    RHUI.openApartmentDetail(apartmentId);
                });
                card.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        RHUI.openApartmentDetail(apartmentId);
                    }
                });
            });
        }

        searchToggle.addEventListener('click', function () {
            searchPanel.hidden = !searchPanel.hidden;
            searchToggle.classList.toggle('active', !searchPanel.hidden);
            if (!searchPanel.hidden) queryInput.focus();
        });
        filterToggle.addEventListener('click', function () {
            filterPanel.hidden = !filterPanel.hidden;
            filterToggle.classList.toggle('active', !filterPanel.hidden);
        });
        queryInput.addEventListener('input', renderApartmentCards);
        byId('apartmentBrowseChips').querySelectorAll('[data-status]').forEach(function (chip) {
            chip.addEventListener('click', function () {
                selectedStatus = chip.getAttribute('data-status');
                byId('apartmentBrowseChips').querySelectorAll('.apartment-browser-chip').forEach(function (item) { item.classList.toggle('active', item === chip); });
                renderApartmentCards();
            });
        });
        byId('apartmentBrowseApply').addEventListener('click', function () {
            appliedFilters = {
                building: byId('apartmentBrowseBuilding').value,
                floor: byId('apartmentBrowseFloor').value,
                areaMin: byId('apartmentBrowseAreaMin').value,
                areaMax: byId('apartmentBrowseAreaMax').value,
                rentMin: byId('apartmentBrowseRentMin').value,
                rentMax: byId('apartmentBrowseRentMax').value
            };
            filterPanel.hidden = true;
            filterToggle.classList.toggle('active', false);
            renderApartmentCards();
        });
        byId('apartmentBrowseClear').addEventListener('click', function () {
            ['apartmentBrowseBuilding', 'apartmentBrowseFloor', 'apartmentBrowseAreaMin', 'apartmentBrowseAreaMax', 'apartmentBrowseRentMin', 'apartmentBrowseRentMax'].forEach(function (id) { byId(id).value = ''; });
            appliedFilters = { building: '', floor: '', areaMin: '', areaMax: '', rentMin: '', rentMax: '' };
            queryInput.value = '';
            selectedStatus = 'all';
            byId('apartmentBrowseChips').querySelectorAll('.apartment-browser-chip').forEach(function (item) { item.classList.toggle('active', item.getAttribute('data-status') === 'all'); });
            renderApartmentCards();
        });
        renderApartmentCards();
    }

    RHUI.openApartmentDetail = function (id) {
        var apartment = normalizeApartmentRecord(RHD.get('apartments', id));
        if (!apartment) return;

        var building = RHD.get('buildings', apartment.buildingId);
        var contractCandidates = scoped('contracts').filter(function (c) { return c.apartmentId === apartment.id; });
        contractCandidates.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        var contract = contractCandidates[0] || null;
        var customer = contract && contract.customerId ? RHD.get('customers', contract.customerId) : null;
        var apartmentStatus = apartmentDetailStatus(apartment);
        var leaseStatus = apartmentDetailLeaseStatus(contract);
        var buildingName = building ? (building.shortName || building.name) : (apartment.buildingName || '—');
        var buildingCode = building ? (building.code || building.shortName || building.name) : (apartment.buildingCode || '—');
        var address = apartment.address || (building ? [building.addressDetail, building.ward, building.province].filter(Boolean).join(', ') : '—');
        var photoList = apartment.photos && apartment.photos.length ? apartment.photos : [];

        var infoRows = [
            ['Số căn hộ', apartment.name || '—'],
            ['Mã tòa nhà', buildingCode],
            ['Tầng', apartment.floor || '—'],
            ['Tòa nhà', buildingName],
            ['Giá thuê', money(apartment.rentPrice)],
            ['Đặt cọc', money(apartment.depositPrice)],
            ['Diện tích', (apartment.area ? apartment.area + ' m²' : '—')],
            ['Địa chỉ', address],
            ['Tình trạng', badge(apartmentStatus.label, apartmentStatus.color, apartmentStatus.bg)],
            ['Trạng thái thuê', badge(leaseStatus.label, leaseStatus.color, leaseStatus.bg)]
        ];

        var contractHtml = contract
            ? '<button type="button" class="apartment-detail-link" onclick="event.stopPropagation(); RHUI.openContractForm(\'' + contract.id + '\')"><i class="fas fa-file-contract"></i><span>' + escapeHtml(contract.code || 'Hợp đồng') + '</span><span class="apartment-detail-link-text">' + escapeHtml(contract.customerName || (customer ? customer.fullName || customer.name : 'Khách thuê')) + '</span></button>'
            : '<div class="apartment-detail-empty">Chưa có hợp đồng</div>';

        var customerHtml = customer
            ? '<button type="button" class="apartment-detail-link" onclick="event.stopPropagation(); RHUI.openCustomerForm(\'' + customer.id + '\')"><i class="fas fa-user"></i><span>' + escapeHtml(customer.fullName || customer.name || 'Khách thuê') + '</span><span class="apartment-detail-link-text">' + escapeHtml(customer.phone || customer.contactPhone || '—') + '</span></button>'
            : '<div class="apartment-detail-empty">Chưa có khách thuê</div>';

        var imagesHtml = photoList.length
            ? '<div class="apartment-photo-grid">' + photoList.map(function (src) {
                return '<button type="button" class="apartment-photo" onclick="window.open(\'' + escapeHtml(src) + '\', \'_blank\')" style="background-image:url(\'' + escapeHtml(src) + '\');"></button>';
            }).join('') + '</div>'
            : !can('apartments.update') ? '<p class="apartment-detail-empty-photo">Chưa có hình ảnh</p>'
            : '<button type="button" class="apartment-detail-empty-photo" onclick="event.stopPropagation(); RHUI.openApartmentForm(\'' + apartment.id + '\')"><i class="fas fa-plus"></i> Thêm hình ảnh</button>';

        var infoTable = infoRows.map(function (row) {
            var label = row[0];
            var value = row[1];
            return '<div class="apartment-detail-row"><span class="apartment-detail-label">' + escapeHtml(label) + '</span><span class="apartment-detail-value">' + value + '</span></div>';
        }).join('');

        var body = '<style>' +
            '.apartment-detail-topbar{align-items:center;display:grid;gap:.5rem;grid-template-columns:48px 1fr 48px;margin-bottom:1rem;padding:0 .15rem;position:sticky;top:0;z-index:2;}' +
            '.apartment-detail-topbar button{align-items:center;background:#f1f5f9;border:1px solid #e4eaf2;border-radius:10px;color:#475569;cursor:pointer;display:inline-flex;height:40px;justify-content:center;width:40px;}' +
            '.apartment-detail-topbar h3{color:#10213c;font:800 1.15rem "Plus Jakarta Sans",sans-serif;letter-spacing:.04em;margin:0;text-align:center;text-transform:uppercase;}' +
            '.apartment-detail-shell{display:flex;flex-direction:column;gap:1.2rem;}' +
            '.apartment-detail-box{background:#fff;border:1px solid #e8eef5;border-radius:16px;overflow:hidden;box-shadow:0 12px 28px rgba(15,23,42,.04);}' +
            '.apartment-detail-header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.1rem;border-bottom:1px solid #edf2f7;background:#fbfdff;}' +
            '.apartment-detail-header h4{margin:0;color:#10213c;font:700 1rem "Plus Jakarta Sans",sans-serif;letter-spacing:.04em;text-transform:uppercase;}' +
            '.apartment-detail-content{padding:0;}' +
            '.apartment-detail-row{display:grid;grid-template-columns:minmax(150px, 220px) minmax(0, 1fr);padding:.9rem 1rem;border-bottom:1px solid #edf2f7;align-items:start;gap:1rem;}' +
            '.apartment-detail-row:last-child{border-bottom:none;}' +
            '.apartment-detail-label{color:#61708a;font-weight:600;}' +
            '.apartment-detail-value{color:#10213c;font-weight:700;text-align:right;word-break:break-word;}' +
            '.apartment-detail-section{padding:1rem 1rem 0;}' +
            '.apartment-detail-section-title{color:#94a3b8;font-size:.72rem;font-weight:700;letter-spacing:.08em;margin:0 0 .85rem;text-transform:uppercase;}' +
            '.apartment-detail-link{align-items:center;background:#fff;border:1px solid #e8eef5;border-radius:12px;color:#10213c;cursor:pointer;display:flex;gap:.8rem;justify-content:space-between;padding:.9rem 1rem;text-align:left;width:100%;}' +
            '.apartment-detail-link i{background:#eef5ff;border-radius:10px;color:#0d65d5;display:inline-flex;height:36px;align-items:center;justify-content:center;width:36px;}' +
            '.apartment-detail-link-text{color:#61708a;font-size:.82rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
            '.apartment-detail-link span:nth-child(2){font-weight:700;flex:1;}' +
            '.apartment-detail-empty{background:#f8fafc;border:1px dashed #dbe5f0;border-radius:12px;color:#61708a;padding:.9rem 1rem;text-align:center;}' +
            '.apartment-detail-empty-photo{align-items:center;background:#f8fafc;border:1px dashed #dbe5f0;border-radius:16px;color:#0d65d5;cursor:pointer;display:flex;gap:.5rem;justify-content:center;padding:1.2rem 1rem;width:100%;font-weight:600;}' +
            '.apartment-photo-grid{display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:.7rem;}' +
            '.apartment-photo{background-position:center;background-repeat:no-repeat;background-size:cover;border:1px solid #e8eef5;border-radius:12px;cursor:pointer;height:120px;overflow:hidden;width:100%;}' +
            '@media (max-width: 640px){.apartment-detail-row{grid-template-columns:1fr;gap:.35rem;padding:.8rem .9rem;}.apartment-detail-value{text-align:left;}.apartment-photo-grid{grid-template-columns:repeat(2, minmax(0, 1fr));}.apartment-detail-link{flex-wrap:wrap;}.apartment-detail-link-text{max-width:unset;white-space:normal;}}' +
            '</style>' +
            '<div class="apartment-detail-topbar"><button type="button" aria-label="Đóng" onclick="event.stopPropagation(); RHUI.closeDrawer();"><i class="fas fa-xmark"></i></button><h3>THÔNG TIN CĂN HỘ</h3><div></div></div>' +
            '<div class="apartment-detail-shell">' +
            '<div class="apartment-detail-box">' +
            '<div class="apartment-detail-header"><h4>Thông tin cơ bản</h4></div>' +
            '<div class="apartment-detail-content">' + infoTable + '</div>' +
            '</div>' +
            '<div class="apartment-detail-box"><div class="apartment-detail-header"><h4>Hợp đồng</h4></div><div class="apartment-detail-section">' + contractHtml + '</div></div>' +
            '<div class="apartment-detail-box"><div class="apartment-detail-header"><h4>Khách hàng</h4></div><div class="apartment-detail-section">' + customerHtml + '</div></div>' +
            '<div class="apartment-detail-box"><div class="apartment-detail-header"><h4>Hình ảnh căn hộ</h4></div><div class="apartment-detail-section" style="padding-bottom:1rem;">' + imagesHtml + '</div></div>' +
            '</div>';

        openDrawer('THÔNG TIN CĂN HỘ', body);
    };

    RHUI.openApartmentForm = function (id) {
        if (!guard(id ? 'apartments.update' : 'apartments.create')) return;
        var a = id ? RHD.get('apartments', id) : null;
        RHUI.drawerEntity = 'apartments';
        RHUI.drawerId = id || null;
        var buildings = scoped('buildings');
        var selectedInvoiceTemplate = a ? a.invoiceTemplateId : (RHT.getDefault('INVOICE') || {}).id;
        var selectedContractTemplate = a ? a.contractTemplateId : (RHT.getDefault('CONTRACT') || {}).id;
        var selectedBuildingId = a ? a.buildingId : buildings[0].id;
        var selectedFloor = a ? String(a.floor || '').replace(/^Tầng /, '') : '';
        var floorOptions = function (buildingId, selected) {
            var building = RHD.get('buildings', buildingId);
            var count = building && Number(building.floorCount) > 0 ? Number(building.floorCount) : 20;
            var floors = [];
            for (var i = 1; i <= count; i++) floors.push({ id: String(i), label: 'Tầng ' + i });
            return selectOptions(floors, 'id', 'label', selected, 'Chọn tầng');
        };

        var html = '<form onsubmit="RHUI.submitApartmentForm(event)">' +
            '<div class="rh-section-title">THÔNG TIN CĂN HỘ</div>' +
            '<div class="rh-grid-2">' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Chọn tòa nhà *</label><select id="afBuilding" required>' + selectOptions(buildings, 'id', function (b) { return b.name + ' (' + (b.shortName || b.code) + ')'; }, selectedBuildingId, 'Chọn tòa nhà') + '</select></div>' +
            '<div class="rh-field"><label>Chọn tầng *</label><select id="afFloor" required>' + floorOptions(selectedBuildingId, selectedFloor) + '</select></div>' +
            '<div class="rh-field"><label>Tên căn hộ *</label><input id="afName" required value="' + escapeHtml(a ? a.name : '') + '" placeholder="Tên căn hộ"></div>' +
            '<div class="rh-field"><label>Giá thuê *</label><input id="afRent" type="number" min="0" required value="' + (a ? a.rentPrice : '') + '" placeholder="Giá thuê"></div>' +
            '<div class="rh-field"><label>Cọc *</label><input id="afDeposit" type="number" min="0" required value="' + (a ? a.depositPrice : '') + '" placeholder="Cọc"></div>' +
            '<div class="rh-field"><label>Diện tích *</label><input id="afArea" type="number" min="0" required value="' + (a ? a.area : '') + '" placeholder="Diện tích"></div>' +
            '<div class="rh-field"><label>Số khách tối đa *</label><input id="afMaxGuests" type="number" min="1" required value="' + (a ? a.maxGuests || '' : '') + '" placeholder="Số khách tối đa"></div>' +
            '</div>' +
            '<div class="rh-section"><div class="rh-section-title">CẤU HÌNH</div><div class="rh-grid-2">' +
            templatePickerHtml('afInvoiceTpl', 'INVOICE', selectedInvoiceTemplate) +
            templatePickerHtml('afContractTpl', 'CONTRACT', selectedContractTemplate) +
            '</div></div>' +
            '<div class="rh-section"><div class="rh-section-title">TRẠNG THÁI</div><label style="display:flex;align-items:center;gap:.6rem;font-weight:600;color:#10213c;cursor:pointer;"><input type="checkbox" id="afActive" ' + (a && a.active === false ? '' : 'checked') + ' style="width:18px;height:18px;"> Hoạt động <span id="afActiveLabel" style="color:' + (a && a.active === false ? '#64748b' : '#18a878') + ';font-size:.82rem;">' + (a && a.active === false ? 'Ngừng hoạt động' : 'Đang hoạt động') + '</span></label></div>' +
            '<div id="afError" style="color:#ef4444;font-size:.85rem;margin-top:1rem;"></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;">' +
            '<button type="submit" class="btn-primary">Lưu căn hộ</button>' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Huỷ</button>' +
            '</div></form>';

        openDrawer(a ? 'Sửa căn hộ' : 'Thêm căn hộ', html);
        byId('afBuilding').addEventListener('change', function () {
            byId('afFloor').innerHTML = floorOptions(this.value, '');
        });
        byId('afActive').addEventListener('change', function () {
            byId('afActiveLabel').textContent = this.checked ? 'Đang hoạt động' : 'Ngừng hoạt động';
            byId('afActiveLabel').style.color = this.checked ? '#18a878' : '#64748b';
        });
    };

    RHUI.submitApartmentForm = function (ev) {
        ev.preventDefault();
        if (!guard(RHUI.drawerId ? 'apartments.update' : 'apartments.create')) return;
        var data = {
            buildingId: byId('afBuilding').value,
            name: byId('afName').value.trim(),
            floor: 'Tầng ' + byId('afFloor').value,
            area: Number(byId('afArea').value),
            maxGuests: Number(byId('afMaxGuests').value),
            active: byId('afActive').checked,
            status: byId('afActive').checked ? 'vacant' : 'maintenance',
            rentPrice: Number(byId('afRent').value) || 0,
            depositPrice: Number(byId('afDeposit').value) || 0,
            invoiceTemplateId: byId('afInvoiceTpl').value,
            contractTemplateId: byId('afContractTpl').value
        };
        var res = RHUI.drawerId ? RHD.update('apartments', RHUI.drawerId, data) : RHD.create('apartments', data);
        if (!res.ok) { byId('afError').textContent = res.error; return; }
        closeDrawer();
        renderApartmentsTab();
        renderDashboardCounts();
    };

    RHUI.deleteApartment = function (id) {
        if (!guard('apartments.delete')) return;
        var block = RHD.contractsOf(id).length ? 'Không thể xoá: căn hộ đang gắn với hợp đồng.'
            : RHD.assetsOf('apartmentId', id).length ? 'Không thể xoá: vẫn còn tài sản gắn với căn hộ này.' : null;
        confirmDelete('apartments', id, function () { renderApartmentsTab(); renderDashboardCounts(); }, block);
    };

    // ============================================================= CUSTOMERS

    function vehicleRowHtml(v, idx) {
        return '<div class="rh-service-row" data-idx="' + idx + '">' +
            '<div class="rh-grid-2">' +
            '<div class="rh-field"><label>Loại xe</label><select onchange="RHUI.customerVehicles[' + idx + '].type=this.value">' + selectOptions(RHD.VEHICLE_TYPES.map(function (t) { return { t: t }; }), 't', 't', v.type) + '</select></div>' +
            '<div class="rh-field"><label>Dòng xe</label><input value="' + escapeHtml(v.model || '') + '" oninput="RHUI.customerVehicles[' + idx + '].model=this.value"></div>' +
            '<div class="rh-field"><label>Biển số</label><input value="' + escapeHtml(v.plate || '') + '" oninput="RHUI.customerVehicles[' + idx + '].plate=this.value"></div>' +
            '<div class="rh-field"><label>Màu sắc</label><input value="' + escapeHtml(v.color || '') + '" oninput="RHUI.customerVehicles[' + idx + '].color=this.value"></div>' +
            '<div class="rh-field"><label>Vé xe</label><input value="' + escapeHtml(v.ticket || '') + '" oninput="RHUI.customerVehicles[' + idx + '].ticket=this.value"></div>' +
            '<div class="rh-field"><label>Ảnh xe (không bắt buộc)</label><input type="file" accept="image/*" onchange="RHUI.setVehiclePhoto(' + idx + ',this)"></div>' +
            '</div>' +
            '<button type="button" class="rh-row-btn danger" style="margin-top:.5rem;" onclick="RHUI.removeVehicle(' + idx + ')"><i class="fas fa-trash"></i> Xoá phương tiện</button>' +
            '</div>';
    }

    function renderVehiclesList() {
        var container = byId('rhVehiclesList');
        if (!container) return;
        container.innerHTML = RHUI.customerVehicles.map(function (v, i) { return vehicleRowHtml(v, i); }).join('') || '<p style="color:#94a3b8;font-size:.85rem;">Chưa có phương tiện nào.</p>';
    }

    RHUI.addVehicle = function () {
        RHUI.customerVehicles.push({ id: 'veh-' + Date.now() + Math.random().toString(36).slice(2, 6), type: RHD.VEHICLE_TYPES[0], model: '', plate: '', color: '', photo: '', ticket: '' });
        renderVehiclesList();
    };
    RHUI.removeVehicle = function (idx) { RHUI.customerVehicles.splice(idx, 1); renderVehiclesList(); };
    RHUI.setVehiclePhoto = function (idx, input) { readFileAsDataUrl(input, function (dataUrl) { RHUI.customerVehicles[idx].photo = dataUrl; }); };

    function renderCustomersTab() {
        var tab = byId('customers-tab');
        if (!tab) return;
        var customers = scoped('customers');
        var rows = customers.map(function (c) {
            var residenceBuilding = RHD.get('buildings', c.residenceBuildingId);
            var residenceApartment = RHD.get('apartments', c.residenceApartmentId);
            return '<tr>' +
                '<td><strong>' + escapeHtml(c.fullName) + '</strong>' + (c.isForeigner ? ' ' + badge('Nước ngoài', '#0d65d5', '#eaf3ff') : '') + '</td>' +
                '<td>' + escapeHtml(c.phone) + '</td>' +
                '<td>' + escapeHtml(c.idNumber || '—') + '</td>' +
                '<td>' + escapeHtml(residenceBuilding ? residenceBuilding.name : '—') + '</td>' +
                '<td>' + escapeHtml(residenceApartment ? residenceApartment.name : '—') + '</td>' +
                '<td>' + escapeHtml(c.customerType || '—') + '</td>' +
                '<td>' + (c.vehicles ? c.vehicles.length : 0) + ' xe</td>' +
                '<td style="text-align:right;white-space:nowrap;">' +
                rowButton('contracts.create', "RHUI.openContractForCustomer('" + c.id + "')", 'fa-file-circle-plus', 'Tạo hợp đồng') +
                rowButton('customers.update', "RHUI.openCustomerForm('" + c.id + "')", 'fa-pen', 'Sửa') +
                rowButton('customers.delete', "RHUI.deleteCustomer('" + c.id + "')", 'fa-trash', 'Xoá', true) +
                '</td></tr>';
        }).join('');

        tab.innerHTML = renderDemoBanner('customers') +
            '<div class="card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div><h2 style="font-size:1.4rem;font-weight:700;color:#10213c;">Khách hàng</h2><p style="color:#94a3b8;font-size:.875rem;margin-top:.25rem;">Hồ sơ khách hàng dùng để lập hợp đồng — không cần nhập lại thông tin.</p></div>' +
            addButton('Thêm khách hàng', "RHUI.openCustomerForm()", 'customers', 'customers.create') +
            '</div>' +
            (customers.length ? '<div class="table-container"><table><thead><tr><th>Họ tên</th><th>SĐT</th><th>CCCD</th><th>Tòa nhà</th><th>Phòng ở</th><th>Loại KH</th><th>Phương tiện</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
                : emptyState('fa-users', 'Chưa có khách hàng nào.')) +
            '</div>';
    }

    RHUI.toggleForeigner = function (checked) {
        byId('rhForeignerFields').style.display = checked ? 'block' : 'none';
    };

    RHUI.openCustomerForm = function (id) {
        if (!guard(id ? 'customers.update' : 'customers.create')) return;
        var c = id ? RHD.get('customers', id) : null;
        RHUI.drawerEntity = 'customers';
        RHUI.drawerId = id || null;
        RHUI.customerVehicles = c ? JSON.parse(JSON.stringify(c.vehicles || [])) : [];
        var residenceBuildings = RHD.list('buildings');
        var residenceBuildingId = c ? c.residenceBuildingId : '';
        var residenceApartments = residenceBuildingId ? RHD.apartmentsOf(residenceBuildingId) : [];
        var existingTypes = [];
        RHD.list('customers').forEach(function (cc) { if (cc.customerType && existingTypes.indexOf(cc.customerType) === -1) existingTypes.push(cc.customerType); });
        ['Cá nhân', 'Công ty', 'Khách vãng lai'].forEach(function (t) { if (existingTypes.indexOf(t) === -1) existingTypes.push(t); });

        var html = '<form onsubmit="RHUI.submitCustomerForm(event)">' +
            '<div class="rh-section-title">Thông tin cơ bản</div>' +
            '<div class="rh-grid-2">' +
            '<div class="rh-field"><label>Họ và tên *</label><input id="cfName" required value="' + escapeHtml(c ? c.fullName : '') + '"></div>' +
            '<div class="rh-field"><label>Số điện thoại *</label><input id="cfPhone" required value="' + escapeHtml(c ? c.phone : '') + '"></div>' +
            '<div class="rh-field"><label>Email</label><input id="cfEmail" type="email" value="' + escapeHtml(c ? c.email : '') + '"></div>' +
            '<div class="rh-field"><label>Ngày sinh</label><input id="cfDob" type="date" value="' + escapeHtml(c ? c.dob : '') + '"></div>' +
            '<div class="rh-field"><label>Giới tính</label><select id="cfGender">' + selectOptions([{ v: 'Nam' }, { v: 'Nữ' }, { v: 'Khác' }], 'v', 'v', c ? c.gender : 'Nam') + '</select></div>' +
            '<div class="rh-field"><label>Số CMND/CCCD *</label><input id="cfIdNumber" required value="' + escapeHtml(c ? c.idNumber : '') + '"></div>' +
            '<div class="rh-field"><label>Ngày cấp</label><input id="cfIdDate" type="date" value="' + escapeHtml(c ? c.idIssueDate : '') + '"></div>' +
            '<div class="rh-field"><label>Ảnh CCCD mặt trước</label><input id="cfIdFront" type="file" accept="image/*"><input type="hidden" id="cfIdFrontData" value="' + escapeHtml(c ? c.idFrontPhoto : '') + '"></div>' +
            '<div class="rh-field"><label>Ảnh CCCD mặt sau</label><input id="cfIdBack" type="file" accept="image/*"><input type="hidden" id="cfIdBackData" value="' + escapeHtml(c ? c.idBackPhoto : '') + '"></div>' +
            '</div>' +

            '<div class="rh-section"><div class="rh-section-title">Địa chỉ</div><div class="rh-grid-2">' +
            '<div class="rh-field"><label>Tỉnh / Thành phố</label><select id="cfProvince">' + selectOptions(RHD.PROVINCES.map(function (p) { return { p: p }; }), 'p', 'p', c ? c.province : '', 'Chọn tỉnh/thành') + '</select></div>' +
            '<div class="rh-field"><label>Xã / Phường</label><input id="cfWard" list="rhCustWardSuggestions" value="' + escapeHtml(c ? c.ward : '') + '"></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Địa chỉ chi tiết</label><input id="cfAddress" value="' + escapeHtml(c ? c.addressDetail : '') + '"></div>' +
            '</div><datalist id="rhCustWardSuggestions"></datalist></div>' +

            '<div class="rh-section"><div class="rh-section-title">Lịch sử ở</div><div class="rh-grid-2">' +
            '<div class="rh-field"><label>Tòa nhà</label><select id="cfResidenceBuilding">' + selectOptions(residenceBuildings, 'id', function (building) { return building.shortName || building.code; }, residenceBuildingId, 'Chọn tòa nhà') + '</select></div>' +
            '<div class="rh-field"><label>Căn hộ</label><select id="cfResidenceApartment">' + selectOptions(residenceApartments, 'id', 'name', c ? c.residenceApartmentId : '', 'Chọn căn hộ') + '</select></div>' +
            '<div class="rh-field"><label>Ngày vào ở</label><input id="cfMoveInDate" type="date" value="' + escapeHtml(c ? c.moveInDate : '') + '"></div>' +
            '</div></div>' +

            '<div class="rh-section"><div class="rh-section-title">Thông tin bổ sung</div><div class="rh-grid-2">' +
            '<div class="rh-field"><label>Loại khách hàng</label><input id="cfType" list="rhCustTypeList" value="' + escapeHtml(c ? c.customerType : 'Cá nhân') + '"></div>' +
            '<datalist id="rhCustTypeList">' + existingTypes.map(function (t) { return '<option value="' + escapeHtml(t) + '">'; }).join('') + '</datalist>' +
            '<div class="rh-field"><label>Mã vân tay cửa</label><input id="cfFingerprint" value="' + escapeHtml(c ? c.doorFingerprintCode : '') + '"></div>' +
            '<div class="rh-field"><label>Tư vấn viên</label><input id="cfConsultant" value="' + escapeHtml(c ? c.consultantName : '') + '"></div>' +
            '<div class="rh-field"><label>SĐT tư vấn viên</label><input id="cfConsultantPhone" value="' + escapeHtml(c ? c.consultantPhone : '') + '"></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Ghi chú</label><textarea id="cfNote" rows="2">' + escapeHtml(c ? c.note : '') + '</textarea></div>' +
            '</div></div>' +

            '<div class="rh-section"><label style="display:flex;align-items:center;gap:.6rem;font-weight:600;color:#10213c;cursor:pointer;">' +
            '<input type="checkbox" id="cfForeigner" ' + (c && c.isForeigner ? 'checked' : '') + ' onchange="RHUI.toggleForeigner(this.checked)" style="width:18px;height:18px;"> Khách nước ngoài' +
            '</label>' +
            '<div id="rhForeignerFields" style="display:' + (c && c.isForeigner ? 'block' : 'none') + ';margin-top:.9rem;"><div class="rh-grid-2">' +
            '<div class="rh-field"><label>Quốc tịch</label><input id="cfNationality" value="' + escapeHtml(c ? c.nationality : '') + '"></div>' +
            '<div class="rh-field"><label>Số hộ chiếu</label><input id="cfPassportNo" value="' + escapeHtml(c ? c.passportNumber : '') + '"></div>' +
            '<div class="rh-field"><label>Loại hộ chiếu</label><select id="cfPassportType">' + selectOptions([{ v: 'Phổ thông' }, { v: 'Công vụ' }, { v: 'Ngoại giao' }], 'v', 'v', c ? c.passportType : 'Phổ thông') + '</select></div>' +
            '<div class="rh-field"><label>Ngày hết hạn</label><input id="cfPassportExpiry" type="date" value="' + escapeHtml(c ? c.passportExpiry : '') + '"></div>' +
            '<div class="rh-field"><label>Ảnh hộ chiếu</label><input id="cfPassportPhoto" type="file" accept="image/*"><input type="hidden" id="cfPassportPhotoData" value="' + escapeHtml(c ? c.passportPhoto : '') + '"></div>' +
            '</div></div></div>' +

            '<div class="rh-section"><div class="rh-section-title" style="display:flex;justify-content:space-between;align-items:center;">Phương tiện <button type="button" class="rh-link-btn" onclick="RHUI.addVehicle()"><i class="fas fa-plus"></i> Thêm phương tiện</button></div>' +
            '<div id="rhVehiclesList"></div></div>' +

            '<div id="cfError" style="color:#ef4444;font-size:.85rem;margin-top:1rem;"></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;">' +
            '<button type="submit" class="btn-primary">Lưu khách hàng</button>' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Huỷ</button>' +
            '</div></form>';

        openDrawer(c ? 'Sửa khách hàng' : 'Thêm khách hàng', html);
        renderVehiclesList();
        byId('cfProvince').addEventListener('change', function () {
            var wards = RHD.WARD_SUGGESTIONS[this.value] || [];
            byId('rhCustWardSuggestions').innerHTML = wards.map(function (w) { return '<option value="' + escapeHtml(w) + '">'; }).join('');
        });
        byId('cfResidenceBuilding').addEventListener('change', function () {
            var apartments = this.value ? RHD.apartmentsOf(this.value) : [];
            byId('cfResidenceApartment').innerHTML = selectOptions(apartments, 'id', 'name', '', 'Chọn căn hộ');
        });
        byId('cfIdFront').addEventListener('change', function () { readFileAsDataUrl(this, function (d) { byId('cfIdFrontData').value = d; }); });
        byId('cfIdBack').addEventListener('change', function () { readFileAsDataUrl(this, function (d) { byId('cfIdBackData').value = d; }); });
        var passportInput = byId('cfPassportPhoto');
        if (passportInput) passportInput.addEventListener('change', function () { readFileAsDataUrl(this, function (d) { byId('cfPassportPhotoData').value = d; }); });
    };

    RHUI.submitCustomerForm = function (ev) {
        ev.preventDefault();
        if (!guard(RHUI.drawerId ? 'customers.update' : 'customers.create')) return;
        var isForeigner = byId('cfForeigner').checked;
        var data = {
            fullName: byId('cfName').value.trim(),
            phone: byId('cfPhone').value.trim(),
            email: byId('cfEmail').value.trim(),
            dob: byId('cfDob').value,
            gender: byId('cfGender').value,
            idNumber: byId('cfIdNumber').value.trim(),
            idIssueDate: byId('cfIdDate').value,
            idFrontPhoto: byId('cfIdFrontData').value,
            idBackPhoto: byId('cfIdBackData').value,
            province: byId('cfProvince').value,
            ward: byId('cfWard').value.trim(),
            addressDetail: byId('cfAddress').value.trim(),
            residenceBuildingId: byId('cfResidenceBuilding').value,
            residenceApartmentId: byId('cfResidenceApartment').value,
            moveInDate: byId('cfMoveInDate').value,
            customerType: byId('cfType').value.trim(),
            note: byId('cfNote').value.trim(),
            consultantName: byId('cfConsultant').value.trim(),
            consultantPhone: byId('cfConsultantPhone').value.trim(),
            doorFingerprintCode: byId('cfFingerprint').value.trim(),
            isForeigner: isForeigner,
            nationality: isForeigner ? byId('cfNationality').value.trim() : '',
            passportNumber: isForeigner ? byId('cfPassportNo').value.trim() : '',
            passportType: isForeigner ? byId('cfPassportType').value : '',
            passportExpiry: isForeigner ? byId('cfPassportExpiry').value : '',
            passportPhoto: isForeigner ? byId('cfPassportPhotoData').value : '',
            vehicles: RHUI.customerVehicles
        };
        var res = RHUI.drawerId ? RHD.update('customers', RHUI.drawerId, data) : RHD.create('customers', data);
        if (!res.ok) { byId('cfError').textContent = res.error; return; }
        var createdCustomer = !RHUI.drawerId;
        closeDrawer();
        renderCustomersTab();
        renderDashboardCounts();
        if (createdCustomer) {
            if (typeof global.switchTab === 'function') global.switchTab('contracts');
            if (can('contracts.create') && scoped('buildings').length && scoped('apartments').length) RHUI.openContractForm(null, res.item.id);
            else alert('Đã lưu khách hàng. Cần tạo tòa nhà và căn hộ trước khi lập hợp đồng.');
        }
    };

    RHUI.deleteCustomer = function (id) {
        if (!guard('customers.delete')) return;
        var hasContract = RHD.list('contracts').some(function (c) { return c.customerId === id; });
        confirmDelete('customers', id, function () { renderCustomersTab(); renderDashboardCounts(); }, hasContract ? 'Không thể xoá: khách hàng đang gắn với hợp đồng.' : null);
    };

    // =============================================================== METERS
    // The "Ghi chỉ số" module is a React app (src/meter-reading, built into
    // dist/meter-reading.js). This only mounts it into the tab; it reads and
    // writes the same RHD `meters` store that Hóa đơn uses for consumption.

    function renderMetersTab() {
        var tab = byId('meters-tab') || (typeof window.ensureTab === 'function' ? window.ensureTab('meters') : null);
        if (!tab) return;
        if (!global.MeterReadingApp || typeof global.MeterReadingApp.mount !== 'function') {
            tab.innerHTML = '<div class="card">' + emptyState('fa-triangle-exclamation', 'Không tải được module Ghi chỉ số (dist/meter-reading.js). Hãy chạy "npm run build" rồi tải lại trang.') + '</div>';
            return;
        }
        global.MeterReadingApp.mount(tab);
    }

    // ============================================================= CONTRACTS

    function ensureContractsStyles() {
        if (byId('rhContractsStyles')) return;
        var style = document.createElement('style');
        style.id = 'rhContractsStyles';
        style.textContent = '#contracts-tab{position:relative;padding-bottom:5rem;color:#171923}#contracts-tab .rh-contract-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}#contracts-tab .rh-contract-head h2{font:700 1.35rem \'Plus Jakarta Sans\',sans-serif;color:#171923}#contracts-tab .rh-contract-tools{display:flex;gap:.5rem}#contracts-tab .rh-contract-icon-btn{width:40px;height:40px;border:1px solid #e6e8ed;background:#fff;border-radius:50%;color:#242833;cursor:pointer}#contracts-tab .rh-contract-icon-btn:hover{background:#f3f4f6}#contracts-tab .rh-contract-search{display:none;margin:0 0 1rem}#contracts-tab .rh-contract-search.open{display:block}#contracts-tab .rh-contract-search input,#contracts-tab .rh-contract-filter-panel select{width:100%;padding:.7rem .85rem;border:1px solid #e2e5eb;border-radius:8px;font:inherit}#contracts-tab .rh-contract-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;margin-bottom:1rem}#contracts-tab .rh-contract-kpi{display:flex;align-items:center;gap:.8rem;padding:1rem 1.1rem;border-radius:12px;background:#f4f5f7;min-width:0}#contracts-tab .rh-contract-kpi:nth-child(2){background:#eff3ff}#contracts-tab .rh-contract-kpi:nth-child(3){background:#fff1ef}#contracts-tab .rh-contract-kpi-icon{width:48px;height:48px;flex:0 0 48px;border-radius:12px;display:grid;place-items:center;background:#e6e8ec;color:#68717f;font-size:1.15rem}#contracts-tab .rh-contract-kpi:nth-child(2) .rh-contract-kpi-icon{background:#dfe7ff;color:#3866d9}#contracts-tab .rh-contract-kpi:nth-child(3) .rh-contract-kpi-icon{background:#ffe1dc;color:#c8443e}#contracts-tab .rh-contract-kpi strong{display:block;font-size:1.35rem;line-height:1.2}#contracts-tab .rh-contract-kpi span:last-child{display:block;color:#87909d;margin-top:.18rem;font-size:.9rem}#contracts-tab .rh-contract-tabs{display:flex;gap:.55rem;overflow-x:auto;padding:.25rem 0 .8rem;margin-bottom:1rem;scrollbar-width:thin}#contracts-tab .rh-contract-tab{display:inline-flex;align-items:center;gap:.5rem;flex:0 0 auto;border:0;border-radius:999px;background:#f1f2f4;color:#656d78;padding:.62rem .85rem;font:600 .85rem inherit;cursor:pointer;white-space:nowrap}#contracts-tab .rh-contract-tab b{display:grid;place-items:center;min-width:23px;height:23px;padding:0 .32rem;border-radius:50%;background:#e2e4e8;color:#535a64;font-size:.75rem}#contracts-tab .rh-contract-tab.active{background:#171923;color:white;box-shadow:0 5px 12px #17192324}#contracts-tab .rh-contract-tab.active b{background:#454956;color:white}#contracts-tab .rh-contract-filter-panel{display:none;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem;padding:0 0 1rem}#contracts-tab .rh-contract-filter-panel.open{display:grid}#contracts-tab .rh-contract-list{display:grid;gap:.65rem}#contracts-tab .rh-contract-row{display:grid;grid-template-columns:minmax(145px,1fr) minmax(145px,1.1fr) minmax(150px,1.2fr) minmax(150px,1fr) minmax(100px,.8fr) auto;align-items:center;gap:.75rem;padding:.9rem 1rem;border:1px solid #e7eaf0;border-radius:9px;background:#fff}#contracts-tab .rh-contract-cell small{display:block;color:#9299a4;font-size:.7rem;margin-bottom:.25rem}#contracts-tab .rh-contract-cell strong{font-size:.82rem;font-weight:600}#contracts-tab .rh-contract-actions{display:flex;gap:.35rem}#contracts-tab .rh-contract-actions .rh-row-btn{width:32px;height:32px}#contracts-tab .rh-contract-empty{min-height:220px;display:grid;place-content:center;text-align:center;color:#a0a5af;background:#f4f4f7;border-radius:0 0 10px 10px}#contracts-tab .rh-contract-empty i{font-size:3.5rem;margin-bottom:.75rem}#contracts-tab .rh-contract-fab{position:fixed;right:28px;bottom:28px;width:64px;height:64px;border:0;border-radius:50%;background:#41995d;color:#fff;font-size:2rem;box-shadow:0 8px 18px #19231e30;cursor:pointer;z-index:40}#contracts-tab .rh-contract-fab:hover{background:#34864f;transform:translateY(-2px)}#contracts-tab .rh-customer-preview{grid-column:1/-1;padding:.7rem .85rem;border-radius:8px;background:#f7f8fa;color:#6b7280;font-size:.82rem}#contracts-tab .rh-contract-search input:focus,#contracts-tab .rh-contract-filter-panel select:focus{outline:2px solid #c8d3ff;border-color:#7189d9}@media(max-width:900px){#contracts-tab .rh-contract-row{grid-template-columns:repeat(2,minmax(0,1fr))}#contracts-tab .rh-contract-actions{justify-content:flex-end}}@media(max-width:600px){#contracts-tab{padding-bottom:5.5rem}#contracts-tab .rh-contract-head h2{font-size:1.15rem}#contracts-tab .rh-contract-kpis{gap:.45rem}#contracts-tab .rh-contract-kpi{padding:.7rem .55rem;gap:.5rem;align-items:flex-start;flex-direction:column}#contracts-tab .rh-contract-kpi-icon{width:38px;height:38px;flex-basis:38px}#contracts-tab .rh-contract-row{gap:.55rem;padding:.75rem}#contracts-tab .rh-contract-cell strong{font-size:.76rem}#contracts-tab .rh-contract-fab{right:18px;bottom:20px;width:58px;height:58px}}';
        style.textContent += '#contracts-tab .rh-contract-tab{font-family:"Be Vietnam Pro",sans-serif;font-size:.85rem;font-weight:600}';
        style.textContent += '#invoices-tab .rh-invoice-clear,#invoices-tab .rh-invoice-tab{font-family:inherit;font-size:.82rem;font-weight:600}#invoices-tab .rh-invoice-period-chip{position:relative}#invoices-tab .rh-invoice-period-chip input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}';
        document.head.appendChild(style);
    }

    function contractStatusKey(contract, today, expiringDays) {
        var raw = String(contract.status || '').toLowerCase();
        if (['ended', 'terminated', 'liquidated', 'settled', 'closed'].indexOf(raw) !== -1) return 'liquidated';
        if (['deposit', 'deposited', 'forfeited', 'deposit_forfeited'].indexOf(raw) !== -1) return 'deposit';
        if (['moving_out', 'move_out', 'notice_to_move'].indexOf(raw) !== -1 || contract.moveOutDate || contract.moveOutNoticeDate) return 'moving';
        if (contract.endDate && contract.endDate < today) return 'overdue';
        var remaining = contract.endDate ? Math.ceil((new Date(contract.endDate + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) : Infinity;
        if (remaining >= 0 && remaining <= expiringDays) return 'expiring';
        return 'renting';
    }

    function renderContractsTab(filter) {
        var tab = byId('contracts-tab');
        if (!tab) return;
        ensureContractsStyles();
        RHUI.contractFilters = RHUI.contractFilters || { status: 'all', search: '', building: '', searchOpen: false, filtersOpen: false };
        if (filter) RHUI.contractFilters.status = filter === 'expiring' ? 'expiring' : filter;
        var state = RHUI.contractFilters;
        var contracts = scoped('contracts').slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        var today = new Date().toISOString().slice(0, 10);
        var expiringDays = Number((RHD.getSettings() || {}).contractExpiringDays) || 30;
        var categories = { all: contracts, renting: [], current: [], expiring: [], overdue: [], moving: [], liquidated: [], deposit: [] };
        var statusByContract = {};
        contracts.forEach(function (contract) {
            var status = contractStatusKey(contract, today, expiringDays);
            statusByContract[contract.id] = status;
            categories[status].push(contract);
            if (status === 'renting' || status === 'expiring' || status === 'moving') categories.current.push(contract);
        });
        var labels = [
            ['all', 'Tất cả'], ['renting', 'Đang thuê'], ['current', 'Còn hạn'],
            ['expiring', 'Sắp hết hạn'], ['overdue', 'Quá hạn'], ['moving', 'Sắp chuyển đi'],
            ['liquidated', 'Đã thanh lý'], ['deposit', 'Bỏ cọc']
        ];
        var visible = categories[state.status] || contracts;
        if (state.building) visible = visible.filter(function (c) { return c.buildingId === state.building; });
        if (state.search) {
            var term = state.search.toLocaleLowerCase();
            visible = visible.filter(function (c) {
                var customer = RHD.get('customers', c.customerId) || {};
                var apartment = RHD.get('apartments', c.apartmentId) || {};
                var building = RHD.get('buildings', c.buildingId) || {};
                return [c.code, customer.fullName, customer.phone, apartment.name, building.name, building.shortName].join(' ').toLocaleLowerCase().indexOf(term) !== -1;
            });
        }
        var rows = visible.map(function (c) {
            var building = RHD.get('buildings', c.buildingId);
            var apartment = RHD.get('apartments', c.apartmentId);
            var customer = RHD.get('customers', c.customerId);
            var statusLabels = { renting: 'Đang thuê', expiring: 'Sắp hết hạn', overdue: 'Quá hạn', moving: 'Sắp chuyển đi', liquidated: 'Đã thanh lý', deposit: 'Bỏ cọc' };
            var statusColors = { renting: ['#16875d', '#e7f7ef'], expiring: ['#a96a00', '#fff4d8'], overdue: ['#c33e3e', '#ffeded'], moving: ['#3866d9', '#edf2ff'], liquidated: ['#68717f', '#f0f1f3'], deposit: ['#8a5e15', '#fff4d8'] };
            var contractStatus = statusByContract[c.id] || 'renting';
            var tone = statusColors[contractStatus] || statusColors.renting;
            return '<article class="rh-contract-row">' +
                '<div class="rh-contract-cell"><small>MÃ HỢP ĐỒNG</small><strong>' + escapeHtml(c.code || '—') + '</strong></div>' +
                '<div class="rh-contract-cell"><small>CĂN HỘ</small><strong>' + escapeHtml((building ? building.shortName || building.name : '—') + ' / ' + (apartment ? apartment.name : '—')) + '</strong></div>' +
                '<div class="rh-contract-cell"><small>KHÁCH HÀNG</small><strong>' + escapeHtml(customer ? customer.fullName : '—') + '</strong></div>' +
                '<div class="rh-contract-cell"><small>THỜI HẠN</small><strong>' + fmtDate(c.startDate) + ' → ' + fmtDate(c.endDate) + '</strong></div>' +
                '<div class="rh-contract-cell"><small>TIỀN THUÊ</small><strong>' + money(c.rentPrice) + '</strong></div>' +
                '<div class="rh-contract-actions"><span>' + badge(statusLabels[contractStatus] || 'Đang thuê', tone[0], tone[1]) + '</span>' +
                rowButton('contracts.update', "RHUI.openContractForm('" + c.id + "')", 'fa-pen', 'Sửa') +
                rowButton('contracts.delete', "RHUI.deleteContract('" + c.id + "')", 'fa-trash', 'Xoá', true) + '</div></article>';
        }).join('');
        var buildingOptions = '<option value="">Tất cả tòa nhà</option>' + scoped('buildings').map(function (b) { return '<option value="' + escapeHtml(b.id) + '"' + (state.building === b.id ? ' selected' : '') + '>' + escapeHtml(b.name) + '</option>'; }).join('');
        var canAdd = scoped('buildings').length && scoped('apartments').length && scoped('customers').length;
        tab.innerHTML = renderDemoBanner('contracts') +
            '<section class="rh-contracts-module"><div class="rh-contract-head"><h2>Hợp đồng</h2><div class="rh-contract-tools"><button class="rh-contract-icon-btn" type="button" data-contract-search-toggle title="Tìm kiếm" aria-label="Tìm kiếm"><i class="fas fa-search"></i></button><button class="rh-contract-icon-btn" type="button" data-contract-filter-toggle title="Bộ lọc" aria-label="Bộ lọc"><i class="fas fa-sliders"></i></button></div></div>' +
            '<div class="rh-contract-search' + (state.searchOpen ? ' open' : '') + '"><input type="search" data-contract-search placeholder="Tìm mã hợp đồng, khách hàng, căn hộ..." value="' + escapeHtml(state.search) + '"></div>' +
            '<div class="rh-contract-kpis"><div class="rh-contract-kpi"><span class="rh-contract-kpi-icon"><i class="fas fa-file-lines"></i></span><div><strong>' + contracts.length + '</strong><span>Hợp đồng</span></div></div><div class="rh-contract-kpi"><span class="rh-contract-kpi-icon"><i class="fas fa-house"></i></span><div><strong>' + categories.current.length + '</strong><span>Đang thuê</span></div></div><div class="rh-contract-kpi"><span class="rh-contract-kpi-icon"><i class="fas fa-triangle-exclamation"></i></span><div><strong>' + categories.overdue.length + '</strong><span>Quá hạn</span></div></div></div>' +
            '<div class="rh-contract-tabs" role="tablist">' + labels.map(function (item) { return '<button type="button" class="rh-contract-tab' + (state.status === item[0] ? ' active' : '') + '" data-contract-status="' + item[0] + '">' + item[1] + '<b>' + (categories[item[0]] || []).length + '</b></button>'; }).join('') + '</div>' +
            '<div class="rh-contract-filter-panel' + (state.filtersOpen ? ' open' : '') + '"><select aria-label="Lọc theo tòa nhà" data-contract-building>' + buildingOptions + '</select></div>' +
            (visible.length ? '<div class="rh-contract-list">' + rows + '</div>' : '<div class="rh-contract-empty"><i class="fas fa-file-lines"></i><p>' + (contracts.length ? 'Không có hợp đồng phù hợp.' : 'Chưa có hợp đồng nào.') + '</p>' + (!contracts.length && !canAdd ? '<small>Cần tạo tòa nhà, căn hộ và khách hàng trước.</small>' : '') + '</div>') +
            '<button type="button" class="rh-contract-fab" data-contract-add title="Thêm hợp đồng" aria-label="Thêm hợp đồng"' + (canAdd ? '' : ' disabled style="opacity:.55"') + (can('contracts.create') ? '' : ' hidden') + '>+</button></section>';
        var searchInput = tab.querySelector('[data-contract-search]');
        if (searchInput) searchInput.addEventListener('input', function () { state.search = this.value; renderContractsTab(); var next = tab.querySelector('[data-contract-search]'); if (next) { next.focus(); next.setSelectionRange(state.search.length, state.search.length); } });
        tab.querySelector('[data-contract-search-toggle]').addEventListener('click', function () { state.searchOpen = !state.searchOpen; renderContractsTab(); if (state.searchOpen) { var input = tab.querySelector('[data-contract-search]'); if (input) input.focus(); } });
        tab.querySelector('[data-contract-filter-toggle]').addEventListener('click', function () { state.filtersOpen = !state.filtersOpen; renderContractsTab(); });
        tab.querySelectorAll('[data-contract-status]').forEach(function (button) { button.addEventListener('click', function () { state.status = this.getAttribute('data-contract-status'); renderContractsTab(); }); });
        tab.querySelector('[data-contract-building]').addEventListener('change', function () { state.building = this.value; renderContractsTab(); });
        tab.querySelector('[data-contract-add]').addEventListener('click', function () { if (canAdd) RHUI.openContractForm(); else alert('Cần tạo tòa nhà, căn hộ và khách hàng trước khi lập hợp đồng.'); });
    }

    function refreshContractApartmentInfo() {
        var apt = RHD.get('apartments', byId('cfApartmentSel').value);
        if (!apt) return;
        byId('cfRent').value = apt.rentPrice;
        byId('cfDeposit').value = apt.depositPrice;
    }

    function contractServiceRows(building, checkedIds, overrides) {
        var services = (building.services || []).filter(function (s) { return s.feeType !== 'deposit'; });
        return services.map(function (s) {
            var checked = checkedIds.indexOf(s.id) !== -1;
            var price = overrides && overrides[s.id] != null ? overrides[s.id] : s.unitPrice;
            return '<tr>' +
                '<td><input type="checkbox" class="rh-contract-svc" value="' + s.id + '" ' + (checked ? 'checked' : '') + '></td>' +
                '<td>' + escapeHtml(s.name) + '<div style="font-size:.72rem;color:#94a3b8;">' + feeTypeLabel(s.feeType) + ' · ' + calcMethodLabel(s.calcMethod) + '</div></td>' +
                '<td><input type="number" min="0" class="rh-contract-svc-price" data-svc="' + s.id + '" value="' + price + '" style="width:110px;padding:.4rem .5rem;border:1px solid var(--line);border-radius:6px;"></td>' +
                '</tr>';
        }).join('');
    }

    RHUI.openContractForCustomer = function (customerId) {
        if (!guard('contracts.create')) return;
        if (!scoped('buildings').length || !scoped('apartments').length) {
            alert('Cần tạo tòa nhà và căn hộ trước khi lập hợp đồng.');
            return;
        }
        if (typeof global.switchTab === 'function') global.switchTab('contracts');
        RHUI.openContractForm(null, customerId);
    };

    RHUI.openContractForm = function (id, customerId) {
        if (!guard(id ? 'contracts.update' : 'contracts.create')) return;
        var c = id ? RHD.get('contracts', id) : null;
        RHUI.drawerEntity = 'contracts';
        RHUI.drawerId = id || null;
        var buildings = scoped('buildings');
        var customers = scoped('customers');
        var defaultBuildingId = c ? c.buildingId : '';
        if (!c) {
            for (var i = 0; i < buildings.length; i++) {
                if (RHD.apartmentsOf(buildings[i].id).length) { defaultBuildingId = buildings[i].id; break; }
            }
        }
        if (!defaultBuildingId) { alert('Cần tạo tòa nhà trước khi lập hợp đồng.'); return; }
        var apartments = RHD.apartmentsOf(defaultBuildingId);
        var building = RHD.get('buildings', defaultBuildingId);
        if (!building) { alert('Không tìm thấy tòa nhà để lập hợp đồng.'); return; }
        var selectedCustomerId = c ? c.customerId : (customerId || '');
        var checkedIds = c ? (c.serviceIds || []) : building.services.filter(function (s) { return s.feeType !== 'deposit' && s.feeType !== 'rent'; }).map(function (s) { return s.id; });
        var overrides = c ? (c.serviceOverrides || {}) : {};

        var html = '<form onsubmit="RHUI.submitContractForm(event)">' +
            '<div class="rh-grid-2">' +
            '<div class="rh-field"><label>Tòa nhà *</label><select id="cfBuildingSel" required>' + selectOptions(buildings, 'id', 'name', defaultBuildingId) + '</select></div>' +
            '<div class="rh-field"><label>Căn hộ *</label><select id="cfApartmentSel" required>' + selectOptions(apartments, 'id', 'name', c ? c.apartmentId : (apartments[0] && apartments[0].id)) + '</select></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Khách hàng *</label><select id="cfCustomerSel" required>' + selectOptions(customers, 'id', function (cu) { return cu.fullName + ' — ' + cu.phone; }, selectedCustomerId, 'Chọn khách hàng') + '</select><div id="cfCustomerPreview" class="rh-customer-preview"></div></div>' +
            '<div class="rh-field"><label>Mã hợp đồng</label><input id="cfCode" readonly value="' + escapeHtml(c ? c.code : '(tự động khi lưu)') + '" style="background:#f8fafc;color:#61708a;"></div>' +
            '<div class="rh-field"><label>Chu kỳ thanh toán</label><select id="cfCycle">' + selectOptions(RHD.PAYMENT_CYCLES, 'id', 'label', c ? c.paymentCycle : 'monthly') + '</select></div>' +
            '<div class="rh-field"><label>Ngày bắt đầu *</label><input id="cfStart" type="date" required value="' + escapeHtml(c ? c.startDate : '') + '"></div>' +
            '<div class="rh-field"><label>Ngày kết thúc *</label><input id="cfEnd" type="date" required value="' + escapeHtml(c ? c.endDate : '') + '"></div>' +
            '<div class="rh-field"><label>Ngày ký</label><input id="cfSignDate" type="date" value="' + escapeHtml(c ? c.signDate : '') + '"></div>' +
            '<div class="rh-field"><label>Mẫu hợp đồng</label><select id="cfContractTpl">' + selectOptions(RHT.list('CONTRACT'), 'id', 'name', c ? c.contractTemplateId : building.contractTemplateId) + '</select></div>' +
            '<div class="rh-field"><label>Mẫu hóa đơn</label><select id="cfInvoiceTpl">' + selectOptions(RHT.list('INVOICE'), 'id', 'name', c ? c.invoiceTemplateId : building.invoiceTemplateId) + '</select></div>' +
            '<div class="rh-field"><label>Tiền thuê (đ) * <span style="color:#94a3b8;font-weight:400;">— tự động từ căn hộ</span></label><input id="cfRent" type="number" required value="' + (c ? c.rentPrice : '') + '"></div>' +
            '<div class="rh-field"><label>Tiền cọc (đ) * <span style="color:#94a3b8;font-weight:400;">— tự động từ căn hộ</span></label><input id="cfDeposit" type="number" required value="' + (c ? c.depositPrice : '') + '"></div>' +
            '<div class="rh-field"><label>Người giới thiệu</label><input id="cfReferrer" value="' + escapeHtml(c ? c.referrer : '') + '"></div>' +
            '<div class="rh-field"><label>Cộng tác viên tìm khách</label><input id="cfCollaborator" value="' + escapeHtml(c ? c.collaborator : '') + '"></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Ghi chú</label><textarea id="cfNoteField" rows="2">' + escapeHtml(c ? c.note : '') + '</textarea></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Upload ảnh / file hợp đồng</label><input id="cfFile" type="file" accept="image/*,.pdf"><input type="hidden" id="cfFileData" value="' + escapeHtml(c && c.files && c.files[0] ? c.files[0].dataUrl : '') + '"></div>' +
            '</div>' +
            '<div class="rh-section"><div class="rh-section-title">Phí dịch vụ — lấy từ Tòa nhà</div>' +
            '<table style="width:100%;"><thead><tr><th style="width:40px;"></th><th style="text-align:left;">Dịch vụ</th><th style="text-align:left;">Đơn giá (đ)</th></tr></thead>' +
            '<tbody id="cfServiceRows">' + contractServiceRows(building, checkedIds, overrides) + '</tbody></table></div>' +
            '<div id="cfError" style="color:#ef4444;font-size:.85rem;margin-top:1rem;"></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;">' +
            '<button type="submit" class="btn-primary">Lưu hợp đồng</button>' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Huỷ</button>' +
            '</div></form>';

        openDrawer(c ? 'Sửa hợp đồng' : 'Thêm hợp đồng', html);
        function refreshContractCustomerInfo() {
            var customer = RHD.get('customers', byId('cfCustomerSel').value);
            var preview = byId('cfCustomerPreview');
            if (!preview) return;
            preview.textContent = customer ? [customer.fullName, customer.phone, customer.email, customer.idNumber ? 'CCCD ' + customer.idNumber : ''].filter(Boolean).join(' · ') : 'Chọn khách hàng để liên kết hồ sơ và tự điền thông tin liên hệ.';
        }
        byId('cfCustomerSel').addEventListener('change', refreshContractCustomerInfo);
        refreshContractCustomerInfo();
        byId('cfBuildingSel').addEventListener('change', function () {
            var apts = RHD.apartmentsOf(this.value);
            byId('cfApartmentSel').innerHTML = selectOptions(apts, 'id', 'name');
            var b = RHD.get('buildings', this.value);
            byId('cfContractTpl').value = b.contractTemplateId;
            byId('cfInvoiceTpl').value = b.invoiceTemplateId;
            byId('cfServiceRows').innerHTML = contractServiceRows(b, b.services.filter(function (s) { return s.feeType !== 'deposit' && s.feeType !== 'rent'; }).map(function (s) { return s.id; }), {});
            refreshContractApartmentInfo();
        });
        byId('cfApartmentSel').addEventListener('change', refreshContractApartmentInfo);
        byId('cfFile').addEventListener('change', function () { readFileAsDataUrl(this, function (d) { byId('cfFileData').value = d; }); });
        if (!c) refreshContractApartmentInfo();
    };

    RHUI.submitContractForm = function (ev) {
        ev.preventDefault();
        if (!guard(RHUI.drawerId ? 'contracts.update' : 'contracts.create')) return;
        var buildingId = byId('cfBuildingSel').value;
        var apartmentId = byId('cfApartmentSel').value;
        var building = RHD.get('buildings', buildingId);
        var apartment = RHD.get('apartments', apartmentId);
        var serviceIds = Array.prototype.map.call(document.querySelectorAll('.rh-contract-svc:checked'), function (el) { return el.value; });
        var overrides = {};
        document.querySelectorAll('.rh-contract-svc-price').forEach(function (inp) { overrides[inp.dataset.svc] = Number(inp.value) || 0; });

        var data = {
            buildingId: buildingId,
            apartmentId: apartmentId,
            customerId: byId('cfCustomerSel').value,
            startDate: byId('cfStart').value,
            endDate: byId('cfEnd').value,
            signDate: byId('cfSignDate').value,
            contractTemplateId: byId('cfContractTpl').value,
            invoiceTemplateId: byId('cfInvoiceTpl').value,
            rentPrice: Number(byId('cfRent').value) || 0,
            depositPrice: Number(byId('cfDeposit').value) || 0,
            paymentCycle: byId('cfCycle').value,
            referrer: byId('cfReferrer').value.trim(),
            collaborator: byId('cfCollaborator').value.trim(),
            note: byId('cfNoteField').value.trim(),
            files: byId('cfFileData').value ? [{ name: 'hop-dong', dataUrl: byId('cfFileData').value }] : [],
            serviceIds: serviceIds,
            serviceOverrides: overrides,
            status: 'active'
        };
        if (!data.customerId) { byId('cfError').textContent = 'Vui lòng chọn khách hàng.'; return; }

        var res;
        if (RHUI.drawerId) {
            res = RHD.update('contracts', RHUI.drawerId, data);
        } else {
            data.code = RHD.nextContractCode(building, apartment);
            res = RHD.create('contracts', data);
        }
        if (!res.ok) { byId('cfError').textContent = res.error; return; }

        if (!RHUI.drawerId && RHD.getSettings().autoOccupyOnContract && apartment && (apartment.status === 'vacant' || apartment.status === 'deposited')) {
            RHD.update('apartments', apartment.id, { status: 'occupied' });
        }
        if (window.RH && RH.syncManagerRecord) RH.syncManagerRecord(res.item, 'contract');

        closeDrawer();
        renderContractsTab();
        renderApartmentsTab();
        renderDashboardCounts();
    };

    RHUI.deleteContract = function (id) {
        if (!guard('contracts.delete')) return;
        var hasInvoice = RHD.list('invoices').some(function (i) { return i.contractId === id; });
        confirmDelete('contracts', id, function () { renderContractsTab(); renderDashboardCounts(); }, hasInvoice ? 'Không thể xoá: hợp đồng đang gắn với hóa đơn.' : null);
    };

    // ============================================================== INVOICES

    function ensureInvoiceStyles() {
        if (byId('rhInvoiceStyles')) return;
        var style = document.createElement('style');
        style.id = 'rhInvoiceStyles';
        style.textContent = '#invoices-tab .rh-invoices-module{position:relative;color:#172b45}#invoices-tab .rh-invoice-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}#invoices-tab .rh-invoice-head h2{font-size:1.45rem;font-weight:800;color:#10213c}#invoices-tab .rh-invoice-tools{display:flex;gap:.55rem}#invoices-tab .rh-invoice-icon{position:relative;width:40px;height:40px;display:grid;place-items:center;border:1px solid #e0e8f1;border-radius:10px;background:#fff;color:#53677f;cursor:pointer}#invoices-tab .rh-invoice-icon:hover{border-color:#9ccaff;color:#0d65d5;background:#f4f9ff}#invoices-tab .rh-invoice-dot{position:absolute;top:7px;right:7px;width:7px;height:7px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 2px #fff}#invoices-tab .rh-invoice-search{display:none;margin:0 0 .85rem}#invoices-tab .rh-invoice-search.open{display:block}#invoices-tab .rh-invoice-search input{width:min(100%,420px);padding:.7rem .85rem;border:1px solid #dbe4ef;border-radius:8px;font:inherit}#invoices-tab .rh-invoice-period{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:1rem;padding:.8rem 1rem;border:1px solid #e3eaf2;border-radius:10px;background:#fff}#invoices-tab .rh-invoice-period>span{font-size:.82rem;font-weight:700;color:#718096}#invoices-tab .rh-invoice-period-chip{display:inline-flex;align-items:center;gap:.45rem;padding:.45rem .7rem;border:1px solid #ccebdc;border-radius:7px;background:#f1fbf5;color:#18845c;font-size:.82rem;font-weight:700}#invoices-tab .rh-invoice-period-chip input{width:110px;border:0;background:transparent;color:#176d50;font:inherit;outline:0}#invoices-tab .rh-invoice-clear{margin-left:auto;border:0;background:none;color:#d54444;font:600 .82rem inherit;cursor:pointer}#invoices-tab .rh-invoice-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-bottom:1rem}#invoices-tab .rh-invoice-stat{min-width:0;padding:1rem;border:1px solid #e3eaf2;border-radius:10px;background:#fff}#invoices-tab .rh-invoice-stat small{display:block;color:#718096;font-size:.76rem;font-weight:700}#invoices-tab .rh-invoice-stat strong{display:block;margin-top:.55rem;font-size:1.25rem;line-height:1.3;color:#176fd1;overflow-wrap:anywhere}#invoices-tab .rh-invoice-stat.collected strong{color:#16875d}#invoices-tab .rh-invoice-stat.debt strong{color:#d54444}#invoices-tab .rh-invoice-progress{height:6px;margin-top:.7rem;overflow:hidden;border-radius:99px;background:#edf1f5}#invoices-tab .rh-invoice-progress span{display:block;height:100%;border-radius:inherit;background:#18a878;transition:width .2s}#invoices-tab .rh-invoice-rate{display:flex;justify-content:space-between;gap:.5rem;margin-top:.5rem;color:#718096;font-size:.72rem}#invoices-tab .rh-invoice-tabs{display:flex;gap:.4rem;overflow:auto;margin-bottom:.85rem;padding-bottom:.1rem}#invoices-tab .rh-invoice-tab{display:inline-flex;align-items:center;gap:.5rem;white-space:nowrap;padding:.58rem .8rem;border:1px solid #e0e8f1;border-radius:8px;background:#fff;color:#5c6b7d;font:600 .82rem inherit;cursor:pointer}#invoices-tab .rh-invoice-tab b{font-size:.72rem;color:#8090a2}#invoices-tab .rh-invoice-tab.active{border-color:#17212e;background:#17212e;color:#fff}#invoices-tab .rh-invoice-tab.active b{color:#d6dee8}#invoices-tab .rh-invoice-filter-panel{display:none;gap:.6rem;margin-bottom:.85rem;padding:.75rem;border:1px solid #e3eaf2;border-radius:8px;background:#fff}#invoices-tab .rh-invoice-filter-panel.open{display:flex}#invoices-tab .rh-invoice-filter-panel select{max-width:100%;padding:.55rem .7rem;border:1px solid #dbe4ef;border-radius:7px;background:#fff;font:inherit;color:#44566c}#invoices-tab .rh-invoice-table-wrap{overflow-x:auto;border:1px solid #e3eaf2;border-radius:9px;background:#fff}#invoices-tab .rh-invoice-table{width:100%;border-collapse:collapse;min-width:760px;text-align:left}#invoices-tab .rh-invoice-table th{padding:.7rem .8rem;background:#f3f7fb;color:#718096;font-size:.69rem;letter-spacing:.04em;text-transform:uppercase}#invoices-tab .rh-invoice-table td{padding:.7rem .8rem;border-top:1px solid #edf1f5;font-size:.8rem}#invoices-tab .rh-invoice-actions{display:flex;justify-content:flex-end;gap:.3rem;white-space:nowrap}#invoices-tab .rh-invoice-actions button{width:30px;height:30px;border:1px solid #e0e8f1;border-radius:6px;background:#fff;color:#53708e;cursor:pointer}#invoices-tab .rh-invoice-actions button:hover{color:#0d65d5;background:#f4f9ff}#invoices-tab .rh-invoice-actions button.danger{color:#dc4b4b}#invoices-tab .rh-invoice-empty{padding:2.5rem 1rem;text-align:center;color:#718096}#invoices-tab .rh-invoice-empty i{display:block;margin-bottom:.65rem;color:#9aabba;font-size:1.5rem}#invoices-tab .rh-invoice-fab{position:fixed;right:30px;bottom:28px;z-index:30;width:56px;height:56px;border:0;border-radius:50%;background:#18a878;color:#fff;font-size:1.7rem;line-height:1;box-shadow:0 8px 22px rgba(24,168,120,.28);cursor:pointer}#invoices-tab .rh-invoice-fab:hover{background:#11845d;transform:translateY(-2px)}#invoices-tab .rh-invoice-fab:disabled{opacity:.55;cursor:not-allowed}@media(max-width:850px){#invoices-tab .rh-invoice-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){#invoices-tab .rh-invoice-head{align-items:flex-start}#invoices-tab .rh-invoice-head h2{font-size:1.25rem}#invoices-tab .rh-invoice-period{align-items:flex-start}#invoices-tab .rh-invoice-clear{margin-left:0}#invoices-tab .rh-invoice-summary{gap:.5rem}#invoices-tab .rh-invoice-stat{padding:.75rem}#invoices-tab .rh-invoice-stat strong{font-size:1rem}#invoices-tab .rh-invoice-fab{right:18px;bottom:18px;width:52px;height:52px}';
        document.head.appendChild(style);
    }

    function renderInvoicesTab(filter) {
        var tab = byId('invoices-tab');
        if (!tab) return;
        ensureInvoiceStyles();
        RHD.markOverdueInvoices();
        var state = RHUI.invoiceFilters || (RHUI.invoiceFilters = {
            status: 'all', period: new Date().toISOString().slice(0, 7), search: '', building: '', searchOpen: false, filtersOpen: false, overdueOnly: false
        });
        if (filter === 'unpaid' || filter === 'overdue') {
            state.status = 'debt';
            state.overdueOnly = filter === 'overdue';
        }
        var contracts = scoped('contracts');
        var todayStr = new Date().toISOString().slice(0, 10);
        var allInvoices = scoped('invoices').slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        var invoiceMonth = function (inv) {
            if (inv.period) return inv.period;
            if (inv.issueDate) return inv.issueDate.slice(0, 7);
            return new Date(inv.createdAt || Date.now()).toISOString().slice(0, 7);
        };
        var baseInvoices = allInvoices.filter(function (inv) {
            if (state.period && invoiceMonth(inv) !== state.period) return false;
            if (state.building && inv.buildingId !== state.building) return false;
            if (state.search) {
                var apt = RHD.get('apartments', inv.apartmentId) || {};
                var customer = RHD.get('customers', inv.customerId) || {};
                var term = state.search.toLocaleLowerCase();
                if ([inv.code, apt.name, customer.fullName, customer.phone, inv.period].join(' ').toLocaleLowerCase().indexOf(term) === -1) return false;
            }
            return true;
        });
        // Money figures only count ISSUED invoices; drafts / approved / cancelled never do.
        var issuedInvoices = baseInvoices.filter(RHD.isIssuedInvoice);
        var reviewInvoices = baseInvoices.filter(function (inv) { return inv.status === 'draft' || inv.status === 'approved'; });
        var debtInvoices = issuedInvoices.filter(function (inv) { return inv.status !== 'paid'; });
        var paidInvoices = issuedInvoices.filter(function (inv) { return inv.status === 'paid'; });
        var cancelledInvoices = baseInvoices.filter(function (inv) { return inv.status === 'cancelled'; });
        var activeInvoices = baseInvoices.filter(function (inv) { return inv.status !== 'cancelled'; });
        var visibleInvoices = { review: reviewInvoices, debt: debtInvoices, paid: paidInvoices, cancelled: cancelledInvoices }[state.status] || activeInvoices;
        if (state.overdueOnly) visibleInvoices = visibleInvoices.filter(function (inv) { return inv.status === 'overdue' || (RHD.isIssuedInvoice(inv) && inv.status !== 'paid' && inv.dueDate && inv.dueDate < todayStr); });
        var sumTotal = function (items) { return items.reduce(function (sum, inv) { return sum + (Number(inv.total) || 0); }, 0); };
        var issuedVisible = visibleInvoices.filter(RHD.isIssuedInvoice);
        var billed = sumTotal(issuedVisible);
        var collected = sumTotal(issuedVisible.filter(function (inv) { return inv.status === 'paid'; }));
        var debt = sumTotal(issuedVisible.filter(function (inv) { return inv.status !== 'paid'; }));
        var collectionRate = billed ? Math.round(collected * 100 / billed) : 0;
        var monthLabel = state.period ? state.period.slice(5, 7) + '-' + state.period.slice(0, 4) : 'Tất cả kỳ';
        var rows = visibleInvoices.map(function (inv) {
            var apt = RHD.get('apartments', inv.apartmentId);
            var cus = RHD.get('customers', inv.customerId);
            var st = statusMeta(RHD.INVOICE_STATUSES, inv.status);
            var issues = (inv.issues || []).length;
            var typeLabel = RHB.typeMeta(RHB.invoiceType(inv)).label;
            return '<tr class="rh-click-row" onclick="if(!event.target.closest(\'button,input\'))RHUI.previewInvoice(\'' + inv.id + '\')">' +
                '<td><input type="checkbox" class="rh-invoice-check" value="' + escapeHtml(inv.id) + '" aria-label="Chọn hóa đơn ' + escapeHtml(inv.code) + '"></td>' +
                '<td><strong>' + escapeHtml(inv.code) + '</strong><div class="if-chips">' +
                (RHB.invoiceType(inv) !== 'monthly' ? '<span>' + escapeHtml(typeLabel) + '</span>' : '') +
                (inv.source === 'auto' ? '<span class="auto"><i class="fas fa-robot"></i> Tự động</span>' : '') + '</div></td>' +
                '<td>' + escapeHtml(apt ? apt.name : '—') + '</td>' +
                '<td>' + escapeHtml(cus ? cus.fullName : '—') + '</td>' +
                '<td>' + escapeHtml(invoiceMonth(inv)) + '</td>' +
                '<td><strong>' + money(inv.total) + '</strong></td>' +
                '<td>' + badge(st.label, st.color, st.bg) +
                (issues ? '<div class="if-chips"><span class="warn" title="' + escapeHtml((inv.issues || []).join('; ')) + '"><i class="fas fa-triangle-exclamation"></i> Cần kiểm tra</span></div>' : '') + '</td>' +
                '<td><div class="rh-invoice-actions">' +
                '<button onclick="RHUI.previewInvoice(\'' + inv.id + '\')" title="Xem trước" aria-label="Xem trước"><i class="fas fa-eye"></i></button>' +
                invoiceActionButtons(inv) +
                '</div></td></tr>';
        }).join('');
        var buildingOptions = '<option value="">Tất cả tòa nhà</option>' + scoped('buildings').map(function (building) {
            return '<option value="' + escapeHtml(building.id) + '"' + (state.building === building.id ? ' selected' : '') + '>' + escapeHtml(building.name) + '</option>';
        }).join('');
        var canAdd = contracts.length > 0 && !demoLimitReached('invoices');
        var periodValue = state.period;
        var emptyMessage = allInvoices.length ? 'Không có hóa đơn phù hợp bộ lọc.' : (contracts.length ? 'Chưa có hóa đơn nào.' : 'Cần có Hợp đồng trước khi lập hóa đơn.');

        tab.innerHTML = renderDemoBanner('invoices') + '<section class="rh-invoices-module">' +
            '<div class="rh-invoice-head"><h2>Hoá đơn</h2><div class="rh-invoice-tools">' +
            '<button type="button" class="rh-invoice-icon" data-invoice-search-toggle title="Tìm kiếm" aria-label="Tìm kiếm"><i class="fas fa-search"></i></button>' +
            (can('invoices.create') ? '<button type="button" class="rh-invoice-icon" onclick="RHUI.runAutoBilling()" title="Lập hóa đơn tự động cho các kỳ đến hạn' + (RHB.lastRun().lastRunAt ? ' — lần chạy gần nhất ' + new Date(RHB.lastRun().lastRunAt).toLocaleString('vi-VN') : '') + '" aria-label="Lập hóa đơn tự động"><i class="fas fa-wand-magic-sparkles"></i></button>' : '') +
            (can('invoices.send') ? '<button type="button" class="rh-invoice-icon" onclick="RHUI.sendSelectedInvoices()" title="Gửi hàng loạt" aria-label="Gửi hàng loạt"><i class="fas fa-file-export"></i></button>' +
            '<button type="button" class="rh-invoice-icon" onclick="RHUI.sendSelectedInvoices()" title="Gửi thông báo" aria-label="Gửi thông báo"><i class="fas fa-paper-plane"></i></button>' : '') +
            '<button type="button" class="rh-invoice-icon" data-invoice-filter-toggle title="Bộ lọc nâng cao" aria-label="Bộ lọc nâng cao"><i class="fas fa-sliders"></i><span class="rh-invoice-dot"></span></button>' +
            '</div></div>' +
            '<div class="rh-invoice-search' + (state.searchOpen ? ' open' : '') + '"><input type="search" data-invoice-search placeholder="Tìm mã hóa đơn, căn hộ, khách hàng..." value="' + escapeHtml(state.search) + '"></div>' +
            '<div class="rh-invoice-period"><span>Đang lọc theo:</span><label class="rh-invoice-period-chip"><i class="fas fa-circle-check"></i><span>Tháng: ' + escapeHtml(monthLabel) + '</span><input type="month" data-invoice-period aria-label="Chọn kỳ hóa đơn" value="' + escapeHtml(periodValue) + '"></label><button type="button" class="rh-invoice-clear" data-invoice-clear>Xóa lọc</button></div>' +
            '<div class="rh-invoice-summary">' +
            '<div class="rh-invoice-stat"><small>Phát sinh kỳ này</small><strong>' + money(billed) + '</strong></div>' +
            '<div class="rh-invoice-stat collected"><small>Đã thu</small><strong>' + money(collected) + '</strong></div>' +
            '<div class="rh-invoice-stat debt"><small>Cần thu + nợ</small><strong>' + money(debt) + '</strong></div>' +
            '<div class="rh-invoice-stat"><small>Tỷ lệ đã thu</small><strong>' + collectionRate + '%</strong><div class="rh-invoice-progress"><span style="width:' + collectionRate + '%"></span></div><div class="rh-invoice-rate"><span>' + paidInvoices.length + ' đã thanh toán</span><span>' + visibleInvoices.length + ' hóa đơn</span></div></div>' +
            '</div>' +
            '<div class="rh-invoice-tabs" role="tablist" aria-label="Lọc trạng thái hóa đơn">' +
            '<button type="button" class="rh-invoice-tab' + (state.status === 'all' ? ' active' : '') + '" data-invoice-status="all">Tất cả <b>' + activeInvoices.length + '</b></button>' +
            '<button type="button" class="rh-invoice-tab' + (state.status === 'review' ? ' active' : '') + '" data-invoice-status="review">Chờ duyệt <b>' + reviewInvoices.length + '</b></button>' +
            '<button type="button" class="rh-invoice-tab' + (state.status === 'debt' ? ' active' : '') + '" data-invoice-status="debt">Còn nợ <b>' + debtInvoices.length + '</b></button>' +
            '<button type="button" class="rh-invoice-tab' + (state.status === 'paid' ? ' active' : '') + '" data-invoice-status="paid">Đã tt <b>' + paidInvoices.length + '</b></button>' +
            '<button type="button" class="rh-invoice-tab' + (state.status === 'cancelled' ? ' active' : '') + '" data-invoice-status="cancelled">Đã hủy <b>' + cancelledInvoices.length + '</b></button>' +
            '</div>' +
            '<div class="rh-invoice-filter-panel' + (state.filtersOpen ? ' open' : '') + '"><select data-invoice-building aria-label="Lọc theo tòa nhà">' + buildingOptions + '</select></div>' +
            (visibleInvoices.length ? '<div class="rh-invoice-table-wrap"><table class="rh-invoice-table"><thead><tr><th></th><th>Mã hóa đơn</th><th>Căn hộ</th><th>Khách hàng</th><th>Kỳ</th><th>Thành tiền</th><th>Trạng thái</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="rh-invoice-empty"><i class="fas fa-receipt"></i><p>' + emptyMessage + '</p></div>') +
            '<button type="button" class="rh-invoice-fab" data-invoice-add title="Thêm hóa đơn" aria-label="Thêm hóa đơn"' + (canAdd ? '' : ' disabled') + (can('invoices.create') ? '' : ' hidden') + '>+</button></section>';

        tab.querySelector('[data-invoice-search-toggle]').addEventListener('click', function () {
            state.searchOpen = !state.searchOpen;
            renderInvoicesTab();
            if (state.searchOpen) { var input = tab.querySelector('[data-invoice-search]'); if (input) input.focus(); }
        });
        var searchInput = tab.querySelector('[data-invoice-search]');
        if (searchInput) searchInput.addEventListener('input', function () {
            state.search = this.value;
            var cursor = this.selectionStart;
            renderInvoicesTab();
            var next = tab.querySelector('[data-invoice-search]');
            if (next) { next.focus(); next.setSelectionRange(cursor, cursor); }
        });
        tab.querySelector('[data-invoice-filter-toggle]').addEventListener('click', function () { state.filtersOpen = !state.filtersOpen; renderInvoicesTab(); });
        tab.querySelector('[data-invoice-period]').addEventListener('change', function () { state.period = this.value; state.overdueOnly = false; renderInvoicesTab(); });
        tab.querySelector('[data-invoice-clear]').addEventListener('click', function () {
            state.status = 'all'; state.period = ''; state.search = ''; state.building = ''; state.overdueOnly = false;
            renderInvoicesTab();
        });
        tab.querySelector('[data-invoice-building]').addEventListener('change', function () { state.building = this.value; renderInvoicesTab(); });
        tab.querySelectorAll('[data-invoice-status]').forEach(function (button) {
            button.addEventListener('click', function () { state.status = this.getAttribute('data-invoice-status'); state.overdueOnly = false; renderInvoicesTab(); });
        });
        tab.querySelector('[data-invoice-add]').addEventListener('click', function () {
            if (canAdd) RHUI.openInvoiceForm();
            else alert(contracts.length ? 'Đã đạt giới hạn hóa đơn của bản Demo.' : 'Cần có Hợp đồng trước khi lập hóa đơn.');
        });
    }

    function invoiceContractLabel(c) {
        var apt = RHD.get('apartments', c.apartmentId);
        var cus = RHD.get('customers', c.customerId);
        return c.code + ' — ' + (apt ? apt.name : '?') + ' — ' + (cus ? cus.fullName : '?');
    }

    function actorName() {
        var u = global.RHP && global.RHP.currentUser();
        return (u && u.name) || (global.RH_SESSION && global.RH_SESSION.name) || 'Quản lý';
    }

    // ------------------------------------------------- invoice form (draft editor)
    // One form for every invoice type and both sources (auto drafts are edited
    // here too). Lines come from RHB.prefill/computeMonthly and stay editable
    // until the invoice is issued; RHB.normalizeLines recomputes amounts/issues.

    var invoiceDraft = { id: null, lines: [], source: 'manual' };

    function invoiceLineRowHtml(l, idx) {
        var num = function (field, value, step) {
            return '<input type="number" step="' + (step || 'any') + '" value="' + escapeHtml(value) + '" data-line="' + idx + '" data-field="' + field + '">';
        };
        return '<tr class="' + (l.missing ? 'if-line-missing' : '') + '">' +
            '<td><input type="text" value="' + escapeHtml(l.label) + '" data-line="' + idx + '" data-field="label" aria-label="Khoản mục">' +
            (l.missing ? '<div class="if-line-warn"><i class="fas fa-triangle-exclamation"></i> Thiếu dữ liệu — nhập số tiền hoặc duyệt chỉ số rồi bấm "Tính lại"</div>' : '') + '</td>' +
            '<td>' + num('qty', l.qty) + '</td>' +
            '<td>' + num('unitPrice', l.unitPrice, 1) + '</td>' +
            '<td>' + num('taxRate', l.taxRate || 0, 'any') + '</td>' +
            '<td class="if-line-amount" data-amount="' + idx + '">' + money((Number(l.amount) || 0) + (Number(l.tax) || 0)) + '</td>' +
            '<td><button type="button" class="rh-row-btn danger" title="Xóa dòng" onclick="RHUI.removeInvoiceLine(' + idx + ')"><i class="fas fa-trash"></i></button></td></tr>';
    }

    function renderInvoiceLines() {
        var body = byId('ifLines');
        if (!body) return;
        body.innerHTML = invoiceDraft.lines.map(invoiceLineRowHtml).join('') ||
            '<tr><td colspan="6" style="color:#94a3b8;text-align:center;padding:1rem;">Chưa có khoản phí nào.</td></tr>';
        refreshInvoiceTotals();
    }

    function refreshInvoiceTotals() {
        var norm = RHB.normalizeLines(invoiceDraft.lines);
        norm.items.forEach(function (it, i) {
            var cell = document.querySelector('[data-amount="' + i + '"]');
            if (cell) cell.textContent = money(it.amount + it.tax);
        });
        byId('ifSubtotal').textContent = money(norm.subtotal);
        byId('ifTax').textContent = money(norm.tax);
        byId('ifTotal').textContent = money(norm.total);
        var box = byId('ifIssues');
        box.style.display = norm.issues.length ? '' : 'none';
        box.innerHTML = '<i class="fas fa-triangle-exclamation"></i> <strong>Cần kiểm tra trước khi duyệt:</strong><ul>' + norm.issues.map(function (s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('') + '</ul>';
    }

    function formContract() { return RHD.get('contracts', byId('ifContract').value); }

    // Replaces the lines with the data-derived defaults of the chosen type.
    function prefillInvoiceLines() {
        var c = formContract();
        var calc = RHB.prefill(byId('ifType').value, c, byId('ifPeriod').value);
        invoiceDraft.lines = (calc.items || []).map(function (it) { return Object.assign({}, it); });
        renderInvoiceLines();
        var info = byId('ifPrefillNote');
        if (info) info.textContent = (calc.issues && calc.issues.length && !calc.items.length) ? calc.issues[0] : '';
    }

    function refreshInvoiceHeader(resetTemplate) {
        var c = formContract();
        var building = c ? RHD.get('buildings', c.buildingId) : null;
        var apt = c ? RHD.get('apartments', c.apartmentId) : null;
        var cus = c ? RHD.get('customers', c.customerId) : null;
        byId('ifBuildingLabel').textContent = building ? building.name : '—';
        byId('ifApartmentLabel').textContent = apt ? apt.name : '—';
        byId('ifCustomerLabel').textContent = cus ? cus.fullName + (cus.phone ? ' · ' + cus.phone : '') : '—';
        byId('ifCycleLabel').textContent = c ? statusMeta(RHD.PAYMENT_CYCLES, c.paymentCycle || 'monthly').label : '—';
        if (resetTemplate) byId('ifTemplate').value = RHB.templateFor(byId('ifType').value, c, building);
        byId('ifRecalc').style.display = byId('ifType').value === 'monthly' ? '' : 'none';
        byId('ifPeriodField').style.opacity = byId('ifType').value === 'monthly' ? '1' : '.75';
    }

    RHUI.openInvoiceForm = function (id) {
        if (!guard(id ? 'invoices.update' : 'invoices.create')) return;
        var inv = id ? RHD.get('invoices', id) : null;
        if (id && !inv) return;
        if (inv && !RHB.isEditable(inv)) {
            alert('Hóa đơn đã phát hành không được sửa trực tiếp. Hãy dùng "Điều chỉnh" (lập hóa đơn điều chỉnh) hoặc "Hủy hóa đơn".');
            return;
        }
        var contracts = scoped('contracts');
        if (!contracts.length) { alert('Cần có Hợp đồng trước khi lập hóa đơn.'); return; }
        RHUI.drawerEntity = 'invoices';
        RHUI.drawerId = id || null;
        invoiceDraft = { id: id || null, lines: inv ? (inv.items || []).map(function (it) { return Object.assign({ taxRate: it.amount ? Math.round((Number(it.tax) || 0) * 10000 / it.amount) / 100 : 0 }, it); }) : [], source: inv ? inv.source || 'manual' : 'manual' };
        var today = RHB.today();
        var type = inv ? RHB.invoiceType(inv) : 'monthly';
        var defaultContract = inv ? inv.contractId : contracts[0].id;
        var types = RHB.INVOICE_TYPES.filter(function (t) { return t.id !== 'adjustment' || type === 'adjustment'; });
        var adjusts = inv && inv.adjustsInvoiceId ? RHD.get('invoices', inv.adjustsInvoiceId) : null;

        var html = '<form onsubmit="RHUI.submitInvoiceForm(event)" novalidate>' +
            (inv && inv.source === 'auto' ? '<div class="pm-note"><i class="fas fa-robot"></i> Hóa đơn được hệ thống tự lập ngày ' + fmtDate(inv.issueDate) + (inv.catchUp ? ' (chạy bù)' : '') + '. Kiểm tra, chỉnh sửa nếu cần rồi duyệt.</div>' : '') +
            (adjusts ? '<div class="pm-note"><i class="fas fa-link"></i> Điều chỉnh cho hóa đơn <strong>' + escapeHtml(adjusts.code) + '</strong> (' + money(adjusts.total) + '). Nhập số tiền chênh lệch: dương = thu thêm, âm = giảm trừ.</div>' : '') +
            '<div class="rh-grid-2">' +
            '<div class="rh-field"><label>Loại hóa đơn *</label><select id="ifType"' + (type === 'adjustment' ? ' disabled' : '') + '>' + selectOptions(types, 'id', 'label', type) + '</select></div>' +
            '<div class="rh-field"><label>Hợp đồng *</label><select id="ifContract"' + (adjusts ? ' disabled' : '') + '>' + selectOptions(contracts, 'id', invoiceContractLabel, defaultContract) + '</select></div>' +
            '<div class="rh-field" id="ifPeriodField"><label>Kỳ hóa đơn</label><input id="ifPeriod" type="month" value="' + escapeHtml(inv ? inv.period : today.slice(0, 7)) + '"></div>' +
            '<div class="rh-field"><label>Mẫu hóa đơn</label><select id="ifTemplate">' + selectOptions(RHT.list('INVOICE'), 'id', 'name', inv ? inv.invoiceTemplateId : '') + '</select></div>' +
            '<div class="rh-field"><label>Ngày lập hóa đơn</label><input id="ifIssueDate" type="date" value="' + escapeHtml(inv ? inv.issueDate : today) + '"></div>' +
            '<div class="rh-field"><label>Hạn thanh toán</label><input id="ifDueDate" type="date" value="' + escapeHtml(inv ? inv.dueDate : '') + '"></div>' +
            '</div>' +
            '<div class="rh-section"><div class="rh-section-title">Thông tin chung (từ hợp đồng)</div><div class="rh-grid-2">' +
            '<div><label style="font-size:.8rem;color:#94a3b8;">Tòa nhà</label><div id="ifBuildingLabel" style="font-weight:600;">—</div></div>' +
            '<div><label style="font-size:.8rem;color:#94a3b8;">Căn hộ</label><div id="ifApartmentLabel" style="font-weight:600;">—</div></div>' +
            '<div><label style="font-size:.8rem;color:#94a3b8;">Khách hàng</label><div id="ifCustomerLabel" style="font-weight:600;">—</div></div>' +
            '<div><label style="font-size:.8rem;color:#94a3b8;">Chu kỳ thanh toán</label><div id="ifCycleLabel" style="font-weight:600;">—</div></div>' +
            '</div></div>' +
            '<div class="rh-section"><div class="rh-section-title" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;">Khoản phí' +
            '<span style="display:flex;gap:.75rem;"><button type="button" class="rh-link-btn" id="ifRecalc"><i class="fas fa-rotate"></i> Tính lại từ dữ liệu</button>' +
            '<button type="button" class="rh-link-btn" onclick="RHUI.addInvoiceLine()"><i class="fas fa-plus"></i> Thêm khoản</button></span></div>' +
            '<div id="ifPrefillNote" style="color:#a5680c;font-size:.82rem;margin-bottom:.4rem;"></div>' +
            '<div class="table-container if-lines"><table><thead><tr><th>Khoản mục</th><th style="width:80px;">SL</th><th style="width:120px;">Đơn giá</th><th style="width:80px;">Thuế %</th><th style="width:120px;text-align:right;">Thành tiền</th><th style="width:44px;"></th></tr></thead><tbody id="ifLines"></tbody></table></div>' +
            '<div id="ifIssues" class="if-issues" style="display:none;"></div>' +
            '<div style="text-align:right;margin-top:.75rem;font-size:.9rem;color:#475569;">Tổng tiền: <strong id="ifSubtotal">0đ</strong> · Thuế: <strong id="ifTax">0đ</strong></div>' +
            '<div style="text-align:right;font-size:1.1rem;color:#10213c;margin-top:.25rem;">Thành tiền: <strong id="ifTotal" style="color:#0d65d5;">0đ</strong></div></div>' +
            '<div class="rh-field" style="margin-top:1rem;"><label>Ghi chú</label><textarea id="ifNote" rows="2" maxlength="500">' + escapeHtml(inv ? inv.note || '' : '') + '</textarea></div>' +
            '<p style="color:#94a3b8;font-size:.78rem;margin-top:.75rem;"><i class="fas fa-circle-info"></i> Lưu là <strong>Bản nháp</strong>: cư dân chưa thấy hóa đơn cho đến khi được duyệt và phát hành.</p>' +
            '<div id="ifError" style="color:#ef4444;font-size:.85rem;margin-top:.75rem;"></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1rem;flex-wrap:wrap;justify-content:flex-end;">' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Hủy bỏ</button>' +
            '<button type="submit" class="btn-primary" style="background:#fff;color:#0d65d5;border:1px solid #9ccaff;box-shadow:none;">Lưu nháp</button>' +
            (can('invoices.approve') ? '<button type="button" class="btn-primary" onclick="RHUI.submitInvoiceForm(event, true)"><i class="fas fa-check"></i> Lưu &amp; duyệt</button>' : '') +
            '</div></form>';

        openDrawer(inv ? 'Sửa hóa đơn ' + inv.code : 'Thêm hóa đơn', html, { width: 820 });
        refreshInvoiceHeader(!inv);
        if (inv) renderInvoiceLines(); else prefillInvoiceLines();
        if (!inv) {
            var c = formContract();
            byId('ifDueDate').value = RHB.dueDateFor(c ? RHD.get('buildings', c.buildingId) : null, byId('ifIssueDate').value);
        }
        var onSourceChange = function () {
            refreshInvoiceHeader(true);
            if (!invoiceDraft.id) prefillInvoiceLines();
        };
        byId('ifType').addEventListener('change', onSourceChange);
        byId('ifContract').addEventListener('change', onSourceChange);
        byId('ifPeriod').addEventListener('change', function () { if (!invoiceDraft.id && byId('ifType').value === 'monthly') prefillInvoiceLines(); });
        byId('ifIssueDate').addEventListener('change', function () {
            var c = formContract();
            byId('ifDueDate').value = RHB.dueDateFor(c ? RHD.get('buildings', c.buildingId) : null, this.value);
        });
        byId('ifRecalc').addEventListener('click', function () {
            if (invoiceDraft.lines.length && !confirm('Tính lại sẽ thay toàn bộ khoản phí bằng dữ liệu hiện tại (giá thuê, dịch vụ, chỉ số đã duyệt). Tiếp tục?')) return;
            prefillInvoiceLines();
        });
        byId('ifLines').addEventListener('input', function (ev) {
            var el = ev.target;
            var idx = Number(el.getAttribute('data-line'));
            var field = el.getAttribute('data-field');
            if (!field || !invoiceDraft.lines[idx]) return;
            invoiceDraft.lines[idx][field] = field === 'label' ? el.value : el.value === '' ? 0 : Number(el.value);
            refreshInvoiceTotals();
        });
    };

    RHUI.addInvoiceLine = function () {
        invoiceDraft.lines.push({ serviceId: 'custom', kind: 'custom', label: 'Khoản phí khác', qty: 1, unitPrice: 0, taxRate: 0, amount: 0, tax: 0 });
        renderInvoiceLines();
    };
    RHUI.removeInvoiceLine = function (idx) { invoiceDraft.lines.splice(idx, 1); renderInvoiceLines(); };

    RHUI.submitInvoiceForm = function (ev, andApprove) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (!guard(RHUI.drawerId ? 'invoices.update' : 'invoices.create')) return;
        if (andApprove && !guard('invoices.approve')) return;
        var err = byId('ifError');
        var before = RHUI.drawerId ? RHD.get('invoices', RHUI.drawerId) : null;
        if (before && !RHB.isEditable(before)) { err.textContent = 'Hóa đơn đã phát hành, không thể sửa.'; return; }
        var contract = formContract();
        if (!contract) { err.textContent = 'Vui lòng chọn hợp đồng.'; return; }
        var type = byId('ifType').value;
        var period = byId('ifPeriod').value;
        var issueDate = byId('ifIssueDate').value;
        var dueDate = byId('ifDueDate').value;
        if (!period) { err.textContent = 'Vui lòng chọn kỳ hóa đơn.'; return; }
        if (!issueDate || !dueDate) { err.textContent = 'Vui lòng nhập ngày lập và hạn thanh toán.'; return; }
        if (dueDate < issueDate) { err.textContent = 'Hạn thanh toán phải sau hoặc bằng ngày lập hóa đơn.'; return; }
        if (!invoiceDraft.lines.length) { err.textContent = 'Hóa đơn cần ít nhất một khoản phí.'; return; }
        if (type === 'monthly') {
            var dup = RHB.sameMonthlyInvoice(contract.id, period, RHUI.drawerId);
            if (dup) { err.textContent = 'Kỳ ' + RHB.periodLabel(period) + ' của hợp đồng này đã có hóa đơn định kỳ ' + dup.code + ' (' + statusMeta(RHD.INVOICE_STATUSES, dup.status).label + '). Không lập trùng kỳ.'; return; }
        }
        var norm = RHB.normalizeLines(invoiceDraft.lines);
        var data = {
            type: type, contractId: contract.id, buildingId: contract.buildingId, apartmentId: contract.apartmentId, customerId: contract.customerId,
            invoiceTemplateId: byId('ifTemplate').value, period: period, issueDate: issueDate, dueDate: dueDate,
            note: byId('ifNote').value.trim(),
            items: norm.items, subtotal: norm.subtotal, tax: norm.tax, total: norm.total, issues: norm.issues,
            // Any edit sends an approved invoice back for review.
            status: 'draft', approvedAt: null, approvedBy: '', updatedAt: Date.now()
        };
        var res;
        if (before) {
            data.history = RHB.history(before, 'edited', actorName());
            res = RHD.update('invoices', before.id, data);
        } else {
            data.code = RHD.nextInvoiceCode();
            data.source = 'manual';
            data.history = RHB.history(null, 'created', actorName());
            res = RHD.create('invoices', data);
        }
        if (!res.ok) { err.textContent = res.error; return; }
        if (andApprove) {
            var ap = RHB.approve(res.item.id, actorName());
            if (!ap.ok) { RHUI.drawerId = res.item.id; err.textContent = 'Đã lưu nháp nhưng chưa duyệt được: ' + ap.error; renderInvoicesTab(); return; }
        }
        closeDrawer();
        renderInvoicesTab();
        renderDashboardCounts();
    };

    // Drafts / approved invoices can be deleted; issued ones are cancelled instead.
    RHUI.deleteInvoice = function (id) {
        if (!guard('invoices.delete')) return;
        var inv = RHD.get('invoices', id);
        if (inv && !RHB.isEditable(inv)) { alert('Hóa đơn đã phát hành không thể xóa. Dùng "Hủy hóa đơn" (có lý do) hoặc lập hóa đơn điều chỉnh.'); return; }
        confirmDelete('invoices', id, function () { closeDrawer(); renderInvoicesTab(); renderDashboardCounts(); });
    };

    RHUI.markInvoicePaid = function (id) {
        if (!guard('invoices.collect')) return;
        var inv = RHD.get('invoices', id);
        if (!inv || !RHB.isIssued(inv) || inv.status === 'paid') { alert('Chỉ ghi nhận thanh toán cho hóa đơn đã phát hành và chưa thanh toán.'); return; }
        var result = RHD.update('invoices', id, { status: 'paid', paidAt: Date.now(), history: RHB.history(inv, 'paid', actorName()) });
        if (result.ok && window.RH && RH.syncManagerRecord) RH.syncManagerRecord(result.item, 'invoice');
        closeDrawer();
        renderInvoicesTab();
        renderDashboardCounts();
    };

    RHUI.sendSelectedInvoices = function () {
        if (!guard('invoices.send')) return;
        var ids = Array.prototype.map.call(document.querySelectorAll('.rh-invoice-check:checked'), function (el) { return el.value; });
        if (!ids.length) { alert('Vui lòng chọn ít nhất một hóa đơn để gửi.'); return; }
        var sent = 0, skipped = 0;
        ids.forEach(function (id) {
            var inv = RHD.get('invoices', id);
            if (inv && inv.status === 'unpaid') {
                var result = RHD.update('invoices', id, { status: 'sent', sentAt: Date.now(), history: RHB.history(inv, 'sent', actorName()) });
                if (result.ok && window.RH && RH.syncManagerRecord) RH.syncManagerRecord(result.item, 'invoice');
                sent++;
            } else skipped++;
        });
        alert('Đã gửi ' + sent + ' hóa đơn tới cư dân.' + (skipped ? ' Bỏ qua ' + skipped + ' hóa đơn chưa phát hành hoặc đã gửi/đã thu.' : ''));
        renderInvoicesTab();
    };

    // Workflow buttons (list rows + preview drawer) all go through here.
    var INVOICE_ACTIONS = {
        approve: { perm: 'invoices.approve', run: function (id) { return RHB.approve(id, actorName()); } },
        reopen: { perm: 'invoices.approve', run: function (id) { return RHB.backToDraft(id, actorName()); } },
        recalc: { perm: 'invoices.update', run: function (id) { return RHB.recalculate(id, actorName()); } },
        issue: {
            perm: 'invoices.issue',
            confirm: 'Phát hành hóa đơn này? Sau khi phát hành cư dân sẽ thấy hóa đơn và không thể sửa trực tiếp.',
            run: function (id) { return RHB.issue(id, actorName(), false); }, notify: true
        },
        cancel: {
            perm: 'invoices.adjust',
            run: function (id) {
                var reason = prompt('Lý do hủy hóa đơn (bắt buộc):', '');
                if (reason === null) return null;
                return RHB.cancel(id, actorName(), reason);
            }
        },
        adjust: {
            perm: 'invoices.adjust',
            run: function (id) {
                if (!guard('invoices.create')) return null;
                var res = RHB.createAdjustment(id, actorName());
                if (res.ok) setTimeout(function () { RHUI.openInvoiceForm(res.item.id); }, 0);
                return res;
            }
        }
    };

    RHUI.invoiceAction = function (id, action) {
        var a = INVOICE_ACTIONS[action];
        if (!a || !guard(a.perm)) return;
        if (a.confirm && !confirm(a.confirm)) return;
        var res = a.run(id);
        if (!res) return;
        if (!res.ok) { alert(res.error); return; }
        if (a.notify && window.RH && RH.syncManagerRecord) RH.syncManagerRecord(res.item, 'invoice');
        closeDrawer();
        renderInvoicesTab();
        renderDashboardCounts();
    };

    // Buttons allowed for an invoice in its current status (and by permission).
    function invoiceActionButtons(inv, asText) {
        var s = inv.status || 'unpaid';
        var issues = (inv.issues || []).length;
        var btn = function (perm, onclick, icon, label, cls) {
            if (perm && !can(perm)) return '';
            return asText
                ? '<button type="button" class="' + (cls || 'if-act') + '" onclick="' + onclick + '"><i class="fas ' + icon + '"></i> ' + label + '</button>'
                : '<button onclick="' + onclick + '" title="' + label + '" aria-label="' + label + '"' + (cls === 'danger' ? ' class="danger"' : '') + '><i class="fas ' + icon + '"></i></button>';
        };
        var call = function (action) { return "RHUI.invoiceAction('" + inv.id + "','" + action + "')"; };
        var out = [];
        if (s === 'draft') {
            out.push(btn('invoices.update', "RHUI.openInvoiceForm('" + inv.id + "')", 'fa-pen', 'Sửa'));
            if (RHB.invoiceType(inv) === 'monthly') out.push(btn('invoices.update', call('recalc'), 'fa-rotate', 'Tính lại'));
            out.push(issues ? '' : btn('invoices.approve', call('approve'), 'fa-check', 'Duyệt'));
            out.push(btn('invoices.delete', "RHUI.deleteInvoice('" + inv.id + "')", 'fa-trash', 'Xóa', 'danger'));
        } else if (s === 'approved') {
            out.push(btn('invoices.issue', call('issue'), 'fa-paper-plane', 'Phát hành'));
            out.push(btn('invoices.update', "RHUI.openInvoiceForm('" + inv.id + "')", 'fa-pen', 'Sửa'));
            out.push(btn('invoices.approve', call('reopen'), 'fa-rotate-left', 'Trả về nháp'));
        } else if (s !== 'cancelled') {
            if (s === 'unpaid') out.push(btn('invoices.send', "RHUI.sendOneInvoice('" + inv.id + "')", 'fa-envelope', 'Gửi cư dân'));
            if (s !== 'paid') out.push(btn('invoices.collect', "RHUI.markInvoicePaid('" + inv.id + "')", 'fa-sack-dollar', 'Đã thu tiền'));
            out.push(btn('invoices.adjust', call('adjust'), 'fa-scale-balanced', 'Điều chỉnh'));
            if (s !== 'paid') out.push(btn('invoices.adjust', call('cancel'), 'fa-ban', 'Hủy hóa đơn', 'danger'));
        }
        return out.join('');
    }

    var HISTORY_LABELS = {
        auto_created: 'Hệ thống tự lập', created: 'Tạo', edited: 'Chỉnh sửa', recalculated: 'Tính lại từ dữ liệu', approved: 'Duyệt',
        reopened: 'Trả về nháp', issued: 'Phát hành', issued_sent: 'Phát hành & gửi', sent: 'Gửi cư dân', paid: 'Ghi nhận đã thu', cancelled: 'Hủy'
    };

    function invoiceWorkflowPanel(inv) {
        var st = statusMeta(RHD.INVOICE_STATUSES, inv.status || 'unpaid');
        var adjusts = inv.adjustsInvoiceId ? RHD.get('invoices', inv.adjustsInvoiceId) : null;
        var adjustments = RHD.list('invoices').filter(function (x) { return x.adjustsInvoiceId === inv.id; });
        return '<div class="if-workflow">' +
            '<div class="if-workflow-head">' + badge(st.label, st.color, st.bg) + ' ' + badge(RHB.typeMeta(RHB.invoiceType(inv)).label, '#0d65d5', '#eaf3ff') +
            (inv.source === 'auto' ? ' ' + badge('Tự động', '#7c3aed', '#f3e8ff') : '') +
            '<span style="margin-left:auto;color:#61708a;font-size:.8rem;">Lập ' + fmtDate(inv.issueDate) + ' · Hạn ' + fmtDate(inv.dueDate) + '</span></div>' +
            ((inv.issues || []).length ? '<div class="if-issues"><i class="fas fa-triangle-exclamation"></i> <strong>Cần kiểm tra:</strong><ul>' + inv.issues.map(function (s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('') + '</ul></div>' : '') +
            (inv.status === 'cancelled' ? '<div class="if-issues"><strong>Đã hủy</strong> bởi ' + escapeHtml(inv.cancelledBy || '—') + ': ' + escapeHtml(inv.cancelReason || '') + '</div>' : '') +
            (adjusts ? '<div class="pm-note" style="margin:.6rem 0 0;">Điều chỉnh cho hóa đơn <strong>' + escapeHtml(adjusts.code) + '</strong></div>' : '') +
            (adjustments.length ? '<div class="pm-note" style="margin:.6rem 0 0;">Hóa đơn điều chỉnh: ' + adjustments.map(function (x) { return escapeHtml(x.code) + ' (' + money(x.total) + ', ' + statusMeta(RHD.INVOICE_STATUSES, x.status).label + ')'; }).join(', ') + '</div>' : '') +
            '<div class="if-workflow-actions">' + invoiceActionButtons(inv, true) + '</div>' +
            ((inv.history || []).length ? '<details class="if-history"><summary>Lịch sử (' + inv.history.length + ')</summary><ul>' + inv.history.slice().reverse().map(function (h) {
                return '<li><strong>' + escapeHtml(HISTORY_LABELS[h.action] || h.action) + '</strong> · ' + escapeHtml(h.by || '') + ' · ' + new Date(h.at).toLocaleString('vi-VN') + (h.note ? ' — ' + escapeHtml(h.note) : '') + '</li>';
            }).join('') + '</ul></details>' : '') +
            '</div>';
    }

    RHUI.runAutoBilling = function () {
        if (!guard('invoices.create')) return;
        var res = RHB.run();
        if (!res.ran) { alert('Một tab khác đang chạy lập hóa đơn. Vui lòng thử lại sau ít giây.'); return; }
        alert(res.created.length
            ? 'Đã lập ' + res.created.length + ' hóa đơn nháp' + (res.created.some(function (i) { return (i.issues || []).length; }) ? ' (có hóa đơn cần kiểm tra chỉ số)' : '') + '. Hãy kiểm tra và duyệt trong tab "Chờ duyệt".'
            : 'Không có kỳ nào đến hạn cần lập thêm. Các kỳ đã lập sẽ không bị lập trùng.' + (res.skipped.length ? ' Bỏ qua ' + res.skipped.length + ' (' + res.skipped[0].reason + ').' : ''));
        if (res.created.length) { RHUI.invoiceFilters = Object.assign(RHUI.invoiceFilters || {}, { status: 'review', period: '' }); }
        renderInvoicesTab();
        renderDashboardCounts();
    };

    // Deterministic placeholder "QR" (a visual stand-in, not a scannable code) so
    // print previews don't look broken before a real bank QR provider is wired up.
    function qrPlaceholderDataUri(seedText) {
        var seed = 0;
        for (var i = 0; i < (seedText || '').length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
        function rand() { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >> 8) % 2; }
        var n = 8, cell = 11, svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (n * cell) + '" height="' + (n * cell) + '"><rect width="100%" height="100%" fill="#fff"/>';
        for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (rand()) svg += '<rect x="' + (x * cell) + '" y="' + (y * cell) + '" width="' + cell + '" height="' + cell + '" fill="#10213c"/>';
        svg += '</svg>';
        return 'data:image/svg+xml;base64,' + btoa(svg);
    }

    function invoiceTemplateData(inv, tpl) {
        var building = RHD.get('buildings', inv.buildingId) || {};
        var apt = RHD.get('apartments', inv.apartmentId) || {};
        var cus = RHD.get('customers', inv.customerId) || {};
        var contract = RHD.get('contracts', inv.contractId) || {};
        var cfg = building.config || {};
        var elecItem = inv.items.filter(function (it) { return /kWh|Tiền điện/i.test(it.label); })[0];
        var waterItem = inv.items.filter(function (it) { return /m³|Tiền nước/i.test(it.label); })[0];
        // The reading the invoice line was actually calculated from (approved, see
        // billing.js). A line without one (missing reading) prints no indexes;
        // only legacy lines from before the billing engine fall back to the latest.
        var lineReading = function (item, meterType) {
            if (item && item.meterId) return RHD.get('meters', item.meterId);
            if (item && item.kind) return null;
            return RHD.latestMeter(inv.apartmentId, meterType);
        };
        var elecReading = lineReading(elecItem, 'electricity');
        var waterReading = lineReading(waterItem, 'water');
        // Only drop electricity/water from the generic rows when the selected
        // template has its own dedicated {{electric_*}}/{{water_*}} placeholders
        // (invoice_monthly) — otherwise every item stays listed so nothing is lost.
        var tplVars = (tpl && tpl.metadata && tpl.metadata.variables) || [];
        var hasOwnMeterRows = tplVars.indexOf('electric_old') !== -1 || tplVars.indexOf('water_old') !== -1;
        var serviceRows = inv.items.filter(function (it) {
            return !hasOwnMeterRows || (it !== elecItem && it !== waterItem);
        }).map(function (it) {
            return '<tr><td colspan="2">' + escapeHtml(it.label) + '</td><td class="num">1</td><td class="num">' + money(it.amount) + '</td></tr>';
        }).join('');
        return {
            invoice_code: inv.code, contract_code: contract.code || '', issue_date: fmtDate(inv.issueDate), due_date: fmtDate(inv.dueDate),
            payment_period: inv.period, company_name: 'ResidentHub', manager_name: (RH_SESSION && RH_SESSION.name) || 'Ban quản lý',
            building_name: building.name || '', building_address: [building.addressDetail, building.ward, building.province].filter(Boolean).join(', '),
            room_number: apt.name || '', room_area: apt.area || '', tenant_name: cus.fullName || '', tenant_phone: cus.phone || '', tenant_id_number: cus.idNumber || '',
            rent_price: money(inv.subtotal ? contract.rentPrice || '' : ''), deposit_price: money(contract.depositPrice || ''), deposit_amount: money(contract.depositPrice || ''),
            first_month_rent: money(contract.rentPrice || ''), payment_cycle: statusMeta(RHD.PAYMENT_CYCLES, contract.paymentCycle).label || '',
            start_date: fmtDate(contract.startDate), end_date: fmtDate(contract.endDate),
            service_rows_html: serviceRows,
            electric_old: elecReading ? elecReading.previousIndex : '—', electric_new: elecReading ? elecReading.latestIndex : '—',
            electric_consumption: elecReading ? elecReading.consumption : 0, electric_amount: elecItem ? money(elecItem.amount) : money(0),
            water_old: waterReading ? waterReading.previousIndex : '—', water_new: waterReading ? waterReading.latestIndex : '—',
            water_consumption: waterReading ? waterReading.consumption : 0, water_amount: waterItem ? money(waterItem.amount) : money(0),
            total_amount: money(inv.total), bank_name: cfg.bankName || '—', bank_account_number: cfg.bankAccountNumber || '—',
            bank_account_holder: cfg.bankAccountHolder || building.name || '—', bank_qr_code: qrPlaceholderDataUri(inv.code),
            einvoice_note: cfg.eInvoiceEnabled ? 'Hóa đơn điện tử GTGT (nếu áp dụng) sẽ được xuất riêng qua ' + escapeHtml(cfg.eInvoiceProvider || 'nhà cung cấp đã cấu hình') + '.' : ''
        };
    }

    RHUI.previewInvoice = function (id) {
        var inv = RHD.get('invoices', id);
        if (!inv) return;
        var tpl = (inv.invoiceTemplateId && RHT.get(inv.invoiceTemplateId)) || RHT.getDefault('INVOICE');
        var rendered = tpl ? RHT.render(tpl.html_template, invoiceTemplateData(inv, tpl)) : '<p>Không tìm thấy mẫu hóa đơn.</p>';
        var html = invoiceWorkflowPanel(inv) + '<div class="rh-print-area">' + rendered + '</div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;">' +
            '<button type="button" onclick="RHUI.printCurrentPreview()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;"><i class="fas fa-print"></i> In</button>' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Đóng</button>' +
            '</div>';
        openDrawer('Xem trước hóa đơn' + (tpl ? ' — ' + tpl.name : ''), html);
    };

    RHUI.printCurrentPreview = function () { window.print(); };

    function sampleTemplateData() {
        return {
            invoice_code: 'HD2026-0099', contract_code: 'CT1-501-2026-001', issue_date: '30/09/2026', due_date: '10/10/2026',
            payment_period: '2026-09', company_name: 'ResidentHub', manager_name: 'Nguyễn Văn An',
            building_name: 'Chung cư Riverside Residence', building_address: 'Tổ 14, Phường Tích Lương, Thái Nguyên',
            room_number: '501', room_area: 20, tenant_name: 'Nguyễn Thị Hoa', tenant_phone: '0984646471', tenant_id_number: '017296001234',
            rent_price: '2.000.000đ', deposit_price: '2.000.000đ', deposit_amount: '2.000.000đ', first_month_rent: '2.000.000đ',
            payment_cycle: 'Hàng tháng', start_date: '01/01/2026', end_date: '31/12/2026', old_end_date: '31/12/2026',
            sign_date: '28/12/2025',
            penalty_amount: '1.000.000đ', outstanding_amount: '250.000đ', old_room_number: '410',
            service_rows_html: '<tr><td colspan="2">Phí quản lý vận hành</td><td class="num">1</td><td class="num">150.000đ</td></tr>',
            electric_old: 80, electric_new: 100, electric_consumption: 20, electric_amount: '76.000đ',
            water_old: 10, water_new: 16, water_consumption: 6, water_amount: '108.000đ',
            total_amount: '2.195.480đ', bank_name: 'Vietcombank', bank_account_number: '0123456789', bank_account_holder: 'CTY TNHH RESIDENTHUB',
            bank_qr_code: qrPlaceholderDataUri('sample'), einvoice_note: ''
        };
    }

    RHUI.previewTemplateById = function (tplId) {
        var tpl = RHT.get(tplId);
        if (!tpl) return;
        var rendered = RHT.render(tpl.html_template, sampleTemplateData());
        var html = '<div style="background:#fde68a;color:#78350f;font-size:.75rem;font-weight:700;padding:.4rem .7rem;border-radius:8px;margin-bottom:1rem;display:inline-block;">DỮ LIỆU MẪU MINH HOẠ — không phải dữ liệu thật</div>' +
            '<div class="rh-print-area">' + rendered + '</div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;">' +
            '<button type="button" onclick="RHUI.printCurrentPreview()" class="btn-primary" style="text-decoration:none;"><i class="fas fa-print"></i> In / Tải PDF</button>' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Đóng</button>' +
            '</div>';
        openDrawer('Xem trước — ' + tpl.name, html);
    };

    RHUI.sendOneInvoice = function (id) {
        if (!guard('invoices.send')) return;
        var current = RHD.get('invoices', id);
        if (!current || current.status !== 'unpaid') { alert('Chỉ gửi được hóa đơn đã phát hành và chưa gửi.'); return; }
        var result = RHD.update('invoices', id, { status: 'sent', sentAt: Date.now(), history: RHB.history(current, 'sent', actorName()) });
        if (result.ok && window.RH && RH.syncManagerRecord) RH.syncManagerRecord(result.item, 'invoice');
        closeDrawer();
        renderInvoicesTab();
    };

    // ======================================================= SUPPORT REQUESTS
    // Shared with the resident app: a request submitted in resident-web.html
    // (RHD.create('supportRequests', ...)) lands here untouched, and a status
    // change made here is what the resident sees reflected on their side.

    var supportListFilters = { search: '', status: 'all', category: 'all', priority: 'all' };

    function renderSupportTab() {
        var tab = byId('support-tab');
        if (!tab) return;
        var requests = scoped('supportRequests').slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
        var categories = RHD.SUPPORT_CATEGORIES || [];
        var visibleRequests = requests.filter(function (r) {
            var apt = RHD.get('apartments', r.apartmentId);
            var building = RHD.get('buildings', r.buildingId);
            var searchText = [r.code, r.residentName, r.title, r.category, r.location, apt && apt.name, building && building.name, building && building.shortName].join(' ').toLocaleLowerCase();
            return (!supportListFilters.search || searchText.indexOf(supportListFilters.search.toLocaleLowerCase()) !== -1) &&
                (supportListFilters.status === 'all' || r.status === supportListFilters.status) &&
                (supportListFilters.category === 'all' || r.category === supportListFilters.category) &&
                (supportListFilters.priority === 'all' || r.priority === supportListFilters.priority);
        });
        var rows = visibleRequests.map(function (r) {
            var apt = RHD.get('apartments', r.apartmentId);
            var building = RHD.get('buildings', r.buildingId);
            var st = statusMeta(RHD.SUPPORT_STATUSES, r.status);
            var pr = statusMeta(RHD.SUPPORT_PRIORITIES, r.priority);
            return '<tr>' +
                '<td><strong>' + escapeHtml(r.code) + '</strong></td>' +
                '<td>' + escapeHtml(r.residentName || '—') + '</td>' +
                '<td>' + escapeHtml(building ? building.shortName : '—') + ' / ' + escapeHtml(apt ? apt.name : '—') + '</td>' +
                '<td>' + escapeHtml(r.title) + '<div style="font-size:.72rem;color:#94a3b8;">' + escapeHtml(r.category) + '</div></td>' +
                '<td>' + badge(pr.label || r.priority, '#61708a', '#f1f5f9') + '</td>' +
                '<td>' + badge(st.label, st.color, st.bg) + '</td>' +
                '<td>' + escapeHtml(r.assignee || '—') + '</td>' +
                '<td style="white-space:nowrap;">' + new Date(r.createdAt).toLocaleString('vi-VN') + '</td>' +
                '<td style="text-align:right;white-space:nowrap;">' +
                rowButton('support.update', "RHUI.openSupportForm('" + r.id + "')", 'fa-pen', 'Xử lý') +
                '</td></tr>';
        }).join('');

        tab.innerHTML = '<div class="card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div><h2 style="font-size:1.4rem;font-weight:700;color:#10213c;">Yêu cầu hỗ trợ</h2><p style="color:#94a3b8;font-size:.875rem;margin-top:.25rem;">Yêu cầu do cư dân gửi từ ứng dụng — cập nhật trạng thái tại đây sẽ phản ánh ngay bên cư dân.</p></div>' +
            '</div>' +
            '<div style="display:grid;gap:.65rem;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:1rem;">' +
            '<input id="rhSupportSearch" type="search" value="' + escapeHtml(supportListFilters.search) + '" placeholder="Tìm mã, cư dân, căn hộ, nội dung..." aria-label="Tìm yêu cầu hỗ trợ" style="border:1px solid var(--line);border-radius:9px;padding:.65rem .75rem;font:inherit;">' +
            '<select id="rhSupportStatusFilter" aria-label="Lọc trạng thái" style="border:1px solid var(--line);border-radius:9px;padding:.65rem .75rem;font:inherit;"><option value="all">Tất cả trạng thái</option>' + (RHD.SUPPORT_STATUSES || []).map(function (s) { return '<option value="' + escapeHtml(s.id) + '"' + (supportListFilters.status === s.id ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>'; }).join('') + '</select>' +
            '<select id="rhSupportTypeFilter" aria-label="Lọc loại yêu cầu" style="border:1px solid var(--line);border-radius:9px;padding:.65rem .75rem;font:inherit;"><option value="all">Tất cả loại</option>' + categories.map(function (category) { return '<option value="' + escapeHtml(category) + '"' + (supportListFilters.category === category ? ' selected' : '') + '>' + escapeHtml(category) + '</option>'; }).join('') + '</select>' +
            '<select id="rhSupportPriorityFilter" aria-label="Lọc mức độ ưu tiên" style="border:1px solid var(--line);border-radius:9px;padding:.65rem .75rem;font:inherit;"><option value="all">Tất cả mức độ</option>' + (RHD.SUPPORT_PRIORITIES || []).map(function (priority) { return '<option value="' + escapeHtml(priority.id) + '"' + (supportListFilters.priority === priority.id ? ' selected' : '') + '>' + escapeHtml(priority.label) + '</option>'; }).join('') + '</select></div>' +
            (requests.length ? '<div style="color:#70839d;font-size:.82rem;margin-bottom:.55rem;">Hiển thị ' + visibleRequests.length + ' / ' + requests.length + ' yêu cầu</div><div class="table-container"><table><thead><tr><th>Mã YC</th><th>Người gửi</th><th>Căn hộ</th><th>Nội dung</th><th>Mức độ</th><th>Trạng thái</th><th>Người phụ trách</th><th>Thời gian gửi</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="9" style="padding:1rem;text-align:center;color:#94a3b8;">Không có yêu cầu phù hợp với bộ lọc.</td></tr>') + '</tbody></table></div>'
                : emptyState('fa-headset', 'Chưa có yêu cầu hỗ trợ nào từ cư dân.')) +
            '</div>';
        ['rhSupportSearch', 'rhSupportStatusFilter', 'rhSupportTypeFilter', 'rhSupportPriorityFilter'].forEach(function (id) {
            var input = byId(id);
            if (!input) return;
            input.addEventListener(id === 'rhSupportSearch' ? 'input' : 'change', function () {
                supportListFilters.search = byId('rhSupportSearch').value.trim();
                supportListFilters.status = byId('rhSupportStatusFilter').value;
                supportListFilters.category = byId('rhSupportTypeFilter').value;
                supportListFilters.priority = byId('rhSupportPriorityFilter').value;
                renderSupportTab();
            });
        });
    }

    RHUI.openSupportForm = function (id) {
        if (!guard('support.update')) return;
        var r = RHD.get('supportRequests', id);
        if (!r) return;
        RHUI.drawerEntity = 'supportRequests';
        RHUI.drawerId = id;
        var apt = RHD.get('apartments', r.apartmentId);
        var building = RHD.get('buildings', r.buildingId);
        var html = '<form onsubmit="RHUI.submitSupportForm(event)">' +
            '<div class="rh-grid-2">' +
            '<div><label style="font-size:.8rem;color:#94a3b8;">Người gửi</label><div style="font-weight:600;">' + escapeHtml(r.residentName || '—') + '</div></div>' +
            '<div><label style="font-size:.8rem;color:#94a3b8;">Căn hộ</label><div style="font-weight:600;">' + escapeHtml(building ? building.name : '—') + ' / ' + escapeHtml(apt ? apt.name : '—') + '</div></div>' +
            '<div style="grid-column:1/-1;"><label style="font-size:.8rem;color:#94a3b8;">Nội dung</label><div style="font-weight:600;">' + escapeHtml(r.title) + '</div><p style="color:#61708a;font-size:.85rem;margin-top:.35rem;">' + escapeHtml(r.description) + '</p></div>' +
            '<div class="rh-field"><label>Trạng thái</label><select id="srStatus">' + selectOptions(RHD.SUPPORT_STATUSES, 'id', 'label', r.status) + '</select></div>' +
            '<div class="rh-field"><label>Người phụ trách</label><input id="srAssignee" value="' + escapeHtml(r.assignee || RHD.getSettings().supportAutoAssignee || '') + '" placeholder="Tên nhân viên xử lý"></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Phản hồi cho cư dân</label><textarea id="srResponse" rows="4" placeholder="Nhập nội dung phản hồi hoặc hướng dẫn xử lý">' + escapeHtml(r.response || '') + '</textarea></div>' +
            '</div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;">' +
            '<button type="submit" class="btn-primary">Cập nhật</button>' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Đóng</button>' +
            '</div></form>';
        openDrawer('Yêu cầu ' + r.code, html);
    };

    RHUI.submitSupportForm = function (ev) {
        ev.preventDefault();
        if (!guard('support.update')) return;
        var before = RHD.get('supportRequests', RHUI.drawerId);
        var res = RHD.update('supportRequests', RHUI.drawerId, {
            status: byId('srStatus').value,
            assignee: byId('srAssignee').value.trim(),
            response: byId('srResponse').value.trim(),
            updatedAt: Date.now()
        });
        // Notify the resident account linked to this request (by residentId).
        if (res.ok && RHD.getSettings().notifySupportStatus && before && before.status !== res.item.status && RHD.mode() !== 'demo' && global.RH && global.RH.syncManagerNotification) {
            global.RH.syncManagerNotification({
                id: res.item.id, customerId: res.item.customerId, apartmentId: res.item.apartmentId, residentEmail: res.item.residentEmail,
                type: 'request', title: 'Yêu cầu ' + res.item.code + ' đã được cập nhật',
                body: 'Trạng thái mới: ' + statusMeta(RHD.SUPPORT_STATUSES, res.item.status).label + (res.item.assignee ? ' • Phụ trách: ' + res.item.assignee : ''),
                refType: 'request', actionUrl: 'requests', actionLabel: 'Xem yêu cầu'
            });
        }
        closeDrawer();
        renderSupportTab();
        renderDashboardCounts();
    };

    // ============================================================ DASHBOARD
    // Pure READ -> CALCULATE -> DISPLAY: every figure below comes from RHD.list(),
    // the same store every CRUD module (buildings/apartments/.../supportRequests)
    // writes to. No mock arrays, no dashboard-only data source — so creating a
    // record anywhere and then calling renderDashboardCounts() again (every module
    // does this after save) is the only thing that keeps this in sync.

    function setTodo(valueId, noteId, count, unitLabel, emptyLabel) {
        var valueEl = byId(valueId);
        if (valueEl) valueEl.textContent = count;
        var noteEl = byId(noteId);
        if (noteEl) noteEl.textContent = count > 0 ? count + ' ' + unitLabel : emptyLabel;
        var card = valueEl ? valueEl.closest('.kpi-card') : null;
        if (card) card.classList.toggle('has-items', count > 0);
    }

    function timeAgo(ts) {
        var diff = Date.now() - ts;
        if (diff < 60000) return 'Vừa xong';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' phút trước';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' giờ trước';
        return Math.floor(diff / 86400000) + ' ngày trước';
    }

    function renderRecentActivity() {
        var body = byId('dashActivityBody');
        if (!body) return;
        var events = [];
        scoped('buildings').forEach(function (b) { events.push({ t: b.createdAt, icon: 'fa-building', color: '#667eea', label: 'Tạo tòa nhà', detail: b.name }); });
        scoped('apartments').forEach(function (a) { events.push({ t: a.createdAt, icon: 'fa-door-open', color: '#1683ff', label: 'Tạo căn hộ', detail: a.name }); });
        scoped('customers').forEach(function (c) { events.push({ t: c.createdAt, icon: 'fa-user-plus', color: '#f59e0b', label: 'Thêm cư dân', detail: c.fullName }); });
        scoped('contracts').forEach(function (c) {
            var cus = RHD.get('customers', c.customerId);
            events.push({ t: c.createdAt, icon: 'fa-file-signature', color: '#10b981', label: 'Lập hợp đồng', detail: c.code + (cus ? ' — ' + cus.fullName : '') });
        });
        scoped('meters').forEach(function (m) { events.push({ t: m.createdAt, icon: 'fa-gauge', color: '#0284c7', label: 'Ghi chỉ số', detail: (m.meterType === 'electricity' ? 'Điện' : 'Nước') + ' ' + (m.meterCode || '') }); });
        scoped('invoices').forEach(function (inv) { events.push({ t: inv.createdAt, icon: 'fa-receipt', color: '#7c3aed', label: 'Tạo hóa đơn', detail: inv.code + ' — ' + money(inv.total) }); });
        scoped('supportRequests').forEach(function (r) {
            events.push({ t: r.createdAt, icon: 'fa-headset', color: '#f59e0b', label: 'Cư dân gửi yêu cầu', detail: r.code + ' — ' + r.title });
            if (r.updatedAt && r.updatedAt !== r.createdAt) events.push({ t: r.updatedAt, icon: 'fa-check-circle', color: '#10b981', label: 'Xử lý yêu cầu', detail: r.code + ' — ' + statusMeta(RHD.SUPPORT_STATUSES, r.status).label });
        });
        events.sort(function (a, b) { return b.t - a.t; });
        var top = events.slice(0, 10);
        body.innerHTML = top.length ? top.map(function (e) {
            return '<tr><td><i class="fas ' + e.icon + '" style="color:' + e.color + ';margin-right:.5rem;"></i>' + escapeHtml(e.label) + '</td><td>' + escapeHtml(e.detail) + '</td><td>' + timeAgo(e.t) + '</td></tr>';
        }).join('') : '<tr class="activity-empty"><td colspan="3">Chưa có hoạt động</td></tr>';
    }

    function setText(id, value) {
        var el = byId(id);
        if (el) el.textContent = value;
    }

    // Small red counters on the topbar bell and sidebar items — hidden at 0.
    function setBadge(id, count) {
        var el = byId(id);
        if (!el) return;
        el.textContent = count > 99 ? '99+' : count;
        el.style.display = count > 0 ? (el.getAttribute('data-display') || 'inline-flex') : 'none';
    }

    function pct(part, whole) {
        return whole ? Math.round(part * 1000 / whole) / 10 : 0;
    }

    var FEE_GROUP_META = [
        { id: 'rent', label: 'Tiền nhà', icon: 'fa-house' },
        { id: 'electricity', label: 'Tiền điện', icon: 'fa-lightbulb' },
        { id: 'water', label: 'Tiền nước', icon: 'fa-droplet' },
        { id: 'other', label: 'Dịch vụ khác', icon: 'fa-credit-card' }
    ];

    // Keeps the building filter in step with the Tòa nhà module.
    function syncDashboardBuildingFilter() {
        var select = byId('dashBuildingFilter');
        if (!select) return '';
        var current = select.value;
        var buildings = scoped('buildings');
        if (current && !buildings.some(function (b) { return b.id === current; })) current = '';
        select.innerHTML = '<option value="">Tất cả tòa nhà</option>' + buildings.map(function (b) {
            return '<option value="' + b.id + '"' + (b.id === current ? ' selected' : '') + '>' + escapeHtml(b.name) + '</option>';
        }).join('');
        return current;
    }

    function renderDashboardCounts() {
        RHD.markOverdueInvoices();
        // Badges (bell + sidebar) reflect the user's whole building scope, not the
        // filter — and only for modules the user may act on.
        var all = RHD.dashboardStats(scopeArg());
        var supportCount = can('support.view') ? all.newRequests.length : 0;
        var pendingAccounts = can('users.approveResident') ? all.accountRequests.pending : 0;
        setBadge('rhBellCount', (can('support.view') ? all.openRequests.length : 0) + pendingAccounts);
        setBadge('rhNavSupportCount', supportCount);
        // Drafts waiting for review (auto-generated or manual) in the user's scope.
        setBadge('rhNavInvoiceReviewCount', can('invoices.view') ? scoped('invoices').filter(function (i) { return i.status === 'draft' || i.status === 'approved'; }).length : 0);
        setBadge('rhNavAccountsCount', pendingAccounts);
        setBadge('rhNavAccountsGroupCount', pendingAccounts);

        if (!byId('kpiBuildings')) return;
        var buildingId = syncDashboardBuildingFilter();
        var s = buildingId ? RHD.dashboardStats(buildingId) : all;
        var aptCount = s.apartments.length;

        // Tiles + apartment status panel
        setText('kpiBuildings', s.buildings);
        setText('kpiApartments', aptCount);
        setText('kpiCustomers', s.customers);
        setText('kpiOccupancy', s.occupancyRate + '%');
        [['occupied', 'dAptOccupied'], ['deposited', 'dAptDeposited'], ['vacant', 'kpiVacant'], ['maintenance', 'dAptMaintenance']].forEach(function (pair) {
            setText(pair[1], s.aptStatus[pair[0]] || 0);
        });
        setText('dAptOccupiedPct', pct(s.aptStatus.occupied, aptCount) + '%');
        setText('dAptDepositedPct', pct(s.aptStatus.deposited, aptCount) + '%');
        setText('dAptVacantPct', pct(s.aptStatus.vacant, aptCount) + '%');
        setText('dAptMaintenancePct', pct(s.aptStatus.maintenance, aptCount) + '%');

        // Tài khoản cư dân
        var acc = s.accountRequests;
        var accTotal = acc.pending + acc.approved + acc.rejected;
        setText('dAccPending', acc.pending);
        setText('dAccApproved', acc.approved);
        setText('dAccRejected', acc.rejected);
        setText('dAccMonth', acc.thisMonth);
        if (byId('dAccPendingBar')) byId('dAccPendingBar').style.width = pct(acc.pending, accTotal) + '%';
        if (byId('dAccApprovedBar')) byId('dAccApprovedBar').style.width = pct(acc.approved, accTotal) + '%';

        // Cư dân
        setText('dCusNew', s.customersNewThisMonth);
        setText('dCusLinked', s.linkedAccounts);
        setText('dCusNoContract', s.customersWithoutContract);
        setText('dCusLinkedPct', pct(s.linkedAccounts, s.customers) + '%');

        // Hợp đồng
        setText('dConNew', s.contractsSignedThisMonth);
        setText('dConEnded', s.contractsEndedThisMonth);
        setText('dConActive', s.activeContracts.length);
        setText('dConExpiring', s.expiringContracts.length);
        setText('dConExpiringLabel', 'Hết hạn trong ' + s.expiringDays + ' ngày');
        setText('dConClosed', s.endedContracts.length);

        // Hóa đơn tháng này
        var m = s.month;
        var delta = m.prevTotal ? Math.round((m.total - m.prevTotal) * 1000 / m.prevTotal) / 10 : 0;
        setText('dInvMonthCount', m.count);
        setText('dInvMonthKey', m.key.split('-').reverse().join('/'));
        setText('dInvMonthTotal', money(m.total));
        setText('dInvMonthPaid', money(m.paid));
        setText('dInvMonthUnpaid', money(m.total - m.paid));
        var deltaEl = byId('dInvMonthDelta');
        if (deltaEl) {
            deltaEl.textContent = (delta > 0 ? '+' : '') + delta + '% so với tháng trước';
            deltaEl.className = 'db-delta' + (delta > 0 ? ' up' : delta < 0 ? ' down' : '');
        }
        if (byId('dInvBarPaid')) byId('dInvBarPaid').style.width = pct(m.paid, m.total) + '%';
        if (byId('dInvBarUnpaid')) byId('dInvBarUnpaid').style.width = (m.total ? 100 - pct(m.paid, m.total) : 0) + '%';
        var groupsEl = byId('dInvGroups');
        if (groupsEl) {
            groupsEl.innerHTML = FEE_GROUP_META.map(function (g) {
                var v = m.groups[g.id];
                return '<div><span><i class="fas ' + g.icon + '"></i>' + g.label + '</span><b>' + money(v.total) + '</b><em title="Đã thu">' + pct(v.paid, v.total) + '%</em></div>';
            }).join('');
        }
        setText('kpiDebt', money(s.unpaidInvoices.reduce(function (sum, i) { return sum + (Number(i.total) || 0); }, 0)));
        setText('kpiOverdueCount', s.overdueInvoices.length);

        // Yêu cầu hỗ trợ
        setText('dReqMonth', s.requestsThisMonth);
        setText('dReqDone', s.requestsDoneThisMonth);
        setText('dReqNew', s.requestsByStatus.new);
        setText('dReqProgress', s.requestsByStatus.in_progress);
        setText('dReqResolved', s.requestsByStatus.resolved);

        // Đánh giá (from ratings residents leave on completed requests)
        setText('dRatingSummary', s.ratedCount ? 'Trung bình ' + s.ratingAverage + '/5 • dựa trên ' + s.ratedCount + ' đánh giá' : 'Chưa có đánh giá nào từ cư dân');
        var ratingEl = byId('dRatingRows');
        if (ratingEl) {
            ratingEl.innerHTML = s.ratings.map(function (r) {
                var stars = '';
                for (var i = 1; i <= 5; i++) stars += '<i class="' + (i <= r.star ? 'fas' : 'far') + ' fa-star"></i>';
                return '<div><span class="db-stars">' + r.star + ' ' + stars + '</span><span class="db-muted">' + r.count + ' (' + pct(r.count, s.ratedCount) + '%)</span></div>';
            }).join('');
        }

        // Điểm nóng
        [['building', 'dHotBuilding'], ['apartment', 'dHotApartment'], ['category', 'dHotCategory'], ['assignee', 'dHotAssignee']].forEach(function (pair) {
            var h = s.hotspots[pair[0]];
            setText(pair[1], h ? h.label : '—');
            setText(pair[1] + 'Count', h ? h.count : 0);
        });

        // Cần xử lý
        setTodo('todoRequests', 'todoRequestsNote', s.openRequests.length, 'yêu cầu cần xử lý', 'Không có yêu cầu cần xử lý');
        setTodo('todoUnpaid', 'todoUnpaidNote', s.unpaidInvoices.length, 'hóa đơn cần thanh toán', 'Không có hóa đơn cần thanh toán');
        setTodo('todoExpiring', 'todoExpiringNote', s.expiringContracts.length, 'hợp đồng hết hạn trong ' + s.expiringDays + ' ngày', 'Không có hợp đồng sắp hết hạn');
        setTodo('todoAccountRequests', 'todoAccountRequestsNote', acc.pending, 'tài khoản chờ phê duyệt', 'Không có tài khoản chờ phê duyệt');

        if (typeof updateDashboardCharts === 'function') updateDashboardCharts(s);
        renderRecentActivity();
    }

    global.RHUI = Object.assign(RHUI, {
        // Shared helpers for the modules in asset-module.js / account-modules.js.
        util: {
            escapeHtml: escapeHtml, money: money, fmtDate: fmtDate, badge: badge, statusMeta: statusMeta,
            selectOptions: selectOptions, emptyState: emptyState, addButton: addButton, rowButton: rowButton,
            renderDemoBanner: renderDemoBanner, detailItem: detailItem, avatarHtml: avatarHtml,
            can: can, guard: guard, scoped: scoped, scopeArg: scopeArg
        },
        openDrawer: openDrawer,
        closeDrawer: closeDrawer,
        refreshOpenDrawer: refreshOpenDrawer,
        renderBuildingsTab: renderBuildingsTab,
        renderApartmentsTab: renderApartmentsTab,
        renderCustomersTab: renderCustomersTab,
        renderMetersTab: renderMetersTab,
        renderContractsTab: renderContractsTab,
        renderInvoicesTab: renderInvoicesTab,
        openApartmentDetail: RHUI.openApartmentDetail,
        renderSupportTab: renderSupportTab,
        renderDashboardCounts: renderDashboardCounts,
        renderDemoBanner: renderDemoBanner
    });
})(window);
