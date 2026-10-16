/* ResidentHub - contract workflow UI. Business rules remain in RHLease/RHB. */
(function (global) {
    var RHD = global.RHD;
    var RHLease = global.RHLease;
    var RHUI = global.RHUI;
    var util = RHUI.util;
    var state = { status: 'all', search: '', building: '' };
    var importState = { buildingId: '', rows: [], rawRows: [], file: null };
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
            '#rhDrawerBody .rh-contract-upload-help{margin:-.45rem 0 .8rem;color:#718096;font-size:.78rem;line-height:1.55}',
            '#rhDrawerBody .rh-contract-upload-zone{display:grid;justify-items:center;gap:.4rem;padding:1.2rem;border:1px dashed #aebfd3;border-radius:10px;background:#f8fbff;color:#536276;text-align:center}',
            '#rhDrawerBody .rh-contract-upload-zone.dragging{border-color:#1769d2;background:#eff6ff}',
            '#rhDrawerBody .rh-contract-upload-zone strong{color:#243b56;font-size:.84rem}',
            '#rhDrawerBody .rh-contract-upload-zone>span:not(.rh-contract-upload-icon){font-size:.72rem}',
            '#rhDrawerBody .rh-contract-upload-zone small{color:#8290a3;font-size:.68rem;line-height:1.45}',
            '#rhDrawerBody .rh-contract-upload-icon{display:grid;place-items:center;width:38px;height:38px;margin-bottom:.15rem;border-radius:11px;background:#eaf3ff;color:#1769d2}',
            '#rhDrawerBody .rh-contract-file-item{display:flex;align-items:center;justify-content:space-between;gap:.7rem;margin-top:.4rem;padding:.5rem .65rem;border:1px solid #e3eaf2;border-radius:7px;color:#536275;font-size:.76rem}',
            '#rhDrawerBody .rh-contract-file-item span{min-width:0;overflow-wrap:anywhere}',
            '#rhDrawerBody .rh-contract-file-item button{flex:0 0 auto;width:28px;height:28px;border:0;border-radius:6px;background:#fff1f0;color:#bd3939;cursor:pointer}',
            '#rhDrawerBody .rh-contract-files-empty{margin:.6rem 0 0;color:#8794a6;font-size:.72rem;line-height:1.5}',
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
            '#rhDrawerBody .rh-contract-picker-empty{display:grid;justify-items:center;gap:.6rem;padding:2rem 1.25rem;border:1px dashed #cbd8e7;border-radius:12px;background:#f8fbff;text-align:center}',
            '#rhDrawerBody .rh-contract-picker-empty h4{margin:.2rem 0 0;color:#183453;font-size:1rem}',
            '#rhDrawerBody .rh-contract-picker-empty p{max-width:390px;margin:0 0 .35rem;color:#718096;font-size:.82rem;line-height:1.6}',
            '#rhDrawerBody .rh-contract-picker-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:#eaf3ff;color:#1769d2;font-size:1.2rem}',
            '#rhDrawerBody .rh-contract-linked-record{display:flex;align-items:center;justify-content:space-between;gap:.8rem;margin:.85rem 0;padding:.8rem;border:1px solid #dce9f8;border-radius:9px;background:#f5f9ff}',
            '#rhDrawerBody .rh-contract-linked-record>div{display:grid;gap:.2rem}',
            '#rhDrawerBody .rh-contract-linked-record small{color:#718096;font-size:.65rem;font-weight:700}',
            '#rhDrawerBody .rh-contract-linked-record strong{color:#24415f;font-size:.8rem}',
            '#rhDrawerBody .rh-contract-linked-record span{color:#718096;font-size:.72rem;line-height:1.4}',
            '#rhDrawerBody .rh-contract-linked-record.is-unlinked{align-items:flex-start;flex-direction:column;border-color:#f0dfbd;background:#fffaf0}',
            '#rhDrawerBody .rh-contract-deposit-link-note{grid-column:1/-1;margin:-.3rem 0 0;padding:.65rem .75rem;border-radius:8px;background:#f3f8ff;color:#536b86;font-size:.73rem;line-height:1.55}',
            '#rhDrawerBody .rh-contract-import{display:grid;gap:1rem;color:#26364b}',
            '#rhDrawerBody .rh-contract-import-panel{display:grid;gap:.8rem;padding:1rem;border:1px solid #e3eaf2;border-radius:11px;background:#fff}',
            '#rhDrawerBody .rh-contract-import-panel h4{margin:0;color:#183453;font-size:.9rem}',
            '#rhDrawerBody .rh-contract-import label{color:#536276;font-size:.76rem;font-weight:650}',
            '#rhDrawerBody .rh-contract-import select{box-sizing:border-box;width:100%;min-height:40px;padding:.55rem .65rem;border:1px solid #d8e0ea;border-radius:8px;background:#fff;color:#24364d;font:inherit;font-size:.82rem}',
            '#rhDrawerBody .rh-contract-import-drop{display:grid;place-items:center;gap:.45rem;min-height:100px;padding:1rem;border:1.5px dashed #aabbd0;border-radius:10px;background:#f8fbff;color:#536b86;text-align:center;cursor:pointer}',
            '#rhDrawerBody .rh-contract-import-drop.dragover{border-color:#1769d2;background:#edf5ff}',
            '#rhDrawerBody .rh-contract-import-drop small{font-size:.72rem}',
            '#rhDrawerBody .rh-contract-import-status{color:#536276;font-size:.78rem;line-height:1.5}',
            '#rhDrawerBody .rh-contract-import-status.error{color:#bd3939}',
            '#rhDrawerBody .rh-contract-import-summary{display:flex;flex-wrap:wrap;gap:.5rem}',
            '#rhDrawerBody .rh-contract-import-summary span{padding:.3rem .5rem;border-radius:999px;background:#f0f4f8;color:#536276;font-size:.7rem;font-weight:650}',
            '#rhDrawerBody .rh-contract-import-table-wrap{max-height:360px;overflow:auto;border:1px solid #e3eaf2;border-radius:9px}',
            '#rhDrawerBody .rh-contract-import-table{width:100%;border-collapse:collapse;font-size:.72rem}',
            '#rhDrawerBody .rh-contract-import-table th,#rhDrawerBody .rh-contract-import-table td{padding:.55rem .6rem;border-bottom:1px solid #edf0f4;text-align:left;vertical-align:top}',
            '#rhDrawerBody .rh-contract-import-table th{position:sticky;top:0;background:#f7f9fc;color:#61708a;white-space:nowrap}',
            '#rhDrawerBody .rh-contract-import-row-error{color:#bd3939;line-height:1.45}',
            '#rhDrawerBody .rh-contract-import-actions{display:flex;justify-content:flex-end;gap:.6rem;flex-wrap:wrap}',
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

    function normalizeHeader(value) {
        return String(value || '').replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    var contractImportColumns = [
        { key: 'apartment', title: 'Căn hộ *', required: true, text: true },
        { key: 'customer', title: 'Khách hàng *', required: true },
        { key: 'phone', title: 'Số điện thoại', text: true },
        { key: 'start', title: 'Ngày bắt đầu *', required: true },
        { key: 'end', title: 'Ngày kết thúc *', required: true },
        { key: 'rent', title: 'Tiền thuê/tháng *', required: true },
        { key: 'deposit', title: 'Tiền cọc' },
        { key: 'depositReceived', title: 'Tiền cọc đã nhận' },
        { key: 'code', title: 'Mã hợp đồng', text: true },
        { key: 'signDate', title: 'Ngày ký' },
        { key: 'landlordSignedAt', title: 'Ngày chủ nhà ký' },
        { key: 'billingDay', title: 'Ngày thanh toán' },
        { key: 'note', title: 'Ghi chú' }
    ];

    function openContractImport() {
        if (!util.guard('contracts.create')) return;
        importState = { buildingId: '', rows: [], rawRows: [], file: null };
        var buildings = util.scoped('buildings');
        var options = '<option value="">Chọn tòa nhà</option>' + buildings.map(function (building) {
            return '<option value="' + esc(building.id) + '">' + esc(building.shortName || building.name) + '</option>';
        }).join('');
        var content = '<div class="rh-contract-import" id="contractImportForm">' +
            '<section class="rh-contract-import-panel"><h4>1. Chọn tòa nhà và tải mẫu</h4><label for="contractImportBuilding">Tòa nhà *</label><select id="contractImportBuilding">' + options + '</select>' +
            '<div class="rh-contract-import-status">Chọn tòa nhà trước khi tải mẫu hoặc chọn file. Cột có dấu * là bắt buộc; ngày nhập theo DD/MM/YYYY, tiền nhập dạng số. Mã căn hộ, mã hợp đồng và số điện thoại dùng dạng văn bản.</div>' +
            '<button type="button" class="btn-secondary" data-import-template disabled><i class="fas fa-download"></i> Tải file mẫu (.xlsx)</button></section>' +
            '<section class="rh-contract-import-panel"><h4>2. Chọn file Excel</h4><div class="rh-contract-import-drop" data-import-drop role="button" tabindex="0"><span><i class="fas fa-cloud-arrow-up"></i> Chọn hoặc kéo thả file .xlsx vào đây</span><small data-import-file-name>Chỉ nhận .xlsx, tối đa 25 MB</small></div><input type="file" data-import-file accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>' +
            '<label for="contractImportMode">Cách xử lý khi có dòng lỗi</label><select id="contractImportMode"><option value="stop">Dừng toàn bộ nếu có lỗi</option><option value="skip">Bỏ qua dòng lỗi, nhập các dòng hợp lệ</option></select>' +
            '<div class="rh-contract-import-status" data-import-status role="status">Chưa chọn file.</div><div data-import-preview></div></section>' +
            '<div class="rh-contract-import-actions"><button type="button" class="btn-secondary" data-import-close>Đóng</button><button type="button" class="btn-primary" data-import-submit disabled>Nhập dữ liệu</button></div></div>';
        RHUI.openDrawer('Nhập hợp đồng từ Excel', content, { width: 920 });
        var root = document.getElementById('contractImportForm');
        var buildingSelect = root.querySelector('#contractImportBuilding');
        var fileInput = root.querySelector('[data-import-file]');
        var drop = root.querySelector('[data-import-drop]');
        root.querySelector('[data-import-template]').addEventListener('click', downloadContractTemplate);
        root.querySelector('[data-import-close]').addEventListener('click', RHUI.closeDrawer);
        root.querySelector('[data-import-submit]').addEventListener('click', submitContractImport);
        buildingSelect.addEventListener('change', function () {
            importState.buildingId = this.value;
            root.querySelector('[data-import-template]').disabled = !this.value;
            if (importState.rawRows.length) validateContractImportRows(importState.rawRows, this.value);
        });
        fileInput.addEventListener('change', function () {
            var file = this.files && this.files[0];
            if (file) readContractImportFile(file);
            this.value = '';
        });
        drop.addEventListener('click', function () { fileInput.click(); });
        drop.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
        });
        drop.addEventListener('dragover', function (event) { event.preventDefault(); drop.classList.add('dragover'); });
        drop.addEventListener('dragleave', function () { drop.classList.remove('dragover'); });
        drop.addEventListener('drop', function (event) {
            event.preventDefault();
            drop.classList.remove('dragover');
            var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
            if (file) readContractImportFile(file);
        });
        root.querySelector('#contractImportMode').addEventListener('change', renderContractImportPreview);
    }

    async function downloadContractTemplate() {
        var status = document.querySelector('#contractImportForm [data-import-status]');
        if (!importState.buildingId) return;
        if (!global.RHExcelTools || !global.RHExcelTools.writeExcelFile) {
            status.className = 'rh-contract-import-status error';
            status.textContent = 'Thiếu bộ tạo Excel. Hãy chạy npm run build để tạo dist/excel-tools.js.';
            return;
        }
        var rows = [
            contractImportColumns.map(function (column) {
                return { value: column.title, type: String, fontWeight: 'bold', backgroundColor: '#eaf3ff' };
            }),
            contractImportColumns.map(function (column) {
                return column.text
                    ? { value: '', type: String, format: '@' }
                    : { value: '', type: column.key === 'rent' || column.key === 'deposit' || column.key === 'depositReceived' ? Number : String };
            })
        ];
        var columns = contractImportColumns.map(function () { return { width: 22 }; });
        try {
            await global.RHExcelTools.writeExcelFile(rows, { sheet: 'Hợp đồng', columns: columns }, { fileName: 'Mau_nhap_hop_dong.xlsx' }).toFile('Mau_nhap_hop_dong.xlsx');
            status.className = 'rh-contract-import-status';
            status.textContent = 'Đã tạo file mẫu. Mã hợp đồng và số điện thoại được định dạng văn bản.';
        } catch (error) {
            status.className = 'rh-contract-import-status error';
            status.textContent = 'Không thể tạo file mẫu: ' + error.message;
        }
    }

    async function readContractImportFile(file) {
        var root = document.getElementById('contractImportForm');
        if (!root) return;
        var status = root.querySelector('[data-import-status]');
        if (!util.guard('contracts.create')) return;
        if (!importState.buildingId) {
            status.className = 'rh-contract-import-status error';
            status.textContent = 'Vui lòng chọn tòa nhà trước khi đọc file.';
            return;
        }
        if (!/\.xlsx$/i.test(file.name) || file.size > 25 * 1024 * 1024) {
            status.className = 'rh-contract-import-status error';
            status.textContent = file.size > 25 * 1024 * 1024 ? 'Tệp không được lớn hơn 25 MB.' : 'Chỉ hỗ trợ tệp Excel .xlsx.';
            return;
        }
        if (!global.RHExcelTools || !global.RHExcelTools.readSheet) {
            status.className = 'rh-contract-import-status error';
            status.textContent = 'Thiếu bộ đọc Excel. Hãy chạy npm run build để tạo dist/excel-tools.js.';
            return;
        }
        importState.file = file;
        importState.rows = [];
        importState.rawRows = [];
        root.querySelector('[data-import-file-name]').textContent = file.name;
        root.querySelector('[data-import-preview]').innerHTML = '';
        root.querySelector('[data-import-submit]').disabled = true;
        status.className = 'rh-contract-import-status';
        status.textContent = 'Đang đọc và kiểm tra từng dòng...';
        try {
            var rows = await global.RHExcelTools.readSheet(file);
            if (!Array.isArray(rows) || rows.length < 2) throw new Error('File chưa có dòng dữ liệu.');
            importState.rawRows = rows;
            validateContractImportRows(rows, importState.buildingId);
        } catch (error) {
            status.className = 'rh-contract-import-status error';
            status.textContent = 'Không thể đọc file Excel: ' + error.message;
        }
    }

    function importDate(value) {
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value.getUTCFullYear() + '-' + String(value.getUTCMonth() + 1).padStart(2, '0') + '-' + String(value.getUTCDate()).padStart(2, '0');
        }
        if (typeof value === 'number' && value >= 20000 && value <= 100000) {
            var excelDate = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
            return importDate(excelDate);
        }
        var text = String(value == null ? '' : value).trim();
        var year, month, day;
        if (/^\d{4}-/.test(text)) {
            var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
            if (!iso) return '';
            year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
        } else {
            var dmy = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
            if (!dmy) return '';
            day = Number(dmy[1]); month = Number(dmy[2]); year = Number(dmy[3]);
        }
        var date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
            ? year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0') : '';
    }

    function parseImportAmount(value) {
        if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
        var text = String(value == null ? '' : value).trim().replace(/[đ₫\s]/gi, '');
        if (!text) return null;
        if (!/^\d+(?:[.,]\d{3})*$/.test(text)) return null;
        var amount = Number(text.replace(/[.,]/g, ''));
        return Number.isFinite(amount) ? amount : null;
    }

    function validateContractImportRows(rawRows, buildingId) {
        var root = document.getElementById('contractImportForm');
        if (!root) return;
        var status = root.querySelector('[data-import-status]');
        var headers = (rawRows[0] || []).map(normalizeHeader);
        var fieldAliases = {
            apartment: ['canho', 'apartment'], customer: ['khachhang', 'customer'], phone: ['sodienthoai', 'phone'],
            start: ['ngaybatdau', 'startdate'], end: ['ngayketthuc', 'enddate'], rent: ['tienthue/thang', 'tienthuethang', 'rent'],
            deposit: ['tiencoc', 'deposit'], depositReceived: ['tiencocdanhan', 'depositreceived'],
            code: ['mahopdong', 'contractcode'], signDate: ['ngayky', 'signdate'],
            landlordSignedAt: ['ngaychunhaky', 'landlordsignedat'], billingDay: ['ngaythanhtoan', 'billingday'],
            note: ['ghichu', 'note']
        };
        var columnIndexes = {};
        Object.keys(fieldAliases).forEach(function (key) {
            columnIndexes[key] = headers.findIndex(function (header) { return fieldAliases[key].indexOf(header) !== -1; });
        });
        var missing = contractImportColumns.filter(function (column) { return column.required && columnIndexes[column.key] < 0; });
        if (missing.length) {
            importState.rows = [];
            status.className = 'rh-contract-import-status error';
            status.textContent = 'Thiếu cột bắt buộc trong file: ' + missing.map(function (column) { return column.title; }).join(', ') + '.';
            renderContractImportPreview();
            return;
        }
        var building = RHD.get('buildings', buildingId);
        if (!building) {
            importState.rows = [];
            status.className = 'rh-contract-import-status error';
            status.textContent = 'Tòa nhà đã chọn không còn tồn tại.';
            renderContractImportPreview();
            return;
        }
        var apartments = util.scoped('apartments').filter(function (item) { return item.buildingId === building.id; });
        var customers = util.scoped('customers');
        var records = rawRows.slice(1).map(function (cells, offset) {
            var value = function (key) {
                var index = columnIndexes[key];
                return index < 0 ? '' : cells[index] == null ? '' : cells[index];
            };
            var errors = [];
            var text = function (key) { return String(value(key)).trim(); };
            var apartmentName = text('apartment').toLocaleLowerCase();
            var apartmentMatches = apartments.filter(function (item) {
                return [item.name, item.code].some(function (name) { return String(name || '').trim().toLocaleLowerCase() === apartmentName; });
            });
            var apartment = apartmentMatches[0];
            if (!text('apartment')) errors.push('Thiếu căn hộ.');
            else if (!apartmentMatches.length) errors.push('Không tìm thấy căn hộ "' + text('apartment') + '" trong tòa nhà đã chọn.');
            else if (apartmentMatches.length > 1) errors.push('Căn hộ "' + text('apartment') + '" bị trùng mã/tên trong tòa nhà.');

            var customerName = text('customer');
            var phoneValue = value('phone');
            var phone = String(phoneValue).trim();
            if (typeof phoneValue === 'number') errors.push('Số điện thoại phải nhập dạng văn bản để giữ số 0 đầu.');
            if (!customerName) errors.push('Thiếu khách hàng.');
            var customerMatches = customers.filter(function (item) {
                var samePhone = phone && String(item.phone || '').trim() === phone;
                var sameName = String(item.fullName || item.name || '').trim().toLocaleLowerCase() === customerName.toLocaleLowerCase();
                return phone ? samePhone && (!customerName || sameName) : sameName;
            });
            var customer = customerMatches[0];
            if (customerName && phone && !customerMatches.length) errors.push('Không tìm thấy khách hàng khớp cả tên và số điện thoại.');
            else if (customerName && !phone && !customerMatches.length) errors.push('Không tìm thấy khách hàng "' + customerName + '".');
            if (customerMatches.length > 1) errors.push('Khách hàng bị trùng tên/số điện thoại; hãy nhập số điện thoại chính xác.');

            var startDate = importDate(value('start')), endDate = importDate(value('end'));
            if (!text('start')) errors.push('Thiếu ngày bắt đầu.');
            else if (!startDate) errors.push('Ngày bắt đầu sai định dạng hoặc không hợp lệ.');
            if (!text('end')) errors.push('Thiếu ngày kết thúc.');
            else if (!endDate) errors.push('Ngày kết thúc sai định dạng hoặc không hợp lệ.');
            else if (startDate && endDate <= startDate) errors.push('Ngày kết thúc phải sau ngày bắt đầu.');

            var rentPrice = parseImportAmount(value('rent'));
            if (value('rent') === '' || value('rent') == null) errors.push('Thiếu tiền thuê.');
            else if (rentPrice == null || rentPrice <= 0) errors.push('Tiền thuê phải là số lớn hơn 0.');
            var depositPrice = text('deposit') ? parseImportAmount(value('deposit')) : null;
            if (text('deposit') && depositPrice == null) errors.push('Tiền cọc sai định dạng.');
            if (depositPrice == null && apartment) depositPrice = Number(apartment.depositPrice) || Number(apartment.rentPrice) || rentPrice || 0;
            var depositReceived = text('depositReceived') ? parseImportAmount(value('depositReceived')) : 0;
            if (text('depositReceived') && depositReceived == null) errors.push('Tiền cọc đã nhận sai định dạng.');
            if (depositReceived != null && depositPrice != null && depositReceived > depositPrice) errors.push('Tiền cọc đã nhận không được lớn hơn tiền cọc.');

            var codeValue = value('code');
            var code = String(codeValue == null ? '' : codeValue).trim();
            if (typeof codeValue === 'number') errors.push('Mã hợp đồng phải nhập dạng văn bản.');
            if (code && RHD.list('contracts').some(function (contract) { return String(contract.code || '').toLocaleLowerCase() === code.toLocaleLowerCase(); })) {
                errors.push('Mã hợp đồng "' + code + '" đã tồn tại.');
            }
            var signDate = text('signDate') ? importDate(value('signDate')) : '';
            var landlordSignedAt = text('landlordSignedAt') ? importDate(value('landlordSignedAt')) : '';
            if (text('signDate') && !signDate) errors.push('Ngày ký sai định dạng hoặc không hợp lệ.');
            if (text('landlordSignedAt') && !landlordSignedAt) errors.push('Ngày chủ nhà ký sai định dạng hoặc không hợp lệ.');
            var billingDay = text('billingDay') ? Number(value('billingDay')) : '';
            if (billingDay !== '' && (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31)) errors.push('Ngày thanh toán phải là số từ 1 đến 31.');
            var record = {
                rowNumber: offset + 2, apartment: apartment, apartmentLabel: text('apartment'), customer: customer,
                customerLabel: customerName, phone: phone, startDate: startDate, endDate: endDate,
                rentPrice: rentPrice, depositPrice: depositPrice, depositReceivedAmount: depositReceived,
                code: code, signDate: signDate, landlordSignedAt: landlordSignedAt,
                billingDay: billingDay, note: text('note'), errors: errors
            };
            if (!errors.length && apartment && startDate && endDate) {
                var availability = RHLease.checkDepositAvailability({
                    buildingId: building.id, apartmentId: apartment.id, startDate: startDate, endDate: endDate
                });
                if (!availability.ok) record.errors.push(availability.error);
            }
            return record;
        }).filter(function (record) {
            return record.apartmentLabel || record.customerLabel || record.startDate || record.endDate || record.rentPrice != null;
        });
        records.forEach(function (record, index) {
            if (!record.code) return;
            if (records.some(function (other, otherIndex) { return otherIndex < index && other.code.toLocaleLowerCase() === record.code.toLocaleLowerCase(); })) {
                record.errors.push('Mã hợp đồng bị trùng với dòng khác trong file.');
            }
        });
        records.forEach(function (record, index) {
            if (!record.apartment || !record.startDate || !record.endDate) return;
            records.slice(index + 1).forEach(function (other) {
                if (record.apartment.id === (other.apartment && other.apartment.id) && other.startDate && other.endDate &&
                    record.startDate <= other.endDate && record.endDate >= other.startDate) {
                    record.errors.push('Lịch thuê bị trùng với dòng ' + other.rowNumber + ' trong file.');
                    other.errors.push('Lịch thuê bị trùng với dòng ' + record.rowNumber + ' trong file.');
                }
            });
        });
        importState.rows = records;
        status.className = 'rh-contract-import-status';
        status.textContent = records.length ? 'Đã kiểm tra ' + records.length + ' dòng dữ liệu.' : 'File không có dòng hợp đồng.';
        renderContractImportPreview();
    }

    function renderContractImportPreview() {
        var root = document.getElementById('contractImportForm');
        if (!root) return;
        var preview = root.querySelector('[data-import-preview]');
        var submit = root.querySelector('[data-import-submit]');
        var status = root.querySelector('[data-import-status]');
        var validCount = importState.rows.filter(function (row) { return !row.errors.length; }).length;
        var errorCount = importState.rows.length - validCount;
        var mode = root.querySelector('#contractImportMode').value;
        submit.disabled = !validCount || (mode === 'stop' && errorCount > 0);
        if (!importState.rows.length) { preview.innerHTML = ''; return; }
        var rows = importState.rows.slice(0, 100).map(function (row) {
            var problem = row.errors.length ? '<div class="rh-contract-import-row-error">' + row.errors.map(esc).join('<br>') + '</div>' : '<span style="color:#16875d">Hợp lệ</span>';
            return '<tr><td>' + row.rowNumber + '</td><td>' + esc(row.apartmentLabel) + '</td><td>' + esc(row.customerLabel) + '</td><td>' + esc(row.startDate || '—') + ' → ' + esc(row.endDate || '—') + '</td><td>' + problem + '</td></tr>';
        }).join('');
        preview.innerHTML = '<div class="rh-contract-import-summary"><span>' + importState.rows.length + ' dòng</span><span>' + validCount + ' hợp lệ</span><span>' + errorCount + ' có lỗi</span></div>' +
            (importState.rows.length > 100 ? '<p class="rh-contract-import-status">Đang hiển thị 100 dòng đầu; toàn bộ ' + importState.rows.length + ' dòng vẫn được kiểm tra.</p>' : '') +
            '<div class="rh-contract-import-table-wrap"><table class="rh-contract-import-table"><thead><tr><th>Dòng</th><th>Căn hộ</th><th>Khách hàng</th><th>Thời hạn</th><th>Kết quả kiểm tra</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
        if (mode === 'stop' && errorCount) {
            status.className = 'rh-contract-import-status error';
            status.textContent = 'Có ' + errorCount + ' dòng lỗi. Chế độ hiện tại sẽ dừng toàn bộ; hãy sửa file hoặc chọn bỏ qua dòng lỗi.';
        } else if (mode === 'skip' && errorCount) {
            status.className = 'rh-contract-import-status';
            status.textContent = 'Sẽ nhập ' + validCount + ' dòng hợp lệ và bỏ qua ' + errorCount + ' dòng lỗi.';
        } else {
            status.className = 'rh-contract-import-status';
            status.textContent = validCount ? 'Tất cả ' + validCount + ' dòng đều hợp lệ và sẵn sàng nhập.' : 'Không có dòng hợp lệ để nhập.';
        }
    }

    function submitContractImport() {
        var root = document.getElementById('contractImportForm');
        if (!root || !util.guard('contracts.create')) return;
        var status = root.querySelector('[data-import-status]');
        var mode = root.querySelector('#contractImportMode').value;
        var validRows = importState.rows.filter(function (row) { return !row.errors.length; });
        var errorCount = importState.rows.length - validRows.length;
        if (!validRows.length || (mode === 'stop' && errorCount)) return;
        var building = RHD.get('buildings', importState.buildingId);
        if (!building) {
            status.className = 'rh-contract-import-status error';
            status.textContent = 'Tòa nhà đã chọn không còn tồn tại. Hãy tải lại file.';
            return;
        }
        var imported = 0, failures = [];
        for (var index = 0; index < validRows.length; index++) {
            var row = validRows[index];
            var deposit = RHLease.createDeposit({
                buildingId: building.id, apartmentId: row.apartment.id,
                tenantIds: [row.customer.id], customerId: row.customer.id, occupantCount: 1,
                depositDate: row.signDate || dateInputToday(), moveInDate: row.startDate,
                rentStartDate: row.startDate, leaseStartDate: row.startDate, leaseEndDate: row.endDate,
                rentPrice: row.rentPrice, depositMonths: 1, depositFullAmount: row.depositPrice,
                depositReceivedAmount: row.depositReceivedAmount, paymentCycle: 'monthly', services: []
            }, actor());
            if (!deposit.ok) {
                failures.push('Dòng ' + row.rowNumber + ': ' + deposit.error);
                if (mode === 'stop') break;
                continue;
            }
            var created = RHLease.createContractFromDeposit(deposit.item.id, {
                startDate: row.startDate, endDate: row.endDate, rentPrice: row.rentPrice,
                code: row.code,
                signDate: row.signDate, signedAt: row.signDate, landlordSignedAt: row.landlordSignedAt,
                billingDay: row.billingDay, rentStartDate: row.startDate, invoiceTemplateId: monthlyInvoiceTemplate(building),
                note: row.note
            }, actor());
            if (!created.ok) {
                var cleanup = RHLease.deleteDeposit(deposit.item.id);
                failures.push('Dòng ' + row.rowNumber + ': ' + created.error + (cleanup.ok ? '' : ' Không thể dọn khoản cọc vừa tạo: ' + cleanup.error));
                if (mode === 'stop') break;
                continue;
            }
            imported++;
        }
        RHUI.closeDrawer();
        renderContractsTab();
        RHUI.renderDashboardCounts();
        RHUI.renderApartmentsTab();
        var message = 'Đã nhập ' + imported + ' hợp đồng.';
        if (errorCount) message += ' Đã bỏ qua ' + errorCount + ' dòng có lỗi.';
        if (failures.length) message += ' Không nhập được: ' + failures.slice(0, 5).join(' ');
        notify(message);
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
            '<details class="rh-contract-plus"><summary title="Thêm hợp đồng" aria-label="Thêm hợp đồng">+</summary><div class="rh-contract-plus-menu"><button type="button" data-contract-create-new>Tạo hợp đồng mới</button><button type="button" data-contract-create-deposit>Tạo từ cọc giữ chỗ</button></div></details></section>';
        var search = tab.querySelector('[data-contract-search]');
        if (search) search.addEventListener('input', function () { state.search = this.value; renderContractsTab(); var next = tab.querySelector('[data-contract-search]'); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });
        tab.querySelector('[data-contract-search-toggle]').addEventListener('click', function () { state.searchOpen = !state.searchOpen; renderContractsTab(); var input = tab.querySelector('[data-contract-search]'); if (state.searchOpen && input) input.focus(); });
        tab.querySelector('[data-contract-filter-toggle]').addEventListener('click', function () { state.filtersOpen = !state.filtersOpen; renderContractsTab(); });
        tab.querySelectorAll('[data-contract-status]').forEach(function (button) { button.addEventListener('click', function () { state.status = this.getAttribute('data-contract-status'); renderContractsTab(); }); });
        tab.querySelector('[data-contract-building]').addEventListener('change', function () { state.building = this.value; renderContractsTab(); });
        tab.querySelector('[data-contract-create-new]').addEventListener('click', function () { if (canAdd) openContractForm(); });
        tab.querySelector('[data-contract-create-deposit]').addEventListener('click', function () { openDepositPicker(); });
        tab.querySelector('[data-contract-import-button]').addEventListener('click', openContractImport);
        tab.querySelectorAll('[data-contract-action]').forEach(function (button) { button.addEventListener('click', function () {
            var contract = RHD.get('contracts', this.getAttribute('data-id'));
            if (!contract) return;
            this.closest('details').open = false;
            runContractAction(contract, this.getAttribute('data-contract-action'));
        }); });
    }

    function openDepositPicker() {
        var holding = RHLease.listDeposits().filter(function (deposit) { return deposit.status === 'holding'; });
        var content = holding.length ? '<p style="margin:0 0 .75rem;color:#718096;font-size:.82rem;">Chọn hồ sơ cọc để mang khách hàng, căn hộ và số tiền cọc sang hợp đồng.</p><div style="display:grid;gap:.5rem;">' + holding.map(function (deposit) {
            return '<button type="button" class="billing-filter" data-pick-deposit="' + esc(deposit.id) + '" style="display:flex;justify-content:space-between;gap:.8rem;"><span>' + esc(deposit.code) + ' · ' + esc(buildingApartment(deposit)) + '</span><strong>' + esc(tenantNames(deposit).join(', ')) + '</strong></button>';
        }).join('') + '</div>' : '<div class="rh-contract-picker-empty"><span class="rh-contract-picker-icon"><i class="fas fa-hand-holding-dollar"></i></span><h4>Chưa có cọc giữ chỗ</h4><p>Tạo hồ sơ khách hàng và ghi nhận số tiền cọc trước. Sau khi lưu, khách hàng, căn hộ và khoản cọc sẽ tự liên kết với hợp đồng.</p><button type="button" class="btn-primary" data-create-deposit-from-picker><i class="fas fa-plus"></i> Tạo đặt cọc</button></div>';
        RHUI.openDrawer('Chọn cọc giữ chỗ', content, { width: 620 });
        document.querySelectorAll('[data-pick-deposit]').forEach(function (button) { button.addEventListener('click', function () {
            var deposit = RHD.get('deposits', this.getAttribute('data-pick-deposit'));
            RHUI.closeDrawer();
            if (deposit) openContractForm(null, deposit.customerId || tenantIds(deposit)[0], deposit.id);
        }); });
        var createDeposit = document.querySelector('[data-create-deposit-from-picker]');
        if (createDeposit) createDeposit.addEventListener('click', function () {
            RHUI.closeDrawer();
            if (RHUI.openDepositForCustomer) RHUI.openDepositForCustomer();
            else toast('Mở mục Đặt cọc để tạo hồ sơ mới.');
        });
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
        var initialRent = Number(existing && existing.rentPrice || deposit && deposit.rentPrice || apartment && apartment.rentPrice) || 0;
        var initialDeposit = Number(existing && existing.depositPrice || deposit && deposit.depositFullAmount || apartment && (apartment.depositPrice || apartment.rentPrice)) || initialRent;
        var initialHeld = Number(existing && existing.depositHeldAmount || deposit && deposit.depositReceivedAmount) || 0;
        var initialDepositDue = existing ? Number(existing.depositOutstandingAmount) || 0 : Math.max(0, initialDeposit - initialHeld);
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
            moneyField('contractRent', 'Tiền thuê / tháng', initialRent) +
            selectField('contractCycle', 'Chu kỳ thanh toán', RHD.PAYMENT_CYCLES, 'id', 'label', existing && existing.paymentCycle || deposit && deposit.paymentCycle || 'monthly', false) +
            dateField('contractRentStart', 'Ngày bắt đầu tính tiền', existing && existing.rentStartDate || deposit && deposit.rentStartDate || startDate, true) +
            moneyField('contractDeposit', 'Tiền cọc đầy đủ', initialDeposit, !!deposit) +
            moneyField('contractDepositHeld', 'Tiền cọc đã nhận', initialHeld, !!(existing || deposit)) +
            moneyField('contractDepositDue', 'Cọc còn phải đóng', initialDepositDue, true) +
            (!existing && !deposit ? '<p class="rh-contract-deposit-link-note"><i class="fas fa-link"></i> Khi lưu, hệ thống sẽ tạo hồ sơ đặt cọc gắn với khách hàng và chuyển khoản cọc sang hợp đồng. Nhập số tiền đã thực nhận; nếu chưa nhận tiền, để 0.</p>' : '') +
            '<div class="rh-contract-field"><label for="contractDiscountMonths">Số tháng giảm</label><input id="contractDiscountMonths" type="number" min="0" value="' + esc(existing && existing.discountMonths || deposit && deposit.discountMonths || 0) + '"></div>' +
            moneyField('contractDiscountAmount', 'Số tiền giảm mỗi tháng', existing && existing.discountAmountPerMonth || deposit && deposit.discountAmountPerMonth || 0) +
            '</div></section>' +
            '<section class="rh-contract-form-section"><h4>(4) Phí dịch vụ</h4><div id="contractServices">' + serviceMarkup(building, selectedServiceIds, serviceOverrides, meterAssignments, apartment, isLocked, customServices) + '</div><button type="button" class="btn-secondary" id="contractAddService">Thêm dịch vụ</button><div id="contractMeterErrors" class="rh-contract-field-error"></div></section>' +
            '<section class="rh-contract-form-section"><h4>(5) Hồ sơ hợp đồng</h4><p class="rh-contract-upload-help">Bạn có thể lưu hợp đồng bằng thông tin đã nhập ở các mục trên, hoặc đính kèm bản hợp đồng đã ký. Tệp đính kèm không bắt buộc.</p><div class="rh-contract-upload-zone" data-contract-file-drop><input id="contractFiles" type="file" accept="image/*,.pdf,.doc,.docx" multiple hidden><span class="rh-contract-upload-icon"><i class="fas fa-cloud-arrow-up"></i></span><strong>Kéo thả tệp vào đây</strong><span>hoặc</span><button type="button" class="btn-secondary" data-contract-file-picker>Chọn tệp từ thiết bị</button><small>PDF, Word hoặc ảnh · tối đa 1 MB mỗi tệp và 2 MB tổng dung lượng</small></div><div id="contractFileError" class="rh-contract-field-error" role="alert"></div><div id="contractFileList">' + fileMarkup(files) + '</div></section>' +
            '<div class="rh-contract-field-error" id="contractFormError" role="alert"></div><div style="display:flex;justify-content:flex-end;gap:.6rem;"><button type="button" class="btn-secondary" onclick="RHUI.closeDrawer()">Hủy</button><button type="submit" class="btn-primary">Lưu hợp đồng</button></div></form>';
        RHUI.drawerEntity = 'contracts'; RHUI.drawerId = existing && existing.id || null; RHUI.contractMeterAssignments = meterAssignments; RHUI.contractDepositId = deposit && deposit.id || '';
        RHUI.openDrawer(existing ? 'Sửa hợp đồng ' + existing.code : (deposit ? 'Tạo hợp đồng từ cọc ' + deposit.code : 'Thêm hợp đồng'), html, { width: 800 });
        wireContractForm(existing, deposit, files, meterAssignments, customServices);
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
    function fileMarkup(files) {
        return (files || []).map(function (file, index) {
            return '<div class="rh-contract-file-item"><span><i class="fas fa-paperclip"></i> ' + esc(file.name || 'Tệp hợp đồng') + '</span><button type="button" data-contract-remove-file="' + index + '" aria-label="Bỏ tệp ' + esc(file.name || '') + '"><i class="fas fa-xmark"></i></button></div>';
        }).join('') || '<p class="rh-contract-files-empty">Chưa đính kèm tệp. Bạn vẫn có thể lưu hợp đồng bằng thông tin đã nhập ở các mục trên.</p>';
    }
    function serviceMarkup(building, selectedIds, overrides, assignments, apartment, locked, extraServices) {
        if (!building) return '<p>Chưa chọn tòa nhà.</p>';
        var services = (building.services || []).concat(extraServices || []).filter(function (service) { return service.feeType !== 'rent' && service.feeType !== 'deposit'; });
        var rows = services.map(function (service) {
            var checked = selectedIds.indexOf(service.id) !== -1;
            var policy = RHD.utilityPolicy(service);
            var meterType = policy.metered ? (policy.meterType || (service.feeType === 'water' ? 'water' : 'electricity')) : '';
            return '<div class="rh-contract-service-row"><label><input type="checkbox" data-contract-service="' + esc(service.id) + '" value="' + esc(service.id) + '"' + (checked ? ' checked' : '') + '> ' + esc(service.name) + '</label><input type="text" inputmode="numeric" data-service-price="' + esc(service.id) + '" value="' + esc((Number(overrides[service.id] == null ? service.unitPrice : overrides[service.id]) || 0).toLocaleString('vi-VN')) + '" aria-label="Đơn giá ' + esc(service.name) + '">' +
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

    function wireContractForm(existing, deposit, files, meterAssignments, customServices) {
        var form = document.getElementById('contractWorkflowForm');
        function syncDepositBalance() {
            if (existing || deposit) return;
            var full = readMoney(form.querySelector('#contractDeposit').value);
            var received = readMoney(form.querySelector('#contractDepositHeld').value);
            form.querySelector('#contractDepositDue').value = formatMoney(Math.max(0, full - received));
        }
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
            if (input.id === 'contractDeposit' || input.id === 'contractDepositHeld') syncDepositBalance();
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
                syncDepositBalance();
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
        var fileZone = form.querySelector('[data-contract-file-drop]');
        var pendingFileReads = 0;
        var submitButton = form.querySelector('button[type="submit"]');
        function updateSubmitState() { submitButton.disabled = pendingFileReads > 0; }
        form.querySelector('[data-contract-file-picker]').addEventListener('click', function () { fileInput.click(); });
        function addFiles(selectedFiles) {
            var error = document.getElementById('contractFileError');
            error.textContent = '';
            var maxFileSize = 1 * 1024 * 1024;
            var maxTotalSize = 2 * 1024 * 1024;
            var currentSize = files.reduce(function (total, file) { return total + Number(file.size || (file.dataUrl ? Math.ceil(file.dataUrl.length * 0.75) : 0)); }, 0);
            Array.from(selectedFiles || []).forEach(function (file) {
                var extension = String(file.name || '').split('.').pop().toLowerCase();
                if (['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'].indexOf(extension) === -1) {
                    error.textContent = 'Không hỗ trợ tệp ' + file.name + '. Hãy chọn PDF, Word hoặc ảnh.';
                    return;
                }
                if (file.size > maxFileSize) {
                    error.textContent = 'Tệp ' + file.name + ' vượt quá giới hạn 1 MB.';
                    return;
                }
                if (currentSize + file.size > maxTotalSize) {
                    error.textContent = 'Tổng dung lượng tệp đính kèm không được vượt quá 2 MB.';
                    return;
                }
                currentSize += file.size;
                pendingFileReads += 1;
                updateSubmitState();
                var reader = new FileReader();
                reader.onload = function () {
                    files.push({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result, description: 'Tệp hợp đồng' });
                    document.getElementById('contractFileList').innerHTML = fileMarkup(files);
                    pendingFileReads -= 1;
                    updateSubmitState();
                };
                reader.onerror = function () {
                    error.textContent = 'Không đọc được tệp ' + file.name + '.';
                    pendingFileReads -= 1;
                    updateSubmitState();
                };
                reader.readAsDataURL(file);
            });
        }
        fileInput.addEventListener('change', function () { addFiles(this.files); this.value = ''; });
        form.addEventListener('click', function (event) {
            var removeFile = event.target.closest('[data-contract-remove-file]');
            if (!removeFile) return;
            files.splice(Number(removeFile.getAttribute('data-contract-remove-file')), 1);
            document.getElementById('contractFileList').innerHTML = fileMarkup(files);
        });
        ['dragenter', 'dragover'].forEach(function (name) { fileZone.addEventListener(name, function (event) { event.preventDefault(); fileZone.classList.add('dragging'); }); });
        ['dragleave', 'drop'].forEach(function (name) { fileZone.addEventListener(name, function (event) { event.preventDefault(); fileZone.classList.remove('dragging'); }); });
        fileZone.addEventListener('drop', function (event) { addFiles(event.dataTransfer && event.dataTransfer.files); });
        form.addEventListener('submit', function (event) {
            if (pendingFileReads) {
                event.preventDefault();
                document.getElementById('contractFileError').textContent = 'Đang tải tệp lên. Vui lòng đợi hoàn tất trước khi lưu.';
                return;
            }
            submitContract(event, existing, deposit, files, collectMeterAssignments(), customServices);
        });
        renderServicesInitial();
        checkSchedule();
    }

    function submitContract(event, existing, deposit, files, meterAssignments, customServices) {
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
        if (!existing) {
            var sourceBuilding = RHD.get('buildings', data.buildingId);
            var depositServices = (sourceBuilding && sourceBuilding.services || []).concat(customServices).filter(function (service) {
                return serviceIds.indexOf(service.id) !== -1 && service.feeType !== 'rent' && service.feeType !== 'deposit';
            }).map(function (service) {
                return Object.assign({}, service, { unitPrice: overrides[service.id] == null ? Number(service.unitPrice) || 0 : overrides[service.id] });
            });
            var createdDeposit = RHLease.createDeposit({
                buildingId: data.buildingId,
                apartmentId: data.apartmentId,
                roomId: data.roomId,
                bedId: data.bedId,
                tenantIds: tenantIds,
                customerId: tenantIds[0] || '',
                occupantCount: 1,
                depositDate: data.signDate || dateInputToday(),
                moveInDate: data.startDate,
                rentStartDate: data.rentStartDate || data.startDate,
                leaseStartDate: data.startDate,
                leaseEndDate: data.endDate,
                rentPrice: data.rentPrice,
                depositMonths: 1,
                depositFullAmount: data.depositPrice,
                depositReceivedAmount: data.depositHeldAmount,
                discountMonths: data.discountMonths,
                discountAmountPerMonth: data.discountAmountPerMonth,
                paymentCycle: data.paymentCycle,
                depositTemplateId: data.contractTemplateId,
                services: depositServices
            }, actor());
            if (!createdDeposit.ok) {
                form.querySelector('#contractFormError').textContent = createdDeposit.error || 'Không thể tạo hồ sơ đặt cọc liên kết.';
                return;
            }
            var signed = RHLease.createContractFromDeposit(createdDeposit.item.id, data, actor());
            if (!signed.ok) {
                form.querySelector('#contractFormError').textContent = 'Đã ghi nhận cọc ' + createdDeposit.item.code + ' và giữ chỗ, nhưng chưa hoàn tất hợp đồng: ' + (signed.error || 'Lỗi không xác định') + ' Hãy ký tiếp từ hồ sơ cọc.';
                return;
            }
            RHUI.closeDrawer(); RHUI.drawerId = null; RHUI.depositId = null;
            global.switchTab('contracts');
            RHUI.renderApartmentsTab(); RHUI.renderDashboardCounts();
            notify('Đã tạo hồ sơ cọc ' + createdDeposit.item.code + ' và liên kết với hợp đồng ' + signed.item.code + '.');
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
        var deposit = contract.depositId && RHD.get('deposits', contract.depositId);
        var depositTransactions = deposit ? RHLease.listDepositTransactions(deposit.id) : [];
        var depositPanel = deposit
            ? '<section class="rh-contract-linked-record"><div><small>HỒ SƠ ĐẶT CỌC ĐÃ LIÊN KẾT</small><strong>' + esc(deposit.code) + ' · ' + esc(deposit.status === 'contracted' ? 'Đã ký' : 'Đang giữ chỗ') + '</strong><span>Đã nhận ' + money(deposit.depositReceivedAmount) + ' / ' + money(deposit.depositFullAmount) + ' · ' + depositTransactions.length + ' giao dịch</span></div><button type="button" class="btn-secondary" data-view-linked-deposit="' + esc(deposit.id) + '">Mở lịch sử cọc</button></section>'
            : '<section class="rh-contract-linked-record is-unlinked"><strong>Chưa liên kết phiếu đặt cọc</strong><span>Thông tin tiền cọc trên hợp đồng: ' + money(held) + ' đã nhận · ' + money(due) + ' còn phải thu.</span></section>';
        RHUI.openDrawer('Hợp đồng ' + contract.code, '<div class="rh-contract-detail"><p><strong>' + esc(tenantLabel(contract)) + '</strong></p><p>' + esc(buildingApartment(contract)) + '</p><p>Thời hạn: ' + fmtDate(contract.startDate) + ' → ' + fmtDate(contract.endDate) + '</p><p>Tiền thuê: ' + money(contract.rentPrice) + '</p><p>Cọc đang giữ: ' + money(held) + ' · Còn phải đóng: ' + money(due) + '</p>' + depositPanel + '<h4>Lịch sử thao tác</h4>' + history + '</div>', { width: 620 });
        var linkedDepositButton = document.querySelector('[data-view-linked-deposit]');
        if (linkedDepositButton) linkedDepositButton.addEventListener('click', function () {
            var depositId = this.getAttribute('data-view-linked-deposit');
            RHUI.closeDrawer();
            if (RHUI.openDepositRecord) RHUI.openDepositRecord(depositId);
        });
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
    RHUI.openContractForCustomer = function (customerId) {
        if (!util.guard('contracts.create')) return;
        var linkedDeposit = RHLease.listDeposits().filter(function (deposit) {
            return deposit.status === 'holding' && tenantIds(deposit).indexOf(customerId) !== -1;
        }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })[0];
        if (linkedDeposit) {
            openContractForm(null, customerId, linkedDeposit.id);
            return;
        }
        var currentContract = util.scoped('contracts').filter(function (contract) {
            return tenantIds(contract).indexOf(customerId) !== -1 && RHLease.isActiveContract(contract);
        }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })[0];
        if (currentContract) {
            viewContract(currentContract);
            return;
        }
        if (RHUI.openDepositForCustomer) {
            toast('Chưa có hồ sơ cọc. Tạo cọc trước để liên kết khoản tiền với hợp đồng.');
            RHUI.openDepositForCustomer(customerId);
            return;
        }
        toast('Chưa có hồ sơ cọc. Hãy tạo đặt cọc trước khi ký hợp đồng.');
    };
    RHUI.openContractForDeposit = function (depositId) {
        if (!util.guard('contracts.view')) return;
        var deposit = RHD.get('deposits', depositId);
        var contract = deposit && (deposit.contractId && RHD.get('contracts', deposit.contractId) ||
            util.scoped('contracts').filter(function (item) { return item.depositId === deposit.id; })[0]);
        if (!contract) { toast('Chưa tìm thấy hợp đồng đang liên kết với cọc này.'); return; }
        global.switchTab('contracts');
        viewContract(contract);
    };
    RHUI.deleteContract = function (id) {
        if (!util.guard('contracts.delete')) return;
        RHUI.confirmDelete('contracts', id, function () { renderContractsTab(); RHUI.renderDashboardCounts(); }, RHLease.contractDeleteBlock(id), RHLease.deleteContract);
    };
})(window);