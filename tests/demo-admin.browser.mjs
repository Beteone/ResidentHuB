// Real-page smoke tests use an isolated Chrome profile and localStorage.
// Remote decorative resources are omitted so the test works without CDN access.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--no-sandbox', '--disable-extensions', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
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
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.prompt=()=>{sessionStorage.setItem("fixture-prompt-count",String(Number(sessionStorage.getItem("fixture-prompt-count")||0)+1));return "browser-fixture-password";};' });
    await navigate('/index.html');
    assert.equal(await evaluate('RH.authenticateDetailed("manager@residenthub.vn","browser-fixture-password").ok'), true);
    await evaluate('RH.login(RH.authenticateDetailed("manager@residenthub.vn","browser-fixture-password").user,false)');
    await navigate('/dashboard.html');
    assert.equal(await evaluate('RHP.isAdmin()'),true);
    assert.equal(await evaluate('RHP.allKeys().every(k=>RHP.can(k))'),true);
    const signature = createHash('sha256').update(await evaluate('JSON.stringify(RHP.allKeys().sort().map(k=>[k,RHP.can(k)]))')).digest('hex');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".db-add")).display!=="none"'),true);
    await evaluate('switchTab("buildings")');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("#buildings-tab button")).some(b=>b.textContent.includes("Thêm tòa nhà"))'),true);
    await evaluate('Array.from(document.querySelectorAll("#buildings-tab button")).find(b=>b.textContent.includes("Thêm tòa nhà")).click()');
    assert.equal(await evaluate('document.querySelector("#rhDrawerOverlay.show #bfName")!==null'),true);
    await evaluate(`document.getElementById('bfName').value='Bootstrap Test';document.getElementById('bfShort').value='BOOT';document.getElementById('bfProvince').value='Hà Nội';document.getElementById('bfWard').value='Test';document.getElementById('bfAddress').value='Fixture';RHUI.submitBuildingForm({preventDefault(){}})`);
    assert.equal(await evaluate('RHD.list("buildings").some(b=>b.name==="Bootstrap Test")'),true,'Real save handler allows Admin');
    // A role edit from another tab must refresh both static and module buttons.
    await evaluate('window.__typesBefore=localStorage.getItem("residenthub_account_types");const types=JSON.parse(__typesBefore);types.find(t=>t.id==="at-admin").fullAccess=false;localStorage.setItem("residenthub_account_types",JSON.stringify(types));dispatchEvent(new StorageEvent("storage",{key:"residenthub_account_types"}))');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".db-add")).display'),'none');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("#buildings-tab button")).some(b=>b.textContent.includes("Th?m t?a nh?"))'),false);
    await evaluate('RHUI.openBuildingForm();RHUI.submitBuildingForm({preventDefault(){}})');
    assert.equal(await evaluate('RHD.list("buildings").length'),1);
    await evaluate('localStorage.setItem("residenthub_account_types",__typesBefore);dispatchEvent(new StorageEvent("storage",{key:"residenthub_account_types"}))');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".db-add")).display!=="none"'),true);
    await evaluate(`window.__saved=localStorage.getItem('residenthub_live_buildings');const users=RH.getUsers();users.push({...users.find(u=>u.id==='u-manager-1'),id:'ordinary',email:'ordinary@example.test',accountTypeId:'at-building-manager',allBuildings:false,buildingIds:[]});localStorage.setItem('residenthub_users',JSON.stringify(users));RH.login(RH.getUsers().find(u=>u.id==='ordinary'),false)`);
    await navigate('/dashboard.html');
    await evaluate('switchTab("buildings")');
    assert.equal(await evaluate('RHP.isAdmin()'),false);
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".db-add")).display'), 'none');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("#buildings-tab button")).some(b=>b.textContent.includes("Thêm tòa nhà"))'),false);
    await evaluate('RHUI.openBuildingForm()');
    assert.equal(await evaluate('!!document.querySelector("#rhDrawerOverlay.show")'),false);
    await evaluate('RHUI.submitBuildingForm({preventDefault(){}})');
    assert.equal(await evaluate('RHD.list("buildings").length'),1,'Denied save cannot change buildings');
    assert.equal(await evaluate('window.__alerts.some(s=>s.includes("Thêm · Tòa nhà"))'),true);
    await evaluate('RH.login(RH.getUsers().find(u=>u.id==="u-manager-1"),false);const locked=RH.getUsers();locked.find(u=>u.id==="u-manager-1").status="locked";localStorage.setItem("residenthub_users",JSON.stringify(locked));RHUI.openBuildingForm();RHUI.submitBuildingForm({preventDefault(){}})');
    assert.equal(await evaluate('RH.getSession()'),null);
    assert.equal(await evaluate('RHP.can("buildings.create")'),false);
    assert.equal(await evaluate('RHD.list("buildings").length'),1);
    await evaluate('const unlocked=RH.getUsers();unlocked.find(u=>u.id==="u-manager-1").status="active";localStorage.setItem("residenthub_users",JSON.stringify(unlocked))');
    const businessBefore = await evaluate('localStorage.getItem("residenthub_live_buildings")');
    await evaluate(`const users=JSON.parse(localStorage.getItem('residenthub_users'));const admin=users.find(u=>u.id==='u-manager-1');admin.accountTypeId='';admin.password='changed-fixture-password';localStorage.setItem('residenthub_users',JSON.stringify(users));RH.logout()`);
    await navigate('/index.html');
    assert.equal(await evaluate('RH.findUserByEmail("manager@residenthub.vn").accountTypeId'),'');
    assert.equal(await evaluate('RHP.inspectDemoAdmin().status'),'permission-conflict');
    assert.equal(await evaluate('RH.authenticateDetailed("manager@residenthub.vn","changed-fixture-password").ok'),true);
    assert.equal(await evaluate('sessionStorage.getItem("fixture-prompt-count")'),'1','Old environments never bootstrap automatically');
    assert.equal(await evaluate('localStorage.getItem("residenthub_live_buildings")'),businessBefore);
    assert.equal(await evaluate('localStorage.getItem("residenthub_demo_admin_migration_v1")'),null);
    const grantsBefore = await evaluate('JSON.stringify([localStorage.getItem("residenthub_users"),localStorage.getItem("residenthub_account_types")])');
    assert.equal(await evaluate('RHP.migrateDemoAdmin().reason'),'requires-trusted-reprovisioning');
    assert.equal(await evaluate('JSON.stringify([localStorage.getItem("residenthub_users"),localStorage.getItem("residenthub_account_types")])'),grantsBefore);
    assert.equal(await evaluate('localStorage.getItem("residenthub_live_buildings")'),businessBefore);
    assert.equal(errors.length,0,JSON.stringify(errors));
    assert.equal(pageLogs.length,0,JSON.stringify(pageLogs));
    console.log('PASS browser profile:', artifactDir, 'Admin permission signature:', signature);
    console.log('PASS clean bootstrap/login/button/form/save; old conflict preserved; client privilege restoration disabled; ordinary manager denied; business data preserved.');
} finally {ws?.close();browser.kill();server.closeAllConnections();server.close();}
