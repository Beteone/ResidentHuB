// Independent of auth.js/data.js: reading a backup must NEVER run legacy seeds.
const excluded = new Set(['residenthub_session', 'residenthub_currentUserId', 'residenthub_password_recovery', 'residenthub_login_guard']);
const appKey = key => /^(residenthub_|rh_db_)/.test(key) || key === 'residentHubResidents';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export function collect(storage, origin) {
  const entries = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && appKey(key) && !excluded.has(key)) {
      const raw = storage.getItem(key);
      if (raw !== null) entries.push({ key, raw });
    }
  }
  entries.sort((a,b) => a.key.localeCompare(b.key));
  return { format: 'residenthub-local-backup', version: 1, origin, exportedAt: new Date().toISOString(), entries };
}
function envelope(value) {
  if (!value || value.format !== 'residenthub-local-backup' || value.version !== 1 || typeof value.origin !== 'string' || !Array.isArray(value.entries)) throw Error('Sai định dạng bản sao lưu.');
  const keys = new Set();
  for (const row of value.entries) {
    if (!row || typeof row.key !== 'string' || typeof row.raw !== 'string' || !appKey(row.key) || excluded.has(row.key) || keys.has(row.key)) throw Error('Khóa bản sao lưu không hợp lệ hoặc trùng.');
    keys.add(row.key);
  }
  return value;
}
const encode64 = bytes => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
const decode64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
async function derive(password, salt, usage) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, key, { name: 'AES-GCM', length: 256 }, false, usage);
}
export async function encrypt(backup, password) {
  envelope(backup);
  if (typeof password !== 'string' || password.length < 12) throw Error('Mật khẩu bản sao lưu cần ít nhất 12 ký tự.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(backup)));
  return { format: 'residenthub-encrypted-backup', version: 1, algorithm: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: 600000, salt: encode64(salt), iv: encode64(iv), ciphertext: encode64(new Uint8Array(ciphertext)) };
}
export async function decrypt(value, password) {
  if (!value || value.format !== 'residenthub-encrypted-backup' || value.version !== 1 || value.algorithm !== 'AES-256-GCM' || value.kdf !== 'PBKDF2-SHA256' || value.iterations !== 600000) throw Error('Sai định dạng tệp mã hóa.');
  try {
    const salt = decode64(value.salt), iv = decode64(value.iv);
    if (salt.length !== 16 || iv.length !== 12) throw Error('Invalid parameters');
    const key = await derive(password, salt, ['decrypt']);
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, decode64(value.ciphertext));
    return envelope(JSON.parse(decoder.decode(clear)));
  } catch { throw Error('Không giải mã được: sai mật khẩu hoặc tệp đã bị thay đổi.'); }
}
export function inspect(backup) {
  envelope(backup);
  const issues = [], parsed = new Map();
  for (const { key, raw } of backup.entries) {
    try { parsed.set(key, JSON.parse(raw)); }
    catch { issues.push({ key, code: 'invalid-json-or-non-json', detail: 'Giữ nguyên dữ liệu gốc; cần phân loại trước khi nhập.' }); }
  }
  const users = parsed.get('residenthub_users');
  if (users !== undefined && !Array.isArray(users)) issues.push({ key: 'residenthub_users', code: 'invalid-array' });
  if (Array.isArray(users)) {
    const ids = new Set(), emails = new Set();
    for (const u of users) {
      if (!u || typeof u !== 'object' || !u.id || !u.email) { issues.push({ key: 'residenthub_users', code: 'invalid-user' }); continue; }
      const email = String(u.email).trim().toLowerCase();
      if (ids.has(u.id) || emails.has(email)) issues.push({ key: 'residenthub_users', code: 'duplicate-user-or-email', id: u.id });
      ids.add(u.id); emails.add(email);
      if (u.password || u.pass) issues.push({ key: 'residenthub_users', code: 'legacy-password-requires-auth-invitation', id: u.id });
    }
  }
  const entities = ['buildings','apartments','customers','contracts','invoices','meters','deposits','depositTransactions','cashflows','financialAccounts','supportRequests','assets','assetTypes','templates'];
  for (const mode of ['live','demo']) {
    const tables = new Map();
    for (const entity of entities) {
      const key = `residenthub_${mode}_${entity}`, rows = parsed.get(key);
      if (rows === undefined) continue;
      if (!Array.isArray(rows)) { issues.push({ key, code: 'invalid-array' }); continue; }
      const ids = new Set();
      for (const row of rows) {
        if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id) { issues.push({ key, code: 'missing-id' }); continue; }
        if (ids.has(row.id)) issues.push({ key, code: 'duplicate-id', id: row.id });
        ids.add(row.id);
      }
      tables.set(entity, { rows, ids });
    }
    const links = { buildingId:'buildings', apartmentId:'apartments', customerId:'customers', residentId:'customers', contractId:'contracts', invoiceId:'invoices', depositId:'deposits', financialAccountId:'financialAccounts', assetTypeId:'assetTypes', contractTemplateId:'templates', invoiceTemplateId:'templates' };
    for (const [entity, table] of tables) {
      const key = `residenthub_${mode}_${entity}`;
      for (const row of table.rows) {
        if (!row || typeof row !== 'object') continue;
        for (const [field, target] of Object.entries(links)) {
          if (row[field] && !tables.get(target)?.ids.has(row[field])) issues.push({ key, id: row.id, code:'missing-reference', field, target });
        }
        for (const field of ['tenantIds','customerIds']) {
          if (row[field] !== undefined && !Array.isArray(row[field])) issues.push({ key, id: row.id, code:'invalid-tenant-array', field });
          else for (const id of row[field] || []) if (!tables.get('customers')?.ids.has(id)) issues.push({ key, id: row.id, code:'missing-tenant', field });
        }
        if (row.apartmentId && row.buildingId) {
          const apartment = tables.get('apartments')?.rows.find(a => a?.id === row.apartmentId);
          if (apartment && apartment.buildingId !== row.buildingId) issues.push({ key, id: row.id, code:'building-apartment-mismatch' });
        }
      }
    }
  }
  return { origin: backup.origin, keyCount: backup.entries.length, issues, readyForAutomaticImport: false };
}
export function compare(left, right) {
  envelope(left); envelope(right);
  const a = new Map(left.entries.map(x => [x.key,x.raw])), b = new Map(right.entries.map(x => [x.key,x.raw]));
  return [...new Set([...a.keys(), ...b.keys()])].sort().filter(key => a.get(key) !== b.get(key)).map(key => ({ key, difference: !a.has(key) ? 'only-right' : !b.has(key) ? 'only-left' : 'different' }));
}
