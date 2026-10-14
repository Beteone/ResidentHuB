/* ResidentHub - contract workflow UI. Business rules remain in RHLease/RHB. */
(function (global) {
    var RHD = global.RHD;
    var RHLease = global.RHLease;
    var RHUI = global.RHUI;
    var util = RHUI.util;
    var state = { status: 'all', search: '', building: '' };
    var labels = {
        renting: 'Đang thuê', expiring: 'Sắp hết hạn', overdue: 'Quá hạn', moving: 'Sắp chuyển đi',
        liquidated: 'Đã thanh lý', deposit: 'Bỏ cọc'
    };
    var colors = {
        renting: ['#16875d', '#e7f7ef'], expiring: ['#a96a00', '#fff4d8'], overdue: ['#c33e3e', '#ffeded'],
        moving: ['#3866d9', '#edf2ff'], liquidated: ['#68717f', '#f0f1f3'], deposit: ['#8a5e15', '#fff4d8']
    };

    function esc(value) { return util.escapeHtml(value == null ? '' : value); }
    function money(value) { return (Number(value) || 0).toLocaleString('vi-VN') + 'đ'; }
    function fmtDate(value) { return util.fmtDate(value); }
    function dateInputToday() {
        var date = new Date();
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    function readMoney(value) { return Number(String(value || '').replace(/\D/g, '')) || 0; }
    function formatMoney(value) { return (Number(value) || 0).toLocaleString('vi-VN'); }
    function actor() {
        var session = global.RH && global.RH.getSession ? global.RH.getSession() : null;
        return { actorId: session && session.id || '', actorName: session && session.name || '' };
    }
    function status(contract) { return RHLease.contractAlertStatus(contract, dateInputToday(), Number(RHD.getSettings().contractExpiringDays) || 30); }
    function isTerminal(contract) { var current = status(contract); return current === 'liquidated' || current === 'deposit'; }
    function allContracts() { return util.scoped('contracts').slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }); }
    function tenantIds(contract) { return contract.tenantIds || (contract.customerId ? [contract.customerId] : []); }
    function tenantNames(contract) {
        return tenantIds(contract).map(function (id) { var customer = RHD.get('customers', id); return customer && (customer.fullName || customer.name); }).filter(Boolean);
    }
    function tenantLabel(contract) {
        var names = tenantNames(contract);
        if (!names.length) return contract.customerName || '—';
        return names[0] + (names.length > 1 ? ' +' + (names.length - 1) : '');
    }
    function buildingApartment(contract) {
        var building = RHD.get('buildings', contract.buildingId);
        var apartment = RHD.get('apartments', contract.apartmentId);
        return (building && (building.shortName || building.name) || '—') + ' / ' + (apartment && (apartment.name || apartment.code) || '—');
    }
    function styleOnce() {
        if (document.getElementById('rhContractsWorkflowStyles')) return;
        var style = document.createElement('style');
        style.id = 'rhContractsWorkflowStyles';
        style.textContent = [
            '#contracts-tab{position:relative;padding-bottom:5rem;color:#172033}',
            '#contracts-tab .rh-contract-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}',
            '#contracts-tab .rh-contract-head h2{margin:0;color:#172033;font:700 1.35rem "Plus Jakarta Sans","Be Vietnam Pro",sans-serif}',
            '#contracts-tab .rh-contract-toolbar{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap}',
            '#contracts-tab .rh-contract-toolbar [data-contract-import-button]{display:inline-flex;align-items:center;gap:.45rem}',
            '#contracts-tab .rh-contract-icon-btn{width:40px;height:40px;border:1px solid #e1e7ef;background:#fff;border-radius:50%;color:#42536a;cursor:pointer}',
            '#contracts-tab .rh-contract-icon-btn:hover{background:#f2f7fc}',
            '#contracts-tab .rh-contract-search{display:none;margin:0 0 .85rem}',
            '#contracts-tab .rh-contract-search.open{display:block}',
            '#contracts-tab .rh-contract-search input,#contracts-tab .rh-contract-filter-panel select{box-sizing:border-box;width:100%;padding:.7rem .85rem;border:1px solid #dce4ee;border-radius:8px;background:#fff;font:inherit}',
            '#contracts-tab .rh-contract-search input:focus,#contracts-tab .rh-contract-filter-panel select:focus{outline:2px solid #d4e5ff;border-color:#6aa7ef}',
            '#contracts-tab .rh-contract-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-bottom:1rem}',
            '#contracts-tab .rh-contract-overview article{min-width:0;background:#fff;border:1px solid #e3eaf2;border-radius:12px;padding:.9rem 1rem;box-shadow:0 3px 12px rgba(20,43,72,.035)}',
            '#contracts-tab .rh-contract-overview small{display:block;color:#718096;font-size:.75rem;font-weight:700}',
            '#contracts-tab .rh-contract-overview strong{display:block;margin-top:.4rem;color:#10213c;font:800 1.3rem "Plus Jakarta Sans","Be Vietnam Pro",sans-serif}',
            '#contracts-tab .rh-contract-tabs{display:flex;align-items:center;gap:.5rem;overflow-x:auto;padding:.2rem 0 .8rem;margin-bottom:.6rem;scrollbar-width:thin}',
            '#contracts-tab .rh-contract-tab{display:inline-flex;align-items:center;gap:.45rem;flex:0 0 auto;border:1px solid #e1e7ef;border-radius:999px;background:#fff;color:#59687c;padding:.55rem .75rem;font:600 .8rem "Be Vietnam Pro",sans-serif;cursor:pointer;white-space:nowrap}',
            '#contracts-tab .rh-contract-tab:hover{border-color:#9bbce2;background:#f7faff}',
            '#contracts-tab .rh-contract-tab b{display:grid;place-items:center;min-width:20px;height:20px;padding:0 .25rem;border-radius:999px;background:#eef2f7;color:#59687c;font-size:.7rem}',
            '#contracts-tab .rh-contract-tab.active{border-color:#1769d2;background:#1769d2;color:#fff;box-shadow:0 4px 12px rgba(23,105,210,.18)}',
            '#contracts-tab .rh-contract-tab.active b{background:rgba(255,255,255,.2);color:#fff}',
            '#contracts-tab .rh-contract-filter-panel{display:none;grid-template-columns:minmax(200px,320px);gap:.7rem;padding:0 0 .85rem}',
            '#contracts-tab .rh-contract-filter-panel.open{display:grid}',
            '#contracts-tab .rh-contract-list{display:grid;gap:.6rem}',
            '#contracts-tab .rh-contract-row{display:grid;grid-template-columns:minmax(145px,1fr) minmax(130px,1fr) minmax(150px,1.2fr) minmax(165px,1.15fr) minmax(110px,.8fr) auto;align-items:center;gap:.75rem;padding:.9rem 1rem;border:1px solid #e5eaf1;border-radius:10px;background:#fff;box-shadow:0 3px 12px rgba(20,43,72,.035)}',
            '#contracts-tab .rh-contract-cell{min-width:0}',
            '#contracts-tab .rh-contract-cell small{display:block;margin-bottom:.25rem;color:#8794a6;font-size:.67rem;font-weight:700;letter-spacing:.025em}',
            '#contracts-tab .rh-contract-cell strong{display:block;color:#25364a;font-size:.8rem;font-weight:650;line-height:1.45;overflow-wrap:anywhere}',
            '#contracts-tab .rh-contract-origin{display:inline-block;margin-top:.3rem;padding:.18rem .35rem;border-radius:5px;background:#eff6ff;color:#1769aa;font-size:.65rem;font-weight:700}',
            '#contracts-tab .rh-contract-actions{display:flex;align-items:center;justify-content:flex-end;gap:.5rem;min-width:0}',
            '#contracts-tab .rh-contract-actions>span{white-space:nowrap}',
            '#contracts-tab .rh-contract-menu{position:relative}',
            '#contracts-tab .rh-contract-menu summary{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid #dfe5ec;border-radius:8px;color:#526275;cursor:pointer;list-style:none}',
            '#contracts-tab .rh-contract-menu summary::-webkit-details-marker{display:none}',
            '#contracts-tab .rh-contract-menu[open] summary{background:#eff6ff;border-color:#9ccaff;color:#0d65d5}',
            '#contracts-tab .rh-contract-menu-list{position:absolute;top:calc(100% + 5px);right:0;z-index:25;display:grid;min-width:205px;padding:.3rem;border:1px solid #e1e7ee;border-radius:9px;background:#fff;box-shadow:0 12px 28px rgba(15,35,60,.15)}',
            '#contracts-tab .rh-contract-menu-list button{padding:.55rem .65rem;border:0;border-radius:6px;background:#fff;color:#34465c;cursor:pointer;font:500 .78rem "Be Vietnam Pro",sans-serif;text-align:left;white-space:nowrap}',
            '#contracts-tab .rh-contract-menu-list button:hover{background:#f1f6fb}',
            '#contracts-tab .rh-contract-menu-list button.danger{color:#bd3939}',
            '#contracts-tab .rh-contract-menu [disabled]{color:#9aa5b3;cursor:not-allowed;opacity:.55}',
            '#contracts-tab .rh-contract-empty{display:grid;min-height:200px;place-content:center;text-align:center;color:#8290a3;background:#fff;border:1px dashed #dce4ed;border-radius:10px}',
            '#contracts-tab .rh-contract-empty i{margin-bottom:.65rem;font-size:2rem;opacity:.65}',
            '#contracts-tab .rh-contract-plus{position:fixed;right:2rem;bottom:1.1rem;z-index:40}',
            '#contracts-tab .rh-contract-plus>summary{display:flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:50%;background:#18a878;color:#fff;box-shadow:0 10px 20px rgba(24,168,120,.22);cursor:pointer;font-size:1.8rem;list-style:none}',
            '#contracts-tab .rh-contract-plus>summary::-webkit-details-marker{display:none}',
            '#contracts-tab .rh-contract-plus[open] .rh-contract-plus-menu{display:grid}',
            '#contracts-tab .rh-contract-plus-menu{position:absolute;right:0;bottom:68px;display:none;min-width:220px;padding:.35rem;border:1px solid #e3eaf2;border-radius:9px;background:#fff;box-shadow:0 12px 28px rgba(15,35,60,.15)}',
            '#contracts-tab .rh-contract-plus-menu button{padding:.65rem;border:0;border-radius:6px;background:#fff;color:#34465c;cursor:pointer;font:600 .8rem "Be Vietnam Pro",sans-serif;text-align:left}',
            '#contracts-tab .rh-contract-plus-menu button:hover{background:#eff6ff}',
            '#rhDrawerBody .rh-contract-form,#rhDrawerBody .rh-contract-operation-form{display:grid;gap:1rem;color:#26364b}',
            '#rhDrawerBody .rh-contract-form-section,#rhDrawerBody .rh-settlement-wizard>section{min-width:0;padding:1rem;border:1px solid #e5eaf1;border-radius:11px;background:#fff}',
            '#rhDrawerBody .rh-contract-form-section h4,#rhDrawerBody .rh-settlement-wizard h4{margin:0 0 .9rem;color:#183453;font-size:.95rem;font-weight:700}',
            '#rhDrawerBody .rh-contract-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}',
            '#rhDrawerBody .rh-contract-field{display:grid;align-content:start;gap:.32rem;min-width:0}',
            '#rhDrawerBody .rh-contract-field.full{grid-column:1/-1}',
            '#rhDrawerBody .rh-contract-field label{color:#536276;font-size:.76rem;font-weight:650;line-height:1.4}',
            '#rhDrawerBody .rh-contract-field input:not([type=checkbox]):not([type=file]),#rhDrawerBody .rh-contract-field select,#rhDrawerBody .rh-contract-field textarea,#rhDrawerBody .rh-contract-operation-form input:not([type=checkbox]),#rhDrawerBody .rh-contract-operation-form select,#rhDrawerBody .rh-contract-operation-form textarea{box-sizing:border-box;width:100%;min-width:0;min-height:40px;padding:.58rem .68rem;border:1px solid #d8e0ea;border-radius:8px;background:#fff;color:#24364d;font:400 .82rem "Be Vietnam Pro",sans-serif}',
            '#rhDrawerBody .rh-contract-field textarea{resize:vertical}',
            '#rhDrawerBody .rh-contract-field input[type=file]{box-sizing:border-box;width:100%;padding:.65rem;border:1px dashed #b9c7d7;border-radius:8px;background:#f8fafc;color:#536276;font-size:.78rem}',
            '#rhDrawerBody .rh-contract-field select[multiple]{min-height:112px}',
            '#rhDrawerBody .rh-contract-field input:focus,#rhDrawerBody .rh-contract-field select:focus,#rhDrawerBody .rh-contract-field textarea:focus,#rhDrawerBody .rh-contract-operation-form input:focus,#rhDrawerBody .rh-contract-operation-form select:focus{outline:2px solid #d8eaff;border-color:#70a8e5}',
            '#rhDrawerBody .rh-contract-field input[readonly],#rhDrawerBody .rh-contract-field input:disabled,#rhDrawerBody .rh-contract-field select:disabled{background:#f3f6f9;color:#68788c}',
            '#rhDrawerBody .rh-contract-field-error{display:block;min-height:.1rem;margin-top:.25rem;color:#bd3939;font-size:.74rem;line-height:1.45}',
            '#rhDrawerBody [aria-invalid=true]{border-color:#dc4b4b!important}',
            '#rhDrawerBody .rh-customer-preview{padding:.75rem .9rem;border:1px solid #dce9f8;border-radius:8px;background:#f3f8ff;color:#4b6078;font-size:.8rem}',
            '#rhDrawerBody .rh-contract-service-list{display:grid;gap:.45rem}',
            '#rhDrawerBody .rh-contract-service-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(100px,150px) auto;align-items:center;gap:.55rem;padding:.55rem .65rem;border:1px solid #e6ebf1;border-radius:8px;background:#fbfcfe}',
            '#rhDrawerBody .rh-contract-service-row label{display:flex;align-items:center;gap:.4rem;color:#43536a;font-size:.78rem}',
            '#rhDrawerBody .rh-contract-service-row input[type=text]{box-sizing:border-box;width:100%;min-width:0;padding:.45rem .55rem;border:1px solid #dce3eb;border-radius:7px}',
            '#rhDrawerBody .rh-contract-meter-row{display:grid;grid-template-columns:minmax(120px,1fr) minmax(100px,1fr) minmax(130px,1fr);align-items:center;gap:.65rem;margin:.5rem 0;padding:.7rem;border:1px solid #e3eaf2;border-radius:8px;background:#f8fafc}',
            '#rhDrawerBody .rh-contract-meter-row input,#rhDrawerBody .rh-contract-meter-row select{box-sizing:border-box;width:100%;min-width:0;padding:.5rem;border:1px solid #dce3eb;border-radius:7px}',
            '#rhDrawerBody .rh-contract-form button,#rhDrawerBody .rh-contract-operation-form button,#rhDrawerBody .rh-settlement-wizard button{font-family:"Be Vietnam Pro",sans-serif}',
            '#rhDrawerBody .rh-settlement-wizard{display:grid;gap:.85rem}',
            '#rhDrawerBody .rh-settlement-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.4rem}',
            '#rhDrawerBody .rh-settlement-steps button{padding:.55rem .35rem;border:1px solid #dce4ed;border-radius:8px;background:#f7f9fc;color:#627187;font-size:.72rem}',
            '#rhDrawerBody .rh-settlement-steps button.active{border-color:#1769d2;background:#edf5ff;color:#1559a6}',
            '#rhDrawerBody .rh-settlement-footer{display:flex;justify-content:flex-end;gap:.55rem;flex-wrap:wrap}',
            '#rhDrawerBody .rh-contract-settlement-preview{margin-top:.8rem;padding:.8rem;border-radius:8px;background:#f3f8ff;color:#24364d;line-height:1.7}',
            '#rhDrawerBody .rh-contract-operation-form>div[style*="justify-content:flex-end"]{flex-wrap:wrap}',
            '@media(max-width:1000px){#contracts-tab .rh-contract-row{grid-template-columns:repeat(3,minmax(0,1fr))}#contracts-tab .rh-contract-actions{grid-column:1/-1;justify-content:flex-start}}',
            '@media(max-width:640px){#contracts-tab{padding-bottom:5.5rem}#contracts-tab .rh-contract-head{align-items:flex-start;flex-direction:column;gap:.7rem}#contracts-tab .rh-contract-head h2{font-size:1.15rem}#contracts-tab .rh-contract-overview{grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}#contracts-tab .rh-contract-overview article{padding:.75rem}#contracts-tab .rh-contract-row{grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;padding:.75rem}#contracts-tab .rh-contract-actions{grid-column:1/-1;justify-content:space-between;border-top:1px solid #edf0f4;padding-top:.55rem}#contracts-tab .rh-contract-plus{right:1rem;bottom:1rem}#rhDrawerBody{padding:1rem!important}#rhDrawerBody .rh-contract-form-grid{grid-template-columns:minmax(0,1fr)}#rhDrawerBody .rh-contract-field.full{grid-column:auto}#rhDrawerBody .rh-contract-form-section,#rhDrawerBody .rh-settlement-wizard>section{padding:.8rem}#rhDrawerBody .rh-contract-service-row{grid-template-columns:minmax(0,1fr) 92px}#rhDrawerBody .rh-contract-meter-row{grid-template-columns:minmax(0,1fr) minmax(110px,1fr)}#rhDrawerBody .rh-contract-meter-row [data-meter-index]{grid-column:1/-1}#rhDrawerBody .rh-settlement-steps{grid-template-columns:repeat(2,minmax(0,1fr))}}'
        ].join('');
        document.head.appendChild(style);
    }

    function filteredContracts(contracts) {
        var search = state.search.toLocaleLowerCase().trim();
        return contracts.filter(function (contract) {
            var key = status(contract);
            if (state.status !== 'all' && key !== state.status) return false;
            if (state.building && contract.buildingId !== state.building) return false;
            if (!search) return true;
            var customer = tenantNames(contract).join(' ');
            var apartment = RHD.get('apartments', contract.apartmentId) || {};
            var building = RHD.get('buildings', contract.buildingId) || {};
            return [contract.code, customer, apartment.name, building.name, building.shortName].join(' ').toLocaleLowerCase().indexOf(search) !== -1;
        });
    }

    function parseCsv(text) {
        var firstLine = String(text || '').split(/\r?\n/)[0] || '';
        var delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
        var rows = [], row = [], value = '', quoted = false;
        for (var index = 0; index < text.length; index++) {
            var character = text[index];
            if (character === '"' && quoted && text[index + 1] === '"') { value += '"'; index++; }
            else if (character === '"') quoted = !quoted;
            else if (character === delimiter && !quoted) { row.push(value); value = ''; }
            else if ((character === '\n' || character === '\r') && !quoted) {
                if (character === '\r' && text[index + 1] === '\n') index++;
                row.push(value); value = '';
                if (row.some(function (cell) { return String(cell).trim(); })) rows.push(row);
                row = [];
            } else value += character;
        }
        row.push(value);
        if (row.some(function (cell) { return String(cell).trim(); })) rows.push(row);
        return rows;
    }

    function normalizeHeader(value) {
        return String(value || '').replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function importContractsFile(event) {
        var file = event.target.files && event.target.files[0];
        var message = document.getElementById('contractImportError');
        if (!file) return;
        if (!util.guard('contracts.create')) { event.target.value = ''; return; }
        var isXlsx = /\.xlsx$/i.test(file.name);
        if (file.size > 25 * 1024 * 1024) {
            message.textContent = 'Tệp nhập không được lớn hơn 25 MB.';
            event.target.value = '';
            return;
        }
        if (!isXlsx && !/\.csv$/i.test(file.name)) {
            message.textContent = 'Chỉ hỗ trợ tệp Excel .xlsx hoặc CSV xuất từ Excel.';
            event.target.value = '';
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            var rowsPromise = isXlsx ? readXlsxRows(reader.result) : Promise.resolve(parseCsv(String(reader.result || '')));
            rowsPromise.then(function (rows) {
                importContractRows(rows, message);
            }).catch(function (error) {
                message.textContent = 'Không thể đọc tệp Excel: ' + error.message;
            });
        };
        reader.onerror = function () { message.textContent = 'Không thể đọc tệp đã chọn.'; };
        if (isXlsx) reader.readAsArrayBuffer(file);
        else reader.readAsText(file, 'utf-8');
        event.target.value = '';
    }

    function importContractRows(rows, message) {
        if (rows.length < 2) { message.textContent = 'Tệp chưa có dòng dữ liệu.'; return; }
        var headers = rows.shift().map(normalizeHeader);
        var find = function (keys) { return headers.findIndex(function (header) { return keys.indexOf(header) !== -1; }); };
        var columns = {
            building: find(['toanha', 'building', 'buildingname']), apartment: find(['canho', 'phong', 'unit', 'apartment']),
            customer: find(['khachhang', 'khachthue', 'tenant', 'customer']), phone: find(['sodienthoai', 'phone']),
            start: find(['ngaybatdau', 'startdate']), end: find(['ngayketthuc', 'enddate']), rent: find(['tienthue', 'rent', 'rentprice']),
            deposit: find(['tiencoc', 'deposit', 'depositprice']), code: find(['mahopdong', 'contractcode', 'code'])
        };
        if ([columns.building, columns.apartment, columns.customer, columns.start, columns.end, columns.rent].some(function (index) { return index < 0; })) {
            message.textContent = 'Thiếu cột bắt buộc: Tòa nhà, Căn hộ, Khách hàng, Ngày bắt đầu, Ngày kết thúc, Tiền thuê.';
            return;
        }
        var imported = 0, errors = [];
        rows.forEach(function (cells, offset) {
            var cell = function (column) { return column < 0 ? '' : String(cells[column] == null ? '' : cells[column]).trim(); };
            var buildingKey = cell(columns.building).toLowerCase();
            var building = util.scoped('buildings').filter(function (item) { return [item.name, item.shortName, item.code].some(function (name) { return String(name || '').toLowerCase() === buildingKey; }); })[0];
            var apartmentKey = cell(columns.apartment).toLowerCase();
            var apartment = util.scoped('apartments').filter(function (item) { return item.buildingId === (building && building.id) && String(item.name || item.code || '').toLowerCase() === apartmentKey; })[0];
            var customerKey = cell(columns.customer).toLowerCase(), phone = cell(columns.phone);
            var customer = util.scoped('customers').filter(function (item) { return phone && item.phone === phone || String(item.fullName || item.name || '').toLowerCase() === customerKey; })[0];
            if (!building || !apartment || !customer) { errors.push('Dòng ' + (offset + 2) + ': không khớp tòa nhà, căn hộ hoặc khách hàng.'); return; }
            var result = RHLease.saveContract({
                code: cell(columns.code), buildingId: building.id, apartmentId: apartment.id,
                customerId: customer.id, tenantIds: [customer.id], startDate: importDate(cell(columns.start)), endDate: importDate(cell(columns.end)),
                rentPrice: readMoney(cell(columns.rent)), depositPrice: readMoney(cell(columns.deposit)) || Number(apartment.depositPrice) || Number(apartment.rentPrice) || 0,
                paymentCycle: 'monthly', invoiceTemplateId: monthlyInvoiceTemplate(building), status: 'active'
            }, null, actor());
            if (result.ok) imported++;
            else errors.push('Dòng ' + (offset + 2) + ': ' + result.error);
        });
        message.textContent = 'Đã nhập ' + imported + ' hợp đồng.' + (errors.length ? ' ' + errors.slice(0, 4).join(' ') : '');
        renderContractsTab(); RHUI.renderDashboardCounts();
    }

    async function readXlsxRows(buffer) {
        var entries = await unzipXlsx(new Uint8Array(buffer));
        var workbook = parseXml(entries['xl/workbook.xml'], 'thông tin sổ tính');
        var relationships = parseXml(entries['xl/_rels/workbook.xml.rels'], 'liên kết trang tính');
        var sheet = workbook.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'sheet')[0];
        if (!sheet) throw new Error('Không tìm thấy trang tính trong tệp.');
        var relationshipId = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sheet.getAttribute('r:id');
        var relation = Array.from(relationships.getElementsByTagNameNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship'))
            .filter(function (item) { return item.getAttribute('Id') === relationshipId; })[0];
        if (!relation) throw new Error('Không tìm thấy dữ liệu trang tính đầu tiên.');
        var sheetPath = packagePath('xl', relation.getAttribute('Target'));
        var worksheet = parseXml(entries[sheetPath], 'dữ liệu trang tính');
        var strings = [];
        if (entries['xl/sharedStrings.xml']) {
            var shared = parseXml(entries['xl/sharedStrings.xml'], 'bảng chuỗi dùng chung');
            strings = Array.from(shared.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'si')).map(function (item) {
                return Array.from(item.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 't')).map(function (text) { return text.textContent || ''; }).join('');
            });
        }
        var ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
        return Array.from(worksheet.getElementsByTagNameNS(ns, 'row')).map(function (row) {
            var cells = [];
            Array.from(row.getElementsByTagNameNS(ns, 'c')).forEach(function (cell) {
                var address = cell.getAttribute('r') || '';
                var letters = address.match(/^[A-Z]+/i);
                if (!letters) return;
                var column = letters[0].toUpperCase().split('').reduce(function (number, letter) { return number * 26 + letter.charCodeAt(0) - 64; }, 0) - 1;
                var type = cell.getAttribute('t');
                var valueNode = cell.getElementsByTagNameNS(ns, 'v')[0];
                var value = valueNode ? valueNode.textContent || '' : '';
                if (type === 's') value = strings[Number(value)] || '';
                else if (type === 'inlineStr') {
                    var inline = cell.getElementsByTagNameNS(ns, 'is')[0];
                    value = inline ? Array.from(inline.getElementsByTagNameNS(ns, 't')).map(function (text) { return text.textContent || ''; }).join('') : '';
                } else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
                cells[column] = value;
            });
            return cells.map(function (value) { return value == null ? '' : value; });
        });
    }

    async function unzipXlsx(bytes) {
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        var end = -1;
        for (var offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
            if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
        }
        if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) {
            throw new Error('Tệp không phải Excel .xlsx hợp lệ hoặc đang dùng định dạng ZIP không hỗ trợ.');
        }
        var count = view.getUint16(end + 10, true);
        var centralOffset = view.getUint32(end + 16, true);
        if (count === 0xffff || centralOffset === 0xffffffff) throw new Error('Tệp Excel ZIP64 chưa được hỗ trợ.');
        var entries = {};
        var decoder = new global.TextDecoder('utf-8');
        var expandedSize = 0;
        for (var index = 0, cursor = centralOffset; index < count; index++) {
            if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Cấu trúc tệp Excel bị lỗi.');
            var flags = view.getUint16(cursor + 8, true);
            var method = view.getUint16(cursor + 10, true);
            var compressedSize = view.getUint32(cursor + 20, true);
            var uncompressedSize = view.getUint32(cursor + 24, true);
            var nameLength = view.getUint16(cursor + 28, true);
            var extraLength = view.getUint16(cursor + 30, true);
            var commentLength = view.getUint16(cursor + 32, true);
            var localOffset = view.getUint32(cursor + 42, true);
            var name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
            cursor += 46 + nameLength + extraLength + commentLength;
            expandedSize += uncompressedSize;
            if (uncompressedSize === 0xffffffff || expandedSize > 100 * 1024 * 1024) throw new Error('Dữ liệu giải nén vượt quá giới hạn cho phép.');
            if ((flags & 1) !== 0) throw new Error('Tệp Excel được mã hóa; hãy tải lên bản không khóa mật khẩu.');
            if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Cấu trúc mục Excel bị lỗi.');
            var dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
            var compressed = bytes.subarray(dataStart, dataStart + compressedSize);
            if (method === 0) entries[name] = decoder.decode(compressed);
            else if (method === 8) {
                if (!global.DecompressionStream) throw new Error('Trình duyệt chưa hỗ trợ giải nén Excel .xlsx; hãy lưu thành CSV UTF-8.');
                var stream = new global.Blob([compressed]).stream().pipeThrough(new global.DecompressionStream('deflate-raw'));
                entries[name] = decoder.decode(await new global.Response(stream).arrayBuffer());
            } else throw new Error('Phương thức nén Excel không được hỗ trợ.');
        }
        return entries;
    }

    function parseXml(xml, description) {
        if (typeof xml !== 'string') throw new Error('Thiếu ' + description + ' trong tệp.');
        var document = new global.DOMParser().parseFromString(xml, 'application/xml');
        if (document.getElementsByTagName('parsererror').length) throw new Error('Không thể đọc ' + description + ' trong tệp.');
        return document;
    }

    function packagePath(base, target) {
        var parts = (target.charAt(0) === '/' ? target.slice(1) : base + '/' + target).split('/');
        var result = [];
        parts.forEach(function (part) {
            if (!part || part === '.') return;
            if (part === '..') result.pop();
            else result.push(part);
        });
        return result.join('/');
    }

    function importDate(value) {
        var text = String(value || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        if (/^\d{5}(\.0+)?$/.test(text)) {
            var excelDate = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86400000);
            return excelDate.getUTCFullYear() + '-' + String(excelDate.getUTCMonth() + 1).padStart(2, '0') + '-' + String(excelDate.getUTCDate()).padStart(2, '0');
        }
        var match = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
        return match ? match[3] + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[1]).padStart(2, '0') : '';
    }

    function contractActions(contract, contractStatus) {
        var terminal = contractStatus === 'liquidated' || contractStatus === 'deposit';
        var options = ['<button type="button" data-contract-action="view" data-id="' + esc(contract.id) + '">Xem</button>'];
        if (!terminal) {
            if (util.can('contracts.update')) {
                options.push('<button type="button" data-contract-action="edit" data-id="' + esc(contract.id) + '">Sửa</button>');
                options.push('<button type="button" data-contract-action="renew" data-id="' + esc(contract.id) + '">Gia hạn</button>');
                options.push('<button type="button" data-contract-action="transfer" data-id="' + esc(contract.id) + '">Chuyển phòng / giường</button>');
                options.push('<button type="button" data-contract-action="moveout" data-id="' + esc(contract.id) + '">Đăng ký ngày chuyển đi</button>');
                options.push('<button type="button" data-contract-action="assign" data-id="' + esc(contract.id) + '">Nhượng hợp đồng</button>');
                options.push('<button type="button" data-contract-action="settle" data-id="' + esc(contract.id) + '">Thanh lý</button>');
            }
            if (util.can('contracts.delete') && !RHLease.contractDeleteBlock(contract.id)) options.push('<button class="danger" type="button" data-contract-action="delete" data-id="' + esc(contract.id) + '">Xóa</button>');
        }
        return '<details class="rh-contract-menu"><summary aria-label="Thao tác hợp đồng"><i class="fas fa-ellipsis"></i></summary><div class="rh-contract-menu-list">' + options.join('') + '</div></details>';
    }

    function renderContractsTab(filter) {
        var tab = document.getElementById('contracts-tab');
        if (!tab) return;
        styleOnce();
        state.status = filter || state.status || 'all';
        var contracts = allContracts();
        var categories = { all: contracts, renting: [], expiring: [], overdue: [], moving: [], liquidated: [], deposit: [] };
        contracts.forEach(function (contract) { categories[status(contract)].push(contract); });
        var tabs = [['all', 'Tất cả'], ['renting', 'Đang thuê'], ['expiring', 'Sắp hết hạn'], ['overdue', 'Quá hạn'], ['moving', 'Sắp chuyển đi'], ['liquidated', 'Đã thanh lý'], ['deposit', 'Bỏ cọc']];
        var visible = filteredContracts(contracts);
        var rows = visible.map(function (contract) {
            var customerNames = tenantNames(contract);
            var tenant = customerNames.length > 1 ? customerNames[0] + ' +' + (customerNames.length - 1) : customerNames[0] || contract.customerName || '—';
            var currentStatus = status(contract);
            var tone = colors[currentStatus] || colors.renting;
            var deposit = contract.depositId && RHD.get('deposits', contract.depositId);
            var location = buildingApartment(contract);
            if (contract.roomId) location += ' · ' + contract.roomId;
            if (contract.bedId) location += ' · ' + contract.bedId;
            return '<article class="rh-contract-row"><div class="rh-contract-cell"><small>MÃ HỢP ĐỒNG</small><strong>' + esc(contract.code || '—') + '</strong>' + (deposit ? '<span class="rh-contract-origin">Từ cọc ' + esc(deposit.code) + '</span>' : '') + '</div>' +
                '<div class="rh-contract-cell"><small>CĂN HỘ</small><strong>' + esc(location) + '</strong></div>' +
                '<div class="rh-contract-cell"><small>KHÁCH HÀNG</small><strong>' + esc(tenant) + '</strong></div>' +
                '<div class="rh-contract-cell"><small>THỜI HẠN</small><strong>' + fmtDate(contract.startDate) + ' → ' + fmtDate(contract.endDate) + '</strong></div>' +
                '<div class="rh-contract-cell"><small>TIỀN THUÊ</small><strong>' + money(contract.rentPrice) + '</strong></div>' +
                '<div class="rh-contract-actions"><span>' + util.badge(labels[currentStatus], tone[0], tone[1]) + '</span>' + contractActions(contract, currentStatus) + '</div></article>';
        }).join('');
        var buildings = util.scoped('buildings');
        var buildingOptions = '<option value="">Tất cả tòa nhà</option>' + buildings.map(function (building) { return '<option value="' + esc(building.id) + '"' + (state.building === building.id ? ' selected' : '') + '>' + esc(building.name) + '</option>'; }).join('');
        var currentRenting = categories.renting.length;
        var canAdd = util.can('contracts.create');
        tab.innerHTML = util.renderDemoBanner('contracts') + '<section class="rh-contracts-module"><div class="rh-contract-head"><h2>Hợp đồng</h2><div class="rh-contract-toolbar">' +
            '<button type="button" class="billing-filter" data-contract-import-button title="Nhập Excel" ' + (canAdd ? '' : 'disabled') + '><i class="fas fa-file-import"></i> Thêm dữ liệu</button>' +
            '<button class="rh-contract-icon-btn" type="button" data-contract-search-toggle title="Tìm kiếm" aria-label="Tìm kiếm"><i class="fas fa-search"></i></button>' +
            '<button class="rh-contract-icon-btn" type="button" data-contract-filter-toggle title="Lọc theo tòa nhà" aria-label="Lọc theo tòa nhà"><i class="fas fa-sliders"></i></button></div></div>' +
            '<div class="rh-contract-search' + (state.searchOpen ? ' open' : '') + '"><input type="search" data-contract-search placeholder="Tìm mã hợp đồng, khách hàng, căn hộ..." value="' + esc(state.search) + '"></div>' +
            '<div class="rh-contract-overview"><article><small>Hợp đồng</small><strong>' + contracts.length + '</strong></article><article><small>Đang thuê</small><strong>' + currentRenting + '</strong></article><article><small>Sắp hết hạn</small><strong>' + categories.expiring.length + '</strong></article><article><small>Quá hạn</small><strong>' + categories.overdue.length + '</strong></article></div>' +
            '<div class="rh-contract-tabs" role="tablist">' + tabs.map(function (entry) { return '<button type="button" class="rh-contract-tab' + (state.status === entry[0] ? ' active' : '') + '" data-contract-status="' + entry[0] + '">' + entry[1] + '<b>' + categories[entry[0]].length + '</b></button>'; }).join('') + '</div>' +
            '<div class="rh-contract-filter-panel' + (state.filtersOpen ? ' open' : '') + '"><select aria-label="Lọc theo tòa nhà" data-contract-building>' + buildingOptions + '</select></div>' +
            (visible.length ? '<div class="rh-contract-list">' + rows + '</div>' : '<div class="rh-contract-empty"><i class="fas fa-file-lines"></i><p>' + (contracts.length ? 'Không có hợp đồng phù hợp.' : 'Chưa có hợp đồng nào.') + '</p></div>') +
            '<details class="rh-contract-plus"><summary title="Thêm hợp đồng" aria-label="Thêm hợp đồng">+</summary><div class="rh-contract-plus-menu"><button type="button" data-contract-create-new>Tạo hợp đồng mới</button><button type="button" data-contract-create-deposit>Tạo từ cọc giữ chỗ</button></div></details>' +
            '<input id="contractCsvImportFile" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><div id="contractImportError" role="alert" style="color:#c43f36;font-size:.8rem;margin-top:.5rem;"></div></section>';
        var search = tab.querySelector('[data-contract-search]');
        if (search) search.addEventListener('input', function () { state.search = this.value; renderContractsTab(); var next = tab.querySelector('[data-contract-search]'); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });
        tab.querySelector('[data-contract-search-toggle]').addEventListener('click', function () { state.searchOpen = !state.searchOpen; renderContractsTab(); var input = tab.querySelector('[data-contract-search]'); if (state.searchOpen && input) input.focus(); });
        tab.querySelector('[data-contract-filter-toggle]').addEventListener('click', function () { state.filtersOpen = !state.filtersOpen; renderContractsTab(); });
        tab.querySelectorAll('[data-contract-status]').forEach(function (button) { button.addEventListener('click', function () { state.status = this.getAttribute('data-contract-status'); renderContractsTab(); }); });
        tab.querySelector('[data-contract-building]').addEventListener('change', function () { state.building = this.value; renderContractsTab(); });
        tab.querySelector('[data-contract-create-new]').addEventListener('click', function () { if (canAdd) openContractForm(); });
        tab.querySelector('[data-contract-create-deposit]').addEventListener('click', function () { openDepositPicker(); });
        tab.querySelector('[data-contract-import-button]').addEventListener('click', function () { tab.querySelector('#contractCsvImportFile').click(); });
        tab.querySelector('#contractCsvImportFile').addEventListener('change', importContractsFile);
        tab.querySelectorAll('[data-contract-action]').forEach(function (button) { button.addEventListener('click', function () {
            var contract = RHD.get('contracts', this.getAttribute('data-id'));
            if (!contract) return;
            this.closest('details').open = false;
            runContractAction(contract, this.getAttribute('data-contract-action'));
        }); });
    }

    function openDepositPicker() {
        var holding = RHLease.listDeposits().filter(function (deposit) { return deposit.status === 'holding'; });
        var content = holding.length ? '<div style="display:grid;gap:.5rem;">' + holding.map(function (deposit) {
            return '<button type="button" class="billing-filter" data-pick-deposit="' + esc(deposit.id) + '" style="display:flex;justify-content:space-between;gap:.8rem;"><span>' + esc(deposit.code) + ' · ' + esc(buildingApartment(deposit)) + '</span><strong>' + esc(tenantNames(deposit).join(', ')) + '</strong></button>';
        }).join('') + '</div>' : '<p style="color:#718096;">Không có cọc đang giữ chỗ.</p>';
        RHUI.openDrawer('Chọn cọc giữ chỗ', content, { width: 620 });
        document.querySelectorAll('[data-pick-deposit]').forEach(function (button) { button.addEventListener('click', function () {
            var deposit = RHD.get('deposits', this.getAttribute('data-pick-deposit'));
            RHUI.closeDrawer();
            if (deposit) openContractForm(null, deposit.customerId || tenantIds(deposit)[0], deposit.id);
        }); });
    }

    function openContractForm(id, customerId, depositId) {
        var existing = id ? RHD.get('contracts', id) : null;
        var deposit = depositId ? RHD.get('deposits', depositId) : null;
        if (!util.guard(id ? 'contracts.update' : 'contracts.create')) return;
        if (id && !existing) return;
        if (depositId && (!deposit || deposit.status !== 'holding')) { toast('Cọc không còn ở trạng thái chờ ký.'); return; }
        var buildings = util.scoped('buildings');
        var customers = util.scoped('customers');
        var buildingId = existing ? existing.buildingId : (deposit ? deposit.buildingId : buildings[0] && buildings[0].id || '');
        if (!buildingId) return;
        var building = RHD.get('buildings', buildingId);
        var apartmentId = existing ? existing.apartmentId : (deposit ? deposit.apartmentId : '');
        var apartment = RHD.get('apartments', apartmentId) || (util.scoped('apartments').filter(function (item) { return item.buildingId === buildingId; })[0] || null);
        var selectedTenants = existing ? tenantIds(existing) : (deposit ? tenantIds(deposit) : (customerId ? [customerId] : []));
        var startDate = existing ? existing.startDate : (deposit ? deposit.leaseStartDate : dateInputToday());
        var endDate = existing ? existing.endDate : (deposit ? deposit.leaseEndDate : RHLease.defaultEndDate(startDate, 12));
        var dates = { startDate: startDate, endDate: endDate };
        var meterAssignments = existing && existing.meterAssignments ? existing.meterAssignments.slice() : (deposit && deposit.meterAssignments ? deposit.meterAssignments.slice() : []);
        var customServices = existing && existing.extraServices ? existing.extraServices.slice() : (deposit && deposit.extraServices ? deposit.extraServices.slice() : []);
        var selectedServiceIds = existing ? (existing.serviceIds || []) : (deposit ? (deposit.services || []).map(function (item) { return item.id; }) : []);
        var serviceOverrides = existing ? existing.serviceOverrides || {} : (deposit ? (deposit.services || []).reduce(function (out, item) { out[item.id] = item.unitPrice; return out; }, {}) : {});
        var files = existing && Array.isArray(existing.files) ? existing.files.slice() : [];
        var isLocked = !!deposit;
        var tplInvoice = existing && existing.invoiceTemplateId || monthlyInvoiceTemplate(building);
        if (!monthlyInvoiceTemplates().some(function (template) { return template.id === tplInvoice; })) tplInvoice = monthlyInvoiceTemplate(building);
        var html = '<form id="contractWorkflowForm" class="rh-contract-form" novalidate>' +
            (deposit ? '<div class="rh-customer-preview" style="margin-bottom:.8rem;"><strong>Tạo từ cọc ' + esc(deposit.code) + '</strong> · Vị trí và khách hàng đã khóa.</div>' : '') +
            '<section class="rh-contract-form-section"><h4>(1) Thông tin chung</h4><div class="rh-contract-form-grid">' +
            selectField('contractBuilding', 'Tòa nhà', buildings, 'id', function (item) { return item.shortName || item.name; }, buildingId, isLocked) +
            selectField('contractApartment', 'Căn hộ', util.scoped('apartments').filter(function (item) { return item.buildingId === buildingId; }), 'id', function (item) { return item.name || item.code; }, apartment && apartment.id, isLocked) +
            (isLocked ? '<div class="rh-contract-field"><label>Phòng / Giường</label><input readonly value="' + esc([deposit.roomId ? 'Phòng ' + deposit.roomId : '', deposit.bedId ? 'Giường ' + deposit.bedId : ''].filter(Boolean).join(' · ') || 'Không chia phòng/giường') + '"></div>' : roomBedFields(apartment, existing && existing.roomId, existing && existing.bedId)) +
            dateField('contractSignDate', 'Ngày ký', existing && existing.signDate || dateInputToday(), false) +
            dateField('contractLandlordSigned', 'Ngày chủ nhà ký', existing && existing.landlordSignedAt || '', false) +
            dateField('contractStart', 'Ngày bắt đầu', startDate, true) +
            dateField('contractEnd', 'Hạn hợp đồng', endDate, true) +
            '<div class="rh-contract-field"><label for="contractBillingDay">Ngày thanh toán hằng tháng</label><input id="contractBillingDay" type="number" min="1" max="31" value="' + esc(existing && existing.billingDay || 5) + '"><small data-error="billingDay"></small></div>' +
            selectField('contractTemplate', 'Mẫu hợp đồng', RHT.list('CONTRACT'), 'id', 'name', existing && existing.contractTemplateId || deposit && deposit.depositTemplateId || building.contractTemplateId, false) +
            selectField('contractInvoiceTemplate', 'Mẫu hóa đơn', monthlyInvoiceTemplates(), 'id', 'name', tplInvoice, false) +
            '<div class="rh-contract-field full"><label for="contractNote">Ghi chú</label><textarea id="contractNote" rows="2">' + esc(existing && existing.note || '') + '</textarea></div>' +
            '</div><div id="contractScheduleError" class="rh-contract-field-error"></div></section>' +
            '<section class="rh-contract-form-section"><h4>(2) Khách hàng</h4><div class="rh-contract-form-grid">' +
            '<div class="rh-contract-field full"><label for="contractTenants">Khách thuê</label><select id="contractTenants" multiple size="4"' + (isLocked ? ' disabled' : '') + '>' + customers.map(function (item) { return '<option value="' + esc(item.id) + '"' + (selectedTenants.indexOf(item.id) !== -1 ? ' selected' : '') + '>' + esc((item.fullName || item.name) + ' · ' + (item.phone || 'Chưa có SĐT')) + '</option>'; }).join('') + '</select><small data-error="tenantIds"></small></div>' +
            '<div class="rh-contract-field"><label for="contractQuickType">Loại khách mới</label><select id="contractQuickType"><option value="Cá nhân">Cá nhân</option><option value="Công ty">Tổ chức</option></select></div><div class="rh-contract-field"><label for="contractQuickName">Thêm khách nhanh</label><input id="contractQuickName" placeholder="Họ tên / tên tổ chức"><small></small></div><div class="rh-contract-field"><label for="contractQuickPhone">Số điện thoại</label><input id="contractQuickPhone" inputmode="tel"><small></small></div><div class="rh-contract-field"><button type="button" class="btn-secondary" id="contractQuickAdd"' + (isLocked ? ' disabled' : '') + '>Thêm khách vào hợp đồng</button></div></div></section>' +
            '<section class="rh-contract-form-section"><h4>(3) Tiền thuê & tiền cọc</h4><div class="rh-contract-form-grid">' +
            moneyField('contractRent', 'Tiền thuê / tháng', existing && existing.rentPrice || deposit && deposit.rentPrice || apartment && apartment.rentPrice || 0) +
            selectField('contractCycle', 'Chu kỳ thanh toán', RHD.PAYMENT_CYCLES, 'id', 'label', existing && existing.paymentCycle || deposit && deposit.paymentCycle || 'monthly', false) +
            dateField('contractRentStart', 'Ngày bắt đầu tính tiền', existing && existing.rentStartDate || deposit && deposit.rentStartDate || startDate, true) +
            moneyField('contractDeposit', 'Tiền cọc', existing && existing.depositPrice || deposit && deposit.depositFullAmount || apartment && apartment.depositPrice || 0) +
            moneyField('contractDepositHeld', 'Tiền cọc đã giữ', existing && existing.depositHeldAmount || deposit && deposit.depositReceivedAmount || 0, true) +
            moneyField('contractDepositDue', 'Cọc còn phải đóng', existing && existing.depositOutstandingAmount || deposit && Math.max(0, deposit.depositFullAmount - deposit.depositReceivedAmount) || 0, true) +
            '<div class="rh-contract-field"><label for="contractDiscountMonths">Số tháng giảm</label><input id="contractDiscountMonths" type="number" min="0" value="' + esc(existing && existing.discountMonths || deposit && deposit.discountMonths || 0) + '"></div>' +
            moneyField('contractDiscountAmount', 'Số tiền giảm mỗi tháng', existing && existing.discountAmountPerMonth || deposit && deposit.discountAmountPerMonth || 0) +
            '</div></section>' +
            '<section class="rh-contract-form-section"><h4>(4) Phí dịch vụ</h4><div id="contractServices">' + serviceMarkup(building, selectedServiceIds, serviceOverrides, meterAssignments, apartment, isLocked, customServices) + '</div><button type="button" class="btn-secondary" id="contractAddService">Thêm dịch vụ</button><div id="contractMeterErrors" class="rh-contract-field-error"></div></section>' +
            '<section class="rh-contract-form-section"><h4>(5) Đính kèm hợp đồng</h4><div class="rh-contract-field"><label for="contractFiles">Chọn nhiều tệp</label><input id="contractFiles" type="file" accept="image/*,.pdf" multiple><div id="contractFileList">' + fileMarkup(files) + '</div></div></section>' +
            '<div class="rh-contract-field-error" id="contractFormError" role="alert"></div><div style="display:flex;justify-content:flex-end;gap:.6rem;"><button type="button" class="btn-secondary" onclick="RHUI.closeDrawer()">Hủy</button><button type="submit" class="btn-primary">Lưu hợp đồng</button></div></form>';
        RHUI.drawerEntity = 'contracts'; RHUI.drawerId = existing && existing.id || null; RHUI.contractMeterAssignments = meterAssignments; RHUI.contractDepositId = deposit && deposit.id || '';
        RHUI.openDrawer(existing ? 'Sửa hợp đồng ' + existing.code : (deposit ? 'Tạo hợp đồng từ cọc ' + deposit.code : 'Thêm hợp đồng'), html, { width: 800 });
        wireContractForm(existing, deposit, files, meterAssignments);
    }

    function selectField(id, label, items, valueKey, labelKey, selected, disabled) {
        var options = items.map(function (item) { var value = typeof valueKey === 'function' ? valueKey(item) : item[valueKey]; var text = typeof labelKey === 'function' ? labelKey(item) : item[labelKey]; return '<option value="' + esc(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + esc(text) + '</option>'; }).join('');
        return '<div class="rh-contract-field"><label for="' + id + '">' + label + '</label><select id="' + id + '"' + (disabled ? ' disabled' : '') + '>' + options + '</select><small data-error="' + id + '"></small></div>';
    }
    function dateField(id, label, value, required) { return '<div class="rh-contract-field"><label for="' + id + '">' + label + (required ? ' *' : '') + '</label><input id="' + id + '" type="date" value="' + esc(value) + '"' + (required ? ' required' : '') + '><small data-error="' + id + '"></small></div>'; }
    function moneyField(id, label, value, readonly) { return '<div class="rh-contract-field"><label for="' + id + '">' + label + ' (đ)</label><input id="' + id + '" type="text" inputmode="numeric" data-contract-money value="' + esc((Number(value) || 0).toLocaleString('vi-VN')) + '"' + (readonly ? ' readonly' : '') + '><small data-error="' + id + '"></small></div>'; }
    function monthlyInvoiceTemplates() {
        var templates = RHT.list('INVOICE');
        var monthly = templates.filter(function (template) { return template.category === 'Định kỳ hàng tháng' || template.code === 'invoice_monthly'; });
        return monthly.length ? monthly : templates.filter(function (template) {
            return template.code !== 'invoice_deposit' && !/đặt cọc|deposit/i.test((template.name || '') + ' ' + (template.category || ''));
        });
    }
    function monthlyInvoiceTemplate(building) {
        var templates = monthlyInvoiceTemplates();
        var fromBuilding = templates.filter(function (template) { return template.id === (building && building.invoiceTemplateId); })[0];
        var systemDefault = RHT.getDefault('INVOICE') || {};
        var defaultTemplate = templates.filter(function (template) { return template.id === systemDefault.id; })[0];
        return fromBuilding && fromBuilding.id || defaultTemplate && defaultTemplate.id || (templates[0] && templates[0].id) || '';
    }
    function roomBedFields(apartment, roomId, bedId) {
        var rooms = apartment && Array.isArray(apartment.rooms) ? apartment.rooms : [];
        var beds = apartment && Array.isArray(apartment.beds) ? apartment.beds : [];
        var roomOptions = '<option value="">Không chia phòng riêng</option>' + rooms.map(function (item) { var id = typeof item === 'string' ? item : item.id || item.name; return '<option value="' + esc(id) + '"' + (id === roomId ? ' selected' : '') + '>' + esc(typeof item === 'string' ? item : item.name || item.code || item.id) + '</option>'; }).join('');
        var bedOptions = '<option value="">Không chia giường riêng</option>' + beds.filter(function (item) { return !roomId || typeof item === 'string' || !item.roomId || item.roomId === roomId; }).map(function (item) { var id = typeof item === 'string' ? item : item.id || item.name; return '<option value="' + esc(id) + '"' + (id === bedId ? ' selected' : '') + '>' + esc(typeof item === 'string' ? item : item.name || item.code || item.id) + '</option>'; }).join('');
        return '<div class="rh-contract-field"><label for="contractRoom">Phòng</label><select id="contractRoom">' + roomOptions + '</select></div><div class="rh-contract-field"><label for="contractBed">Giường</label><select id="contractBed">' + bedOptions + '</select></div>';
    }
    function fileMarkup(files) { return (files || []).map(function (file, index) { return '<div data-existing-file="' + index + '" style="color:#536275;font-size:.78rem;padding:.25rem 0;">' + esc(file.name || 'Tệp hợp đồng') + '</div>'; }).join(''); }
    function serviceMarkup(building, selectedIds, overrides, assignments, apartment, locked, extraServices) {
        if (!building) return '<p>Chưa chọn tòa nhà.</p>';
        var services = (building.services || []).concat(extraServices || []).filter(function (service) { return service.feeType !== 'rent' && service.feeType !== 'deposit'; });
        var rows = services.map(function (service) {
            var checked = selectedIds.indexOf(service.id) !== -1;
            var policy = RHD.utilityPolicy(service);
            var meterType = policy.metered ? (policy.meterType || (service.feeType === 'water' ? 'water' : 'electricity')) : '';
            return '<div class="rh-contract-service-row"><label><input type="checkbox" data-contract-service="' + esc(service.id) + '"' + (checked ? ' checked' : '') + '> ' + esc(service.name) + '</label><input type="text" inputmode="numeric" data-service-price="' + esc(service.id) + '" value="' + esc((Number(overrides[service.id] == null ? service.unitPrice : overrides[service.id]) || 0).toLocaleString('vi-VN')) + '" aria-label="Đơn giá ' + esc(service.name) + '">' +
                (meterType ? '<span class="rh-contract-meter-type">Công tơ ' + (meterType === 'water' ? 'nước' : 'điện') + '</span>' : '<span></span>') + '</div>';
        }).join('');
        var types = [];
        services.forEach(function (service) {
            if (selectedIds.indexOf(service.id) === -1) return;
            var policy = RHD.utilityPolicy(service);
            if (policy.metered) { var type = policy.meterType || (service.feeType === 'water' ? 'water' : 'electricity'); if (types.indexOf(type) === -1) types.push(type); }
        });
        var meterRows = types.map(function (type) {
            var records = util.scoped('meters').filter(function (meter) { return meter.apartmentId === (apartment && apartment.id) && meter.meterType === type && meter.meterCode; });
            var meters = [];
            records.forEach(function (meter) { if (!meters.some(function (item) { return item.meterCode === meter.meterCode; })) meters.push(meter); });
            var assignment = (assignments || []).filter(function (item) { return item.meterType === type && meters.some(function (meter) { return meter.meterCode === item.meterCode; }); })[0] || {};
            var meterSelect = meters.length > 1
                ? '<select data-meter-choice="' + type + '">' + meters.map(function (meter) { return '<option value="' + esc(meter.meterCode) + '"' + (assignment.meterCode === meter.meterCode ? ' selected' : '') + '>' + esc(meter.meterCode) + '</option>'; }).join('') + '</select>'
                : '<span>' + esc(meters[0] && meters[0].meterCode || 'Chưa khai báo công tơ') + '</span>';
            var meterCode = assignment.meterCode || meters[0] && meters[0].meterCode || '';
            var initial = assignment.initialIndex;
            if (initial == null && meters.length === 1) initial = meters[0].latestIndex;
            return '<div class="rh-contract-meter-row"><strong>' + (type === 'water' ? 'Công tơ nước' : 'Công tơ điện') + '</strong>' + meterSelect + '<label>Chỉ số đầu <input type="number" min="0" step="any" data-meter-initial="' + type + '" data-meter-code="' + esc(meterCode) + '" value="' + esc(initial == null ? '' : initial) + '" placeholder="Nhập chỉ số đầu" required></label></div>';
        }).join('');
        return '<div class="rh-contract-service-list">' + (rows || '<p>Tòa nhà chưa có dịch vụ áp dụng.</p>') + '</div>' + (types.length ? '<h5>Công tơ gắn với hợp đồng</h5>' + meterRows : '');
    }

    function wireContractForm(existing, deposit, files, meterAssignments) {
        var form = document.getElementById('contractWorkflowForm');
        form.addEventListener('change', function (event) {
            if (event.target.id === 'contractRoom') {
                var apartment = RHD.get('apartments', document.getElementById('contractApartment').value);
                var bed = document.getElementById('contractBed');
                if (bed) bed.innerHTML = bedOptions(apartment, event.target.value, '');
                checkSchedule();
            } else if (event.target.id === 'contractBed') checkSchedule();
        });
        form.addEventListener('input', function (event) {
            var input = event.target;
            if (input.matches('[data-contract-money],[data-service-price]')) {
                var raw = String(input.value || '').replace(/\D/g, '');
                input.value = raw ? Number(raw).toLocaleString('vi-VN') : '';
            }
            if (input.id === 'contractStart' || input.id === 'contractEnd') checkSchedule();
        });
        function checkSchedule() {
            var result = RHLease.checkAvailability({
                buildingId: document.getElementById('contractBuilding').value,
                apartmentId: document.getElementById('contractApartment').value,
                startDate: document.getElementById('contractStart').value,
                endDate: document.getElementById('contractEnd').value,
                roomId: deposit && deposit.roomId || document.getElementById('contractRoom') && document.getElementById('contractRoom').value,
                bedId: deposit && deposit.bedId || document.getElementById('contractBed') && document.getElementById('contractBed').value,
                excludeContractId: existing && existing.id,
                excludeDepositId: deposit && deposit.id || ''
            });
            document.getElementById('contractScheduleError').textContent = result.ok || !document.getElementById('contractStart').value || !document.getElementById('contractEnd').value ? '' : result.error;
            return result;
        }
        function tenantSelection() { return Array.from(document.getElementById('contractTenants').selectedOptions).map(function (option) { return option.value; }); }
        document.getElementById('contractBuilding').addEventListener('change', function () {
            var apartments = util.scoped('apartments').filter(function (item) { return item.buildingId === this.value; }, this);
            document.getElementById('contractApartment').innerHTML = apartments.map(function (item) { return '<option value="' + esc(item.id) + '">' + esc(item.name || item.code) + '</option>'; }).join('');
            var building = RHD.get('buildings', this.value);
            var template = monthlyInvoiceTemplate(building);
            if (template) document.getElementById('contractInvoiceTemplate').value = template;
            renderServices(building);
            checkSchedule();
        });
        document.getElementById('contractApartment').addEventListener('change', function () {
            var apartment = RHD.get('apartments', this.value);
            var room = document.getElementById('contractRoom');
            var bed = document.getElementById('contractBed');
            if (room && bed) { var fields = roomBedFields(apartment); room.outerHTML = fields.match(/<select id="contractRoom">([\s\S]*?)<\/select>/)[0]; bed.outerHTML = fields.match(/<select id="contractBed">([\s\S]*?)<\/select>/)[0]; }
            if (apartment) {
                document.getElementById('contractRent').value = formatMoney(apartment.rentPrice);
                document.getElementById('contractDeposit').value = formatMoney(apartment.depositPrice || apartment.rentPrice);
            }
            renderServices(RHD.get('buildings', apartment && apartment.buildingId));
            checkSchedule();
        });
        document.getElementById('contractTenants').addEventListener('change', checkSchedule);
        document.getElementById('contractStart').addEventListener('change', function () {
            if (!existing && !deposit) document.getElementById('contractEnd').value = RHLease.defaultEndDate(this.value, 12);
            document.getElementById('contractRentStart').value = this.value;
            checkSchedule();
        });
        document.getElementById('contractEnd').addEventListener('change', checkSchedule);
        document.getElementById('contractQuickAdd').addEventListener('click', function () {
            if (!util.guard('customers.create')) return;
            var name = document.getElementById('contractQuickName').value.trim();
            var phone = document.getElementById('contractQuickPhone').value.trim();
            if (!name || !phone) { toast('Nhập tên và số điện thoại khách mới.'); return; }
            var created = RHD.create('customers', { fullName: name, name: name, phone: phone, customerType: document.getElementById('contractQuickType').value, vehicles: [] });
            if (!created.ok) { toast(created.error); return; }
            var option = document.createElement('option'); option.value = created.item.id; option.textContent = name + ' · ' + phone; option.selected = true;
            document.getElementById('contractTenants').appendChild(option);
            document.getElementById('contractQuickName').value = ''; document.getElementById('contractQuickPhone').value = '';
        });
        document.getElementById('contractAddService').addEventListener('click', function () {
            var service = { id: 'contract-service-' + Date.now(), name: 'Dịch vụ mới', feeType: 'service', calcMethod: 'fixed', unitPrice: 0, taxRate: 0 };
            customServices.push(service);
            var building = RHD.get('buildings', document.getElementById('contractBuilding').value);
            renderServices(building);
            var added = form.querySelector('[data-contract-service="' + service.id + '"]');
            if (added) added.checked = true;
        });
        function renderServices(building) {
            var selectedIds = Array.from(form.querySelectorAll('[data-contract-service]:checked')).map(function (item) { return item.value; });
            var overrides = {};
            form.querySelectorAll('[data-service-price]').forEach(function (item) { overrides[item.getAttribute('data-service-price')] = Number(String(item.value).replace(/\D/g, '')) || 0; });
            var assignments = collectMeterAssignments();
            var apartment = RHD.get('apartments', document.getElementById('contractApartment').value);
            document.getElementById('contractServices').innerHTML = serviceMarkup(building, selectedIds, overrides, assignments, apartment, !!deposit, customServices);
            form.querySelectorAll('[data-contract-service]').forEach(function (checkbox) { checkbox.addEventListener('change', renderMeterRowsOnly); });
            form.querySelectorAll('[data-meter-choice]').forEach(function (select) { select.addEventListener('change', renderMeterRowsOnly); });
        }
        function renderMeterRowsOnly() {
            var building = RHD.get('buildings', document.getElementById('contractBuilding').value);
            renderServices(building);
        }
        function collectMeterAssignments() {
            return Array.from(form.querySelectorAll('[data-meter-initial]')).map(function (input) {
                var type = input.getAttribute('data-meter-initial');
                var choices = form.querySelector('[data-meter-choice="' + type + '"]');
                var building = RHD.get('buildings', document.getElementById('contractBuilding').value);
                var apartment = RHD.get('apartments', document.getElementById('contractApartment').value);
                var readings = util.scoped('meters').filter(function (meter) { return meter.apartmentId === (apartment && apartment.id) && meter.meterType === type && meter.meterCode; });
                var selectedCode = choices ? choices.value : (readings[0] && readings[0].meterCode || '');
                var meter = readings.filter(function (item) { return item.meterCode === selectedCode; })[0];
                return { meterType: type, meterCode: selectedCode, meterId: meter && meter.id || '', initialIndex: input.value === '' ? null : Number(input.value) };
            });
        }
        function renderServicesInitial() { renderServices(RHD.get('buildings', document.getElementById('contractBuilding').value)); }
        form.querySelectorAll('[data-service-price]').forEach(function (input) { input.addEventListener('input', function () { var raw = String(this.value).replace(/\D/g, ''); this.value = raw ? Number(raw).toLocaleString('vi-VN') : ''; }); });
        var fileInput = document.getElementById('contractFiles');
        fileInput.addEventListener('change', function () {
            Array.from(this.files || []).forEach(function (file) {
                var reader = new FileReader();
                reader.onload = function () { files.push({ name: file.name, type: file.type, dataUrl: reader.result, description: 'Tệp hợp đồng' }); document.getElementById('contractFileList').innerHTML = fileMarkup(files); };
                reader.readAsDataURL(file);
            });
        });
        form.addEventListener('submit', function (event) { submitContract(event, existing, deposit, files, collectMeterAssignments()); });
        renderServicesInitial();
        checkSchedule();
    }

    function submitContract(event, existing, deposit, files, meterAssignments) {
        event.preventDefault();
        var form = document.getElementById('contractWorkflowForm');
        var tenantIds = Array.from(form.querySelector('#contractTenants').selectedOptions).map(function (option) { return option.value; });
        var serviceIds = Array.from(form.querySelectorAll('[data-contract-service]:checked')).map(function (item) { return item.value; });
        var overrides = {};
        form.querySelectorAll('[data-service-price]').forEach(function (item) { overrides[item.getAttribute('data-service-price')] = readMoney(item.value); });
        var data = {
            buildingId: form.querySelector('#contractBuilding').value,
            apartmentId: form.querySelector('#contractApartment').value,
            roomId: deposit ? deposit.roomId || '' : form.querySelector('#contractRoom') && form.querySelector('#contractRoom').value || '',
            bedId: deposit ? deposit.bedId || '' : form.querySelector('#contractBed') && form.querySelector('#contractBed').value || '',
            tenantIds: tenantIds,
            customerId: tenantIds[0] || '',
            signDate: form.querySelector('#contractSignDate').value,
            landlordSignedAt: form.querySelector('#contractLandlordSigned').value,
            startDate: form.querySelector('#contractStart').value,
            endDate: form.querySelector('#contractEnd').value,
            billingDay: Number(form.querySelector('#contractBillingDay').value) || 0,
            contractTemplateId: form.querySelector('#contractTemplate').value,
            invoiceTemplateId: form.querySelector('#contractInvoiceTemplate').value,
            note: form.querySelector('#contractNote').value.trim(),
            rentPrice: readMoney(form.querySelector('#contractRent').value),
            paymentCycle: form.querySelector('#contractCycle').value,
            rentStartDate: form.querySelector('#contractRentStart').value,
            depositPrice: readMoney(form.querySelector('#contractDeposit').value),
            depositHeldAmount: readMoney(form.querySelector('#contractDepositHeld').value),
            depositOutstandingAmount: readMoney(form.querySelector('#contractDepositDue').value),
            discountMonths: Number(form.querySelector('#contractDiscountMonths').value) || 0,
            discountAmountPerMonth: readMoney(form.querySelector('#contractDiscountAmount').value),
            depositId: deposit ? deposit.id : existing && existing.depositId || '',
            serviceIds: serviceIds,
            serviceOverrides: overrides,
            extraServices: customServices.slice(),
            meterAssignments: meterAssignments.filter(function (assignment) { return assignment.meterCode; }),
            files: files.slice(),
            status: 'active'
        };
        var validation = RHLease.validateContractInput(data, existing && existing.id);
        clearErrors(form);
        if (!validation.ok) { showErrors(form, validation); return; }
        if (deposit) {
            var result = RHLease.createContractFromDeposit(deposit.id, data, actor());
            if (!result.ok) { showErrors(form, result); return; }
            RHUI.closeDrawer(); RHUI.drawerId = null; RHUI.depositId = null;
            global.switchTab('contracts');
            RHUI.renderApartmentsTab(); RHUI.renderDashboardCounts();
            notify('Đã ký hợp đồng ' + result.item.code + ' từ cọc ' + result.deposit.code + '.');
            return;
        }
        var saved = RHLease.saveContract(data, existing && existing.id, actor());
        if (!saved.ok) { showErrors(form, saved); return; }
        RHUI.closeDrawer(); RHUI.drawerId = null;
        renderContractsTab(); RHUI.renderApartmentsTab(); RHUI.renderDashboardCounts();
    }

    function clearErrors(form) { form.querySelectorAll('[aria-invalid="true"]').forEach(function (item) { item.removeAttribute('aria-invalid'); }); form.querySelectorAll('[data-error]').forEach(function (item) { item.textContent = ''; }); form.querySelector('#contractFormError').textContent = ''; }
    function showErrors(form, result) {
        Object.keys(result.fieldErrors || {}).forEach(function (field) {
            var id = ({ buildingId: 'contractBuilding', apartmentId: 'contractApartment', tenantIds: 'contractTenants', startDate: 'contractStart', endDate: 'contractEnd', signDate: 'contractSignDate', landlordSignedAt: 'contractLandlordSigned', rentStartDate: 'contractRentStart', billingDay: 'contractBillingDay' })[field];
            var input = id && form.querySelector('#' + id);
            if (input) input.setAttribute('aria-invalid', 'true');
            var error = form.querySelector('[data-error="' + (id || field) + '"]');
            if (error) error.textContent = result.fieldErrors[field];
            if (field === 'meterAssignments' && form.querySelector('#contractMeterErrors')) form.querySelector('#contractMeterErrors').textContent = result.fieldErrors[field];
        });
        form.querySelector('#contractFormError').textContent = result.error || 'Không thể lưu hợp đồng.';
    }

    function notify(message) {
        if (RHUI.notifyDepositStage) { RHUI.notifyDepositStage(message); return; }
        var item = document.createElement('div'); item.textContent = message; item.style.cssText = 'position:fixed;right:1rem;top:1rem;z-index:11000;background:#10213c;color:white;border-radius:9px;padding:.8rem 1rem;box-shadow:0 10px 25px #10213c33;';
        document.body.appendChild(item); global.setTimeout(function () { item.remove(); }, 4000);
    }

    function runContractAction(contract, action) {
        if (action === 'view') return viewContract(contract);
        if (action === 'edit') return openContractForm(contract.id);
        if (action === 'renew') return openRenewal(contract);
        if (action === 'transfer') return openTransfer(contract);
        if (action === 'moveout') return openMoveOut(contract);
        if (action === 'assign') return openAssignment(contract);
        if (action === 'settle') return openSettlement(contract);
        if (action === 'delete') return RHUI.confirmDelete('contracts', contract.id, function () { renderContractsTab(); RHUI.renderDashboardCounts(); }, RHLease.contractDeleteBlock(contract.id), RHLease.deleteContract);
    }

    function viewContract(contract) {
        var history = (contract.history || []).slice().reverse().map(function (entry) {
            return '<div style="border-left:2px solid #cce4fa;margin-left:.3rem;padding:0 0 .8rem .8rem;"><strong>' + esc(entry.type) + '</strong><div style="color:#718096;font-size:.78rem;">' + fmtDate(entry.date) + (entry.actorName ? ' · ' + esc(entry.actorName) : '') + '</div>' + (entry.note ? '<p>' + esc(entry.note) + '</p>' : '') + '</div>';
        }).join('') || '<p style="color:#718096;">Chưa có lịch sử thao tác.</p>';
        var held = Number(contract.depositHeldAmount) || 0;
        var due = Number(contract.depositOutstandingAmount) || 0;
        RHUI.openDrawer('Hợp đồng ' + contract.code, '<div class="rh-contract-detail"><p><strong>' + esc(tenantLabel(contract)) + '</strong></p><p>' + esc(buildingApartment(contract)) + '</p><p>Thời hạn: ' + fmtDate(contract.startDate) + ' → ' + fmtDate(contract.endDate) + '</p><p>Tiền thuê: ' + money(contract.rentPrice) + '</p><p>Cọc đang giữ: ' + money(held) + ' · Còn phải đóng: ' + money(due) + '</p><h4>Lịch sử thao tác</h4>' + history + '</div>', { width: 620 });
    }

    function operationForm(title, body, onSubmit, width) {
        RHUI.openDrawer(title, '<form id="contractOperationForm" class="rh-contract-operation-form">' + body + '<div id="contractOperationError" role="alert" class="rh-contract-field-error"></div><div style="display:flex;justify-content:flex-end;gap:.6rem;margin-top:1rem;"><button type="button" class="btn-secondary" onclick="RHUI.closeDrawer()">Hủy</button><button type="submit" class="btn-primary">Lưu</button></div></form>', { width: width || 620 });
        document.getElementById('contractOperationForm').addEventListener('submit', function (event) { event.preventDefault(); onSubmit(this); });
    }

    function openRenewal(contract) {
        if (!util.guard('contracts.update')) return;
        var body = '<div class="rh-contract-form-grid"><div class="rh-contract-field"><label>Số tháng gia hạn *</label><input name="months" type="number" min="1" value="12" required></div>' +
            '<div class="rh-contract-field"><label>Giá thuê mới / tháng (đ)</label><input name="rent" type="text" data-money value="' + formatMoney(contract.rentPrice) + '"></div>' +
            '<div class="rh-contract-field"><label>Tiền cọc mới (đ)</label><input name="deposit" type="text" data-money value="' + formatMoney(contract.depositPrice) + '"></div>' +
            '<div class="rh-contract-field"><label>Số tháng cọc</label><input name="depositMonths" type="number" min="1" value="1"></div></div>';
        operationForm('Gia hạn hợp đồng ' + contract.code, body, function (form) {
            var months = Number(form.elements.months.value) || 12;
            var rent = readMoney(form.elements.rent.value);
            var deposit = readMoney(form.elements.deposit.value);
            var result = RHLease.renewContract(contract.id, { extensionMonths: months, rentPrice: rent, depositPrice: deposit, depositMonths: Number(form.elements.depositMonths.value) || 1 }, actor());
            finishOperation(result, 'Đã gia hạn hợp đồng ' + contract.code + '.');
        });
        wireMoneyInputs(document.getElementById('contractOperationForm'));
    }

    function openTransfer(contract) {
        if (!util.guard('contracts.update')) return;
        var buildings = util.scoped('buildings');
        var apartments = util.scoped('apartments');
        var today = dateInputToday();
        var destinationApartment = RHD.get('apartments', contract.apartmentId);
        var destinationBuilding = RHD.get('buildings', contract.buildingId);
        var body = '<div class="rh-contract-form-grid">' + selectField('moveBuilding', 'Tòa nhà mới', buildings, 'id', function (item) { return item.name; }, contract.buildingId, false) +
            selectField('moveApartment', 'Căn hộ mới', apartments.filter(function (item) { return item.buildingId === contract.buildingId; }), 'id', 'name', contract.apartmentId, false) +
            dateField('moveDate', 'Ngày chuyển', today, true) + moneyField('moveRent', 'Giá thuê mới / tháng', contract.rentPrice) + moneyField('moveDeposit', 'Tiền cọc mới', contract.depositPrice) +
            '<div class="rh-contract-field"><label for="moveDiscountMonths">Số tháng khuyến mại</label><input id="moveDiscountMonths" type="number" min="0" value="' + esc(contract.discountMonths || 0) + '"></div>' + moneyField('moveDiscountAmount', 'Số tiền giảm mỗi tháng', contract.discountAmountPerMonth || 0) +
            '<div class="rh-contract-field"><label for="moveRoom">Phòng mới</label><select id="moveRoom">' + roomOptions(destinationApartment, contract.roomId) + '</select></div><div class="rh-contract-field"><label for="moveBed">Giường mới</label><select id="moveBed">' + bedOptions(destinationApartment, contract.roomId, contract.bedId) + '</select></div>' +
            '<div class="rh-contract-field full"><h4>Dịch vụ mới</h4><div id="moveServices">' + serviceMarkup(destinationBuilding, contract.serviceIds || [], contract.serviceOverrides || {}, contract.meterAssignments || [], destinationApartment, false) + '</div></div></div><div id="moveScheduleError" class="rh-contract-field-error"></div>';
        operationForm('Chuyển phòng / giường ' + contract.code, body, function (form) {
            var overrides = {};
            form.querySelectorAll('[data-service-price]').forEach(function (input) { overrides[input.dataset.servicePrice] = readMoney(input.value); });
            var destination = {
                buildingId: form.querySelector('#moveBuilding').value, apartmentId: form.querySelector('#moveApartment').value,
                roomId: form.querySelector('#moveRoom').value, bedId: form.querySelector('#moveBed').value,
                transferDate: form.querySelector('#moveDate').value, rentPrice: readMoney(form.querySelector('#moveRent').value),
                depositPrice: readMoney(form.querySelector('#moveDeposit').value), discountMonths: Number(form.querySelector('#moveDiscountMonths').value) || 0,
                discountAmountPerMonth: readMoney(form.querySelector('#moveDiscountAmount').value),
                serviceIds: Array.from(form.querySelectorAll('[data-contract-service]:checked')).map(function (checkbox) { return checkbox.value; }),
                serviceOverrides: overrides, meterAssignments: collectTransferMeters(form)
            };
            var result = RHLease.transferContract(contract.id, destination, actor()); finishOperation(result, 'Đã chuyển phòng hợp đồng ' + contract.code + '.');
        });
        var form = document.getElementById('contractOperationForm'); wireMoneyInputs(form);
        function refreshMoveDetails() {
            var apartment = RHD.get('apartments', form.querySelector('#moveApartment').value);
            form.querySelector('#moveRoom').innerHTML = roomOptions(apartment, '');
            form.querySelector('#moveBed').innerHTML = bedOptions(apartment, '', '');
            var building = RHD.get('buildings', form.querySelector('#moveBuilding').value);
            form.querySelector('#moveServices').innerHTML = serviceMarkup(building, contract.serviceIds || [], contract.serviceOverrides || {}, contract.meterAssignments || [], apartment, false);
            wireMoneyInputs(form.querySelector('#moveServices'));
            checkTransfer();
        }
        form.querySelector('#moveBuilding').addEventListener('change', function () { var options = apartments.filter(function (item) { return item.buildingId === this.value; }, this); form.querySelector('#moveApartment').innerHTML = options.map(function (item) { return '<option value="' + esc(item.id) + '">' + esc(item.name) + '</option>'; }).join(''); refreshMoveDetails(); });
        form.querySelector('#moveApartment').addEventListener('change', refreshMoveDetails);
        form.querySelector('#moveDate').addEventListener('change', checkTransfer);
        form.querySelector('#moveRoom').addEventListener('change', function () {
            var apartment = RHD.get('apartments', form.querySelector('#moveApartment').value);
            form.querySelector('#moveBed').innerHTML = bedOptions(apartment, this.value, '');
            checkTransfer();
        });
        form.querySelector('#moveBed').addEventListener('change', checkTransfer);
        function checkTransfer() {
            var checked = RHLease.validateContractInput(Object.assign({}, contract, {
                buildingId: form.querySelector('#moveBuilding').value,
                apartmentId: form.querySelector('#moveApartment').value,
                roomId: form.querySelector('#moveRoom').value,
                bedId: form.querySelector('#moveBed').value,
                transferDate: form.querySelector('#moveDate').value,
                serviceIds: Array.from(form.querySelectorAll('[data-contract-service]:checked')).map(function (item) { return item.value; }),
                meterAssignments: collectTransferMeters(form)
            }), contract.id, 'transferred');
            form.querySelector('#moveScheduleError').textContent = checked.ok ? '' : checked.error;
        }
    }

    function roomOptions(apartment, selected) {
        var rooms = apartment && Array.isArray(apartment.rooms) ? apartment.rooms : [];
        return '<option value="">Không chia phòng riêng</option>' + rooms.map(function (room) { var id = typeof room === 'string' ? room : room.id || room.name; return '<option value="' + esc(id) + '"' + (id === selected ? ' selected' : '') + '>' + esc(typeof room === 'string' ? room : room.name || room.code || room.id) + '</option>'; }).join('');
    }
    function bedOptions(apartment, roomId, selected) {
        var beds = apartment && Array.isArray(apartment.beds) ? apartment.beds : [];
        return '<option value="">Không chia giường riêng</option>' + beds.filter(function (bed) { return !roomId || typeof bed === 'string' || !bed.roomId || bed.roomId === roomId; }).map(function (bed) { var id = typeof bed === 'string' ? bed : bed.id || bed.name; return '<option value="' + esc(id) + '"' + (id === selected ? ' selected' : '') + '>' + esc(typeof bed === 'string' ? bed : bed.name || bed.code || bed.id) + '</option>'; }).join('');
    }
    function collectTransferMeters(form) {
        return Array.from(form.querySelectorAll('[data-meter-initial]')).map(function (input) {
            var type = input.dataset.meterInitial;
            var selector = form.querySelector('[data-meter-choice="' + type + '"]');
            var apartmentId = form.querySelector('#moveApartment').value;
            var meter = util.scoped('meters').filter(function (item) { return item.apartmentId === apartmentId && item.meterType === type && item.meterCode === (selector && selector.value || input.dataset.meterCode); })[0];
            return { meterType: type, meterCode: selector && selector.value || input.dataset.meterCode || '', meterId: meter && meter.id || '', initialIndex: input.value === '' ? null : Number(input.value) };
        }).filter(function (item) { return item.meterCode; });
    }

    function openMoveOut(contract) {
        if (!util.guard('contracts.update')) return;
        operationForm('Đăng ký ngày chuyển đi ' + contract.code, dateField('moveOutDate', 'Ngày chuyển đi dự kiến', contract.expectedMoveOutDate || dateInputToday(), true), function (form) {
            finishOperation(RHLease.registerMoveOut(contract.id, form.querySelector('#moveOutDate').value, actor()), 'Đã đăng ký ngày chuyển đi.');
        });
    }

    function openAssignment(contract) {
        if (!util.guard('contracts.update')) return;
        var selected = tenantIds(contract);
        var customers = util.scoped('customers');
        var body = '<p style="color:#61708a;margin-bottom:.75rem;">Khách cũ: <strong>' + esc(tenantNames(contract).join(', ') || '—') + '</strong></p><div class="rh-contract-field"><label for="assignedTenants">Khách nhận nhượng *</label><select id="assignedTenants" multiple size="6">' + customers.map(function (customer) { return '<option value="' + esc(customer.id) + '"' + (selected.indexOf(customer.id) !== -1 ? ' selected' : '') + '>' + esc(customer.fullName || customer.name) + ' · ' + esc(customer.phone || '') + '</option>'; }).join('') + '</select></div><div class="rh-contract-form-grid"><div class="rh-contract-field"><label for="assignmentQuickName">Thêm khách mới</label><input id="assignmentQuickName" placeholder="Họ tên khách"></div><div class="rh-contract-field"><label for="assignmentQuickPhone">Số điện thoại</label><input id="assignmentQuickPhone" inputmode="tel"></div><button type="button" class="btn-secondary" id="assignmentQuickAdd">Thêm khách</button></div><div class="rh-contract-field"><label for="assignmentDate">Ngày nhượng</label><input id="assignmentDate" type="date" value="' + dateInputToday() + '"></div>';
        operationForm('Nhượng hợp đồng ' + contract.code, body, function (form) {
            var ids = Array.from(form.querySelector('#assignedTenants').selectedOptions).map(function (item) { return item.value; });
            if (!ids.length) { form.querySelector('#contractOperationError').textContent = 'Chọn ít nhất một khách thuê mới.'; return; }
            finishOperation(RHLease.assignContract(contract.id, ids, Object.assign(actor(), { assignmentDate: form.querySelector('#assignmentDate').value })), 'Đã cập nhật khách thuê hợp đồng.');
        });
        document.getElementById('assignmentQuickAdd').addEventListener('click', function () {
            if (!util.guard('customers.create')) return;
            var name = document.getElementById('assignmentQuickName').value.trim();
            var phone = document.getElementById('assignmentQuickPhone').value.trim();
            if (!name || !phone) { document.getElementById('contractOperationError').textContent = 'Nhập tên và số điện thoại khách mới.'; return; }
            var created = RHD.create('customers', { fullName: name, name: name, phone: phone, customerType: 'Cá nhân', vehicles: [] });
            if (!created.ok) { document.getElementById('contractOperationError').textContent = created.error; return; }
            var option = document.createElement('option'); option.value = created.item.id; option.textContent = name + ' · ' + phone; option.selected = true;
            document.getElementById('assignedTenants').appendChild(option);
            document.getElementById('assignmentQuickName').value = ''; document.getElementById('assignmentQuickPhone').value = '';
            document.getElementById('contractOperationError').textContent = '';
        });
    }

    function openSettlement(contract) {
        if (!util.guard('contracts.update')) return;
        var unpaid = util.scoped('invoices').filter(function (invoice) { return invoice.contractId === contract.id && ['unpaid', 'sent', 'overdue'].indexOf(invoice.status) !== -1; });
        var invoiceDebt = unpaid.reduce(function (sum, invoice) { return sum + (Number(invoice.total) || 0); }, 0);
        var currentMonth = dateInputToday().slice(0, 7);
        var requirements = RHLease.finalMeterRequirements(contract.id, currentMonth);
        var meterHtml = requirements.map(function (item, index) {
            return '<div class="rh-contract-meter-row"><div><strong>' + esc(item.meterCode) + '</strong><small style="display:block;color:#718096;">' + (item.meterType === 'water' ? 'Nước' : 'Điện') + ' · Chỉ số trước ' + item.previousIndex + '</small></div><span>' + (item.approved ? 'Đã chốt / duyệt: ' + item.latestIndex : 'Cần chốt · Chưa duyệt') + '</span><input data-final-meter="' + index + '" type="number" min="' + item.previousIndex + '" step="any" value="' + (item.approved ? item.latestIndex : item.current ? item.current.latestIndex : '') + '"' + (item.approved ? ' readonly' : '') + ' placeholder="Chỉ số cuối"></div>';
        }).join('') || '<p style="color:#718096;">Chưa gắn công tơ vào hợp đồng.</p>';
        var body = '<div class="rh-settlement-wizard"><nav class="rh-settlement-steps"><button type="button" class="active" data-step="0">1. Bàn giao</button><button type="button" data-step="1">2. Công nợ</button><button type="button" data-step="2">3. Cọc</button><button type="button" data-step="3">4. Đối soát</button></nav>' +
            '<section data-settlement-panel="0"><h4>Thông tin hợp đồng</h4><label><input name="customerAbandoned" type="checkbox"> Khách bỏ cọc</label>' + dateField('settleMoveOut', 'Ngày chuyển đi', contract.expectedMoveOutDate || dateInputToday(), true) + '</section>' +
            '<section data-settlement-panel="1" hidden><h4>Công nợ khách hàng</h4><p>Hóa đơn còn nợ: <strong>' + money(invoiceDebt) + '</strong></p><input name="invoiceDebt" type="hidden" value="' + invoiceDebt + '"><div class="rh-contract-field"><label>Tiền thừa đã thu (đ)</label><input name="overpayment" type="text" data-money value="0"></div></section>' +
            '<section data-settlement-panel="2" hidden><h4>Hoàn cọc</h4><p>Tiền cọc đang giữ: <strong>' + money(contract.depositHeldAmount) + '</strong></p><p>Cọc còn phải đóng: <strong>' + money(contract.depositOutstandingAmount) + '</strong></p><p>Số tiền hoàn/khấu trừ được domain tự tổng hợp theo công nợ, phí phạt và tiền phòng đã dùng.</p></section>' +
            '<section data-settlement-panel="3" hidden><h4>Phí phạt, tiền phòng đã dùng và chỉ số cuối</h4><div class="rh-contract-field"><label>Phí phạt (đ)</label><input name="penalties" type="text" data-money value="0"></div><div class="rh-contract-field"><label>Tiền phòng đã dùng ngoài hóa đơn (đ)</label><input name="usedRent" type="text" data-money value="0"></div><div class="rh-contract-field"><label>Kỳ chốt chỉ số cuối</label><input name="finalMeterPeriod" type="month" value="' + currentMonth + '"></div><div class="rh-contract-field"><label>Ngày chốt</label><input name="finalMeterClosingDate" type="date" value="' + dateInputToday() + '"></div><div id="settlementMeters">' + meterHtml + '</div><div id="settlementPreview" class="rh-contract-settlement-preview"></div></section>' +
            '<div id="settlementError" class="rh-contract-field-error" role="alert"></div><div class="rh-settlement-footer"><button type="button" class="btn-secondary" data-settlement-back>Quay lại</button><button type="button" class="btn-primary" data-settlement-next>Tiếp tục</button><button type="button" class="btn-primary" data-settlement-finish hidden>Lập hóa đơn và thanh lý</button></div></div>';
        RHUI.openDrawer('Thanh lý hợp đồng ' + contract.code, body, { width: 720 });
        wireSettlement(contract, invoiceDebt);
    }

    function wireSettlement(contract, invoiceDebt) {
        var root = document.getElementById('rhDrawerBody');
        var currentStep = 0;
        var panels = Array.from(root.querySelectorAll('[data-settlement-panel]'));
        var steps = Array.from(root.querySelectorAll('.rh-settlement-steps button'));
        var back = root.querySelector('[data-settlement-back]'); var next = root.querySelector('[data-settlement-next]'); var finish = root.querySelector('[data-settlement-finish]');
        function showStep(step) { currentStep = Math.max(0, Math.min(3, step)); panels.forEach(function (panel, index) { panel.hidden = index !== currentStep; }); steps.forEach(function (item, index) { item.classList.toggle('active', index === currentStep); }); back.disabled = currentStep === 0; next.hidden = currentStep === 3; finish.hidden = currentStep !== 3; updatePreview(); }
        function values() { return { invoiceDebt: invoiceDebt, overpayment: readMoney(root.querySelector('[name="overpayment"]').value), penalties: readMoney(root.querySelector('[name="penalties"]').value), usedRent: readMoney(root.querySelector('[name="usedRent"]').value), customerAbandoned: root.querySelector('[name="customerAbandoned"]').checked }; }
        function updatePreview() {
            var meterPeriod = root.querySelector('[name="finalMeterPeriod"]').value;
            var draftReadings = Array.from(root.querySelectorAll('[data-final-meter]')).map(function (input) {
                var requirement = RHLease.finalMeterRequirements(contract.id, meterPeriod)[Number(input.dataset.finalMeter)];
                return requirement ? { meterType: requirement.meterType, meterCode: requirement.meterCode, latestIndex: input.value } : null;
            }).filter(Boolean);
            var meterTotal = meterPeriod ? RHLease.calculateFinalMeterAmount(contract.id, meterPeriod, draftReadings) : { amount: 0, waitingApproval: false };
            var result = RHLease.calculateSettlement(contract, Object.assign(values(), { finalUtilityAmount: meterTotal.amount || 0 }));
            root.querySelector('#settlementPreview').innerHTML = '<strong>' + (result.forfeited ? 'Khách bỏ cọc' : result.refundAmount > 0 ? 'Dự kiến hoàn khách: ' + money(result.refundAmount) : 'Dự kiến thu thêm: ' + money(result.amountToCollect)) + '</strong><div style="color:#718096;font-size:.78rem;margin-top:.3rem;">Điện/nước cuối: ' + money(meterTotal.amount) + (meterTotal.waitingApproval ? ' · Có chỉ số chưa duyệt' : '') + '</div>';
            }
            root.querySelectorAll('[data-money]').forEach(function (input) { input.addEventListener('input', function () { this.value = formatMoney(readMoney(this.value)); updatePreview(); }); });
            root.querySelector('[name="finalMeterPeriod"]').addEventListener('change', function () { reloadFinalMeters(contract, this.value); updatePreview(); });
            root.addEventListener('input', function (event) { if (event.target.matches('[data-final-meter]')) updatePreview(); });
        back.addEventListener('click', function () { showStep(currentStep - 1); });
        next.addEventListener('click', function () { showStep(currentStep + 1); });
        steps.forEach(function (item) { item.addEventListener('click', function () { showStep(Number(this.dataset.step)); }); });
        finish.addEventListener('click', function () {
            var period = root.querySelector('[name="finalMeterPeriod"]').value;
            var readings = Array.from(root.querySelectorAll('[data-final-meter]')).map(function (input) {
                var requirement = RHLease.finalMeterRequirements(contract.id, period)[Number(input.dataset.finalMeter)];
                return requirement ? { meterType: requirement.meterType, meterCode: requirement.meterCode, latestIndex: input.value } : null;
            }).filter(Boolean);
            var result = RHLease.settleContract(contract.id, Object.assign(values(), {
                moveOutDate: root.querySelector('#settleMoveOut').value,
                finalMeterPeriod: period,
                finalMeterClosingDate: root.querySelector('[name="finalMeterClosingDate"]').value,
                finalReadings: readings,
                createInvoice: true
            }), actor());
            if (!result.ok) { root.querySelector('#settlementError').textContent = result.error; return; }
            RHUI.closeDrawer(); renderContractsTab(); RHUI.renderApartmentsTab(); RHUI.renderDashboardCounts();
            notify(result.invoice ? 'Đã lập ' + result.invoice.code + ' và thanh lý hợp đồng.' : 'Đã thanh lý hợp đồng.');
        });
        showStep(0);
    }

    function reloadFinalMeters(contract, period) {
        var requirements = RHLease.finalMeterRequirements(contract.id, period);
        document.getElementById('settlementMeters').innerHTML = requirements.map(function (item, index) {
            return '<div class="rh-contract-meter-row"><div><strong>' + esc(item.meterCode) + '</strong><small style="display:block;color:#718096;">' + (item.meterType === 'water' ? 'Nước' : 'Điện') + ' · Chỉ số trước ' + item.previousIndex + '</small></div><span>' + (item.approved ? 'Đã chốt / duyệt: ' + item.latestIndex : 'Cần chốt · Chưa duyệt') + '</span><input data-final-meter="' + index + '" type="number" min="' + item.previousIndex + '" step="any" value="' + (item.approved ? item.latestIndex : item.current ? item.current.latestIndex : '') + '"' + (item.approved ? ' readonly' : '') + ' placeholder="Chỉ số cuối"></div>';
        }).join('') || '<p style="color:#718096;">Chưa gắn công tơ vào hợp đồng.</p>';
    }

    function wireMoneyInputs(form) { form.querySelectorAll('[data-money]').forEach(function (input) { input.addEventListener('input', function () { this.value = formatMoney(readMoney(this.value)); }); }); }

    function finishOperation(result, message) {
        var error = document.getElementById('contractOperationError');
        if (!result || !result.ok) { if (error) error.textContent = result && result.error || 'Không thể lưu thao tác.'; return; }
        RHUI.closeDrawer(); renderContractsTab(); RHUI.renderApartmentsTab(); RHUI.renderDashboardCounts(); notify(message);
    }

    function notify(message) {
        if (RHUI.notifyDepositStage) { RHUI.notifyDepositStage(message); return; }
        var item = document.createElement('div'); item.textContent = message; item.style.cssText = 'position:fixed;right:1rem;top:1rem;z-index:11000;background:#10213c;color:white;border-radius:9px;padding:.8rem 1rem;box-shadow:0 10px 25px #10213c33;';
        document.body.appendChild(item); global.setTimeout(function () { item.remove(); }, 4000);
    }

    RHUI.renderContractsTab = renderContractsTab;
    RHUI.openContractForm = openContractForm;
    RHUI.deleteContract = function (id) {
        if (!util.guard('contracts.delete')) return;
        RHUI.confirmDelete('contracts', id, function () { renderContractsTab(); RHUI.renderDashboardCounts(); }, RHLease.contractDeleteBlock(id), RHLease.deleteContract);
    };
})(window);