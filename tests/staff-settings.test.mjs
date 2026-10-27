import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

const persistent = new Map();
const session = new Map();
const storage = map => ({
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
});
const context = {
    crypto: webcrypto,
    console,
    Date,
    Intl,
    Math,
    JSON,
    localStorage: storage(persistent),
    sessionStorage: storage(session),
    dispatchEvent() {},
    addEventListener() {},
    CustomEvent: class {}
};
context.window = context;
context.location = { replace() {} };
vm.createContext(context);
vm.runInContext(readFileSync('auth.js', 'utf8'), context, { filename: 'auth.js' });

const { RH } = context;
const staff = RH.getUsers().find(user => user.id === 'u-staff-demo');
const loginEmail = staff.email;
RH.login(staff, false);

assert.equal(RH.updateCurrentUserProfile({ name: 'Changed by staff' }).ok, false);
assert.equal(RH.updateCurrentUserProfile({ employeeCode: 'CHANGED' }).ok, false);
assert.equal(RH.updateCurrentUserProfile({ department: 'Changed by staff' }).ok, false);
assert.equal(RH.updateCurrentUserProfile({ buildingIds: ['another-building'] }).ok, false);
assert.equal(RH.updateCurrentUserProfile({ status: 'locked' }).ok, false);
assert.equal(RH.updateCurrentUserProfile({ profileUpdateHistory: [] }).ok, false);
assert.equal(RH.updateCurrentUserProfile({ email: 'invalid-email' }).ok, false);
assert.equal(RH.updateCurrentUserProfile({ email: 'staff invalid@example.test' }).ok, false);
assert.equal(RH.updateCurrentUserProfile({ phone: '---' }).ok, false);
const profile = RH.updateCurrentUserProfile({
    email: 'staff.updated@residenthub.test',
    phone: '+84 901 234 567',
    avatar: 'data:image/png;base64,YWJj'
});
assert.equal(profile.ok, true);
assert.equal(RH.getSession().email, loginEmail);
assert.equal(RH.getUsers().find(user => user.id === staff.id).contactEmail, 'staff.updated@residenthub.test');
assert.equal(RH.getUsers().find(user => user.id === staff.id).phone, '+84 901 234 567');
const profileHistory = RH.getUsers().find(user => user.id === staff.id).profileUpdateHistory;
assert.equal(profileHistory.length, 1);
assert.equal(JSON.stringify(profileHistory[0].changes.map(item => item.field)), JSON.stringify(['contactEmail', 'phone', 'avatar']));
assert.equal(profileHistory[0].managerStatus, 'new');
assert.equal(profileHistory[0].changes.find(item => item.field === 'avatar').after, undefined);
RH.login(RH.getUsers().find(user => user.id === staff.id), false);
assert.equal(RH.getUsers().find(user => user.id === staff.id).contactEmail, 'staff.updated@residenthub.test');
assert.equal(RH.getUsers().find(user => user.id === staff.id).name, 'Nguyễn Minh Anh');

assert.equal(RH.updateCurrentUserSettings({ theme: 'neon' }).ok, false);
assert.equal(RH.updateCurrentUserSettings({ fontSize: 'huge' }).ok, false);
assert.equal(RH.updateCurrentUserSettings({ accentColor: 'pink' }).ok, false);
assert.equal(RH.updateCurrentUserSettings({ theme: 'dark', density: 'compact' }).ok, true);
assert.equal(RH.updateCurrentUserSettings({ fontSize: 'large', accentColor: 'purple' }).ok, true);
assert.equal(RH.updateCurrentUserSettings({ notifications: { categories: { taskNew: false } } }).ok, true);
assert.equal(RH.updateCurrentUserSettings({ notifications: { channels: { email: true } } }).ok, false);
assert.equal(RH.getCurrentUserSettings().theme, 'dark');
assert.equal(RH.getCurrentUserSettings().density, 'compact');
assert.equal(RH.getCurrentUserSettings().fontSize, 'large');
assert.equal(RH.getCurrentUserSettings().accentColor, 'purple');
assert.equal(RH.getCurrentUserSettings().notifications.categories.taskNew, false);

const manager = RH.getUsers().find(user => user.role === 'manager');
RH.login(manager, false);
assert.equal(RH.updateCurrentUserProfile({ phone: '0901234567' }).ok, false);
RH.login(RH.getUsers().find(user => user.id === staff.id), false);
assert.equal(RH.updateStaffProfileFollowUp(staff.id, profileHistory[0].id, { managerStatus: 'resolved' }).ok, false);
RH.login(manager, false);
assert.equal(RH.updateStaffProfileFollowUp(staff.id, profileHistory[0].id, { managerStatus: 'resolved' }).ok, true);
assert.equal(RH.updateStaffProfileFollowUp(staff.id, profileHistory[0].id, { managerStatus: 'invalid' }).ok, false);
assert.equal(RH.updateStaffProfileFollowUp(staff.id, profileHistory[0].id, { managerNote: 'x'.repeat(1001) }).ok, false);
const followUp = RH.updateStaffProfileFollowUp(staff.id, profileHistory[0].id, {
    managerStatus: 'contacted',
    managerNote: 'Đã xác nhận thông tin liên hệ.'
});
assert.equal(followUp.ok, true);
assert.equal(followUp.update.managerStatus, 'contacted');
assert.equal(RH.getUsers().find(user => user.id === staff.id).profileUpdateHistory[0].managerNote, 'Đã xác nhận thông tin liên hệ.');
RH.login(manager, false);
const taskNotice = RH.createStaffNotificationForEvent(staff.id, 'taskNew', {
    eventId: 'task:1:assigned:1',
    title: 'Nhiệm vụ mới',
    body: 'Nhiệm vụ thực tế'
});
assert.equal(taskNotice.skipped, true);
RH.login(RH.getUsers().find(user => user.id === staff.id), false);
assert.equal(RH.getCurrentUserNotifications().length, 0);
assert.equal(RH.updateCurrentUserSettings({ notifications: { categories: { taskNew: true } } }).ok, true);
RH.login(manager, false);
assert.equal(RH.createStaffNotificationForEvent(staff.id, 'taskNew', {
    eventId: 'task:1:assigned:1',
    title: 'Nhiệm vụ mới',
    body: 'Nhiệm vụ thực tế'
}).ok, true);
RH.createStaffNotificationForEvent(staff.id, 'taskNew', {
    eventId: 'task:1:assigned:1',
    title: 'Nhiệm vụ mới',
    body: 'Nhiệm vụ trùng'
});
RH.login(RH.getUsers().find(user => user.id === staff.id), false);
assert.equal(RH.getCurrentUserNotifications().length, 1);
assert.equal(RH.markCurrentUserNotificationRead('unknown-notification').ok, false);
assert.equal(RH.markCurrentUserNotificationRead(RH.getCurrentUserNotifications()[0].id).item.isRead, true);
assert.equal(RH.getCurrentUserNotifications().filter(item => !item.isRead).length, 0);

// The registry extends the existing schema without touching stored role grants.
vm.runInContext(readFileSync('permissions.js', 'utf8'), context, { filename: 'permissions.js' });
const { RHP } = context;
assert.equal(new Set(RHP.allKeys()).size, RHP.allKeys().length, 'No duplicate permission keys');
for (const key of ['staffTasks.view', 'staffTasks.accept', 'staffTasks.update', 'staffTasks.report', 'staffIncome.view']) assert.equal(RHP.allKeys().includes(key), true);
assert.equal(RHP.typeOfUser(RH.getUsers().find(user => user.id === staff.id)).id, 'at-staff');
assert.equal(RHP.can('users.approveResident'), false, 'Legacy staff must not inherit building-manager approval rights');
const beforeTypes = persistent.get('residenthub_account_types');
RHP.registerModule({ id: 'staffFuture', label: 'Future module', actions: ['view'], extra: [{ id: 'export', label: 'Xuất dữ liệu' }] });
assert.equal(RHP.allKeys().includes('staffFuture.export'), true);
assert.equal(RHP.can('staffFuture.view'), false);
assert.equal(persistent.get('residenthub_account_types'), beforeTypes);
RHP.registerModule({ id: 'staffFuture', label: 'Future module', actions: ['view'] });
assert.equal(RHP.allKeys().filter(key => key === 'staffFuture.view').length, 1);
assert.equal(RHP.undeclaredPermissions(['staffFuture.view', 'unknown.view']).join(','), 'unknown.view');
assert.throws(() => RHP.registerModule({ id: 'broken', actions: ['bad'] }));
const registryUsers = RH.getUsers();
const registryAdmin = registryUsers.find(user => user.role === 'manager');
registryAdmin.accountTypeId = RHP.ADMIN_TYPE_ID;
persistent.set('residenthub_users', JSON.stringify(registryUsers));
RH.login(registryAdmin, false);
const registryTypes = RHP.listTypes();
const registryStaff = registryTypes.find(type => type.id === 'at-staff');
registryStaff.permissions.push('retiredModule.view');
persistent.set('residenthub_account_types', JSON.stringify(registryTypes));
assert.equal(RHP.saveType(registryStaff.id, { ...registryStaff, permissions: ['support.view'] }).ok, true);
assert.equal(RHP.getType(registryStaff.id).permissions.includes('retiredModule.view'), true);
console.log('PASS existing staff settings and compatible permission registration; no automatic grants.');

const passwordStaff = RH.getUsers().find(user => user.id === staff.id);
RH.login(passwordStaff, false);
let now = Date.now();
context.Date = class extends Date { static now() { return now; } };
const change = { currentPassword: passwordStaff.password, newPassword: 'ChangedStaff2026', confirmPassword: 'ChangedStaff2026' };
assert.equal(RH.beginOwnPasswordChange({ ...change, currentPassword: 'wrong' }).ok, false);
assert.equal(RH.beginOwnPasswordChange({ ...change, confirmPassword: 'different' }).ok, false);
assert.equal(RH.beginOwnPasswordChange({ ...change, newPassword: 'short' }).ok, false);
let challenge = RH.beginOwnPasswordChange(change);
assert.equal(challenge.ok, true);
assert.equal(RH.confirmOwnPasswordChange(challenge.challengeId, 'invalid').ok, false);
now += 120001;
assert.equal(RH.confirmOwnPasswordChange(challenge.challengeId, challenge.demoCode).ok, false);
const reissued = RH.resendOwnPasswordCode(challenge.challengeId);
assert.equal(reissued.ok, true);
assert.equal(RH.confirmOwnPasswordChange(reissued.challengeId, challenge.demoCode).ok, false);
const oldSession = RH.getSession();
assert.equal(RH.confirmOwnPasswordChange(reissued.challengeId, reissued.demoCode).ok, true);
assert.equal(RH.getSession(), null);
assert.equal(RH.confirmOwnPasswordChange(reissued.challengeId, reissued.demoCode).ok, false);
assert.equal(RH.authenticateDetailed(passwordStaff.email, change.newPassword).ok, true);
assert.equal(RH.authenticateDetailed(passwordStaff.email, change.currentPassword).ok, false);
session.set('residenthub_session', JSON.stringify(oldSession));
assert.equal(RH.getSession(), null, 'Old credential version cannot restore a session');
RH.login(RH.getUsers().find(user => user.id === staff.id), false);
challenge = RH.beginOwnPasswordChange({ ...change, currentPassword: change.newPassword, newPassword: 'AnotherStaff2026', confirmPassword: 'AnotherStaff2026' });
for (let i = 0; i < 5; i++) assert.equal(RH.confirmOwnPasswordChange(challenge.challengeId, 'invalid').ok, false);
assert.equal(RH.confirmOwnPasswordChange(challenge.challengeId, challenge.demoCode).ok, false);
challenge = RH.beginOwnPasswordChange({ ...change, currentPassword: change.newPassword, newPassword: 'AnotherStaff2026', confirmPassword: 'AnotherStaff2026' });
RH.login(RH.getUsers().find(user => user.id === registryAdmin.id), false);
assert.equal(RH.updateUser(staff.id, { status: 'locked' }).ok, true);
RH.login(passwordStaff, false);
assert.equal(RH.getSession(), null);
assert.equal(RH.confirmOwnPasswordChange(challenge.challengeId, challenge.demoCode).ok, false);
vm.runInContext(readFileSync('auth.js', 'utf8'), context, { filename: 'auth.js' });
assert.equal(context.RH.getUsers().find(user => user.id === staff.id).status, 'locked', 'Reload never unlocks the demo account');
persistent.set('residenthub_users', JSON.stringify(context.RH.getUsers().filter(user => user.id !== staff.id)));
context.RH.login(passwordStaff, false);
assert.equal(context.RH.getSession(), null, 'Deleted account cannot restore a session');
assert.equal(context.RH.beginOwnPasswordChange(change).ok, false);
vm.runInContext(readFileSync('auth.js', 'utf8'), context, { filename: 'auth.js' });
assert.equal(context.RH.getUsers().some(user => user.id === staff.id), false, 'Deleted demo account is not resurrected');
console.log('PASS password validation, OTP expiry/reissue/attempts/one-use, persisted new password, session revocation and locked account.');
