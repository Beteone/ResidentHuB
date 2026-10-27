import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const persistent = new Map();
const session = new Map();
const storage = map => ({
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
});
const context = {
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
