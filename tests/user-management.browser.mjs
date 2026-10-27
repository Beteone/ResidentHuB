// Real-page smoke tests use an isolated Edge profile and localStorage.
// Remote decorative resources are omitted so the test works without CDN access.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
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
        await evaluate('window.__navigationPending=true');
        await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${path}` });
        for (let i = 0; i < 150; i++) {
            if (await evaluate(`!window.__navigationPending && location.pathname === ${JSON.stringify(path.split(/[?#]/)[0])} && document.readyState === "complete" && !!window.RHD`)) return;
            await new Promise(r => setTimeout(r, 50));
        }
        throw Error('Load timeout');
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__alerts=[];window.alert=message=>window.__alerts.push(message);window.confirm=()=>true;' });
    await send('Emulation.setDeviceMetricsOverride', { width: 1364, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-color-scheme',value:'dark'}]});
    await navigate('/dashboard.html#demo=1');
    assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
    // Independent profile only: prepare an Admin actor and business fixtures, then use real navigation/forms.
    await evaluate(`const users=RH.getUsers();users[0].accountTypeId=RHP.ADMIN_TYPE_ID;users[0].allBuildings=true;localStorage.setItem('residenthub_users',JSON.stringify(users));RH.login(users[0],false)`);
    await navigate('/dashboard.html');
    const click = async selector => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw Error('Missing UI control: '+${JSON.stringify(selector)});node.click()})()`);
    const textButton = async (selector,text) => evaluate(`(()=>{const node=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(n=>n.textContent.includes(${JSON.stringify(text)}));if(!node)throw Error('Missing button: '+${JSON.stringify(text)});node.click()})()`);
    const fill = async values => evaluate(`Object.entries(${JSON.stringify(values)}).forEach(([id,value])=>{const node=document.getElementById(id);if(!node)throw Error('Missing field '+id);node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}))})`);
    const submit = () => click('#rhDrawerOverlay.show form button[type="submit"]');
    const menu = name => textButton('.sidebar-menu-item.rh-nav-child',name);
    const addUser = () => textButton('#accounts-tab button','Thêm người dùng');
    const select = async (id,label) => {await click('#'+id+' .rh-ss-trigger');await textButton('#'+id+' .rh-ss-option',label);};
    await evaluate(`window.__admin=RH.getSession().id;RHD.create('buildings',{id:'restore-building',name:'Restore Building',code:'RESTORE',active:true});RHD.create('apartments',{id:'restore-apartment',buildingId:'restore-building',name:'RESTORE101',status:'vacant'});RHD.create('customers',{id:'restore-resident',fullName:'Restore Resident',phone:'0902222444'});RHD.create('customers',{id:'restricted-resident',fullName:'Restricted Resident',phone:'0902222666'})`);
    await menu('Người dùng');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("#accounts-tab button")).filter(n=>n.textContent.includes("Thêm người dùng")).length'),1);
    assert.equal(await evaluate('document.getElementById("accountForm")'),null);
    assert.equal(await evaluate('!!document.getElementById("staffProfileUpdates")'),true);
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#accounts-tab .asset-filters")).display'),'grid');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#accounts-tab .acc-subtabs")).display'),'flex');
    await addUser();
    assert.equal(await evaluate('!!document.getElementById("ufTypeField")'),true);
    await click('#ufTypeField .rh-ss-trigger');
    assert.equal(await evaluate('RHP.listTypes().every(t=>Array.from(document.querySelectorAll("#ufTypeField .rh-ss-option")).some(n=>n.textContent.includes(t.name)))'),true);
    await textButton('#ufTypeField .rh-ss-option','Quản lý tòa nhà');
    await fill({ufName:'Restored Manager',ufPhone:'0902222333',ufPassword:'test-pass',ufPassword2:'test-pass',ufDept:'Operations',ufTitle:'Building manager'});
    await submit();
    assert.equal(await evaluate('RH.getUsers().some(u=>u.name==="Restored Manager"&&u.accountTypeId==="at-building-manager"&&u.role==="manager"&&u.department==="Operations")'),true);
    assert.equal(await evaluate('RH.authenticateDetailed("090 222 2333","test-pass").ok'),true);
    console.log('PASS 1-4,6: menu, one button, form, dynamic types, manager and phone login');
    await addUser();
    await select('ufTypeField','Nhân viên');
    await fill({ufName:'Restored Staff',ufPhone:'0902222777',ufPassword:'test-pass',ufPassword2:'test-pass',ufDept:'Technical',ufTitle:'Technician'});
    await evaluate(`document.getElementById('ufStaffGroup').value=RHD.SUPPORT_STAFF_GROUPS[0].id`);
    await click('#ufBuildingsField .rh-ss-trigger');
    await textButton('#ufBuildingsField .rh-ss-option','Restore Building');
    await submit();
    assert.equal(await evaluate('RH.getUsers().some(u=>u.name==="Restored Staff"&&u.staffGroup&&u.buildingIds.includes("restore-building"))'),true);
    await addUser();
    await select('ufTypeField','Cư dân');
    await evaluate(`document.getElementById('ufResident').nextElementSibling.querySelector('.rh-ss-trigger').click()`);
    await textButton('.rh-ss-option','Restore Resident');
    await select('ufResidentBuilding','Restore Building');await select('ufResidentApartment','RESTORE101');
    await fill({ufPassword:'test-pass',ufPassword2:'test-pass'});await submit();
    assert.equal(await evaluate('RH.getUsers().some(u=>u.role==="resident"&&u.residentId==="restore-resident"&&u.apartmentId==="restore-apartment")'),true);
    console.log('PASS 5-6: resident profile/apartment and staff group/building');
    await menu('Loại tài khoản');
    await textButton('#roles-tab button','Thêm loại tài khoản');
    await fill({rfName:'Custom configured type'});await submit();
    assert.equal(await evaluate('RHP.listTypes().some(t=>t.name==="Custom configured type")'),true);
    await menu('Người dùng');await addUser();await select('ufTypeField','Custom configured type');
    await fill({ufName:'Custom User',ufPhone:'0902222888',ufPassword:'test-pass',ufPassword2:'test-pass'});await submit();
    assert.equal(await evaluate('RH.getUsers().some(u=>u.name==="Custom User"&&RHP.getType(u.accountTypeId).name==="Custom configured type")'),true);
    console.log('PASS 7: create type in Roles UI, select it and create a user');
    // Prepare a real restricted actor, never replace RHP.can.
    await menu('Loại tài khoản');await textButton('#roles-tab button','Thêm loại tài khoản');
    await fill({rfName:'Resident creator only'});await click('.pm-perm[data-perm="users.createResident"]');await submit();
    await menu('Người dùng');await addUser();await select('ufTypeField','Resident creator only');
    await fill({ufName:'Restricted Creator',ufPhone:'0902222999',ufPassword:'test-pass',ufPassword2:'test-pass'});
    await click('#ufBuildingsField .rh-ss-trigger');await textButton('#ufBuildingsField .rh-ss-option','Restore Building');await submit();
    await evaluate(`RH.login(RH.getUsers().find(u=>u.name==='Restricted Creator'),false)`);await navigate('/dashboard.html');
    await menu('Người dùng');await addUser();await click('#ufTypeField .rh-ss-trigger');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("#ufTypeField .rh-ss-option")).every(n=>RHP.listTypes().filter(t=>t.portal==="resident").some(t=>n.textContent.includes(t.name)))'),true);
    assert.equal(await evaluate('RH.createUser({name:"Forbidden",phone:"0903333444",password:"test-pass",role:"resident",accountTypeId:"at-building-manager"}).ok'),false,'A forged role cannot bypass type-based permission');
    assert.equal(await evaluate('RH.approveAccountRequest("missing",RH.getSession().id,{}).error'),'Bạn không có quyền duyệt tài khoản cư dân.');
    assert.equal(await evaluate('RH.rejectAccountRequest("missing",RH.getSession().id,"").error'),'Bạn không có quyền duyệt tài khoản cư dân.');
    await textButton('#ufTypeField .rh-ss-option','Cư dân');
    await evaluate(`document.getElementById('ufResident').nextElementSibling.querySelector('.rh-ss-trigger').click()`);
    await textButton('.rh-ss-option','Restricted Resident');await select('ufResidentBuilding','Restore Building');await select('ufResidentApartment','RESTORE101');
    await fill({ufPassword:'test-pass',ufPassword2:'test-pass'});await submit();
    assert.equal(await evaluate('RH.getUsers().some(u=>u.residentId==="restricted-resident")'),true);
    assert.equal(await evaluate('RHP.can("users.create")'),false);
    console.log('PASS 8: actual resident-only actor can create resident, cannot create managers/approve');
    await evaluate(`RH.login(RH.getUsers().find(u=>u.id===window.__admin)||RH.getUsers().find(u=>RHP.getType(u.accountTypeId)?.fullAccess),false)`);await navigate('/dashboard.html');
    const register = async (name,email,phone) => {
        const adminId=await evaluate('RH.getSession().id');
        await evaluate('RH.logout()');
        await navigate('/index.html');await click('.nav-signup');
        await fill({accountType:'resident',signupName:name,signupEmail:email,signupPhone:phone,signupPassword:'test-pass'});
        await select('signupBuildingField','Restore Building');await select('signupApartmentField','RESTORE101');
        await click('#signupForm button[type="submit"]');
        const item=await evaluate(`RH.listAccountRequests().find(r=>r.email===${JSON.stringify(email)})`);
        assert.ok(item,await evaluate('document.getElementById("signupMessage").textContent'));
        await evaluate(`RH.login(RH.getUsers().find(u=>u.id===${JSON.stringify(adminId)}),false)`);
        await navigate('/dashboard.html');return {ok:true,item};
    };
    const request=await register('Registration Approval','approval.restore@example.test','0904444555');
    assert.equal(await evaluate('RH.getUsers().some(u=>u.email==="approval.restore@example.test")'),false);
    assert.equal(await evaluate('RH.authenticateDetailed("approval.restore@example.test","test-pass").reason'),'account_pending');
    await menu('Người dùng');await textButton('#accounts-tab .acc-subtabs button','chờ duyệt');
    await textButton('#accountRequestsTableBody button','Xử lý');
    await textButton('#rhDrawerOverlay.show button','Phê duyệt');
    assert.equal(await evaluate(`RH.getAccountRequest(${JSON.stringify(request.item.id)}).status`),'approved');
    assert.equal(await evaluate('!!RH.getUsers().find(u=>u.email==="approval.restore@example.test").residentId'),true);
    assert.equal(await evaluate('RH.authenticateDetailed("approval.restore@example.test","test-pass").ok'),true);
    const rejected=await register('Registration Rejection','reject.restore@example.test','0904444666');
    await menu('Người dùng');await textButton('#accounts-tab .acc-subtabs button','chờ duyệt');await textButton('#accountRequestsTableBody button','Xử lý');
    await evaluate('window.prompt=()=>"Test rejection"');await textButton('#rhDrawerOverlay.show button','Từ chối');
    assert.equal(await evaluate(`RH.getAccountRequest(${JSON.stringify(rejected.item.id)}).status`),'rejected');
    assert.equal(await evaluate('RH.authenticateDetailed("reject.restore@example.test","test-pass").reason'),'account_rejected');
    console.log('PASS 9: registration remains pending; UI approval activates linked account; UI rejection blocks login');
    await menu('Người dùng');await textButton('#accounts-tab .acc-subtabs button','Danh sách người dùng');
    assert.equal(await evaluate('!!document.getElementById("staffProfileUpdates")'),true);
    const profileResult=await evaluate(`(()=>{const admin=RH.getUsers().find(u=>RHP.getType(u.accountTypeId)?.fullAccess);RH.login(RH.getUsers().find(u=>u.name==='Restored Staff'),false);const result=RH.updateCurrentUserProfile({email:'staff.contact.restore@example.test'});RH.login(admin,false);return result})()`);
    assert.equal(profileResult.ok,true,profileResult.error);
    await navigate('/dashboard.html');await menu('Người dùng');
    assert.equal(await evaluate('document.getElementById("staffProfileUpdates").textContent.includes("staff.contact.restore@example.test")'),true);
    await evaluate(`document.querySelector('#staffProfileUpdates [data-staff-update-status]').value='resolved';document.querySelector('#staffProfileUpdates [data-staff-update-note]').value='Verified follow-up'`);
    await click('#staffProfileUpdates [data-staff-update-save]');
    assert.equal(await evaluate('RH.getUsers().find(u=>u.name==="Restored Staff").profileUpdateHistory[0].managerStatus'),'resolved');
    assert.equal(await evaluate('document.querySelector("#staffProfileUpdates [data-staff-update-status]").value'),'resolved');
    assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
    await send('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync(join(artifactDir,'users-desktop.png'),Buffer.from(r.data,'base64')));
    await addUser();await select('ufTypeField','Cư dân');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await evaluate('new Promise(resolve=>setTimeout(resolve,300))');
    assert.equal(await evaluate('(()=>{const node=document.getElementById("rhDrawerBody");return node.scrollWidth<=node.clientWidth})()'),true,'Mobile form fits the drawer');
    await send('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync(join(artifactDir,'resident-form-mobile.png'),Buffer.from(r.data,'base64')));
    assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(pageLogs.length,0,JSON.stringify(pageLogs));
    console.log('PASS 10: profile follow-up section preserved, light theme, no JS or console errors. Artifacts:',artifactDir);
} finally {ws?.close();browser.kill();server.closeAllConnections();server.close();}
