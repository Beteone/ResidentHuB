/*
 * ResidentHub - "Tài sản" module: Building -> Apartment -> Asset.
 * Assets and asset types live in RHD (data.js, entities 'assets' and
 * 'assetTypes'); an asset stores only typeId / buildingId / apartmentId and
 * every name is resolved on render, so renaming a building, apartment or type
 * shows up here immediately. Access is governed by permissions.js
 * (assets.* / assetTypes.*) and the user's building scope.
 * Depends on: data.js (RHD), permissions.js (RHP), searchable-select.js
 * (RHSelect), manager-modules.js (RHUI + RHUI.util). Loaded by dashboard.html.
 */
(function (global) {
    var U = function () { return global.RHUI.util; };
    var MAX_PHOTOS = 8;

    var state = {
        filters: { q: '', buildingId: '', apartmentId: '', typeId: '', condition: '' },
        editingId: null,
        photos: [],
        fields: {},
        editingTypeId: null
    };

    function byId(id) { return document.getElementById(id); }
    function esc(s) { return U().escapeHtml(s); }
    function fold(s) { return global.RHSelect ? global.RHSelect.fold(s) : String(s || '').toLowerCase(); }

    function conditionMeta(id) { return U().statusMeta(RHD.ASSET_CONDITIONS, id); }

    function typeName(typeId) {
        var t = typeId ? RHD.get('assetTypes', typeId) : null;
        return t ? t.name : '';
    }

    function placeLabel(a) {
        var b = a.buildingId ? RHD.get('buildings', a.buildingId) : null;
        var apt = a.apartmentId ? RHD.get('apartments', a.apartmentId) : null;
        return [b ? (b.shortName || b.name) : '', apt ? 'Căn ' + apt.name : ''].filter(Boolean).join(' / ');
    }

    function formatMoneyInput(n) {
        n = Number(n) || 0;
        return n ? n.toLocaleString('en-US') : '';
    }

    function parseMoney(s) { return Number(String(s || '').replace(/[^\d]/g, '')) || 0; }

    // Assets visible to this user: everything for all-building users, else only
    // assets placed in an in-scope building.
    function visibleAssets() { return U().scoped('assets'); }

    function sortedTypes() {
        return RHD.list('assetTypes').slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'vi'); });
    }

    function createAssetType(name) {
        if (!U().can('assetTypes.create')) return { ok: false, error: global.RHP.deniedMessage('assetTypes.create') };
        name = String(name || '').trim();
        if (!name) return { ok: false, error: 'Vui lòng nhập tên loại tài sản.' };
        if (RHD.list('assetTypes').some(function (t) { return fold(t.name).trim() === fold(name); })) {
            return { ok: false, error: 'Loại tài sản "' + name + '" đã tồn tại.' };
        }
        var res = RHD.create('assetTypes', { name: name });
        return res.ok ? { ok: true, value: res.item.id, item: res.item } : res;
    }

    // ------------------------------------------------------------------ list

    function filteredAssets() {
        var f = state.filters;
        var q = fold(f.q.trim());
        return visibleAssets().filter(function (a) {
            if (f.buildingId && a.buildingId !== f.buildingId) return false;
            if (f.apartmentId && a.apartmentId !== f.apartmentId) return false;
            if (f.typeId && a.typeId !== f.typeId) return false;
            if (f.condition && a.condition !== f.condition) return false;
            if (q && fold([a.name, a.code, a.brand, a.model, a.supplier, a.location, typeName(a.typeId)].join(' ')).indexOf(q) === -1) return false;
            return true;
        }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    }

    function warrantyHtml(a) {
        if (!a.warrantyUntil) return '<span style="color:#cbd5e1;">—</span>';
        var today = new Date().toISOString().slice(0, 10);
        var expired = a.warrantyUntil < today;
        return '<span style="color:' + (expired ? '#ef4444' : '#475569') + ';">' + U().fmtDate(a.warrantyUntil) + '</span>' +
            (expired ? '<div style="font-size:.72rem;color:#ef4444;">Hết bảo hành</div>' : '');
    }

    function renderTable() {
        var wrap = byId('assetTableWrap');
        if (!wrap) return;
        var list = filteredAssets();
        var all = visibleAssets();
        var totalQty = list.reduce(function (s, a) { return s + (Number(a.quantity) || 0); }, 0);
        var totalValue = list.reduce(function (s, a) { return s + (Number(a.value) || 0) * (Number(a.quantity) || 0); }, 0);
        var summary = '<div style="color:#61708a;font-size:.82rem;margin:.25rem 0 .75rem;">' +
            '<strong style="color:#10213c;">' + list.length + '</strong> / ' + all.length + ' tài sản · ' +
            '<strong style="color:#10213c;">' + totalQty + '</strong> đơn vị · Tổng giá trị <strong style="color:#10213c;">' + U().money(totalValue) + '</strong></div>';

        if (!list.length) {
            wrap.innerHTML = summary + U().emptyState('fa-couch', all.length ? 'Không có tài sản phù hợp bộ lọc.' : 'Chưa có tài sản nào. Thêm tài sản đầu tiên cho tòa nhà / căn hộ.');
            return;
        }
        var rows = list.map(function (a) {
            var st = conditionMeta(a.condition);
            var thumb = a.photos && a.photos[0]
                ? '<img src="' + a.photos[0] + '" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover;flex:0 0 40px;">'
                : '<span style="width:40px;height:40px;border-radius:8px;background:#eef4fb;color:#94a3b8;display:inline-flex;align-items:center;justify-content:center;flex:0 0 40px;"><i class="fas fa-couch"></i></span>';
            return '<tr class="rh-click-row" tabindex="0" title="Xem chi tiết tài sản" onclick="RHAssets.openDetail(\'' + a.id + '\')" onkeydown="if(event.key===\'Enter\'&&event.target===this)RHAssets.openDetail(\'' + a.id + '\')">' +
                '<td><div style="display:flex;align-items:center;gap:.65rem;">' + thumb + '<div style="min-width:0;"><strong>' + esc(a.name) + '</strong>' +
                '<div style="font-size:.75rem;color:#94a3b8;">' + esc([a.code, a.brand, a.model].filter(Boolean).join(' · ')) + '</div></div></div></td>' +
                '<td>' + esc(typeName(a.typeId) || '—') + '</td>' +
                '<td>' + (esc(placeLabel(a)) || '<span style="color:#94a3b8;">Chưa gán</span>') + (a.location ? '<div style="font-size:.75rem;color:#94a3b8;">' + esc(a.location) + '</div>' : '') + '</td>' +
                '<td style="text-align:right;">' + (Number(a.quantity) || 0) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;">' + (a.value ? U().money(a.value) : '—') + '</td>' +
                '<td>' + (a.condition ? U().badge(st.label, st.color, st.bg) : '—') + '</td>' +
                '<td style="white-space:nowrap;">' + warrantyHtml(a) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()">' +
                U().rowButton('assets.update', "RHAssets.openForm('" + a.id + "')", 'fa-pen', 'Sửa') +
                U().rowButton('assets.delete', "RHAssets.remove('" + a.id + "')", 'fa-trash', 'Xoá', true) +
                '</td></tr>';
        }).join('');
        wrap.innerHTML = summary + '<div class="table-container"><table><thead><tr><th>Tài sản</th><th>Loại</th><th>Vị trí</th><th style="text-align:right;">SL</th><th style="text-align:right;">Giá trị</th><th>Tình trạng</th><th>Bảo hành</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function filterSelect(id, options, value, placeholder) {
        return '<select id="' + id + '" class="asset-filter">' + U().selectOptions(options, 'id', 'label', value, placeholder) + '</select>';
    }

    function renderFilterApartments() {
        var sel = byId('assetFilterApartment');
        if (!sel) return;
        var f = state.filters;
        var apts = f.buildingId ? RHD.apartmentsOf(f.buildingId) : [];
        if (f.apartmentId && !apts.some(function (a) { return a.id === f.apartmentId; })) f.apartmentId = '';
        sel.innerHTML = U().selectOptions(apts.map(function (a) { return { id: a.id, label: 'Căn ' + a.name }; }), 'id', 'label', f.apartmentId, f.buildingId ? 'Tất cả căn hộ' : 'Chọn tòa nhà trước');
        sel.disabled = !f.buildingId;
    }

    function renderTab() {
        var tab = byId('assets-tab');
        if (!tab) return;
        var f = state.filters;
        var buildings = U().scoped('buildings');
        if (f.buildingId && !buildings.some(function (b) { return b.id === f.buildingId; })) f.buildingId = '';
        if (f.typeId && !RHD.get('assetTypes', f.typeId)) f.typeId = '';

        tab.innerHTML = U().renderDemoBanner('assets') +
            '<div class="card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div><h2 style="font-size:1.4rem;font-weight:700;color:#10213c;">Tài sản</h2><p style="color:#94a3b8;font-size:.875rem;margin-top:.25rem;">Trang thiết bị gắn với tòa nhà / căn hộ — chọn từ dữ liệu Tòa nhà và Căn hộ hiện có.</p></div>' +
            '<div style="display:flex;gap:.6rem;flex-wrap:wrap;">' +
            (U().can('assetTypes.view') ? '<button type="button" onclick="RHAssets.openTypes()" style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:.65rem 1rem;font:inherit;font-weight:600;cursor:pointer;"><i class="fas fa-tags"></i> Loại tài sản</button>' : '') +
            U().addButton('Thêm tài sản', 'RHAssets.openForm()', 'assets', 'assets.create') +
            '</div></div>' +
            '<div class="asset-filters">' +
            '<div class="asset-search"><i class="fas fa-search"></i><input id="assetFilterQ" type="search" placeholder="Tìm theo tên, mã, thương hiệu, nhà cung cấp..." value="' + esc(f.q) + '"></div>' +
            filterSelect('assetFilterBuilding', buildings.map(function (b) { return { id: b.id, label: b.name }; }), f.buildingId, 'Tất cả tòa nhà') +
            '<select id="assetFilterApartment" class="asset-filter"></select>' +
            filterSelect('assetFilterType', sortedTypes().map(function (t) { return { id: t.id, label: t.name }; }), f.typeId, 'Tất cả loại') +
            filterSelect('assetFilterCondition', RHD.ASSET_CONDITIONS, f.condition, 'Mọi tình trạng') +
            '</div>' +
            '<div id="assetTableWrap"></div>' +
            '</div>';

        renderFilterApartments();
        byId('assetFilterQ').addEventListener('input', function () { f.q = this.value; renderTable(); });
        byId('assetFilterBuilding').addEventListener('change', function () { f.buildingId = this.value; f.apartmentId = ''; renderFilterApartments(); renderTable(); });
        byId('assetFilterApartment').addEventListener('change', function () { f.apartmentId = this.value; renderTable(); });
        byId('assetFilterType').addEventListener('change', function () { f.typeId = this.value; renderTable(); });
        byId('assetFilterCondition').addEventListener('change', function () { f.condition = this.value; renderTable(); });
        renderTable();
    }

    // ---------------------------------------------------------------- detail

    function openDetail(id) {
        var a = visibleAssets().filter(function (x) { return x.id === id; })[0];
        if (!a) return;
        var st = conditionMeta(a.condition);
        var item = U().detailItem;
        var photos = (a.photos || []).length
            ? '<div class="asset-photos">' + a.photos.map(function (p, i) {
                return '<a href="' + p + '" target="_blank" rel="noopener" title="Mở ảnh ' + (i + 1) + '"><img src="' + p + '" alt="Ảnh tài sản ' + (i + 1) + '"></a>';
            }).join('') + '</div>'
            : '<p style="color:#94a3b8;font-size:.85rem;">Chưa có hình ảnh.</p>';
        var html = '<div class="rh-detail">' +
            '<div style="display:flex;align-items:flex-start;gap:1rem;">' +
            '<span style="align-items:center;background:linear-gradient(135deg,#1683ff 0%,#0d65d5 100%);border-radius:14px;color:#fff;display:inline-flex;flex:0 0 52px;font-size:1.3rem;height:52px;justify-content:center;"><i class="fas fa-couch"></i></span>' +
            '<div style="min-width:0;flex:1;"><div style="color:#10213c;font:800 1.2rem \'Plus Jakarta Sans\',sans-serif;">' + esc(a.name) + '</div>' +
            '<div style="color:#61708a;font-size:.85rem;margin-top:.15rem;">' + esc([a.code, typeName(a.typeId)].filter(Boolean).join(' · ')) + '</div>' +
            '<div style="margin-top:.45rem;">' + (a.condition ? U().badge(st.label, st.color, st.bg) : '') + '</div></div></div>' +

            '<div class="rh-section"><div class="rh-section-title">Thông tin tài sản</div><div class="rh-grid-2">' +
            item('Thương hiệu', esc(a.brand || '')) +
            item('Màu sắc', esc(a.color || '')) +
            item('Model / Năm sản xuất', esc(a.model || '')) +
            item('Xuất xứ', esc(a.origin || '')) +
            item('Giá trị', a.value ? U().money(a.value) : '') +
            item('Số lượng', esc(a.quantity)) +
            item('Thời hạn bảo hành', a.warrantyUntil ? warrantyHtml(a) : '') +
            item('Nhà cung cấp', esc(a.supplier || '')) +
            '</div></div>' +

            '<div class="rh-section"><div class="rh-section-title">Vị trí</div><div class="rh-grid-2">' +
            item('Tòa nhà / Căn hộ', esc(placeLabel(a))) +
            item('Vị trí cụ thể', esc(a.location || '')) +
            '</div></div>' +

            (a.note ? '<div class="rh-section"><div class="rh-section-title">Ghi chú</div><p style="color:#475569;font-size:.9rem;white-space:pre-wrap;">' + esc(a.note) + '</p></div>' : '') +
            '<div class="rh-section"><div class="rh-section-title">Hình ảnh (' + (a.photos || []).length + ')</div>' + photos + '</div>' +

            '<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.5rem;">' +
            (U().can('assets.update') ? '<button type="button" class="btn-primary" onclick="RHAssets.openForm(\'' + a.id + '\')"><i class="fas fa-pen"></i> Sửa tài sản</button>' : '') +
            (U().can('assets.delete') ? '<button type="button" onclick="RHAssets.remove(\'' + a.id + '\')" style="background:#fff;border:1px solid #fecaca;color:#ef4444;border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;"><i class="fas fa-trash"></i> Xoá</button>' : '') +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Đóng</button>' +
            '</div></div>';
        global.RHUI.openDrawer('Chi tiết tài sản', html);
    }

    // ------------------------------------------------------------------ form

    function field(label, inner, opts) {
        opts = opts || {};
        return '<div class="rh-field"' + (opts.full ? ' style="grid-column:1/-1;"' : '') + '><label>' + label + (opts.required ? ' <span style="color:#ef4444;">*</span>' : '') + '</label>' + inner + '</div>';
    }

    // Downscale before storing: photos live in localStorage as data URLs.
    function compressImage(file, cb) {
        var reader = new FileReader();
        reader.onload = function () {
            var img = new Image();
            img.onload = function () {
                var max = 1280;
                var scale = Math.min(1, max / Math.max(img.width, img.height));
                var canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                cb(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = function () { cb(''); };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    function renderPhotoTiles() {
        var box = byId('afPhotos');
        if (!box) return;
        box.innerHTML = state.photos.map(function (p, i) {
            return '<div class="asset-photo-tile"><img src="' + p + '" alt="Ảnh ' + (i + 1) + '">' +
                '<button type="button" title="Xoá ảnh" onclick="RHAssets.removePhoto(' + i + ')"><i class="fas fa-xmark"></i></button></div>';
        }).join('') +
            (state.photos.length < MAX_PHOTOS ? '<label class="asset-photo-add" title="Thêm ảnh"><i class="fas fa-plus"></i><input type="file" accept="image/*" multiple id="afPhotoInput" hidden></label>' : '');
        var input = byId('afPhotoInput');
        if (input) input.addEventListener('change', function () {
            var files = Array.prototype.slice.call(this.files || [], 0, MAX_PHOTOS - state.photos.length);
            var pending = files.length;
            files.forEach(function (file) {
                if (!/^image\//.test(file.type)) { if (--pending === 0) renderPhotoTiles(); return; }
                compressImage(file, function (dataUrl) {
                    if (dataUrl && state.photos.length < MAX_PHOTOS) state.photos.push(dataUrl);
                    if (--pending === 0) renderPhotoTiles();
                });
            });
        });
    }

    function buildingOptions() {
        return U().scoped('buildings').map(function (b) {
            return { value: b.id, label: b.name, sub: [b.shortName, RHD.buildingFullAddress(b)].filter(Boolean).join(' · '), keywords: [b.code] };
        });
    }

    function apartmentOptions() {
        var buildingId = state.fields.building ? state.fields.building.getValue() : '';
        if (!buildingId) return [];
        return RHD.apartmentsOf(buildingId).slice().sort(function (x, y) { return String(x.name).localeCompare(String(y.name), 'vi', { numeric: true }); }).map(function (a) {
            return { value: a.id, label: a.name, sub: a.floor || '' };
        });
    }

    function openForm(id) {
        if (!U().guard(id ? 'assets.update' : 'assets.create')) return;
        var a = id ? RHD.get('assets', id) : null;
        if (id && !a) return;
        state.editingId = id || null;
        state.photos = a ? (a.photos || []).slice() : [];
        var suppliers = [];
        RHD.list('assets').forEach(function (x) { if (x.supplier && suppliers.indexOf(x.supplier) === -1) suppliers.push(x.supplier); });
        var v = function (k) { return esc(a ? (a[k] == null ? '' : a[k]) : ''); };
        var limited = global.RHP.buildingScope() !== null;

        var html = '<form onsubmit="RHAssets.submit(event)" novalidate>' +
            '<div class="rh-section-title">Thông tin tài sản</div>' +
            '<div class="rh-grid-3">' +
            field('Tên', '<input id="afName" maxlength="120" value="' + v('name') + '" placeholder="VD: Lavabo">', { required: true }) +
            field('Thương hiệu', '<input id="afBrand" maxlength="80" value="' + v('brand') + '" placeholder="Thương hiệu">') +
            field('Màu sắc', '<input id="afColor" maxlength="40" value="' + v('color') + '" placeholder="Màu sắc">') +
            field('Model / Năm sản xuất', '<input id="afModel" maxlength="60" value="' + v('model') + '" placeholder="VD: 2026">') +
            field('Xuất xứ', '<input id="afOrigin" maxlength="60" value="' + v('origin') + '" placeholder="Xuất xứ">') +
            field('Giá trị (đ)', '<input id="afValue" inputmode="numeric" value="' + formatMoneyInput(a && a.value) + '" placeholder="0">') +
            field('Số lượng', '<input id="afQty" type="number" min="1" step="1" value="' + (a ? Number(a.quantity) || 1 : 1) + '">', { required: true }) +
            field('Tình trạng', '<select id="afCondition">' + U().selectOptions(RHD.ASSET_CONDITIONS, 'id', 'label', a ? a.condition : 'new') + '</select>') +
            field('Thời hạn bảo hành', '<input id="afWarranty" type="date" value="' + v('warrantyUntil') + '">') +
            field('Nhà cung cấp', '<input id="afSupplier" list="afSupplierList" maxlength="120" value="' + v('supplier') + '" placeholder="Nhà cung cấp">' +
                '<datalist id="afSupplierList">' + suppliers.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>') +
            field('Loại tài sản', '<div id="afTypeField"></div>', { required: true }) +
            '</div>' +

            '<div class="rh-section"><div class="rh-section-title">Vị trí</div><div class="rh-grid-3">' +
            field('Tòa nhà', '<div id="afBuildingField"></div>', { required: limited }) +
            field('Căn hộ / Phòng', '<div id="afApartmentField"></div>') +
            field('Vị trí cụ thể', '<input id="afLocation" maxlength="120" value="' + v('location') + '" placeholder="VD: Phòng tắm, ban công...">') +
            '</div></div>' +

            '<div class="rh-section">' + field('Ghi chú', '<textarea id="afNote" rows="3" maxlength="1000">' + v('note') + '</textarea>', { full: true }) + '</div>' +

            '<div class="rh-section"><div class="rh-section-title">Hình ảnh tài sản <span style="text-transform:none;letter-spacing:0;font-weight:400;">(tối đa ' + MAX_PHOTOS + ' ảnh)</span></div>' +
            '<div id="afPhotos" class="asset-photo-grid"></div></div>' +

            '<div id="afError" style="color:#ef4444;font-size:.85rem;margin-top:1rem;"></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;justify-content:flex-end;">' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Hủy bỏ</button>' +
            '<button type="submit" class="btn-primary">Lưu</button>' +
            '</div></form>';

        global.RHUI.openDrawer(a ? 'Sửa tài sản' : 'Thêm tài sản', html, { width: 860 });

        state.fields.type = RHSelect.create(byId('afTypeField'), {
            inputId: 'afType',
            value: a ? a.typeId : '',
            placeholder: 'Chọn loại tài sản',
            searchPlaceholder: 'Tìm loại tài sản...',
            noOptionsText: 'Chưa có loại tài sản nào',
            options: function () { return sortedTypes().map(function (t) { return { value: t.id, label: t.name }; }); },
            create: U().can('assetTypes.create') ? { label: 'Thêm loại tài sản', placeholder: 'Tên loại tài sản mới', onCreate: createAssetType } : null
        });
        state.fields.building = RHSelect.create(byId('afBuildingField'), {
            inputId: 'afBuilding',
            value: a ? a.buildingId : '',
            placeholder: 'Chọn tòa nhà',
            searchPlaceholder: 'Tìm tòa nhà...',
            noOptionsText: 'Chưa có tòa nhà nào trong phạm vi của bạn',
            options: buildingOptions,
            onChange: function () {
                state.fields.apartment.setValue('');
                state.fields.apartment.refresh();
                state.fields.apartment.setDisabled(!state.fields.building.getValue());
            }
        });
        state.fields.apartment = RHSelect.create(byId('afApartmentField'), {
            inputId: 'afApartment',
            value: a ? a.apartmentId : '',
            placeholder: 'Chọn căn hộ',
            searchPlaceholder: 'Tìm căn hộ...',
            noOptionsText: 'Tòa nhà này chưa có căn hộ',
            disabled: !(a && a.buildingId),
            options: apartmentOptions
        });
        byId('afValue').addEventListener('input', function () {
            var n = parseMoney(this.value);
            this.value = n ? n.toLocaleString('en-US') : '';
        });
        renderPhotoTiles();
        byId('afName').focus();
    }

    function submit(ev) {
        ev.preventDefault();
        var id = state.editingId;
        if (!U().guard(id ? 'assets.update' : 'assets.create')) return;
        var err = byId('afError');
        var data = {
            name: byId('afName').value.trim(),
            brand: byId('afBrand').value.trim(),
            color: byId('afColor').value.trim(),
            model: byId('afModel').value.trim(),
            origin: byId('afOrigin').value.trim(),
            value: parseMoney(byId('afValue').value),
            quantity: Math.floor(Number(byId('afQty').value)),
            condition: byId('afCondition').value,
            warrantyUntil: byId('afWarranty').value,
            supplier: byId('afSupplier').value.trim(),
            typeId: state.fields.type.getValue(),
            buildingId: state.fields.building.getValue(),
            apartmentId: state.fields.apartment.getValue(),
            location: byId('afLocation').value.trim(),
            note: byId('afNote').value.trim(),
            photos: state.photos.slice(),
            updatedAt: Date.now()
        };
        if (!data.name) { err.textContent = 'Vui lòng nhập tên tài sản.'; byId('afName').focus(); return; }
        if (!(data.quantity >= 1)) { err.textContent = 'Số lượng phải là số nguyên lớn hơn 0.'; byId('afQty').focus(); return; }
        if (!data.typeId || !RHD.get('assetTypes', data.typeId)) { err.textContent = 'Vui lòng chọn loại tài sản.'; return; }
        if (!data.buildingId && global.RHP.buildingScope() !== null) { err.textContent = 'Vui lòng chọn tòa nhà (bạn chỉ quản lý một số tòa nhà).'; return; }
        if (data.buildingId && !global.RHP.inScope(data.buildingId)) { err.textContent = 'Tòa nhà đã chọn nằm ngoài phạm vi bạn phụ trách.'; return; }
        var apt = data.apartmentId ? RHD.get('apartments', data.apartmentId) : null;
        if (data.apartmentId && (!apt || apt.buildingId !== data.buildingId)) { err.textContent = 'Căn hộ đã chọn không thuộc tòa nhà đã chọn.'; return; }

        var res;
        try {
            if (id) {
                res = RHD.update('assets', id, data);
            } else {
                data.code = RHD.nextAssetCode();
                data.createdBy = (global.RHP.currentUser() || {}).id || '';
                res = RHD.create('assets', data);
            }
        } catch (e) {
            // localStorage quota (large photos) is the realistic failure here.
            res = { ok: false, error: 'Không thể lưu — bộ nhớ trình duyệt đã đầy. Hãy bớt hoặc dùng ảnh nhỏ hơn.' };
        }
        if (!res.ok) { err.textContent = res.error; return; }
        global.RHUI.closeDrawer();
        renderTab();
    }

    function remove(id) {
        if (!U().guard('assets.delete')) return;
        var a = RHD.get('assets', id);
        if (!a || !confirm('Xoá tài sản "' + a.name + '"? Hành động không thể hoàn tác.')) return;
        var res = RHD.remove('assets', id);
        if (!res.ok) { alert(res.error); return; }
        global.RHUI.closeDrawer();
        renderTab();
    }

    // ----------------------------------------------------------- asset types

    function renderTypesDrawer() {
        var types = sortedTypes();
        var assets = RHD.list('assets');
        var canEdit = U().can('assetTypes.update');
        var canDelete = U().can('assetTypes.delete');
        var rows = types.map(function (t) {
            var used = assets.filter(function (a) { return a.typeId === t.id; }).length;
            if (state.editingTypeId === t.id) {
                return '<tr><td colspan="3"><div style="display:flex;gap:.5rem;">' +
                    '<input id="atEditName" value="' + esc(t.name) + '" maxlength="80" style="flex:1;border:1px solid #1683ff;border-radius:8px;padding:.45rem .6rem;font:inherit;">' +
                    '<button type="button" class="btn-primary" onclick="RHAssets.saveType(\'' + t.id + '\')">Lưu</button>' +
                    '<button type="button" class="rh-row-btn" onclick="RHAssets.editType(null)">Huỷ</button></div></td></tr>';
            }
            return '<tr><td><strong>' + esc(t.name) + '</strong></td>' +
                '<td style="color:#61708a;">' + used + ' tài sản</td>' +
                '<td style="text-align:right;white-space:nowrap;">' +
                (canEdit ? '<button type="button" class="rh-row-btn" title="Đổi tên" onclick="RHAssets.editType(\'' + t.id + '\')"><i class="fas fa-pen"></i></button>' : '') +
                (canDelete ? '<button type="button" class="rh-row-btn danger" title="Xoá" onclick="RHAssets.deleteType(\'' + t.id + '\')"><i class="fas fa-trash"></i></button>' : '') +
                '</td></tr>';
        }).join('');
        var html = (U().can('assetTypes.create')
            ? '<form onsubmit="RHAssets.addType(event)" style="display:flex;gap:.5rem;margin-bottom:1rem;">' +
            '<input id="atNewName" maxlength="80" placeholder="Tên loại tài sản mới (VD: Bình nóng lạnh)" style="flex:1;border:1px solid var(--line);border-radius:8px;padding:.6rem .75rem;font:inherit;">' +
            '<button type="submit" class="btn-primary"><i class="fas fa-plus"></i> Thêm</button></form>' : '') +
            '<div id="atError" style="color:#ef4444;font-size:.85rem;margin-bottom:.5rem;"></div>' +
            (types.length ? '<div class="table-container"><table style="min-width:0;"><thead><tr><th>Loại tài sản</th><th>Đang dùng</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
                : U().emptyState('fa-tags', 'Chưa có loại tài sản nào.'));
        global.RHUI.openDrawer('Loại tài sản (' + types.length + ')', html);
        var input = byId(state.editingTypeId ? 'atEditName' : 'atNewName');
        if (input) input.focus();
    }

    function openTypes() {
        if (!U().guard('assetTypes.view')) return;
        state.editingTypeId = null;
        renderTypesDrawer();
    }

    function addType(ev) {
        ev.preventDefault();
        var res = createAssetType(byId('atNewName').value);
        if (!res.ok) { byId('atError').textContent = res.error; return; }
        renderTypesDrawer();
        renderTab();
    }

    function saveType(id) {
        if (!U().guard('assetTypes.update')) return;
        var name = byId('atEditName').value.trim();
        if (!name) { byId('atError').textContent = 'Vui lòng nhập tên loại tài sản.'; return; }
        if (RHD.list('assetTypes').some(function (t) { return t.id !== id && fold(t.name).trim() === fold(name); })) {
            byId('atError').textContent = 'Loại tài sản "' + name + '" đã tồn tại.';
            return;
        }
        RHD.update('assetTypes', id, { name: name, updatedAt: Date.now() });
        state.editingTypeId = null;
        renderTypesDrawer();
        renderTab();
    }

    function deleteType(id) {
        if (!U().guard('assetTypes.delete')) return;
        var used = RHD.list('assets').filter(function (a) { return a.typeId === id; }).length;
        if (used) { alert('Không thể xoá: còn ' + used + ' tài sản thuộc loại này.'); return; }
        if (!confirm('Xoá loại tài sản "' + typeName(id) + '"?')) return;
        RHD.remove('assetTypes', id);
        renderTypesDrawer();
        renderTab();
    }

    global.RHAssets = {
        renderTab: renderTab,
        openDetail: openDetail,
        openForm: openForm,
        submit: submit,
        remove: remove,
        removePhoto: function (i) { state.photos.splice(i, 1); renderPhotoTiles(); },
        openTypes: openTypes,
        addType: addType,
        editType: function (id) { state.editingTypeId = id; renderTypesDrawer(); },
        saveType: saveType,
        deleteType: deleteType,
        createType: createAssetType
    };
})(window);
