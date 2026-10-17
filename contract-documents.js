/* Contract document projection and immutable signing snapshots. No storage of its own. */
(function (global) {
    var labels = {company_name:'Bên cho thuê',manager_name:'Người đại diện bên cho thuê',building_manager_name:'Người quản lý tòa nhà',building_name:'Tên tòa nhà',building_code:'Mã tòa nhà',building_address:'Địa chỉ tòa nhà',billing_day:'Ngày tính tiền',room_number:'Mã căn hộ',room_address:'Địa chỉ căn hộ',room_area:'Diện tích căn hộ',room_capacity:'Sức chứa căn hộ',tenant_name:'Tên khách thuê đại diện',tenant_phone:'Số điện thoại khách thuê',tenant_id_number:'CCCD khách thuê',contract_code:'Mã hợp đồng',sign_date:'Ngày ký',start_date:'Ngày bắt đầu',end_date:'Ngày kết thúc',rental_term:'Thời hạn thuê',payment_cycle:'Chu kỳ thanh toán',rent_price:'Giá thuê',deposit_price:'Tiền cọc',deposit_amount:'Tiền đặt cọc',first_month_rent:'Tiền thuê kỳ đầu',bank_name:'Ngân hàng',bank_account_number:'Số tài khoản',bank_account_holder:'Chủ tài khoản',due_date:'Hạn thanh toán',due_days:'Số ngày thanh toán',custom_terms:'Điều khoản tùy chỉnh',tenants_table:'Danh sách khách thuê',services_table:'Bảng phí dịch vụ',service_rows_html:'Các dòng phí dịch vụ',assets_table:'Bảng tài sản bàn giao',initial_costs_table:'Bảng chi phí ban đầu',initial_service_amount:'Phí dịch vụ kỳ đầu',additional_amount:'Khoản phát sinh',total_amount:'Tổng thanh toán',service_name:'Tên dịch vụ',service_unit_price:'Đơn giá dịch vụ',service_calculation:'Cách tính dịch vụ',service_tax_rate:'Thuế suất dịch vụ',asset_name:'Tên tài sản',asset_quantity:'Số lượng tài sản',asset_condition:'Tình trạng tài sản',asset_value:'Giá trị tài sản',invoice_code:'Mã hóa đơn',issue_date:'Ngày lập',payment_period:'Kỳ thanh toán',old_end_date:'Ngày kết thúc cũ',penalty_amount:'Tiền phạt',outstanding_amount:'Công nợ',old_room_number:'Căn hộ cũ',electric_old:'Chỉ số điện đầu kỳ',electric_new:'Chỉ số điện cuối kỳ',electric_consumption:'Điện tiêu thụ',electric_amount:'Tiền điện',water_old:'Chỉ số nước đầu kỳ',water_new:'Chỉ số nước cuối kỳ',water_consumption:'Nước tiêu thụ',water_amount:'Tiền nước',bank_qr_code:'Mã QR thanh toán',einvoice_note:'Ghi chú hóa đơn điện tử',contract_template:'Biểu mẫu hợp đồng'};
    function label(key) { return labels[key] || 'Trường dữ liệu chưa được liên kết'; }
    function missingMessage(keys) { return keys.map(function(key){var where=/bank_/.test(key)?'thông tin thanh toán của hợp đồng':/tenant|tenants/.test(key)?'hồ sơ Khách hàng / Cư dân':/building|manager|company/.test(key)?'thông tin bên cho thuê trong hợp đồng / Tòa nhà':/asset/.test(key)?'danh sách tài sản bàn giao':/service/.test(key)?'phí dịch vụ của hợp đồng':'thông tin hợp đồng';return label(key) + ' — bổ sung tại ' + where;}).join('; '); }
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
    function money(n) { return Number(n || 0).toLocaleString('vi-VN') + ' đ'; }
    function enumLabel(options,value){var found=(options||[]).filter(function(o){return o.id===value;})[0];return found?found.label:value||'';}
    function tenantIds(c) { return c.tenantIds && c.tenantIds.length ? c.tenantIds : (c.customerIds && c.customerIds.length ? c.customerIds : (c.customerId ? [c.customerId] : [])); }
    function paymentDefaults(building) {
        var settings = global.RHD.getSettings(), actor = global.RH && global.RH.getSession();
        var financial = {};
        try { financial = JSON.parse(localStorage.getItem('residenthub_settings_v1_' + encodeURIComponent(actor && actor.id || 'standalone')) || '{}').financial || {}; } catch (_) { /* Invalid optional financial settings remain empty. */ }
        var bank = building && building.config || {};
        return { bankName:financial.bank || settings.bankName || bank.bankName || '', bankAccountNumber:financial.accountNumber || settings.bankAccountNumber || bank.bankAccountNumber || '', bankAccountHolder:financial.accountHolder || settings.bankAccountHolder || bank.bankAccountHolder || '' };
    }
    function table(headers, rows) { return '<table><thead><tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; }
    function validate(c) {
        var d = global.RHD, apt = d.get('apartments', c.apartmentId), ids = tenantIds(c);
        if (!global.RHP || !global.RHP.can(c.id ? 'contracts.update' : 'contracts.create')) return 'Bạn không có quyền lưu hợp đồng.';
        if (!apt || apt.buildingId !== c.buildingId || !global.RHP.inScope(c.buildingId)) return 'Căn hộ / tòa nhà không hợp lệ hoặc ngoài phạm vi quản lý.';
        if (!ids.length || ids.some(function (id) { return !d.get('customers', id); })) return 'Vui lòng chọn hồ sơ khách thuê hợp lệ.';
        if (new Set(ids).size !== ids.length || ids.indexOf(c.customerId) < 0) return 'Khách thuê bị trùng hoặc người đại diện chưa thuộc danh sách khách.';
        if (!Number(apt.maxGuests)) return 'Căn hộ chưa cấu hình sức chứa tối đa.';
        if (ids.length > Number(apt.maxGuests)) return 'Số khách thuê vượt sức chứa tối đa (' + apt.maxGuests + ').';
        if (!c.startDate || !c.endDate || c.endDate < c.startDate) return 'Ngày kết thúc phải từ ngày bắt đầu trở đi.';
        if ([c.rentPrice, c.depositPrice].some(function (n) { return !Number.isFinite(n) || n < 0; })) return 'Tiền thuê và tiền cọc phải là số không âm.';
        var inactive = ['draft', 'ended', 'terminated', 'expired', 'liquidated', 'settled', 'closed', 'deposit', 'deposited', 'forfeited', 'deposit_forfeited'];
        var conflict = d.list('contracts').some(function (other) {
            return other.id !== c.id && inactive.indexOf(String(other.status || '').toLowerCase()) === -1 &&
                inactive.indexOf(String(c.status || '').toLowerCase()) === -1 &&
                (!other.endDate || other.endDate >= c.startDate) && (!other.startDate || other.startDate <= c.endDate) &&
                (other.apartmentId === c.apartmentId || tenantIds(other).some(function (id) { return ids.indexOf(id) >= 0; }));
        });
        if (conflict) return 'Căn hộ hoặc khách thuê đã có hợp đồng đang hiệu lực trong thời gian này.';
        var assets = c.handoverAssets || [];
        if (new Set(assets.map(function (a) { return a.assetId; })).size !== assets.length) return 'Tài sản bàn giao bị trùng.';
        for (var i = 0; i < assets.length; i++) {
            var original = d.get('assets', assets[i].assetId);
            if (!original || original.apartmentId !== apt.id || !Number.isInteger(assets[i].quantity) || assets[i].quantity < 1 || assets[i].quantity > Number(original.quantity)) return 'Số lượng hoặc tài sản bàn giao không hợp lệ.';
        }
        var tpl = global.RHT.get(c.contractTemplateId);
        if (!tpl || tpl.type !== 'CONTRACT' || tpl.status === 'archived' || (tpl.buildingId && tpl.buildingId !== c.buildingId)) return 'Chọn biểu mẫu hợp đồng đang áp dụng cho tòa nhà.';
        return '';
    }
    function data(c) {
        var d = global.RHD, b = d.get('buildings', c.buildingId) || {}, a = d.get('apartments', c.apartmentId) || {};
        var tenants = tenantIds(c).map(function (id) { return d.get('customers', id) || {}; });
        var representative = d.get('customers', c.customerId) || {}, settings = d.getSettings();
        var bank = c.paymentSnapshot || paymentDefaults(b);
        var services = c.servicesSnapshot || (b.services || []).filter(function (s) { return (c.serviceIds || []).indexOf(s.id) >= 0; }).map(function (s) { return Object.assign({}, s, { unitPrice: c.serviceOverrides && c.serviceOverrides[s.id] != null ? c.serviceOverrides[s.id] : s.unitPrice }); });
        var assets = c.handoverAssets || [];
        var manager = global.RH && global.RH.getUsers().filter(function (u) { return u.id === b.managerId; })[0];
        var cycle = (d.PAYMENT_CYCLES.filter(function (p) { return p.id === c.paymentCycle; })[0] || {}).label || c.paymentCycle;
        var result = {
            company_name: c.lessorName || settings.orgName || '', manager_name: c.lessorRepresentative || '', building_manager_name: manager && manager.name || '',
            building_name:b.name, building_code:b.shortName || b.code, building_address:d.buildingFullAddress(b), billing_day:c.billingDay,
            room_number:a.name, room_address:a.address || d.buildingFullAddress(b), room_area:a.area, room_capacity:a.maxGuests,
            tenant_name:representative.fullName, tenant_phone:representative.phone, tenant_id_number:representative.idNumber,
            contract_code:c.code, sign_date:c.signDate, start_date:c.startDate, end_date:c.endDate, payment_cycle:cycle,
            rental_term:c.startDate && c.endDate ? c.startDate + ' — ' + c.endDate : '',
            rent_price:money(c.rentPrice), deposit_price:money(c.depositPrice), deposit_amount:money(c.depositPrice),
            first_month_rent:money(c.rentPrice), bank_name:bank.bankName, bank_account_number:bank.bankAccountNumber, bank_account_holder:bank.bankAccountHolder,
            due_date:c.paymentDueDate, due_days:c.dueDays, custom_terms:c.customTerms,
            tenants_table:table(['Họ tên','SĐT','CCCD','Đại diện'], tenants.map(function (t) { return [t.fullName,t.phone,t.idNumber,t.id === c.customerId ? 'Có' : '']; })),
            services_table:table(['Dịch vụ','Đơn giá','Cách tính','Thuế (%)'],services.map(function (s) { return [s.name,money(s.unitPrice),enumLabel(d.CALC_METHODS,s.calcMethod),s.taxRate]; })),
            assets_table:table(['Tài sản','Số lượng','Tình trạng','Giá trị','Ghi chú'],assets.map(function (asset) { return [asset.name,asset.quantity,enumLabel(d.ASSET_CONDITIONS,asset.condition),money(asset.value),asset.note]; }))
        };
        // Consumption-based fees cannot be guessed at signing time.
        var initialService = c.initialServiceAmount;
        if (services.length === 1) {
            result.service_name = services[0].name; result.service_unit_price = money(services[0].unitPrice);
            result.service_calculation = enumLabel(d.CALC_METHODS,services[0].calcMethod); result.service_tax_rate = services[0].taxRate;
        }
        if (assets.length === 1) {
            result.asset_name = assets[0].name; result.asset_quantity = assets[0].quantity;
            result.asset_condition = enumLabel(d.ASSET_CONDITIONS,assets[0].condition); result.asset_value = money(assets[0].value);
        }
        result.initial_service_amount = initialService == null ? '' : money(initialService);
        result.additional_amount = c.additionalAmount == null ? '' : money(c.additionalAmount);
        result.total_amount = initialService == null || c.additionalAmount == null ? '' : money(c.rentPrice + c.depositPrice + initialService + c.additionalAmount);
        result.initial_costs_table = initialService == null || c.additionalAmount == null ? '' : table(['Khoản thu','Số tiền'], [['Tiền thuê kỳ đầu',money(c.rentPrice)],['Tiền cọc',money(c.depositPrice)],['Dịch vụ kỳ đầu',money(initialService)],['Phát sinh',money(c.additionalAmount)],['Tổng',result.total_amount]]);
        result.service_rows_html = services.map(function (s) { return '<tr><td>' + esc(s.name) + '</td><td>' + esc(enumLabel(d.CALC_METHODS,s.calcMethod)) + '</td><td></td><td>' + esc(money(s.unitPrice)) + '</td></tr>'; }).join('');
        return result;
    }
    function render(template, values) {
        var missing = [], html = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function (_, key) {
            var value = values[key];
            if (value == null || value === '') { if (missing.indexOf(key) < 0) missing.push(key); return '<mark data-missing="' + key + '">Chưa có ' + esc(label(key).toLocaleLowerCase('vi')) + '</mark>'; }
            return /^(tenants_table|services_table|assets_table|initial_costs_table|service_rows_html)$/.test(key) ? value : esc(value);
        });
        return { html:html, missing:missing };
    }
    function documentFor(c) {
        if (c.documentSnapshot) return copy(c.documentSnapshot);
        var tpl = global.RHT.get(c.contractTemplateId);
        if (!tpl) return { html:'', missing:['contract_template'] };
        var values = data(c), rendered = render(global.RHT.sanitize(tpl.html_template), values);
        return { templateId:tpl.id, version:tpl.version || 1, templateName:tpl.name, templateHtml:tpl.html_template, data:values, html:rendered.html, missing:rendered.missing, capturedAt:Date.now() };
    }
    function prepare(c, before) {
        var error = validate(c);
        if (error) return { ok:false,error:error };
        // Existing signed records retain their document, including legacy records on first edit.
        var next = copy(c), old = before && before.signDate ? before : null;
        delete next.documentSnapshot;
        next.documentSnapshot = before && before.documentSnapshot || (old ? documentFor(old) : null);
        if (!next.documentSnapshot && next.signDate) {
            var doc = documentFor(next);
            if (doc.missing.length) return { ok:false,error:'Chưa thể ký: ' + missingMessage(doc.missing) };
            next.documentSnapshot = doc;
        }
        return { ok:true,item:next };
    }
    function print(doc) {
        if (!doc || !doc.html) { alert('Tài liệu chưa có nội dung để in.'); return; }
        var frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;width:0;height:0;border:0'; document.body.appendChild(frame);
        frame.onload = function () { frame.contentWindow.focus(); frame.contentWindow.print(); };
        frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8">' + global.RHT.DOC_STYLE + '<style>@page{size:A4;margin:20mm}body{margin:0}table{width:100%;border-collapse:collapse}td,th{border:1px solid #aaa;padding:6px}tr{break-inside:avoid}.page-break{break-before:page}header,footer{display:block}</style></head><body>' + doc.html + '</body></html>';
        frame.contentWindow.addEventListener('afterprint', function () { frame.remove(); });
    }
    function freezeLegacy(templateId) {
        var key = 'residenthub_' + (global.RHD_MODE || 'live') + '_contracts';
        var rows = global.RHD.list('contracts'), changed = false;
        rows.forEach(function (c) {
            if (c.signDate && !c.documentSnapshot && (!templateId || c.contractTemplateId === templateId)) {
                c.documentSnapshot = documentFor(c); c.documentSnapshot.legacyCapture = true; changed = true;
            }
        });
        if (changed) localStorage.setItem(key, JSON.stringify(rows));
    }
    var exportLoader;
    function loadExporter(){if(global.RHDocumentExport)return Promise.resolve(global.RHDocumentExport);if(!exportLoader)exportLoader=new Promise(function(resolve,reject){var script=document.createElement('script');script.src='dist/document-export/document-export.js';script.onload=function(){resolve(global.RHDocumentExport);};script.onerror=function(){exportLoader=null;reject(new Error('Chưa tải được công cụ xuất. Vui lòng tải lại trang và thử lại.'));};document.head.appendChild(script);});return exportLoader;}
    function preview(doc, options) {
        options=options||{};
        if(options.sample)doc=Object.assign({},doc,{html:'<p style="padding:10px;border:1px solid #cba143;color:#795600">DỮ LIỆU MINH HỌA — không phải hợp đồng thật.</p>'+doc.html});
        var dialog=document.createElement('dialog');dialog.className='contract-preview-dialog';
        var missing=doc.missing||[], disabled=false;
        dialog.innerHTML='<header class="contract-preview-head"><h3>'+esc(options.title||'Xem trước hợp đồng')+'</h3><button type="button" data-action="print"><i class="fas fa-print"></i> In</button><button type="button" data-action="pdf"><i class="fas fa-file-pdf"></i> Tải PDF</button><button type="button" data-action="word"><i class="fas fa-file-word"></i> Tải Word (.docx)</button><button type="button" data-action="close" aria-label="Đóng xem trước">Đóng</button></header>'+(options.sample?'<p class="contract-missing">Dữ liệu minh họa — file xuất sẽ giữ nhãn minh họa. Chọn hợp đồng để dùng dữ liệu thật.</p>':'')+(missing.length?'<div class="contract-missing"><strong>Bản nháp còn thiếu thông tin — vẫn có thể in hoặc tải xuống</strong><p>'+esc(missingMessage(missing))+'</p></div>':'')+'<p class="contract-export-status" role="status"></p><section class="contract-preview-content"><div class="rh-print-area">'+global.RHT.DOC_STYLE+doc.html+'</div></section>';
        dialog.querySelector('[data-action="close"]').onclick=function(){dialog.remove();};
        ['print','pdf','word'].forEach(function(action){var button=dialog.querySelector('[data-action="'+action+'"]');button.disabled=!!disabled;button.onclick=async function(){var status=dialog.querySelector('[role="status"]');try{if(action==='print'){print(doc);return;}status.textContent='Đang tạo tài liệu, vui lòng chờ…';dialog.querySelectorAll('[data-action]:not([data-action="close"])').forEach(function(b){b.disabled=true;});var exporter=await loadExporter();await exporter[action](doc);status.textContent='Tài liệu đã sẵn sàng trong mục tải xuống.';}catch(error){status.textContent=error.message||'Chưa xuất được tài liệu. Vui lòng thử lại.';}finally{dialog.querySelectorAll('[data-action]:not([data-action="close"])').forEach(function(b){b.disabled=!!disabled;});}};});
        document.body.appendChild(dialog);dialog.showModal();return dialog;
    }
    global.RHDocuments = { preview:preview,loadExporter:loadExporter,labels:labels,label:label,missingMessage:missingMessage,validate:validate, prepare:prepare, data:data, render:render, documentFor:documentFor, print:print, tenantIds:tenantIds, paymentDefaults:paymentDefaults, freezeLegacy:freezeLegacy };
})(window);
