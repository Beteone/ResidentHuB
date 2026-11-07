import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync('auth.js', 'utf8');
function run(raw, expected, types = '[]') {
  const store = new Map();
  if (raw !== null) store.set('residenthub_users', raw);
  store.set('residenthub_account_types', types);
  const storage = {
    getItem: key => store.get(key) ?? null,
    setItem() { throw new Error('Unexpected diagnostic write'); },
    removeItem() { throw new Error('Unexpected diagnostic removal'); }
  };
  const c = vm.createContext({ localStorage: storage, sessionStorage: storage,
    location: { protocol: 'http:', hostname: '162.4.176.164' } });
  c.window = c;
  vm.runInContext(source, c);
  const before = JSON.stringify([...store]);
  const result = c.RH.inspectAuthEnvironment();
  assert.equal(result.demoAdmin.reason, expected);
  assert.equal(result.sharedIdentity, false);
  assert.equal(result.serverAuthorization, false);
  assert.equal(result.localDemoBootstrap, false);
  assert.equal(JSON.stringify([...store]), before);
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret|private-token/);
  return result;
}
const account = { id: 'u-manager-1', email: 'manager@residenthub.vn',
  password: 'fixture-secret', access_token: 'private-token', status: 'active', accountTypeId: 'at-admin' };
run(null, 'account-store-missing');
run('{', 'account-store-unreadable');
run('{}', 'account-store-invalid');
run('[]', 'account-missing');
run(JSON.stringify([{ ...account, id: 'another-id' }]), 'identity-conflict');
run(JSON.stringify([account, account]), 'identity-conflict');
run(JSON.stringify([{ ...account, status: 'locked' }]), 'account-not-active');
run(JSON.stringify([account]), 'account-type-unresolved');
const result = run(JSON.stringify([account]), 'local-account-present', JSON.stringify([
  { id: 'at-admin', portal: 'manager', fullAccess: false }
]));
assert.equal(result.demoAdmin.linkedTypeResolved, true);
assert.equal(result.demoAdmin.identityMatches, true);
console.log('PASS VPS auth diagnostic: missing/corrupt/conflicting/locked/local accounts; no writes or credentials');
