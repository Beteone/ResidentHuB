// Real-page smoke tests use an isolated Edge profile and localStorage.
// Remote decorative resources are omitted so the test works without CDN access.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
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
    await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-color-scheme',value:'dark'}]});
    await navigate('/dashboard.html#demo=1');
    assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light');
    await evaluate('localStorage.setItem("residenthub_theme_v1",JSON.stringify({theme:"dark"}));RHTheme.apply()');
    assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
    assert.deepEqual(await evaluate('(()=>{const s=getComputedStyle(document.querySelector(".topbar-title"));return [s.color,getComputedStyle(document.body).backgroundColor]})()'), ['rgb(229, 237, 247)','rgb(17, 24, 39)']);
    await evaluate('localStorage.removeItem("residenthub_theme_v1");RHTheme.apply()');
    await evaluate(`RHD.create('buildings',{id:'reference-north',name:'Test North',code:'TEST-N',active:true});RHD.create('apartments',{id:'reference-a1',buildingId:'reference-north',name:'TEST1',status:'vacant'});switchTab('roles');RHAccounts.openRole();document.getElementById('rfName').value='Temporary role';RHAccounts.submitRole({preventDefault(){}})`);
    assert.equal(await evaluate('RHP.listTypes().some(t=>t.name==="Temporary role")'), true);
    await evaluate(`window.__temporary=RHP.listTypes().find(t=>t.name==='Temporary role').id;RHAccounts.openRole(__temporary);document.getElementById('rfName').value='Edited role';RHAccounts.submitRole({preventDefault(){}})`);
    assert.equal(await evaluate('RHP.getType(__temporary).name'), 'Edited role');
    await evaluate('RHAccounts.deleteRole(__temporary)');
    assert.equal(await evaluate('RHP.getType(__temporary)'), null);
    await evaluate(`window.__type=RHP.saveType(null,{name:'Configured custom manager',portal:'manager',permissions:[]}).item`);
    console.log('Role creation result', await evaluate('JSON.stringify(__type)'));
    await evaluate(`RHAccounts.openUser();document.querySelector('#ufTypeField .rh-ss-trigger').click()`);
    assert.equal(await evaluate('document.getElementById("ufTypeField").textContent.includes("Configured custom manager")'), true);
    await evaluate(`RHUI.closeDrawer();RHAccounts.openUser(null,'at-building-manager');document.getElementById('ufName').value='Configured Manager';document.getElementById('ufPhone').value='0902222333';document.getElementById('ufPassword').value='test-pass';document.getElementById('ufPassword2').value='test-pass';RHAccounts.submitUser({preventDefault(){}})`);
    assert.equal(await evaluate('RH.getUsers().some(u=>u.name==="Configured Manager"&&u.accountTypeId==="at-building-manager")'), true, await evaluate('document.getElementById("ufError")?.textContent'));
    assert.equal(await evaluate('RH.authenticateDetailed("090 222 2333","test-pass").ok'), true);
    await evaluate(`RHAccounts.openUser(null,__type.id);document.getElementById('ufName').value='Custom Type User';document.getElementById('ufPhone').value='0902222555';document.getElementById('ufPassword').value='test-pass';document.getElementById('ufPassword2').value='test-pass';RHAccounts.submitUser({preventDefault(){}})`);
    assert.equal(await evaluate('RH.getUsers().some(u=>u.name==="Custom Type User"&&u.accountTypeId===__type.id)'),true);
    await evaluate(`RHD.create('customers',{id:'direct-resident',fullName:'Direct Resident',phone:'0902222444'});window.__realCreateCan=RHP.can;RHP.can=key=>key==='users.createResident'||(key!=='users.create'&&__realCreateCan(key));RHAccounts.openUser(null,RHP.RESIDENT_TYPE_ID);document.getElementById('ufName').value='Direct Resident';document.getElementById('ufPhone').value='0902222444';document.getElementById('ufPassword').value='test-pass';document.getElementById('ufPassword2').value='test-pass';document.getElementById('ufResident').value='direct-resident';RHAccounts.submitUser({preventDefault(){}})`);
    assert.equal(await evaluate('document.getElementById("ufError").textContent.includes("Chọn hồ sơ")'), true, 'Resident-only creator reaches form validation instead of being blocked by users.create');
    await evaluate(`document.querySelector('#ufResidentBuilding .rh-ss-trigger').click();Array.from(document.querySelectorAll('#ufResidentBuilding .rh-ss-option')).find(n=>n.textContent.includes('Test North')).click();document.querySelector('#ufResidentApartment .rh-ss-trigger').click();Array.from(document.querySelectorAll('#ufResidentApartment .rh-ss-option')).find(n=>n.textContent.includes('TEST1')).click();RHAccounts.submitUser({preventDefault(){}})`);
    assert.equal(await evaluate('RH.getUsers().some(u=>u.name==="Direct Resident"&&u.role==="resident"&&u.residentId==="direct-resident")'), true);
    await evaluate('RHP.can=window.__realCreateCan;RHUI.closeDrawer()');
    const request=await evaluate(`RH.submitAccountRequest({fullName:'Approval Test',phone:'0901111222',email:'approval-test@example.test',password:'test-pass',buildingId:'reference-north',apartmentId:'reference-a1'})`);
    assert.equal(request.ok,true);
    await evaluate(`openAccountRequestDrawer(${JSON.stringify(request.item.id)});submitApproveAccountRequest(${JSON.stringify(request.item.id)})`);
    assert.equal(await evaluate(`RH.getAccountRequest(${JSON.stringify(request.item.id)}).status`),'approved');
    assert.equal(await evaluate('!!RH.getUsers().find(u=>u.email==="approval-test@example.test").residentId'),true);
    assert.equal(errors.length,0,JSON.stringify(errors));
    assert.equal(pageLogs.length,0,JSON.stringify(pageLogs));
    console.log('PASS theme defaults/explicit dark, account types CRUD/dynamic options, manager creation, resident-only submit, approval and profile linking. Artifacts:',artifactDir);
} finally {ws?.close();browser.kill();server.closeAllConnections();server.close();}
