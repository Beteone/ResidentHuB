// Browser driver for business-import-plan.mjs. Reads this origin's legacy
// localStorage (central-data.js is deliberately NOT loaded here) and talks to the
// server only through the authenticated RPCs rh_data_load / rh_data_apply.
import { ORDER, SOURCE_KEYS, planImport, executeImport } from './business-import-plan.mjs';

const $ = id => document.getElementById(id);
const central = window.RHCentral;
let plan = null;

function log(message) { $('log').textContent = message; }
function escapeHtml(value) { return String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function sourceSnapshot() {
  const source = {};
  for (const entity of ORDER) source[SOURCE_KEYS[entity]] = window.localStorage.getItem(SOURCE_KEYS[entity]);
  return source;
}
async function analyze() {
  $('import').disabled = true; $('confirm').checked = false; $('confirm').disabled = true;
  log('Đang tải dữ liệu máy chủ…');
  const server = await central.dataRpc('rh_data_load');
  const members = central.users().map(user => user.id);
  plan = planImport({ source: sourceSnapshot(), server: server.collections, members });
  $('summary').innerHTML = '<table><thead><tr><th>Nhóm dữ liệu</th><th>Trong trình duyệt</th><th>Đã có giống hệt</th><th>Sẽ thêm</th><th>Xung đột</th><th>Lỗi</th></tr></thead><tbody>' +
    plan.entities.map(item => `<tr><td>${item.entity}</td><td>${item.source}</td><td>${item.identical}</td><td>${item.insert.length}</td><td>${item.conflicts.length}</td><td>${item.errors.length}</td></tr>`).join('') +
    `</tbody><tfoot><tr><th>Tổng</th><th>${plan.totals.source}</th><th>${plan.totals.identical}</th><th>${plan.totals.insert}</th><th>${plan.totals.conflicts}</th><th>${plan.totals.errors}</th></tr></tfoot></table>`;
  if (!plan.ok) {
    log('KHÔNG THỂ NHẬP. Cần nhóm quyết định các mục sau (không có gì được ghi):\n\n' +
      plan.blocking.slice(0, 200).map(item => `- ${item.entity} / ${item.id || '(toàn bộ kho)'}: ${item.reason}`).join('\n') +
      (plan.blocking.length > 200 ? `\n… và ${plan.blocking.length - 200} mục khác.` : ''));
    return;
  }
  if (!plan.totals.insert) { log('Máy chủ đã có đầy đủ dữ liệu của trình duyệt này. Không cần nhập.'); return; }
  $('confirm').disabled = false;
  log(`Kế hoạch hợp lệ: sẽ thêm ${plan.totals.insert} bản ghi, bỏ qua ${plan.totals.identical} bản ghi giống hệt. Chưa có gì được ghi.`);
}
async function runImport() {
  if (!plan || !plan.ok || !$('confirm').checked) return;
  $('import').disabled = true; $('analyze').disabled = true;
  try {
    const count = await executeImport(plan, (entity, changes) => central.dataRpc('rh_data_apply', { p_entity: entity, p_changes: changes }),
      progress => log(`Đang nhập ${progress.entity}: ${progress.done}/${progress.total}…`));
    await analyze();
    log(`Đã nhập ${count} bản ghi. Phân tích lại: ${plan.totals.insert === 0 && plan.ok ? 'toàn bộ dữ liệu trình duyệt đã có trên máy chủ.' : 'vẫn còn mục cần kiểm tra, xem bảng.'}\nDữ liệu cũ trong trình duyệt được giữ nguyên.`);
  } catch (error) {
    log('Dừng nhập do máy chủ từ chối hoặc mất kết nối (mã: ' + escapeHtml(error.code || error.status || 'không rõ') + '). Các nhóm đã nhập trước đó vẫn được giữ; chạy “Phân tích” lại để xem phần còn thiếu. Không có bản ghi nào bị ghi đè.');
  } finally { $('analyze').disabled = false; }
}

$('confirm').addEventListener('change', () => { $('import').disabled = !($('confirm').checked && plan && plan.ok && plan.totals.insert); });
$('analyze').addEventListener('click', () => analyze().catch(error => log('Không phân tích được (mã: ' + escapeHtml(error.code || error.status || 'không rõ') + '). Kiểm tra quyền Admin và kết nối.')));
$('import').addEventListener('click', runImport);

(async () => {
  if (!central || !central.enabled || !central.businessData) { $('status').textContent = 'Website chưa bật chế độ dữ liệu tập trung (auth-config.js).'; return; }
  await central.ready;
  const session = central.getSession();
  if (!session) { $('status').textContent = 'Chưa đăng nhập trong tab này. Đăng nhập ResidentHub bằng Admin trong tab này rồi mở lại trang.'; return; }
  $('status').textContent = `Đang đăng nhập: ${session.name || session.email} (${session.email}). Origin nguồn: ${location.origin}`;
  $('analyze').disabled = false;
})();
