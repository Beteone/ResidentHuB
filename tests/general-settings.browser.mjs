import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
const root = resolve('.');
const fixture = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/general-settings.css">' + ['activity-store.js', 'auth.js', 'permissions.js', 'data.js', 'general-settings.js', 'financial-accounts.js'].map(src => '<script src="/' + src + '"></script>').join('') + '</head><body><form id="settingsForm"><input type="checkbox" data-setting="notifyInvoice"><div id="rh-general-settings"></div></form></body></html>';
const server = createServer((req, res) => {
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); return; }
    const path = resolve(root, '.' + req.url.split('?')[0]);
    if (!path.startsWith(root + '\\')) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript; charset=utf-8' : extname(path) === '.css' ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8'); res.end(readFileSync(path)); } catch { res.writeHead(404).end(); }
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
    assert.equal(await evaluate("document.querySelector('#rh-general-settings tbody').textContent.includes('Chưa có tài khoản tài chính')"), true);
    await evaluate("document.querySelector('[data-finance=add]').click();document.querySelector('[data-finance=confirm]').click()");
    assert.equal(await evaluate("document.querySelector('#rhgs-finance-error').textContent.includes('Tên tài khoản')"), true);
    await evaluate(`document.querySelector('[data-finance-field=name]').value='Quỹ ACB';document.querySelector('[data-finance-field=openingDate]').value='2020-01-01';const money=document.querySelector('[data-finance-money]');money.value='1000000';money.dispatchEvent(new Event('input',{bubbles:true}));`);
    assert.equal(await evaluate("document.querySelector('[data-finance-money]').value"), '1.000.000');
    await evaluate(`document.querySelector('[data-finance-type]').value='bank';document.querySelector('[data-finance-type]').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-finance-field=bank]').value='ACB';document.querySelector('[data-finance-field=accountNumber]').value='00123456';document.querySelector('[data-finance-field=holder]').value='CHU TAI KHOAN';document.querySelector('[data-finance-type]').value='wallet';document.querySelector('[data-finance-type]').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-finance-field=accountNumber]').value='vi-001';document.querySelector('[data-finance-type]').value='bank';document.querySelector('[data-finance-type]').dispatchEvent(new Event('change',{bubbles:true}));`);
    assert.equal(await evaluate("document.querySelector('[data-finance-field=accountNumber]').value"), '00123456', 'Bank draft survives type changes');
    assert.equal(await evaluate("document.querySelector('[data-finance-field=name]').value"), 'Quỹ ACB');
    for (const width of [1024, 768, 375, 320]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width < 500 });
        assert.equal(await evaluate("(()=>{const r=document.querySelector('.rhgs-modal').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()"), true, 'Modal fits at ' + width);
    }
    await evaluate("document.querySelector('[data-finance=confirm]').click()");
    assert.equal(await evaluate("RHFinancialAccounts.list()[0].accountNumber"), '00123456');
    assert.equal(await evaluate("RHFinancialAccounts.list()[0].openingBalance"), 1000000);
    assert.equal(await evaluate("document.querySelector('#rhgs-account-rows').textContent.includes('1.000.000')"), true);
    await evaluate("document.querySelector('[data-finance=edit]').click();document.querySelector('[data-finance-field=openingBalance]').value='2.000.000';document.querySelector('[data-finance=confirm]').click()");
    assert.equal(await evaluate("document.querySelector('#rhgs-finance-error').textContent.includes('ảnh hưởng tồn quỹ')"), true);
    await evaluate("document.querySelector('[data-finance-field=acknowledge]').checked=true;document.querySelector('[data-finance=confirm]').click()");
    assert.equal(await evaluate("RHFinancialAccounts.list()[0].openingBalance"), 2000000);
    await evaluate("document.querySelector('[data-finance=lock]').click();document.querySelector('[data-finance=confirm]').click()");
    assert.equal(await evaluate("document.querySelector('#rhgs-finance-error').textContent.includes('Chưa bật khóa sổ')"), true);
    await evaluate("document.querySelector('[data-finance=cancel]').click()");
    await evaluate(`RHD.create('cashflows',{id:'linked-test',accountName:'Quỹ ACB',type:'income',amount:100,date:'2020-01-03'});document.querySelector('[data-finance=delete]').click();document.querySelector('[data-finance=confirm]').click();`);
    assert.equal(await evaluate("document.querySelector('#rhgs-finance-error').textContent.includes('Chưa thể xóa')"), true);
    assert.equal(await evaluate("document.querySelector('[data-finance-replacement]').options.length"), 1, 'Cannot select self as replacement');
    await evaluate("document.querySelector('[data-finance=cancel]').click();const q=document.querySelector('[data-finance-search]');q.value='không tồn tại';q.dispatchEvent(new Event('input',{bubbles:true}));");
    assert.equal(await evaluate("document.querySelector('#rhgs-account-rows').textContent.includes('Không tìm thấy tài khoản')"), true);
    assert.equal(await evaluate("document.querySelectorAll('#rh-general-settings script').length"), 0);
    await evaluate("document.querySelector('[data-rhgs-tab=activity]').click()");
    assert.equal(await evaluate("document.querySelectorAll('[data-rhgs-log]').length >= 5"), true);
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
    // Open the real dashboard with the same disposable fixture account. External
    // CDN resources are blocked so this integration check has no network dependency.
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['https://*', 'http://cdn.*'] });
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/dashboard.html` });
    for (let i = 0; i < 150 && !await evaluate("typeof window.switchTab === 'function' && !!window.RHFinancialAccounts"); i++) await new Promise(r => setTimeout(r, 50));
    await evaluate("switchTab('settings')");
    assert.equal(await evaluate("document.querySelectorAll('#settings-tab [data-rhgs-tab]').length"), 3, 'Actual dashboard Settings mounts all three tabs');
    await evaluate("document.querySelector('[data-rhgs-tab=finance]').click();document.querySelector('[data-finance=edit]').click()");
    assert.equal(await evaluate("document.querySelector('#rhgs-finance-title').textContent"), 'Sửa tài khoản tài chính');
    assert.equal(await evaluate("(()=>{const r=document.querySelector('.rhgs-modal').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()"), true);
    await evaluate("document.querySelector('[data-finance=cancel]').click()");
    console.log('Passed Edge UI: notifications; finance add/edit/validation/type draft preservation/VND/leading zero; lock and linked-delete blocked; audit sidebar/filter; modal 1024/768/375/320px, page 1280/375/320px.');
} finally { if (ws) ws.close(); browser.kill(); await new Promise(r => server.close(r)); }
