import { collect, encrypt, decrypt, inspect, compare } from './backup.mjs';
const $ = id => document.getElementById(id);
$('origin').textContent = `Origin hiện tại: ${location.origin}`;
async function run(button, action) {
  button.disabled = true;
  try {
    if (!crypto.subtle || location.protocol === 'file:') throw Error('Cần HTTPS hoặc localhost và mở qua web server, không mở file trực tiếp.');
    $('result').textContent = JSON.stringify(await action(), null, 2);
  } catch (error) { $('result').textContent = error.message; }
  finally { button.disabled = false; }
}
$('export').onclick = event => run(event.currentTarget, async () => {
  const backup = collect(localStorage, location.origin);
  const encrypted = await encrypt(backup, $('password').value);
  const url = URL.createObjectURL(new Blob([JSON.stringify(encrypted)], { type:'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `residenthub-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { message:'Đã yêu cầu trình duyệt tải bản sao lưu; kiểm tra tệp trong thư mục tải xuống.', ...inspect(backup) };
});
$('inspect').onclick = event => run(event.currentTarget, async () => {
  const file = $('first').files[0];
  if (!file) throw Error('Chọn tệp thứ nhất.');
  const first = await decrypt(JSON.parse(await file.text()), $('password').value);
  const result = { first:inspect(first) }, secondFile = $('second').files[0];
  if (secondFile) {
    const second = await decrypt(JSON.parse(await secondFile.text()), $('second-password').value || $('password').value);
    result.second = inspect(second); result.differences = compare(first, second);
  }
  return result;
});
