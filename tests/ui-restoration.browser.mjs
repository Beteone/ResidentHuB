// Real-page smoke tests use an isolated Edge profile and localStorage.
// Remote decorative resources are omitted so the test works without CDN access.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { checkBuildingAccounts } from './building-account-checks.mjs';
const root = resolve('.');
const server = createServer((req, res) => {
    const path = resolve(root, '.' + req.url.split(/[?#]/)[0]);
    if (!path.startsWith(root + '\\')) { res.writeHead(403).end(); return; }
    try {
        let content = readFileSync(path);
        const extension = extname(path);
        if (extension === '.html') content = Buffer.from(content.toString('utf8')
            .replace(/<script[^>]*src="https?:[^"<>]+"[^>]*><\/script>/g, '')
            .replace(/<link[^>]*href="https?:[^"<>]+"[^>]*>/g, ''));
        res.setHeader('Content-Type', extension === '.js' ? 'text/javascript; charset=utf-8' : extension === '.css' ? 'text/css; charset=utf-8' : extension === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream');
        res.end(content);
    } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const artifactDir = mkdtempSync(join(tmpdir(), 'residenthub-ui-check-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${join(artifactDir, 'profile')}`, 'about:blank'
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
try {
    const endpoint = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Browser startup timeout')), 15000);
        browser.once('error', reject);
        browser.stderr.on('data', chunk => { const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    });
    const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let seq = 0;
    const pending = new Map(), errors = [], pageLogs = [];
    ws.onmessage = e => {
        const message = JSON.parse(e.data);
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') pageLogs.push(message.params.args.map(x => x.description || x.value));
        const call = pending.get(message.id);
        if (call) { pending.delete(message.id); message.error ? call.reject(Error(JSON.stringify(message.error))) : call.resolve(message.result); }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 15000);
        pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    const navigate = async path => {
        await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${path}` });
        for (let i = 0; i < 150; i++) {
            if (await evaluate('document.readyState === "complete" && !!window.RHD')) return;
            await new Promise(r => setTimeout(r, 50));
        }
        throw Error('Load timeout');
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__alerts=[];window.alert=message=>window.__alerts.push(message);window.confirm=()=>true;' });
    await send('Emulation.setDeviceMetricsOverride', { width: 1364, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigate('/dashboard.html#demo=1');
    console.log('Dashboard loaded', JSON.stringify({ errors, pageLogs }));
    const legacyManagerMenu = await evaluate(`(()=>{const manager=RH.getUsers().find(u=>u.role==="manager");delete manager.accountTypeId;localStorage.setItem("residenthub_users",JSON.stringify(RH.getUsers()));window.RH_SESSION={id:manager.id,role:"manager"};applyNavPermissions();const result={canViewBuildings:RHP.can("buildings.view"),isAdmin:RHP.isAdmin(),buildingsMenu:document.querySelector('[data-perm="buildings.view"]').style.display};window.RH_SESSION={id:"demo",demo:true};applyNavPermissions();return result})()`);
    assert.deepEqual(legacyManagerMenu, { canViewBuildings: true, isAdmin: false, buildingsMenu: '' }, 'Legacy manager accounts show feature navigation without admin access');
    for (const tab of ['dashboard', 'buildings', 'apartments', 'customers', 'meters', 'contracts', 'invoices', 'service-fees', 'deposits', 'cashflow', 'support', 'reports']) {
        await evaluate(`switchTab(${JSON.stringify(tab)})`);
        assert.equal(await evaluate(`document.getElementById(${JSON.stringify(tab + '-tab')}).style.display`), 'block');
        console.log('Tab', tab, await evaluate(`document.getElementById(${JSON.stringify(tab + '-tab')}).innerText.slice(0,100)`));
        if (tab === 'reports') assert.equal(await evaluate('document.getElementById("reports-tab").innerText.includes("PT-MH-001") && !document.querySelector("#reports-tab .fr-sample-notice")'), true, 'An empty report period shows illustrative data without the removed notice');
    }
    console.log('Smoke diagnostics', JSON.stringify({ errors, pageLogs }));
    await evaluate('switchTab("support");const search=document.getElementById("rhSupportSearch");search.focus();search.value="UI";search.setSelectionRange(2,2);search.dispatchEvent(new Event("input"))');
    assert.equal(await evaluate('document.activeElement.id'), 'rhSupportSearch', 'Search remains usable after filtering rebuilds the list');
    assert.equal(await evaluate('document.activeElement.selectionStart'), 2);
    await evaluate('document.getElementById("rhSupportSearch").value="";document.getElementById("rhSupportSearch").dispatchEvent(new Event("input"))');
    for (const [tab, method] of [['buildings','openBuildingForm'], ['apartments','openApartmentForm'], ['customers','openCustomerForm'], ['contracts','openContractForm'], ['invoices','openInvoiceForm'], ['deposits','openDepositForm']]) {
        await evaluate(`switchTab(${JSON.stringify(tab)});RHUI[${JSON.stringify(method)}]()`);
        assert.equal(await evaluate('!!document.querySelector("#rhDrawerOverlay.show form")'), true, method);
        await evaluate('RHUI.closeDrawer()');
        console.log('Form opened', method);
    }
    const contractDraft = await evaluate(`(()=>{
        switchTab('contracts');RHUI.openContractForm();
        const before=RHD.list('contracts').length;
        document.getElementById('contractAddService').click();
        const service=document.querySelector('[data-contract-service^="contract-service-"]');
        const serviceId=service.dataset.contractService;
        service.dispatchEvent(new Event('change'));
        const selected=Array.from(document.querySelectorAll('[data-contract-service]:checked')).map(input=>input.value);
        document.getElementById('contractWorkflowForm').dispatchEvent(new Event('submit',{cancelable:true}));
        const unchanged=RHD.list('contracts').length===before;
        RHUI.closeDrawer();return {serviceId,selected,unchanged};
    })()`);
    assert.equal(contractDraft.selected.includes(contractDraft.serviceId), true, 'Service checkbox keeps the actual ID after rerender');
    assert.equal(contractDraft.unchanged, true, 'Invalid draft still uses the existing business validation');
    await evaluate(`(()=>{const visible=RHD.list('supportRequests')[0];const apartment=RHD.list('apartments').find(item=>visible&&item.buildingId===visible.buildingId)||RHD.list('apartments')[0];const buildingId=visible?visible.buildingId:apartment.buildingId;const created=RHD.create('supportRequests',{id:'ui-request',code:'UI-001',buildingId,apartmentId:apartment.id,residentName:'UI Resident',title:'UI Test',status:'new',priority:'normal',messages:[{from:'Cư dân',text:'Resident question',time:'Now'}],response:'Keep response',customField:'keep'});if(!created.ok)throw Error(created.error);switchTab('support');document.querySelector('[data-support-view="chat"]').click();document.querySelector('[data-support-chat-resident$="ui resident"]').click();document.querySelector('[data-support-chat-id="ui-request"]').click();})()`);
    assert.equal(await evaluate('document.querySelector("[data-support-panel=chat]").classList.contains("active")'), true);
    assert.equal(await evaluate('document.getElementById("supportInboxMessages").textContent.includes("Resident question")'), true);
    await evaluate('document.getElementById("supportInboxReply").value="Inbox draft";window.dispatchEvent(new StorageEvent("storage",{key:"residenthub_demo_supportRequests"}))');
    assert.equal(await evaluate('document.getElementById("supportInboxReply").value'), 'Inbox draft');
    await evaluate('document.getElementById("supportInboxReply").value="Manager reply";document.querySelector("[data-support-send=ui-request]").click()');
    assert.equal(await evaluate('RHD.get("supportRequests","ui-request").messages.at(-1).text'), 'Manager reply');
    assert.equal(await evaluate('RHD.get("supportRequests","ui-request").customField'), 'keep');
    assert.equal(await evaluate('RHD.get("supportRequests","ui-request").response'), 'Keep response');
    await evaluate('RHUI.openSupportForm("ui-request");document.getElementById("srResponse").value="Unsaved response";document.getElementById("srReply").value="Unsaved reply";RHD.update("supportRequests","ui-request",{messages:RHD.get("supportRequests","ui-request").messages.concat([{from:"Cư dân",text:"Resident follow-up",time:"Now"}])});window.dispatchEvent(new StorageEvent("storage",{key:"residenthub_demo_supportRequests"}))');
    assert.equal(await evaluate('document.getElementById("srConversation").textContent.includes("Resident follow-up")'), true);
    assert.equal(await evaluate('document.getElementById("srResponse").value'), 'Unsaved response');
    assert.equal(await evaluate('document.getElementById("srReply").value'), 'Unsaved reply');
    await evaluate('RHUI.sendSupportReply()');
    assert.equal(await evaluate('RHD.get("supportRequests","ui-request").messages.at(-1).text'), 'Unsaved reply');
    assert.equal(await evaluate('document.getElementById("srResponse").value'), 'Unsaved response');
    await evaluate('RHUI.closeDrawer()');
    await send('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(join(artifactDir, 'support-desktop.png'), Buffer.from(r.data, 'base64')));
    // Denied direct handler calls must neither expose nor mutate an out-of-scope request.
    const denial = await evaluate(`(()=>{const original=RHP.scopeList;RHP.scopeList=(entity,rows)=>entity==='supportRequests'?rows.filter(r=>r.id!=='ui-request'):original(entity,rows);RHUI.openSupportForm('ui-request');RHUI.drawerId='ui-request';RHUI.sendSupportReply();RHUI.renderSupportTab();return {open:!!document.querySelector('#rhDrawerOverlay.show'),visible:document.getElementById('support-tab').textContent.includes('UI Resident'),count:RHD.get('supportRequests','ui-request').messages.length};})()`);
    assert.equal(denial.open, false); assert.equal(denial.visible, false); assert.equal(denial.count, 4);
    await evaluate('RHP.can=()=>false;RHP.guard=()=>false;RHUI.renderSupportTab()');
    assert.equal(await evaluate('document.getElementById("support-tab").innerHTML'), '');
    // Reload removes test permission stubs, then use real manager/resident sessions.
    await navigate('/dashboard.html#demo=1');
    await evaluate('(()=>{const rows=RH.getUsers();rows.find(u=>u.role==="manager").accountTypeId=RHP.ADMIN_TYPE_ID;localStorage.setItem("residenthub_users",JSON.stringify(rows));RH.login(rows.find(u=>u.role==="manager"),false)})()');
    await navigate('/dashboard.html');
    await evaluate('switchTab("accounts")');
    assert.equal(await evaluate('!!document.getElementById("accountsTableBody")'), true, 'Existing account UI remains available pending the auth compatibility repair');
    assert.equal(await evaluate('!!document.getElementById("accountRequestsTableBody")'), true, 'Resident approval queue is preserved');
    await evaluate('switchTab("roles")');
    assert.equal(await evaluate('document.getElementById("roles-tab").innerText.includes("Loại tài khoản")'), true);
    await checkBuildingAccounts({ evaluate, send, artifactDir });
    await evaluate(`
        RHD.create('buildings',{id:'live-ui-building',name:'UI Building',shortName:'UI',active:true});
        RHD.create('apartments',{id:'live-ui-apartment',buildingId:'live-ui-building',name:'UI101',status:'occupied'});
        RHD.create('customers',{id:'live-ui-resident',fullName:'Live UI Resident'});
        RHD.create('contracts',{id:'live-ui-contract',code:'UI-HD-001',buildingId:'live-ui-building',apartmentId:'live-ui-apartment',customerId:'live-ui-resident',status:'active',startDate:'2026-01-01',endDate:'2027-12-31',rentPrice:1000000});
        RHD.create('supportRequests',{id:'live-ui-request',code:'UI-YC-001',buildingId:'live-ui-building',apartmentId:'live-ui-apartment',customerId:'live-ui-resident',residentName:'Live UI Resident',title:'Live request',description:'Live description',status:'new',priority:'normal',messages:[]});
        RH.createUser({name:'Live UI Resident',email:'ui-resident@example.test',password:'ui-test-password',role:'resident',residentId:'live-ui-resident',apartmentId:'live-ui-apartment',unit:'UI101'});
        switchTab('support');RHUI.openSupportForm('live-ui-request');document.getElementById('srReply').value='Live manager message';RHUI.sendSupportReply();RHUI.closeDrawer();
        RH.login(RH.getUsers().find(u=>u.email==='ui-resident@example.test'),false);
    `);
    await navigate('/resident-web.html');
    console.log('Resident diagnostics', JSON.stringify({ errors, pageLogs }));
    for (const target of ['overview', 'invoices', 'requests', 'contracts', 'notifications', 'settings', 'calendar']) {
        await evaluate(`showResidentSection(${JSON.stringify(target)})`);
        console.log('Resident page', target);
    }
    assert.equal(await evaluate('RH_CTX.apartment.id'), 'live-ui-apartment');
    assert.equal(await evaluate('RH_CTX.customer.id'), 'live-ui-resident');
    await evaluate('showResidentSection("requests");openRequestDetail("UI-YC-001")');
    assert.equal(await evaluate('document.getElementById("modalBody").textContent.includes("Live manager message")'), true);
    await evaluate('document.getElementById("chatMessage").value="Live resident reply";document.getElementById("sendChat").click()');
    // The existing Resident support handler reloads the page after its local write.
    await new Promise(r => setTimeout(r, 300));
    await navigate('/resident-web.html');
    assert.equal(await evaluate('RHD.get("supportRequests","live-ui-request").messages.at(-1).text'), 'Live resident reply');
    await evaluate('showResidentSection("requests");openRequestDetail("UI-YC-001")');
    await send('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(join(artifactDir, 'resident-support.png'), Buffer.from(r.data, 'base64')));
    await evaluate('RH.login(RH.getUsers().find(u=>u.role==="manager"),false)');
    await navigate('/dashboard.html');
    await evaluate('switchTab("support");RHUI.openSupportForm("live-ui-request")');
    assert.equal(await evaluate('document.getElementById("srConversation").textContent.includes("Live resident reply")'), true);
    await evaluate('RHUI.closeDrawer();document.querySelector("[data-support-view=chat]").click();document.querySelector("[data-support-chat-id=live-ui-request]").click()');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(join(artifactDir, 'support-mobile.png'), Buffer.from(r.data, 'base64')));
    assert.equal(await evaluate('document.querySelector(".support-inbox").getBoundingClientRect().width <= document.querySelector("#support-tab").getBoundingClientRect().width'), true);
    // Diagnostic only: preserve the current implementation and record its actual
    // status/response behavior. All affected records belong to this test profile.
    const supportLogic = await evaluate(`(()=>{
        RHUI.openSupportForm('live-ui-request');
        document.getElementById('srStatus').value='resolved';
        document.getElementById('srResponse').value='AUDIT_RESPONSE_ONLY';
        RHUI.submitSupportForm({preventDefault(){}});
        const request=RHD.get('supportRequests','live-ui-request');
        return {status:request.status,response:request.response,resolvedAt:request.resolvedAt||null,resolutionNote:request.resolutionNote||null,hasScheduleField:!!document.getElementById('srScheduledAt')};
    })()`);
    const assetLogic = await evaluate(`(async()=>{
        await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='asset-module.js';script.onload=resolve;script.onerror=reject;document.head.appendChild(script)});
        RHD.create('assets',{id:'audit-asset',buildingId:'live-ui-building',apartmentId:'live-ui-apartment',name:'Audit Asset',condition:'new',quantity:1});
        let detailError=null;
        try{RHAssets.openDetail('audit-asset')}catch(error){detailError=error.message}
        let formError=null;
        try{RHAssets.openForm()}catch(error){formError=error.message}
        const conditionOptions=document.getElementById('afCondition')?.options.length??null;
        RHUI.closeDrawer();
        return {detailError,formError,conditionOptions,nextCode:typeof RHD.nextAssetCode,conditions:typeof RHD.ASSET_CONDITIONS};
    })()`);
    console.log('ASSET_LOGIC_AUDIT', JSON.stringify(assetLogic));
    await evaluate('RH.login(RH.getUsers().find(u=>u.email==="ui-resident@example.test"),false)');
    await navigate('/resident-web.html');
    await evaluate('showResidentSection("requests");openRequestDetail("UI-YC-001")');
    supportLogic.responseVisibleToResident = await evaluate('document.getElementById("modalBody").textContent.includes("AUDIT_RESPONSE_ONLY")');
    console.log('SUPPORT_LOGIC_AUDIT', JSON.stringify(supportLogic));
    writeFileSync(join(artifactDir, 'support-logic-audit.json'), JSON.stringify(supportLogic, null, 2));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(pageLogs.length, 0, JSON.stringify(pageLogs));
    console.log('Passed support conversation, live refresh, draft preservation, scope/permission checks. Artifacts:', artifactDir);
} finally { ws?.close(); browser.kill(); server.closeAllConnections(); server.close(); }
