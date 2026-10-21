/* Financial account catalogue in RHD. No separate cashflow transaction store. */
(function (global) {
    'use strict';
    var types = { cash: 'Tiền mặt', bank: 'Ngân hàng', wallet: 'Ví điện tử' };
    var banks = ['Vietcombank', 'BIDV', 'VietinBank', 'Agribank', 'Techcombank', 'MB Bank', 'ACB', 'VPBank', 'Sacombank', 'TPBank', 'HDBank', 'VIB', 'SHB', 'OCB', 'MSB', 'SeABank', 'Nam A Bank', 'Bac A Bank', 'Eximbank', 'Ngân hàng khác'];
    var search = '', modal = null, returnFocus = null;
    function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function user() { return RHP.currentUser(); }
    function requirePermission(write) { if (!user() || !RHP.can(write ? 'settings.update' : 'settings.view')) throw Error('Bạn không có quyền quản lý tài khoản tài chính.'); }
    function all() {
        // RHD's generic list tolerates corrupt JSON; financial writes must fail closed.
        var raw = localStorage.getItem('residenthub_' + RHD.mode() + '_financialAccounts');
        var records = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(records) || records.some(function (r) { return !r || !r.id || !r.code || !r.ownerId || !types[r.type] || !Number.isSafeInteger(r.openingBalance); })) throw Error('Dữ liệu tài khoản tài chính không hợp lệ. Không có dữ liệu nào bị ghi đè.');
        return records;
    }
    function canAccess(account) { return !!account && (RHP.isAdmin() || account.ownerId === user().id); }
    function list() { requirePermission(false); return all().filter(canAccess); }
    function get(id) { var row = list().find(function (a) { return a.id === id; }); if (!row) throw Error('Không tìm thấy tài khoản trong phạm vi quản lý.'); return row; }
    function dateValid(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value; }
    function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    function money(value) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value); }
    function parseMoney(value) {
        if (typeof value === 'number') { if (Number.isSafeInteger(value)) return value; throw Error('Số dư phải là số nguyên VND trong giới hạn lưu trữ chính xác.'); }
        var text = String(value || '').trim();
        if (text && !/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(text)) throw Error('Số dư phải là số nguyên VND, ví dụ 1.000.000.');
        var amount = Number(text.replace(/\./g, '') || 0);
        if (!Number.isSafeInteger(amount)) throw Error('Số dư vượt giới hạn lưu trữ chính xác.');
        return amount;
    }
    function links(account) {
        requirePermission(false);
        if (!canAccess(account)) throw Error('Tài khoản nằm ngoài phạm vi quản lý.');
        function readEntity(entity) {
            var raw = localStorage.getItem('residenthub_' + RHD.mode() + '_' + entity);
            var rows = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(rows) || rows.some(function (r) { return !r || typeof r !== 'object'; })) throw Error('Không thể kiểm tra liên kết ' + entity + '; không thay đổi dữ liệu.');
            return rows;
        }
        var cashflows = readEntity('cashflows');
        // No automatic attribution of name-only legacy records.
        var exact = cashflows.filter(function (r) { return r.financialAccountId === account.id || r.accountId === account.id; });
        var legacy = cashflows.filter(function (r) { return !r.financialAccountId && !r.accountId && String(r.accountName || r.paymentMethod || '').trim().toLocaleLowerCase('vi') === account.name.toLocaleLowerCase('vi'); });
        var others = ['buildings', 'contracts', 'invoices', 'deposits', 'depositTransactions'].some(function (entity) { return readEntity(entity).some(function (r) { return r.financialAccountId === account.id || r.receivingAccountId === account.id || r.accountId === account.id || (r.config && r.config.financialAccountId === account.id) || (entity === 'buildings' && account.type === 'bank' && r.config && r.config.bankAccountNumber === account.accountNumber && r.config.bankName === account.bank); }); });
        return { transactions: exact, legacy: legacy, otherLinks: others };
    }
    function balance(account) {
        var related = links(account);
        if (related.transactions.some(function (tx) { return tx.buildingId && !RHP.inScope(tx.buildingId); })) return { value: null, reason: 'Có phiếu ngoài phạm vi quản lý; không thể tổng hợp đầy đủ tồn quỹ.' };
        if (related.legacy.length) return { value: null, reason: 'Có phiếu Thu chi chỉ lưu tên; cần xác nhận liên kết trước khi tính tồn quỹ.' };
        var total = account.openingBalance, seen = new Set();
        for (var i = 0; i < related.transactions.length; i++) {
            var tx = related.transactions[i];
            if (tx.isDeleted || tx.cancelledAt || ['cancelled', 'canceled', 'void', 'deleted', 'draft', 'rejected'].indexOf(tx.status) >= 0) continue;
            if (!dateValid(tx.date) || !tx.id || !Number.isSafeInteger(tx.amount) || tx.amount < 0 || ['income', 'expense'].indexOf(tx.type) < 0) return { value: null, reason: 'Có phiếu chưa đủ dữ liệu hợp lệ để tính tồn quỹ.' };
            if (seen.has(tx.id)) return { value: null, reason: 'Có mã phiếu trùng; cần kiểm tra trước khi tính tồn quỹ.' };
            seen.add(tx.id);
            if (tx.date <= account.openingDate) continue;
            total += tx.type === 'income' ? tx.amount : -tx.amount;
            if (!Number.isSafeInteger(total)) return { value: null, reason: 'Tồn quỹ vượt giới hạn lưu trữ chính xác.' };
        }
        return { value: total, reason: '' };
    }
    function save(value, id, acknowledge) {
        requirePermission(true);
        var records = all(), old = id ? get(id) : null;
        if (!types[value.type]) throw Error('Vui lòng chọn loại tài khoản hợp lệ.');
        var row = { name: String(value.name || '').trim(), type: value.type, bank: value.type === 'bank' ? String(value.bank || '').trim() : '', accountNumber: value.type === 'cash' ? '' : String(value.accountNumber || '').trim(), holder: value.type === 'cash' ? '' : String(value.holder || '').trim(), branch: value.type === 'bank' ? String(value.branch || '').trim() : '', openingBalance: parseMoney(value.openingBalance), openingDate: String(value.openingDate || ''), description: String(value.description || '').trim() };
        if (!row.name || row.name.length > 150) throw Error('Tên tài khoản cần có từ 1 đến 150 ký tự.');
        if (!dateValid(row.openingDate) || row.openingDate > today()) throw Error('Ngày chốt số dư đầu kỳ phải hợp lệ và không ở tương lai.');
        if (row.description.length > 1000 || row.branch.length > 150) throw Error('Mô tả tối đa 1000 ký tự, chi nhánh tối đa 150 ký tự.');
        if (row.type === 'bank' && banks.indexOf(row.bank) < 0) throw Error('Vui lòng chọn ngân hàng trong danh sách.');
        if (row.type === 'bank' && !/^\d{4,34}$/.test(row.accountNumber)) throw Error('Số tài khoản ngân hàng cần có 4–34 chữ số.');
        if (row.type === 'wallet' && !/^[\p{L}\p{N}@._+\-]{3,100}$/u.test(row.accountNumber)) throw Error('Số tài khoản ví cần có 3–100 ký tự chữ, số hoặc @ . _ + -.');
        if (row.type !== 'cash' && (!row.holder || row.holder.length > 150)) throw Error('Vui lòng nhập tên chủ tài khoản (tối đa 150 ký tự).');
        if (records.some(function (a) { return a.id !== id && a.ownerId === (old ? old.ownerId : user().id) && a.name.toLocaleLowerCase('vi') === row.name.toLocaleLowerCase('vi'); })) throw Error('Bạn đã có tài khoản cùng tên. Vui lòng chọn tên khác.');
        if (old) {
            var related = links(old), linked = related.transactions.length || related.legacy.length || related.otherLinks;
            if (linked && old.type !== row.type) throw Error('Không thể đổi loại tài khoản đã có giao dịch hoặc liên kết nghiệp vụ.');
            if (related.legacy.length && old.name !== row.name) throw Error('Chưa thể đổi tên: phiếu Thu chi cũ đang tham chiếu bằng tên. Cần xác nhận phương án liên kết trước.');
            if ((old.openingBalance !== row.openingBalance || old.openingDate !== row.openingDate) && !acknowledge) throw Error('Thay đổi số dư/ngày chốt đầu kỳ sẽ ảnh hưởng tồn quỹ. Vui lòng xác nhận cảnh báo.');
            if (JSON.stringify(row) === JSON.stringify(Object.fromEntries(Object.keys(row).map(function (k) { return [k, old[k]]; })))) return old;
        } else {
            var token;
            do { token = (global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID().replace(/-/g, '').slice(0, 14) : Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase(); } while (records.some(function (r) { return r.code === 'TK-' + token; }));
            row.code = 'TK-' + token; row.ownerId = user().id;
        }
        row.updatedAt = Date.now();
        var result = old ? RHD.update('financialAccounts', old.id, row) : RHD.create('financialAccounts', row);
        if (!result.ok) throw Error(result.error || 'Không thể lưu tài khoản.');
        if (global.RHGeneralSettings && global.RHGeneralSettings.financialAlert) global.RHGeneralSettings.financialAlert(old ? 'update' : 'create', result.item);
        return result.item;
    }
    function remove(id) {
        requirePermission(true);
        var account = get(id), related = links(account);
        if (related.transactions.length || related.legacy.length || related.otherLinks) throw Error('Chưa thể xóa: tài khoản có giao dịch hoặc liên kết. Chuyển liên kết Thu chi cần được xác nhận trước; dữ liệu được giữ nguyên.');
        var result = RHD.remove('financialAccounts', id);
        if (!result.ok) throw Error(result.error);
        if (global.RHGeneralSettings && global.RHGeneralSettings.financialAlert) global.RHGeneralSettings.financialAlert('delete', account);
    }
    function lock() { requirePermission(true); throw Error('Chưa bật khóa sổ: cần xác nhận bổ sung kiểm tra ngày khóa tại luồng ghi Thu chi. Không có ngày khóa nào được lưu.'); }
    function icon(name) { return '<i class="fas fa-' + name + '" aria-hidden="true"></i>'; }
    function input(name, label, value, extra) { return '<label>' + label + '<input data-finance-field="' + name + '" value="' + esc(value) + '" ' + (extra || '') + '></label>'; }
    function render() {
        var records = list(), editable = RHP.can('settings.update');
        return '<div class="rhgs-finance-head"><div><h4>Tài khoản tài chính</h4><p>Quản lý sổ quỹ tiền mặt, ngân hàng và ví điện tử.</p></div>' + (editable ? '<button type="button" class="rhgs-primary" data-finance="add" title="Thêm tài khoản tài chính" aria-label="Thêm tài khoản tài chính">' + icon('plus') + '</button>' : '') + '</div><label class="rhgs-account-search">Tìm tài khoản<input data-finance-search type="search" placeholder="Tìm theo mã hoặc tên tài khoản…" value="' + esc(search) + '"></label><div class="rhgs-table"><table><thead><tr><th>Mã tài khoản</th><th>Thao tác</th><th>Tên tài khoản</th><th>Loại tài khoản</th><th>Số dư đầu kỳ</th><th>Tồn quỹ</th><th>Ghi chú</th></tr></thead><tbody id="rhgs-account-rows">' + renderRows(records, editable) + '</tbody></table></div><p>Số dư đầu kỳ là số dư cuối ngày chốt. Tồn quỹ chỉ cộng/trừ phiếu Thu chi liên kết có ngày sau ngày chốt. Phiếu chỉ lưu tên chưa được tự gán vào tài khoản.</p><p>Khóa kỳ và chuyển liên kết khi xóa đang chờ xác nhận phương án tích hợp Thu chi; chưa áp dụng hạn chế giao dịch.</p><div id="rhgs-finance-modal"></div>';
    }
    function renderRows(records, editable) {
        var filtered = records.filter(function (a) { return (a.code + ' ' + a.name).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi').trim()); });
        return filtered.map(function (a) { var b = balance(a); return '<tr><td><span class="rhgs-code">' + esc(a.code) + '</span></td><td><div class="rhgs-row-actions">' + (editable ? [['edit', 'pen', 'Sửa'], ['lock', 'lock', 'Khóa sổ'], ['delete', 'trash', 'Xóa']].map(function (op) { return '<button type="button" data-finance="' + op[0] + '" data-account="' + esc(a.id) + '" title="' + op[2] + '" aria-label="' + op[2] + ' ' + esc(a.name) + '">' + icon(op[1]) + '</button>'; }).join('') : 'Chỉ xem') + '</div></td><td><strong>' + esc(a.name) + '</strong>' + (a.lockedThrough ? '<small>Đã khóa đến ' + esc(a.lockedThrough) + '</small>' : '') + '</td><td>' + types[a.type] + '</td><td class="rhgs-money">' + money(a.openingBalance) + ' đ</td><td class="rhgs-money" title="' + esc(b.reason) + '">' + (b.value == null ? '<span class="rhgs-badge">Chưa xác định</span>' : money(b.value) + ' đ') + '</td><td class="rhgs-note">' + esc(a.description || '—') + '</td></tr>'; }).join('') || '<tr><td colspan="7"><div class="rhgs-empty">' + icon('wallet') + '<h4>' + (records.length ? 'Không tìm thấy tài khoản' : 'Chưa có tài khoản tài chính') + '</h4><p>' + (records.length ? 'Thử tìm bằng mã hoặc tên khác.' : 'Thêm sổ quỹ để quản lý thông tin và số dư đầu kỳ.') + '</p>' + (!records.length && editable ? '<button type="button" data-finance="add" class="rhgs-primary">' + icon('plus') + ' Thêm tài khoản</button>' : '') + '</div></td></tr>';
    }
    function capture() {
        if (!modal || modal.kind !== 'edit') return;
        document.querySelectorAll('#rhgs-finance-modal [data-finance-field]').forEach(function (el) {
            var key = el.dataset.financeField;
            if (['bank', 'accountNumber', 'holder', 'branch'].includes(key)) modal.variants[modal.type][key] = el.value;
            else modal.common[key] = el.type === 'checkbox' ? el.checked : el.value;
        });
    }
    function showModal() {
        var host = document.getElementById('rhgs-finance-modal');
        if (!host || !modal) return;
        var title = modal.kind === 'edit' ? modal.id ? 'Sửa tài khoản tài chính' : 'Thêm tài khoản tài chính' : modal.kind === 'lock' ? 'Khóa tài khoản' : 'Xóa tài khoản';
        var body;
        if (modal.kind === 'edit') {
            var c = modal.common, v = modal.variants[modal.type];
            body = '<label>Loại tài khoản<select data-finance-type>' + Object.keys(types).map(function (t) { return '<option value="' + t + '" ' + (t === modal.type ? 'selected' : '') + '>' + types[t] + '</option>'; }).join('') + '</select></label><div class="rhgs-form-grid">' + input('name', 'Tên tài khoản *', c.name, 'required maxlength="150" placeholder="Ví dụ: Quỹ vận hành"') + (modal.type === 'bank' ? input('bank', 'Ngân hàng *', v.bank, 'required list="rhgs-bank-list" placeholder="Tìm và chọn ngân hàng"') + '<datalist id="rhgs-bank-list">' + banks.map(function (b) { return '<option value="' + esc(b) + '"></option>'; }).join('') + '</datalist>' : '') + (modal.type !== 'cash' ? input('accountNumber', 'Số tài khoản *', v.accountNumber, 'required maxlength="100" autocomplete="off" placeholder="Giữ nguyên số 0 đầu"') + input('holder', 'Tên chủ tài khoản *', v.holder, 'required maxlength="150" placeholder="Tên chủ tài khoản"') : '') + (modal.type === 'bank' ? input('branch', 'Chi nhánh', v.branch, 'maxlength="150" placeholder="Không bắt buộc"') : '') + input('openingBalance', 'Số dư đầu kỳ (VND)', c.openingBalance, 'inputmode="numeric" placeholder="0" data-finance-money') + input('openingDate', 'Ngày chốt số dư đầu kỳ *', c.openingDate, 'type="date" required max="' + today() + '"') + '<label class="rhgs-wide">Mô tả<textarea data-finance-field="description" maxlength="1000" placeholder="Ghi chú cho tài khoản">' + esc(c.description) + '</textarea></label></div>' + (modal.id ? '<label class="rhgs-check"><input type="checkbox" data-finance-field="acknowledge" ' + (c.acknowledge ? 'checked' : '') + '> Tôi hiểu thay đổi số dư/ngày chốt đầu kỳ sẽ ảnh hưởng tồn quỹ.</label><p class="rhgs-warning">Thay đổi thông tin tài khoản không tự sửa tài khoản nhận tiền của tòa nhà, hợp đồng hoặc hóa đơn.</p>' : '');
        } else if (modal.kind === 'lock') {
            body = '<p>Tài khoản: <strong>' + esc(modal.account.name) + '</strong></p><label>Ngày khóa *<input type="date" data-finance-lock-date value="' + esc(modal.account.lockedThrough || today()) + '"></label><p class="rhgs-warning">Không thể tạo hoặc chỉnh sửa giao dịch có ngày thu chi trước hoặc bằng ngày khóa.</p><p>Chưa thể lưu ngày khóa vì luồng Thu chi hiện tại chưa kiểm tra ngày này. Cần xác nhận phương án tích hợp trước khi áp dụng.</p>';
        } else {
            var related = links(modal.account), linked = related.transactions.length || related.legacy.length || related.otherLinks;
            body = '<p>Tài khoản: <strong>' + esc(modal.account.name) + '</strong></p>' + (linked ? '<label>Tài khoản tiếp nhận<select data-finance-replacement><option value="">Chọn tài khoản thay thế</option>' + list().filter(function (a) { return a.id !== modal.account.id; }).map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.code + ' — ' + a.name) + '</option>'; }).join('') + '</select></label><p class="rhgs-warning">Chưa thể chuyển liên kết an toàn trong phiên bản hiện tại. Thao tác xóa bị chặn; mọi phiếu và lịch sử được giữ nguyên.</p>' : '<p>Bạn có chắc muốn xóa tài khoản chưa có giao dịch hoặc liên kết này? Nhật ký thao tác được giữ lại.</p>');
        }
        host.innerHTML = '<div class="rhgs-modal-shade"><section class="rhgs-modal" role="dialog" aria-modal="true" aria-labelledby="rhgs-finance-title" tabindex="-1"><header><h4 id="rhgs-finance-title">' + title + '</h4><button type="button" data-finance="cancel" aria-label="Đóng">' + icon('xmark') + '</button></header><div class="rhgs-modal-body">' + body + '<p role="alert" id="rhgs-finance-error"></p></div><footer><button type="button" data-finance="cancel">Hủy</button><button type="button" class="rhgs-primary" data-finance="confirm">' + (modal.kind === 'delete' ? 'Xác nhận xóa' : 'Lưu') + '</button></footer></section></div>';
        host.querySelector('[role=dialog]').focus();
    }
    function close() { modal = null; var host = document.getElementById('rhgs-finance-modal'); if (host) host.innerHTML = ''; if (returnFocus && returnFocus.isConnected) returnFocus.focus(); }
    function handle(button) {
        var op = button.dataset.finance;
        if (!op) return false;
        try {
            if (op === 'cancel') { close(); return true; }
            requirePermission(true);
            if (op === 'confirm') {
                if (modal.kind === 'lock') lock();
                else if (modal.kind === 'delete') remove(modal.account.id);
                else { capture(); save(Object.assign({}, modal.common, modal.variants[modal.type], { type: modal.type }), modal.id, !!modal.common.acknowledge); }
                close(); global.RHGeneralSettings.mount(); return true;
            }
            returnFocus = button;
            var account = button.dataset.account ? get(button.dataset.account) : null;
            if (op === 'add' || op === 'edit') modal = { kind: 'edit', id: account && account.id, type: account ? account.type : 'cash', common: { name: account ? account.name : '', openingBalance: money(account ? account.openingBalance : 0), openingDate: account ? account.openingDate : today(), description: account ? account.description : '', acknowledge: false }, variants: { cash: {}, bank: account && account.type === 'bank' ? { bank: account.bank, accountNumber: account.accountNumber, holder: account.holder, branch: account.branch } : {}, wallet: account && account.type === 'wallet' ? { accountNumber: account.accountNumber, holder: account.holder } : {} } };
            else modal = { kind: op, account: account };
            showModal();
        } catch (e) { var target = document.getElementById('rhgs-finance-error') || document.getElementById('rhgs-error'); if (target) target.textContent = e.message; else throw e; }
        return true;
    }
    function change(event) {
        if (event.target.matches('[data-finance-type]')) { capture(); modal.type = event.target.value; showModal(); }
        if (event.target.matches('[data-finance-search]')) { search = event.target.value; document.getElementById('rhgs-account-rows').innerHTML = renderRows(list(), RHP.can('settings.update')); }
        if (event.target.matches('[data-finance-money]')) {
            var input = event.target, text = input.value, digitCount = text.slice(0, input.selectionStart).replace(/\D/g, '').length;
            if (/^-?[\d.]*$/.test(text)) {
                var digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, ''), formatted = (text[0] === '-' ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                input.value = formatted;
                var pos = 0, seen = 0; while (pos < formatted.length && seen < digitCount) { if (/\d/.test(formatted[pos])) seen++; pos++; } input.setSelectionRange(pos, pos);
            }
        }
    }
    global.RHFinancialAccounts = { list: list, get: get, save: save, remove: remove, lock: lock, balance: balance, links: links, render: render, handle: handle, change: change, close: close, parseMoney: parseMoney, isModalOpen: function () { return !!modal; } };
})(window);
