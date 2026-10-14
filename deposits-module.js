/* ResidentHub - manager deposit list and editor. Business rules live in RHLease. */
(function (global) {
    var RHD = global.RHD;
    var RHLease = global.RHLease;
    var RHUI = global.RHUI;
    var util = RHUI.util;
    var state = { status: 'all', search: '', buildingId: '', apartmentId: '', fromDate: '', toDate: '' };
    var STATUS_LABELS = {
        holding: 'Đang giữ chỗ',
        contracted: 'Đã ký hợp đồng',
        cancelled: 'Đã hủy',
        forfeited: 'Bỏ cọc'
    };

    function esc(value) { return util.escapeHtml(value == null ? '' : value); }
    function money(value) { return (Number(value) || 0).toLocaleString('vi-VN') + 'đ'; }
    function dateInputValue(date) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    function today() { return dateInputValue(new Date()); }
    function formatDate(value) {
        var parts = String(value || '').slice(0, 10).split('-');
        return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : '—';
    }
    function rawAmount(value) { return Number(String(value || '').replace(/\D/g, '')) || 0; }
    function formatAmount(value) { return (Number(value) || 0).toLocaleString('vi-VN'); }
    function actor() {
        var session = global.RH && global.RH.getSession ? global.RH.getSession() : null;
        return { actorId: session && session.id || '', actorName: session && session.name || '' };
    }
    function can(permission) { return util.can(permission); }
    function deposits() {
        var buildingIds = util.scoped('buildings').map(function (building) { return building.id; });
        return RHLease.listDeposits().filter(function (deposit) { return buildingIds.indexOf(deposit.buildingId) !== -1; });
    }
    function customerIds(deposit) { return deposit.tenantIds || (deposit.customerId ? [deposit.customerId] : []); }
    function namesFor(deposit) {
        return customerIds(deposit).map(function (id) {
            var customer = RHD.get('customers', id);
            return customer ? customer.fullName || customer.name : '';
        }).filter(Boolean).join(', ') || '—';
    }
    function buildingFor(deposit) { return RHD.get('buildings', deposit.buildingId); }
    function apartmentFor(deposit) { return RHD.get('apartments', deposit.apartmentId); }
    function statusBadge(status) {
        var colors = {
            holding: ['#a5680c', '#fff4df'], contracted: ['#18a878', '#e6f8ef'],
            cancelled: ['#64748b', '#f1f5f9'], forfeited: ['#ef4444', '#fee2e2']
        }[status] || ['#64748b', '#f1f5f9'];
        return util.badge(STATUS_LABELS[status] || status || '—', colors[0], colors[1]);
    }

    function ensureStyles() {
        if (document.getElementById('rhDepositsStyles')) return;
        var style = document.createElement('style');
        style.id = 'rhDepositsStyles';
        style.textContent = '#deposits-tab .rh-deposits{color:#172b45;position:relative;padding-bottom:5rem}#deposits-tab .rh-deposit-head{align-items:center;display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem}#deposits-tab .rh-deposit-head h2{color:#10213c;font-size:1.4rem;font-weight:800}#deposits-tab .rh-deposit-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;margin-bottom:1rem}#deposits-tab .rh-deposit-kpi{background:#fff;border:1px solid #e3eaf2;border-radius:12px;padding:1rem}#deposits-tab .rh-deposit-kpi small{color:#718096;display:block;font-size:.78rem;font-weight:700}#deposits-tab .rh-deposit-kpi strong{color:#10213c;display:block;font:800 1.25rem "Plus Jakarta Sans","Be Vietnam Pro",sans-serif;margin-top:.4rem}#deposits-tab .rh-deposit-tabs{display:flex;gap:.5rem;overflow-x:auto;padding:.2rem 0 .75rem}#deposits-tab .rh-deposit-tab{background:#fff;border:1px solid #e2e8f0;border-radius:8px;color:#536275;cursor:pointer;font:600 .8rem "Be Vietnam Pro",sans-serif;padding:.55rem .75rem;white-space:nowrap}#deposits-tab .rh-deposit-tab.active{background:#eaf3ff;border-color:#9ccaff;color:#0d65d5}#deposits-tab .rh-deposit-tab b{margin-left:.35rem}#deposits-tab .rh-deposit-filters{align-items:end;background:#fff;border:1px solid #e3eaf2;border-radius:10px;display:grid;gap:.65rem;grid-template-columns:1.2fr 1fr 1fr 1fr 1fr;padding:.8rem;margin-bottom:.8rem}#deposits-tab .rh-deposit-filters label,#deposits-tab .rh-deposit-field label{color:#475569;display:block;font-size:.77rem;font-weight:700;margin-bottom:.35rem}#deposits-tab .rh-deposit-filters input,#deposits-tab .rh-deposit-filters select,#deposits-tab .rh-deposit-field input,#deposits-tab .rh-deposit-field select,#deposits-tab .rh-deposit-field textarea{background:#fff;border:1px solid #dce3eb;border-radius:8px;color:#26374b;font:inherit;font-size:.84rem;min-height:40px;padding:.55rem .65rem;width:100%}#deposits-tab .rh-deposit-table-wrap{background:#fff;border:1px solid #e3eaf2;border-radius:10px;overflow:auto}#deposits-tab .rh-deposit-table{border-collapse:collapse;min-width:1050px;width:100%}#deposits-tab .rh-deposit-table th,#deposits-tab .rh-deposit-table td{border-bottom:1px solid #e8edf3;padding:.75rem .7rem;text-align:left;vertical-align:middle}#deposits-tab .rh-deposit-table th{background:#f7f9fc;color:#61708a;font-size:.72rem;white-space:nowrap}#deposits-tab .rh-deposit-table td{color:#334155;font-size:.82rem}#deposits-tab .rh-deposit-actions{display:flex;gap:.3rem;white-space:nowrap}#deposits-tab .rh-deposit-action{align-items:center;background:#fff;border:1px solid #dce3eb;border-radius:7px;color:#536275;cursor:pointer;display:inline-flex;height:32px;justify-content:center;width:32px}#deposits-tab .rh-deposit-action:hover{background:#eff6ff;border-color:#9ccaff;color:#0d65d5}#deposits-tab .rh-deposit-action.danger{color:#dc4b4b}#deposits-tab .rh-deposit-alert{background:#fff1f0;border-radius:999px;color:#c43f36;display:inline-block;font-size:.68rem;font-weight:700;margin-top:.35rem;padding:.2rem .45rem}#deposits-tab .rh-deposit-empty{color:#718096;padding:2rem;text-align:center}#deposits-tab .rh-deposit-fab{align-items:center;background:#18a878;border:0;border-radius:50%;bottom:1.1rem;box-shadow:0 10px 24px rgba(24,168,120,.25);color:#fff;cursor:pointer;display:flex;font-size:1.8rem;height:56px;justify-content:center;position:fixed;right:2rem;width:56px;z-index:20}#deposits-tab .rh-deposit-fab:disabled{cursor:not-allowed;opacity:.55}#deposits-tab .rh-deposit-form{display:grid;gap:1rem}#deposits-tab .rh-deposit-section{border-bottom:1px solid #e8edf3;padding-bottom:1rem}#deposits-tab .rh-deposit-section h4{color:#10213c;font-size:.9rem;margin:0 0 .75rem}#deposits-tab .rh-deposit-grid{display:grid;gap:.75rem;grid-template-columns:repeat(2,minmax(0,1fr))}#deposits-tab .rh-deposit-field{min-width:0}#deposits-tab .rh-deposit-field.full{grid-column:1/-1}#deposits-tab .rh-deposit-field small{color:#dc4b4b;display:block;font-size:.72rem;margin-top:.25rem;min-height:.9rem}#deposits-tab .rh-deposit-field [aria-invalid="true"]{border-color:#dc4b4b!important;box-shadow:0 0 0 2px rgba(220,75,75,.1)}#deposits-tab .rh-deposit-inline{align-items:center;display:flex;gap:.45rem}#deposits-tab .rh-deposit-inline input{min-width:0}#deposits-tab .rh-deposit-currency{color:#718096;flex:0 0 auto;font-size:.8rem;font-weight:700}#deposits-tab .rh-deposit-service-list{display:grid;gap:.55rem}#deposits-tab .rh-deposit-service{align-items:center;border:1px solid #e5ebf2;border-radius:8px;display:grid;gap:.6rem;grid-template-columns:24px minmax(0,1fr) 110px 86px;padding:.55rem}#deposits-tab .rh-deposit-service input[type="number"]{border:1px solid #dce3eb;border-radius:6px;min-width:0;padding:.45rem;width:100%}#deposits-tab .rh-deposit-form-error{color:#c43f36;font-size:.82rem;min-height:1rem}@media(max-width:850px){#deposits-tab .rh-deposit-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){#deposits-tab .rh-deposit-kpis{grid-template-columns:1fr}#deposits-tab .rh-deposit-grid{grid-template-columns:1fr}#deposits-tab .rh-deposit-field.full{grid-column:auto}#deposits-tab .rh-deposit-service{grid-template-columns:24px minmax(0,1fr) 72px}#deposits-tab .rh-deposit-service .rh-deposit-quantity{grid-column:2/-1}#deposits-tab .rh-deposit-fab{bottom:1rem;right:1rem}}';
        style.textContent += '#rhDrawerBody .rh-deposit-form{display:grid;gap:1.1rem;color:#26364b}#rhDrawerBody .rh-deposit-section{min-width:0;padding:1rem;border:1px solid #e5eaf1;border-radius:11px;background:#fff}#rhDrawerBody .rh-deposit-section h4{margin:0 0 .9rem;color:#183453;font-size:.94rem;font-weight:700}#rhDrawerBody .rh-deposit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}#rhDrawerBody .rh-deposit-field{display:grid;align-content:start;gap:.3rem;min-width:0}#rhDrawerBody .rh-deposit-field.full{grid-column:1/-1}#rhDrawerBody .rh-deposit-field>label{margin:0;color:#536276;font-size:.76rem;font-weight:650;line-height:1.4}#rhDrawerBody .rh-deposit-field input:not([type=checkbox]),#rhDrawerBody .rh-deposit-field select,#rhDrawerBody .rh-deposit-field textarea{box-sizing:border-box;width:100%;min-width:0;min-height:40px;padding:.58rem .68rem;border:1px solid #d8e0ea;border-radius:8px;background:#fff;color:#24364d;font:400 .82rem "Be Vietnam Pro",sans-serif}#rhDrawerBody .rh-deposit-field select[multiple]{min-height:112px;padding:.35rem}#rhDrawerBody .rh-deposit-field textarea{resize:vertical}#rhDrawerBody .rh-deposit-field input:focus,#rhDrawerBody .rh-deposit-field select:focus,#rhDrawerBody .rh-deposit-field textarea:focus{outline:2px solid #d8eaff;border-color:#70a8e5}#rhDrawerBody .rh-deposit-field input[readonly],#rhDrawerBody .rh-deposit-field input:disabled{background:#f3f6f9;color:#68788c}#rhDrawerBody .rh-deposit-field small{display:block;min-height:.1rem;margin-top:.1rem;color:#bd3939;font-size:.71rem;line-height:1.4}#rhDrawerBody .rh-deposit-field [aria-invalid=true]{border-color:#dc4b4b!important;box-shadow:0 0 0 2px rgba(220,75,75,.1)}#rhDrawerBody .rh-deposit-inline{display:flex;align-items:center;gap:.5rem;min-width:0}#rhDrawerBody .rh-deposit-inline input{flex:1 1 auto;min-width:0}#rhDrawerBody .rh-deposit-currency{flex:0 0 auto;color:#718096;font-size:.8rem;font-weight:700}#rhDrawerBody .rh-deposit-service-list{display:grid;gap:.55rem}#rhDrawerBody .rh-deposit-service{display:grid;grid-template-columns:24px minmax(0,1fr) minmax(90px,130px) 68px;align-items:center;gap:.55rem;padding:.6rem;border:1px solid #e5ebf2;border-radius:8px;background:#fbfcfe}#rhDrawerBody .rh-deposit-service>span{min-width:0;color:#35465b;font-size:.77rem;line-height:1.4}#rhDrawerBody .rh-deposit-service>span strong{font-weight:650}#rhDrawerBody .rh-deposit-service input[type=checkbox]{width:17px;height:17px;margin:0}#rhDrawerBody .rh-deposit-service input[type=text],#rhDrawerBody .rh-deposit-service input[type=number]{box-sizing:border-box;width:100%;min-width:0;height:36px;padding:.4rem .5rem;border:1px solid #dce3eb;border-radius:7px;background:#fff;font:400 .77rem "Be Vietnam Pro",sans-serif}#rhDrawerBody .rh-deposit-form-error{margin:.35rem 0;color:#bd3939;font-size:.78rem;line-height:1.45}#rhDrawerBody .rh-deposit-form>div[style*="justify-content:flex-end"]{display:flex;justify-content:flex-end;gap:.6rem;flex-wrap:wrap;margin-top:.2rem!important}#rhDrawerBody .rh-deposit-form button,#rhDrawerBody .rh-deposit-form-error button{font-family:"Be Vietnam Pro",sans-serif}@media(max-width:640px){#rhDrawerBody{padding:1rem!important}#rhDrawerBody .rh-deposit-form{gap:.8rem}#rhDrawerBody .rh-deposit-section{padding:.8rem}#rhDrawerBody .rh-deposit-grid{grid-template-columns:minmax(0,1fr);gap:.65rem}#rhDrawerBody .rh-deposit-field.full{grid-column:auto}#rhDrawerBody .rh-deposit-service{grid-template-columns:22px minmax(0,1fr) minmax(82px,105px)}#rhDrawerBody .rh-deposit-service .rh-deposit-quantity{grid-column:3;grid-row:2}#rhDrawerBody .rh-deposit-service>span{grid-column:2/4}#rhDrawerBody .rh-deposit-service input[type=checkbox]{grid-row:1}#rhDrawerBody .rh-deposit-form>div[style*="justify-content:flex-end"]{position:sticky;bottom:-1rem;padding:.8rem 0;background:linear-gradient(transparent,#fff 25%);z-index:1}}';
        document.head.appendChild(style);
    }

    function transactionFor(deposit, action) {
        if (action === 'history') return RHLease.listDepositTransactions(deposit.id);
        return [];
    }

    function actionButton(deposit, action, icon, title, danger, disabled) {
        return '<button type="button" class="rh-deposit-action' + (danger ? ' danger' : '') + '" data-deposit-action="' + action + '" data-deposit-id="' + esc(deposit.id) + '" title="' + esc(title) + '" aria-label="' + esc(title) + '"' + (disabled ? ' disabled' : '') + '><i class="fas ' + icon + '"></i></button>';
    }

    function matchingDeposits(items) {
        var search = state.search.trim().toLocaleLowerCase();
        return items.filter(function (deposit) {
            if (state.customerId && customerIds(deposit).indexOf(state.customerId) === -1) return false;
            if (state.status !== 'all' && deposit.status !== state.status) return false;
            if (state.buildingId && deposit.buildingId !== state.buildingId) return false;
            if (state.apartmentId && deposit.apartmentId !== state.apartmentId) return false;
            if (state.fromDate && String(deposit.depositDate || '') < state.fromDate) return false;
            if (state.toDate && String(deposit.depositDate || '') > state.toDate) return false;
            if (search) {
                var building = buildingFor(deposit) || {};
                var apartment = apartmentFor(deposit) || {};
                var fields = [deposit.code, building.name, building.shortName, apartment.name, namesFor(deposit)];
                if (fields.join(' ').toLocaleLowerCase().indexOf(search) === -1) return false;
            }
            return true;
        }).sort(function (a, b) { return String(b.depositDate || '').localeCompare(String(a.depositDate || '')); });
    }

    function renderDepositsTab(context) {
        var tab = document.getElementById('deposits-tab');
        if (!tab) return;
        ensureStyles();
        state.customerId = context && context.customerId || '';
        var all = deposits();
        var current = matchingDeposits(all);
        var holding = all.filter(function (deposit) { return deposit.status === 'holding'; });
        var heldTotal = holding.reduce(function (sum, deposit) { return sum + (Number(deposit.depositReceivedAmount) || 0); }, 0);
        var buildings = util.scoped('buildings');
        var apartments = util.scoped('apartments');
        var counts = {
            all: all.length,
            holding: holding.length,
            contracted: all.filter(function (item) { return item.status === 'contracted'; }).length,
            cancelled: all.filter(function (item) { return item.status === 'cancelled'; }).length,
            forfeited: all.filter(function (item) { return item.status === 'forfeited'; }).length
        };
        var tabs = [['all', 'Tất cả'], ['holding', 'Đang giữ chỗ'], ['contracted', 'Đã ký hợp đồng'], ['cancelled', 'Đã hủy'], ['forfeited', 'Bỏ cọc']];
        var rows = current.map(function (deposit) {
            var building = buildingFor(deposit);
            var apartment = apartmentFor(deposit);
            var alertStatus = RHLease.depositAlert(deposit);
            var canEdit = deposit.status === 'holding' && can('customers.update');
            var canDelete = deposit.status === 'holding' && can('customers.delete');
            var canSign = deposit.status === 'holding' && can('contracts.create');
            var canCancel = deposit.status === 'holding' && can('customers.update');
            return '<tr><td><strong>' + esc(deposit.code || '—') + '</strong></td>' +
                '<td>' + esc((building && (building.shortName || building.name) || '—') + ' · ' + (apartment && apartment.name || '—')) + (deposit.roomId ? '<div style="color:#718096">Phòng ' + esc(deposit.roomId) + (deposit.bedId ? ' · Giường ' + esc(deposit.bedId) : '') + '</div>' : '') + '</td>' +
                '<td>' + esc(namesFor(deposit)) + (deposit.occupantCount > 1 ? '<div style="color:#718096">' + Number(deposit.occupantCount) + ' người ở</div>' : '') + '</td>' +
                '<td>' + formatDate(deposit.depositDate) + '</td><td>' + formatDate(deposit.moveInDate) + (alertStatus ? '<div class="rh-deposit-alert">Quá ngày chuyển vào</div>' : '') + '</td>' +
                '<td><strong>' + money(deposit.depositReceivedAmount) + '</strong><div style="color:#718096">/ ' + money(deposit.depositFullAmount) + '</div></td>' +
                '<td>' + statusBadge(deposit.status) + '</td>' +
                '<td><div class="rh-deposit-actions">' +
                (canEdit ? actionButton(deposit, 'edit', 'fa-pen', 'Sửa', false, false) : '') +
                (canDelete ? actionButton(deposit, 'delete', 'fa-trash', 'Xóa', true, false) : '') +
                (canSign ? actionButton(deposit, 'sign', 'fa-file-signature', 'Ký hợp đồng', false, false) : '') +
                (deposit.contractId ? actionButton(deposit, 'contract', 'fa-link', 'Mở hợp đồng đã liên kết', false, false) : '') +
                (canCancel ? actionButton(deposit, 'cancel', 'fa-ban', 'Hủy cọc', true, false) : '') +
                actionButton(deposit, 'history', 'fa-clock-rotate-left', 'Lịch sử giao dịch', false, false) +
                '</div></td></tr>';
        }).join('');
        var buildingOptions = '<option value="">Tất cả tòa nhà</option>' + buildings.map(function (building) {
            return '<option value="' + esc(building.id) + '"' + (state.buildingId === building.id ? ' selected' : '') + '>' + esc(building.shortName || building.name) + '</option>';
        }).join('');
        var apartmentOptions = '<option value="">Tất cả căn hộ</option>' + apartments.filter(function (apartment) { return !state.buildingId || apartment.buildingId === state.buildingId; }).map(function (apartment) {
            return '<option value="' + esc(apartment.id) + '"' + (state.apartmentId === apartment.id ? ' selected' : '') + '>' + esc(apartment.name) + '</option>';
        }).join('');
        var depositLimit = RHD.limitInfo('deposits');
        var canCreate = can('customers.create') && buildings.length > 0 && apartments.length > 0 && util.scoped('customers').length > 0 && (!depositLimit.limited || !depositLimit.reached);
        tab.innerHTML = util.renderDemoBanner('deposits') + '<section class="rh-deposits">' +
            '<div class="rh-deposit-head"><h2>Đặt cọc</h2><span style="color:#718096;font-size:.82rem;">Khách hàng → Giữ chỗ → Hợp đồng</span></div>' +
            '<div class="rh-deposit-kpis"><div class="rh-deposit-kpi"><small>Tổng số cọc</small><strong>' + counts.all + '</strong></div><div class="rh-deposit-kpi"><small>Đang giữ chỗ</small><strong>' + counts.holding + '</strong></div><div class="rh-deposit-kpi"><small>Tổng tiền đang giữ</small><strong>' + money(heldTotal) + '</strong></div></div>' +
            '<div class="rh-deposit-tabs" role="tablist" aria-label="Lọc trạng thái đặt cọc">' + tabs.map(function (entry) { return '<button type="button" class="rh-deposit-tab' + (state.status === entry[0] ? ' active' : '') + '" data-deposit-status="' + entry[0] + '">' + entry[1] + '<b>' + counts[entry[0]] + '</b></button>'; }).join('') + '</div>' +
            '<div class="rh-deposit-filters"><div><label for="depositSearch">Tìm khách, mã cọc, căn hộ</label><input id="depositSearch" type="search" placeholder="Nhập từ khóa" value="' + esc(state.search) + '"></div>' +
            '<div><label for="depositBuildingFilter">Tòa nhà</label><select id="depositBuildingFilter">' + buildingOptions + '</select></div>' +
            '<div><label for="depositApartmentFilter">Căn hộ</label><select id="depositApartmentFilter">' + apartmentOptions + '</select></div>' +
            '<div><label for="depositFromDate">Ngày cọc từ</label><input id="depositFromDate" type="date" value="' + esc(state.fromDate) + '"></div>' +
            '<div><label for="depositToDate">Đến ngày</label><input id="depositToDate" type="date" value="' + esc(state.toDate) + '"></div></div>' +
            '<div class="rh-deposit-table-wrap"><table class="rh-deposit-table"><thead><tr><th>Mã đặt cọc</th><th>Căn hộ</th><th>Khách cọc</th><th>Ngày cọc</th><th>Ngày chuyển vào</th><th>Cọc giữ / Cọc full</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="rh-deposit-empty">Chưa có đặt cọc phù hợp.</td></tr>') + '</tbody></table></div>' +
            '<button type="button" class="rh-deposit-fab" id="depositAddButton" aria-label="Thêm đặt cọc" title="Thêm đặt cọc"' + (canCreate ? '' : ' disabled') + '>+</button></section>';

        var search = document.getElementById('depositSearch');
        search.addEventListener('input', function () { state.search = this.value; renderDepositsTab({ customerId: state.customerId }); });
        document.getElementById('depositBuildingFilter').addEventListener('change', function () { state.buildingId = this.value; state.apartmentId = ''; renderDepositsTab({ customerId: state.customerId }); });
        document.getElementById('depositApartmentFilter').addEventListener('change', function () { state.apartmentId = this.value; renderDepositsTab({ customerId: state.customerId }); });
        document.getElementById('depositFromDate').addEventListener('change', function () { state.fromDate = this.value; renderDepositsTab({ customerId: state.customerId }); });
        document.getElementById('depositToDate').addEventListener('change', function () { state.toDate = this.value; renderDepositsTab({ customerId: state.customerId }); });
        tab.querySelectorAll('[data-deposit-status]').forEach(function (button) {
            button.addEventListener('click', function () { state.status = this.getAttribute('data-deposit-status'); renderDepositsTab({ customerId: state.customerId }); });
        });
        document.getElementById('depositAddButton').addEventListener('click', function () { if (canCreate) openDepositForm(null, state.customerId); });
        tab.querySelectorAll('[data-deposit-action]').forEach(function (button) {
            button.addEventListener('click', function () {
                var item = RHD.get('deposits', this.getAttribute('data-deposit-id'));
                if (!item) return;
                var action = this.getAttribute('data-deposit-action');
                if (action === 'edit') openDepositForm(item.id);
                if (action === 'delete') RHUI.confirmDelete('deposits', item.id, function () { renderDepositsTab({ customerId: state.customerId }); RHUI.renderDashboardCounts(); }, '', RHLease.deleteDeposit);
                if (action === 'cancel') openCancelForm(item);
                if (action === 'history') openHistory(item);
                if (action === 'sign') RHUI.openContractFromDeposit(item.id);
                if (action === 'contract' && RHUI.openContractForDeposit) RHUI.openContractForDeposit(item.id);
            });
        });
    }

    function apartmentAvailability(apartment, dates, excludeId) {
        return RHLease.checkDepositAvailability({
            buildingId: apartment.buildingId,
            apartmentId: apartment.id,
            leaseStartDate: dates.leaseStartDate,
            leaseEndDate: dates.leaseEndDate,
            excludeDepositId: excludeId
        });
    }

    function spaceOptions(buildingId, dates, selectedId, excludeId) {
        var apartments = util.scoped('apartments').filter(function (apartment) { return apartment.buildingId === buildingId; });
        return '<option value="">Chọn căn hộ</option>' + apartments.map(function (apartment) {
            var available = apartmentAvailability(apartment, dates, excludeId);
            return '<option value="' + esc(apartment.id) + '"' + (selectedId === apartment.id ? ' selected' : '') + (!available.ok && selectedId !== apartment.id ? ' disabled' : '') + '>' + esc(apartment.name) + (!available.ok ? ' · Đang giữ/đã có lịch' : '') + '</option>';
        }).join('');
    }

    function valueInput(id, label, value, type, required, full) {
        return '<div class="rh-deposit-field' + (full ? ' full' : '') + '"><label for="' + id + '">' + label + (required ? ' *' : '') + '</label><input id="' + id + '" type="' + (type || 'text') + '"' + (required ? ' required' : '') + ' value="' + esc(value) + '"><small data-field-error="' + id + '"></small></div>';
    }

    function amountInput(id, label, value, required) {
        return '<div class="rh-deposit-field"><label for="' + id + '">' + label + (required ? ' *' : '') + '</label><div class="rh-deposit-inline"><input id="' + id + '" type="text" inputmode="numeric" data-money-input value="' + esc(formatAmount(value)) + '"' + (required ? ' required' : '') + '><span class="rh-deposit-currency">đ</span></div><small data-field-error="' + id + '"></small></div>';
    }

    function customerOptionList(selected) {
        return util.scoped('customers').map(function (customer) {
            return '<option value="' + esc(customer.id) + '"' + (selected.indexOf(customer.id) !== -1 ? ' selected' : '') + '>' + esc(customer.fullName || customer.name) + ' · ' + esc(customer.phone || 'Chưa có SĐT') + '</option>';
        }).join('');
    }

    function serviceRows(services, selectedIds, customerIds) {
        var vehicleCount = customerIds.reduce(function (sum, id) {
            var customer = RHD.get('customers', id);
            return sum + (customer && Array.isArray(customer.vehicles) ? customer.vehicles.length : 0);
        }, 0);
        return services.filter(function (service) { return service.feeType !== 'rent' && service.feeType !== 'deposit'; }).map(function (service, index) {
            var isParking = service.feeType === 'parking';
            var fee = (RHD.FEE_TYPES || []).filter(function (item) { return item.id === service.feeType; })[0];
            var quantity = isParking ? vehicleCount : Number(service.quantity) || 1;
            return '<div class="rh-deposit-service"><input type="checkbox" data-deposit-service="' + esc(service.id) + '"' + (selectedIds.indexOf(service.id) !== -1 ? ' checked' : '') + ' aria-label="Chọn ' + esc(service.name) + '"><span><strong>' + esc(service.name || 'Dịch vụ') + '</strong><small style="display:block;color:#718096;">' + esc(fee ? fee.label : 'Phí dịch vụ') + (isParking ? ' · ' + vehicleCount + ' xe' : '') + '</small></span><input type="text" inputmode="numeric" data-money-input data-service-price="' + esc(service.id) + '" value="' + esc(formatAmount(service.unitPrice || 0)) + '" aria-label="Đơn giá ' + esc(service.name) + '"><input class="rh-deposit-quantity" type="number" min="0" data-service-quantity="' + esc(service.id) + '" value="' + esc(quantity) + '" aria-label="Số lượng ' + esc(service.name) + '"></div>';
        }).join('') || '<p style="color:#718096;font-size:.82rem;">Tòa nhà chưa có dịch vụ áp dụng.</p>';
    }

    function apartmentParts(apartment, roomId, bedId) {
        var rooms = apartment && Array.isArray(apartment.rooms) ? apartment.rooms : [];
        var beds = apartment && Array.isArray(apartment.beds) ? apartment.beds : [];
        var roomOptions = '<option value="">' + (rooms.length ? 'Chọn phòng' : 'Không chia phòng riêng') + '</option>' + rooms.map(function (room) {
            var id = typeof room === 'string' ? room : room.id || room.name;
            var label = typeof room === 'string' ? room : room.name || room.code || room.id;
            return '<option value="' + esc(id) + '"' + (roomId === id ? ' selected' : '') + '>' + esc(label) + '</option>';
        }).join('');
        var availableBeds = beds.filter(function (bed) { return !roomId || typeof bed === 'string' || !bed.roomId || bed.roomId === roomId; });
        var bedOptions = '<option value="">' + (availableBeds.length ? 'Chọn giường' : 'Không chia giường riêng') + '</option>' + availableBeds.map(function (bed) {
            var id = typeof bed === 'string' ? bed : bed.id || bed.name;
            var label = typeof bed === 'string' ? bed : bed.name || bed.code || bed.id;
            return '<option value="' + esc(id) + '"' + (bedId === id ? ' selected' : '') + '>' + esc(label) + '</option>';
        }).join('');
        return { roomOptions: roomOptions, bedOptions: bedOptions };
    }

    function openDepositForm(id, customerId) {
        if (!util.guard(id ? 'customers.update' : 'customers.create')) return;
        var existing = id ? RHD.get('deposits', id) : null;
        if (id && (!existing || existing.status !== 'holding')) return;
        var buildings = util.scoped('buildings');
        var customers = util.scoped('customers');
        var selectedTenants = existing ? customerIds(existing).slice() : (customerId ? [customerId] : []);
        var selectedBuildingId = existing ? existing.buildingId : buildings[0] && buildings[0].id || '';
        var building = RHD.get('buildings', selectedBuildingId);
        var apartment = existing ? apartmentFor(existing) : null;
        var startDate = existing ? existing.leaseStartDate : today();
        var endDate = existing ? existing.leaseEndDate : RHLease.defaultEndDate(startDate, 12);
        var dates = { leaseStartDate: startDate, leaseEndDate: endDate };
        var roomBed = apartmentParts(apartment, existing && existing.roomId, existing && existing.bedId);
        var services = existing ? existing.services || [] : (building && building.services || []).filter(function (service) { return service.feeType !== 'rent' && service.feeType !== 'deposit'; });
        var selectedServices = existing ? services.map(function (service) { return service.id; }) : services.map(function (service) { return service.id; });
        var fullAmount = existing ? existing.depositFullAmount : RHLease.calculateDepositFull(apartment && apartment.rentPrice, 1);
        var html = '<form id="depositForm" class="rh-deposit-form" novalidate>' +
            '<section class="rh-deposit-section"><h4>Thông tin chung</h4><div class="rh-deposit-grid">' +
            '<div class="rh-deposit-field"><label for="dpReferrer">Người giới thiệu</label><select id="dpReferrer"><option value="">Chọn tài khoản (không bắt buộc)</option>' + ((global.RH && global.RH.getUsers ? global.RH.getUsers() : []).map(function (user) { return '<option value="' + esc(user.id) + '"' + (existing && existing.referrerUserId === user.id ? ' selected' : '') + '>' + esc(user.name + ' · ' + user.email) + '</option>'; }).join('')) + '</select><small data-field-error="referrerUserId"></small></div>' +
            '<div class="rh-deposit-field"><label for="dpReferrerName">Người giới thiệu khác</label><input id="dpReferrerName" value="' + esc(existing && existing.referrerName || '') + '" placeholder="Nhập tên nếu không có tài khoản"><small></small></div>' +
            '<div class="rh-deposit-field"><label for="dpBuilding">Tòa nhà *</label><select id="dpBuilding" required>' + buildings.map(function (item) { return '<option value="' + esc(item.id) + '"' + (item.id === selectedBuildingId ? ' selected' : '') + '>' + esc(item.shortName || item.name) + '</option>'; }).join('') + '</select><small data-field-error="buildingId"></small></div>' +
            '<div class="rh-deposit-field"><label for="dpApartment">Căn hộ *</label><select id="dpApartment" required>' + spaceOptions(selectedBuildingId, dates, existing && existing.apartmentId || apartment && apartment.id || '', id) + '</select><small data-field-error="apartmentId"></small></div>' +
            '<div class="rh-deposit-field"><label for="dpRoom">Phòng</label><select id="dpRoom">' + roomBed.roomOptions + '</select><small></small></div>' +
            '<div class="rh-deposit-field"><label for="dpBed">Giường</label><select id="dpBed">' + roomBed.bedOptions + '</select><small></small></div>' +
            '</div></section>' +
            '<section class="rh-deposit-section"><h4>Khách cọc</h4><div class="rh-deposit-grid">' +
            '<div class="rh-deposit-field full"><label for="dpTenants">Khách cọc *</label><select id="dpTenants" multiple required size="4">' + customerOptionList(selectedTenants) + '</select><small data-field-error="tenantIds">Có thể chọn nhiều khách.</small></div>' +
            '<div class="rh-deposit-field"><label for="dpOccupants">Số người đăng ký ở *</label><input id="dpOccupants" type="number" min="1" required value="' + esc(existing && existing.occupantCount || 1) + '"><small></small></div>' +
            '<div class="rh-deposit-field"><label for="dpCustomerType">Loại khách thêm nhanh</label><select id="dpCustomerType"><option value="Cá nhân">Cá nhân</option><option value="Công ty">Tổ chức</option></select><small></small></div>' +
            '<div class="rh-deposit-field"><label for="dpQuickName">Tên khách thêm nhanh</label><input id="dpQuickName" placeholder="Họ tên / tên tổ chức"><small></small></div>' +
            '<div class="rh-deposit-field"><label for="dpQuickPhone">Số điện thoại</label><input id="dpQuickPhone" inputmode="tel" placeholder="Số điện thoại"><small></small></div>' +
            '<div class="rh-deposit-field full"><button type="button" class="btn-secondary" id="dpAddCustomer">Thêm khách vào hồ sơ</button></div>' +
            '</div></section>' +
            '<section class="rh-deposit-section"><h4>Tài chính & hợp đồng</h4><div class="rh-deposit-grid">' +
            amountInput('dpRent', 'Tiền thuê', existing && existing.rentPrice || apartment && apartment.rentPrice || '', true) +
            '<div class="rh-deposit-field"><label for="dpMonths">Số tháng cọc *</label><input id="dpMonths" type="number" min="1" step="1" required value="' + esc(existing && existing.depositMonths || 1) + '"><small></small></div>' +
            amountInput('dpFull', 'Cọc full', fullAmount, true) + amountInput('dpReceived', 'Cọc giữ thực tế', existing && existing.depositReceivedAmount || '', true) +
            '<div class="rh-deposit-field"><label for="dpDiscountMonths">Số tháng giảm</label><input id="dpDiscountMonths" type="number" min="0" step="1" value="' + esc(existing && existing.discountMonths || 0) + '"><small></small></div>' +
            amountInput('dpDiscountAmount', 'Số tiền giảm mỗi tháng', existing && existing.discountAmountPerMonth || '', false) +
            '<div class="rh-deposit-field full"><label for="dpTemplate">Mẫu hợp đồng cọc</label><select id="dpTemplate"><option value="">Chọn mẫu</option>' + (global.RHT ? global.RHT.list('CONTRACT').map(function (item) { return '<option value="' + esc(item.id) + '"' + (existing && existing.depositTemplateId === item.id ? ' selected' : '') + '>' + esc(item.name) + '</option>'; }).join('') : '') + '</select><small></small></div>' +
            '</div></section>' +
            '<section class="rh-deposit-section"><h4>Mốc thời gian</h4><div class="rh-deposit-grid">' +
            valueInput('dpDepositDate', 'Ngày đặt cọc', existing && existing.depositDate || today(), 'date', true, false) +
            valueInput('dpMoveIn', 'Ngày chuyển vào', existing && existing.moveInDate || startDate, 'date', true, false) +
            valueInput('dpRentStart', 'Ngày bắt đầu tính tiền', existing && existing.rentStartDate || startDate, 'date', true, false) +
            valueInput('dpLeaseStart', 'Thời hạn thuê từ', startDate, 'date', true, false) +
            valueInput('dpLeaseEnd', 'Thời hạn thuê đến', endDate, 'date', true, false) +
            '<div class="rh-deposit-field"><label for="dpCycle">Chu kỳ thanh toán</label><select id="dpCycle">' + RHD.PAYMENT_CYCLES.map(function (cycle) { return '<option value="' + esc(cycle.id) + '"' + ((existing && existing.paymentCycle || 'monthly') === cycle.id ? ' selected' : '') + '>' + esc(cycle.label) + '</option>'; }).join('') + '</select><small></small></div>' +
            '</div></section>' +
            '<section class="rh-deposit-section"><h4>Tài khoản nhận tiền & dịch vụ</h4><div class="rh-deposit-grid">' +
            '<div class="rh-deposit-field full"><label for="dpAccount">Tài khoản nhận tiền</label><input id="dpAccount" list="dpAccountList" value="' + esc(existing && existing.receivingAccount || building && building.config && [building.config.bankName, building.config.bankAccountNumber, building.config.bankAccountHolder].filter(Boolean).join(' · ') || '') + '" placeholder="Tiền mặt hoặc tên ngân hàng"><datalist id="dpAccountList"><option value="Tiền mặt">' + buildings.map(function (item) { var cfg = item.config || {}; return cfg.bankName || cfg.bankAccountNumber ? '<option value="' + esc([cfg.bankName, cfg.bankAccountNumber, cfg.bankAccountHolder].filter(Boolean).join(' · ')) + '">' : ''; }).join('') + '</datalist><small></small></div>' +
            '<div class="rh-deposit-field full"><div style="display:flex;align-items:center;justify-content:space-between;gap:.7rem;"><label>Dịch vụ áp dụng</label><button type="button" class="btn-secondary" id="dpAddService">Thêm dịch vụ</button></div><div class="rh-deposit-service-list" id="dpServices">' + serviceRows(services, selectedServices, selectedTenants) + '</div></div>' +
            '</div></section>' +
            '<div class="rh-deposit-form-error" id="dpFormError" role="alert"></div>' +
            '<div style="display:flex;justify-content:flex-end;gap:.6rem;"><button type="button" class="btn-secondary" onclick="RHUI.closeDrawer()">Hủy</button><button type="submit" class="btn-primary">' + (existing ? 'Lưu thay đổi' : 'Lưu đặt cọc') + '</button></div></form>';

        RHUI.drawerEntity = 'deposits';
        RHUI.drawerId = existing ? existing.id : null;
        RHUI.openDrawer(existing ? 'Sửa đặt cọc ' + existing.code : 'Thêm đặt cọc', html, { width: 760 });
        var form = document.getElementById('depositForm');
        var fullWasEdited = false;
        form.addEventListener('input', function (event) {
            var input = event.target;
            if (!input.matches('[data-money-input]')) return;
            var cursorAtEnd = input.selectionStart === input.value.length;
            input.value = formatAmount(rawAmount(input.value));
            if (input.id === 'dpFull') fullWasEdited = true;
            if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
        });
        function updateFullAmount() {
            if (!fullWasEdited) document.getElementById('dpFull').value = formatAmount(RHLease.calculateDepositFull(rawAmount(document.getElementById('dpRent').value), document.getElementById('dpMonths').value));
        }
        function updateRooms() {
            var selectedApartment = RHD.get('apartments', document.getElementById('dpApartment').value);
            var parts = apartmentParts(selectedApartment, '', '');
            document.getElementById('dpRoom').innerHTML = parts.roomOptions;
            document.getElementById('dpBed').innerHTML = parts.bedOptions;
        }
        function updateServices() {
            var selectedBuilding = RHD.get('buildings', document.getElementById('dpBuilding').value);
            services = (selectedBuilding && selectedBuilding.services || []).filter(function (service) { return service.feeType !== 'rent' && service.feeType !== 'deposit'; });
            selectedServices = services.map(function (service) { return service.id; });
            document.getElementById('dpServices').innerHTML = serviceRows(services, selectedServices, selectedTenantValues());
        }
        function selectedTenantValues() {
            return Array.from(document.getElementById('dpTenants').selectedOptions).map(function (option) { return option.value; });
        }
        document.getElementById('dpBuilding').addEventListener('change', function () {
            document.getElementById('dpApartment').innerHTML = spaceOptions(this.value, dates, '', existing && existing.id);
            updateServices();
            updateRooms();
            var selectedBuilding = RHD.get('buildings', this.value);
            var defaultApartment = RHD.get('apartments', document.getElementById('dpApartment').value);
            document.getElementById('dpRent').value = formatAmount(defaultApartment && defaultApartment.rentPrice);
            fullWasEdited = false;
            updateFullAmount();
            if (selectedBuilding && selectedBuilding.contractTemplateId && global.RHT) document.getElementById('dpTemplate').value = selectedBuilding.contractTemplateId;
        });
        document.getElementById('dpApartment').addEventListener('change', function () {
            var selectedApartment = RHD.get('apartments', this.value);
            document.getElementById('dpRent').value = formatAmount(selectedApartment && selectedApartment.rentPrice);
            fullWasEdited = false;
            updateFullAmount();
            updateRooms();
        });
        document.getElementById('dpRent').addEventListener('input', updateFullAmount);
        document.getElementById('dpMonths').addEventListener('input', updateFullAmount);
        document.getElementById('dpLeaseStart').addEventListener('change', function () {
            dates.leaseStartDate = this.value;
            if (!existing) document.getElementById('dpLeaseEnd').value = RHLease.defaultEndDate(this.value, 12);
            dates.leaseEndDate = document.getElementById('dpLeaseEnd').value;
            document.getElementById('dpApartment').innerHTML = spaceOptions(document.getElementById('dpBuilding').value, dates, document.getElementById('dpApartment').value, existing && existing.id);
        });
        document.getElementById('dpLeaseEnd').addEventListener('change', function () {
            dates.leaseEndDate = this.value;
            document.getElementById('dpApartment').innerHTML = spaceOptions(document.getElementById('dpBuilding').value, dates, document.getElementById('dpApartment').value, existing && existing.id);
        });
        document.getElementById('dpTenants').addEventListener('change', function () { updateServices(); });
        document.getElementById('dpAddCustomer').addEventListener('click', function () {
            if (!util.guard('customers.create')) return;
            var name = document.getElementById('dpQuickName').value.trim();
            var phone = document.getElementById('dpQuickPhone').value.trim();
            if (!name || !phone) { document.getElementById('dpFormError').textContent = 'Nhập tên và số điện thoại khách mới.'; return; }
            var created = RHD.create('customers', { fullName: name, name: name, phone: phone, customerType: document.getElementById('dpCustomerType').value, vehicles: [] });
            if (!created.ok) { document.getElementById('dpFormError').textContent = created.error; return; }
            var option = document.createElement('option');
            option.value = created.item.id;
            option.textContent = name + ' · ' + phone;
            option.selected = true;
            document.getElementById('dpTenants').appendChild(option);
            document.getElementById('dpQuickName').value = '';
            document.getElementById('dpQuickPhone').value = '';
            document.getElementById('dpFormError').textContent = '';
            updateServices();
        });
        document.getElementById('dpAddService').addEventListener('click', function () {
            services.push({ id: 'deposit-service-' + Date.now(), name: 'Dịch vụ mới', feeType: 'service', calcMethod: 'fixed', unitPrice: 0, taxRate: 0 });
            document.getElementById('dpServices').innerHTML = serviceRows(services, selectedServices.concat(services[services.length - 1].id), selectedTenantValues());
        });
        form.addEventListener('submit', function (event) { saveDeposit(event, existing, services, selectedTenantValues()); });
    }

    function saveDeposit(event, existing, services, tenantIds) {
        event.preventDefault();
        var form = document.getElementById('depositForm');
        var data = {
            buildingId: form.querySelector('#dpBuilding').value,
            apartmentId: form.querySelector('#dpApartment').value,
            roomId: form.querySelector('#dpRoom').value,
            bedId: form.querySelector('#dpBed').value,
            tenantIds: tenantIds,
            customerId: tenantIds[0] || '',
            occupantCount: Number(form.querySelector('#dpOccupants').value),
            referrerUserId: form.querySelector('#dpReferrer').value,
            referrerName: form.querySelector('#dpReferrerName').value.trim(),
            rentPrice: rawAmount(form.querySelector('#dpRent').value),
            depositMonths: Number(form.querySelector('#dpMonths').value),
            depositFullAmount: rawAmount(form.querySelector('#dpFull').value),
            depositReceivedAmount: rawAmount(form.querySelector('#dpReceived').value),
            discountMonths: Number(form.querySelector('#dpDiscountMonths').value) || 0,
            discountAmountPerMonth: rawAmount(form.querySelector('#dpDiscountAmount').value),
            depositTemplateId: form.querySelector('#dpTemplate').value,
            depositDate: form.querySelector('#dpDepositDate').value,
            moveInDate: form.querySelector('#dpMoveIn').value,
            rentStartDate: form.querySelector('#dpRentStart').value,
            leaseStartDate: form.querySelector('#dpLeaseStart').value,
            leaseEndDate: form.querySelector('#dpLeaseEnd').value,
            paymentCycle: form.querySelector('#dpCycle').value,
            receivingAccount: form.querySelector('#dpAccount').value.trim(),
            services: Array.from(form.querySelectorAll('[data-deposit-service]:checked')).map(function (checkbox) {
                var service = services.filter(function (item) { return item.id === checkbox.getAttribute('data-deposit-service'); })[0];
                if (!service) return null;
                return Object.assign({}, service, {
                    unitPrice: rawAmount(form.querySelector('[data-service-price="' + service.id + '"]').value),
                    quantity: Number(form.querySelector('[data-service-quantity="' + service.id + '"]').value) || 0
                });
            }).filter(Boolean)
        };
        var result = existing ? RHLease.updateDeposit(existing.id, data, actor()) : RHLease.createDeposit(data, actor());
        form.querySelectorAll('[aria-invalid="true"]').forEach(function (field) { field.removeAttribute('aria-invalid'); });
        form.querySelectorAll('[data-field-error]').forEach(function (error) { error.textContent = ''; });
        if (!result.ok) {
            Object.keys(result.fieldErrors || {}).forEach(function (fieldName) {
                var field = ({ tenantIds: 'dpTenants', buildingId: 'dpBuilding', apartmentId: 'dpApartment', depositDate: 'dpDepositDate', moveInDate: 'dpMoveIn', rentStartDate: 'dpRentStart', leaseStartDate: 'dpLeaseStart', leaseEndDate: 'dpLeaseEnd', depositReceivedAmount: 'dpReceived', depositMonths: 'dpMonths', rentPrice: 'dpRent', depositFullAmount: 'dpFull', referrerUserId: 'dpReferrer' })[fieldName];
                var input = field && form.querySelector('#' + field);
                var message = result.fieldErrors[fieldName];
                var error = form.querySelector('[data-field-error="' + (field || fieldName) + '"]');
                if (input) input.setAttribute('aria-invalid', 'true');
                if (error) error.textContent = message;
            });
            form.querySelector('#dpFormError').textContent = result.error || 'Không thể lưu đặt cọc.';
            return;
        }
        RHUI.closeDrawer();
        RHUI.drawerEntity = null;
        RHUI.drawerId = null;
        renderDepositsTab({ customerId: state.customerId });
        RHUI.renderApartmentsTab();
        RHUI.renderDashboardCounts();
    }

    function openCancelForm(deposit) {
        if (!util.guard('customers.update')) return;
        var received = Number(deposit.depositReceivedAmount) || 0;
        var html = '<form id="depositCancelForm" class="rh-deposit-form"><section class="rh-deposit-section"><h4>Hủy đặt cọc ' + esc(deposit.code) + '</h4><div class="rh-deposit-grid">' +
            amountInput('dcRefund', 'Số tiền hoàn', received, true) + amountInput('dcDeduction', 'Số tiền khấu trừ', 0, false) +
            '<div class="rh-deposit-field full"><label for="dcReason">Lý do hủy *</label><input id="dcReason" required><small data-field-error="reason"></small></div>' +
            '<div class="rh-deposit-field full"><label for="dcNote">Ghi chú</label><textarea id="dcNote" rows="3"></textarea></div></div></section>' +
            '<div id="dcError" class="rh-deposit-form-error" role="alert"></div><div style="display:flex;justify-content:flex-end;gap:.6rem;"><button type="button" class="btn-secondary" onclick="RHUI.closeDrawer()">Đóng</button><button type="submit" class="btn-primary">Xác nhận hủy</button></div></form>';
        RHUI.openDrawer('Hủy đặt cọc', html, { width: 620 });
        var form = document.getElementById('depositCancelForm');
        form.querySelectorAll('[data-money-input]').forEach(function (input) { input.addEventListener('input', function () {
            var value = rawAmount(input.value);
            if (input.id === 'dcRefund') value = Math.min(received, value);
            input.value = formatAmount(value);
        }); });
        form.querySelector('#dcRefund').addEventListener('input', function () {
            form.querySelector('#dcDeduction').value = formatAmount(Math.max(0, received - rawAmount(this.value)));
        });
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var result = RHLease.cancelDeposit(deposit.id, { refundAmount: rawAmount(form.querySelector('#dcRefund').value), reason: form.querySelector('#dcReason').value, note: form.querySelector('#dcNote').value }, actor());
            if (!result.ok) { form.querySelector('#dcError').textContent = result.error; return; }
            RHUI.closeDrawer();
            renderDepositsTab({ customerId: state.customerId });
            RHUI.renderDashboardCounts();
        });
    }

    function openHistory(deposit) {
        var rows = transactionFor(deposit, 'history').map(function (item) {
            return '<div style="border-left:2px solid #b8ddff;padding:0 0 .9rem .85rem;margin-left:.35rem;"><strong style="color:#10213c;">' + esc(item.label || item.type) + ' · ' + money(item.amount) + '</strong><div style="color:#718096;font-size:.78rem;margin-top:.2rem;">' + formatDate(item.date) + (item.actorName ? ' · ' + esc(item.actorName) : '') + '</div>' + (item.note ? '<p style="color:#475569;font-size:.82rem;margin:.25rem 0 0;">' + esc(item.note) + '</p>' : '') + '</div>';
        }).join('') || '<p style="color:#718096;">Chưa có giao dịch cọc.</p>';
        RHUI.openDrawer('Lịch sử giao dịch · ' + deposit.code, '<div style="padding:.4rem 0;">' + rows + '</div>', { width: 560 });
    }

    function notifyDepositStage(message) {
        var toast = document.createElement('div');
        toast.setAttribute('role', 'status');
        toast.style.cssText = 'position:fixed;right:1.25rem;top:1.25rem;z-index:11000;max-width:min(420px,calc(100vw - 2rem));padding:.85rem 1rem;border-radius:10px;background:#10213c;color:#fff;box-shadow:0 12px 32px rgba(16,33,60,.22);font-size:.84rem;line-height:1.5;';
        toast.textContent = message;
        document.body.appendChild(toast);
        global.setTimeout(function () { toast.remove(); }, 4500);
    }

    RHUI.renderDepositsTab = renderDepositsTab;
    RHUI.openDepositForCustomer = function (customerId) {
        if (!util.guard('customers.create')) return;
        var holding = customerId && RHLease.listDeposits().filter(function (deposit) {
            return deposit.status === 'holding' && customerIds(deposit).indexOf(customerId) !== -1;
        }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })[0];
        if (holding) {
            openDepositForm(holding.id);
            return;
        }
        var contracted = customerId && RHLease.listDeposits().filter(function (deposit) {
            return deposit.status === 'contracted' && customerIds(deposit).indexOf(customerId) !== -1;
        }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })[0];
        if (contracted) {
            global.switchTab('deposits', null, { customerId: customerId });
            if (RHUI.openDepositRecord) RHUI.openDepositRecord(contracted.id);
            return;
        }
        if (customerId) {
            global.switchTab('deposits', null, { customerId: customerId });
            openDepositForm(null, customerId);
            return;
        }
        global.switchTab('deposits');
        openDepositForm(null);
    };
    RHUI.openDepositRecord = function (depositId) {
        var deposit = RHD.get('deposits', depositId);
        if (deposit) openHistory(deposit);
    };
    RHUI.openDepositForm = openDepositForm;
    RHUI.openContractFromDeposit = function (depositId) {
        if (!util.guard('contracts.create')) return;
        var deposit = RHD.get('deposits', depositId);
        if (!deposit || deposit.status !== 'holding') { notifyDepositStage('Cọc không còn ở trạng thái chờ ký hợp đồng.'); return; }
        global.switchTab('contracts');
        global.RHUI.openContractForm(null, deposit.customerId || customerIds(deposit)[0], deposit.id);
    };
    RHUI.notifyDepositStage = notifyDepositStage;
})(window);