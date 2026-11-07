// Offline planner for importing ONE browser's legacy business data into the
// central database. Pure function: no storage, network or DOM access.
//
// Rules (all violations block the import; nothing partial is planned):
//   - a record whose id already exists on the server with the SAME content is skipped;
//   - with DIFFERENT content it is a conflict: the operator decides, never overwritten;
//   - every parent link must resolve to a record in this source or on the server,
//     with the same constraints the database enforces (FK, apartment/building pairs);
//   - credential-like keys are never uploaded;
//   - buildings.managerId must be an existing membership (legacy user IDs are kept).
// The executor sends inserts only (version 0), so the server also refuses to
// overwrite a row that appeared after this plan was made.

export const ORDER = ['assetTypes', 'financialAccounts', 'templates', 'buildings', 'customers', 'apartments', 'contracts',
  'deposits', 'depositTransactions', 'meters', 'invoices', 'cashflows', 'supportRequests', 'assets', 'billingRuns', 'notificationCampaigns'];
export const SOURCE_KEYS = Object.fromEntries(ORDER.map(entity => [entity, entity === 'notificationCampaigns' ? 'residenthub_notification_campaigns_v1' : 'residenthub_live_' + entity]));

const CREDENTIAL_KEYS = ['password', 'pass', 'password_hash', 'passwordhash', 'access_token', 'refresh_token', 'service_role', 'service_role_key'];
const REQUIRED = {
  apartments: ['buildingId'], meters: ['buildingId', 'apartmentId'], contracts: ['buildingId', 'apartmentId'],
  invoices: ['buildingId'], deposits: ['buildingId'], depositTransactions: ['depositId']
};
// field -> parent collection (mirrors the foreign keys in the migrations)
const LINKS = {
  apartments: { buildingId: 'buildings' },
  customers: { buildingId: 'buildings' },
  contracts: { buildingId: 'buildings', apartmentId: 'apartments', customerId: 'customers' },
  meters: { buildingId: 'buildings', apartmentId: 'apartments' },
  invoices: { buildingId: 'buildings', apartmentId: 'apartments', customerId: 'customers', contractId: 'contracts', financialAccountId: 'financialAccounts' },
  deposits: { buildingId: 'buildings', apartmentId: 'apartments', customerId: 'customers' },
  depositTransactions: { buildingId: 'buildings', depositId: 'deposits', financialAccountId: 'financialAccounts' },
  cashflows: { buildingId: 'buildings', invoiceId: 'invoices', financialAccountId: 'financialAccounts' },
  supportRequests: { buildingId: 'buildings', apartmentId: 'apartments', customerId: 'customers' },
  assets: { buildingId: 'buildings', apartmentId: 'apartments', assetTypeId: 'assetTypes' },
  templates: { buildingId: 'buildings' }
};
const APARTMENT_PAIR = ['meters', 'contracts', 'invoices', 'deposits', 'supportRequests', 'assets'];

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function hasCredentials(value) {
  if (Array.isArray(value)) return value.some(hasCredentials);
  if (value && typeof value === 'object') return Object.keys(value).some(key => CREDENTIAL_KEYS.includes(key.toLowerCase()) || hasCredentials(value[key]));
  return false;
}
const text = value => value === undefined || value === null || value === '' ? '' : String(value);
function tenantIds(contract) {
  return [...new Set([].concat(Array.isArray(contract.tenantIds) ? contract.tenantIds : [], Array.isArray(contract.customerIds) ? contract.customerIds : [], contract.customerId ? [contract.customerId] : []).map(text).filter(Boolean))];
}

/**
 * @param {{source: Record<string,string|null>, server: Record<string,{p:object,v:number}[]>, members: string[]}} input
 *   source: raw localStorage values by key; server: rh_data_load().collections; members: membership IDs.
 */
export function planImport({ source, server, members }) {
  const blocking = [];
  const entities = [];
  const index = {}; // entity -> Map(id -> payload) of source ∪ server, for link checks
  const parsed = {};
  for (const entity of ORDER) {
    const raw = source[SOURCE_KEYS[entity]];
    let rows = [];
    if (raw !== null && raw !== undefined) {
      try { rows = JSON.parse(raw); } catch (_) { blocking.push({ entity, id: '', reason: 'Dữ liệu JSON hỏng trong trình duyệt nguồn.' }); rows = []; }
      if (!Array.isArray(rows)) { blocking.push({ entity, id: '', reason: 'Kho dữ liệu không phải danh sách.' }); rows = []; }
    }
    parsed[entity] = rows;
    index[entity] = new Map((server[entity] || []).map(item => [text(item.p.id), item.p]));
    for (const row of rows) if (row && typeof row === 'object' && text(row.id) && !index[entity].has(text(row.id))) index[entity].set(text(row.id), row);
  }
  const memberSet = new Set(members.map(String));
  for (const entity of ORDER) {
    const result = { entity, source: parsed[entity].length, identical: 0, insert: [], conflicts: [], errors: [] };
    const serverRows = new Map((server[entity] || []).map(item => [text(item.p.id), item.p]));
    const seen = new Set();
    for (const row of parsed[entity]) {
      const id = row && typeof row === 'object' && !Array.isArray(row) ? text(row.id) : '';
      const fail = reason => result.errors.push({ id, reason });
      if (!id) { fail('Bản ghi thiếu mã (id).'); continue; }
      if (seen.has(id)) { fail('Mã bị trùng trong cùng trình duyệt nguồn.'); continue; }
      seen.add(id);
      if (id.length > 200) { fail('Mã dài hơn 200 ký tự.'); continue; }
      const normalized = JSON.parse(JSON.stringify(row));
      if (serverRows.has(id)) {
        if (canonical(serverRows.get(id)) === canonical(normalized)) result.identical++;
        else result.conflicts.push({ id, reason: 'Máy chủ đã có bản ghi cùng mã nhưng nội dung khác.' });
        continue;
      }
      if (hasCredentials(normalized)) { fail('Chứa trường mật khẩu/token — không được tải lên.'); continue; }
      const missing = (REQUIRED[entity] || []).filter(field => !text(normalized[field]));
      if (missing.length) { fail('Thiếu trường bắt buộc: ' + missing.join(', ') + '.'); continue; }
      const links = LINKS[entity] || {};
      const broken = Object.keys(links).filter(field => text(normalized[field]) && !index[links[field]].has(text(normalized[field])));
      if (entity === 'contracts') tenantIds(normalized).forEach(tenant => { if (!index.customers.has(tenant)) broken.push('tenantIds:' + tenant); });
      if (entity === 'buildings' && text(normalized.managerId) && !memberSet.has(text(normalized.managerId))) broken.push('managerId (chưa có tài khoản trung tâm tương ứng)');
      if (broken.length) { fail('Liên kết không tồn tại: ' + broken.join(', ') + '.'); continue; }
      if (APARTMENT_PAIR.includes(entity) && text(normalized.apartmentId)) {
        const apartment = index.apartments.get(text(normalized.apartmentId));
        if (text(apartment.buildingId) !== text(normalized.buildingId)) { fail('Căn hộ không thuộc tòa nhà ghi trên bản ghi.'); continue; }
      }
      if (entity === 'invoices' && text(normalized.contractId)) {
        const contract = index.contracts.get(text(normalized.contractId));
        if (text(normalized.apartmentId) && (text(contract.apartmentId) !== text(normalized.apartmentId) || text(contract.buildingId) !== text(normalized.buildingId))) {
          fail('Hóa đơn và hợp đồng khác căn hộ/tòa nhà.'); continue;
        }
      }
      result.insert.push(normalized);
    }
    result.conflicts.forEach(item => blocking.push({ entity, ...item }));
    result.errors.forEach(item => blocking.push({ entity, ...item }));
    entities.push(result);
  }
  const totals = entities.reduce((sum, item) => ({
    source: sum.source + item.source, identical: sum.identical + item.identical, insert: sum.insert + item.insert.length,
    conflicts: sum.conflicts + item.conflicts.length, errors: sum.errors + item.errors.length
  }), { source: 0, identical: 0, insert: 0, conflicts: 0, errors: 0 });
  return { ok: blocking.length === 0, totals, entities, blocking };
}

// Insert-only batches in dependency order. `send(entity, changes)` performs the RPC.
export async function executeImport(plan, send, onProgress = () => {}) {
  if (!plan.ok) throw new Error('Kế hoạch còn lỗi/xung đột; không nhập dữ liệu.');
  let done = 0;
  for (const item of plan.entities) {
    for (let i = 0; i < item.insert.length; i += 100) {
      const batch = item.insert.slice(i, i + 100).map(payload => ({ op: 'upsert', id: String(payload.id), version: 0, payload }));
      await send(item.entity, batch);
      done += batch.length;
      onProgress({ entity: item.entity, done, total: plan.totals.insert });
    }
  }
  return done;
}
