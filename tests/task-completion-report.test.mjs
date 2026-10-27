import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Load and evaluate core modules in a mock browser environment
const dataCode = readFileSync('./data.js', 'utf8');

const storage = {};
global.localStorage = {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};
global.sessionStorage = {
    getItem: (k) => storage['sess_' + k] || null,
    setItem: (k, v) => { storage['sess_' + k] = String(v); },
    removeItem: (k) => { delete storage['sess_' + k]; },
    clear: () => {}
};

global.window = global;
global.document = { dispatchEvent: () => {} };
global.location = { pathname: '/staff.html' };

let currentSession = { id: 'staff-tech-01', name: 'Nguyễn Văn Kỹ Thuật', email: 'tech@residenthub.vn', role: 'staff' };
global.RH = {
    getSession: () => currentSession,
    getUsers: () => [
        currentSession,
        { id: 'mgr-01', name: 'Trần Quản Lý', email: 'manager@residenthub.vn', role: 'manager', status: 'active' }
    ],
    createNotificationForUser: (userId, noti) => {
        notifications.push({ userId, ...noti });
        return { ok: true };
    },
    createStaffNotificationForEvent: (userId, category, noti) => {
        notifications.push({ userId, category, ...noti });
        return { ok: true };
    }
};

const notifications = [];
global.RHP = {
    can: (perm) => true,
    guard: (perm) => true,
    allKeys: () => ['staffTasks.view', 'staffTasks.accept', 'staffTasks.update', 'staffTasks.report', 'support.update'],
    inScope: () => true
};

// Evaluate data.js
new Function(dataCode)();

const RHD = global.RHD;
assert(RHD, 'RHD should be defined');

RHD.setMode('demo');

// Setup a mock task assigned to staff-tech-01
const mockReq = {
    id: 'req-test-complete-01',
    code: 'YC-TEST-01',
    title: 'Sửa đường ống nước rò rỉ',
    description: 'Nước rò rỉ dưới bồn rửa',
    status: 'in_progress',
    staffTaskStatus: 'in_progress',
    source: 'resident',
    assigneeId: 'staff-tech-01',
    assignee: 'Nguyễn Văn Kỹ Thuật',
    buildingId: 'b-01',
    apartmentId: 'apt-01',
    createdAt: Date.now()
};
// Setup session as manager to seed resident request
currentSession = { id: 'mgr-01', name: 'Trần Quản Lý', email: 'manager@residenthub.vn', role: 'manager' };

const created = RHD.create('supportRequests', mockReq);
if (!created.ok) console.error('created error:', created);
assert.equal(created.ok, true, 'Mock request created successfully');
const reqId = created.item.id;

// Now switch to staff portal
currentSession = { id: 'staff-tech-01', name: 'Nguyễn Văn Kỹ Thuật', email: 'tech@residenthub.vn', role: 'staff' };

console.log('Testing Task Completion Report flow...');

// 1. Test validation on followUpProposal length in data.js
const longProposal = 'a'.repeat(1005);
const invalidProgressResult = RHD.update('supportRequests', reqId, {
    staffProgress: { note: 'Đã hoàn thành tốt đẹp.', followUpProposal: longProposal }
});
assert.equal(invalidProgressResult.ok, false, 'Should reject followUpProposal exceeding 1000 characters');

// 2. Test valid completion report update
const sampleImage = {
    name: 'nghiem_thu.png',
    type: 'image/png',
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII='
};
const sampleMaterial = {
    id: 'mat-01',
    materialName: 'Ống dẫn nước mềm',
    quantity: 2,
    unitPrice: 45000,
    amount: 90000,
    reason: 'Thay dây cũ mục vỡ',
    approvalStatus: 'pending'
};

const completionUpdate = RHD.update('supportRequests', reqId, {
    staffTaskStatus: 'pending_approval',
    staffCompletionNote: 'Đã thay thế đường ống mới và thử áp lực nước thành công.',
    staffCompletedAt: Date.now(),
    staffProgress: {
        note: 'Đã thay thế đường ống mới và thử áp lực nước thành công.',
        followUpProposal: 'Kiểm tra lại sau 24h xem có rỉ ngầm chân tường không.',
        images: [sampleImage]
    },
    staffMaterials: [sampleMaterial],
    updatedAt: Date.now()
});

if (!completionUpdate.ok) console.error('completionUpdate error:', completionUpdate.error);
assert.equal(completionUpdate.ok, true, 'Should successfully update completion report');

const updated = RHD.get('supportRequests', reqId);
assert.equal(updated.staffTaskStatus, 'pending_approval', 'State should be pending_approval');
assert.equal(updated.status, 'in_progress', 'Resident status remains in_progress until manager approval');
assert.equal(updated.staffMaterials[0].approvalStatus, 'pending', 'Material should be pending approval');
assert.equal(updated.staffProgress.followUpProposal, 'Kiểm tra lại sau 24h xem có rỉ ngầm chân tường không.');

// 3. Test Manager Approval Flow
// Switch to manager session
currentSession = { id: 'mgr-01', name: 'Trần Quản Lý', email: 'manager@residenthub.vn', role: 'manager' };
global.location.pathname = '/dashboard.html';

const approvedMaterials = updated.staffMaterials.map(m => ({ ...m, approvalStatus: 'approved' }));
const approveResult = RHD.update('supportRequests', reqId, {
    status: 'resolved',
    staffTaskStatus: 'approved',
    staffMaterials: approvedMaterials,
    updatedAt: Date.now()
});
assert.equal(approveResult.ok, true, 'Manager can approve completion');

const finalReq = RHD.get('supportRequests', reqId);
assert.equal(finalReq.status, 'resolved', 'Task status is now resolved');
assert.equal(finalReq.staffTaskStatus, 'approved', 'Staff task is approved');
assert.equal(finalReq.staffMaterials[0].approvalStatus, 'approved', 'Material is approved');

// 4. Test Manager Rework / Rejection Flow
// Create another task in pending_approval
const reworkReq = {
    code: 'YC-TEST-02',
    title: 'Sửa bóng đèn hành lang',
    status: 'in_progress',
    staffTaskStatus: 'pending_approval',
    source: 'resident',
    assigneeId: 'staff-tech-01',
    assignee: 'Nguyễn Văn Kỹ Thuật',
    buildingId: 'b-01',
    createdAt: Date.now()
};
currentSession = { id: 'mgr-01', role: 'manager' };
const reworkCreated = RHD.create('supportRequests', reworkReq);
const reworkId = reworkCreated.item.id;

// Manager requests rework
const reworkResult = RHD.update('supportRequests', reworkId, {
    staffTaskStatus: 'in_progress',
    staffManagerNote: '[Quản lý yêu cầu làm lại]: Đèn vẫn còn chập chờn khi bật tắt công tắc.'
});
assert.equal(reworkResult.ok, true, 'Manager can request rework');

const reworkedReq = RHD.get('supportRequests', reworkId);
assert.equal(reworkedReq.staffTaskStatus, 'in_progress', 'Staff task status reverted to in_progress');
assert(reworkedReq.staffManagerNote.includes('Đèn vẫn còn chập chờn'), 'Manager note saved');

// Now staff can edit again
currentSession = { id: 'staff-tech-01', role: 'staff' };
const staffResubmit = RHD.update('supportRequests', reworkId, {
    staffTaskStatus: 'pending_approval',
    staffCompletionNote: 'Đã thay mới toàn bộ đui đèn và bóng LED 18W.',
    staffProgress: { note: 'Đã thay mới toàn bộ đui đèn và bóng LED 18W.', images: [sampleImage] }
});
assert.equal(staffResubmit.ok, true, 'Staff can resubmit after rework request');

console.log('Task Completion Report tests passed successfully!');
