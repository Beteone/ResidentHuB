// Real PostgreSQL engine (PGlite/WASM) with a minimal Supabase Auth fixture.
// Exercises the phase-D business-data RPCs exactly as the browser calls them.
// No network, Supabase project or production data is used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

export const MIGRATIONS = ['202610210001_foundation.sql', '202611040001_identity.sql', '202611040002_identity_invites.sql', '202611070001_business_data.sql'];
const org = '10000000-0000-4000-a000-000000000001';
const otherOrg = '10000000-0000-4000-a000-000000000002';
const uid = n => `20000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const sid = n => `30000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const db = new PGlite();

// The demo dataset that data.js really generates: realistic payload shapes.
function demoDataset() {
  const store = new Map();
  const c = vm.createContext({ console, Date, Math, JSON, dispatchEvent() {}, CustomEvent: class {},
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) } });
  c.window = c;
  for (const file of ['templates.js', 'data.js']) vm.runInContext(readFileSync(file, 'utf8'), c, { filename: file });
  c.RHD.setMode('demo');
  const out = {};
  for (const [key, value] of store) out[key.replace('residenthub_demo_', '')] = JSON.parse(value);
  return out;
}

async function as(n, session = n) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: uid(n), session_id: sid(session), role: 'authenticated' })]);
  await db.exec('set role authenticated');
}
async function call(sql, args) { return (await db.query(sql, args)).rows[0].result; }
const load = (o = org) => call('select public.rh_data_load($1) as result', [o]);
const apply = (entity, changes, o = org) => call('select public.rh_data_apply($1,$2,$3) as result', [o, entity, JSON.stringify(changes)]);
const saveDoc = (doc, value, version) => call('select public.rh_data_save_doc($1,$2,$3,$4) as result', [org, doc, JSON.stringify(value), version]);
const create = (entity, payload) => apply(entity, [{ op: 'upsert', id: payload.id, version: 0, payload }]);
async function sqlstate(fn, code) {
  try { await fn(); } catch (error) { assert.equal(error.code, code, `expected SQLSTATE ${code}, got ${error.code}: ${error.message}`); return; }
  assert.fail(`expected SQLSTATE ${code}`);
}
const ids = (data, entity) => data.collections[entity].map(row => row.p.id).sort();
const version = (data, entity, id) => data.collections[entity].find(row => row.p.id === id).v;

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,encrypted_password text,email_confirmed_at timestamptz,invited_at timestamptz,created_at timestamptz default now());
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated;`);
  for (const file of MIGRATIONS) await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  await db.query('insert into public.rh_organizations(id,name,identity_enabled,data_access_enabled) values ($1,$2,true,true),($3,$4,true,true)', [org, 'Fixture', otherOrg, 'Other']);
  const managerPerms = ['dashboard.view','buildings.view','buildings.update','apartments.view','apartments.create','apartments.update','apartments.delete',
    'customers.view','customers.create','customers.update','contracts.view','contracts.create','contracts.update','meters.view','meters.create','meters.update',
    'invoices.view','invoices.create','invoices.update','invoices.issue','invoices.send','support.view','support.update','templates.view'];
  for (const [o, id, portal, system, full, permissions] of [
    [org, 'at-admin', 'manager', true, true, []], [org, 'at-building-manager', 'manager', false, false, managerPerms],
    [org, 'at-staff', 'manager', false, false, ['dashboard.view','staffTasks.view','staffTasks.accept','staffTasks.update','staffTasks.report','support.create']],
    [org, 'at-resident', 'resident', true, false, []], [otherOrg, 'at-admin', 'manager', true, true, []]
  ]) await db.query('insert into public.rh_account_types(organization_id,id,name,portal,system_type,full_access,permissions) values ($1,$2,$2,$3,$4,$5,$6)', [o, id, portal, system, full, permissions]);
  for (let n = 1; n <= 6; n++) {
    await db.query('insert into auth.users(id,email,encrypted_password,email_confirmed_at) values ($1,$2,$3,now())', [uid(n), `fixture${n}@example.invalid`, 'fixture-hash']);
    await db.query('insert into auth.sessions(id,user_id) values ($1,$2)', [sid(n), uid(n)]);
  }
  await db.query('insert into auth.sessions(id,user_id) values ($1,$2)', [sid(11), uid(1)]); // admin, second device
  for (const [o, n, id, type, role, all, name] of [
    [org, 1, 'u-manager-1', 'at-admin', 'manager', true, 'Admin'], [org, 2, 'manager', 'at-building-manager', 'manager', false, 'Manager'],
    [org, 3, 'staff', 'at-staff', 'staff', false, 'Kỹ thuật A'], [org, 4, 'resident', 'at-resident', 'resident', false, 'Resident'],
    [otherOrg, 5, 'other-admin', 'at-admin', 'manager', true, 'Other admin'], [org, 6, 'resident-2', 'at-resident', 'resident', false, 'Resident 2']
  ]) await db.query('insert into public.rh_memberships(organization_id,id,auth_user_id,account_type_id,role,status,name,all_buildings) values ($1,$2,$3,$4,$5,$6,$7,$8)', [o, id, uid(n), type, role, 'active', name, all]);

  // ---- 1. Import the real demo dataset as Admin, in FK order, insert-only.
  const demo = demoDataset();
  await as(1);
  const order = ['templates', 'buildings', 'customers', 'apartments', 'contracts', 'meters', 'invoices', 'supportRequests'];
  for (const entity of order) {
    const rows = demo[entity];
    assert.ok(rows.length, entity + ' fixture present');
    const result = await apply(entity, rows.map(payload => ({ op: 'upsert', id: payload.id, version: 0, payload })));
    assert.equal(result.length, rows.length);
  }
  let deviceA = await load();
  for (const entity of order) assert.deepEqual(ids(deviceA, entity), demo[entity].map(r => r.id).sort(), entity + ' round trip');
  // Payload preserved exactly (jsonb may reorder keys only).
  assert.deepEqual(deviceA.collections.contracts[0].p, demo.contracts[0]);
  // Re-running the import never overwrites or duplicates.
  await sqlstate(() => create('buildings', demo.buildings[0]), '40001');

  // ---- 2. Second device of the same account reads identical data.
  await as(1, 11);
  const deviceB = await load();
  assert.deepEqual(deviceB.collections, deviceA.collections);

  // ---- 3. Device A edits an apartment; device B's stale write is rejected; B reloads and sees it.
  const apartment = demo.apartments[0], building = demo.buildings[0];
  await as(1);
  const updated = await apply('apartments', [{ op: 'upsert', id: apartment.id, version: version(deviceA, 'apartments', apartment.id), payload: { ...apartment, rentPrice: 7777000 } }]);
  assert.equal(updated[0].version, 2);
  await as(1, 11);
  await sqlstate(() => apply('apartments', [{ op: 'upsert', id: apartment.id, version: 1, payload: { ...apartment, rentPrice: 1 } }]), '40001');
  assert.equal((await load()).collections.apartments.find(r => r.p.id === apartment.id).p.rentPrice, 7777000);

  // ---- 4. Integrity: FK, cross-org, credentials, ledger uniqueness.
  await as(1);
  await sqlstate(() => create('apartments', { id: 'apt-orphan', name: 'X', buildingId: 'missing-building' }), '23503');
  await sqlstate(() => apply('buildings', [{ op: 'delete', id: building.id, version: 1 }]), '23001'); // RESTRICT: still has apartments
  await sqlstate(() => create('customers', { id: 'cus-secret', fullName: 'X', password: 'never' }), '22023');
  await sqlstate(() => create('buildings', { id: 'b-bad-manager', name: 'Bad', managerId: 'not-a-member' }), '23503');
  await sqlstate(() => create('contracts', { ...demo.contracts[0], id: 'ct-ghost-tenant', tenantIds: ['ghost-customer'] }), '23503');
  await create('billingRuns', { id: 'run-1', key: 'b|c|2026-10', buildingId: building.id });
  await sqlstate(() => create('billingRuns', { id: 'run-2', key: 'b|c|2026-10', buildingId: building.id }), '23505');
  await sqlstate(() => load(otherOrg), '42501');
  await as(5);
  assert.equal((await load(otherOrg)).collections.buildings.length, 0);
  await sqlstate(() => load(org), '42501');
  await sqlstate(() => apply('buildings', [{ op: 'upsert', id: 'b-x', version: 0, payload: { id: 'b-x', name: 'x' } }], org), '42501');

  // ---- 5. Building manager: scope + module permissions enforced at the DB.
  await as(1);
  await create('buildings', { id: 'b-manager', name: 'Assigned', managerId: 'manager' });
  await create('apartments', { id: 'apt-manager', name: 'M1', buildingId: 'b-manager', status: 'vacant' });
  await as(2);
  let mgr = await load();
  assert.deepEqual(ids(mgr, 'buildings'), ['b-manager']);
  assert.deepEqual(ids(mgr, 'apartments'), ['apt-manager']);
  assert.equal(mgr.collections.contracts.length, 0);
  await sqlstate(() => create('buildings', { id: 'b-escalate', name: 'No', managerId: 'manager' }), '42501'); // lacks buildings.create
  await sqlstate(() => apply('apartments', [{ op: 'upsert', id: apartment.id, version: 2, payload: { ...apartment, rentPrice: 1 } }]), '42501'); // out of scope
  await sqlstate(() => create('apartments', { id: 'apt-foreign', name: 'F', buildingId: building.id }), '42501');
  const own = await apply('apartments', [{ op: 'upsert', id: 'apt-manager', version: 1, payload: { id: 'apt-manager', name: 'M1', buildingId: 'b-manager', status: 'occupied' } }]);
  assert.equal(own[0].payload.status, 'occupied');
  await sqlstate(() => create('financialAccounts', { id: 'fa-1', name: 'Quỹ' }), '42501'); // settings.update required
  await sqlstate(() => apply('activity', [{ op: 'upsert', id: 'log-1', version: 0, payload: { id: 'log-1', actorId: 'u-manager-1', at: new Date().toISOString() } }]), '42501');
  await create('customers', { id: 'cus-new', fullName: 'Walk-in' });
  await as(1);
  const invoice = demo.invoices[0];
  await as(1);
  // Admin grants nothing implicitly: direct table writes are impossible for authenticated.
  await assert.rejects(() => db.query(`insert into public.rh_buildings(organization_id,payload) values ('${org}','{"id":"direct"}')`));
  await assert.rejects(() => db.query(`update public.rh_organizations set data_access_enabled=true`).then(r => { if (!r.affectedRows) throw Error('no-op'); }));

  // ---- 6. Staff: only assigned tasks, cannot touch wages or other records.
  const request = demo.supportRequests[0];
  await as(1);
  await db.exec('reset role');
  await db.query('insert into public.rh_building_assignments values ($1,$2,$3)', [org, 'staff', building.id]);
  await as(1);
  deviceA = await load();
  await apply('supportRequests', [{ op: 'upsert', id: request.id, version: version(deviceA, 'supportRequests', request.id), payload: { ...request, assigneeId: 'staff', assignee: 'Kỹ thuật A', status: 'new', staffWage: { amount: 200000 } } }]);
  await create('supportRequests', { id: 'req-other', code: 'YC-9', buildingId: building.id, apartmentId: apartment.id, status: 'new', assigneeId: 'u-manager-1', title: 'Other' });
  await as(3);
  let staff = await load();
  assert.deepEqual(ids(staff, 'supportRequests'), [request.id]);
  assert.equal('staffWage' in staff.collections.supportRequests[0].p, false);
  assert.equal(staff.collections.contracts.length, 0);
  assert.equal(staff.collections.invoices.length, 0);
  const task = staff.collections.supportRequests[0];
  const accepted = await apply('supportRequests', [{ op: 'upsert', id: request.id, version: task.v, payload: { ...task.p, status: 'in_progress', staffTaskStatus: 'in_progress', acceptedAt: 1 } }]);
  assert.equal(accepted[0].payload.status, 'in_progress');
  await db.exec('reset role');
  assert.equal((await db.query('select payload->\'staffWage\'->>\'amount\' a from public.rh_support_requests where id=$1', [request.id])).rows[0].a, '200000'); // hidden wage kept
  await as(3);
  await sqlstate(() => apply('supportRequests', [{ op: 'upsert', id: request.id, version: accepted[0].version, payload: { ...accepted[0].payload, staffWage: { amount: 9e9 } } }]), '42501');
  await sqlstate(() => apply('supportRequests', [{ op: 'upsert', id: request.id, version: accepted[0].version, payload: { ...accepted[0].payload, title: 'rewritten' } }]), '42501');
  await sqlstate(() => apply('supportRequests', [{ op: 'upsert', id: 'req-other', version: 1, payload: { id: 'req-other', status: 'closed' } }]), '42501');
  await sqlstate(() => apply('supportRequests', [{ op: 'delete', id: request.id, version: accepted[0].version }]), '42501');
  await sqlstate(() => create('cashflows', { id: 'cf-wage', taskId: request.id, amount: 1 }), '42501');
  const staffRequest = await create('supportRequests', { id: 'req-staff', source: 'staff', requesterId: 'staff', buildingId: building.id, status: 'new', title: 'Cần vật tư' });
  assert.equal(staffRequest[0].version, 1);
  await sqlstate(() => create('supportRequests', { id: 'req-spoof', source: 'staff', requesterId: 'manager', buildingId: building.id, status: 'new' }), '42501');

  // ---- 7. Resident: only own contract/apartment/invoices; limited updates.
  await as(1);
  await db.exec('reset role');
  await db.query('update public.rh_memberships set resident_id=$1 where id=$2', [demo.contracts[0].customerId, 'resident']);
  await as(4);
  let resident = await load();
  assert.deepEqual(ids(resident, 'contracts'), [demo.contracts[0].id]);
  assert.deepEqual(ids(resident, 'apartments'), [demo.contracts[0].apartmentId]);
  assert.deepEqual(ids(resident, 'buildings'), [demo.contracts[0].buildingId]);
  assert.deepEqual(ids(resident, 'invoices'), [invoice.id]);
  assert.equal(resident.collections.cashflows.length, 0);
  assert.equal(resident.collections.billingRuns.length, 0);
  const myInvoice = resident.collections.invoices[0];
  const pending = await apply('invoices', [{ op: 'upsert', id: invoice.id, version: myInvoice.v, payload: { ...myInvoice.p, status: 'payment_pending', paymentMethod: 'transfer', paymentRequestedAt: 1 } }]);
  assert.equal(pending[0].payload.status, 'payment_pending');
  await sqlstate(() => apply('invoices', [{ op: 'upsert', id: invoice.id, version: pending[0].version, payload: { ...pending[0].payload, status: 'paid' } }]), '42501');
  await sqlstate(() => apply('invoices', [{ op: 'upsert', id: invoice.id, version: pending[0].version, payload: { ...pending[0].payload, total: 1 } }]), '42501');
  const otherApartment = demo.apartments.find(a => a.id !== demo.contracts[0].apartmentId);
  await sqlstate(() => create('supportRequests', { id: 'req-r-bad', buildingId: otherApartment.buildingId, apartmentId: otherApartment.id, residentEmail: 'fixture4@example.invalid', status: 'new' }), '42501');
  await create('supportRequests', { id: 'req-r-ok', buildingId: demo.contracts[0].buildingId, apartmentId: demo.contracts[0].apartmentId, customerId: demo.contracts[0].customerId, residentEmail: 'fixture4@example.invalid', status: 'new', messages: [] });
  await sqlstate(() => apply('apartments', [{ op: 'upsert', id: demo.contracts[0].apartmentId, version: 2, payload: { id: demo.contracts[0].apartmentId } }]), '42501');
  await as(6);
  resident = await load();
  assert.equal(resident.collections.contracts.length, 0);
  assert.equal(resident.collections.invoices.length, 0);
  assert.equal(resident.collections.customers.length, 0);

  // ---- 8. Member documents are private; org billing meta needs invoices.create.
  await as(1);
  assert.equal((await saveDoc('settings', { invoiceDueDays: 7 }, 0)).version, 1);
  await sqlstate(() => saveDoc('settings', { invoiceDueDays: 9 }, 0), '40001');
  assert.equal((await load()).docs.settings.value.invoiceDueDays, 7);
  await as(1, 11);
  assert.equal((await load()).docs.settings.value.invoiceDueDays, 7); // same account, another device
  await as(2);
  assert.equal((await load()).docs.settings, undefined);
  await as(3);
  await sqlstate(() => saveDoc('billingMeta', { last: 'x' }, 0), '42501');
  await as(1);
  await apply('activity', [{ op: 'upsert', id: 'log-a', version: 0, payload: { id: 'log-a', actorId: 'u-manager-1', at: new Date().toISOString(), module: 'buildings' } }]);
  await sqlstate(() => apply('activity', [{ op: 'upsert', id: 'log-a', version: 1, payload: { id: 'log-a', actorId: 'u-manager-1', at: 'edited' } }]), '42501');
  await sqlstate(() => apply('activity', [{ op: 'delete', id: 'log-a', version: 1 }]), '42501');

  // ---- 9. Revocation: lock / role change / gate / anon take effect on the next call.
  await as(1);
  await call('select public.rh_identity_update_member($1,$2,$3) as result', [org, 'manager', { status: 'locked' }]);
  await as(2);
  await sqlstate(() => load(), '42501');
  await sqlstate(() => create('customers', { id: 'cus-locked', fullName: 'X' }), '42501');
  await as(1);
  await call('select public.rh_identity_update_member($1,$2,$3) as result', [org, 'manager', { status: 'active' }]);
  await as(2);
  await sqlstate(() => load(), '42501'); // old session stays revoked after unlock
  await db.exec('reset role');
  await db.query('update public.rh_organizations set data_access_enabled=false where id=$1', [org]);
  await as(1);
  await sqlstate(() => load(), '42501');
  await db.exec('reset role');
  await db.query('update public.rh_organizations set data_access_enabled=true where id=$1', [org]);
  await db.exec('set role anon');
  await assert.rejects(() => load());
  await assert.rejects(() => db.query('select * from public.rh_buildings'));
  await db.exec('reset role');
  // ---- 10. Operator bootstrap script: creates org + types + ONE Admin, refuses to re-run.
  const bootstrap = readFileSync('supabase/sql/bootstrap-organization.sql', 'utf8');
  await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,null)', [uid(9), 'manager@residenthub.vn']);
  await assert.rejects(() => db.exec(bootstrap), /not confirmed/);
  await db.query('update auth.users set email_confirmed_at=now() where id=$1', [uid(9)]);
  await db.exec(bootstrap);
  const booted = (await db.query(`select o.id, o.data_access_enabled d, (select count(*)::int from public.rh_account_types t where t.organization_id=o.id) types,
      (select string_agg(m.id||':'||m.account_type_id,',') from public.rh_memberships m where m.organization_id=o.id) members
    from public.rh_organizations o where o.name='ResidentHub'`)).rows;
  assert.equal(booted.length, 1);
  assert.deepEqual([booted[0].d, booted[0].types, booted[0].members], [true, 4, 'u-manager-1:at-admin']);
  await assert.rejects(() => db.exec(bootstrap), /already has a membership/);
  assert.equal((await db.query(`select count(*)::int n from public.rh_organizations where name='ResidentHub'`)).rows[0].n, 1);
  // Nothing was lost along the way.
  assert.equal((await db.query('select count(*)::int n from public.rh_buildings where organization_id=$1', [org])).rows[0].n, 2);
  assert.equal((await db.query('select count(*)::int n from public.rh_apartments where organization_id=$1', [org])).rows[0].n, demo.apartments.length + 1);
  console.log('PASS PostgreSQL business data RPC: real demo dataset import, two-device read/write, optimistic conflicts, FK integrity, scope/permission/staff/resident rules, private docs, append-only audit, lock/gate/anon revocation');
} finally { await db.close(); }
