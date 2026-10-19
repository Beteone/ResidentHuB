import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
const root = resolve('.');
const fixture = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/general-settings.css">' + ['auth.js', 'permissions.js', 'data.js', 'general-settings.js'].map(src => '<script src="/' + src + '"></script>').join('') + '</head><body><form id="settingsForm"><input type="checkbox" data-setting="notifyInvoice"><div id="rh-general-settings"></div></form></body></html>';
const server = createServer((req, res) => {
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); return; }
    const path = resolve(root, '.' + req.url.split('?')[0]);
    if (!path.startsWith(root + '\\')) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8'); res.end(readFileSync(path)); } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = mkdtempSync(join(tmpdir(), 'residenthub-general-settings-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
try {
    const endpoint = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Browser startup timeout')), 15000); browser.once('error', reject); browser.stderr.on('data', chunk => { const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); });
    const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let seq = 0; const pending = new Map();
    ws.onmessage = e => { const msg = JSON.parse(e.data); const c = pending.get(msg.id); if (c) { pending.delete(msg.id); msg.error ? c.reject(Error(JSON.stringify(msg.error))) : c.resolve(msg.result); } };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method + ' ' + JSON.stringify(params).slice(0, 100))); }, 20000); pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } }); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
    await send('Page.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/fixture` });
    for (let i = 0; i < 100 && !await evaluate('!!window.RHGeneralSettings'); i++) await new Promise(r => setTimeout(r, 50));
    await evaluate(`localStorage.setItem('residenthub_users',JSON.stringify([{id:'browser-admin',name:'Quản lý kiểm thử',email:'browser@example.test',password:'test-password',role:'manager',status:'active',accountTypeId:'at-admin'}]));RH.login(RH.getUsers()[0],false);RHD.create('buildings',{id:'b',name:'Tòa thật <script>',config:{bankName:'ACB',bankAccountNumber:'001234',bankAccountHolder:'CHU TAI KHOAN'}});RHGeneralSettings.mount();`);
    assert.equal(await evaluate("document.querySelectorAll('[data-rhgs-tab]').length"), 3);
    await evaluate(`const area=document.querySelector('[data-rhgs-template="invoice"]');area.value='Xin chào ';area.focus();area.setSelectionRange(9,9);document.querySelector('[data-rhgs-variable="Ten_Cu_Dan"]').click();`);
    assert.equal(await evaluate("document.querySelector('[data-rhgs-template=invoice]').value"), 'Xin chào {Ten_Cu_Dan}');
    await evaluate("document.querySelector('[data-rhgs-action=save]').click()");
    assert.equal(await evaluate("RHD.getSettings().notificationTemplates.invoice"), 'Xin chào {Ten_Cu_Dan}');
    assert.equal(await evaluate("document.querySelector('[data-setting=notifyInvoice]').checked"), true, 'Legacy control synchronized');
    await evaluate("document.querySelector('[data-rhgs-tab=finance]').click()");
    assert.equal(await evaluate("document.querySelector('#rh-general-settings tbody').textContent.includes('001234')"), true);
    assert.equal(await evaluate("document.querySelectorAll('#rh-general-settings script').length"), 0);
    await evaluate("document.querySelector('[data-rhgs-tab=activity]').click()");
    assert.equal(await evaluate("document.querySelectorAll('[data-rhgs-log]').length"), 2);
    await evaluate("document.querySelector('[data-rhgs-log]').click()");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes('browser-admin')"), true);
    await evaluate("document.querySelector('[data-rhgs-action=close]').click();const field=document.querySelector('[data-filter=user]');field.value='Không tồn tại';field.dispatchEvent(new Event('input',{bubbles:true}));");
    assert.equal(await evaluate("document.querySelectorAll('[data-rhgs-log]').length"), 0);
    for (const width of [1280, 375, 320]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, 'No viewport overflow at ' + width);
    }
    await evaluate("RHGeneralSettings.mount()");
    assert.equal(await evaluate("RHD.getSettings().notificationTemplates.invoice"), 'Xin chào {Ten_Cu_Dan}');
    console.log('Passed Edge UI: 3 tabs, variable insertion, save, legacy controls, actual financial data, HTML escaping, audit sidebar/filter, 1280/375/320px.');
} finally { if (ws) ws.close(); browser.kill(); await new Promise(r => server.close(r)); }
