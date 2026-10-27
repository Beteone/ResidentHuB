import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
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
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const profileRoot = mkdtempSync(join(tmpdir(), 'residenthub-staff-task-check-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${join(profileRoot, 'profile')}`, 'about:blank'
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
try {
    const endpoint = await new Promise((resolveEndpoint, reject) => {
        const timer = setTimeout(() => reject(Error('Browser startup timeout')), 15000);
        browser.once('error', reject);
        browser.stderr.on('data', chunk => {
            const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
            if (match) { clearTimeout(timer); resolveEndpoint(match[1]); }
        });
    });
    const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
    ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => { ws.onopen = resolveOpen; ws.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    const errors = [];
    ws.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
        const call = pending.get(message.id);
        if (!call) return;
        pending.delete(message.id);
        message.error ? call.reject(Error(JSON.stringify(message.error))) : call.resolve(message.result);
    };
    const send = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
        const id = ++sequence;
        pending.set(id, { resolve: resolveCall, reject: rejectCall });
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
            await new Promise(resolveWait => setTimeout(resolveWait, 50));
        }
        throw Error('Page load timeout: ' + path);
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.alert=message=>{window.__lastAlert=message};window.__lastAlert="";' });
    await navigate('/index.html');
    await evaluate(`
        const users=RH.getUsers();
        const manager=users.find(user=>user.role==='manager');
        users.push({id:'staff-task-check',name:'Staff Task Check',email:'staff-task-check@example.test',password:'test-password',role:'manager',accountTypeId:'at-staff',staffGroup:'technical',status:'active'});
        users.push({id:'resident-task-check',name:'Resident Task Check',email:'resident-task-check@example.test',password:'test-password',role:'resident',residentId:'staff-task-resident',apartmentId:'staff-task-apartment',unit:'101',status:'active'});
        localStorage.setItem('residenthub_users',JSON.stringify(users));
        RH.login(manager,false);
        RHD.setMode('live');
        RHD.create('buildings',{id:'staff-task-building',name:'Task Building',shortName:'TB',managerId:manager.id});
        RHD.create('apartments',{id:'staff-task-apartment',buildingId:'staff-task-building',name:'101'});
        RHD.create('customers',{id:'staff-task-resident',fullName:'Task Resident'});
        RHD.create('contracts',{id:'staff-task-contract',buildingId:'staff-task-building',apartmentId:'staff-task-apartment',customerId:'staff-task-resident',status:'active',startDate:'2026-01-01',endDate:'2027-01-01'});
        RHD.create('supportRequests',{id:'staff-task-request',code:'YC-TASK-01',buildingId:'staff-task-building',apartmentId:'staff-task-apartment',customerId:'staff-task-resident',residentName:'Task Resident',category:'Sửa chữa căn hộ',title:'Kiểm tra điều hòa',description:'Điều hòa không lạnh.',location:'Phòng 101',priority:'needed',status:'new',assignee:'',messages:[]});
        RHD.create('supportRequests',{id:'staff-task-private',code:'YC-TASK-02',title:'Nhiệm vụ của người khác',description:'Không hiển thị cho nhân viên này.',status:'new',priority:'urgent',messages:[]});
    `);
    await navigate('/dashboard.html');
    await evaluate(`
        switchTab('support');
        RHUI.openSupportForm('staff-task-request');
        const picker=document.getElementById('srAssigneeAccount');
        picker.value='staff-task-check';
        picker.dispatchEvent(new Event('change',{bubbles:true}));
        document.getElementById('srStaffGroup').value='technical';
        document.getElementById('srDueAt').value='2026-10-30';
        document.getElementById('srStaffNote').value='Kiểm tra van khóa trước khi thay thiết bị.';
        RHUI.submitSupportForm({preventDefault(){}});
    `);
    assert.deepEqual(await evaluate(`(()=>{const r=RHD.get('supportRequests','staff-task-request');return {assigneeId:r.assigneeId,group:r.staffGroup,status:r.status,dueAt:r.dueAt,note:r.staffManagerNote}})()`), {
        assigneeId: 'staff-task-check', group: 'technical', status: 'accepted', dueAt: '2026-10-30', note: 'Kiểm tra van khóa trước khi thay thiết bị.'
    }, 'Management assigns a grouped task on the shared support request');

    await evaluate(`RH.login(RH.getUsers().find(user=>user.id==='staff-task-check'),false)`);
    await navigate('/staff.html');
    assert.equal(await evaluate(`document.getElementById('staffPageTitle').textContent==='Danh sách nhiệm vụ'&&!!document.getElementById('staffTaskSearch')`), true, 'Staff opens directly on the task list');
    await evaluate(`document.querySelector('[data-title="Danh sách nhiệm vụ"]').click()`);
    assert.equal(await evaluate(`!!document.getElementById('staffTaskStatus')&&!!document.getElementById('staffTaskPriority')&&!!document.getElementById('staffTaskBuilding')&&!!document.getElementById('staffTaskFrom')&&!!document.getElementById('staffTaskTo')`), true, 'Task list supports status, priority, building, and due-date filters');
    assert.equal(await evaluate(`!Array.from(document.querySelectorAll('#staffSidebar [data-title]')).some(item=>item.dataset.title==='Chi tiết nhiệm vụ')`), true, 'Task detail is not a separate sidebar menu item');
    assert.equal(await evaluate(`document.getElementById('staffContent').textContent.includes('Kiểm tra điều hòa')`), true);
    assert.equal(await evaluate(`document.getElementById('staffContent').textContent.includes('Nhiệm vụ của người khác')`), false);
    await evaluate(`document.querySelector('[data-open-task="staff-task-request"]').click()`);
    assert.equal(await evaluate(`document.getElementById('staffPageTitle').textContent==='Chi tiết nhiệm vụ'&&document.getElementById('staffContent').textContent.includes('Kiểm tra điều hòa')`), true, 'Selecting a task opens its details');
    assert.equal(await evaluate(`document.getElementById('staffContent').textContent.includes('Kiểm tra van khóa trước khi thay thiết bị.')`), true, 'Staff sees the manager-only task note');
    await evaluate(`document.querySelector('[data-title="Cập nhật tiến độ"]').click();document.querySelector('[data-task-action="start"]').click()`);
    assert.deepEqual(await evaluate(`(()=>{const r=RHD.get('supportRequests','staff-task-request');return {status:r.status,taskStatus:r.staffTaskStatus}})()`), {
        status: 'in_progress', taskStatus: 'in_progress'
    });
    await evaluate(`document.getElementById('staffCompletionNote').value='Đã kiểm tra và khắc phục.';document.querySelector('[data-task-action="complete"]').click()`);
    assert.deepEqual(await evaluate(`(()=>{const r=RHD.get('supportRequests','staff-task-request');return {status:r.status,taskStatus:r.staffTaskStatus,note:r.staffCompletionNote}})()`), {
        status: 'in_progress', taskStatus: 'pending_approval', note: 'Đã kiểm tra và khắc phục.'
    }, 'Staff completion waits for management approval without closing the resident request');

    await evaluate(`RH.login(RH.getUsers().find(user=>user.role==='manager'),false)`);
    await navigate('/dashboard.html');
    await evaluate(`switchTab('support');RHUI.openSupportForm('staff-task-request')`);
    assert.equal(await evaluate(`document.getElementById('rhDrawerBody').textContent.includes('Đã kiểm tra và khắc phục.')`), true);
    await evaluate(`document.getElementById('srApproveCompletion').click()`);
    assert.deepEqual(await evaluate(`(()=>{const r=RHD.get('supportRequests','staff-task-request');return {status:r.status,taskStatus:r.staffTaskStatus}})()`), {
        status: 'resolved', taskStatus: 'approved'
    }, 'Management approval completes the same resident support request');
    await evaluate(`RHUI.openSupportForm('staff-task-request');document.getElementById('srWageBase').value='100000';document.getElementById('srWageAdjustment').value='15000';document.getElementById('srWageStatus').value='paid';document.getElementById('srWagePaidDate').value=new Date().toISOString().slice(0,10);RHUI.submitSupportForm({preventDefault(){}})`);
    assert.equal(await evaluate(`(()=>{const r=RHD.get('supportRequests','staff-task-request');return (!r.staffWage||Number(r.staffWage.approvedAmount)===0)&&RHD.list('cashflows').filter(row=>row.taskId==='staff-task-request').length===0})()`), true, 'An adjustment without a reason cannot be approved or written to the cashflow ledger');
    await evaluate(`document.getElementById('srWageAdjustmentReason').value='Khối lượng phát sinh đã xác nhận';RHUI.submitSupportForm({preventDefault(){}})`);
    assert.deepEqual(await evaluate(`(()=>{const r=RHD.get('supportRequests','staff-task-request');const c=RHD.get('cashflows',r.staffWage.cashflowId);return {base:r.staffWage.baseAmount,total:r.staffWage.approvedAmount,adjustment:r.staffWage.adjustments[0].amount,reason:r.staffWage.adjustments[0].reason,status:r.staffWage.status,linked:c.taskId,ledgerAmount:c.amount}})()`), {
        base: 100000, total: 115000, adjustment: 15000, reason: 'Khối lượng phát sinh đã xác nhận', status: 'paid', linked: 'staff-task-request', ledgerAmount: 115000
    }, 'Management approval preserves adjustment reason and links the paid wage to a matching expense');
    await evaluate(`RHD.update('supportRequests','staff-task-request',{staffCompletedAt:'2026-10-15'});[
        {id:'staff-material-approved',type:'expense',date:'2026-10-15',amount:40000,quantity:2,unitPrice:20000,description:'Ống nối',approvalStatus:'approved',taskId:'staff-task-request'},
        {id:'staff-material-pending',type:'expense',date:'2026-10-15',amount:25000,description:'Băng keo điện',approvalStatus:'pending',taskId:'staff-task-request'},
        {id:'staff-material-rejected',type:'expense',date:'2026-10-15',amount:10000,description:'Vật tư bị từ chối',approvalStatus:'rejected',taskId:'staff-task-request'},
        {id:'staff-expense-unassigned',type:'expense',date:'2026-10-15',amount:90000,description:'Chi phí nhiệm vụ người khác',approvalStatus:'approved',taskId:'staff-task-private'}
    ].forEach(record=>RHD.create('cashflows',record))`);
    await evaluate(`RH.login(RH.getUsers().find(user=>user.id==='staff-task-check'),false)`);
    await navigate('/staff.html');
    await evaluate(`document.querySelector('[data-title="Lịch sử tiền công"]').click()`);
    assert.equal(await evaluate(`document.getElementById('staffContent').textContent.includes('115.000 đ')&&document.getElementById('staffContent').textContent.includes('Đã thanh toán')&&document.getElementById('staffContent').textContent.includes('Khớp phiếu')`), true, 'Staff wage history shows approved amount, payment state, and cashflow reconciliation');
    assert.equal(await evaluate(`!document.getElementById('staffWageBase')&&!document.getElementById('staffWageAdjustment')`), true, 'Staff wage history has no amount or adjustment editor');
    await evaluate(`document.querySelector('[data-title="Tổng hợp tiền công & chi phí"]').click();document.getElementById('staffCompensationMonth').value='2026-10';document.getElementById('staffCompensationMonth').dispatchEvent(new Event('change',{bubbles:true}))`);
    assert.equal(await evaluate(`document.getElementById('staffContent').textContent.includes('155.000 ₫')&&document.getElementById('staffContent').textContent.includes('40.000 ₫')&&document.getElementById('staffContent').textContent.includes('25.000 ₫')`), true, 'The monthly summary combines approved wages and material costs but excludes pending and rejected amounts');
    await evaluate(`document.getElementById('staffCompensationStatus').value='pending';document.getElementById('staffCompensationStatus').dispatchEvent(new Event('change',{bubbles:true}))`);
    assert.equal(await evaluate(`document.getElementById('staffContent').textContent.includes('115.000 ₫')&&document.getElementById('staffContent').textContent.includes('25.000 ₫')&&!document.getElementById('staffContent').textContent.includes('Ống nối')`), true, 'The approval filter updates the summary and itemized expense rows');
    await evaluate(`document.getElementById('staffCompensationFrom').value='2026-10-16';document.getElementById('staffCompensationFrom').dispatchEvent(new Event('change',{bubbles:true}))`);
    assert.equal(await evaluate(`document.getElementById('staffContent').textContent.includes('Không có nhiệm vụ hoặc khoản chi phù hợp')&&!document.getElementById('staffContent').textContent.includes('25.000 ₫')`), true, 'The date range filters task-linked labor and expenses');
    await evaluate(`document.getElementById('staffCompensationFrom').value='';document.getElementById('staffCompensationFrom').dispatchEvent(new Event('change',{bubbles:true}))`);
    await evaluate(`document.querySelector('[data-open-task="staff-task-request"]').click()`);
    assert.equal(await evaluate(`document.getElementById('staffPageTitle').textContent==='Chi tiết nhiệm vụ'&&document.getElementById('staffContent').textContent.includes('Kiểm tra van khóa trước khi thay thiết bị.')`), true, 'Summary task links open the assigned source task');
    await evaluate(`document.querySelector('[data-title="Lịch sử tiền công"]').click()`);
    assert.deepEqual(await evaluate(`(()=>{const r=RHD.get('supportRequests','staff-task-request'),c=RHD.get('cashflows',r.staffWage.cashflowId);return {wageUpdate:RHD.update('supportRequests',r.id,{staffWage:{baseAmount:1}}).ok,cashflowUpdate:RHD.update('cashflows',c.id,{amount:1}).ok,cashflowDelete:RHD.remove('cashflows',c.id).ok,cashflowCreate:RHD.create('cashflows',{type:'expense',amount:1,taskId:r.id}).ok}})()`), {
        wageUpdate: false, cashflowUpdate: false, cashflowDelete: false, cashflowCreate: false
    }, 'The shared data layer rejects staff edits to approved wages and linked cashflows');
    await evaluate(`document.querySelector('[data-open-task="staff-task-request"]').click()`);
    assert.equal(await evaluate(`document.getElementById('staffContent').textContent.includes('Khối lượng phát sinh đã xác nhận')&&document.getElementById('staffContent').textContent.includes('115.000 đ')`), true, 'Staff can open the linked task and review its wage adjustment');
    await evaluate(`RHD.update('supportRequests','staff-task-request',{assigneeId:'another-staff-id'});document.querySelector('[data-title="Tổng hợp tiền công & chi phí"]').click();document.getElementById('staffCompensationMonth').value='2026-10';document.getElementById('staffCompensationMonth').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('staffCompensationStatus').value='all';document.getElementById('staffCompensationStatus').dispatchEvent(new Event('change',{bubbles:true}))`);
    assert.equal(await evaluate(`!document.getElementById('staffContent').textContent.includes('Dữ liệu giả định')&&document.getElementById('staffContent').textContent.includes('630.000 ₫')&&document.getElementById('staffContent').textContent.includes('140.000 ₫')&&document.getElementById('staffContent').textContent.includes('770.000 ₫')&&document.getElementById('staffContent').textContent.includes('145.000 ₫')`), true, 'October totals remain visible without the sample-data label');
    assert.equal(await evaluate(`document.getElementById('staffContentTitle').hidden&&document.getElementById('staffPageTitle').textContent==='Tổng hợp tiền công & chi phí'&&!!document.getElementById('staffCompensationSearch')&&!!document.getElementById('staffCompensationTasks')&&Array.from(document.getElementById('staffCompensationTasks').options).some(option=>option.value.includes('CV002')&&option.value.includes('Sửa điện hành lang tầng 2'))`), true, 'The summary has one page heading and a combined task search with code/title suggestions');
    await evaluate(`document.getElementById('staffCompensationSearch').value='CV002';document.getElementById('staffCompensationSearch').dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.equal(await evaluate(`(()=>{const tables=document.querySelectorAll('#staffContent table');return document.getElementById('staffContent').textContent.includes('200.000 ₫')&&document.getElementById('staffContent').textContent.includes('145.000 ₫')&&tables[0].tBodies[0].rows.length===1&&tables[0].tBodies[0].textContent.includes('CV002')&&tables[1].tBodies[0].rows.length===2&&!tables[0].tBodies[0].textContent.includes('CV001')&&!tables[1].tBodies[0].textContent.includes('CV001')})()`), true, 'Selecting a task code filters summary and materials to that task');
    await evaluate(`document.getElementById('staffCompensationSearch').value='';document.getElementById('staffCompensationSearch').dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.equal(await evaluate(`document.getElementById('staffContent').textContent.includes('Ống nối cấp nước')&&document.getElementById('staffContent').textContent.includes('Gioăng cao su')&&document.getElementById('staffContent').textContent.includes('Băng keo điện')&&document.getElementById('staffContent').textContent.includes('Ruột khóa cửa')`), true, 'Sample data shows each separate material item');
    await evaluate(`document.querySelector('[data-open-task="sample-CV002"]').click()`);
    assert.equal(await evaluate(`document.getElementById('staffContent').textContent.includes('CV002')&&document.getElementById('staffContent').textContent.includes('Dây điện lõi đồng')&&document.getElementById('staffContent').textContent.includes('Đang chờ duyệt')&&!document.querySelector('[data-task-action]')`), true, 'Sample links open read-only task details including itemized expenses');
    await evaluate(`RH.login(RH.getUsers().find(user=>user.id==='resident-task-check'),false)`);
    await navigate('/resident-web.html');
    await evaluate(`showResidentSection('requests');openRequestDetail('YC-TASK-01')`);
    assert.equal(await evaluate(`document.getElementById('modalBody').textContent.includes('Yêu cầu đã được xử lý')`), true, 'The resident support page shows the approved request');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log('Staff task assignment, access isolation, progress, and approval passed.');
} finally {
    ws?.close();
    if (browser.exitCode === null) {
        browser.kill();
        await new Promise(resolveExit => browser.once('exit', resolveExit));
    }
    server.closeAllConnections();
    server.close();
    rmSync(profileRoot, { recursive: true, force: true });
}
