import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// Isolated browser fixture: never opens the user's dashboard or localStorage.
const base = new URL('../../', import.meta.url);
const services = [{ id: 'e', name: 'Tiền điện', feeType: 'electricity', calcMethod: 'fixed', unitPrice: 4000 }, { id: 'w', name: 'Tiền nước', feeType: 'water', calcMethod: 'fixed', unitPrice: 30000 }, { id: 'wifi', name: 'Wifi', feeType: 'internet', calcMethod: 'fixed', unitPrice: 100000 }];
const data = {
    buildings: [{ id: 'b', name: 'Tòa A', services }],
    apartments: [{ id: 'a', buildingId: 'b', name: '501' }],
    customers: [{ id: 'u', fullName: 'Nguyễn An' }],
    contracts: [{ id: 'c', code: 'C1', buildingId: 'b', apartmentId: 'a', customerId: 'u', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active', rentPrice: 2000000, serviceIds: ['e', 'w', 'wifi'] }],
    meters: [],
    invoices: [
        { id: 'oct', code: 'HD-OCT', contractId: 'c', buildingId: 'b', apartmentId: 'a', customerId: 'u', billingPeriod: '2026-10', period: '2026-09', issueDate: '2026-11-02', dueDate: '2026-11-05', status: 'unpaid', total: 2100000, items: [] },
        { id: 'sep', code: 'HD-SEP', contractId: 'c', buildingId: 'b', apartmentId: 'a', customerId: 'u', billingPeriod: '2026-09', issueDate: '2026-10-02', status: 'paid', total: 1900000, items: [] },
        { id: 'legacy', code: 'HD-LEGACY', contractId: 'c', buildingId: 'b', apartmentId: 'a', customerId: 'u', billingPeriod: '2026-10', period: '2026-09', status: 'draft', total: 2134000, items: [{ serviceId: 'rent', label: 'Thuê', qty: 1, unitPrice: 2000000, amount: 2000000 }, { serviceId: 'wifi', label: 'Wifi', qty: 1, unitPrice: 100000, amount: 100000 }, { serviceId: 'e', label: 'Điện', qty: 1, unitPrice: 4000, amount: 4000 }, { serviceId: 'w', label: 'Nước', qty: 1, unitPrice: 30000, amount: 30000 }] },
        { id: 'no-period', code: 'HD-NO-PERIOD', issueDate: '2026-10-03', status: 'draft', total: 50000, items: [] }
    ]
};
const dashboard = readFileSync(new URL('dashboard.html', base), 'utf8');
const css = dashboard.match(/<style>([\s\S]*?)<\/style>/)[1];
const fixture = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div style="padding:16px"><div id="invoices-tab"></div></div><script>localStorage.clear();for(const [key,value] of Object.entries(${JSON.stringify(data)}))localStorage.setItem('residenthub_live_'+key,JSON.stringify(value));window.RHT={list:()=>[]};window.confirm=()=>true;window.alert=()=>{};</script><script src="/data.js"></script><script src="/billing.js"></script><script src="/manager-modules.js"></script><script>RHUI.invoiceFilters={period:'2026-10',status:'all',search:'',building:''};RHUI.renderInvoicesTab();window.fixtureReady=true;</script></body></html>`;
const server = createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); }
    else if (['/data.js', '/billing.js', '/manager-modules.js'].includes(req.url)) { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(readFileSync(new URL(req.url.slice(1), base))); }
    else { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const profile = mkdtempSync(join(tmpdir(), 'residenthub-invoice-browser-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
try {
    const endpoint = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000);
        browser.once('error', e => { clearTimeout(timer); reject(e); });
        browser.stderr.on('data', chunk => { const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    });
    const debugUrl = new URL(endpoint);
    const targets = await (await fetch(`http://${debugUrl.host}/json/list`)).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    ws.onmessage = event => { const message = JSON.parse(event.data); const callback = pending.get(message.id); if (callback) { pending.delete(message.id); message.error ? callback.reject(new Error(JSON.stringify(message.error))) : callback.resolve(message.result); } };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 15000);
        pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    await send('Page.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    for (let n = 0; n < 100 && !(await evaluate('!!window.fixtureReady')); n++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(await evaluate('!!window.fixtureReady'), true);
    const before = await evaluate('JSON.stringify(Object.entries(localStorage).sort())');
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const label = () => evaluate("document.querySelector('.rh-invoice-period-picker summary').textContent.trim()");
    const rowCodes = () => evaluate("Array.from(document.querySelectorAll('.rh-invoice-table tbody tr td:nth-child(2) strong')).map(el=>el.textContent)");
    for (const width of [1280, 375, 320]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
        await evaluate("RHUI.invoiceFilters.period='2026-10';RHUI.invoiceFilters.status='all';RHUI.invoiceFilters.periodPickerOpen=false;RHUI.renderInvoicesTab()");
        assert.deepEqual(await rowCodes(), ['HD-OCT', 'HD-LEGACY']);
        assert.equal(await label(), 'Kỳ hóa đơn: 10/2026');
        // Real pointer clicks on the left/icon, middle/text and right/chevron.
        for (const fraction of [0.05, 0.5, 0.95]) {
            await evaluate("document.querySelector('.rh-invoice-period-picker').open=false");
            const rect = await evaluate("(()=>{const r=document.querySelector('.rh-invoice-period-picker summary').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
            const point = { x: rect.x + rect.width * fraction, y: rect.y + rect.height / 2 };
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
            assert.equal(await evaluate("document.querySelector('.rh-invoice-period-picker').open"), true);
        }
        const bounds = await evaluate("(()=>{const r=document.querySelector('.rh-invoice-period-popover').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}})()");
        assert.ok(bounds.left >= 0 && bounds.right <= bounds.width, JSON.stringify(bounds));
        assert.equal(bounds.overflow, false);
        await evaluate("(()=>{const month=document.querySelector('[data-invoice-period-month]');month.value='09';month.dispatchEvent(new Event('change',{bubbles:true}))})()");
        assert.equal(await label(), 'Kỳ hóa đơn: 09/2026');
        assert.deepEqual(await rowCodes(), ['HD-SEP']);
        assert.match(await evaluate("document.querySelector('.rh-invoice-stat.collected strong').textContent"), /1\.900\.000/);
        await click('[data-invoice-status="paid"]');
        assert.equal(await evaluate('RHUI.invoiceFilters.period'), '2026-09');
        await click('[data-invoice-period-step="1"]');
        assert.equal(await label(), 'Kỳ hóa đơn: 10/2026');
        assert.deepEqual(await rowCodes(), []);
        await click('[data-invoice-status="all"]');
        await click('[data-invoice-period-all]');
        assert.equal(await label(), 'Kỳ hóa đơn: Tất cả kỳ');
        assert.equal((await rowCodes()).length, 4);
        await click('[data-invoice-period-current]');
        assert.equal(await evaluate('RHUI.invoiceFilters.period'), await evaluate("new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date())"));
        await evaluate("RHUI.invoiceFilters.period='2027-01';RHUI.renderInvoicesTab()");
        await click('[data-invoice-period-step="-1"]');
        assert.equal(await label(), 'Kỳ hóa đơn: 12/2026');
        assert.equal(await evaluate('JSON.stringify(Object.entries(localStorage).sort())'), before);
        console.log(`Passed browser filter at ${width}px: whole-control clicks, dropdown bounds, billingPeriod, KPI/counts, retained period, navigation, all periods, no writes.`);
    }
    // Real form prefill and utility-only recalculation, using production handlers.
    await evaluate("RHUI.invoiceFilters.period='2026-10';RHUI.renderInvoicesTab();RHUI.openInvoiceForm()");
    await evaluate("document.getElementById('ifPeriod').value='2026-10';document.getElementById('ifPeriod').dispatchEvent(new Event('change'))");
    assert.equal(await evaluate("document.querySelectorAll('#ifLines tr').length"), 2);
    assert.match(await evaluate("document.getElementById('ifIssues').textContent"), /Chưa có chỉ số tháng 10\/2026/);
    await evaluate('RHUI.closeDrawer();RHUI.openInvoiceForm("legacy")');
    assert.equal(await evaluate("document.getElementById('ifPeriod').value"), '2026-10');
    await click('#ifRecalc');
    assert.equal(await evaluate("document.querySelectorAll('#ifLines tr').length"), 2);
    await evaluate('RHUI.closeDrawer()');
    assert.equal(await evaluate('RHUI.invoiceFilters.period'), '2026-10');
    console.log('Passed browser form: no qty=1 utilities without readings; legacy draft recalculation; period survives form close.');
} finally {
    ws?.close();
    browser.kill();
    server.close();
}
