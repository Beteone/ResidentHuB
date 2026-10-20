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
        contractServiceSel: {},
        serviceFeeBuildingFilter: '',
        serviceFeeTypeFilter: '',
        serviceFeeSearch: '',
        selectedServiceFees: []
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

    function customerCode(customer) {
        var nameParts = String(customer.fullName || '').trim().split(/\s+/).filter(Boolean);
        var shortNameParts = nameParts.slice(-2);
        var initials = shortNameParts.map(function (part) {
            return part.charAt(0).toLocaleUpperCase('vi-VN');
        }).join('');
        var idSuffix = String(customer.idNumber || '').replace(/\D/g, '').slice(-3);
        return 'KH' + initials + idSuffix;
    }

    function badge(label, color, bg) {
        return '<span style="background:' + bg + ';color:' + color + ';font-size:.72rem;font-weight:700;padding:.25rem .6rem;border-radius:999px;white-space:nowrap;">' + escapeHtml(label) + '</span>';
    }

    function renderCashflowTab() {
        var tab = byId('cashflow-tab');
        if (!tab) return;
        ensureCashflowStyles();
        var state = RHUI.cashflowFilters || (RHUI.cashflowFilters = { type: 'all', area: '', building: '', apartment: '', from: '', to: '', account: '', search: '', filtersOpen: true });
        var allRecords = RHD.list('cashflows').slice().sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0);
        });
        var allBuildings = RHD.list('buildings');
        var areas = allBuildings.map(function (b) { return b.province || b.ward || ''; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
        var apartments = RHD.list('apartments');
        var visibleRecords = allRecords.filter(function (record) {
            var building = RHD.get('buildings', record.buildingId) || {};
            var apartment = RHD.get('apartments', record.apartmentId) || {};
            var area = building.province || building.ward || '';
            if (state.type !== 'all' && record.type !== state.type) return false;
            if (state.area && area !== state.area) return false;
            if (state.building && record.buildingId !== state.building) return false;
            if (state.apartment && record.apartmentId !== state.apartment) return false;
            if (state.from && String(record.date || '') < state.from) return false;
            if (state.to && String(record.date || '') > state.to) return false;
            if (state.account && (record.accountName || record.paymentMethod || '') !== state.account) return false;
            if (state.search) {
                var searchText = [record.code, record.category, record.description, record.reference, record.personName, record.accountName, record.paymentMethod, building.name, building.shortName, apartment.name].join(' ').toLocaleLowerCase();
                if (searchText.indexOf(state.search.toLocaleLowerCase()) === -1) return false;
            }
            return true;
        });
        var totals = visibleRecords.reduce(function (sum, record) {
            sum[record.type === 'income' ? 'income' : 'expense'] += Number(record.amount) || 0;
            return sum;
        }, { income: 0, expense: 0 });
        var buildingOptions = '<option value="">Chọn tòa nhà</option>' + allBuildings.map(function (b) {
            return '<option value="' + escapeHtml(b.id) + '"' + (state.building === b.id ? ' selected' : '') + '>' + escapeHtml(b.name || b.shortName) + '</option>';
        }).join('');
        var apartmentOptions = '<option value="">Chọn phòng</option>' + apartments.filter(function (apt) { return !state.building || apt.buildingId === state.building; }).map(function (apt) {
            return '<option value="' + escapeHtml(apt.id) + '"' + (state.apartment === apt.id ? ' selected' : '') + '>' + escapeHtml(apt.name || apt.code || 'Căn hộ') + '</option>';
        }).join('');
        var accountNames = allRecords.map(function (record) { return record.accountName || record.paymentMethod || ''; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
        var accountOptions = '<option value="">Sổ quỹ</option>' + accountNames.map(function (account) {
            return '<option value="' + escapeHtml(account) + '"' + (state.account === account ? ' selected' : '') + '>' + escapeHtml(account) + '</option>';
        }).join('');
        var rows = visibleRecords.map(function (record) {
            var building = RHD.get('buildings', record.buildingId);
            var apartment = RHD.get('apartments', record.apartmentId);
            var sign = record.type === 'income' ? '+' : '−';
            return '<tr><td><input class="rh-cashflow-select" type="checkbox" value="' + escapeHtml(record.id) + '" aria-label="Chọn phiếu ' + escapeHtml(record.code || '') + '"></td>' +
                '<td class="rh-cashflow-code">' + escapeHtml(record.code || '—') + ' <i class="fas fa-shield-halved" title="Đã lưu"></i></td>' +
                '<td><strong>' + escapeHtml(record.description || record.category || 'Thu chi') + '</strong><div class="rh-cashflow-row-sub">' + escapeHtml(record.category || '') + (record.reference ? ' · ' + escapeHtml(record.reference) : '') + '</div></td>' +
                '<td class="rh-cashflow-amount" style="color:' + (record.type === 'income' ? '#198754' : '#d17a0b') + ';text-align:right;">' + sign + money(record.amount) + '</td>' +
                '<td>' + escapeHtml(building ? building.name : '—') + (apartment ? '<div class="rh-cashflow-row-sub">' + escapeHtml(apartment.name || apartment.code) + '</div>' : '') + '</td>' +
                '<td>' + fmtDate(record.date) + '</td><td>' + escapeHtml(record.personName || '—') + '</td><td>' + escapeHtml(record.accountName || record.paymentMethod || '—') + '</td>' +
                '<td><div class="rh-cashflow-actions-cell"><button class="view" type="button" title="Xem chi tiết" aria-label="Xem chi tiết" onclick="RHUI.openCashflowDetail(\'' + record.id + '\')"><i class="fas fa-eye"></i></button><button class="edit" type="button" title="Sửa" aria-label="Sửa" onclick="RHUI.openCashflowForm(\'' + record.id + '\')"><i class="fas fa-pen-to-square"></i></button><button class="print" type="button" title="In phiếu" aria-label="In phiếu" onclick="RHUI.printCashflow(\'' + record.id + '\')"><i class="fas fa-print"></i></button><button class="delete" type="button" title="Xóa" aria-label="Xóa" onclick="RHUI.deleteCashflow(\'' + record.id + '\')"><i class="fas fa-trash"></i></button></div></td></tr>';
        }).join('');
        var areaOptions = '<option value="">Chọn khu vực</option>' + areas.map(function (area) { return '<option value="' + escapeHtml(area) + '"' + (state.area === area ? ' selected' : '') + '>' + escapeHtml(area) + '</option>'; }).join('');
        var typeOptions = '<option value="all">Loại thu/chi</option><option value="income"' + (state.type === 'income' ? ' selected' : '') + '>Thu</option><option value="expense"' + (state.type === 'expense' ? ' selected' : '') + '>Chi</option>';
        tab.innerHTML = '<div class="card"><div class="rh-cashflow-summary">' +
            '<div class="rh-cashflow-stat income"><span class="rh-cashflow-stat-icon"><i class="fas fa-plus"></i></span><div><strong>' + Number(totals.income).toLocaleString('vi-VN') + '</strong><small>Thu</small></div></div>' +
            '<div class="rh-cashflow-stat expense"><span class="rh-cashflow-stat-icon"><i class="fas fa-minus"></i></span><div><strong>' + Number(totals.expense).toLocaleString('vi-VN') + '</strong><small>Chi</small></div></div>' +
            '<div class="rh-cashflow-stat balance"><span class="rh-cashflow-stat-icon"><i class="fas fa-wallet"></i></span><div><strong>' + Number(totals.income - totals.expense).toLocaleString('vi-VN') + '</strong><small>Thu - chi</small></div></div></div>' +
            '<div class="rh-cashflow-filter-panel' + (state.filtersOpen ? ' open' : '') + '"><input id="cashflowFrom" type="date" aria-label="Từ ngày" value="' + escapeHtml(state.from) + '"><input id="cashflowTo" type="date" aria-label="Đến ngày" value="' + escapeHtml(state.to) + '"><select id="cashflowArea" aria-label="Khu vực">' + areaOptions + '</select><select id="cashflowBuilding" aria-label="Tòa nhà">' + buildingOptions + '</select><select id="cashflowApartment" aria-label="Phòng">' + apartmentOptions + '</select><select id="cashflowAccount" aria-label="Sổ quỹ">' + accountOptions + '</select><select id="cashflowType" aria-label="Loại giao dịch" style="grid-column:span 2;">' + typeOptions + '</select><button type="button" class="btn-secondary" onclick="RHUI.clearCashflowFilters()">Xóa bộ lọc</button></div>' +
            '<div class="rh-cashflow-toolbar"><div class="rh-cashflow-search"><i class="fas fa-search"></i><input id="cashflowSearch" type="search" aria-label="Tìm kiếm phiếu" placeholder="Tìm kiếm..." value="' + escapeHtml(state.search) + '"></div><button type="button" class="rh-cashflow-toolbar-btn add" title="Thêm phiếu thu chi" aria-label="Thêm phiếu thu chi" onclick="RHUI.openCashflowForm(null,\'income\')"><i class="fas fa-plus"></i></button><button type="button" class="rh-cashflow-toolbar-btn" title="Xuất CSV" aria-label="Xuất CSV" onclick="RHUI.exportCashflows()"><i class="fas fa-cloud-arrow-down"></i></button><button type="button" class="rh-cashflow-toolbar-btn" title="Nhập CSV" aria-label="Nhập CSV" onclick="document.getElementById(\'cashflowCsvInput\').click()"><i class="fas fa-cloud-arrow-up"></i></button><button type="button" class="rh-cashflow-toolbar-btn" title="In danh sách" aria-label="In danh sách" onclick="RHUI.printCashflowList()"><i class="fas fa-print"></i></button><button type="button" class="rh-cashflow-toolbar-btn danger" title="Xóa phiếu đã chọn" aria-label="Xóa phiếu đã chọn" onclick="RHUI.deleteSelectedCashflows()"><i class="fas fa-trash"></i></button><button type="button" class="rh-cashflow-toolbar-btn" title="Bộ lọc" aria-label="Bộ lọc" onclick="RHUI.toggleCashflowFilters()"><i class="fas fa-filter"></i></button><input id="cashflowCsvInput" type="file" accept=".csv,text/csv" hidden onchange="RHUI.importCashflows(this)"></div>' +
            '<div class="rh-cashflow-table-wrap"><table class="rh-cashflow-table"><thead><tr><th><input id="cashflowSelectAll" type="checkbox" aria-label="Chọn tất cả"></th><th>Mã</th><th>Tên</th><th style="text-align:right;">Số tiền</th><th>Tòa nhà</th><th>Ngày thu/chi</th><th>Người nhận/trả</th><th>Tài khoản</th><th>Thao tác</th></tr></thead><tbody>' + (rows || '<tr><td colspan="9" style="color:#718096;padding:2rem;text-align:center;">Chưa có phiếu phù hợp. Nhấn dấu + để ghi nhận thu hoặc chi.</td></tr>') + '</tbody></table></div></div>';
        ['cashflowFrom', 'cashflowTo', 'cashflowArea', 'cashflowBuilding', 'cashflowApartment', 'cashflowAccount', 'cashflowType'].forEach(function (id) {
            byId(id).addEventListener('change', function () {
                state.from = byId('cashflowFrom').value;
                state.to = byId('cashflowTo').value;
                state.area = byId('cashflowArea').value;
                state.building = byId('cashflowBuilding').value;
                state.apartment = byId('cashflowApartment').value;
                state.account = byId('cashflowAccount').value;
                state.type = byId('cashflowType').value;
                renderCashflowTab();
            });
        });
        byId('cashflowSearch').addEventListener('input', function () {
            state.search = this.value.trim();
            renderCashflowTab();
            var next = byId('cashflowSearch');
            if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
        });
        byId('cashflowSelectAll').addEventListener('change', function () {
            tab.querySelectorAll('.rh-cashflow-select').forEach(function (checkbox) { checkbox.checked = byId('cashflowSelectAll').checked; });
        });
    }

    RHUI.toggleCashflowFilters = function () {
        RHUI.cashflowFilters.filtersOpen = !RHUI.cashflowFilters.filtersOpen;
        renderCashflowTab();
    };

    RHUI.clearCashflowFilters = function () {
        RHUI.cashflowFilters = { type: 'all', area: '', building: '', apartment: '', from: '', to: '', account: '', search: '', filtersOpen: true };
        renderCashflowTab();
    };

    RHUI.openCashflowDetail = function (id) {
        var record = RHD.get('cashflows', id);
        if (!record) return;
        var building = RHD.get('buildings', record.buildingId);
        var apartment = RHD.get('apartments', record.apartmentId);
        var isIncome = record.type === 'income';
        var detail = '<div class="rh-print-area" style="padding:1.5rem;"><div style="align-items:center;border-bottom:2px solid #e6edf4;display:flex;justify-content:space-between;padding-bottom:1rem;"><div><strong style="color:#10213c;font-size:1.25rem;">ResidentHub</strong><div style="color:#718096;font-size:.82rem;">PHIẾU ' + (isIncome ? 'THU' : 'CHI') + '</div></div><strong style="color:#23845c;">' + escapeHtml(record.code || '') + '</strong></div><div style="display:grid;gap:.85rem;grid-template-columns:1fr 1fr;margin-top:1.25rem;">' +
            detailItem('Ngày', escapeHtml(fmtDate(record.date))) + detailItem('Danh mục', escapeHtml(record.category || '')) +
            detailItem('Tòa nhà', escapeHtml(building ? building.name : '')) + detailItem('Căn hộ / Phòng', escapeHtml(apartment ? apartment.name : '')) +
            detailItem(isIncome ? 'Người nộp' : 'Người nhận', escapeHtml(record.personName || '')) + detailItem('Tài khoản', escapeHtml(record.accountName || record.paymentMethod || '')) +
            detailItem('Mã tham chiếu', escapeHtml(record.reference || '')) + detailItem('Nội dung', escapeHtml(record.description || ''), true) +
            '</div><div style="border-top:1px solid #e6edf4;margin-top:1.25rem;padding-top:1rem;text-align:right;"><span style="color:#718096;">Số tiền</span><strong style="color:' + (isIncome ? '#198754' : '#d17a0b') + ';display:block;font-size:1.5rem;">' + (isIncome ? '+' : '−') + money(record.amount) + '</strong></div></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1rem;"><button type="button" class="btn-primary" onclick="window.print()"><i class="fas fa-print"></i> In phiếu</button><button type="button" onclick="RHUI.openCashflowForm(\'' + record.id + '\')" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Sửa</button></div>';
        openDrawer('Chi tiết phiếu ' + (record.code || ''), detail);
    };

    RHUI.printCashflow = function (id) {
        RHUI.openCashflowDetail(id);
        window.setTimeout(function () { window.print(); }, 100);
    };

    RHUI.printCashflowList = function () {
        var state = RHUI.cashflowFilters || {};
        var items = RHD.list('cashflows').filter(function (record) {
            var building = RHD.get('buildings', record.buildingId) || {};
            var apartment = RHD.get('apartments', record.apartmentId) || {};
            var area = building.province || building.ward || '';
            var text = [record.code, record.category, record.description, record.reference, record.personName, record.accountName, building.name, apartment.name].join(' ').toLocaleLowerCase();
            return (!state.type || state.type === 'all' || record.type === state.type) && (!state.area || area === state.area) &&
                (!state.building || record.buildingId === state.building) && (!state.apartment || record.apartmentId === state.apartment) &&
                (!state.from || record.date >= state.from) && (!state.to || record.date <= state.to) &&
                (!state.account || (record.accountName || record.paymentMethod || '') === state.account) &&
                (!state.search || text.indexOf(state.search.toLocaleLowerCase()) !== -1);
        });
        var rows = items.map(function (record) {
            var building = RHD.get('buildings', record.buildingId);
            var apartment = RHD.get('apartments', record.apartmentId);
            return '<tr><td>' + escapeHtml(record.code || '') + '</td><td>' + (record.type === 'income' ? 'Thu' : 'Chi') + '</td><td>' + escapeHtml(record.description || record.category || '') + '</td><td>' + money(record.amount) + '</td><td>' + escapeHtml(building ? building.name : '') + ' / ' + escapeHtml(apartment ? apartment.name : '') + '</td><td>' + escapeHtml(fmtDate(record.date)) + '</td><td>' + escapeHtml(record.personName || '') + '</td><td>' + escapeHtml(record.accountName || record.paymentMethod || '') + '</td></tr>';
        }).join('');
        var printArea = document.createElement('div');
        printArea.className = 'rh-print-area';
        printArea.innerHTML = '<h2 style="margin-bottom:1rem;">Danh sách thu chi</h2><table style="border-collapse:collapse;width:100%;"><thead><tr><th>Mã</th><th>Loại</th><th>Nội dung</th><th>Số tiền</th><th>Tòa nhà / Phòng</th><th>Ngày</th><th>Người nhận/trả</th><th>Tài khoản</th></tr></thead><tbody>' + rows + '</tbody></table>';
        document.body.appendChild(printArea);
        var cleanUp = function () { if (printArea.parentNode) printArea.parentNode.removeChild(printArea); window.removeEventListener('afterprint', cleanUp); };
        window.addEventListener('afterprint', cleanUp);
        window.print();
        window.setTimeout(cleanUp, 1500);
    };

    RHUI.deleteSelectedCashflows = function () {
        var checks = Array.prototype.slice.call(document.querySelectorAll('#cashflow-tab .rh-cashflow-select:checked'));
        var ids = checks.map(function (checkbox) { return checkbox.value; });
        if (!ids.length) { alert('Vui lòng chọn phiếu thu chi cần xóa.'); return; }
        if (!confirm('Xóa ' + ids.length + ' phiếu thu chi đã chọn?')) return;
        ids.forEach(function (id) { RHD.remove('cashflows', id); });
        renderCashflowTab();
    };

    RHUI.exportCashflows = function () {
        var records = RHD.list('cashflows');
        var headers = ['code', 'type', 'date', 'buildingId', 'apartmentId', 'category', 'description', 'amount', 'personName', 'accountName', 'reference'];
        var csvCell = function (value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; };
        var csv = [headers.join(','), records.map(function (record) { return headers.map(function (key) { return csvCell(record[key]); }).join(','); }).join('\r\n')].join('\r\n');
        var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'residenthub-thu-chi.csv';
        link.click();
        URL.revokeObjectURL(url);
    };

    function parseCsvLine(line) {
        var fields = [], value = '', quoted = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line.charAt(i);
            if (ch === '"' && quoted && line.charAt(i + 1) === '"') { value += '"'; i++; }
            else if (ch === '"') quoted = !quoted;
            else if (ch === ',' && !quoted) { fields.push(value); value = ''; }
            else value += ch;
        }
        fields.push(value);
        return fields;
    }

    RHUI.importCashflows = function (input) {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            var lines = String(reader.result || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
            if (lines.length < 2) { alert('Tệp CSV chưa có dữ liệu.'); input.value = ''; return; }
            var headers = parseCsvLine(lines[0]).map(function (header) { return header.trim(); });
            var imported = 0;
            lines.slice(1).forEach(function (line) {
                var values = parseCsvLine(line);
                var item = {};
                headers.forEach(function (header, index) { item[header] = values[index] || ''; });
                var type = item.type === 'expense' || item.type === 'Chi' ? 'expense' : 'income';
                var amount = Number(String(item.amount || '').replace(/[\s,]/g, ''));
                if (!item.date || !isFinite(amount) || amount <= 0) return;
                var result = RHD.create('cashflows', {
                    code: item.code || 'TC-' + String(Date.now() + imported).slice(-8), type: type, date: item.date,
                    buildingId: item.buildingId || '', apartmentId: item.apartmentId || '', category: item.category || (type === 'income' ? 'Thu khác' : 'Chi khác'),
                    description: item.description || '', amount: amount, personName: item.personName || '', accountName: item.accountName || '',
                    reference: item.reference || '', paymentMethod: item.accountName || 'Khác', paymentMethodId: 'other'
                });
                if (result.ok) imported++;
            });
            input.value = '';
            renderCashflowTab();
            alert('Đã nhập ' + imported + ' phiếu thu chi.');
        };
        reader.readAsText(file, 'utf-8');
    };

    function selectOptions(items, valueKey, labelKey, selected, placeholder) {
        var html = placeholder ? '<option value="">' + escapeHtml(placeholder) + '</option>' : '';
        if (!items) return html;
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

    function statusMeta(list, id) {
        var items = Array.isArray(list) ? list : [];
        for (var i = 0; i < items.length; i++) {
            if ((items[i].id || items[i].value) === id) return items[i];
        }
        return { id: id, label: String(id || '—'), color: '#61708a', bg: '#f1f5f9' };
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

    function confirmDelete(entity, id, afterDeleteFn, blockMsg, deleteFn) {
        if (blockMsg) { alert(blockMsg); return; }
        if (!confirm('Xoá bản ghi này? Hành động không thể hoàn tác.')) return;
        var res = deleteFn ? deleteFn(id) : RHD.remove(entity, id);
        if (!res.ok) { alert(res.error); return; }
        if (afterDeleteFn) afterDeleteFn();
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
            '<div><h2 style="font-size:1.4rem;font-weight:700;color:#10213c;">Tòa nhà</h2></div>' +
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

    function renderServiceFeesTab(selectedBuildingId) {
        var tab = byId('service-fees-tab');
        if (!tab) return;
        var buildings = RHD.list('buildings');
        if (selectedBuildingId !== undefined) RHUI.serviceFeeBuildingFilter = selectedBuildingId;
        if (!buildings.some(function (b) { return b.id === RHUI.serviceFeeBuildingFilter; })) RHUI.serviceFeeBuildingFilter = '';
        var services = [];
        buildings.forEach(function (building) {
            (building.services || []).forEach(function (service, index) {
                var typeMatches = !RHUI.serviceFeeTypeFilter || service.feeType === RHUI.serviceFeeTypeFilter;
                var buildingMatches = !RHUI.serviceFeeBuildingFilter || building.id === RHUI.serviceFeeBuildingFilter;
                var searchValue = [service.name, service.code, feeTypeLabel(service.feeType), building.name, building.shortName].join(' ').toLocaleLowerCase();
                var searchMatches = !RHUI.serviceFeeSearch || searchValue.indexOf(RHUI.serviceFeeSearch.toLocaleLowerCase()) !== -1;
                if (typeMatches && buildingMatches && searchMatches) services.push({ building: building, service: service, index: index });
            });
        });
        var visibleKeys = services.map(function (entry) { return entry.building.id + ':' + entry.index; });
        RHUI.selectedServiceFees = RHUI.selectedServiceFees.filter(function (key) { return visibleKeys.indexOf(key) !== -1; });
        var rows = services.map(function (entry) {
            var service = entry.service;
            var rowKey = entry.building.id + ':' + entry.index;
            var codeSeed = String(service.id || (entry.building.id + '-' + entry.index)).split('').reduce(function (sum, ch) { return (sum * 31 + ch.charCodeAt(0)) % 1000000; }, 0);
            var code = service.code || ('DV' + String(codeSeed).padStart(6, '0'));
            var unit = service.unit || (service.calcMethod === 'meter' ? (service.feeType === 'water' ? '/m³' : '/kWh') : service.calcMethod === 'person' ? '/Người' : service.calcMethod === 'apartment' ? '/Phòng' : service.calcMethod === 'quantity' ? '/Đơn vị' : '');
            return '<tr>' +
                '<td><input type="checkbox" aria-label="Chọn ' + escapeHtml(service.name || 'phí dịch vụ') + '" ' + (RHUI.selectedServiceFees.indexOf(rowKey) !== -1 ? 'checked ' : '') + 'onchange="RHUI.toggleServiceFeeSelection(\'' + rowKey + '\',this.checked)"></td>' +
                '<td class="fee-code">' + escapeHtml(code) + '</td>' +
                '<td>' + escapeHtml(service.name || 'Chưa đặt tên') + '</td>' +
                '<td>' + escapeHtml(feeTypeLabel(service.feeType)) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;">' + (Number(service.unitPrice) ? Number(service.unitPrice).toLocaleString('vi-VN') : '---') + (Number(service.unitPrice) ? ' đ' : '') + escapeHtml(unit) + '</td>' +
                '<td style="text-align:center;"><span class="rh-fee-default ' + (service.isDefault ? 'yes' : 'no') + '">' + (service.isDefault ? 'Có' : 'Không') + '</span></td>' +
                '<td><div class="rh-fee-actions"><button type="button" class="rh-fee-icon-btn" title="Chỉnh sửa" aria-label="Chỉnh sửa" onclick="RHUI.openServiceFeeForm(\'' + entry.building.id + '\',' + entry.index + ')"><i class="fas fa-pen-to-square"></i></button><button type="button" class="rh-fee-icon-btn delete" title="Xóa" aria-label="Xóa" onclick="RHUI.deleteServiceFee(\'' + entry.building.id + '\',' + entry.index + ')"><i class="fas fa-trash"></i></button></div></td></tr>';
        }).join('');

        var buildingOptions = '<option value="">Tòa nhà</option>' + buildings.map(function (building) {
            return '<option value="' + escapeHtml(building.id) + '"' + (building.id === RHUI.serviceFeeBuildingFilter ? ' selected' : '') + '>' + escapeHtml(building.name || building.shortName) + '</option>';
        }).join('');
        var noBuildings = !buildings.length;
        var typeOptions = '<option value="">Loại dịch vụ</option>' + (RHD.FEE_TYPES || []).map(function (type) {
            return '<option value="' + escapeHtml(type.id) + '"' + (type.id === RHUI.serviceFeeTypeFilter ? ' selected' : '') + '>' + escapeHtml(type.label) + '</option>';
        }).join('');
        tab.innerHTML = renderDemoBanner('buildings') +
            '<div class="card">' +
            '<div style="align-items:center;display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;margin-bottom:1rem;">' +
            '<h2 style="color:#526275;font-size:1.05rem;font-weight:600;">Danh sách dịch vụ</h2>' +
            '<div class="rh-fee-top-actions">' +
            (noBuildings ? '<button type="button" class="rh-fee-top-button add" title="Thêm tòa nhà" onclick="RHUI.openBuildingForm()"><i class="fas fa-plus"></i></button>' : '<button type="button" class="rh-fee-top-button add" title="Thêm dịch vụ" aria-label="Thêm dịch vụ" onclick="RHUI.openServiceFeeForm(\'' + (RHUI.serviceFeeBuildingFilter || buildings[0].id) + '\',null)"><i class="fas fa-plus"></i></button>') +
            '<button type="button" class="rh-fee-top-button delete" title="Xóa dịch vụ đã chọn" aria-label="Xóa dịch vụ đã chọn" onclick="RHUI.deleteSelectedServiceFees()"><i class="fas fa-trash"></i></button></div>' +
            '</div>' +
            (noBuildings ? emptyState('fa-building', 'Hãy tạo tòa nhà trước khi khai báo phí dịch vụ.') :
                '<div class="rh-fee-toolbar"><select id="serviceFeeTypeFilter" aria-label="Lọc loại dịch vụ" onchange="RHUI.setServiceFeeFilters()">' + typeOptions + '</select><select id="serviceFeeBuildingFilter" aria-label="Lọc tòa nhà" onchange="RHUI.setServiceFeeFilters()">' + buildingOptions + '</select><input id="serviceFeeSearch" type="search" aria-label="Tìm kiếm dịch vụ" placeholder="Tìm kiếm" value="' + escapeHtml(RHUI.serviceFeeSearch) + '" oninput="RHUI.setServiceFeeFilters()"></div>' +
                (services.length ? '<div class="rh-fee-table-wrap"><table class="rh-fee-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả" ' + (services.length && RHUI.selectedServiceFees.length === services.length ? 'checked' : '') + ' onchange="RHUI.toggleAllServiceFees(this.checked)"></th><th>Mã</th><th>Tên dịch vụ</th><th>Loại dịch vụ</th><th style="text-align:right;">Giá tiền</th><th style="text-align:center;">Mặc định</th><th>Thao tác</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div style="color:#718096;padding:2rem;text-align:center;">' + (RHUI.serviceFeeSearch || RHUI.serviceFeeTypeFilter || RHUI.serviceFeeBuildingFilter ? 'Không tìm thấy dịch vụ phù hợp.' : 'Chưa có dịch vụ nào. Nhấn nút + để thêm dịch vụ.') + '</div>')) +
            '</div>';
    }

    RHUI.setServiceFeeFilters = function () {
        RHUI.serviceFeeTypeFilter = byId('serviceFeeTypeFilter').value;
        RHUI.serviceFeeBuildingFilter = byId('serviceFeeBuildingFilter').value;
        RHUI.serviceFeeSearch = byId('serviceFeeSearch').value.trim();
        renderServiceFeesTab();
        var search = byId('serviceFeeSearch');
        if (search) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
    };

    RHUI.toggleServiceFeeSelection = function (key, checked) {
        var selected = RHUI.selectedServiceFees.filter(function (item) { return item !== key; });
        if (checked) selected.push(key);
        RHUI.selectedServiceFees = selected;
        renderServiceFeesTab();
    };

    RHUI.toggleAllServiceFees = function (checked) {
        var buildings = RHD.list('buildings');
        var keys = [];
        buildings.forEach(function (building) {
            if (RHUI.serviceFeeBuildingFilter && building.id !== RHUI.serviceFeeBuildingFilter) return;
            (building.services || []).forEach(function (service, index) {
                var searchValue = [service.name, service.code, feeTypeLabel(service.feeType), building.name, building.shortName].join(' ').toLocaleLowerCase();
                if ((!RHUI.serviceFeeTypeFilter || service.feeType === RHUI.serviceFeeTypeFilter) && (!RHUI.serviceFeeSearch || searchValue.indexOf(RHUI.serviceFeeSearch.toLocaleLowerCase()) !== -1)) keys.push(building.id + ':' + index);
            });
        });
        RHUI.selectedServiceFees = checked ? keys : [];
        renderServiceFeesTab();
    };

    RHUI.deleteSelectedServiceFees = function () {
        if (!RHUI.selectedServiceFees.length) { alert('Vui lòng chọn dịch vụ cần xóa.'); return; }
        if (!confirm('Xóa ' + RHUI.selectedServiceFees.length + ' dịch vụ đã chọn?')) return;
        var selectedByBuilding = {};
        RHUI.selectedServiceFees.forEach(function (key) {
            var splitAt = key.lastIndexOf(':');
            var buildingId = key.slice(0, splitAt);
            var index = Number(key.slice(splitAt + 1));
            (selectedByBuilding[buildingId] || (selectedByBuilding[buildingId] = [])).push(index);
        });
        Object.keys(selectedByBuilding).forEach(function (buildingId) {
            var building = RHD.get('buildings', buildingId);
            if (!building) return;
            var removed = selectedByBuilding[buildingId].sort(function (a, b) { return b - a; });
            var services = (building.services || []).slice();
            removed.forEach(function (index) { services.splice(index, 1); });
            RHD.update('buildings', buildingId, { services: services });
        });
        RHUI.selectedServiceFees = [];
        renderServiceFeesTab();
        renderBuildingsTab();
    };

    RHUI.openServiceFeeForm = function (buildingId, index) {
        var building = RHD.get('buildings', buildingId);
        if (!building) return;
        var services = building.services || [];
        var service = index == null ? null : services[index];
        if (index != null && !service) return;
        RHUI.serviceFeeBuildingId = buildingId;
        RHUI.serviceFeeIndex = index;
        var html = '<form onsubmit="RHUI.saveServiceFee(event)">' +
            '<div class="rh-field" style="margin-bottom:1rem;"><label>Tòa nhà</label><select id="sfBuilding"' + (service ? ' disabled' : '') + '>' + selectOptions(RHD.list('buildings'), 'id', 'name', buildingId) + '</select></div>' +
            '<div class="rh-grid-2">' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Tên khoản phí *</label><input id="sfName" required value="' + escapeHtml(service ? service.name : '') + '" placeholder="Ví dụ: Phí quản lý vận hành"></div>' +
            '<div class="rh-field"><label>Loại phí</label><select id="sfFeeType">' + selectOptions(RHD.FEE_TYPES, 'id', 'label', service ? service.feeType : 'service') + '</select></div>' +
            '<div class="rh-field"><label>Cách tính</label><select id="sfCalcMethod">' + selectOptions(RHD.CALC_METHODS, 'id', 'label', service ? service.calcMethod : 'fixed') + '</select></div>' +
            '<div class="rh-field"><label>Giá tiền (đ)</label><input id="sfUnitPrice" type="number" min="0" step="1" value="' + (service ? Number(service.unitPrice) || 0 : 0) + '"></div>' +
            '<div class="rh-field"><label>Đơn vị tính</label><input id="sfUnit" value="' + escapeHtml(service ? service.unit || '' : '') + '" placeholder="/Phòng, /Người, /kWh..."></div>' +
            '<div class="rh-field"><label>Thuế suất (%)</label><input id="sfTaxRate" type="number" min="0" max="100" step="0.01" value="' + (service ? Number(service.taxRate) || 0 : 0) + '"></div>' +
            '<label class="rh-choice" style="grid-column:1/-1;"><input id="sfDefault" type="checkbox" ' + (service && service.isDefault ? 'checked' : '') + '> Đặt làm phí mặc định</label>' +
            '</div><div id="sfError" style="color:#ef4444;font-size:.85rem;margin-top:.75rem;"></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;"><button type="submit" class="btn-primary">Lưu phí dịch vụ</button><button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Hủy</button></div></form>';
        openDrawer(service ? 'Sửa phí dịch vụ' : 'Thêm phí dịch vụ', html);
    };

    RHUI.saveServiceFee = function (ev) {
        ev.preventDefault();
        var building = RHD.get('buildings', RHUI.serviceFeeBuildingId);
        if (!building) return;
        var services = (building.services || []).slice();
        var fee = {
            id: RHUI.serviceFeeIndex == null ? 'svc-' + Date.now() + Math.random().toString(36).slice(2, 6) : (services[RHUI.serviceFeeIndex].id || 'svc-' + Date.now()),
            code: RHUI.serviceFeeIndex == null ? 'DV' + String(Date.now()).slice(-6) : (services[RHUI.serviceFeeIndex].code || ''),
            name: byId('sfName').value.trim(),
            feeType: byId('sfFeeType').value,
            calcMethod: byId('sfCalcMethod').value,
            unitPrice: Number(byId('sfUnitPrice').value) || 0,
            unit: byId('sfUnit').value.trim(),
            taxRate: Number(byId('sfTaxRate').value) || 0,
            isDefault: byId('sfDefault').checked
        };
        if (!fee.name) { byId('sfError').textContent = 'Vui lòng nhập tên khoản phí.'; return; }
        if (RHUI.serviceFeeIndex == null) services.push(fee);
        else services[RHUI.serviceFeeIndex] = Object.assign({}, services[RHUI.serviceFeeIndex], fee);
        var targetBuildingId = byId('sfBuilding').value || building.id;
        var result;
        if (targetBuildingId !== building.id) {
            var targetBuilding = RHD.get('buildings', targetBuildingId);
            result = targetBuilding
                ? RHD.update('buildings', targetBuildingId, { services: (targetBuilding.services || []).concat([fee]) })
                : { ok: false, error: 'Không tìm thấy tòa nhà đã chọn.' };
        } else {
            result = RHD.update('buildings', building.id, { services: services });
        }
        if (!result.ok) { byId('sfError').textContent = result.error; return; }
        RHUI.closeDrawer();
        renderServiceFeesTab(RHUI.serviceFeeBuildingFilter);
        renderBuildingsTab();
    };

    RHUI.deleteServiceFee = function (buildingId, index) {
        var building = RHD.get('buildings', buildingId);
        if (!building || !building.services || !building.services[index]) return;
        if (!confirm('Xóa khoản phí "' + (building.services[index].name || 'Chưa đặt tên') + '"?')) return;
        var services = building.services.slice();
        services.splice(index, 1);
        var result = RHD.update('buildings', buildingId, { services: services });
        if (!result.ok) { alert(result.error); return; }
        renderServiceFeesTab(RHUI.serviceFeeBuildingFilter);
        renderBuildingsTab();
    };

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

    function normalizeApartmentRecord(apartment) {
        if (!apartment) return null;
        var normalized = Object.assign({}, apartment, {
            id: apartment.id,
            name: apartment.name || apartment.apartmentNo || apartment.code || 'Căn hộ',
            buildingId: apartment.buildingId || '',
            floor: apartment.floor || '',
            area: apartment.area || '',
            rentPrice: Number(apartment.rentPrice) || 0,
            depositPrice: Number(apartment.depositPrice) || 0,
            status: apartment.status || 'vacant',
            active: apartment.active !== false,
            photos: Array.isArray(apartment.photos) ? apartment.photos : (apartment.photo ? [apartment.photo] : []),
            buildingName: apartment.buildingName || '',
            buildingCode: apartment.buildingCode || '',
            address: apartment.address || '',
            notes: apartment.notes || ''
        });
        return normalized;
    }

    function apartmentDetailStatus(apartment) {
        var statusList = RHD.APARTMENT_STATUSES || [];
        var key = apartment && apartment.statusGroup ? apartment.statusGroup : (apartment && apartment.status ? apartment.status : 'vacant');
        var meta = statusMeta(statusList, key);
        if (meta.id === key || key === 'occupied' || key === 'vacant' || key === 'maintenance' || key === 'deposited') return meta;
        return statusMeta(statusList, 'vacant');
    }

    function apartmentDetailLeaseStatus(contract) {
        if (!contract) return { label: 'Chưa có hợp đồng', color: '#94a3b8', bg: '#f1f5f9' };
        if (contract.status === 'ended' || contract.status === 'terminated') return { label: 'Đã kết thúc', color: '#61708a', bg: '#f1f5f9' };
        return { label: 'Đang thuê', color: '#18a878', bg: '#e6f8ef' };
    }

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
        var state = RHUI.customerBrowser || (RHUI.customerBrowser = {
            status: 'current',
            search: '',
            area: '',
            buildingId: '',
            customerName: '',
            customerIdNumber: '',
            customerPhone: '',
            apartmentId: '',
            floor: '',
            searchOpen: false,
            filtersOpen: false
        });
        var customers = scoped('customers');
        var contracts = scoped('contracts');
        var now = new Date();
        var dateKey = function (date) {
            return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2);
        };
        var today = dateKey(now);
        var soon = new Date();
        soon.setDate(soon.getDate() + 30);
        var recent = new Date();
        recent.setDate(recent.getDate() - 30);
        var soonDate = dateKey(soon);
        var recentDate = dateKey(recent);
        var buildings = scoped('buildings');
        var apartments = scoped('apartments');
        var areas = buildings.map(function (building) { return building.province || building.ward || ''; })
            .filter(function (area, index, all) { return area && all.indexOf(area) === index; });
        var floorApartments = apartments.filter(function (apartment) {
            if (state.buildingId) return apartment.buildingId === state.buildingId;
            if (state.area) {
                var apartmentBuilding = RHD.get('buildings', apartment.buildingId);
                return apartmentBuilding && (apartmentBuilding.province || apartmentBuilding.ward || '') === state.area;
            }
            return true;
        });
        var floors = floorApartments.map(function (apartment) { return apartment.floor || ''; })
            .filter(function (floor, index, all) { return floor && all.indexOf(floor) === index; });
        if (state.floor && floors.indexOf(state.floor) === -1) state.floor = '';
        if (state.area && areas.indexOf(state.area) === -1) state.area = '';
        if (state.buildingId && !buildings.some(function (building) { return building.id === state.buildingId; })) state.buildingId = '';
        if (state.apartmentId && !apartments.some(function (apartment) { return apartment.id === state.apartmentId; })) state.apartmentId = '';
        var customersWithContracts = customers.map(function (customer) {
            var customerContracts = contracts.filter(function (contract) { return contract.customerId === customer.id; })
                .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
            var currentContract = customerContracts.filter(function (contract) {
                return contract.status !== 'ended' && contract.status !== 'terminated' && !(contract.endDate && contract.endDate < today);
            })[0] || null;
            var latestContract = currentContract || customerContracts[0] || null;
            var profileApartment = customer.residenceApartmentId ? RHD.get('apartments', customer.residenceApartmentId) : null;
            var profileBuilding = profileApartment
                ? RHD.get('buildings', profileApartment.buildingId)
                : (customer.residenceBuildingId ? RHD.get('buildings', customer.residenceBuildingId) : null);
            var apartment = profileApartment || (customer.residenceApartmentId
                ? null
                : (latestContract ? RHD.get('apartments', latestContract.apartmentId) : null));
            var building = profileBuilding || (customer.residenceBuildingId
                ? null
                : (latestContract ? RHD.get('buildings', latestContract.buildingId) : null));
            var guest = customer.customerType === 'Khách vãng lai';
            var category = guest ? 'guest' : (currentContract ? 'current' : (customerContracts.length ? 'moved' : 'unassigned'));
            return {
                customer: customer,
                contracts: customerContracts,
                currentContract: currentContract,
                building: building,
                apartment: apartment,
                category: category
            };
        });
        var activeCustomers = customersWithContracts.filter(function (entry) {
            return entry.category === 'current' && (!state.buildingId || entry.building && entry.building.id === state.buildingId);
        });
        var recentCount = activeCustomers.filter(function (entry) {
            var moveInDate = entry.customer.moveInDate || entry.currentContract.startDate || '';
            return moveInDate >= recentDate && moveInDate <= today;
        }).length;
        var expiringSoon = contracts.filter(function (contract) {
            return contract.status !== 'ended' && contract.status !== 'terminated' &&
                contract.endDate && contract.endDate >= today && contract.endDate <= soonDate &&
                (!state.buildingId || contract.buildingId === state.buildingId);
        }).length;
        var scopedCustomers = customersWithContracts.filter(function (entry) {
            var area = entry.building && (entry.building.province || entry.building.ward) || '';
            return (!state.area || area === state.area) &&
                (!state.buildingId || entry.building && entry.building.id === state.buildingId) &&
                (!state.apartmentId || entry.apartment && entry.apartment.id === state.apartmentId);
        });
        var statusCounts = {
            all: scopedCustomers.length,
            current: scopedCustomers.filter(function (entry) { return entry.category === 'current'; }).length,
            moved: scopedCustomers.filter(function (entry) { return entry.category === 'moved'; }).length,
            guest: scopedCustomers.filter(function (entry) { return entry.category === 'guest'; }).length,
            unassigned: scopedCustomers.filter(function (entry) { return entry.category === 'unassigned'; }).length
        };
        var visibleCustomers = customersWithContracts.filter(function (entry) {
            if (state.status !== 'all' && entry.category !== state.status) return false;
            var area = entry.building && (entry.building.province || entry.building.ward) || '';
            if (state.area && area !== state.area) return false;
            if (state.buildingId && (!entry.building || entry.building.id !== state.buildingId)) return false;
            if (state.customerName && String(entry.customer.fullName || '').toLocaleLowerCase().indexOf(state.customerName.toLocaleLowerCase()) === -1) return false;
            if (state.customerIdNumber && String(entry.customer.idNumber || '').toLocaleLowerCase().indexOf(state.customerIdNumber.toLocaleLowerCase()) === -1) return false;
            if (state.customerPhone && String(entry.customer.phone || '').toLocaleLowerCase().indexOf(state.customerPhone.toLocaleLowerCase()) === -1) return false;
            if (state.apartmentId && (!entry.apartment || entry.apartment.id !== state.apartmentId)) return false;
            if (state.floor && (!entry.apartment || entry.apartment.floor !== state.floor)) return false;
            if (state.search) {
                var searchText = [
                    entry.customer.fullName, entry.customer.phone, entry.customer.idNumber, entry.customer.passportNumber,
                    entry.building && (entry.building.name || entry.building.shortName),
                    entry.apartment && entry.apartment.name
                ].join(' ').toLocaleLowerCase();
                if (searchText.indexOf(state.search.toLocaleLowerCase()) === -1) return false;
            }
            return true;
        });
        var residentUsers = global.RH && typeof global.RH.getUsers === 'function'
            ? global.RH.getUsers().filter(function (user) { return user.role === 'resident' && user.residentId; })
            : [];
        var detailCustomers = visibleCustomers.map(function (entry) { return entry.customer; });
        var foreignCount = detailCustomers.filter(function (customer) {
            return customer.isForeigner || customer.customerType === 'Khách nước ngoài';
        }).length;
        var companyCount = detailCustomers.filter(function (customer) {
            return customer.customerType === 'Công ty' || customer.customerType === 'Tổ chức';
        }).length;
        var individualCount = detailCustomers.filter(function (customer) {
            return customer.customerType === 'Cá nhân';
        }).length;
        var genderCounts = {
            male: detailCustomers.filter(function (customer) { return customer.gender === 'Nam'; }).length,
            female: detailCustomers.filter(function (customer) { return customer.gender === 'Nữ'; }).length,
            other: detailCustomers.filter(function (customer) { return customer.gender !== 'Nam' && customer.gender !== 'Nữ'; }).length
        };
        var linkedCount = detailCustomers.filter(function (customer) {
            return residentUsers.some(function (user) { return user.residentId === customer.id; });
        }).length;
        var residenceCounts = {
            current: visibleCustomers.filter(function (entry) { return entry.category === 'current'; }).length,
            moved: visibleCustomers.filter(function (entry) { return entry.category === 'moved'; }).length,
            noContract: visibleCustomers.filter(function (entry) { return entry.category === 'unassigned'; }).length,
            guest: visibleCustomers.filter(function (entry) { return entry.category === 'guest'; }).length
        };
        var customerRows = visibleCustomers.map(function (entry, index) {
            var c = entry.customer;
            var rentalDate = entry.currentContract ? entry.currentContract.startDate : c.moveInDate;
            var nameParts = String(c.fullName || 'KH').trim().split(/\s+/).filter(Boolean);
            var initials = nameParts.length > 1
                ? nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)
                : (nameParts[0] || 'KH').slice(0, 2);
            var idLabel = c.isForeigner || c.customerType === 'Khách nước ngoài' ? c.passportNumber : c.idNumber;
            var customerStatus = entry.category === 'current' || entry.category === 'moved'
                ? '<select class="rh-customer-status-select ' + (entry.category === 'current' ? 'current' : 'moved') + '" data-customer-status="' + escapeHtml(c.id) + '" aria-label="Trạng thái của ' + escapeHtml(c.fullName || 'khách hàng') + '">' +
                    '<option value="current"' + (entry.category === 'current' ? ' selected' : '') + '>Đang ở</option>' +
                    '<option value="moved"' + (entry.category === 'moved' ? ' selected' : '') + '>Đã chuyển đi</option>' +
                    '</select>'
                : '<span class="rh-customer-status-label ' + (entry.category === 'guest' ? 'guest' : 'unassigned') + '">' +
                    (entry.category === 'guest' ? 'Khách vãng lai' : 'Chưa có hợp đồng') + '</span>';
            return '<tr>' +
                '<td class="rh-customer-code">' + escapeHtml(customerCode(c) || '—') + '</td>' +
                '<td class="rh-customer-row-actions">' +
                rowButton('customers.update', "RHUI.openCustomerForm('" + c.id + "')", 'fa-pen-to-square', 'Sửa') +
                rowButton('contracts.create', "RHUI.openContractForCustomer('" + c.id + "')", 'fa-file-lines', 'Tạo hợp đồng') +
                rowButton('customers.delete', "RHUI.deleteCustomer('" + c.id + "')", 'fa-trash', 'Xóa', true) +
                '</td>' +
                '<td><div class="rh-customer-table-person"><span class="rh-customer-table-avatar rh-customer-table-avatar-' + (index % 3) + '">' + escapeHtml(initials.toUpperCase()) + '</span><span><strong>' + escapeHtml(c.fullName || 'Chưa có tên') + '</strong><small>' + escapeHtml(c.phone || 'Chưa có số điện thoại') + '</small></span></div></td>' +
                '<td><span class="rh-customer-address-label">Tòa nhà: ' + escapeHtml(entry.building ? entry.building.name || entry.building.shortName : '—') + '</span><span class="rh-customer-address-label">Căn hộ: ' + escapeHtml(entry.apartment ? entry.apartment.name : '—') + '</span></td>' +
                '<td>' + escapeHtml(idLabel || '—') + '</td>' +
                '<td>' + escapeHtml(rentalDate ? fmtDate(rentalDate) : '—') + '</td>' +
                '<td>' + customerStatus + '</td>' +
                '</tr>';
        }).join('');

        var areaOptions = '<option value="">Chọn khu vực</option>' + areas.map(function (area) {
            return '<option value="' + escapeHtml(area) + '"' + (state.area === area ? ' selected' : '') + '>' + escapeHtml(area) + '</option>';
        }).join('');
        var buildingOptions = '<option value="">Chọn tòa nhà</option>' + buildings.filter(function (building) {
            return !state.area || (building.province || building.ward || '') === state.area;
        }).map(function (building) {
            return '<option value="' + escapeHtml(building.id) + '"' + (state.buildingId === building.id ? ' selected' : '') + '>' +
                escapeHtml(building.shortName || building.name) + '</option>';
        }).join('');
        var apartmentOptions = '<option value="">Chọn căn hộ</option>' + apartments.filter(function (apartment) {
            if (state.buildingId) return apartment.buildingId === state.buildingId;
            if (state.area) {
                var apartmentBuilding = RHD.get('buildings', apartment.buildingId);
                return apartmentBuilding && (apartmentBuilding.province || apartmentBuilding.ward || '') === state.area;
            }
            return true;
        }).map(function (apartment) {
            return '<option value="' + escapeHtml(apartment.id) + '"' + (state.apartmentId === apartment.id ? ' selected' : '') + '>' +
                escapeHtml(apartment.name || apartment.code || 'Căn hộ') + '</option>';
        }).join('');
        var floorOptions = '<option value="">Chọn tầng</option>' + floors.map(function (floor) {
            return '<option value="' + escapeHtml(floor) + '"' + (state.floor === floor ? ' selected' : '') + '>' + escapeHtml(floor) + '</option>';
        }).join('');
        var emptyMessage = state.status === 'current' ? 'Chưa có khách đang ở.' :
            (state.status === 'moved' ? 'Chưa có khách đã chuyển đi.' :
                (state.status === 'guest' ? 'Chưa có khách vãng lai.' :
                    (state.status === 'unassigned' ? 'Chưa có hồ sơ khách hàng chưa gắn hợp đồng.' : 'Chưa có khách hàng nào phù hợp.')));
        var customerDetailHtml = '<style>' +
            '.rh-customer-detail{color:#18212f;font-family:"Be Vietnam Pro","Segoe UI",sans-serif}' +
            '@keyframes rhCustomerSheetIn{from{transform:translateY(28px);opacity:.8}to{transform:translateY(0);opacity:1}}' +
            '@media(max-width:640px){.rh-drawer-overlay:has(.rh-customer-detail){align-items:flex-end;justify-content:center}.rh-drawer-overlay:has(.rh-customer-detail) .rh-drawer{animation:rhCustomerSheetIn .25s ease;border-radius:24px 24px 0 0;height:min(86vh,760px);width:100%!important;box-shadow:0 -18px 45px rgba(11,36,71,.2)}.rh-drawer-overlay:has(.rh-customer-detail) .rh-drawer-header{border:0;padding:.8rem 1rem .45rem}.rh-drawer-overlay:has(.rh-customer-detail) .rh-drawer-body{padding:.7rem 1rem 1rem}}' +
            '.rh-customer-detail-intro{color:#6b7788;margin:-.35rem 0 1rem}' +
            '.rh-customer-detail-total{display:inline-flex;align-items:center;gap:.45rem;border-radius:999px;background:#eaf2ff;color:#1769dc;font-weight:800;padding:.45rem .8rem}' +
            '.rh-customer-detail-section{border:1px solid #e1e5ea;border-radius:14px;margin-top:.8rem;padding:.9rem}' +
            '.rh-customer-detail-section h4{font-size:1rem;margin:0 0 .7rem}' +
            '.rh-customer-detail-list{border:1px solid #e5e7eb;border-radius:10px;background:#fff;padding:.35rem .8rem}' +
            '.rh-customer-detail-row{align-items:center;border-bottom:1px solid #edf0f3;display:flex;gap:.6rem;justify-content:space-between;padding:.65rem 0}' +
            '.rh-customer-detail-row:last-child{border-bottom:0}' +
            '.rh-customer-detail-label{align-items:center;color:#687385;display:inline-flex;gap:.55rem;min-width:0}' +
            '.rh-customer-detail-row strong{font-weight:800}' +
            '.rh-customer-detail-dot{border-radius:50%;height:10px;width:10px;flex:0 0 10px}' +
            '.rh-customer-detail-note{color:#7b8492;font-size:.82rem;line-height:1.5;margin:.65rem 0 0}' +
            '</style>' +
            '<div class="rh-customer-detail">' +
            '<div class="rh-customer-detail-intro">Theo đúng phạm vi và bộ lọc khách hàng đang xem.</div>' +
            '<div class="rh-customer-detail-total"><i class="fas fa-users"></i>' + detailCustomers.length + ' khách hàng</div>' +
            '<section class="rh-customer-detail-section"><h4>Cơ cấu khách hàng</h4><div class="rh-customer-detail-list">' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#2874e8"></i>Khách cá nhân</span><strong>' + individualCount + '</strong></div>' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#737c8b"></i>Khách doanh nghiệp</span><strong>' + companyCount + '</strong></div>' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#e58a18"></i>Khách nước ngoài</span><strong>' + foreignCount + '</strong></div>' +
            '</div><p class="rh-customer-detail-note">Khách nước ngoài được thống kê riêng, không tính vào nhóm cá nhân.</p></section>' +
            '<section class="rh-customer-detail-section"><h4>Giới tính</h4><div class="rh-customer-detail-list">' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#2874e8"></i>Nam</span><strong>' + genderCounts.male + '</strong></div>' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#e60068"></i>Nữ</span><strong>' + genderCounts.female + '</strong></div>' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#9aa3af"></i>Khác / Chưa khai báo</span><strong>' + genderCounts.other + '</strong></div>' +
            '</div></section>' +
            '<section class="rh-customer-detail-section"><h4>Trạng thái cư trú</h4><div class="rh-customer-detail-list">' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#087f5b"></i>Đang ở theo hợp đồng</span><strong>' + residenceCounts.current + '</strong></div>' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#e58a18"></i>Đã chuyển đi</span><strong>' + residenceCounts.moved + '</strong></div>' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#344256"></i>Chưa có hợp đồng</span><strong>' + residenceCounts.noContract + '</strong></div>' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#737c8b"></i>Khách vãng lai</span><strong>' + residenceCounts.guest + '</strong></div>' +
            '</div><p class="rh-customer-detail-note">Ứng dụng hiện chưa lưu trạng thái hồ sơ đăng ký tạm trú theo các mốc chờ xử lý/hạn/đã hủy.</p></section>' +
            '<section class="rh-customer-detail-section"><h4>Tài khoản cư dân</h4><div class="rh-customer-detail-list">' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#087f5b"></i>Đã liên kết tài khoản</span><strong>' + linkedCount + '</strong></div>' +
            '<div class="rh-customer-detail-row"><span class="rh-customer-detail-label"><i class="rh-customer-detail-dot" style="background:#344256"></i>Chưa liên kết</span><strong>' + (detailCustomers.length - linkedCount) + '</strong></div>' +
            '</div></section>' +
            '</div>';

        tab.innerHTML = '<style>' +
            '#customers-tab .rh-customer-overview{background:#fff;border:1px solid #e4eaf2;border-radius:16px;padding:1.1rem 1.25rem;margin-bottom:1rem;box-shadow:0 8px 18px rgba(15,23,42,.025)}' +
            '#customers-tab .rh-customer-overview-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}' +
            '#customers-tab .rh-customer-overview-actions{display:flex;align-items:center;gap:.5rem}' +
            '#customers-tab .rh-customer-icon-btn{width:38px;height:38px;border:1px solid #dfe6ef;border-radius:50%;background:#fff;color:#526176;cursor:pointer}' +
            '#customers-tab .rh-customer-icon-btn:hover{background:#f4f8fc;color:#1683ff}' +
            '#customers-tab .rh-customer-overview-title{display:flex;align-items:center;gap:.75rem;color:#10213c;font-weight:700;font-size:1.05rem}' +
            '#customers-tab .rh-customer-overview-icon{width:42px;height:42px;display:grid;place-items:center;border:1px solid #cce8dc;border-radius:12px;background:#f0faf5;color:#199369}' +
            '#customers-tab .rh-customer-overview-subtitle{display:block;color:#8491a2;font-size:.84rem;font-weight:400;margin-top:.2rem}' +
            '#customers-tab .rh-customer-detail-btn{border:1px solid #dce3eb;border-radius:999px;background:#fff;color:#526176;padding:.55rem .9rem;font:inherit;font-size:.84rem;cursor:pointer;white-space:nowrap}' +
            '#customers-tab .rh-customer-detail-btn i{margin-right:.35rem}' +
            '#customers-tab .rh-customer-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-radius:12px;background:#f8fafc;padding:.4rem}' +
            '#customers-tab .rh-customer-stat{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.22rem;padding:.65rem .8rem;text-align:center;border-right:1px solid #dfe5ec}' +
            '#customers-tab .rh-customer-stat:last-child{border-right:0}' +
            '#customers-tab .rh-customer-stat-value{display:flex;align-items:center;gap:.45rem;color:#1b2636;font-size:1.35rem;font-weight:800;line-height:1.2}' +
            '#customers-tab .rh-customer-stat-value i{color:#2871db;font-size:.95rem}' +
            '#customers-tab .rh-customer-stat:nth-child(2) .rh-customer-stat-value{color:#199369}' +
            '#customers-tab .rh-customer-stat:nth-child(2) .rh-customer-stat-value i{color:#199369}' +
            '#customers-tab .rh-customer-stat:nth-child(3) .rh-customer-stat-value{color:#d47b16}' +
            '#customers-tab .rh-customer-stat:nth-child(3) .rh-customer-stat-value i{color:#d47b16}' +
            '#customers-tab .rh-customer-stat-label{color:#7b8797;font-size:.82rem}' +
            '#customers-tab .rh-customer-tabs{display:flex;gap:.65rem;overflow-x:auto;padding:.2rem 0 1rem;scrollbar-width:thin}' +
            '#customers-tab .rh-customer-tab{display:inline-flex;align-items:center;gap:.55rem;flex:none;border:1px solid transparent;border-radius:999px;background:#f0f2f5;color:#677385;padding:.58rem .9rem;font:600 .86rem "Be Vietnam Pro","Segoe UI",sans-serif;white-space:nowrap;cursor:pointer}' +
            '#customers-tab .rh-customer-tab-count{border-radius:999px;background:#e2e6ec;color:#4d5969;padding:.12rem .5rem;font-size:.75rem}' +
            '#customers-tab .rh-customer-tab.active{background:#18212f;color:#fff;box-shadow:0 6px 14px rgba(24,33,47,.16)}' +
            '#customers-tab .rh-customer-tab.active .rh-customer-tab-count{background:#46505e;color:#fff}' +
            '#customers-tab .rh-customer-tools{display:grid;grid-template-columns:1fr;gap:.6rem;margin:-.15rem 0 1rem}' +
            '#customers-tab .rh-customer-filter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;grid-column:1/-1}' +
            '#customers-tab .rh-customer-filter-field{display:flex;flex-direction:column;gap:.3rem;color:#53657d;font-size:.78rem;font-weight:600}' +
            '#customers-tab .rh-customer-filter-field input,#customers-tab .rh-customer-filter-field select{width:100%;min-height:42px;border:1px solid #dfe6ef;border-radius:9px;background:#fff;color:#40526b;padding:.55rem .7rem;font:inherit;font-weight:400}' +
            '#customers-tab .rh-customer-search-wrap{display:flex;align-items:center;gap:.55rem;border:1px solid #dfe6ef;border-radius:10px;background:#fff;padding:0 .8rem;min-height:42px;grid-column:1/-1}' +
            '#customers-tab .rh-customer-search-wrap i{color:#8290a1}' +
            '#customers-tab .rh-customer-search{width:100%;border:0;outline:0;font:inherit;color:#26364b;background:transparent}' +
            '#customers-tab .rh-customer-building-filter{width:100%;min-height:42px;border:1px solid #dfe6ef;border-radius:10px;background:#fff;color:#40526b;padding:.5rem .75rem;font:inherit}' +
            '#customers-tab .rh-customer-card{padding:1.25rem!important}' +
            '#customers-tab .rh-customer-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}' +
            '#customers-tab .rh-customer-head h2{font:800 1.35rem "Plus Jakarta Sans","Be Vietnam Pro",sans-serif;color:#10213c;margin:0}' +
            '#customers-tab .rh-customer-head p{color:#8aa0bc;font-size:.88rem;margin:.3rem 0 0}' +
            '#customers-tab .rh-customer-list{display:grid;gap:.75rem}' +
            '#customers-tab .rh-customer-person-card{background:#fff;border:1px solid #e8ebef;border-radius:18px;padding:1rem 1.1rem;box-shadow:0 5px 16px rgba(25,38,55,.025)}' +
            '#customers-tab .rh-customer-person-main{display:flex;align-items:center;gap:.85rem;min-width:0}' +
            '#customers-tab .rh-customer-avatar{width:58px;height:58px;flex:0 0 58px;display:grid;place-items:center;border-radius:15px;background:#d8f1ed;color:#217e70;font-size:1.1rem;font-weight:800}' +
            '#customers-tab .rh-customer-avatar-1{background:#f1e9d5;color:#806c32}' +
            '#customers-tab .rh-customer-avatar-2{background:#efd9f1;color:#794083}' +
            '#customers-tab .rh-customer-person-info{min-width:0;flex:1}' +
            '#customers-tab .rh-customer-person-name{overflow:hidden;color:#18212f;font-size:1.05rem;font-weight:800;letter-spacing:.01em;text-overflow:ellipsis;white-space:nowrap}' +
            '#customers-tab .rh-customer-person-phone{display:flex;align-items:center;gap:.5rem;margin-top:.18rem;color:#7c8795;font-size:.9rem}' +
            '#customers-tab .rh-customer-person-phone i{font-size:.78rem}' +
            '#customers-tab .rh-customer-person-actions{display:flex;align-items:center;justify-content:flex-end;gap:.35rem;flex-wrap:wrap}' +
            '#customers-tab .rh-customer-type{margin-right:.35rem;border:1px solid #b7ccf4;border-radius:999px;padding:.35rem .75rem;color:#3573c8;background:#fff;font-size:.8rem;font-weight:600;white-space:nowrap}' +
            '#customers-tab .rh-customer-person-actions .rh-row-btn{width:34px;height:34px;border:1px solid #e1e7ee;border-radius:9px;background:#fff;color:#526176;cursor:pointer}' +
            '#customers-tab .rh-customer-person-actions .rh-row-btn.danger{border-color:#ffcaca;color:#e25555}' +
            '#customers-tab .rh-customer-person-meta{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;margin-top:.8rem}' +
            '#customers-tab .rh-customer-place{display:inline-flex;align-items:center;gap:.4rem;border-radius:999px;background:#f2f3f6;color:#6e7886;padding:.38rem .65rem;font-size:.82rem;max-width:100%}' +
            '#customers-tab .rh-customer-place i{color:#929ba6;font-size:.75rem}' +
            '#customers-tab .rh-customer-person-status{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;margin-top:.65rem;color:#77818f;font-size:.84rem}' +
            '#customers-tab .rh-customer-residency{display:inline-flex;align-items:center;gap:.4rem}' +
            '#customers-tab .rh-customer-residency i{color:#8993a1}' +
            '#customers-tab .rh-customer-registration{border-radius:999px;background:#eff3f8;color:#334155;padding:.28rem .65rem;font-weight:600}' +
            '#customers-tab .rh-customer-registration.registered{background:#e8f8ef;color:#258653}' +
            '@media(max-width:700px){#customers-tab .rh-customer-overview{padding:.9rem}#customers-tab .rh-customer-overview-head{align-items:flex-start;flex-wrap:wrap}#customers-tab .rh-customer-overview-actions{margin-left:auto}#customers-tab .rh-customer-overview-title{font-size:.9rem}#customers-tab .rh-customer-overview-icon{width:36px;height:36px}#customers-tab .rh-customer-detail-btn{padding:.45rem .65rem;font-size:.78rem}#customers-tab .rh-customer-stat{padding:.6rem .25rem}#customers-tab .rh-customer-stat-value{font-size:1.08rem}#customers-tab .rh-customer-stat-label{font-size:.72rem}#customers-tab .rh-customer-tools{grid-template-columns:1fr}#customers-tab .rh-customer-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#customers-tab .rh-customer-card{padding:1rem!important}#customers-tab .rh-customer-head{align-items:flex-start;flex-direction:column}#customers-tab .rh-customer-head h2{font-size:1.2rem}#customers-tab .rh-customer-person-card{padding:.85rem}#customers-tab .rh-customer-person-main{align-items:flex-start;flex-wrap:wrap}#customers-tab .rh-customer-avatar{width:50px;height:50px;flex-basis:50px}#customers-tab .rh-customer-person-info{padding-top:.1rem}#customers-tab .rh-customer-person-actions{width:100%;justify-content:flex-start;padding-left:calc(50px + .85rem)}#customers-tab .rh-customer-type{margin-right:auto}}' +
            '#customers-tab .rh-customer-workspace{display:grid;gap:1rem}' +
            '#customers-tab .rh-customer-tabs{align-items:center;gap:1.1rem;margin:0;padding:.15rem .25rem .75rem;border-bottom:1px solid #e4eaf2}' +
            '#customers-tab .rh-customer-tab{background:transparent;border:0;border-radius:0;color:#718096;padding:.5rem .15rem;font-size:.84rem;font-weight:600}' +
            '#customers-tab .rh-customer-tab.active{background:transparent;box-shadow:none;color:#1683ff;border-bottom:2px solid #1683ff}' +
            '#customers-tab .rh-customer-tab.active .rh-customer-tab-count{background:#eaf3ff;color:#1683ff}' +
            '#customers-tab .rh-customer-summary-grid{display:grid;gap:.8rem;grid-template-columns:repeat(4,minmax(0,1fr))}' +
            '#customers-tab .rh-customer-summary-card{align-items:center;background:#fff;border:1px solid #edf0f4;border-radius:14px;display:flex;justify-content:space-between;min-height:86px;padding:1rem 1.1rem}' +
            '#customers-tab .rh-customer-summary-icon{align-items:center;background:#eef5ff;border:1px solid #d5e5fb;border-radius:13px;color:#2874d8;display:flex;font-size:1.2rem;height:48px;justify-content:center;width:48px}' +
            '#customers-tab .rh-customer-summary-card:nth-child(2) .rh-customer-summary-icon{background:#eefbf3;border-color:#d1f2df;color:#21a66a}' +
            '#customers-tab .rh-customer-summary-card:nth-child(3) .rh-customer-summary-icon{background:#fff7e9;border-color:#f6e5c5;color:#d99120}' +
            '#customers-tab .rh-customer-summary-card:nth-child(4) .rh-customer-summary-icon{background:#fff0f0;border-color:#f6dada;color:#d65b61}' +
            '#customers-tab .rh-customer-summary-value{text-align:right}' +
            '#customers-tab .rh-customer-summary-value strong{color:#26364b;display:block;font-size:1.25rem;line-height:1.2}' +
            '#customers-tab .rh-customer-summary-value span{color:#8792a1;font-size:.78rem}' +
            '#customers-tab .rh-customer-browser{background:#fff;border:1px solid #e7ebf0;border-radius:14px;padding:.75rem}' +
            '#customers-tab .rh-customer-location-filters{display:grid;gap:.55rem;grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:.6rem}' +
            '#customers-tab .rh-customer-location-filters select{background:#fff;border:1px solid #e3e8ef;border-radius:8px;color:#5b6879;font:inherit;min-height:38px;padding:.45rem .65rem;width:100%}' +
            '#customers-tab .rh-customer-browser-toolbar{align-items:center;display:flex;gap:.55rem;justify-content:space-between;margin-bottom:.65rem}' +
            '#customers-tab .rh-customer-search-wrap{flex:1;grid-column:auto;max-width:270px;min-height:38px}' +
            '#customers-tab .rh-customer-toolbar-actions{align-items:center;display:flex;gap:.45rem}' +
            '#customers-tab .rh-customer-toolbar-actions .rh-customer-icon-btn{border-radius:8px;height:38px;width:38px}' +
            '#customers-tab .rh-customer-toolbar-actions .rh-customer-detail-btn{height:38px;padding:.45rem .7rem}' +
            '#customers-tab .rh-customer-filter-grid{grid-template-columns:repeat(3,minmax(0,1fr));margin:.25rem 0 .75rem}' +
            '#customers-tab .rh-customer-table-wrap{border:1px solid #edf0f3;border-radius:10px;overflow:auto}' +
            '#customers-tab .rh-customer-data-table{border-collapse:collapse;min-width:950px;width:100%}' +
            '#customers-tab .rh-customer-data-table{min-width:1100px}' +
            '#customers-tab .rh-customer-data-table th,#customers-tab .rh-customer-data-table td{border-bottom:1px solid #edf0f3;padding:.7rem .8rem;text-align:left;vertical-align:middle}' +
            '#customers-tab .rh-customer-data-table th{background:#f8fafc;color:#768294;font-size:.77rem;font-weight:600;white-space:nowrap}' +
            '#customers-tab .rh-customer-data-table td{color:#697789;font-size:.82rem}' +
            '#customers-tab .rh-customer-data-table tbody tr:last-child td{border-bottom:0}' +
            '#customers-tab .rh-customer-data-table tbody tr:hover{background:#f8fbff}' +
            '#customers-tab .rh-customer-code{color:#258a65!important;font-weight:700;white-space:nowrap}' +
            '#customers-tab .rh-customer-row-actions{white-space:nowrap}' +
            '#customers-tab .rh-customer-row-actions .rh-row-btn{align-items:center;background:#fff;border:1px solid #e1e7ee;border-radius:7px;color:#526176;display:inline-flex;height:30px;justify-content:center;margin:0 .18rem 0 0;padding:0;width:30px}' +
            '#customers-tab .rh-customer-row-actions .rh-row-btn:first-child{background:#e8f8ef;border-color:#c5ecd6;color:#239461}' +
            '#customers-tab .rh-customer-row-actions .rh-row-btn:nth-child(2){background:#eaf3ff;border-color:#ccdefa;color:#2874d8}' +
            '#customers-tab .rh-customer-row-actions .rh-row-btn.danger{background:#fff0f0;border-color:#f6d1d1;color:#d94c4c}' +
            '#customers-tab .rh-customer-table-person{align-items:center;display:flex;gap:.6rem;min-width:180px}' +
            '#customers-tab .rh-customer-table-avatar{align-items:center;background:#edf1f4;border-radius:50%;color:#5d6e7e;display:flex;flex:0 0 38px;font-size:.68rem;font-weight:700;height:38px;justify-content:center;width:38px}' +
            '#customers-tab .rh-customer-table-avatar-1{background:#e8f4f2;color:#42867b}#customers-tab .rh-customer-table-avatar-2{background:#f4edf7;color:#876396}' +
            '#customers-tab .rh-customer-table-person strong,#customers-tab .rh-customer-table-person small{display:block}' +
            '#customers-tab .rh-customer-table-person strong{color:#29384a;font-size:.82rem;font-weight:700}' +
            '#customers-tab .rh-customer-table-person small{color:#8993a0;font-size:.76rem;margin-top:.15rem}' +
            '#customers-tab .rh-customer-address-label{display:block;line-height:1.55;white-space:nowrap}' +
            '#customers-tab .rh-customer-add-button{white-space:nowrap}' +
            '#customers-tab .rh-customer-status-select{appearance:auto;border:1px solid #ccebd9;border-radius:999px;background:#effaf4;color:#238653;font:600 .78rem inherit;padding:.4rem .65rem;cursor:pointer}' +
            '#customers-tab .rh-customer-status-select.moved{border-color:#e0e5ec;background:#f4f6f8;color:#637083}' +
            '#customers-tab .rh-customer-status-label{display:inline-block;border-radius:999px;padding:.4rem .65rem;font-size:.76rem;font-weight:600;white-space:nowrap}' +
            '#customers-tab .rh-customer-status-label.guest{background:#fff6e8;color:#a56a12}#customers-tab .rh-customer-status-label.unassigned{background:#f1f3f6;color:#697789}' +
            '@media(max-width:900px){#customers-tab .rh-customer-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#customers-tab .rh-customer-location-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
            '@media(max-width:600px){#customers-tab .rh-customer-summary-card{min-height:72px;padding:.7rem}#customers-tab .rh-customer-summary-icon{height:40px;width:40px}#customers-tab .rh-customer-summary-value strong{font-size:1.05rem}#customers-tab .rh-customer-browser-toolbar{align-items:stretch;flex-direction:column}#customers-tab .rh-customer-search-wrap{max-width:none}#customers-tab .rh-customer-toolbar-actions{justify-content:flex-end}#customers-tab .rh-customer-filter-grid{grid-template-columns:1fr}}' +
            '</style>' +
            renderDemoBanner('customers') +
            '<div class="rh-customer-workspace">' +
            '<div class="rh-customer-tabs" role="tablist" aria-label="Trạng thái khách hàng">' +
            '<button type="button" class="rh-customer-tab' + (state.status === 'current' ? ' active' : '') + '" role="tab" aria-selected="' + (state.status === 'current') + '" onclick="RHUI.setCustomerStatus(\'current\')">Đang thuê <span class="rh-customer-tab-count">' + statusCounts.current + '</span></button>' +
            '<button type="button" class="rh-customer-tab' + (state.status === 'moved' ? ' active' : '') + '" role="tab" aria-selected="' + (state.status === 'moved') + '" onclick="RHUI.setCustomerStatus(\'moved\')">Đã chuyển đi <span class="rh-customer-tab-count">' + statusCounts.moved + '</span></button>' +
            '<button type="button" class="rh-customer-tab' + (state.status === 'guest' ? ' active' : '') + '" role="tab" aria-selected="' + (state.status === 'guest') + '" onclick="RHUI.setCustomerStatus(\'guest\')">Khách vãng lai <span class="rh-customer-tab-count">' + statusCounts.guest + '</span></button>' +
            '<button type="button" class="rh-customer-tab' + (state.status === 'all' ? ' active' : '') + '" role="tab" aria-selected="' + (state.status === 'all') + '" onclick="RHUI.setCustomerStatus(\'all\')">Tất cả <span class="rh-customer-tab-count">' + statusCounts.all + '</span></button>' +
            '</div>' +
            '<div class="rh-customer-summary-grid">' +
            '<div class="rh-customer-summary-card"><span class="rh-customer-summary-icon"><i class="fas fa-users"></i></span><span class="rh-customer-summary-value"><strong>' + detailCustomers.length + '</strong><span>Tất cả</span></span></div>' +
            '<div class="rh-customer-summary-card"><span class="rh-customer-summary-icon"><i class="far fa-user"></i></span><span class="rh-customer-summary-value"><strong>' + individualCount + '</strong><span>Cá nhân</span></span></div>' +
            '<div class="rh-customer-summary-card"><span class="rh-customer-summary-icon"><i class="far fa-building"></i></span><span class="rh-customer-summary-value"><strong>' + companyCount + '</strong><span>Tổ chức</span></span></div>' +
            '<div class="rh-customer-summary-card"><span class="rh-customer-summary-icon"><i class="fas fa-globe"></i></span><span class="rh-customer-summary-value"><strong>' + foreignCount + '</strong><span>Khách nước ngoài</span></span></div>' +
            '</div>' +
            '<section class="rh-customer-browser">' +
            '<div class="rh-customer-location-filters">' +
            '<select id="rhCustomerArea" aria-label="Chọn khu vực">' + areaOptions + '</select>' +
            '<select id="rhCustomerBuilding" aria-label="Chọn tòa nhà">' + buildingOptions + '</select>' +
            '<select id="rhCustomerFloor" aria-label="Chọn tầng">' + floorOptions + '</select>' +
            '<select id="rhCustomerApartment" aria-label="Chọn căn hộ">' + apartmentOptions + '</select>' +
            '</div>' +
            '<div class="rh-customer-browser-toolbar">' +
            '<label class="rh-customer-search-wrap"><i class="fas fa-search"></i><input id="rhCustomerSearch" class="rh-customer-search" type="search" placeholder="Tìm kiếm..." value="' + escapeHtml(state.search) + '" aria-label="Tìm kiếm khách hàng"></label>' +
            '<div class="rh-customer-toolbar-actions">' +
            '<button type="button" class="rh-customer-icon-btn" aria-label="Chi tiết khách hàng" title="Chi tiết" onclick="RHUI.openCustomerDetails()"><i class="fas fa-circle-info"></i></button>' +
            '<button type="button" class="rh-customer-icon-btn" aria-label="Bộ lọc nâng cao" title="Bộ lọc" onclick="RHUI.toggleCustomerFilters()"><i class="fas fa-filter"></i></button>' +
            addButton('Thêm khách hàng', "RHUI.openCustomerForm()", 'customers', 'customers.create') +
            '</div></div>' +
                (state.filtersOpen ? '<div class="rh-customer-filter-grid">' +
                    '<label class="rh-customer-filter-field">Họ và tên<input id="rhCustomerName" type="search" placeholder="Nhập họ và tên" value="' + escapeHtml(state.customerName) + '"></label>' +
                    '<label class="rh-customer-filter-field">CCCD<input id="rhCustomerIdNumber" type="search" placeholder="Nhập số CCCD" value="' + escapeHtml(state.customerIdNumber) + '"></label>' +
                    '<label class="rh-customer-filter-field">Số điện thoại<input id="rhCustomerPhone" type="search" placeholder="Nhập số điện thoại" value="' + escapeHtml(state.customerPhone) + '"></label>' +
                    '</div>' : '') +
            '<div id="rhCustomerTable" class="rh-customer-table-wrap"><table class="rh-customer-data-table"><thead><tr><th>Mã KH</th><th>Thao tác</th><th>Khách hàng</th><th>Căn hộ đang ở</th><th>CMND/CCCD/Hộ chiếu</th><th>Ngày thuê</th><th>Tình trạng</th></tr></thead><tbody>' +
            (customerRows || '<tr><td colspan="7" style="color:#718096;padding:2rem;text-align:center;">' + escapeHtml(emptyMessage) + '</td></tr>') +
            '</tbody></table></div>' +
            '</section></div>';

        RHUI.setCustomerStatus = function (status) {
            state.status = status;
            renderCustomersTab();
        };
        RHUI.toggleCustomerSearch = function () {
            var search = byId('rhCustomerSearch');
            if (search) search.focus();
        };
        RHUI.toggleCustomerFilters = function () {
            state.filtersOpen = !state.filtersOpen;
            renderCustomersTab();
        };
        RHUI.openCustomerDetails = function () {
            openDrawer('Chi tiết khách hàng đang ở', customerDetailHtml);
        };
        RHUI.changeCustomerStatus = function (customerId, nextStatus) {
            var customerEntry = customersWithContracts.filter(function (entry) { return entry.customer.id === customerId; })[0];
            if (!customerEntry) {
                alert('Không tìm thấy khách hàng.');
                return;
            }
            if (nextStatus === 'current') {
                if (customerEntry.category === 'current') return;
                if (!guard('contracts.create')) {
                    renderCustomersTab();
                    return;
                }
                if (!confirm('Để chuyển khách hàng sang Đang ở, cần lập hợp đồng mới. Tiếp tục tạo hợp đồng?')) {
                    renderCustomersTab();
                    return;
                }
                state.status = 'current';
                RHUI.openContractForCustomer(customerId);
                return;
            }
            if (nextStatus !== 'moved' || customerEntry.category !== 'current') return;
            if (!guard('contracts.update') || !guard('apartments.update')) {
                renderCustomersTab();
                return;
            }
            if (!confirm('Chuyển khách hàng sang Đã chuyển đi sẽ kết thúc hợp đồng đang hiệu lực và cập nhật căn hộ thành trống nếu không còn hợp đồng khác. Bạn có muốn tiếp tục?')) {
                renderCustomersTab();
                return;
            }
            var currentContracts = customerEntry.contracts.filter(function (contract) {
                return contract.status !== 'ended' && contract.status !== 'terminated' &&
                    !(contract.endDate && contract.endDate < today);
            });
            if (!currentContracts.length) {
                alert('Không tìm thấy hợp đồng đang hiệu lực để chuyển khách hàng đi.');
                renderCustomersTab();
                return;
            }
            var moveOutDate = today;
            for (var contractIndex = 0; contractIndex < currentContracts.length; contractIndex++) {
                var ended = RHD.update('contracts', currentContracts[contractIndex].id, {
                    status: 'ended',
                    moveOutDate: moveOutDate
                });
                if (!ended.ok) {
                    alert('Không thể kết thúc hợp đồng: ' + ended.error);
                    renderCustomersTab();
                    return;
                }
                if (global.RH && global.RH.syncManagerRecord) global.RH.syncManagerRecord(ended.item, 'contract');
            }
            var customerApartmentIds = currentContracts.map(function (contract) { return contract.apartmentId; }).filter(Boolean);
            customerApartmentIds.filter(function (apartmentId, index, all) {
                return all.indexOf(apartmentId) === index;
            }).forEach(function (apartmentId) {
                var apartment = RHD.get('apartments', apartmentId);
                if (!apartment || apartment.status !== 'occupied') return;
                var stillOccupied = RHD.list('contracts').some(function (contract) {
                    return contract.apartmentId === apartmentId &&
                        contract.status !== 'ended' && contract.status !== 'terminated' &&
                        !(contract.endDate && contract.endDate < today);
                });
                if (!stillOccupied) {
                    var updatedApartment = RHD.update('apartments', apartmentId, { status: 'vacant' });
                    if (!updatedApartment.ok) alert('Hợp đồng đã kết thúc nhưng chưa thể cập nhật căn hộ thành trống: ' + updatedApartment.error);
                }
            });
            renderCustomersTab();
            renderContractsTab();
            renderApartmentsTab();
            renderDashboardCounts();
        };
        var searchInput = byId('rhCustomerSearch');
        if (searchInput) searchInput.addEventListener('input', function () {
            var selectionStart = this.selectionStart;
            state.search = this.value;
            renderCustomersTab();
            var updatedInput = byId('rhCustomerSearch');
            if (updatedInput) {
                updatedInput.focus();
                updatedInput.setSelectionRange(selectionStart, selectionStart);
            }
        });
        tab.querySelectorAll('[data-customer-status]').forEach(function (select) {
            select.addEventListener('change', function () {
                RHUI.changeCustomerStatus(this.dataset.customerStatus, this.value);
            });
        });
        var areaFilter = byId('rhCustomerArea');
        if (areaFilter) areaFilter.addEventListener('change', function () {
            state.area = this.value;
            state.buildingId = '';
            state.apartmentId = '';
            state.floor = '';
            renderCustomersTab();
        });
        var buildingFilter = byId('rhCustomerBuilding');
        if (buildingFilter) buildingFilter.addEventListener('change', function () {
            state.buildingId = this.value;
            state.apartmentId = '';
            state.floor = '';
            renderCustomersTab();
        });
        [
            ['rhCustomerName', 'customerName'],
            ['rhCustomerIdNumber', 'customerIdNumber'],
            ['rhCustomerPhone', 'customerPhone']
        ].forEach(function (filter) {
            var input = byId(filter[0]);
            if (!input) return;
            input.addEventListener('input', function () {
                var selectionStart = this.selectionStart;
                state[filter[1]] = this.value;
                renderCustomersTab();
                var updatedInput = byId(filter[0]);
                if (updatedInput) {
                    updatedInput.focus();
                    updatedInput.setSelectionRange(selectionStart, selectionStart);
                }
            });
        });
        var apartmentFilter = byId('rhCustomerApartment');
        if (apartmentFilter) apartmentFilter.addEventListener('change', function () {
            state.apartmentId = this.value;
            renderCustomersTab();
        });
        var floorFilter = byId('rhCustomerFloor');
        if (floorFilter) floorFilter.addEventListener('change', function () {
            state.floor = this.value;
            renderCustomersTab();
        });
    }

    RHUI.toggleForeigner = function (checked) {
        byId('rhForeignerFields').style.display = checked ? 'block' : 'none';
    };

    RHUI.selectCustomerType = function (value) {
        if (value !== 'Khách nước ngoài') return;
        var checkbox = byId('cfForeigner');
        checkbox.checked = true;
        RHUI.toggleForeigner(true);
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
        ['Cá nhân', 'Công ty', 'Khách vãng lai', 'Khách nước ngoài'].forEach(function (t) { if (existingTypes.indexOf(t) === -1) existingTypes.push(t); });
        var isForeigner = !!(c && (c.isForeigner || c.customerType === 'Khách nước ngoài'));

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
            '<div class="rh-field"><label>Loại khách hàng</label><select id="cfType" onchange="RHUI.selectCustomerType(this.value)">' +
            existingTypes.map(function (type) {
                return '<option value="' + escapeHtml(type) + '"' + (type === (c ? c.customerType : 'Cá nhân') ? ' selected' : '') + '>' + escapeHtml(type) + '</option>';
            }).join('') +
            '</select></div>' +
            '<div class="rh-field"><label>Mã vân tay cửa</label><input id="cfFingerprint" value="' + escapeHtml(c ? c.doorFingerprintCode : '') + '"></div>' +
            '<div class="rh-field"><label>Tư vấn viên</label><input id="cfConsultant" value="' + escapeHtml(c ? c.consultantName : '') + '"></div>' +
            '<div class="rh-field"><label>SĐT tư vấn viên</label><input id="cfConsultantPhone" value="' + escapeHtml(c ? c.consultantPhone : '') + '"></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Ghi chú</label><textarea id="cfNote" rows="2">' + escapeHtml(c ? c.note : '') + '</textarea></div>' +
            '</div></div>' +

            '<div class="rh-section"><label style="display:flex;align-items:center;gap:.6rem;font-weight:600;color:#10213c;cursor:pointer;">' +
            '<input type="checkbox" id="cfForeigner" ' + (isForeigner ? 'checked' : '') + ' onchange="RHUI.toggleForeigner(this.checked)" style="width:18px;height:18px;"> Khách nước ngoài' +
            '</label>' +
            '<div id="rhForeignerFields" style="display:' + (isForeigner ? 'block' : 'none') + ';margin-top:.9rem;"><div class="rh-grid-2">' +
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
        var previousCustomer = RHUI.drawerId ? RHD.get('customers', RHUI.drawerId) : null;
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
        data.code = customerCode(data);
        var res = RHUI.drawerId ? RHD.update('customers', RHUI.drawerId, data) : RHD.create('customers', data);
        if (!res.ok) { byId('cfError').textContent = res.error; return; }
        var createdCustomer = !RHUI.drawerId;
        var customerBrowser = RHUI.customerBrowser;
        if (previousCustomer && customerBrowser) {
            if (customerBrowser.buildingId && previousCustomer.residenceBuildingId !== data.residenceBuildingId) {
                customerBrowser.buildingId = data.residenceBuildingId || '';
                customerBrowser.apartmentId = data.residenceApartmentId || '';
                customerBrowser.floor = '';
                var updatedBuilding = data.residenceBuildingId ? RHD.get('buildings', data.residenceBuildingId) : null;
                if (customerBrowser.area && updatedBuilding) customerBrowser.area = updatedBuilding.province || updatedBuilding.ward || '';
            } else if (customerBrowser.apartmentId && previousCustomer.residenceApartmentId !== data.residenceApartmentId) {
                customerBrowser.apartmentId = data.residenceApartmentId || '';
            }
        }
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

    function currentInvoicePeriod() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7); }

    function invoicePeriod(inv) {
        var period = inv.billingPeriod || inv.period || '';
        return /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : '';
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

    // ============================================================ CASHFLOW

    var CASHFLOW_CATEGORIES = {
        income: ['Thu tiền thuê', 'Thu phí dịch vụ', 'Thu tiền điện', 'Thu tiền nước', 'Thu khác'],
        expense: ['Chi vận hành', 'Chi bảo trì', 'Chi vệ sinh', 'Chi nhân sự', 'Chi khác']
    };

    function ensureCashflowStyles() {
        if (byId('rhCashflowStyles')) return;
        var style = document.createElement('style');
        style.id = 'rhCashflowStyles';
        style.textContent = '#cashflow-tab .rh-cashflow-head{align-items:center;display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;margin-bottom:1rem}#cashflow-tab .rh-cashflow-head h2{color:#10213c;font:800 1.45rem "Plus Jakarta Sans",sans-serif}#cashflow-tab .rh-cashflow-actions{display:flex;flex-wrap:wrap;gap:.55rem}#cashflow-tab .rh-cashflow-actions button{align-items:center;border:0;border-radius:9px;color:#fff;cursor:pointer;display:inline-flex;font-family:inherit;font-size:.84rem;font-weight:600;gap:.45rem;padding:.65rem .85rem}#cashflow-tab .rh-cashflow-add-income{background:#198754}#cashflow-tab .rh-cashflow-add-expense{background:#e05252}#cashflow-tab .rh-cashflow-filters{display:grid;gap:.65rem;grid-template-columns:repeat(4,minmax(0,1fr));margin:1rem 0}#cashflow-tab .rh-cashflow-filters input,#cashflow-tab .rh-cashflow-filters select{background:#fff;border:1px solid #dce3eb;border-radius:9px;font:inherit;min-width:0;padding:.65rem .75rem;width:100%}#cashflow-tab .rh-cashflow-summary{display:grid;gap:.75rem;grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:1rem}#cashflow-tab .rh-cashflow-stat{background:#fff;border:1px solid #e3eaf2;border-radius:12px;padding:1rem}#cashflow-tab .rh-cashflow-stat small{color:#718096;display:block;font-size:.78rem;font-weight:700}#cashflow-tab .rh-cashflow-stat strong{color:#10213c;display:block;font:800 1.2rem "Plus Jakarta Sans",sans-serif;margin-top:.45rem}#cashflow-tab .rh-cashflow-stat.income strong{color:#198754}#cashflow-tab .rh-cashflow-stat.expense strong{color:#dc4b4b}#cashflow-tab .rh-cashflow-table-wrap{border:1px solid #e4eaf2;border-radius:10px;overflow:auto}#cashflow-tab .rh-cashflow-table{border-collapse:collapse;min-width:860px;width:100%}#cashflow-tab .rh-cashflow-table th,#cashflow-tab .rh-cashflow-table td{border-bottom:1px solid #e7ebf0;padding:.72rem .65rem;text-align:left;vertical-align:middle}#cashflow-tab .rh-cashflow-table th{background:#f7f8fa;color:#556273;font-size:.72rem;white-space:nowrap}#cashflow-tab .rh-cashflow-table tbody tr:nth-child(odd){background:#f8f9fa}#cashflow-tab .rh-cashflow-type{border-radius:999px;display:inline-block;font-size:.7rem;font-weight:700;padding:.25rem .6rem;white-space:nowrap}#cashflow-tab .rh-cashflow-type.income{background:#e5f5ed;color:#178250}#cashflow-tab .rh-cashflow-type.expense{background:#fdebec;color:#c5474e}@media(max-width:850px){#cashflow-tab .rh-cashflow-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){#cashflow-tab .rh-cashflow-filters,#cashflow-tab .rh-cashflow-summary{grid-template-columns:1fr}}';
        style.textContent += '#cashflow-tab .rh-cashflow-summary{gap:.7rem}#cashflow-tab .rh-cashflow-stat{align-items:center;display:flex;gap:.9rem;min-height:82px;padding:.8rem 1rem}#cashflow-tab .rh-cashflow-stat-icon{align-items:center;background:#effbf4;border:1px solid #d1f0df;border-radius:14px;color:#18a878;display:inline-flex;flex:0 0 44px;font-size:1.15rem;height:44px;justify-content:center}#cashflow-tab .rh-cashflow-stat.expense .rh-cashflow-stat-icon{background:#fff7ec;border-color:#f6e3c8;color:#e59a23}#cashflow-tab .rh-cashflow-stat.balance .rh-cashflow-stat-icon{background:#edf5ff;border-color:#d5e7fb;color:#337bc7}#cashflow-tab .rh-cashflow-stat strong{font-size:1.12rem;margin-top:.22rem}#cashflow-tab .rh-cashflow-toolbar{align-items:center;display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0}#cashflow-tab .rh-cashflow-search{flex:1 1 220px;position:relative}#cashflow-tab .rh-cashflow-search input{padding-left:2rem}#cashflow-tab .rh-cashflow-search i{color:#94a3b8;left:.72rem;position:absolute;top:50%;transform:translateY(-50%)}#cashflow-tab .rh-cashflow-toolbar-btn{align-items:center;background:#fff;border:1px solid #dce3eb;border-radius:8px;color:#526275;cursor:pointer;display:inline-flex;height:39px;justify-content:center;min-width:40px;padding:0 .65rem}#cashflow-tab .rh-cashflow-toolbar-btn:hover{background:#eff7ff;border-color:#b8d8f6;color:#0d65d5}#cashflow-tab .rh-cashflow-toolbar-btn.add{background:#198754;border-color:#198754;color:#fff}#cashflow-tab .rh-cashflow-toolbar-btn.danger{color:#d54444}#cashflow-tab .rh-cashflow-toolbar-btn[disabled]{cursor:not-allowed;opacity:.45}#cashflow-tab .rh-cashflow-filter-panel{display:none;background:#fff;border:1px solid #e3eaf2;border-radius:10px;gap:.6rem;grid-template-columns:repeat(6,minmax(0,1fr));margin:.5rem 0 1rem;padding:.75rem}#cashflow-tab .rh-cashflow-filter-panel.open{display:grid}#cashflow-tab .rh-cashflow-table th:first-child,#cashflow-tab .rh-cashflow-table td:first-child{width:34px;text-align:center}#cashflow-tab .rh-cashflow-actions-cell{display:flex;gap:.3rem;white-space:nowrap}#cashflow-tab .rh-cashflow-actions-cell button{align-items:center;border:0;border-radius:6px;color:#fff;cursor:pointer;display:inline-flex;height:29px;justify-content:center;width:30px}#cashflow-tab .rh-cashflow-actions-cell .view{background:#f59e0b}#cashflow-tab .rh-cashflow-actions-cell .edit{background:#52a884}#cashflow-tab .rh-cashflow-actions-cell .print{background:#2563eb}#cashflow-tab .rh-cashflow-actions-cell .delete{background:#e05252}#cashflow-tab .rh-cashflow-code{color:#23845c;font-size:.76rem;font-weight:700;white-space:nowrap}#cashflow-tab .rh-cashflow-amount{font-weight:700;white-space:nowrap}#cashflow-tab .rh-cashflow-row-sub{color:#8793a1;font-size:.7rem;margin-top:.2rem}@media(max-width:850px){#cashflow-tab .rh-cashflow-filter-panel{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){#cashflow-tab .rh-cashflow-filter-panel{grid-template-columns:1fr}#cashflow-tab .rh-cashflow-summary{grid-template-columns:1fr}}';
        document.head.appendChild(style);
    }

    function renderCashflowTabLegacy() {
        var tab = byId('cashflow-tab');
        if (!tab) return;
        ensureCashflowStyles();
        var state = RHUI.cashflowFilters || (RHUI.cashflowFilters = { type: 'all', building: '', month: '', search: '' });
        var buildings = RHD.list('buildings');
        var records = RHD.list('cashflows').slice().sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0);
        }).filter(function (record) {
            if (state.type !== 'all' && record.type !== state.type) return false;
            if (state.building && record.buildingId !== state.building) return false;
            if (state.month && String(record.date || '').slice(0, 7) !== state.month) return false;
            if (state.search) {
                var building = RHD.get('buildings', record.buildingId) || {};
                var text = [record.code, record.category, record.description, record.reference, building.name, building.shortName].join(' ').toLocaleLowerCase();
                if (text.indexOf(state.search.toLocaleLowerCase()) === -1) return false;
            }
            return true;
        });
        var income = records.filter(function (r) { return r.type === 'income'; }).reduce(function (sum, r) { return sum + (Number(r.amount) || 0); }, 0);
        var expense = records.filter(function (r) { return r.type === 'expense'; }).reduce(function (sum, r) { return sum + (Number(r.amount) || 0); }, 0);
        var buildingOptions = '<option value="">Tất cả tòa nhà</option>' + buildings.map(function (b) {
            return '<option value="' + escapeHtml(b.id) + '"' + (state.building === b.id ? ' selected' : '') + '>' + escapeHtml(b.name || b.shortName) + '</option>';
        }).join('');
        var rows = records.map(function (record) {
            var building = RHD.get('buildings', record.buildingId);
            var sign = record.type === 'income' ? '+' : '−';
            return '<tr><td>' + fmtDate(record.date) + '</td><td><strong>' + escapeHtml(record.code || '—') + '</strong></td>' +
                '<td><span class="rh-cashflow-type ' + escapeHtml(record.type) + '">' + (record.type === 'income' ? 'Thu' : 'Chi') + '</span></td>' +
                '<td>' + escapeHtml(record.category || '—') + '</td><td>' + escapeHtml(building ? building.name : '—') + '</td>' +
                '<td>' + escapeHtml(record.description || '—') + (record.reference ? '<div style="color:#94a3b8;font-size:.72rem;">' + escapeHtml(record.reference) + '</div>' : '') + '</td>' +
                '<td>' + escapeHtml(record.paymentMethod || '—') + '</td>' +
                '<td style="color:' + (record.type === 'income' ? '#178250' : '#c5474e') + ';font-weight:700;text-align:right;white-space:nowrap;">' + sign + money(record.amount) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;"><button type="button" class="rh-row-btn" title="Sửa" onclick="RHUI.openCashflowForm(\'' + record.id + '\')"><i class="fas fa-pen"></i></button><button type="button" class="rh-row-btn danger" title="Xóa" onclick="RHUI.deleteCashflow(\'' + record.id + '\')"><i class="fas fa-trash"></i></button></td></tr>';
        }).join('');
        tab.innerHTML = '<div class="card"><div class="rh-cashflow-head"><div><h2>Thu chi</h2><p style="color:#718096;font-size:.84rem;margin-top:.25rem;">Theo dõi các khoản thu và chi của tòa nhà.</p></div><div class="rh-cashflow-actions"><button class="rh-cashflow-add-income" type="button" onclick="RHUI.openCashflowForm(null,\'income\')"><i class="fas fa-plus"></i> Ghi nhận thu</button><button class="rh-cashflow-add-expense" type="button" onclick="RHUI.openCashflowForm(null,\'expense\')"><i class="fas fa-minus"></i> Ghi nhận chi</button></div></div>' +
            '<div class="rh-cashflow-summary"><div class="rh-cashflow-stat income"><small>Tổng thu · ' + records.filter(function (r) { return r.type === 'income'; }).length + ' phiếu</small><strong>' + money(income) + '</strong></div><div class="rh-cashflow-stat expense"><small>Tổng chi · ' + records.filter(function (r) { return r.type === 'expense'; }).length + ' phiếu</small><strong>' + money(expense) + '</strong></div><div class="rh-cashflow-stat"><small>Chênh lệch thu - chi</small><strong style="color:' + (income - expense >= 0 ? '#178250' : '#c5474e') + ';">' + money(income - expense) + '</strong></div></div>' +
            '<div class="rh-cashflow-filters"><select id="cashflowTypeFilter" aria-label="Lọc thu chi"><option value="all">Thu và chi</option><option value="income"' + (state.type === 'income' ? ' selected' : '') + '>Khoản thu</option><option value="expense"' + (state.type === 'expense' ? ' selected' : '') + '>Khoản chi</option></select><select id="cashflowBuildingFilter" aria-label="Lọc tòa nhà">' + buildingOptions + '</select><input id="cashflowMonthFilter" type="month" aria-label="Lọc theo tháng" value="' + escapeHtml(state.month) + '"><input id="cashflowSearch" type="search" aria-label="Tìm kiếm phiếu thu chi" placeholder="Tìm mã phiếu, nội dung..." value="' + escapeHtml(state.search) + '"></div>' +
            (records.length ? '<div class="rh-cashflow-table-wrap"><table class="rh-cashflow-table"><thead><tr><th>Ngày</th><th>Mã phiếu</th><th>Loại</th><th>Danh mục</th><th>Tòa nhà</th><th>Nội dung</th><th>Hình thức</th><th style="text-align:right;">Số tiền</th><th>Thao tác</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div style="color:#718096;padding:2rem;text-align:center;">Chưa có phiếu thu chi phù hợp. Nhấn “Ghi nhận thu” hoặc “Ghi nhận chi” để bắt đầu.</div>') + '</div>';
        ['cashflowTypeFilter', 'cashflowBuildingFilter', 'cashflowMonthFilter'].forEach(function (id) {
            byId(id).addEventListener('change', function () {
                state.type = byId('cashflowTypeFilter').value;
                state.building = byId('cashflowBuildingFilter').value;
                state.month = byId('cashflowMonthFilter').value;
                renderCashflowTab();
            });
        });
        byId('cashflowSearch').addEventListener('input', function () {
            state.search = this.value.trim();
            renderCashflowTab();
            var next = byId('cashflowSearch');
            if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
        });
    }

    RHUI.openCashflowForm = function (id, type) {
        var record = id ? RHD.get('cashflows', id) : null;
        if (id && !record) return;
        var buildings = RHD.list('buildings');
        var selectedType = record ? record.type : (type === 'expense' ? 'expense' : 'income');
        var today = new Date();
        var todayValue = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        var categoryOptions = (CASHFLOW_CATEGORIES[selectedType] || CASHFLOW_CATEGORIES.income).map(function (category) {
            return '<option value="' + escapeHtml(category) + '"' + (record && record.category === category ? ' selected' : '') + '>' + escapeHtml(category) + '</option>';
        }).join('');
        if (record && record.category && (CASHFLOW_CATEGORIES[selectedType] || []).indexOf(record.category) === -1) {
            categoryOptions = '<option value="' + escapeHtml(record.category) + '" selected>' + escapeHtml(record.category) + '</option>' + categoryOptions;
        }
        var initialBuildingId = record ? record.buildingId : '';
        var apartmentOptions = '<option value="">Chọn phòng (không bắt buộc)</option>' + RHD.apartmentsOf(initialBuildingId).map(function (apt) {
            return '<option value="' + escapeHtml(apt.id) + '"' + (record && record.apartmentId === apt.id ? ' selected' : '') + '>' + escapeHtml(apt.name || apt.code || 'Căn hộ') + '</option>';
        }).join('');
        var html = '<form onsubmit="RHUI.saveCashflow(event)"><div class="rh-grid-2">' +
            '<div class="rh-field"><label>Loại giao dịch *</label><select id="cashflowFormType" required onchange="RHUI.updateCashflowCategories()"><option value="income"' + (selectedType === 'income' ? ' selected' : '') + '>Thu</option><option value="expense"' + (selectedType === 'expense' ? ' selected' : '') + '>Chi</option></select></div>' +
            '<div class="rh-field"><label>Ngày *</label><input id="cashflowFormDate" type="date" required value="' + escapeHtml(record ? record.date : todayValue) + '"></div>' +
            '<div class="rh-field"><label>Tòa nhà</label><select id="cashflowFormBuilding">' + selectOptions(buildings, 'id', 'name', initialBuildingId, 'Chọn tòa nhà (không bắt buộc)') + '</select></div>' +
            '<div class="rh-field"><label>Căn hộ / Phòng</label><select id="cashflowFormApartment">' + apartmentOptions + '</select></div>' +
            '<div class="rh-field"><label>Danh mục *</label><select id="cashflowFormCategory" required>' + categoryOptions + '</select></div>' +
            '<div class="rh-field"><label>Số tiền (đ) *</label><input id="cashflowFormAmount" type="number" min="1" step="1" required value="' + (record ? Number(record.amount) || '' : '') + '"></div>' +
            '<div class="rh-field"><label>Hình thức thanh toán</label><select id="cashflowFormMethod">' + selectOptions([{ id: 'cash', label: 'Tiền mặt' }, { id: 'bank', label: 'Chuyển khoản' }, { id: 'other', label: 'Khác' }], 'id', 'label', record ? record.paymentMethodId : 'bank') + '</select></div>' +
            '<div class="rh-field"><label>Người nhận / trả</label><input id="cashflowFormPerson" value="' + escapeHtml(record ? record.personName : '') + '" placeholder="Tên người giao dịch"></div>' +
            '<div class="rh-field"><label>Tài khoản / sổ quỹ</label><input id="cashflowFormAccount" list="cashflowAccounts" value="' + escapeHtml(record ? record.accountName || record.paymentMethod : '') + '" placeholder="Tiền mặt, ngân hàng..." ><datalist id="cashflowAccounts"><option value="Tiền mặt"><option value="Vietcombank"><option value="Techcombank"><option value="MBBank"></datalist></div>' +
            '<div class="rh-field"><label>Mã tham chiếu</label><input id="cashflowFormReference" value="' + escapeHtml(record ? record.reference : '') + '" placeholder="Mã giao dịch / chứng từ"></div>' +
            '<div class="rh-field" style="grid-column:1/-1;"><label>Nội dung</label><textarea id="cashflowFormDescription" rows="3" placeholder="Ghi chú cho khoản thu hoặc chi">' + escapeHtml(record ? record.description : '') + '</textarea></div>' +
            '</div><div id="cashflowFormError" style="color:#ef4444;font-size:.85rem;margin-top:.75rem;"></div><div style="display:flex;gap:.6rem;margin-top:1.25rem;"><button type="submit" class="btn-primary">Lưu phiếu</button><button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Hủy</button></div></form>';
        RHUI.drawerId = record ? record.id : null;
        openDrawer(record ? 'Sửa phiếu thu chi' : (selectedType === 'income' ? 'Ghi nhận khoản thu' : 'Ghi nhận khoản chi'), html);
        byId('cashflowFormBuilding').addEventListener('change', function () {
            var options = '<option value="">Chọn phòng (không bắt buộc)</option>' + RHD.apartmentsOf(this.value).map(function (apt) {
                return '<option value="' + escapeHtml(apt.id) + '">' + escapeHtml(apt.name || apt.code || 'Căn hộ') + '</option>';
            }).join('');
            byId('cashflowFormApartment').innerHTML = options;
        });
    };

    RHUI.updateCashflowCategories = function () {
        var type = byId('cashflowFormType').value;
        byId('cashflowFormCategory').innerHTML = (CASHFLOW_CATEGORIES[type] || CASHFLOW_CATEGORIES.income).map(function (category) {
            return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + '</option>';
        }).join('');
    };

    RHUI.saveCashflow = function (ev) {
        ev.preventDefault();
        var amount = Number(byId('cashflowFormAmount').value);
        if (!isFinite(amount) || amount <= 0) { byId('cashflowFormError').textContent = 'Số tiền phải lớn hơn 0.'; return; }
        var methodId = byId('cashflowFormMethod').value;
        var methodLabels = { cash: 'Tiền mặt', bank: 'Chuyển khoản', other: 'Khác' };
        var existing = RHUI.drawerId ? RHD.get('cashflows', RHUI.drawerId) : null;
        var data = {
            type: byId('cashflowFormType').value,
            date: byId('cashflowFormDate').value,
            buildingId: byId('cashflowFormBuilding').value,
            apartmentId: byId('cashflowFormApartment').value,
            category: byId('cashflowFormCategory').value,
            amount: amount,
            paymentMethodId: methodId,
            paymentMethod: methodLabels[methodId] || 'Khác',
            accountName: byId('cashflowFormAccount').value.trim() || methodLabels[methodId] || 'Khác',
            personName: byId('cashflowFormPerson').value.trim(),
            reference: byId('cashflowFormReference').value.trim(),
            description: byId('cashflowFormDescription').value.trim()
        };
        var result;
        if (existing) result = RHD.update('cashflows', existing.id, data);
        else {
            data.code = 'TC-' + String(Date.now()).slice(-8);
            result = RHD.create('cashflows', data);
        }
        if (!result.ok) { byId('cashflowFormError').textContent = result.error || 'Không thể lưu phiếu thu chi.'; return; }
        RHUI.closeDrawer();
        renderCashflowTab();
    };

    RHUI.deleteCashflow = function (id) {
        var record = RHD.get('cashflows', id);
        if (!record || !confirm('Xóa phiếu ' + (record.code || '') + '? Hành động không thể hoàn tác.')) return;
        var result = RHD.remove('cashflows', id);
        if (!result.ok) { alert(result.error); return; }
        renderCashflowTab();
    };

    // ============================================================== INVOICES

    function ensureInvoiceStyles() {
        if (byId('rhInvoiceStyles')) return;
        var style = document.createElement('style');
        style.id = 'rhInvoiceStyles';
        style.textContent = '#invoices-tab .rh-invoices-module{position:relative;color:#172b45}#invoices-tab .rh-invoice-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}#invoices-tab .rh-invoice-head h2{font-size:1.45rem;font-weight:800;color:#10213c}#invoices-tab .rh-invoice-tools{display:flex;gap:.55rem}#invoices-tab .rh-invoice-icon{position:relative;width:40px;height:40px;display:grid;place-items:center;border:1px solid #e0e8f1;border-radius:10px;background:#fff;color:#53677f;cursor:pointer}#invoices-tab .rh-invoice-icon:hover{border-color:#9ccaff;color:#0d65d5;background:#f4f9ff}#invoices-tab .rh-invoice-dot{position:absolute;top:7px;right:7px;width:7px;height:7px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 2px #fff}#invoices-tab .rh-invoice-search{display:none;margin:0 0 .85rem}#invoices-tab .rh-invoice-search.open{display:block}#invoices-tab .rh-invoice-search input{width:min(100%,420px);padding:.7rem .85rem;border:1px solid #dbe4ef;border-radius:8px;font:inherit}#invoices-tab .rh-invoice-period{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:1rem;padding:.8rem 1rem;border:1px solid #e3eaf2;border-radius:10px;background:#fff}#invoices-tab .rh-invoice-period>span{font-size:.82rem;font-weight:700;color:#718096}#invoices-tab .rh-invoice-period-chip{display:inline-flex;align-items:center;gap:.45rem;padding:.45rem .7rem;border:1px solid #ccebdc;border-radius:7px;background:#f1fbf5;color:#18845c;font-size:.82rem;font-weight:700}#invoices-tab .rh-invoice-period-chip input{width:110px;border:0;background:transparent;color:#176d50;font:inherit;outline:0}#invoices-tab .rh-invoice-clear{margin-left:auto;border:0;background:none;color:#d54444;font:600 .82rem inherit;cursor:pointer}#invoices-tab .rh-invoice-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-bottom:1rem}#invoices-tab .rh-invoice-stat{min-width:0;padding:1rem;border:1px solid #e3eaf2;border-radius:10px;background:#fff}#invoices-tab .rh-invoice-stat small{display:block;color:#718096;font-size:.76rem;font-weight:700}#invoices-tab .rh-invoice-stat strong{display:block;margin-top:.55rem;font-size:1.25rem;line-height:1.3;color:#176fd1;overflow-wrap:anywhere}#invoices-tab .rh-invoice-stat.collected strong{color:#16875d}#invoices-tab .rh-invoice-stat.debt strong{color:#d54444}#invoices-tab .rh-invoice-progress{height:6px;margin-top:.7rem;overflow:hidden;border-radius:99px;background:#edf1f5}#invoices-tab .rh-invoice-progress span{display:block;height:100%;border-radius:inherit;background:#18a878;transition:width .2s}#invoices-tab .rh-invoice-rate{display:flex;justify-content:space-between;gap:.5rem;margin-top:.5rem;color:#718096;font-size:.72rem}#invoices-tab .rh-invoice-tabs{display:flex;gap:.4rem;overflow:auto;margin-bottom:.85rem;padding-bottom:.1rem}#invoices-tab .rh-invoice-tab{display:inline-flex;align-items:center;gap:.5rem;white-space:nowrap;padding:.58rem .8rem;border:1px solid #e0e8f1;border-radius:8px;background:#fff;color:#5c6b7d;font:600 .82rem inherit;cursor:pointer}#invoices-tab .rh-invoice-tab b{font-size:.72rem;color:#8090a2}#invoices-tab .rh-invoice-tab.active{border-color:#17212e;background:#17212e;color:#fff}#invoices-tab .rh-invoice-tab.active b{color:#d6dee8}#invoices-tab .rh-invoice-filter-panel{display:none;gap:.6rem;margin-bottom:.85rem;padding:.75rem;border:1px solid #e3eaf2;border-radius:8px;background:#fff}#invoices-tab .rh-invoice-filter-panel.open{display:flex}#invoices-tab .rh-invoice-filter-panel select{max-width:100%;padding:.55rem .7rem;border:1px solid #dbe4ef;border-radius:7px;background:#fff;font:inherit;color:#44566c}#invoices-tab .rh-invoice-table-wrap{overflow-x:auto;border:1px solid #e3eaf2;border-radius:9px;background:#fff}#invoices-tab .rh-invoice-table{width:100%;border-collapse:collapse;min-width:760px;text-align:left}#invoices-tab .rh-invoice-table th{padding:.7rem .8rem;background:#f3f7fb;color:#718096;font-size:.69rem;letter-spacing:.04em;text-transform:uppercase}#invoices-tab .rh-invoice-table td{padding:.7rem .8rem;border-top:1px solid #edf1f5;font-size:.8rem}#invoices-tab .rh-invoice-actions{display:flex;justify-content:flex-end;gap:.3rem;white-space:nowrap}#invoices-tab .rh-invoice-actions button{width:30px;height:30px;border:1px solid #e0e8f1;border-radius:6px;background:#fff;color:#53708e;cursor:pointer}#invoices-tab .rh-invoice-actions button:hover{color:#0d65d5;background:#f4f9ff}#invoices-tab .rh-invoice-actions button.danger{color:#dc4b4b}#invoices-tab .rh-invoice-empty{padding:2.5rem 1rem;text-align:center;color:#718096}#invoices-tab .rh-invoice-empty i{display:block;margin-bottom:.65rem;color:#9aabba;font-size:1.5rem}#invoices-tab .rh-invoice-fab{position:fixed;right:30px;bottom:28px;z-index:30;width:56px;height:56px;border:0;border-radius:50%;background:#18a878;color:#fff;font-size:1.7rem;line-height:1;box-shadow:0 8px 22px rgba(24,168,120,.28);cursor:pointer}#invoices-tab .rh-invoice-fab:hover{background:#11845d;transform:translateY(-2px)}#invoices-tab .rh-invoice-fab:disabled{opacity:.55;cursor:not-allowed}@media(max-width:850px){#invoices-tab .rh-invoice-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){#invoices-tab .rh-invoice-head{align-items:flex-start}#invoices-tab .rh-invoice-head h2{font-size:1.25rem}#invoices-tab .rh-invoice-period{align-items:flex-start}#invoices-tab .rh-invoice-clear{margin-left:0}#invoices-tab .rh-invoice-summary{gap:.5rem}#invoices-tab .rh-invoice-stat{padding:.75rem}#invoices-tab .rh-invoice-stat strong{font-size:1rem}#invoices-tab .rh-invoice-fab{right:18px;bottom:18px;width:52px;height:52px}';
        document.head.appendChild(style);
        var periodStyle = document.createElement('style');
        periodStyle.textContent = '#invoices-tab .rh-invoice-period-picker{position:relative;min-width:0;max-width:100%}#invoices-tab .rh-invoice-period-picker summary{display:flex;align-items:center;gap:.5rem;padding:.65rem .85rem;border:1px solid #ccebdc;border-radius:8px;background:#f1fbf5;color:#176d50;font-size:.82rem;font-weight:700;cursor:pointer;list-style:none;touch-action:manipulation}#invoices-tab .rh-invoice-period-picker summary::-webkit-details-marker{display:none}#invoices-tab .rh-invoice-period-picker summary>*{pointer-events:none}#invoices-tab .rh-invoice-period-picker summary:focus-visible{outline:2px solid #1683ff;outline-offset:2px}#invoices-tab .rh-invoice-period-picker[open]{z-index:35}#invoices-tab .rh-invoice-period-popover{position:absolute;top:calc(100% + 6px);left:0;width:280px;max-width:calc(100vw - 64px);padding:1rem;border:1px solid #dbe4ef;border-radius:10px;background:#fff;box-shadow:0 8px 24px rgba(23,43,69,.12)}#invoices-tab .rh-invoice-period-fields{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}#invoices-tab .rh-invoice-period-fields label{min-width:0;color:#718096;font-size:.8rem}#invoices-tab .rh-invoice-period-fields select{display:block;width:100%;margin-top:.4rem;padding:.6rem;border:1px solid #dbe4ef;border-radius:7px;background:#fff;font:inherit;color:#172b45}#invoices-tab .rh-invoice-period-step,#invoices-tab .rh-invoice-period-current,#invoices-tab .rh-invoice-period-all{border:1px solid #dbe4ef;border-radius:8px;background:#fff;padding:.65rem;color:#53677f;font:inherit;font-size:.82rem;cursor:pointer;touch-action:manipulation}#invoices-tab .rh-invoice-period-all{width:100%;margin-top:.85rem}';
        document.head.appendChild(periodStyle);
    }

    function renderInvoicesTab(filter) {
        var tab = byId('invoices-tab');
        if (!tab) return;
        ensureInvoiceStyles();
        var state = RHUI.invoiceFilters || (RHUI.invoiceFilters = {
            status: 'all', period: currentInvoicePeriod(), search: '', building: '', searchOpen: false, filtersOpen: false, overdueOnly: false
        });
        if (filter === 'unpaid' || filter === 'overdue') {
            state.status = 'debt';
            state.overdueOnly = filter === 'overdue';
        }
        var contracts = scoped('contracts');
        var todayStr = new Date().toISOString().slice(0, 10);
        var allInvoices = scoped('invoices').slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        var invoiceMonth = invoicePeriod;
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
        var monthLabel = state.period ? RHB.periodLabel(state.period) : 'Tất cả kỳ';
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
        var pickerPeriod = state.period || currentInvoicePeriod();
        var pickerYear = Number(pickerPeriod.slice(0, 4));
        var yearValues = [pickerYear, Number(currentInvoicePeriod().slice(0, 4))];
        allInvoices.forEach(function (inv) { if (invoicePeriod(inv)) yearValues.push(Number(invoicePeriod(inv).slice(0, 4))); });
        var yearOptions = '';
        for (var year = Math.min.apply(null, yearValues) - 5; year <= Math.max.apply(null, yearValues) + 5; year++) yearOptions += '<option value="' + year + '"' + (year === pickerYear ? ' selected' : '') + '>' + year + '</option>';
        var monthOptions = '';
        for (var month = 1; month <= 12; month++) { var monthValue = String(month).padStart(2, '0'); monthOptions += '<option value="' + monthValue + '"' + (monthValue === pickerPeriod.slice(5, 7) ? ' selected' : '') + '>Tháng ' + month + '</option>'; }
        var emptyMessage = allInvoices.length ? 'Không có hóa đơn phù hợp bộ lọc.' : (contracts.length ? 'Chưa có hóa đơn nào.' : 'Cần có Hợp đồng trước khi lập hóa đơn.');

        tab.innerHTML = renderDemoBanner('invoices') + '<section class="rh-invoices-module">' +
            '<div class="rh-invoice-head"><div class="rh-invoice-tools" style="margin-left:auto;">' +
            '<button type="button" class="rh-invoice-icon" data-invoice-search-toggle title="Tìm kiếm" aria-label="Tìm kiếm"><i class="fas fa-search"></i></button>' +
            (can('invoices.create') ? '<button type="button" class="rh-invoice-icon" onclick="RHUI.runAutoBilling()" title="Lập hóa đơn tự động cho các kỳ đến hạn' + (RHB.lastRun().lastRunAt ? ' — lần chạy gần nhất ' + new Date(RHB.lastRun().lastRunAt).toLocaleString('vi-VN') : '') + '" aria-label="Lập hóa đơn tự động"><i class="fas fa-wand-magic-sparkles"></i></button>' : '') +
            (can('invoices.send') ? '<button type="button" class="rh-invoice-icon" onclick="RHUI.sendSelectedInvoices()" title="Gửi hàng loạt" aria-label="Gửi hàng loạt"><i class="fas fa-file-export"></i></button>' +
            '<button type="button" class="rh-invoice-icon" onclick="RHUI.sendSelectedInvoices()" title="Gửi thông báo" aria-label="Gửi thông báo"><i class="fas fa-paper-plane"></i></button>' : '') +
            '<button type="button" class="rh-invoice-icon" data-invoice-filter-toggle title="Bộ lọc nâng cao" aria-label="Bộ lọc nâng cao"><i class="fas fa-sliders"></i><span class="rh-invoice-dot"></span></button>' +
            '</div></div>' +
            '<div class="rh-invoice-search' + (state.searchOpen ? ' open' : '') + '"><input type="search" data-invoice-search placeholder="Tìm mã hóa đơn, căn hộ, khách hàng..." value="' + escapeHtml(state.search) + '"></div>' +
            '<div class="rh-invoice-period"><button type="button" class="rh-invoice-period-step" data-invoice-period-step="-1" aria-label="Tháng trước" title="Tháng trước"><i class="fas fa-chevron-left"></i></button>' +
            '<details class="rh-invoice-period-picker"' + (state.periodPickerOpen ? ' open' : '') + '><summary aria-label="Chọn kỳ hóa đơn"><i class="fas fa-calendar-alt" aria-hidden="true"></i><span>Kỳ hóa đơn: ' + escapeHtml(monthLabel) + '</span><i class="fas fa-chevron-down" aria-hidden="true"></i></summary><div class="rh-invoice-period-popover"><div class="rh-invoice-period-fields"><label>Tháng<select data-invoice-period-month aria-label="Tháng hóa đơn">' + monthOptions + '</select></label><label>Năm<select data-invoice-period-year aria-label="Năm hóa đơn">' + yearOptions + '</select></label></div><button type="button" class="rh-invoice-period-all" data-invoice-period-all>Tất cả kỳ</button></div></details>' +
            '<button type="button" class="rh-invoice-period-step" data-invoice-period-step="1" aria-label="Tháng sau" title="Tháng sau"><i class="fas fa-chevron-right"></i></button><button type="button" class="rh-invoice-period-current" data-invoice-period-current>Tháng hiện tại</button><button type="button" class="rh-invoice-clear" data-invoice-clear>Xóa lọc</button></div>' +
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
            '<div style="display:flex;justify-content:flex-end;margin-top:1rem;"><button type="button" class="rh-invoice-fab" style="position:static;" data-invoice-add title="Thêm hóa đơn" aria-label="Thêm hóa đơn"' + (canAdd ? '' : ' disabled') + (can('invoices.create') ? '' : ' hidden') + '>+</button></div></section>';

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
        var picker = tab.querySelector('.rh-invoice-period-picker');
        function positionPeriodPicker() {
            if (!picker.isConnected || !picker.open) return;
            var popover = picker.querySelector('.rh-invoice-period-popover');
            popover.style.left = '0px';
            var bounds = popover.getBoundingClientRect();
            var shift = Math.min(0, document.documentElement.clientWidth - 16 - bounds.right);
            shift = Math.max(shift, 16 - bounds.left);
            popover.style.left = shift + 'px';
        }
        picker.addEventListener('toggle', function () {
            if (picker.isConnected) { state.periodPickerOpen = picker.open; positionPeriodPicker(); }
        });
        positionPeriodPicker();
        function changePeriod(value, keepOpen) {
            state.period = value; state.overdueOnly = false; state.periodPickerOpen = !!keepOpen;
            renderInvoicesTab();
        }
        ['month', 'year'].forEach(function (part) {
            tab.querySelector('[data-invoice-period-' + part + ']').addEventListener('change', function () {
                changePeriod(tab.querySelector('[data-invoice-period-year]').value + '-' + tab.querySelector('[data-invoice-period-month]').value, true);
                tab.querySelector('[data-invoice-period-' + part + ']').focus();
            });
        });
        tab.querySelectorAll('[data-invoice-period-step]').forEach(function (button) { button.addEventListener('click', function () { changePeriod(RHB.addMonths(state.period || currentInvoicePeriod(), Number(this.getAttribute('data-invoice-period-step')))); }); });
        tab.querySelector('[data-invoice-period-current]').addEventListener('click', function () { changePeriod(currentInvoicePeriod()); });
        tab.querySelector('[data-invoice-period-all]').addEventListener('click', function () { changePeriod(''); });
        picker.addEventListener('keydown', function (event) { if (event.key === 'Escape') { picker.open = false; state.periodPickerOpen = false; picker.querySelector('summary').focus(); } });
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

    var invoiceDraft = { id: null, lines: [], source: 'manual', issues: [] };

    function invoiceLineRowHtml(l, idx) {
        var num = function (field, value, step) {
            return '<input type="number" step="' + (step || 'any') + '" value="' + escapeHtml(value) + '" data-line="' + idx + '" data-field="' + field + '">';
        };
        return '<tr class="' + (l.missing ? 'if-line-missing' : '') + '">' +
            '<td><input type="text" value="' + escapeHtml(l.label) + '" data-line="' + idx + '" data-field="label" aria-label="Khoản mục">' +
            (l.missing ? '<div class="if-line-warn"><i class="fas fa-triangle-exclamation"></i> Thiếu dữ liệu — bổ sung, duyệt chỉ số đúng kỳ rồi bấm "Tính lại"</div>' : '') + '</td>' +
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
        norm.issues = Array.from(new Set(norm.issues.concat(invoiceDraft.issues || [])));
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
        invoiceDraft.issues = calc.issues || [];
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
        invoiceDraft = { id: id || null, lines: inv ? (inv.items || []).map(function (it) { return Object.assign({ taxRate: it.amount ? Math.round((Number(it.tax) || 0) * 10000 / it.amount) / 100 : 0 }, it); }) : [], source: inv ? inv.source || 'manual' : 'manual', issues: inv ? inv.issues || [] : [] };
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
            '<div class="rh-field" id="ifPeriodField"><label>Kỳ hóa đơn</label><input id="ifPeriod" type="month" value="' + escapeHtml(inv ? invoicePeriod(inv) : ((RHUI.invoiceFilters || {}).period || currentInvoicePeriod())) + '"></div>' +
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
            var calc = RHB.refreshUtilityLines(invoiceDraft.lines, formContract(), byId('ifPeriod').value);
            if (calc.requiresConfirmation && confirm(calc.error)) calc = RHB.refreshUtilityLines(invoiceDraft.lines, formContract(), byId('ifPeriod').value, true);
            if (!calc.ok) { if (!calc.requiresConfirmation) byId('ifError').textContent = calc.error; return; }
            invoiceDraft.lines = calc.items;
            invoiceDraft.issues = calc.issues;
            renderInvoiceLines();
        });
        byId('ifLines').addEventListener('input', function (ev) {
            var el = ev.target;
            var idx = Number(el.getAttribute('data-line'));
            var field = el.getAttribute('data-field');
            if (!field || !invoiceDraft.lines[idx]) return;
            invoiceDraft.lines[idx][field] = field === 'label' ? el.value : el.value === '' ? 0 : Number(el.value);
            invoiceDraft.lines[idx].source = 'manual';
            invoiceDraft.lines[idx].manualOverride = true;
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
        if (type === 'monthly') {
            var monthly = RHB.computeMonthly(contract, period);
            norm.issues = Array.from(new Set(norm.issues.concat(monthly ? monthly.issues : ['Hợp đồng không có hiệu lực trong kỳ hóa đơn.'])));
        }
        var data = {
            type: type, contractId: contract.id, buildingId: contract.buildingId, apartmentId: contract.apartmentId, customerId: contract.customerId,
            invoiceTemplateId: byId('ifTemplate').value, period: period, billingPeriod: period, issueDate: issueDate, dueDate: dueDate,
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
        recalc: { perm: 'invoices.update', run: function (id) {
            var result = RHB.recalculate(id, actorName());
            if (result.requiresConfirmation && confirm(result.error)) return RHB.recalculate(id, actorName(), true);
            return result.requiresConfirmation ? null : result;
        } },
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
        // Display current audit findings without changing persisted invoices.
        inv = Object.assign({}, inv, { issues: Array.from(new Set((inv.issues || []).concat(RHB.dataIssues(inv)))) });
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
        var scopedIds = scoped('invoices').map(function (inv) { return inv.id; });
        var affected = RHB.auditInvoices().filter(function (row) { return row.issued && scopedIds.indexOf(row.id) !== -1; });
        if (affected.length) alert('Hóa đơn đã phát hành/thanh toán cần kiểm tra riêng (không tự sửa):\n' + affected.map(function (row) { return row.code + ' · ' + RHB.periodLabel(row.period) + ': ' + row.issues.join('; '); }).join('\n'));
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
            var found = RHB.approvedReading(inv.apartmentId, meterType, inv.billingPeriod || inv.period);
            return found.state === 'approved' ? found.reading : null;
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
    var activeSupportView = 'requests';
    var selectedSupportChatId = null;
    var selectedSupportResidentKey = null;

    function supportConversationHtml(messages) {
        if (!messages.length) return '<div style="color:#94a3b8;font-size:.85rem;">Chưa có trao đổi.</div>';
        return messages.map(function (message) {
            return '<div class="support-message' + (message.from === 'Cư dân' ? ' is-resident' : ' is-manager') + '">' +
                '<div class="support-message-meta"><strong>' + escapeHtml(message.from || 'Người dùng') + '</strong><time>' + escapeHtml(message.time || '') + '</time></div>' +
                '<div class="support-message-text">' + escapeHtml(message.text || '') + '</div></div>';
        }).join('');
    }

    function supportRequestInScope(id) {
        return scoped('supportRequests').filter(function (request) { return request.id === id; })[0] || null;
    }

    function supportGroupForRequest(request) {
        var category = String(request && request.category || '').toLocaleLowerCase();
        if (category.indexOf('vệ sinh') !== -1) return 'cleaning';
        if (category.indexOf('an ninh') !== -1) return 'security';
        if (category.indexOf('sửa chữa') !== -1 || category.indexOf('cơ sở vật chất') !== -1) return 'technical';
        return '';
    }

    function supportResidentKey(request) {
        if (request.residentEmail) return 'email:' + String(request.residentEmail).trim().toLocaleLowerCase();
        if (request.customerId) return 'customer:' + request.customerId;
        return 'apartment:' + (request.apartmentId || request.buildingId || request.location || '') + ':' + String(request.residentName || 'Cư dân').trim().toLocaleLowerCase();
    }

    function supportConversationListItem(group, selected) {
        var request = group.requests[0];
        var apt = RHD.get('apartments', request.apartmentId);
        var lastMessageRequest = group.requests.filter(function (item) { return Array.isArray(item.messages) && item.messages.length; }).sort(function (a, b) {
            return Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
        })[0];
        var lastMessage = lastMessageRequest && lastMessageRequest.messages[lastMessageRequest.messages.length - 1];
        return '<button type="button" class="support-inbox-item' + (selected ? ' active' : '') + '" data-support-chat-resident="' + escapeHtml(group.key) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
            '<span class="support-inbox-avatar"><i class="fas fa-user"></i></span><span class="support-inbox-copy">' +
            '<span class="support-inbox-name">' + escapeHtml(request.residentName || 'Cư dân') + '<small>' + group.requests.length + ' yêu cầu</small></span>' +
            '<span class="support-inbox-preview">' + escapeHtml(lastMessage ? lastMessage.text : request.title || 'Chưa có tin nhắn') + '</span>' +
            '<span class="support-inbox-meta">' + escapeHtml(apt ? 'Căn hộ ' + apt.name : request.location || 'Chưa gán căn hộ') + (lastMessageRequest ? ' · ' + escapeHtml(lastMessageRequest.code || '') : '') + '</span>' +
            '</span></button>';
    }

    function supportChatPane(request, residentRequests) {
        if (!request) return '<div class="support-chat-empty"><span><i class="fas fa-comments"></i></span><h3>Chọn một cuộc trò chuyện</h3><p>Chọn cư dân ở danh sách bên trái để xem và trả lời tin nhắn.</p></div>';
        var status = statusMeta(RHD.SUPPORT_STATUSES, request.status);
        var apt = RHD.get('apartments', request.apartmentId);
        return '<div class="support-chat-thread">' +
            '<div class="support-chat-head"><div class="support-chat-avatar"><i class="fas fa-user"></i></div><div class="support-chat-person"><strong>' + escapeHtml(request.residentName || 'Cư dân') + '</strong><span>' + escapeHtml(apt ? 'Căn hộ ' + apt.name : request.location || 'Chưa gán căn hộ') + '</span></div></div>' +
            '<div class="support-ticket-list" aria-label="Yêu cầu của cư dân">' + residentRequests.map(function (item) {
                var itemStatus = statusMeta(RHD.SUPPORT_STATUSES, item.status);
                var selected = item.id === request.id;
                return '<button type="button" class="support-ticket-item' + (selected ? ' active' : '') + '" data-support-chat-id="' + escapeHtml(item.id) + '" aria-pressed="' + (selected ? 'true' : 'false') + '"><span class="support-ticket-code">' + escapeHtml(item.code || '—') + '</span><span class="support-ticket-title">' + escapeHtml(item.title || 'Yêu cầu hỗ trợ') + '</span><span class="support-ticket-status">' + badge(itemStatus.label, itemStatus.color, itemStatus.bg) + '</span></button>';
            }).join('') + '</div>' +
            '<div class="support-chat-context"><strong>' + escapeHtml(request.code || 'Mã yêu cầu') + ' · ' + escapeHtml(request.title || 'Yêu cầu hỗ trợ') + '</strong>' + badge(status.label, status.color, status.bg) +
            (can('support.update') ? '<button type="button" class="rh-link-btn" data-open-support-request="' + escapeHtml(request.id) + '">Chi tiết yêu cầu <i class="fas fa-arrow-up-right-from-square"></i></button>' : '') + '</div>' +
            '<div class="support-chat-messages" id="supportInboxMessages">' + supportConversationHtml(Array.isArray(request.messages) ? request.messages : []) + '</div>' +
            (can('support.update') ? '<div class="support-chat-compose"><textarea id="supportInboxReply" data-request-id="' + escapeHtml(request.id) + '" rows="2" placeholder="Nhập tin nhắn cho cư dân..."></textarea><button type="button" class="btn-primary" data-support-send="' + escapeHtml(request.id) + '" aria-label="Gửi tin nhắn"><i class="fas fa-paper-plane"></i><span>Gửi</span></button></div>' : '') + '</div>';
    }

    function renderSupportTab() {
        var tab = byId('support-tab');
        if (!tab) return;
        if (!can('support.view')) { tab.innerHTML = ''; return; }
        var previousReply = byId('supportInboxReply');
        var replyDraft = previousReply && previousReply.dataset.requestId === selectedSupportChatId ? previousReply.value : '';
        var replyFocused = previousReply && document.activeElement === previousReply;
        var replyCaret = previousReply ? previousReply.selectionStart : 0;
        var focusedFilter = document.activeElement;
        var filterFocusId = focusedFilter && ['rhSupportSearch', 'rhSupportStatusFilter', 'rhSupportTypeFilter', 'rhSupportPriorityFilter'].indexOf(focusedFilter.id) !== -1 ? focusedFilter.id : null;
        var filterCaret = filterFocusId === 'rhSupportSearch' ? focusedFilter.selectionStart : null;
        var requests = scoped('supportRequests').slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
        var residentGroupsByKey = Object.create(null);
        var residentGroups = [];
        requests.forEach(function (request) {
            var key = supportResidentKey(request);
            if (!residentGroupsByKey[key]) {
                residentGroupsByKey[key] = { key: key, requests: [] };
                residentGroups.push(residentGroupsByKey[key]);
            }
            residentGroupsByKey[key].requests.push(request);
        });
        residentGroups.forEach(function (group) {
            group.requests.sort(function (a, b) {
                return Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
            });
        });
        residentGroups.sort(function (a, b) {
            return Number(b.requests[0].updatedAt || b.requests[0].createdAt || 0) - Number(a.requests[0].updatedAt || a.requests[0].createdAt || 0);
        });
        if (!requests.some(function (request) { return request.id === selectedSupportChatId; })) selectedSupportChatId = requests.length ? requests[0].id : null;
        var selectedChat = requests.filter(function (request) { return request.id === selectedSupportChatId; })[0] || null;
        selectedSupportResidentKey = selectedChat ? supportResidentKey(selectedChat) : null;
        var selectedResident = residentGroupsByKey[selectedSupportResidentKey] || null;
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
            var staffProgress = {
                waiting: 'Chờ tiếp nhận',
                in_progress: 'Đang xử lý',
                pending_approval: 'Hoàn thành (Chờ Quản lý duyệt)',
                approved: 'Đã được Quản lý duyệt'
            }[r.staffTaskStatus] || (r.assigneeId || r.assignee
                ? (r.status === 'in_progress' ? 'Đang xử lý' : r.status === 'resolved' ? 'Hoàn thành' : 'Chờ tiếp nhận')
                : '');
            return '<tr>' +
                '<td class="support-request-cell"><strong class="support-request-code">' + escapeHtml(r.code || '—') + '</strong><span class="support-request-name">' + escapeHtml(r.title || 'Yêu cầu hỗ trợ') + '</span><small>' + escapeHtml(r.category || 'Khác') + '</small></td>' +
                '<td class="support-resident-cell"><strong>' + escapeHtml(r.residentName || '—') + '</strong><small>' + escapeHtml(building ? building.shortName : '—') + ' · Căn hộ ' + escapeHtml(apt ? apt.name : '—') + '</small></td>' +
                '<td>' + badge(pr.label || r.priority, '#61708a', '#f1f5f9') + '</td>' +
                '<td>' + badge(st.label, st.color, st.bg) + (staffProgress ? '<small style="display:block;margin-top:.35rem;color:#7c3aed;">Nhiệm vụ: ' + escapeHtml(staffProgress) + '</small>' : '') + '</td>' +
                '<td class="support-assignee-cell"><strong>' + escapeHtml(r.assignee || 'Chưa phân công') + '</strong><small>' + escapeHtml(r.staffGroup ? ((RHD.SUPPORT_STAFF_GROUPS || []).filter(function (group) { return group.id === r.staffGroup; })[0] || {}).label || 'Chưa phân nhóm' : 'Chưa phân nhóm') + (r.dueAt ? ' · Hạn ' + escapeHtml(r.dueAt) : '') + '</small><small>' + escapeHtml(r.handlingNote || r.resolutionNote || 'Chưa có ghi chú') + '</small></td>' +
                '<td class="support-date-cell">' + new Date(r.createdAt).toLocaleString('vi-VN') + '</td>' +
                '<td class="support-actions-cell">' +
                rowButton('support.update', "RHUI.openSupportForm('" + r.id + "')", 'fa-pen', 'Xử lý') +
                '</td></tr>';
        }).join('');

        tab.innerHTML = '<section class="support-workspace"><nav class="support-view-tabs" aria-label="Khu vực yêu cầu hỗ trợ">' +
            '<button type="button" class="' + (activeSupportView === 'requests' ? 'active' : '') + '" data-support-view="requests"><i class="fas fa-clipboard-list"></i> Danh sách yêu cầu <span>' + requests.length + '</span></button>' +
            '<button type="button" class="' + (activeSupportView === 'chat' ? 'active' : '') + '" data-support-view="chat"><i class="fas fa-comments"></i> Tin nhắn <span>' + residentGroups.filter(function (group) { return group.requests.some(function (request) { return Array.isArray(request.messages) && request.messages.length; }); }).length + '</span></button></nav>' +
            '<section class="support-view-panel' + (activeSupportView === 'requests' ? ' active' : '') + '" data-support-panel="requests"><div class="card support-request-card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div><p style="color:#94a3b8;font-size:.875rem;margin:0;">Yêu cầu do cư dân gửi từ ứng dụng — cập nhật trạng thái tại đây sẽ phản ánh ngay bên cư dân.</p></div>' +
            '</div>' +
            '<div style="display:grid;gap:.65rem;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:1rem;">' +
            '<input id="rhSupportSearch" type="search" value="' + escapeHtml(supportListFilters.search) + '" placeholder="Tìm mã, cư dân, căn hộ, nội dung..." aria-label="Tìm yêu cầu hỗ trợ" style="border:1px solid var(--line);border-radius:9px;padding:.65rem .75rem;font:inherit;">' +
            '<select id="rhSupportStatusFilter" aria-label="Lọc trạng thái" style="border:1px solid var(--line);border-radius:9px;padding:.65rem .75rem;font:inherit;"><option value="all">Tất cả trạng thái</option>' + (RHD.SUPPORT_STATUSES || []).map(function (s) { return '<option value="' + escapeHtml(s.id) + '"' + (supportListFilters.status === s.id ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>'; }).join('') + '</select>' +
            '<select id="rhSupportTypeFilter" aria-label="Lọc loại yêu cầu" style="border:1px solid var(--line);border-radius:9px;padding:.65rem .75rem;font:inherit;"><option value="all">Tất cả loại</option>' + categories.map(function (category) { return '<option value="' + escapeHtml(category) + '"' + (supportListFilters.category === category ? ' selected' : '') + '>' + escapeHtml(category) + '</option>'; }).join('') + '</select>' +
            '<select id="rhSupportPriorityFilter" aria-label="Lọc mức độ ưu tiên" style="border:1px solid var(--line);border-radius:9px;padding:.65rem .75rem;font:inherit;"><option value="all">Tất cả mức độ</option>' + (RHD.SUPPORT_PRIORITIES || []).map(function (priority) { return '<option value="' + escapeHtml(priority.id) + '"' + (supportListFilters.priority === priority.id ? ' selected' : '') + '>' + escapeHtml(priority.label) + '</option>'; }).join('') + '</select></div>' +
            '<div class="support-status-filters" role="group" aria-label="Lọc yêu cầu theo trạng thái">' + [{ id: 'all', label: 'Tất cả' }].concat(RHD.SUPPORT_STATUSES || []).map(function (status) {
                return '<button type="button" data-support-status-filter="' + escapeHtml(status.id) + '" class="' + (supportListFilters.status === status.id ? 'active' : '') + '" aria-pressed="' + (supportListFilters.status === status.id) + '">' + escapeHtml(status.label) + '<span>' + requests.filter(function (request) { return status.id === 'all' || request.status === status.id; }).length + '</span></button>';
            }).join('') + '</div>' +
            (requests.length ? '<div style="color:#70839d;font-size:.82rem;margin-bottom:.55rem;">Hiển thị ' + visibleRequests.length + ' / ' + requests.length + ' yêu cầu</div><div class="table-container support-request-table-wrap"><table class="support-request-table"><thead><tr><th>Yêu cầu</th><th>Cư dân / căn hộ</th><th>Mức độ</th><th>Trạng thái</th><th>Phụ trách / ghi chú</th><th>Thời gian gửi</th><th>Thao tác</th></tr></thead><tbody>' + (rows || '<tr><td colspan="7" style="padding:1rem;text-align:center;color:#94a3b8;">Không có yêu cầu phù hợp với bộ lọc.</td></tr>') + '</tbody></table></div>'
                : emptyState('fa-headset', 'Chưa có yêu cầu hỗ trợ nào từ cư dân.')) +
            '</div></section><section class="support-view-panel' + (activeSupportView === 'chat' ? ' active' : '') + '" data-support-panel="chat"><div class="support-inbox">' +
            '<aside class="support-inbox-sidebar"><div class="support-inbox-title"><div><h3>Hộp thư cư dân</h3><p>' + residentGroups.length + ' cư dân · ' + requests.length + ' yêu cầu riêng</p></div><i class="fas fa-inbox"></i></div>' +
            '<div class="support-inbox-list">' + residentGroups.map(function (group) { return supportConversationListItem(group, group.key === selectedSupportResidentKey); }).join('') + '</div></aside>' +
            '<section class="support-inbox-main">' + supportChatPane(selectedChat, selectedResident ? selectedResident.requests : []) + '</section></div></section></section>';
        tab.onclick = function (ev) {
            var button = ev.target.closest('button');
            if (!button || !tab.contains(button)) return;
            if (button.hasAttribute('data-support-view')) {
                activeSupportView = button.getAttribute('data-support-view');
                renderSupportTab();
            } else if (button.hasAttribute('data-support-status-filter')) {
                supportListFilters.status = button.getAttribute('data-support-status-filter');
                renderSupportTab();
            } else if (button.hasAttribute('data-support-chat-resident')) {
                selectedSupportResidentKey = button.getAttribute('data-support-chat-resident');
                var residentGroup = residentGroupsByKey[selectedSupportResidentKey];
                selectedSupportChatId = residentGroup && residentGroup.requests.length ? residentGroup.requests[0].id : null;
                renderSupportTab();
            } else if (button.hasAttribute('data-support-chat-id')) {
                selectedSupportChatId = button.getAttribute('data-support-chat-id');
                renderSupportTab();
            } else if (button.hasAttribute('data-support-send')) {
                sendSupportMessage(button.getAttribute('data-support-send'), 'supportInboxReply');
            } else if (button.hasAttribute('data-open-support-request')) {
                RHUI.openSupportForm(button.getAttribute('data-open-support-request'));
            }
        };
        var inboxReply = byId('supportInboxReply');
        if (inboxReply) {
            inboxReply.value = replyDraft;
            if (replyFocused) { inboxReply.focus(); inboxReply.setSelectionRange(replyCaret, replyCaret); }
        }
        if (inboxReply) inboxReply.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendSupportMessage(selectedSupportChatId, 'supportInboxReply'); }
        });
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
        if (filterFocusId && byId(filterFocusId)) {
            byId(filterFocusId).focus();
            if (filterCaret != null) byId(filterFocusId).setSelectionRange(filterCaret, filterCaret);
        }
    }

    RHUI.openSupportForm = function (id) {
        if (!guard('support.update')) return;
        var r = supportRequestInScope(id);
        if (!r) return;
        RHUI.drawerEntity = 'supportRequests';
        RHUI.drawerId = id;
        var apt = RHD.get('apartments', r.apartmentId);
        var building = RHD.get('buildings', r.buildingId);
        var selectedStaffGroup = r.staffGroup || supportGroupForRequest(r);
        var allStaffAccounts = global.RH ? global.RH.getUsers().filter(function (user) {
            return (user.role === 'staff' || user.accountTypeId === 'at-staff') && user.status === 'active';
        }) : [];
        var staffAccounts = allStaffAccounts.filter(function (user) {
            return !selectedStaffGroup || !user.staffGroup || user.staffGroup === selectedStaffGroup || user.id === r.assigneeId;
        });
        var selectedStaffId = r.assigneeId || (staffAccounts.filter(function (user) {
            return String(user.name || '').trim().toLocaleLowerCase() === String(r.assignee || '').trim().toLocaleLowerCase() ||
                String(user.email || '').trim().toLocaleLowerCase() === String(r.assignee || '').trim().toLocaleLowerCase();
        })[0] || {}).id || '';
        var staffAccountOptions = '<option value="">Chọn tài khoản nhân viên</option>' + staffAccounts.map(function (user) {
            var group = (RHD.SUPPORT_STAFF_GROUPS || []).filter(function (item) { return item.id === user.staffGroup; })[0];
            return '<option value="' + escapeHtml(user.id) + '"' + (user.id === selectedStaffId ? ' selected' : '') + '>' + escapeHtml(user.name || user.email) + (group ? ' · ' + escapeHtml(group.label) : ' · Chưa gán nhóm') + '</option>';
        }).join('');
        var staffTaskStatusLabels = {
            waiting: 'Chờ tiếp nhận',
            in_progress: 'Đang xử lý',
            pending_approval: 'Hoàn thành (Chờ Quản lý duyệt)',
            approved: 'Đã được Quản lý duyệt'
        };
        var completionReview = r.staffTaskStatus === 'pending_approval'
            ? '<div style="grid-column:1/-1;padding:.8rem 1rem;border-radius:10px;background:#fff7df;color:#8a5a00;"><strong>Nhân viên đã báo hoàn thành.</strong> Trạng thái hiện tại: ' + escapeHtml(staffTaskStatusLabels[r.staffTaskStatus]) + '.<p style="margin:.5rem 0;color:#475569;">' + escapeHtml(r.staffCompletionNote || 'Nhân viên chưa gửi ghi chú kết quả.') + '</p><button type="button" class="btn-primary" id="srApproveCompletion">Duyệt hoàn thành</button></div>'
            : (r.staffTaskStatus ? '<div style="grid-column:1/-1;padding:.65rem .85rem;border-radius:10px;background:#f1f5f9;color:#475569;">Tiến độ nhiệm vụ: <strong>' + escapeHtml(staffTaskStatusLabels[r.staffTaskStatus] || r.staffTaskStatus) + '</strong></div>' : '');
        var attachmentFiles = Array.isArray(r.attachmentFiles) ? r.attachmentFiles.filter(function (file) { return file && /^data:image\/jpeg;base64,/i.test(file.dataUrl || ''); }) : [];
        var attachmentMarkup = attachmentFiles.length
            ? '<div style="grid-column:1/-1;"><label style="font-size:.8rem;color:#94a3b8;">Ảnh đính kèm</label><div style="display:flex;flex-wrap:wrap;gap:.65rem;margin-top:.45rem;">' + attachmentFiles.map(function (file, index) {
                return '<a href="' + escapeHtml(file.dataUrl) + '" target="_blank" rel="noopener" style="display:grid;gap:.3rem;width:120px;color:#61708a;font-size:.72rem;text-decoration:none;"><img src="' + escapeHtml(file.dataUrl) + '" alt="Ảnh đính kèm ' + (index + 1) + '" style="width:120px;height:90px;object-fit:cover;border:1px solid var(--line);border-radius:8px;"><span>' + escapeHtml(file.name || 'Ảnh ' + (index + 1)) + '</span></a>';
            }).join('') + '</div></div>'
            : (r.attachments ? '<div style="grid-column:1/-1;color:#94a3b8;font-size:.8rem;">Yêu cầu cũ có ' + escapeHtml(r.attachments) + ' tệp đính kèm nhưng nội dung chưa được lưu.</div>' : '');
        var html = '<form onsubmit="RHUI.submitSupportForm(event)">' +
            '<div class="rh-grid-2">' +
            '<div><label style="font-size:.8rem;color:#94a3b8;">Người gửi</label><div style="font-weight:600;">' + escapeHtml(r.residentName || '—') + '</div></div>' +
            '<div><label style="font-size:.8rem;color:#94a3b8;">Căn hộ</label><div style="font-weight:600;">' + escapeHtml(building ? building.name : '—') + ' / ' + escapeHtml(apt ? apt.name : '—') + '</div></div>' +
            '<div style="grid-column:1/-1;"><label style="font-size:.8rem;color:#94a3b8;">Nội dung</label><div style="font-weight:600;">' + escapeHtml(r.title) + '</div><p style="color:#61708a;font-size:.85rem;margin-top:.35rem;">' + escapeHtml(r.description) + '</p></div>' +
            attachmentMarkup +
            completionReview +
            '<div class="rh-field"><label>Trạng thái</label><select id="srStatus">' + selectOptions(RHD.SUPPORT_STATUSES, 'id', 'label', r.status) + '</select></div>' +
            '<div class="rh-field"><label>Tài khoản nhân viên</label><select id="srAssigneeAccount">' + staffAccountOptions + '</select></div>' +
            '<div class="rh-field"><label>Người phụ trách</label><input id="srAssignee" value="' + escapeHtml(r.assignee || RHD.getSettings().supportAutoAssignee || '') + '" placeholder="Tên nhân viên xử lý"><small>Chọn tài khoản để nhiệm vụ chỉ hiển thị với đúng nhân viên.</small></div>' +
            '<div class="rh-field"><label>Nhóm chuyên môn</label><select id="srStaffGroup"><option value="">Chọn nhóm</option>' + selectOptions(RHD.SUPPORT_STAFF_GROUPS, 'id', 'label', selectedStaffGroup) + '</select></div>' +
            '<div class="rh-field"><label>Hạn xử lý</label><input id="srDueAt" type="date" value="' + escapeHtml(String(r.dueAt || '').slice(0, 10)) + '"></div>' +
            '<div class="support-drawer-chat"><div class="support-drawer-chat-head"><strong>Trao đổi với cư dân</strong></div><div id="srConversation" class="support-drawer-messages">' + supportConversationHtml(Array.isArray(r.messages) ? r.messages : []) + '</div><div class="support-drawer-compose"><textarea id="srReply" rows="2" placeholder="Nhập tin nhắn gửi cư dân..."></textarea><button type="button" class="btn-primary" onclick="RHUI.sendSupportReply()" aria-label="Gửi tin nhắn"><i class="fas fa-paper-plane"></i></button></div></div>' +
            '</div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.25rem;">' +
            '<button type="submit" class="btn-primary">Cập nhật</button>' +
            '<button type="button" onclick="RHUI.closeDrawer()" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:.6rem 1.2rem;font:inherit;cursor:pointer;">Đóng</button>' +
            '</div></form>';
        openDrawer('Yêu cầu ' + r.code, html);
        byId('srAssigneeAccount').addEventListener('change', function () {
            var user = staffAccounts.filter(function (item) { return item.id === this.value; }, this)[0];
            byId('srAssignee').value = user ? user.name : '';
        });
        var approveCompletion = byId('srApproveCompletion');
        if (approveCompletion) approveCompletion.addEventListener('click', function () {
            byId('srStatus').value = 'resolved';
            RHUI.submitSupportForm({ preventDefault: function () {} });
        });
        byId('srReply').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); RHUI.sendSupportReply(); }
        });
    };

    RHUI.sendSupportReply = function () {
        sendSupportMessage(RHUI.drawerId, 'srReply', true);
    };

    function sendSupportMessage(requestId, inputId, refreshDrawer) {
        if (!guard('support.update')) return;
        var request = supportRequestInScope(requestId);
        var input = byId(inputId);
        var text = input && input.value.trim();
        if (!request || !text) return;
        var now = Date.now();
        var result = RHD.update('supportRequests', request.id, {
            messages: (Array.isArray(request.messages) ? request.messages : []).concat([{
                from: global.RH_SESSION && global.RH_SESSION.name || 'Ban quản lý',
                text: text, time: new Date(now).toLocaleString('vi-VN')
            }]), updatedAt: now
        });
        if (!result.ok) { alert(result.error || 'Không thể gửi tin nhắn. Vui lòng thử lại.'); return; }
        input.value = '';
        if (refreshDrawer) refreshOpenSupportConversation();
        else renderSupportTab();
        if (RHD.getSettings().notifySupportStatus && RHD.mode() !== 'demo' && global.RH && global.RH.syncManagerNotification) {
            global.RH.syncManagerNotification({
                id: result.item.id, customerId: result.item.customerId, apartmentId: result.item.apartmentId, residentEmail: result.item.residentEmail,
                type: 'request', title: 'Tin nhắn mới về yêu cầu ' + result.item.code,
                body: text, refType: 'request', actionUrl: 'requests', actionLabel: 'Xem yêu cầu'
            });
        }
    }

    function refreshOpenSupportConversation() {
        if (RHUI.drawerEntity !== 'supportRequests' || !byId('rhDrawerOverlay') || !byId('rhDrawerOverlay').classList.contains('show')) return;
        var request = can('support.view') && supportRequestInScope(RHUI.drawerId);
        var conversation = byId('srConversation');
        if (!conversation) return;
        if (!request) { closeDrawer(); return; }
        var scrollToBottom = conversation.scrollTop + conversation.clientHeight >= conversation.scrollHeight - 24;
        conversation.innerHTML = supportConversationHtml(Array.isArray(request.messages) ? request.messages : []);
        if (scrollToBottom) conversation.scrollTop = conversation.scrollHeight;
    }

    RHUI.submitSupportForm = function (ev) {
        ev.preventDefault();
        if (!guard('support.update')) return;
        var before = supportRequestInScope(RHUI.drawerId);
        if (!before) return;
        var status = byId('srStatus').value;
        var now = Date.now();
        var assignee = byId('srAssignee').value.trim();
        var selectedStaffId = byId('srAssigneeAccount').value;
        var staffAccounts = global.RH ? global.RH.getUsers().filter(function (user) {
            return (user.role === 'staff' || user.accountTypeId === 'at-staff') && user.status === 'active';
        }) : [];
        var assignedStaff = staffAccounts.filter(function (user) {
            return user.id === selectedStaffId ||
                (!selectedStaffId && assignee && (
                    String(user.name || '').trim().toLocaleLowerCase() === assignee.toLocaleLowerCase() ||
                    String(user.email || '').trim().toLocaleLowerCase() === assignee.toLocaleLowerCase()
                ));
        })[0] || null;
        var assignmentChanged = String(before.assigneeId || '') !== String(assignedStaff ? assignedStaff.id : '') ||
            String(before.assignee || '').trim() !== assignee ||
            String(before.staffGroup || '') !== byId('srStaffGroup').value;
        if (assignedStaff && !byId('srStaffGroup').value) {
            alert('Vui lòng chọn nhóm chuyên môn cho nhiệm vụ.');
            return;
        }
        if (assignedStaff && assignedStaff.staffGroup && byId('srStaffGroup').value && assignedStaff.staffGroup !== byId('srStaffGroup').value) {
            alert('Nhân viên không thuộc nhóm chuyên môn đã chọn.');
            return;
        }
        var changes = {
            status: status,
            assignee: assignee,
            assigneeId: assignedStaff ? assignedStaff.id : '',
            staffGroup: byId('srStaffGroup').value,
            dueAt: byId('srDueAt').value,
            updatedAt: now
        };
        if (assignedStaff && assignmentChanged && status !== 'resolved' && status !== 'closed') {
            changes.status = 'accepted';
            changes.staffTaskStatus = 'waiting';
            changes.assignedAt = now;
            changes.acceptedAt = now;
        } else if (assignedStaff && !before.staffTaskStatus && status === 'accepted') {
            changes.staffTaskStatus = 'waiting';
        } else if (!assignee && (before.assigneeId || before.assignee) && assignmentChanged && status !== 'resolved' && status !== 'closed') {
            changes.status = 'new';
            changes.staffTaskStatus = '';
            changes.acceptedAt = null;
            changes.startedAt = null;
        }
        if (status === 'resolved' && before.staffTaskStatus === 'pending_approval') {
            changes.staffTaskStatus = 'approved';
            changes.approvedAt = now;
        }
        if (status === 'resolved') {
            changes.resolutionNote = before.staffCompletionNote || before.resolutionNote || before.response || '';
            if (before.status !== 'resolved') changes.resolvedAt = now;
        }
        if (status === 'closed' && before.status !== 'closed') changes.closedAt = now;
        var res = RHD.update('supportRequests', RHUI.drawerId, changes);
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
        confirmDelete: confirmDelete,
        renderBuildingsTab: renderBuildingsTab,
        renderApartmentsTab: renderApartmentsTab,
        renderServiceFeesTab: renderServiceFeesTab,
        renderCustomersTab: renderCustomersTab,
        renderMetersTab: renderMetersTab,
        renderContractsTab: renderContractsTab,
        renderInvoicesTab: renderInvoicesTab,
        renderCashflowTab: renderCashflowTab,
        openApartmentDetail: RHUI.openApartmentDetail,
        renderSupportTab: renderSupportTab,
        refreshOpenSupportConversation: refreshOpenSupportConversation,
        renderDashboardCounts: renderDashboardCounts,
        renderDemoBanner: renderDemoBanner
    });
})(window);
