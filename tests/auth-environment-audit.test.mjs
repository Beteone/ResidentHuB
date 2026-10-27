// Diagnostic reproductions of CURRENT behavior; no real browser storage is used.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function workspace(local = new Map(), session = new Map()) {
  const storage = m => ({ getItem: k => m.get(k) ?? null, setItem: (k,v) => m.set(k,String(v)), removeItem: k => m.delete(k) });
  const c = vm.createContext({ console, localStorage: storage(local), sessionStorage: storage(session), location: { replace() {} }, alert() {}, CustomEvent: class {}, dispatchEvent() {}, addEventListener() {} });
  c.window = c;
  for (const f of ['auth.js','permissions.js','data.js']) vm.runInContext(readFileSync(f,'utf8'), c, { filename: f });
  return { c, local, session };
}
let count = 0;
function check(name, fn) { fn(); console.log(`PASS diagnostic: ${name}`); count++; }
const a = workspace();
const user = a.c.RH.getUsers()[0];
check('independent stores do not share accounts or business data', () => {
  const users = JSON.parse(a.local.get('residenthub_users'));
  users.push({ ...user, id:'audit-only', email:'audit@example.test', password:'audit-secret' });
  a.local.set('residenthub_users', JSON.stringify(users));
  a.c.RHD.create('buildings', { id:'audit-building' });
  const b = workspace();
  assert.equal(a.c.RH.authenticateDetailed('audit@example.test','audit-secret').ok, true);
  assert.equal(b.c.RH.authenticateDetailed('audit@example.test','audit-secret').ok, false);
  assert.equal(b.c.RHD.get('buildings','audit-building'), null);
});
a.c.RH.login(user, false);
a.c.RH_SESSION = a.c.RH.getSession();
check('manager fallback denies create with the reported message', () => {
  assert.equal(a.c.RHP.can('buildings.create'), false);
  assert.match(a.c.RHP.deniedMessage('buildings.create'), /Bạn không có quyền: Thêm · Tòa nhà/);
});
check('permissions refresh from local account type changes', () => {
  const types = JSON.parse(a.local.get('residenthub_account_types'));
  types.find(t => t.id === 'at-building-manager').permissions.push('buildings.create');
  a.local.set('residenthub_account_types', JSON.stringify(types));
  assert.equal(a.c.RHP.can('buildings.create'), true);
});
check('session reload, logout and account switch', () => {
  const reload = workspace(a.local, a.session);
  assert.equal(reload.c.RH.getSession().id, user.id);
  reload.c.RH.logout();
  assert.equal(reload.c.RH.getSession(), null);
  reload.c.RH.login(reload.c.RH.findUserByEmail('audit@example.test'), false);
  assert.equal(reload.c.RH.getSession().id, 'audit-only');
});
a.c.RH.login(user, false);
check('locked account invalidates the existing session and permissions', () => {
  a.c.RH.updateUser(user.id, { status:'locked' });
  assert.equal(a.c.RH.authenticateDetailed(user.email,user.password).reason, 'locked');
  assert.equal(a.c.RH.getSession(), null);
  assert.equal(a.c.RHP.can('buildings.create'), false);
});
check('data API bypasses UI permission checks (defect)', () => {
  a.c.RH.logout();
  a.c.RH_SESSION = null;
  assert.equal(a.c.RHP.can('buildings.create'), false);
  assert.equal(a.c.RHD.create('buildings', { id:'unguarded' }).ok, true);
});
check('demo initialization preserves changed credentials and lock', () => {
  a.c.RH.updateUser('u-staff-demo', { password:'changed-demo-secret', status:'locked' });
  const reload = workspace(a.local);
  const demo = reload.c.RH.getUsers().find(u => u.id === 'u-staff-demo');
  assert.equal(demo.password, 'changed-demo-secret');
  assert.equal(demo.status, 'locked');
});
check('live seed replaces remaining collections when buildings are empty (defect)', () => {
  const b = workspace();
  b.local.set('residenthub_live_customers', JSON.stringify([{ id:'existing-customer' }]));
  b.c.RHD.setMode('live');
  assert.equal(b.c.RHD.get('customers','existing-customer'), null);
});
check('invalid session, deleted user and corrupt users fail session restore', () => {
  const b = workspace();
  b.session.set('residenthub_session','{');
  assert.equal(b.c.RH.getSession(), null);
  b.c.RH.login(b.c.RH.getUsers()[0], false);
  b.local.set('residenthub_users','[]');
  assert.equal(b.c.RH.getSession(), null);
  b.local.set('residenthub_users','{');
  assert.equal(b.c.RH.getUsers().length, 0);
});
console.log(`${count} current-behavior diagnostics passed; defect assertions document bugs, not fixes.`);
