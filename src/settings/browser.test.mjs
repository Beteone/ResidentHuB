import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';

// Dedicated temporary browser profile; no production data or other modules.
const root = resolve('dist/settings');
const dashboard = readFileSync(resolve('dashboard.html'), 'utf8');
const settingsMarkup = dashboard.slice(dashboard.indexOf('<div id="settings-tab"'), dashboard.indexOf('<!-- Workflows Tab -->'));
const panelLogic = dashboard.slice(dashboard.indexOf('const SETTINGS_PANELS_WITHOUT_SAVE'), dashboard.indexOf('function syncDueModeFields'));
const dashboardStyle = dashboard.match(/<style>([\s\S]*?)<\/style>/)[1];
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${dashboardStyle}</style></head><body>${settingsMarkup}<script>const RHP={can:()=>true};const RH_SESSION={id:'settings-preview'};const RH_IS_DEMO=true;${panelLogic};document.getElementById('settings-tab').style.display='block';document.getElementById('settingsNav').addEventListener('click',e=>{const button=e.target.closest('button');if(button)showSettingsPanel(button.dataset.setPanel)});</script></body></html>`;
const server = createServer((req, res) => {
    if (req.url === '/dashboard-fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); return; }
    const pathname = req.url.split('?')[0];
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname.replace(/^\/dist\/settings/, '')));
    if (!path.startsWith(root + '\\') && path !== root) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript' : 'text/html; charset=utf-8'); res.end(readFileSync(path)); } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = mkdtempSync(join(tmpdir(), 'residenthub-settings-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
try {
    const endpoint = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000);
        browser.once('error', error => { clearTimeout(timer); reject(error); });
        browser.stderr.on('data', chunk => { const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    });
    const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
    ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    ws.onmessage = event => { const message = JSON.parse(event.data); const callback = pending.get(message.id); if (callback) { pending.delete(message.id); message.error ? callback.reject(new Error(JSON.stringify(message.error))) : callback.resolve(message.result); } };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
        pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    const clickText = text => evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === ${JSON.stringify(text)}).click()`);
    const input = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await send('Page.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    for (let i = 0; i < 150 && !(await evaluate("!!document.querySelector('#template-invoice-issued')")); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await evaluate("!!document.querySelector('#template-invoice-issued')"), true);
    // The CDN must have loaded before measuring responsive layout.
    for (let i = 0; i < 150 && !(await evaluate("getComputedStyle(document.querySelector('main')).minHeight === innerHeight+'px'")); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await evaluate("getComputedStyle(document.querySelector('main')).minHeight === innerHeight+'px'"), true, 'Tailwind did not load');
    await input('#template-invoice-issued', 'Xin chào ');
    await evaluate("(()=>{const el=document.querySelector('#template-invoice-issued');el.focus();el.setSelectionRange(9,9);Array.from(document.querySelectorAll('#settings-notifications button')).find(el=>el.textContent==='{Ten_Khach_Hang}').click()})()");
    assert.equal(await evaluate("document.querySelector('#template-invoice-issued').value"), 'Xin chào {Ten_Khach_Hang}');
    await evaluate("document.querySelector('[aria-label=\"Hóa đơn mới được phát hành: Email\"]').click()");
    await clickText('Lưu thay đổi');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('residenthub_settings_v1_settings-preview')).notifications[0].email"), false);
    await clickText('Tài khoản tài chínhNgân hàng & thanh toán');
    await input('#settings-financial select', 'Vietcombank');
    await input('#settings-financial input[inputmode="numeric"]', '00123456');
    await input('#settings-financial input[maxlength="150"]', 'nguyễn an');
    await clickText('Lưu cấu hình tài chính');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('residenthub_settings_v1_settings-preview')).financial.accountNumber"), '00123456');
    await input('[aria-label="Vai trò mô phỏng"]', 'staff');
    assert.equal(await evaluate("document.querySelector('#settings-financial input').matches(':disabled')"), true);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('#settings-financial button')).some(el=>el.textContent.includes('Lưu cấu hình tài chính'))"), false);
    await clickText('Nhật ký hoạt độngLịch sử thao tác');
    assert.equal(await evaluate("document.querySelectorAll('#settings-activity tbody tr').length"), 6);
    const beforeFilter = await evaluate('JSON.stringify(Object.entries(localStorage))');
    await input('#settings-activity input[type="search"]', 'Nguyễn');
    assert.equal(await evaluate("document.querySelectorAll('#settings-activity tbody tr').length"), 4);
    await input('#settings-activity select', 'Cài đặt');
    assert.equal(await evaluate("document.querySelectorAll('#settings-activity tbody tr').length"), 2);
    assert.equal(await evaluate('JSON.stringify(Object.entries(localStorage))'), beforeFilter);
    for (const width of [1280, 375, 320]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
        for (const label of ['Cài đặt thông báoKênh gửi & mẫu nội dung', 'Tài khoản tài chínhNgân hàng & thanh toán', 'Nhật ký hoạt độngLịch sử thao tác']) {
            await clickText(label);
            assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${width}px: ${label}`);
        }
    }
    await send('Page.reload');
    for (let i = 0; i < 100 && !(await evaluate("!!document.querySelector('#template-invoice-issued')")); i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(await evaluate("document.querySelector('#template-invoice-issued').value"), 'Xin chào {Ten_Khach_Hang}');
    // Exercise the actual dashboard Settings markup and panel handler.
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/dashboard-fixture` });
    for (let i = 0; i < 100 && !(await evaluate("!!document.querySelector('[data-set-panel=activity]')")); i++) await new Promise(resolve => setTimeout(resolve, 50));
    const beforeDashboard = await evaluate('JSON.stringify(Object.entries(localStorage))');
    await evaluate("document.querySelector('#settingsNav [data-set-panel=activity]').click()");
    assert.equal(await evaluate("document.querySelector('.set-panel[data-set-panel=activity]').classList.contains('active')"), true);
    assert.equal(await evaluate("document.getElementById('settingsSaveBar').style.display"), 'none');
    for (let i = 0; i < 150 && !(await evaluate("!!document.getElementById('settingsActivityFrame').contentDocument?.querySelector('#settings-root h2')")); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await evaluate("document.getElementById('settingsActivityFrame').contentDocument.querySelector('h2').textContent"), 'Nhật ký hoạt động');
    assert.equal(await evaluate("document.getElementById('settingsActivityFrame').contentDocument.querySelectorAll('tbody tr').length"), 6);
    assert.equal(await evaluate('JSON.stringify(Object.entries(localStorage))'), beforeDashboard);
    await evaluate("document.querySelector('#settingsNav [data-set-panel=basic]').click()");
    assert.equal(await evaluate("document.querySelector('.set-panel[data-set-panel=basic]').classList.contains('active')"), true);
    console.log('Passed dashboard integration: actual Activity tab/handler, nested bundle loads, no save bar, read-only logs, existing Basic panel preserved.');
    console.log('Passed settings browser: variable insertion, toggles, persistence, finance role lock, audit/filter without writes, responsive 1280/375/320px, reload.');
} finally { ws?.close(); browser.kill(); server.close(); }
