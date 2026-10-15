/* Native rich text editing, using the existing RHT library and RHSelect controls. */
(function (global) {
    var editorState = {}, savedRange;
    var groups = {
        'Tòa nhà':['building_name','building_code','building_address','building_manager_name','manager_name','billing_day'],
        'Căn hộ':['room_number','room_address','room_area','room_capacity','rent_price','deposit_price'],
        'Khách thuê':['tenant_name','tenant_phone','tenant_id_number','tenants_table'],
        'Hợp đồng':['contract_code','sign_date','rental_term','start_date','end_date','payment_cycle'],
        'Dịch vụ':['service_name','service_unit_price','service_calculation','service_tax_rate','services_table','service_rows_html'], 'Tài sản':['asset_name','asset_quantity','asset_condition','asset_value','assets_table'],
        'Chi phí ban đầu':['first_month_rent','deposit_amount','initial_service_amount','additional_amount','total_amount','initial_costs_table'],
        'Thanh toán':['bank_name','bank_account_holder','bank_account_number','due_date','due_days'],
        'Điều khoản':['custom_terms','company_name']
    };
    function byId(id) { return document.getElementById(id); }
    function esc(v) { return global.escapeHtml(v); }
    function remember() {
        var selection = global.getSelection();
        if (selection.rangeCount && byId('tplVisual').contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
    }
    function restore() { byId('tplVisual').focus(); if (savedRange && savedRange.startContainer.isConnected) { var selection = global.getSelection(); selection.removeAllRanges(); var node=savedRange.startContainer,element=node.nodeType===1?node:node.parentElement,chip=element.closest&&element.closest('[contenteditable=false]');if(chip&&byId('tplVisual').contains(chip)){savedRange.setStartAfter(chip);savedRange.collapse(true);}selection.addRange(savedRange); } }
    function command(cmd, value) { restore(); document.execCommand(cmd, false, value); remember(); changed(); }
    function insert(html) { command('insertHTML', html); }
    function editorHtml(tpl) {
        return '<form id="templateVisualForm" class="de-shell"><header class="de-header"><button type="button" id="tplCancel" title="Quay lại thư viện"><i class="fas fa-arrow-left"></i><span>Quay lại</span></button><div class="de-title"><input aria-label="Tên mẫu" id="tplName" required value="' + esc(tpl.name) + '"><small id="tplSaveStatus" role="status">Đã mở biểu mẫu</small></div><div class="de-actions"><button type="button" id="tplPreviewReal"><i class="fas fa-eye"></i> Xem trước</button><button type="submit" class="btn-primary"><i class="fas fa-check"></i> Lưu</button><button id="tplSaveVersion" type="button"><i class="fas fa-copy"></i> Lưu thành mẫu mới</button></div></header><div id="tplToolbar" class="de-toolbar" role="toolbar" aria-label="Định dạng văn bản"></div><div class="de-workspace"><main class="de-canvas"><div class="de-ruler">A4 · 210 × 297 mm</div><article id="tplVisual" class="de-page doc" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Nội dung biểu mẫu"></article></main><aside class="de-sidebar"><h3>Trường dữ liệu</h3><p>Chọn trường để chèn tại con trỏ.</p><input id="tplFieldSearch" type="search" placeholder="Tìm tên, giá thuê, ngày ký…" aria-label="Tìm trường dữ liệu"><div id="tplVariable"></div><section><h3>Dữ liệu xem trước</h3><div id="tplContract"></div><p id="tplPreviewHint">Chưa chọn hợp đồng: xem dữ liệu minh họa.</p></section><details><summary>Thiết lập biểu mẫu</summary><label>Phạm vi</label><select id="tplBuilding"><option value="">Toàn hệ thống</option>' + RHP.scopeList('buildings',RHD.list('buildings')).map(function(b){return '<option value="'+esc(b.id)+'"'+(tpl.buildingId===b.id?' selected':'')+'>'+esc(b.name)+'</option>';}).join('') + '</select><label>Trạng thái</label><select id="tplStatus"><option value="active">Đang dùng</option><option value="archived"'+(tpl.status==='archived'?' selected':'')+'>Ngừng áp dụng</option></select></details></aside></div><div id="tplError" class="de-error" role="alert"></div></form>';
    }
    function chip(key){return '<span class="de-chip" contenteditable="false" data-template-key="'+esc(key)+'">'+esc(RHDocuments.label(key))+'</span>';}
    function hydrate(html){var box=document.createElement('div');box.innerHTML=RHT.sanitize(html.replace(/\{\{\s*service_rows_html\s*\}\}/g,'<tr data-template-repeat="service_rows_html"><td colspan="4">'+chip('service_rows_html')+'</td></tr>'));box.querySelectorAll('style').forEach(function(n){n.remove();});var walk=document.createTreeWalker(box,NodeFilter.SHOW_TEXT),nodes=[];while(walk.nextNode())nodes.push(walk.currentNode);nodes.forEach(function(n){if(!/\{\{/.test(n.textContent))return;var fragment=document.createElement('template');fragment.innerHTML=esc(n.textContent).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,function(_,key){return chip(key);});n.replaceWith(fragment.content);});return box.innerHTML;}
    function draftKey(id){return 'residenthub_template_draft_'+(global.RHD_MODE||'live')+'_'+(global.RH_SESSION&&global.RH_SESSION.id||'anonymous')+'_'+id;}
    function changed(){editorState.dirty=true;byId('tplSaveStatus').textContent='Chưa lưu · đang giữ bản nháp';try{localStorage.setItem(draftKey(editorState.tpl.id),JSON.stringify({html:byId('tplVisual').innerHTML,name:byId('tplName').value,buildingId:byId('tplBuilding').value,status:byId('tplStatus').value}));byId('tplSaveStatus').textContent='Bản nháp đã lưu trên máy';}catch(_){byId('tplSaveStatus').textContent='Chưa lưu — bộ nhớ máy đã đầy';}}
    function closeEditor(){if(editorState.dirty&&!confirm('Bạn có thay đổi chưa lưu vào thư viện. Quay lại và giữ bản nháp trên máy?'))return;byId('templateEditorHost').remove();document.body.style.overflow=editorState.previousOverflow;}
    global.editTemplate = function (id) {
        var tpl = RHT.get(id); if (!tpl || !RHP.guard(tpl.is_system ? 'templates.create' : 'templates.update')) return;
        if(byId('templateEditorHost'))return; editorState = { tpl:tpl,previousOverflow:document.body.style.overflow,dirty:false }; savedRange = null;
        var host=document.createElement('div');host.id='templateEditorHost';host.innerHTML=RHT.DOC_STYLE+editorHtml(tpl);document.body.appendChild(host);document.body.style.overflow='hidden';
        var original=document.createElement('template');original.innerHTML=RHT.sanitize(tpl.html_template);editorState.styles=Array.from(original.content.querySelectorAll('style')).map(function(n){return n.outerHTML;}).join('');var editor=byId('tplVisual');editor.innerHTML=hydrate(tpl.html_template);
        var draft;try{draft=JSON.parse(localStorage.getItem(draftKey(tpl.id))||'null');}catch(_){}
        if(draft){editor.innerHTML=hydrate(draft.html);byId('tplName').value=draft.name;byId('tplBuilding').value=draft.buildingId;byId('tplStatus').value=draft.status;editorState.dirty=true;byId('tplSaveStatus').textContent='Đã khôi phục bản nháp chưa lưu';}
        editor.addEventListener('input',changed);['tplName','tplBuilding','tplStatus'].forEach(function(id){byId(id).addEventListener('input',changed);});
        editor.addEventListener('keyup', remember); editor.addEventListener('mouseup', remember); editor.addEventListener('input', remember);
        buildToolbar();
        function renderFields(){var q=byId('tplFieldSearch').value.toLocaleLowerCase('vi');byId('tplVariable').innerHTML='';Object.keys(groups).forEach(function(group){var keys=groups[group].filter(function(key){return RHDocuments.label(key).toLocaleLowerCase('vi').includes(q)||group.toLocaleLowerCase('vi').includes(q);});if(!keys.length)return;var section=document.createElement('section');section.innerHTML='<h4>'+esc(group)+'</h4>';keys.forEach(function(key){var b=document.createElement('button');b.type='button';b.className='de-field';b.textContent=RHDocuments.label(key);b.title='Chèn '+RHDocuments.label(key);b.onmousedown=function(e){e.preventDefault();};b.onclick=function(){insert(chip(key)+' ');changed();};section.appendChild(b);});byId('tplVariable').appendChild(section);});}
        byId('tplFieldSearch').oninput=renderFields;renderFields();
        editorState.contract = RHSelect.create(byId('tplContract'), { placeholder:'Chọn hợp đồng thực...', options:RHP.scopeList('contracts', RHD.list('contracts')).map(function (c) { return {value:c.id,label:c.code,sub:c.startDate}; }) });
        byId('tplPreviewReal').onclick = function () { previewReal(); };
        byId('templateVisualForm').onsubmit = function (ev) { ev.preventDefault(); save(false); };
        if (byId('tplSaveVersion')) byId('tplSaveVersion').onclick = function () { save(true); };
        byId('tplCancel').onclick = closeEditor;
    };
    function buildToolbar() {
        var toolbar=byId('tplToolbar'),target;
        function group(label){target=document.createElement('div');target.className='de-tool-group';target.setAttribute('role','group');target.setAttribute('aria-label',label);target.dataset.label=label;toolbar.appendChild(target);return target;}
        function button(label,icon,fn){var b=document.createElement('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.innerHTML='<i class="fas fa-'+icon+'"></i>';b.onmousedown=function(e){e.preventDefault();};b.onclick=fn;target.appendChild(b);}
        function select(label,values,cmd){var f=document.createElement('select');f.title=label;f.setAttribute('aria-label',label);f.innerHTML='<option value="">'+label+'</option>'+values.map(function(v){return '<option value="'+esc(v[0])+'">'+esc(v[1])+'</option>';}).join('');f.onchange=function(){command(cmd,f.value);f.value='';};target.appendChild(f);}
        group('Định dạng văn bản');button('Hoàn tác','rotate-left',function(){command('undo');});button('Làm lại','rotate-right',function(){command('redo');});select('Font',[['Arial','Arial'],['Times New Roman','Times New Roman'],['Calibri','Calibri']],'fontName');select('Cỡ chữ',[['1','8'],['2','10'],['3','12'],['4','14'],['5','18'],['6','24'],['7','36']],'fontSize');select('Đoạn / Tiêu đề',[['p','Đoạn văn'],['h1','Tiêu đề 1'],['h2','Tiêu đề 2'],['h3','Tiêu đề 3']],'formatBlock');
        [['Đậm','bold','bold'],['Nghiêng','italic','italic'],['Gạch chân','underline','underline']].forEach(function(v){button(v[0],v[1],function(){command(v[2]);});});
        group('Căn lề');[['Trái','align-left','justifyLeft'],['Giữa','align-center','justifyCenter'],['Phải','align-right','justifyRight'],['Căn đều','align-justify','justifyFull']].forEach(function(v){button(v[0],v[1],function(){command(v[2]);});});
        group('Danh sách');button('Danh sách dấu đầu dòng','list-ul',function(){command('insertUnorderedList');});button('Danh sách đánh số','list-ol',function(){command('insertOrderedList');});
        RHTableTools.mount(group('Chèn và chỉnh sửa bảng'),{restore:restore,remember:remember,changed:changed,insert:insert});
        group('Chèn dữ liệu');button('Tìm và chèn trường dữ liệu','tags',function(){byId('tplFieldSearch').focus();});
        group('Bố cục trang');button('Ngắt trang','file-circle-plus',function(){insert('<div class="page-break" style="break-before:page"><br></div><p><br></p>');});button('Đầu trang','arrow-up',function(){insert('<header><p>Nhập nội dung đầu trang</p></header>');});button('Chân trang','arrow-down',function(){insert('<footer><p>Nhập nội dung chân trang</p></footer>');});button('Thêm điều khoản','paragraph',function(){insert('<section class="doc-clause"><h3>Điều khoản mới</h3><p>Nhập nội dung điều khoản</p></section>');});
    }
    function content() { var box=byId('tplVisual').cloneNode(true);box.querySelectorAll('[data-template-repeat]').forEach(function(n){n.replaceWith(document.createTextNode('{{'+n.dataset.templateRepeat+'}}'));});box.querySelectorAll('[data-template-key]').forEach(function(n){n.replaceWith(document.createTextNode('{{'+n.dataset.templateKey+'}}'));});return (editorState.styles||RHT.DOC_STYLE)+'<div class="doc">'+RHT.sanitize(box.innerHTML)+'</div>'; }
    function save(asNew) {
        var tpl=editorState.tpl, name=byId('tplName').value.trim(); if(!name) { byId('tplError').textContent='Vui lòng nhập tên mẫu.'; return; }
        var patch={name:name,html_template:content(),buildingId:byId('tplBuilding').value,status:byId('tplStatus').value};
        var result=tpl.is_system||asNew?RHT.clone(tpl.id,asNew,patch):RHT.update(tpl.id,patch);
        if(!result.ok) { byId('tplError').textContent=result.error; return; }
        localStorage.removeItem(draftKey(tpl.id));editorState.dirty=false;byId('tplSaveStatus').textContent='Đã lưu vào thư viện';editorState.tpl=result.item;global.renderContractTab();global.renderInvoiceTab();
    }
    function previewReal() {
        var id=editorState.contract.getValue(), c=RHD.get('contracts',id);
        var values=c ? (c.documentSnapshot ? c.documentSnapshot.data : RHDocuments.data(c)) : global.sampleTemplateData(), rendered=RHDocuments.render(content(),values);
        if(!c){
            values.tenants_table='<table><tr><th>Khách thuê</th><th>Vai trò</th></tr><tr><td>Nguyễn Thị Hoa (minh họa)</td><td>Đại diện</td></tr><tr><td>Trần Văn Bình (minh họa)</td><td>Khách thuê</td></tr></table>';
            values.services_table='<table><tr><th>Dịch vụ</th><th>Đơn giá</th></tr><tr><td>Internet (minh họa)</td><td>100.000 đ</td></tr></table>';
            values.assets_table='<table><tr><th>Tài sản</th><th>Số lượng</th><th>Tình trạng</th></tr><tr><td>Giường (minh họa)</td><td>1</td><td>Tốt</td></tr></table>';
            values.initial_costs_table='<table><tr><th>Khoản thu</th><th>Số tiền minh họa</th></tr><tr><td>Tiền thuê kỳ đầu</td><td>2.000.000 đ</td></tr><tr><td>Tiền cọc</td><td>2.000.000 đ</td></tr></table>';
        }
        if(!c) Object.keys(RHDocuments.labels).forEach(function(key){if(values[key]===undefined)values[key]='Minh họa: '+RHDocuments.label(key);});
        rendered=RHDocuments.render(content(),values);
        RHDocuments.preview(rendered,{title:'Xem trước — '+byId('tplName').value,sample:!c});
    }
    global.addEventListener('beforeunload',function(e){if(byId('templateEditorHost')&&editorState.dirty){e.preventDefault();e.returnValue='';}});
    // Search is local to the library and does not change dashboard navigation.
    var search=document.createElement('input'); search.type='search'; search.placeholder='Tìm biểu mẫu theo tên, loại, phạm vi...'; search.setAttribute('aria-label','Tìm biểu mẫu'); search.style.cssText='width:100%;padding:12px;margin-bottom:16px';
    document.querySelector('.main').prepend(search);
    search.oninput=function () { document.querySelectorAll('.tpl-card').forEach(function(card){card.hidden=card.textContent.toLocaleLowerCase('vi').indexOf(search.value.toLocaleLowerCase('vi'))<0;}); };
    global.setDefaultTemplate = function (id) {
        if (!RHP.guard('templates.update')) return;
        var tpl = RHT.get(id);
        global.openDrawer('Mẫu mặc định — ' + tpl.name, '<label>Phạm vi áp dụng</label><select id="defaultTplBuilding"><option value="">Toàn hệ thống</option>' + RHP.scopeList('buildings',RHD.list('buildings')).map(function(b){return '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>';}).join('') + '</select><button type="button" id="saveDefaultTpl">Lưu mặc định</button><div id="defaultTplError" role="alert"></div>');
        byId('saveDefaultTpl').onclick=function(){var result=RHT.setDefault(id,byId('defaultTplBuilding').value);if(!result.ok){byId('defaultTplError').textContent=result.error;return;}global.closeDrawer();global.renderContractTab();global.renderInvoiceTab();};
    };
    global.previewTemplate=function(id,contractId){
        var tpl=RHT.get(id);if(!tpl||!RHP.guard('templates.view'))return;
        var contract=RHP.scopeList('contracts',RHD.list('contracts')).filter(function(c){return c.id===contractId;})[0];
        var values=contract?(contract.documentSnapshot?contract.documentSnapshot.data:RHDocuments.data(contract)):global.sampleTemplateData();
        var doc=RHDocuments.render(tpl.html_template,values),dialog=RHDocuments.preview(doc,{title:tpl.name,sample:!contract});
        var field=document.createElement('div');field.style.cssText='padding:12px 22px;background:white';field.innerHTML='<label>Chọn hợp đồng dùng xem trước</label><div></div>';dialog.querySelector('.contract-preview-head').after(field);
        RHSelect.create(field.querySelector('div'),{value:contractId||'',placeholder:'Dữ liệu minh họa — chọn hợp đồng thật',options:RHP.scopeList('contracts',RHD.list('contracts')).map(function(c){return {value:c.id,label:c.code};}),onChange:function(value){dialog.remove();global.previewTemplate(id,value);}});
    };
})(window);
