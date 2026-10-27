import assert from 'node:assert/strict';
import { collect, encrypt, decrypt, inspect, compare } from '../tools/migration/backup.mjs';
const original = new Map([
  ['residenthub_users', JSON.stringify([{id:'u1',email:'one@example.test',password:'legacy-password'}, {id:'u2',email:'ONE@example.test'}])],
  ['residenthub_live_buildings','[{"id":"b1"}]'],
  ['residenthub_live_apartments','[{"id":"a1","buildingId":"b1"}]'],
  ['residenthub_live_customers','[{"id":"c1"}]'],
  ['residenthub_live_contracts','[{"id":"ct1","buildingId":"b2","apartmentId":"a1","tenantIds":["c1","missing"]}]'],
  ['residenthub_live_invoices','{bad-json'],
  ['residenthub_demo_buildings','[{"id":"b1"},{"id":"b1"}]'],
  ['residenthub_notification_campaigns_v1','[{"id":"campaign1"}]'],
  ['residentHubResidents','[{"id":"old-customer"}]'],
  ['rh_db_live_customers','[{"id":"old-customer"}]'],
  ['residenthub_settings_v1_u1','{"financial":{"bank":"example"}}'],
  ['residenthub_session','session-secret'], ['residenthub_password_recovery','recovery-secret'],
  ['other-app-secret','ignore-this']
]);
const before = [...original];
const storage = { get length() { return original.size; }, key:i => [...original.keys()][i] ?? null, getItem:k => original.get(k) ?? null };
const backup = collect(storage, 'http://localhost:8080');
assert.equal(backup.entries.length, 11);
assert.equal(backup.entries.some(x => x.raw === 'session-secret' || x.raw === 'recovery-secret'), false);
const report = inspect(backup);
assert.equal(report.readyForAutomaticImport, false);
for (const code of ['duplicate-user-or-email','legacy-password-requires-auth-invitation','duplicate-id','invalid-json-or-non-json','missing-reference','missing-tenant','building-apartment-mismatch']) assert.ok(report.issues.some(x => x.code === code), code);
assert.equal(JSON.stringify(report).includes('legacy-password"'), false);
const password = 'backup-passphrase-for-tests';
await assert.rejects(encrypt(backup,'short'));
const encrypted = await encrypt(backup,password);
assert.equal(JSON.stringify(encrypted).includes('legacy-password'), false);
assert.equal(JSON.stringify(encrypted).includes('one@example.test'), false);
assert.deepEqual(await decrypt(encrypted,password),backup);
await assert.rejects(decrypt(encrypted,'incorrect-password'));
const bytes = Buffer.from(encrypted.ciphertext,'base64'); bytes[0] ^= 1;
await assert.rejects(decrypt({...encrypted,ciphertext:bytes.toString('base64')},password));
await assert.rejects(decrypt({...encrypted,iterations:1},password));
const second = structuredClone(backup);
second.entries.find(x => x.key === 'residenthub_live_buildings').raw = '[{"id":"other-building"}]';
assert.deepEqual(compare(backup,second),[{key:'residenthub_live_buildings',difference:'different'}]);
assert.throws(() => inspect({...backup,entries:[...backup.entries,backup.entries[0]]}));
assert.throws(() => inspect({...backup,entries:[{key:'residenthub_session',raw:'secret'}]}));
assert.deepEqual([...original],before,'backup/inspect/compare must never write to source storage');
console.log('PASS: encrypted backup round trip, tamper/wrong-password rejection, secret exclusions, legacy sources, duplicates/orphans, source differences, and zero storage writes.');
