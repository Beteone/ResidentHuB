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
    }

    function openDrawer(title, bodyHtml) {
        ensureDrawer();
        byId('rhDrawerTitle').textContent = title;
        byId('rhDrawerBody').innerHTML = bodyHtml;
        byId('rhDrawerOverlay').classList.add('show');
    }

    function closeDrawer() {
        var el = byId('rhDrawerOverlay');
        if (el) el.classList.remove('show');
    }

    // -------------------------------------------------------- demo banner

    function demoLimitReached(entity) {
        var info = RHD.limitInfo(entity);
        return info.limited && info.reached;
    }

    function addButton(label, onclick, entity) {
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

    function renderBuildingsTab() {
        var tab = byId('buildings-tab');
        if (!tab) return;
        var buildings = RHD.list('buildings');
        var rows = buildings.map(function (b) {
            var apts = RHD.apartmentsOf(b.id).length;
            return '<tr>' +
                '<td><strong>' + escapeHtml(b.name) + '</strong><div style="font-size:.75rem;color:#94a3b8;">' + escapeHtml(b.code) + ' · ' + escapeHtml(b.shortName || '') + '</div></td>' +
                '<td>' + escapeHtml(b.addressDetail) + ', ' + escapeHtml(b.ward || '') + ', ' + escapeHtml(b.province || '') + '</td>' +
                '<td>' + apts + ' căn hộ</td>' +
                '<td>' + (b.services || []).length + ' dịch vụ</td>' +
                '<td style="text-align:right;white-space:nowrap;">' +
                '<button onclick="RHUI.openBuildingForm(\'' + b.id + '\')" class="rh-row-btn" title="Sửa"><i class="fas fa-pen"></i></button>' +
                '<button onclick="RHUI.deleteBuilding(\'' + b.id + '\')" class="rh-row-btn danger" title="Xoá"><i class="fas fa-trash"></i></button>' +
                '</td></tr>';
        }).join('');

        tab.innerHTML = renderDemoBanner('buildings') +
            '<div class="card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div><h2 style="font-size:1.4rem;font-weight:700;color:#10213c;">Tòa nhà</h2><p style="color:#94a3b8;font-size:.875rem;margin-top:.25rem;">Thông tin tòa nhà và dịch vụ sẽ được tái sử dụng khi lập hợp đồng và hóa đơn.</p></div>' +
            addButton('Thêm tòa nhà', "RHUI.openBuildingForm()", 'buildings') +
            '</div>' +
            (buildings.length ? '<div class="table-container"><table><thead><tr><th>Tòa nhà</th><th>Địa chỉ</th><th>Căn hộ</th><th>Dịch vụ</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
                : emptyState('fa-building', 'Chưa có tòa nhà nào. Thêm tòa nhà đầu tiên để bắt đầu quy trình.')) +
            '</div>';
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
            '</div><datalist id="rhWardSuggestions"></datalist>' +

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
        renderBuildingServicesList();
        byId('bfProvince').addEventListener('change', function () {
            var wards = RHD.WARD_SUGGESTIONS[this.value] || [];
            byId('rhWardSuggestions').innerHTML = wards.map(function (w) { return '<option value="' + escapeHtml(w) + '">'; }).join('');
        });
    };

    RHUI.submitBuildingForm = function (ev) {
        ev.preventDefault();
        var data = {
            name: byId('bfName').value.trim(),
            shortName: byId('bfShort').value.trim(),
            province: byId('bfProvince').value,
            ward: byId('bfWard').value.trim(),
            addressDetail: byId('bfAddress').value.trim(),
            services: RHUI.buildingServices,
            invoiceTemplateId: byId('bfInvoiceTpl').value,
            contractTemplateId: byId('bfContractTpl').value,
            config: {
                autoDebitAccount: byId('bfAutoDebit').value.trim(),
                eInvoiceEnabled: !!byId('bfEinvoice').value.trim(),
                eInvoiceProvider: byId('bfEinvoice').value.trim(),
                bankName: byId('bfBankName').value.trim(),
                bankAccountNumber: byId('bfBankNumber').value.trim(),
                bankAccountHolder: byId('bfBankHolder').value.trim()
            }
        };
        var res;
        if (RHUI.drawerId) {
            res = RHD.update('buildings', RHUI.drawerId, data);
        } else {
            data.code = RHD.nextBuildingCode();
            res = RHD.create('buildings', data);
        }
        if (!res.ok) { byId('bfError').textContent = res.error; return; }
        closeDrawer();
        renderBuildingsTab();
        renderDashboardCounts();
    };

    RHUI.deleteBuilding = function (id) {
        var block = RHD.apartmentsOf(id).length ? 'Không thể xoá: vẫn còn căn hộ thuộc tòa nhà này.' : null;
        confirmDelete('buildings', id, function () { renderBuildingsTab(); renderDashboardCounts(); }, block);
    };

    // ============================================================ APARTMENTS

    function renderApartmentsTab() {
        var tab = byId('apartments-tab');
        if (!tab) return;
        var buildings = RHD.list('buildings');
        var apartments = RHD.list('apartments');

        if (!buildings.length) {
            tab.innerHTML = renderDemoBanner('apartments') + '<div class="card">' + emptyState('fa-building', 'Hãy tạo tòa nhà trước khi thêm căn hộ.') + '</div>';
            return;
        }

        var rows = apartments.map(function (a) {
            var building = RHD.get('buildings', a.buildingId);
            var st = statusMeta(RHD.APARTMENT_STATUSES, a.status);
            var isActive = a.active !== false;
            return '<tr>' +
                '<td><strong>' + escapeHtml(a.name) + '</strong>' + (a.photos && a.photos.length ? ' <i class="fas fa-image" style="color:#94a3b8;" title="Có ảnh"></i>' : '') + '</td>' +
                '<td>' + escapeHtml(building ? building.shortName || building.name : '—') + '</td>' +
                '<td>' + escapeHtml(a.floor || '—') + '</td>' +
                '<td>' + (a.area || '—') + ' m²</td>' +
                '<td>' + money(a.rentPrice) + '</td>' +
                '<td>' + badge(isActive ? st.label : 'Ngừng hoạt động', isActive ? st.color : '#64748b', isActive ? st.bg : '#f1f5f9') + '</td>' +
                '<td style="text-align:right;white-space:nowrap;">' +
                '<button onclick="RHUI.openApartmentForm(\'' + a.id + '\')" class="rh-row-btn" title="Sửa"><i class="fas fa-pen"></i></button>' +
                '<button onclick="RHUI.deleteApartment(\'' + a.id + '\')" class="rh-row-btn danger" title="Xoá"><i class="fas fa-trash"></i></button>' +
                '</td></tr>';
        }).join('');

        tab.innerHTML = renderDemoBanner('apartments') +
            '<div class="card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div><h2 style="font-size:1.4rem;font-weight:700;color:#10213c;">Căn hộ</h2><p style="color:#94a3b8;font-size:.875rem;margin-top:.25rem;">Giá thuê và tiền cọc ở đây sẽ tự động điền khi lập hợp đồng.</p></div>' +
            addButton('Thêm căn hộ', "RHUI.openApartmentForm()", 'apartments') +
            '</div>' +
            (apartments.length ? '<div class="table-container"><table><thead><tr><th>Căn hộ</th><th>Tòa nhà</th><th>Tầng</th><th>Diện tích</th><th>Giá thuê</th><th>Trạng thái</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
                : emptyState('fa-door-open', 'Chưa có căn hộ nào.')) +
            '</div>';
    }

    RHUI.openApartmentForm = function (id) {
        var a = id ? RHD.get('apartments', id) : null;
        RHUI.drawerEntity = 'apartments';
        RHUI.drawerId = id || null;
        var buildings = RHD.list('buildings');
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
        var block = RHD.contractsOf(id).length ? 'Không thể xoá: căn hộ đang gắn với hợp đồng.' : null;
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
        var customers = RHD.list('customers');
        var rows = customers.map(function (c) {
            return '<tr>' +
                '<td><strong>' + escapeHtml(c.fullName) + '</strong>' + (c.isForeigner ? ' ' + badge('Nước ngoài', '#0d65d5', '#eaf3ff') : '') + '</td>' +
                '<td>' + escapeHtml(c.phone) + '</td>' +
                '<td>' + escapeHtml(c.idNumber || '—') + '</td>' +
                '<td>' + escapeHtml(c.customerType || '—') + '</td>' +
                '<td>' + (c.vehicles ? c.vehicles.length : 0) + ' xe</td>' +
                '<td style="text-align:right;white-space:nowrap;">' +
                '<button onclick="RHUI.openCustomerForm(\'' + c.id + '\')" class="rh-row-btn" title="Sửa"><i class="fas fa-pen"></i></button>' +
                '<button onclick="RHUI.deleteCustomer(\'' + c.id + '\')" class="rh-row-btn danger" title="Xoá"><i class="fas fa-trash"></i></button>' +
                '</td></tr>';
        }).join('');

        tab.innerHTML = renderDemoBanner('customers') +
            '<div class="card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div><h2 style="font-size:1.4rem;font-weight:700;color:#10213c;">Khách hàng</h2><p style="color:#94a3b8;font-size:.875rem;margin-top:.25rem;">Hồ sơ khách hàng dùng để lập hợp đồng — không cần nhập lại thông tin.</p></div>' +
            addButton('Thêm khách hàng', "RHUI.openCustomerForm()", 'customers') +
            '</div>' +
            (customers.length ? '<div class="table-container"><table><thead><tr><th>Họ tên</th><th>SĐT</th><th>CCCD</th><th>Loại KH</th><th>Phương tiện</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
                : emptyState('fa-users', 'Chưa có khách hàng nào.')) +
            '</div>';
    }

    RHUI.toggleForeigner = function (checked) {
        byId('rhForeignerFields').style.display = checked ? 'block' : 'none';
    };

    RHUI.openCustomerForm = function (id) {
        var c = id ? RHD.get('customers', id) : null;
        RHUI.drawerEntity = 'customers';
        RHUI.drawerId = id || null;
        RHUI.customerVehicles = c ? JSON.parse(JSON.stringify(c.vehicles || [])) : [];
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
        byId('cfIdFront').addEventListener('change', function () { readFileAsDataUrl(this, function (d) { byId('cfIdFrontData').value = d; }); });
        byId('cfIdBack').addEventListener('change', function () { readFileAsDataUrl(this, function (d) { byId('cfIdBackData').value = d; }); });
        var passportInput = byId('cfPassportPhoto');
        if (passportInput) passportInput.addEventListener('change', function () { readFileAsDataUrl(this, function (d) { byId('cfPassportPhotoData').value = d; }); });
    };

    RHUI.submitCustomerForm = function (ev) {
        ev.preventDefault();
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
        if (window.RH && RH.syncManagerRecord) RH.syncManagerRecord(res.item, 'contract');
        closeDrawer();
        renderCustomersTab();
        renderDashboardCounts();
    };

    RHUI.deleteCustomer = function (id) {
        var hasContract = RHD.list('contracts').some(function (c) { return c.customerId === id; });
        confirmDelete('customers', id, function () { renderCustomersTab(); renderDashboardCounts(); }, hasContract ? 'Không thể xoá: khách hàng đang gắn với hợp đồng.' : null);
    };

    // =============================================================== METERS

    var meterViewState = {
        selectedMonth: new Date().toISOString().slice(0, 7),
        selectedDate: new Date().toISOString().slice(0, 10),
        meterType: 'all',
        showUnclosedOnly: false
    };

    function meterMonthLabel(value) {
        var parts = String(value || '').split('-');
        return parts.length === 2 ? parts[1] + '/' + parts[0] : value || '—';
    }

    function meterIsClosed(reading) {
        return reading && (reading.status === 'closed' || reading.status === 'approved' || reading.isClosed === true);
    }

    function renderMeterRows(readings) {
        return readings.map(function (m) {
            var apt = RHD.get('apartments', m.apartmentId);
            var building = RHD.get('buildings', m.buildingId);
            var typeLabel = m.meterType === 'electricity' ? 'Công tơ điện' : 'Công tơ nước';
            var typeColor = m.meterType === 'electricity' ? ['#a5680c', '#fff4df'] : ['#0d65d5', '#eaf3ff'];
            return '<tr><td><strong>' + escapeHtml(building ? (building.shortName || building.name) : '—') + '</strong><br><span style="color:#94a3b8;font-size:.78rem;">' + escapeHtml(apt ? apt.name : '—') + '</span></td>' +
                '<td>' + badge(typeLabel, typeColor[0], typeColor[1]) + '</td>' +
                '<td>' + escapeHtml(m.meterCode || '—') + '</td><td>' + (m.previousIndex || 0) + '</td><td>' + (m.latestIndex || 0) + '</td>' +
                '<td><strong>' + (m.consumption || 0) + '</strong></td><td>' + escapeHtml(meterMonthLabel(m.periodMonth)) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;"><button onclick="RHUI.openMeterForm(\'' + m.id + '\')" class="rh-row-btn" title="Sửa"><i class="fas fa-pen"></i></button>' +
                '<button onclick="RHUI.deleteMeter(\'' + m.id + '\')" class="rh-row-btn danger" title="Xoá"><i class="fas fa-trash"></i></button></td></tr>';
        }).join('');
    }

    function renderMetersTab() {
        var tab = byId('meters-tab') || (typeof window.ensureTab === 'function' ? window.ensureTab('meters') : null);
        if (!tab) return;
        var buildings = RHD.list('buildings');
        if (!Array.isArray(buildings)) buildings = [];
        var readings = RHD.list('meters');
        if (!Array.isArray(readings)) readings = [];
        var periodReadings = readings.filter(function (m) { return !m.periodMonth || m.periodMonth === meterViewState.selectedMonth; });
        var filtered = periodReadings.filter(function (m) {
            return (meterViewState.meterType === 'all' || m.meterType === meterViewState.meterType) &&
                (!meterViewState.showUnclosedOnly || !meterIsClosed(m));
        }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        var closed = periodReadings.filter(meterIsClosed).length;
        var pending = periodReadings.filter(function (m) { return m.status === 'pending' || m.status === 'review'; }).length;
        var unclosed = Math.max(0, periodReadings.length - closed - pending);
        var progress = periodReadings.length ? Math.round(closed / periodReadings.length * 100) : 0;
        var typeButton = function (value, icon, label) { return '<button type="button" class="segment-button ' + (meterViewState.meterType === value ? 'active' : '') + '" data-meter-type="' + value + '"><i class="fas ' + icon + '"></i> ' + label + '</button>'; };
        tab.innerHTML = renderDemoBanner('meters') + '<div class="meter-page">' +
            '<header class="meter-header"><div class="meter-title"><button class="back-button" type="button" onclick="switchTab(\'dashboard\')" title="Quay lại"><i class="fas fa-arrow-left"></i></button><div><h1>Ghi chỉ số</h1><p style="color:#94a3b8;font-size:.85rem;margin-top:.2rem;">Quản lý chỉ số điện và nước theo từng kỳ</p></div></div>' +
            '<div class="meter-actions"><button class="btn-icon" type="button" title="Tìm kiếm"><i class="fas fa-search"></i></button><button class="btn-icon notification-button" type="button" title="Bộ lọc"><i class="fas fa-sliders"></i><span class="notification-dot"></span></button>' + addButton('Thêm mới', "RHUI.openMeterForm()", 'meters') + '</div></header>' +
            '<div class="filter-row"><div class="filter-label"><i class="fas fa-filter"></i> Đang lọc theo:</div><button type="button" class="clear-filter" onclick="RHUI.clearMeterFilters()">Xoá lọc</button></div>' +
            '<button type="button" class="month-chip" onclick="RHUI.openMeterMonthPicker()"><i class="fas fa-check-circle"></i> Tháng: ' + escapeHtml(meterMonthLabel(meterViewState.selectedMonth)) + '</button>' +
            '<section class="card overview-card"><div class="overview-head"><h2>Tổng quan chốt chỉ số <i class="fas fa-circle-info" style="color:#94a3b8;font-size:.85rem;"></i></h2><span class="period-label">Kỳ ' + escapeHtml(meterMonthLabel(meterViewState.selectedMonth)) + '</span></div>' +
            '<div class="overview-stats"><div class="overview-stat stat-done"><span>Đã chốt</span><strong>' + closed + '/' + periodReadings.length + '</strong></div><div class="overview-stat stat-pending"><span>Chưa duyệt</span><strong>' + pending + '</strong></div><div class="overview-stat stat-unclosed"><span>Chưa chốt</span><strong>' + unclosed + '</strong></div></div><div class="progress-track"><div class="progress-value" style="width:' + progress + '%"></div></div></section>' +
            '<section class="card" style="margin-top:1.25rem;"><div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;"><div><h2 style="font-size:1rem;color:#10213c;">Danh sách bản ghi</h2><p style="color:#94a3b8;font-size:.82rem;margin-top:.25rem;">' + filtered.length + ' bản ghi trong kỳ đang chọn</p></div><div class="segmented-control" style="max-width:430px;min-width:280px;">' + typeButton('all', 'fa-layer-group', 'Tất cả') + typeButton('electricity', 'fa-bolt', 'Công tơ điện') + typeButton('water', 'fa-droplet', 'Công tơ nước') + '</div></div>' +
            (filtered.length ? '<div class="table-container"><table><thead><tr><th>Tòa nhà / Căn hộ</th><th>Loại công tơ</th><th>Mã công tơ</th><th>Chỉ số trước</th><th>Chỉ số kỳ này</th><th>Tiêu thụ</th><th>Kỳ</th><th></th></tr></thead><tbody>' + renderMeterRows(filtered) + '</tbody></table></div>' : '<div class="meter-empty"><i class="fas fa-gauge-high"></i><h2>Chưa có lần ghi chỉ số nào</h2><p>Nhấn nút thêm để ghi chỉ số mới, hoặc chỉnh bộ lọc.</p></div>') + '</section>' +
            '<button class="fab-add" type="button" onclick="RHUI.openMeterForm()" title="Thêm chỉ số"><i class="fas fa-plus"></i></button>' +
            '</div>';
        tab.querySelectorAll('[data-meter-type]').forEach(function (button) { button.addEventListener('click', function () { meterViewState.meterType = this.getAttribute('data-meter-type'); renderMetersTab(); }); });
    }

    RHUI.clearMeterFilters = function () { meterViewState.selectedMonth = new Date().toISOString().slice(0, 7); meterViewState.meterType = 'all'; meterViewState.showUnclosedOnly = false; renderMetersTab(); };

    RHUI.openMeterMonthPicker = function () {
        var existing = byId('rhMeterMonthModal');
        if (existing) existing.remove();
        var modal = document.createElement('div');
        modal.id = 'rhMeterMonthModal'; modal.className = 'meter-modal open date-modal';
        modal.innerHTML = '<div class="meter-form"><div class="form-header"><h2>Chọn kỳ ghi chỉ số</h2><button class="plain-button" type="button" title="Đóng"><i class="fas fa-xmark"></i></button></div><div class="form-section"><div class="form-field"><label>Tháng và năm</label><input id="rhMeterMonthInput" type="month" value="' + escapeHtml(meterViewState.selectedMonth) + '"></div></div><div class="date-actions"><button class="secondary-button" type="button">Huỷ</button><button class="btn-primary" type="button">Áp dụng</button></div></div>';
        document.body.appendChild(modal);
        var close = function () { modal.remove(); };
        modal.querySelector('.plain-button').onclick = close; modal.querySelector('.secondary-button').onclick = close;
        modal.querySelector('.btn-primary').onclick = function () { meterViewState.selectedMonth = byId('rhMeterMonthInput').value || meterViewState.selectedMonth; close(); renderMetersTab(); };
    };

    function refreshMeterAutofill() {
        var building = byId('mfBuilding');
        var apartment = byId('mfApartment');
        var previous = byId('mfPrevious');
        if (!building || !apartment || !previous) return;
        var apartmentId = apartment.value;
        var selectedType = document.querySelector('input[name="mfType"]:checked');
        var meterType = selectedType && selectedType.value !== 'all' ? selectedType.value : 'electricity';
        if (!apartmentId) return;
        var last = RHD.latestMeter(apartmentId, meterType);
        previous.value = last ? last.latestIndex : 0;
        computeConsumption();
    }

    function computeConsumption() {
        if (!byId('mfPrevious') || !byId('mfLatest') || !byId('mfConsumption')) return;
        var prev = Number(byId('mfPrevious').value) || 0;
        var latest = Number(byId('mfLatest').value) || 0;
        byId('mfConsumption').textContent = Math.max(0, latest - prev);
    }

    RHUI.openMeterForm = function (id) {
        var m = id ? RHD.get('meters', id) : null;
        RHUI.drawerEntity = 'meters';
        RHUI.drawerId = id || null;
        var buildings = RHD.list('buildings');
        if (!Array.isArray(buildings)) buildings = [];
        var defaultBuildingId = m ? m.buildingId : (buildings[0] && buildings[0].id);
        var apartments = RHD.apartmentsOf(defaultBuildingId);
        var meterType = m ? m.meterType : 'electricity';
        var hasApartments = apartments.length > 0;

        var typeOption = function (value, icon, label) {
            return '<label class="segment-button ' + (meterType === value ? 'active' : '') + '" style="display:flex;align-items:center;justify-content:center;gap:.3rem;"><input type="radio" name="mfType" value="' + value + '" ' + (meterType === value ? 'checked' : '') + ' style="position:absolute;opacity:0;"> <i class="fas ' + icon + '"></i> ' + label + '</label>';
        };
        var html = '<form onsubmit="RHUI.submitMeterForm(event)"><div class="form-header"><button type="button" class="plain-button" onclick="RHUI.closeDrawer()" title="Đóng"><i class="fas fa-xmark"></i></button><h2>' + (m ? 'Chỉnh sửa chỉ số' : 'Thêm chỉ số') + '</h2><button type="button" class="plain-button" title="Lịch sử"><i class="fas fa-clock-rotate-left"></i></button></div>' +
            '<div class="form-section"><div class="form-section-title">THÔNG TIN CHUNG</div><div class="form-grid">' +
            '<div class="form-field"><label for="mfPeriod">Tháng chốt *</label><input id="mfPeriod" type="month" required value="' + escapeHtml(m ? m.periodMonth : meterViewState.selectedMonth) + '"></div>' +
            '<div class="form-field"><label for="mfClosingDate">Ngày chốt *</label><input id="mfClosingDate" type="date" required value="' + escapeHtml(m ? m.closingDate : meterViewState.selectedDate) + '"></div>' +
            '<div class="form-field"><label for="mfBuilding">Toà nhà *</label><select id="mfBuilding" required>' + selectOptions(buildings, 'id', function (b) { return b.name; }, defaultBuildingId, 'Chọn toà nhà') + '</select></div>' +
            '<div class="form-field"><label for="mfApartment">Căn hộ</label><select id="mfApartment" required>' + selectOptions(apartments, 'id', 'name', m ? m.apartmentId : (apartments[0] && apartments[0].id), 'Chọn căn hộ') + '</select></div>' +
            '<div class="form-field" style="grid-column:1/-1;"><label>Loại công tơ *</label><div class="segmented-control" id="mfTypeControl">' + typeOption('all', 'fa-layer-group', 'Tất cả') + typeOption('electricity', 'fa-bolt', 'Công tơ điện') + typeOption('water', 'fa-droplet', 'Công tơ nước') + '</div><input type="hidden" id="mfCode" value="' + escapeHtml(m ? m.meterCode : '') + '"></div>' +
            '<label class="toggle-row" style="grid-column:1/-1;"><input class="toggle-input" id="mfUnclosedOnly" type="checkbox"> <span>Chỉ hiện công tơ chưa chốt trong tháng</span></label></div></div>' +
            '<div class="form-section"><div class="form-section-title">CHỈ SỐ</div>' +
            (hasApartments ? '<div class="form-grid"><div class="form-field"><label for="mfPrevious">Chỉ số kỳ trước</label><input id="mfPrevious" type="number" min="0" value="' + (m ? m.previousIndex : 0) + '" oninput="RHUI.recalcMeter()"></div><div class="form-field"><label for="mfLatest">Chỉ số kỳ này *</label><input id="mfLatest" type="number" min="0" required value="' + (m ? m.latestIndex : '') + '" oninput="RHUI.recalcMeter()"></div><div class="form-field"><label>Tiêu thụ</label><div id="mfConsumption" style="padding:.7rem 0;font-weight:800;font-size:1.1rem;color:#0d65d5;">' + (m ? m.consumption : 0) + '</div></div><div class="form-field"><label>Ảnh chỉ số công tơ</label><input id="mfPhoto" type="file" accept="image/*"><input type="hidden" id="mfPhotoData" value="' + escapeHtml(m ? m.photo : '') + '"></div></div>' : '<div class="form-empty"><i class="fas fa-gauge-high"></i><strong>Không có dữ liệu trả về</strong><p>Vui lòng kiểm tra lại dữ liệu toà nhà và căn hộ.</p></div>') +
            '</div><div id="mfError" style="color:#ef4444;font-size:.85rem;margin-top:1rem;"></div><div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.25rem;"><button type="button" class="secondary-button" onclick="RHUI.closeDrawer()">Huỷ</button><button type="submit" class="btn-primary"' + (hasApartments ? '' : ' disabled') + '>Lưu chỉ số</button></div></form>';

        openDrawer(m ? 'Sửa bản ghi chỉ số' : 'Thêm bản ghi chỉ số', html);
        byId('mfBuilding').addEventListener('change', function () {
            var apts = RHD.apartmentsOf(this.value);
            byId('mfApartment').innerHTML = selectOptions(apts, 'id', 'name');
            refreshMeterAutofill();
        });
        byId('mfApartment').addEventListener('change', refreshMeterAutofill);
        document.querySelectorAll('input[name="mfType"]').forEach(function (r) { r.addEventListener('change', function () { document.querySelectorAll('#mfTypeControl .segment-button').forEach(function (el) { el.classList.toggle('active', el.querySelector('input').checked); }); refreshMeterAutofill(); }); });
        var photo = byId('mfPhoto');
        if (photo) photo.addEventListener('change', function () { readFileAsDataUrl(this, function (d) { byId('mfPhotoData').value = d; }); });
        byId('mfPeriod').addEventListener('change', function () { meterViewState.selectedMonth = this.value || meterViewState.selectedMonth; });
        byId('mfClosingDate').addEventListener('change', function () { meterViewState.selectedDate = this.value || meterViewState.selectedDate; });
        byId('mfUnclosedOnly').addEventListener('change', function () { meterViewState.showUnclosedOnly = this.checked; });
        if (!m) refreshMeterAutofill();
    };

    RHUI.recalcMeter = function () { computeConsumption(); };

    RHUI.submitMeterForm = function (ev) {
        ev.preventDefault();
        var selectedType = document.querySelector('input[name="mfType"]:checked');
        var meterType = selectedType && selectedType.value !== 'all' ? selectedType.value : 'electricity';
        var previous = Number(byId('mfPrevious').value) || 0;
        var latest = Number(byId('mfLatest').value) || 0;
        var data = {
            buildingId: byId('mfBuilding').value,
            apartmentId: byId('mfApartment').value,
            meterType: meterType,
            meterCode: byId('mfCode').value.trim(),
            periodMonth: byId('mfPeriod').value,
            closingDate: byId('mfClosingDate').value,
            previousIndex: previous,
            latestIndex: latest,
            consumption: Math.max(0, latest - previous),
            photo: byId('mfPhotoData').value
        };
        var res = RHUI.drawerId ? RHD.update('meters', RHUI.drawerId, data) : RHD.create('meters', data);
        if (!res.ok) { byId('mfError').textContent = res.error; return; }
        closeDrawer();
        renderMetersTab();
        renderDashboardCounts();
    };

    RHUI.deleteMeter = function (id) {
        confirmDelete('meters', id, function () { renderMetersTab(); renderDashboardCounts(); });
    };

    // ============================================================= CONTRACTS

    function renderContractsTab(filter) {
        var tab = byId('contracts-tab');
        if (!tab) return;
        var buildings = RHD.list('buildings');
        var customers = RHD.list('customers');
        if (!buildings.length || !RHD.list('apartments').length || !customers.length) {
            tab.innerHTML = renderDemoBanner('contracts') + '<div class="card">' + emptyState('fa-file-contract', 'Cần có Tòa nhà, Căn hộ và Khách hàng trước khi lập hợp đồng.') + '</div>';
            return;
        }
        var contracts = RHD.list('contracts').slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
        var filterLabel = '';
        if (filter === 'expiring') {
            var todayStr = new Date().toISOString().slice(0, 10);
            var in30 = new Date(); in30.setDate(in30.getDate() + 30);
            var in30Str = in30.toISOString().slice(0, 10);
            filterLabel = 'Đang lọc: Sắp hết hạn (trong 30 ngày)';
            contracts = contracts.filter(function (c) { return c.status === 'active' && c.endDate && c.endDate >= todayStr && c.endDate <= in30Str; });
        }
        var rows = contracts.map(function (c) {
            var building = RHD.get('buildings', c.buildingId);
            var apt = RHD.get('apartments', c.apartmentId);
            var cus = RHD.get('customers', c.customerId);
            return '<tr>' +
                '<td><strong>' + escapeHtml(c.code) + '</strong></td>' +
                '<td>' + escapeHtml(building ? building.shortName : '—') + ' / ' + escapeHtml(apt ? apt.name : '—') + '</td>' +
                '<td>' + escapeHtml(cus ? cus.fullName : '—') + '</td>' +
                '<td>' + fmtDate(c.startDate) + ' → ' + fmtDate(c.endDate) + '</td>' +
                '<td>' + money(c.rentPrice) + '</td>' +
                '<td>' + badge(c.status === 'active' ? 'Đang hiệu lực' : 'Đã kết thúc', c.status === 'active' ? '#18a878' : '#61708a', c.status === 'active' ? '#e6f8ef' : '#f1f5f9') + '</td>' +
                '<td style="text-align:right;white-space:nowrap;">' +
                '<button onclick="RHUI.openContractForm(\'' + c.id + '\')" class="rh-row-btn" title="Sửa"><i class="fas fa-pen"></i></button>' +
                '<button onclick="RHUI.deleteContract(\'' + c.id + '\')" class="rh-row-btn danger" title="Xoá"><i class="fas fa-trash"></i></button>' +
                '</td></tr>';
        }).join('');

        tab.innerHTML = renderDemoBanner('contracts') +
            (filterLabel ? '<div style="align-items:center;background:#eaf3ff;border:1px solid #9ccaff;border-radius:10px;color:#0d65d5;display:flex;font-size:.85rem;font-weight:600;gap:.6rem;margin-bottom:1rem;padding:.6rem 1rem;">' + filterLabel + '<button onclick="RHUI.renderContractsTab()" style="background:none;border:0;color:#0d65d5;cursor:pointer;font:inherit;font-weight:700;margin-left:auto;">Xoá lọc ×</button></div>' : '') +
            '<div class="card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div><h2 style="font-size:1.4rem;font-weight:700;color:#10213c;">Hợp đồng</h2><p style="color:#94a3b8;font-size:.875rem;margin-top:.25rem;">Chọn Tòa nhà → Căn hộ → Khách hàng để tự động điền thông tin.</p></div>' +
            addButton('Thêm hợp đồng', "RHUI.openContractForm()", 'contracts') +
            '</div>' +
            (contracts.length ? '<div class="table-container"><table><thead><tr><th>Mã HĐ</th><th>Căn hộ</th><th>Khách hàng</th><th>Thời hạn</th><th>Tiền thuê</th><th>Trạng thái</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
                : emptyState('fa-file-contract', filter ? 'Không có hợp đồng phù hợp bộ lọc.' : 'Chưa có hợp đồng nào.')) +
            '</div>';
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

    RHUI.openContractForm = function (id) {
        var c = id ? RHD.get('contracts', id) : null;
        RHUI.drawerEntity = 'contracts';
        RHUI.drawerId = id || null;
        var buildings = RHD.list('buildings');
        var customers = RHD.list('customers');
        var defaultBuildingId = c ? c.buildingId : buildings[0].id;
        var apartments = RHD.apartmentsOf(defaultBuildingId);
        var building = RHD.get('buildings', defaultBuildingId);
        var checkedIds = c ? (c.serviceIds || []) : building.services.filter(function (s) { return s.feeType !== 'deposit' && s.feeType !== 'rent'; }).map(function (s) { return s.id; });
        var overrides = c ? (c.serviceOverrides || {}) : {};

        var html = '<form onsubmit="RHUI.submitContractForm(event)">' +
            '<div class="rh-grid-2">' +
            '<div class="rh-field"><label>Tòa nhà *</label><select id="cfBuildingSel" required>' + selectOptions(buildings, 'id', 'name', defaultBuildingId) + '</select></div>' +
            '<div class="rh-field"><label>Căn hộ *</label><select id="cfApartmentSel" required>' + selectOptions(apartments, 'id', 'name', c ? c.apartmentId : (apartments[0] && apartments[0].id)) + '</select></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Khách hàng *</label><select id="cfCustomerSel" required>' + selectOptions(customers, 'id', function (cu) { return cu.fullName + ' — ' + cu.phone; }, c ? c.customerId : '', 'Chọn khách hàng') + '</select></div>' +
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

        if (!RHUI.drawerId && apartment && (apartment.status === 'vacant' || apartment.status === 'deposited')) {
            RHD.update('apartments', apartment.id, { status: 'occupied' });
        }

        closeDrawer();
        renderContractsTab();
        renderApartmentsTab();
        renderDashboardCounts();
    };

    RHUI.deleteContract = function (id) {
        var hasInvoice = RHD.list('invoices').some(function (i) { return i.contractId === id; });
        confirmDelete('contracts', id, function () { renderContractsTab(); renderDashboardCounts(); }, hasInvoice ? 'Không thể xoá: hợp đồng đang gắn với hóa đơn.' : null);
    };

    // ============================================================== INVOICES

    function renderInvoicesTab(filter) {
        var tab = byId('invoices-tab');
        if (!tab) return;
        var contracts = RHD.list('contracts');
        if (!contracts.length) {
            tab.innerHTML = renderDemoBanner('invoices') + '<div class="card">' + emptyState('fa-receipt', 'Cần có Hợp đồng trước khi lập hóa đơn.') + '</div>';
            return;
        }
        var todayStr = new Date().toISOString().slice(0, 10);
        var invoices = RHD.list('invoices').slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
        var filterLabel = '';
        if (filter === 'overdue') {
            filterLabel = 'Đang lọc: Quá hạn';
            invoices = invoices.filter(function (i) { return i.status === 'overdue' || (i.status !== 'paid' && i.dueDate && i.dueDate < todayStr); });
        } else if (filter === 'unpaid') {
            filterLabel = 'Đang lọc: Chưa thanh toán';
            invoices = invoices.filter(function (i) { return i.status !== 'paid'; });
        }
        var rows = invoices.map(function (inv) {
            var apt = RHD.get('apartments', inv.apartmentId);
            var cus = RHD.get('customers', inv.customerId);
            var st = statusMeta(RHD.INVOICE_STATUSES, inv.status);
            return '<tr>' +
                '<td><input type="checkbox" class="rh-invoice-check" value="' + inv.id + '"></td>' +
                '<td><strong>' + escapeHtml(inv.code) + '</strong></td>' +
                '<td>' + escapeHtml(apt ? apt.name : '—') + '</td>' +
                '<td>' + escapeHtml(cus ? cus.fullName : '—') + '</td>' +
                '<td>' + escapeHtml(inv.period || '—') + '</td>' +
                '<td>' + money(inv.total) + '</td>' +
                '<td>' + badge(st.label, st.color, st.bg) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;">' +
                '<button onclick="RHUI.previewInvoice(\'' + inv.id + '\')" class="rh-row-btn" title="Xem trước"><i class="fas fa-eye"></i></button>' +
                '<button onclick="RHUI.openInvoiceForm(\'' + inv.id + '\')" class="rh-row-btn" title="Sửa"><i class="fas fa-pen"></i></button>' +
                '<button onclick="RHUI.markInvoicePaid(\'' + inv.id + '\')" class="rh-row-btn" title="Đánh dấu đã thanh toán"><i class="fas fa-check"></i></button>' +
                '<button onclick="RHUI.deleteInvoice(\'' + inv.id + '\')" class="rh-row-btn danger" title="Xoá"><i class="fas fa-trash"></i></button>' +
                '</td></tr>';
        }).join('');

        tab.innerHTML = renderDemoBanner('invoices') +
            (filterLabel ? '<div style="align-items:center;background:#eaf3ff;border:1px solid #9ccaff;border-radius:10px;color:#0d65d5;display:flex;font-size:.85rem;font-weight:600;gap:.6rem;margin-bottom:1rem;padding:.6rem 1rem;">' + filterLabel + '<button onclick="RHUI.renderInvoicesTab()" style="background:none;border:0;color:#0d65d5;cursor:pointer;font:inherit;font-weight:700;margin-left:auto;">Xoá lọc ×</button></div>' : '') +
            '<div class="card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div><h2 style="font-size:1.4rem;font-weight:700;color:#10213c;">Hóa đơn</h2><p style="color:#94a3b8;font-size:.875rem;margin-top:.25rem;">Chọn Hợp đồng để tự động điền dịch vụ, phí và chỉ số điện/nước.</p></div>' +
            '<div style="display:flex;gap:.6rem;">' +
            '<button onclick="RHUI.sendSelectedInvoices()" style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:.65rem 1rem;font:inherit;font-weight:600;cursor:pointer;"><i class="fas fa-paper-plane"></i> Gửi hàng loạt</button>' +
            addButton('Thêm hóa đơn', "RHUI.openInvoiceForm()", 'invoices') +
            '</div></div>' +
            (invoices.length ? '<div class="table-container"><table><thead><tr><th style="width:36px;"></th><th>Mã HĐ</th><th>Căn hộ</th><th>Khách hàng</th><th>Kỳ</th><th>Thành tiền</th><th>Trạng thái</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
                : emptyState('fa-receipt', filter ? 'Không có hóa đơn phù hợp bộ lọc.' : 'Chưa có hóa đơn nào.')) +
            '</div>';
    }

    function invoiceContractLabel(c) {
        var apt = RHD.get('apartments', c.apartmentId);
        var cus = RHD.get('customers', c.customerId);
        return c.code + ' — ' + (apt ? apt.name : '?') + ' — ' + (cus ? cus.fullName : '?');
    }

    function buildInvoiceLineItems(contract, periodMonth) {
        var building = RHD.get('buildings', contract.buildingId);
        var items = [];
        var serviceIds = contract.serviceIds || [];
        var overrides = contract.serviceOverrides || {};

        items.push({ serviceId: 'rent', label: 'Tiền thuê nhà', qty: 1, unitPrice: contract.rentPrice, amount: contract.rentPrice, tax: 0 });

        (building.services || []).forEach(function (s) {
            if (s.feeType === 'rent' || s.feeType === 'deposit') return;
            if (serviceIds.indexOf(s.id) === -1) return;
            var svc = Object.assign({}, s, { unitPrice: overrides[s.id] != null ? overrides[s.id] : s.unitPrice });
            var ctx = {};
            var label = svc.name;
            if (svc.calcMethod === 'meter') {
                var meterType = s.feeType === 'water' ? 'water' : 'electricity';
                var readings = RHD.list('meters').filter(function (m) { return m.apartmentId === contract.apartmentId && m.meterType === meterType && (!periodMonth || m.periodMonth === periodMonth); });
                readings.sort(function (a, b) { return b.createdAt - a.createdAt; });
                var reading = readings[0] || RHD.latestMeter(contract.apartmentId, meterType);
                ctx.meterReading = reading;
                label += reading ? ' (' + reading.consumption + (meterType === 'water' ? ' m³' : ' kWh') + ')' : ' (chưa có chỉ số kỳ này)';
            }
            var line = RHD.calcServiceAmount(svc, ctx);
            items.push({ serviceId: s.id, label: label, qty: line.qty, unitPrice: line.unitPrice, amount: line.amount, tax: line.tax });
        });

        var subtotal = items.reduce(function (sum, it) { return sum + it.amount; }, 0);
        var tax = items.reduce(function (sum, it) { return sum + it.tax; }, 0);
        return { items: items, subtotal: subtotal, tax: tax, total: subtotal + tax };
    }

    function renderInvoiceLineRows(calc) {
        return calc.items.map(function (it) {
            return '<tr><td>' + escapeHtml(it.label) + '</td><td style="text-align:right;">' + money(it.amount) + '</td><td style="text-align:right;">' + money(it.tax) + '</td></tr>';
        }).join('');
    }

    function refreshInvoiceFromContract() {
        var contract = RHD.get('contracts', byId('ifContract').value);
        if (!contract) return;
        var building = RHD.get('buildings', contract.buildingId);
        var apt = RHD.get('apartments', contract.apartmentId);
        var cus = RHD.get('customers', contract.customerId);
        byId('ifBuildingLabel').textContent = building ? building.name : '—';
        byId('ifApartmentLabel').textContent = apt ? apt.name : '—';
        byId('ifCustomerLabel').textContent = cus ? cus.fullName + ' · ' + cus.phone : '—';
        var period = byId('ifPeriod').value;
        var calc = buildInvoiceLineItems(contract, period);
        byId('ifLineRows').innerHTML = renderInvoiceLineRows(calc);
        byId('ifSubtotal').textContent = money(calc.subtotal);
        byId('ifTax').textContent = money(calc.tax);
        byId('ifTotal').textContent = money(calc.total);
        byId('ifCalcCache').value = JSON.stringify(calc);
    }

    RHUI.openInvoiceForm = function (id) {
        var inv = id ? RHD.get('invoices', id) : null;
        RHUI.drawerEntity = 'invoices';
        RHUI.drawerId = id || null;
        var contracts = RHD.list('contracts');
        var defaultContractId = inv ? inv.contractId : contracts[0].id;
        var today = new Date().toISOString().slice(0, 10);
        var defaultPeriod = inv ? inv.period : today.slice(0, 7);

        var html = '<form onsubmit="RHUI.submitInvoiceForm(event)">' +
            '<div class="rh-grid-2">' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Hợp đồng *</label><select id="ifContract" required>' + selectOptions(contracts, 'id', invoiceContractLabel, defaultContractId) + '</select></div>' +
            '<div class="rh-field"><label>Kỳ thanh toán</label><input id="ifPeriod" type="month" value="' + escapeHtml(defaultPeriod) + '"></div>' +
            '<div class="rh-field"><label>Ngày lập hóa đơn</label><input id="ifIssueDate" type="date" value="' + escapeHtml(inv ? inv.issueDate : today) + '"></div>' +
            '<div class="rh-field"><label>Hạn thanh toán</label><input id="ifDueDate" type="date" value="' + escapeHtml(inv ? inv.dueDate : '') + '"></div>' +
            '<div class="rh-field"><label>Trạng thái</label><select id="ifStatus">' + selectOptions(RHD.INVOICE_STATUSES, 'id', 'label', inv ? inv.status : 'unpaid') + '</select></div>' +
            '</div>' +
            '<div class="rh-section"><div class="rh-section-title">Thông tin chung (tự động)</div>' +
            '<div class="rh-grid-2">' +
            '<div><label style="font-size:.8rem;color:#94a3b8;">Tòa nhà</label><div id="ifBuildingLabel" style="font-weight:600;">—</div></div>' +
            '<div><label style="font-size:.8rem;color:#94a3b8;">Căn hộ</label><div id="ifApartmentLabel" style="font-weight:600;">—</div></div>' +
            '<div style="grid-column:1/-1;"><label style="font-size:.8rem;color:#94a3b8;">Khách hàng</label><div id="ifCustomerLabel" style="font-weight:600;">—</div></div>' +
            '</div></div>' +
            '<div class="rh-section"><div class="rh-section-title">Dịch vụ & phí</div>' +
            '<table style="width:100%;"><thead><tr><th style="text-align:left;">Khoản mục</th><th style="text-align:right;">Thành tiền</th><th style="text-align:right;">Thuế</th></tr></thead>' +
            '<tbody id="ifLineRows"></tbody></table>' +
            '<div style="text-align:right;margin-top:.75rem;font-size:.9rem;color:#475569;">Tổng tiền: <strong id="ifSubtotal">0đ</strong></div>' +
            '<div style="text-align:right;font-size:.9rem;color:#475569;">Thuế: <strong id="ifTax">0đ</strong></div>' +
            '<div style="text-align:right;font-size:1.1rem;color:#10213c;margin-top:.25rem;">Thành tiền: <strong id="ifTotal" style="color:#0d65d5;">0đ</strong></div>' +
            '<input type="hidden" id="ifCalcCache"></div>' +
            '<div id="ifError" style="color:#ef4444;font-size:.85rem;margin-top:1rem;"></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;">' +
            '<button type="submit" class="btn-primary">Lưu hóa đơn</button>' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Huỷ</button>' +
            '</div></form>';

        openDrawer(inv ? 'Sửa hóa đơn' : 'Thêm hóa đơn', html);
        byId('ifContract').addEventListener('change', refreshInvoiceFromContract);
        byId('ifPeriod').addEventListener('change', refreshInvoiceFromContract);
        refreshInvoiceFromContract();
    };

    RHUI.submitInvoiceForm = function (ev) {
        ev.preventDefault();
        var contract = RHD.get('contracts', byId('ifContract').value);
        if (!contract) { byId('ifError').textContent = 'Vui lòng chọn hợp đồng.'; return; }
        var calc = JSON.parse(byId('ifCalcCache').value || '{"items":[],"subtotal":0,"tax":0,"total":0}');
        var data = {
            contractId: contract.id,
            buildingId: contract.buildingId,
            apartmentId: contract.apartmentId,
            customerId: contract.customerId,
            invoiceTemplateId: contract.invoiceTemplateId,
            period: byId('ifPeriod').value,
            issueDate: byId('ifIssueDate').value,
            dueDate: byId('ifDueDate').value,
            items: calc.items,
            subtotal: calc.subtotal,
            tax: calc.tax,
            total: calc.total,
            status: byId('ifStatus').value
        };
        var res;
        if (RHUI.drawerId) {
            res = RHD.update('invoices', RHUI.drawerId, data);
        } else {
            data.code = RHD.nextInvoiceCode();
            res = RHD.create('invoices', data);
        }
        if (!res.ok) { byId('ifError').textContent = res.error; return; }
        if (window.RH && RH.syncManagerRecord) RH.syncManagerRecord(res.item, 'invoice');
        closeDrawer();
        renderInvoicesTab();
        renderDashboardCounts();
    };

    RHUI.deleteInvoice = function (id) {
        confirmDelete('invoices', id, function () { renderInvoicesTab(); renderDashboardCounts(); });
    };

    RHUI.markInvoicePaid = function (id) {
        var result = RHD.update('invoices', id, { status: 'paid', paidAt: Date.now() });
        if (result.ok && window.RH && RH.syncManagerRecord) RH.syncManagerRecord(result.item, 'invoice');
        renderInvoicesTab();
    };

    RHUI.sendSelectedInvoices = function () {
        var ids = Array.prototype.map.call(document.querySelectorAll('.rh-invoice-check:checked'), function (el) { return el.value; });
        if (!ids.length) { alert('Vui lòng chọn ít nhất một hóa đơn để gửi.'); return; }
        ids.forEach(function (id) {
            var inv = RHD.get('invoices', id);
            if (inv && inv.status === 'unpaid') {
                var result = RHD.update('invoices', id, { status: 'sent', sentAt: Date.now() });
                if (result.ok && window.RH && RH.syncManagerRecord) RH.syncManagerRecord(result.item, 'invoice');
            }
        });
        alert('Đã gửi ' + ids.length + ' hóa đơn tới thông tin liên hệ của khách hàng.');
        renderInvoicesTab();
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
        var elecReading = RHD.latestMeter(inv.apartmentId, 'electricity');
        var waterReading = RHD.latestMeter(inv.apartmentId, 'water');
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
        var tpl = inv.invoiceTemplateId ? RHT.get(inv.invoiceTemplateId) : RHT.getDefault('INVOICE');
        var rendered = tpl ? RHT.render(tpl.html_template, invoiceTemplateData(inv, tpl)) : '<p>Không tìm thấy mẫu hóa đơn.</p>';
        var html = '<div class="rh-print-area">' + rendered + '</div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;">' +
            '<button type="button" class="btn-primary" onclick="RHUI.sendOneInvoice(\'' + inv.id + '\')">Gửi hóa đơn</button>' +
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
            sign_date: '28/12/2025', nights: 3, rate_per_night: '450.000đ', room_charge: '1.350.000đ', other_fees: '100.000đ',
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
        var result = RHD.update('invoices', id, { status: 'sent', sentAt: Date.now() });
        if (result.ok && window.RH && RH.syncManagerRecord) RH.syncManagerRecord(result.item, 'invoice');
        closeDrawer();
        renderInvoicesTab();
    };

    // ======================================================= SUPPORT REQUESTS
    // Shared with the resident app: a request submitted in resident-web.html
    // (RHD.create('supportRequests', ...)) lands here untouched, and a status
    // change made here is what the resident sees reflected on their side.

    function renderSupportTab() {
        var tab = byId('support-tab');
        if (!tab) return;
        var requests = RHD.list('supportRequests').slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
        var rows = requests.map(function (r) {
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
                '<button onclick="RHUI.openSupportForm(\'' + r.id + '\')" class="rh-row-btn" title="Xử lý"><i class="fas fa-pen"></i></button>' +
                '</td></tr>';
        }).join('');

        tab.innerHTML = '<div class="card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div><h2 style="font-size:1.4rem;font-weight:700;color:#10213c;">Yêu cầu hỗ trợ</h2><p style="color:#94a3b8;font-size:.875rem;margin-top:.25rem;">Yêu cầu do cư dân gửi từ ứng dụng — cập nhật trạng thái tại đây sẽ phản ánh ngay bên cư dân.</p></div>' +
            '</div>' +
            (requests.length ? '<div class="table-container"><table><thead><tr><th>Mã YC</th><th>Người gửi</th><th>Căn hộ</th><th>Nội dung</th><th>Mức độ</th><th>Trạng thái</th><th>Người phụ trách</th><th>Thời gian gửi</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
                : emptyState('fa-headset', 'Chưa có yêu cầu hỗ trợ nào từ cư dân.')) +
            '</div>';
    }

    RHUI.openSupportForm = function (id) {
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
            '<div class="rh-field"><label>Người phụ trách</label><input id="srAssignee" value="' + escapeHtml(r.assignee || '') + '" placeholder="Tên nhân viên xử lý"></div>' +
            '</div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;">' +
            '<button type="submit" class="btn-primary">Cập nhật</button>' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Đóng</button>' +
            '</div></form>';
        openDrawer('Yêu cầu ' + r.code, html);
    };

    RHUI.submitSupportForm = function (ev) {
        ev.preventDefault();
        RHD.update('supportRequests', RHUI.drawerId, {
            status: byId('srStatus').value,
            assignee: byId('srAssignee').value.trim(),
            updatedAt: Date.now()
        });
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
        RHD.list('buildings').forEach(function (b) { events.push({ t: b.createdAt, icon: 'fa-building', color: '#667eea', label: 'Tạo tòa nhà', detail: b.name }); });
        RHD.list('apartments').forEach(function (a) { events.push({ t: a.createdAt, icon: 'fa-door-open', color: '#1683ff', label: 'Tạo căn hộ', detail: a.name }); });
        RHD.list('customers').forEach(function (c) { events.push({ t: c.createdAt, icon: 'fa-user-plus', color: '#f59e0b', label: 'Thêm cư dân', detail: c.fullName }); });
        RHD.list('contracts').forEach(function (c) {
            var cus = RHD.get('customers', c.customerId);
            events.push({ t: c.createdAt, icon: 'fa-file-signature', color: '#10b981', label: 'Lập hợp đồng', detail: c.code + (cus ? ' — ' + cus.fullName : '') });
        });
        RHD.list('meters').forEach(function (m) { events.push({ t: m.createdAt, icon: 'fa-gauge', color: '#0284c7', label: 'Ghi chỉ số', detail: (m.meterType === 'electricity' ? 'Điện' : 'Nước') + ' ' + (m.meterCode || '') }); });
        RHD.list('invoices').forEach(function (inv) { events.push({ t: inv.createdAt, icon: 'fa-receipt', color: '#7c3aed', label: 'Tạo hóa đơn', detail: inv.code + ' — ' + money(inv.total) }); });
        RHD.list('supportRequests').forEach(function (r) {
            events.push({ t: r.createdAt, icon: 'fa-headset', color: '#f59e0b', label: 'Cư dân gửi yêu cầu', detail: r.code + ' — ' + r.title });
            if (r.updatedAt && r.updatedAt !== r.createdAt) events.push({ t: r.updatedAt, icon: 'fa-check-circle', color: '#10b981', label: 'Xử lý yêu cầu', detail: r.code + ' — ' + statusMeta(RHD.SUPPORT_STATUSES, r.status).label });
        });
        events.sort(function (a, b) { return b.t - a.t; });
        var top = events.slice(0, 10);
        body.innerHTML = top.length ? top.map(function (e) {
            return '<tr><td><i class="fas ' + e.icon + '" style="color:' + e.color + ';margin-right:.5rem;"></i>' + escapeHtml(e.label) + '</td><td>' + escapeHtml(e.detail) + '</td><td>' + timeAgo(e.t) + '</td></tr>';
        }).join('') : '<tr class="activity-empty"><td colspan="3">Chưa có hoạt động</td></tr>';
    }

    function renderDashboardCounts() {
        var anchor = byId('kpiBuildings');
        if (!anchor) return;

        var buildings = RHD.list('buildings');
        var apartments = RHD.list('apartments');
        var customers = RHD.list('customers');
        var contracts = RHD.list('contracts');
        var meters = RHD.list('meters');
        var invoices = RHD.list('invoices');
        var requests = RHD.list('supportRequests');

        var todayStr = new Date().toISOString().slice(0, 10);
        var now = new Date();
        var curMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

        // Row 1 — Tổng quan
        byId('kpiBuildings').textContent = buildings.length;
        byId('kpiApartments').textContent = apartments.length;
        byId('kpiCustomers').textContent = customers.length;
        byId('kpiVacant').textContent = apartments.filter(function (a) { return a.status === 'vacant'; }).length;

        // Row 2 — Tài chính
        var revenueMonth = invoices.filter(function (i) {
            if (i.status !== 'paid' || !i.paidAt) return false;
            var d = new Date(i.paidAt);
            return (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')) === curMonthKey;
        }).reduce(function (s, i) { return s + i.total; }, 0);
        var collected = invoices.filter(function (i) { return i.status === 'paid'; }).reduce(function (s, i) { return s + i.total; }, 0);
        var overdueInvoices = invoices.filter(function (i) { return i.status === 'overdue' || (i.status !== 'paid' && i.dueDate && i.dueDate < todayStr); });
        var debt = invoices.filter(function (i) { return i.status !== 'paid'; }).reduce(function (s, i) { return s + i.total; }, 0);
        byId('kpiRevenueMonth').textContent = money(revenueMonth);
        byId('kpiCollected').textContent = money(collected);
        byId('kpiDebt').textContent = money(debt);
        byId('kpiOverdueCount').textContent = overdueInvoices.length;

        // Row 3 — Dữ liệu hệ thống
        byId('sysBuildings').textContent = buildings.length;
        byId('sysApartments').textContent = apartments.length;
        byId('sysCustomers').textContent = customers.length;
        byId('sysContracts').textContent = contracts.length;
        byId('sysMeters').textContent = meters.length;
        byId('sysInvoices').textContent = invoices.length;

        // Row 4 — Cần xử lý
        var openRequests = requests.filter(function (r) { return r.status === 'new' || r.status === 'in_progress'; });
        var unpaidInvoices = invoices.filter(function (i) { return i.status !== 'paid'; });
        var in30 = new Date(); in30.setDate(in30.getDate() + 30);
        var in30Str = in30.toISOString().slice(0, 10);
        var expiringContracts = contracts.filter(function (c) { return c.status === 'active' && c.endDate && c.endDate >= todayStr && c.endDate <= in30Str; });

        setTodo('todoRequests', 'todoRequestsNote', openRequests.length, 'yêu cầu cần xử lý', 'Không có yêu cầu cần xử lý');
        setTodo('todoUnpaid', 'todoUnpaidNote', unpaidInvoices.length, 'hóa đơn cần thanh toán', 'Không có hóa đơn cần thanh toán');
        setTodo('todoExpiring', 'todoExpiringNote', expiringContracts.length, 'hợp đồng sắp hết hạn', 'Không có hợp đồng sắp hết hạn');

        if (typeof updateDashboardCharts === 'function') updateDashboardCharts();
        renderRecentActivity();
    }

    global.RHUI = Object.assign(RHUI, {
        closeDrawer: closeDrawer,
        renderBuildingsTab: renderBuildingsTab,
        renderApartmentsTab: renderApartmentsTab,
        renderCustomersTab: renderCustomersTab,
        renderMetersTab: renderMetersTab,
        renderContractsTab: renderContractsTab,
        renderInvoicesTab: renderInvoicesTab,
        renderSupportTab: renderSupportTab,
        renderDashboardCounts: renderDashboardCounts,
        renderDemoBanner: renderDemoBanner
    });
})(window);
