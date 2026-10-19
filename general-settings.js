/* Settings-only UI. Uses RHD settings/entities, RHP permissions and RH inboxes. */
(function (global) {
    'use strict';
    var tab = 'notifications', error = '', notice = '';
    var labels = { settings: 'Cài đặt', buildings: 'Tòa nhà', apartments: 'Căn hộ', customers: 'Cư dân', contracts: 'Hợp đồng', invoices: 'Hóa đơn', supportRequests: 'Hỗ trợ', meters: 'Ghi chỉ số', deposits: 'Đặt cọc', depositTransactions: 'Giao dịch cọc' };
    var actions = { create: 'Tạo', update: 'Cập nhật', delete: 'Xóa' };
    var rules = [
        { id: 'invoice', flag: 'notifyInvoice', title: 'Hóa đơn đã phát hành', template: 'Xin chào {Ten_Cu_Dan}, hóa đơn {Ma_Doi_Tuong} của tòa {Toa_Nha} có số tiền còn lại {So_Tien}, hạn thanh toán {Ngay_Han}.' },
        { id: 'reminder', flag: 'notifyInvoice', title: 'Nhắc hạn hóa đơn', days: 'invoiceReminderDays', template: 'Xin chào {Ten_Cu_Dan}, hóa đơn {Ma_Doi_Tuong} còn {So_Ngay} ngày đến hạn {Ngay_Han}. Số tiền còn lại: {So_Tien}.' },
        { id: 'contract', flag: 'notifyContract', title: 'Hợp đồng sắp hết hạn', days: 'contractReminderDays', template: 'Xin chào {Ten_Cu_Dan}, hợp đồng {Ma_Doi_Tuong} tại {Toa_Nha} còn {So_Ngay} ngày đến ngày kết thúc {Ngay_Han}.' }
    ];
    var variables = ['Ten_Cu_Dan', 'Ma_Doi_Tuong', 'Toa_Nha', 'So_Tien', 'Ngay_Han', 'So_Ngay'];
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function actor() { return global.RHP && RHP.currentUser(); }
    function requirePermission(key) { if (!global.RHP || !RHP.can(key)) throw Error('Bạn không có quyền thực hiện thao tác này.'); }
    function logKey() { return 'residenthub_' + RHD.mode() + '_activity_v1'; }
    function readLogs() {
        var rows = JSON.parse(localStorage.getItem(logKey()) || '[]');
        if (!Array.isArray(rows) || rows.some(function (r) { return !r || typeof r.id !== 'string' || typeof r.actorId !== 'string' || !Number.isFinite(Date.parse(r.at)); })) throw Error('Dữ liệu nhật ký không hợp lệ; không ghi đè dữ liệu cũ.');
        return rows;
    }
    // Allowlist only: never persist passwords, tokens, attachments or customer contacts.
    function snapshot(entity, row) {
        if (!row) return null;
        var keys = entity === 'settings' ? ['notifyInvoice', 'notifyContract', 'notifySupportStatus', 'invoiceReminderDays', 'contractReminderDays', 'notificationTemplates'] : ['id', 'code', 'name', 'buildingId', 'status', 'total', 'paidAmount', 'paidAt'];
        var out = {};
        keys.forEach(function (key) { if (row[key] !== undefined) out[key] = row[key]; });
        return out;
    }
    function record(entity, action, before, after) {
        if (!labels[entity] || !global.RHD || !actor()) return;
        try {
            var old = snapshot(entity, before), next = snapshot(entity, after);
            // Settings bridge records only the requested configuration fields.
            if (entity === 'settings' && JSON.stringify(old) === JSON.stringify(next)) return;
            var user = actor(), role = RHP.typeOfUser(user), row = after || before || {};
            var rows = readLogs();
            rows.push({ id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2), at: new Date().toISOString(), actorId: user.id, actorName: user.name, role: role && role.name || user.role, module: entity, action: action, objectId: row.id || 'general-settings', buildingId: row.buildingId || (entity === 'buildings' ? row.id : ''), result: 'Thành công', before: old, after: next });
            localStorage.setItem(logKey(), JSON.stringify(rows));
        } catch (e) { error = 'Thao tác đã lưu nhưng không ghi được nhật ký: ' + e.message; if (global.console) console.error(error); }
    }
    function scoped(entity) { return RHP.scopeList(entity, RHD.list(entity)); }
    function logs() {
        requirePermission('settings.view');
        var user = actor();
        return readLogs().filter(function (r) { return RHP.isAdmin() || (r.buildingId ? RHP.inScope(r.buildingId) : r.actorId === user.id); });
    }
    function days(value) {
        if (!String(value).trim()) return [];
        var parts = String(value).split(',').map(function (s) { return s.trim(); });
        if (parts.some(function (s) { return !/^\d+$/.test(s) || Number(s) > 365; })) throw Error('Ngày nhắc phải là số nguyên từ 0 đến 365, phân cách bằng dấu phẩy.');
        return Array.from(new Set(parts.map(Number))).sort(function (a, b) { return b - a; });
    }
    function saveNotifications(values) {
        requirePermission('settings.update');
        var templates = {};
        rules.forEach(function (r) {
            var text = String(values.templates[r.id] || '').trim();
            if (!text || text.length > 2000) throw Error('Mẫu nội dung cần có từ 1 đến 2000 ký tự.');
            var tags = text.match(/\{[^{}]*\}/g) || [];
            if (tags.some(function (tag) { return variables.indexOf(tag.slice(1, -1)) < 0; }) || /[{}]/.test(text.replace(/\{[^{}]*\}/g, ''))) throw Error('Mẫu chứa trường dữ liệu không được hỗ trợ.');
            templates[r.id] = text;
        });
        var patch = { notificationTemplates: templates };
        ['notifyInvoice', 'notifyContract', 'notifySupportStatus'].forEach(function (k) { patch[k] = !!values[k]; });
        ['invoiceReminderDays', 'contractReminderDays'].forEach(function (k) { patch[k] = days(values[k]).join(','); });
        var current = RHD.getSettings();
        if (!current.notificationTemplates || typeof current.notificationTemplates !== 'object' || Array.isArray(current.notificationTemplates)) throw Error('Dữ liệu mẫu hiện tại không hợp lệ; không ghi đè dữ liệu cũ.');
        RHD.saveSettings(patch);
        // Keep legacy controls in the same form from later restoring stale values.
        if (global.document) Object.keys(patch).forEach(function (key) {
            document.querySelectorAll('#settingsForm [data-setting="' + key + '"]').forEach(function (el) { if (el.type === 'checkbox') el.checked = patch[key]; else el.value = patch[key]; });
        });
        return patch;
    }
    function dateKey(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
    function remaining(date, today) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return null;
        var stamp = Date.parse(date + 'T00:00:00Z');
        if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date) return null;
        return Math.round((stamp - Date.parse(today + 'T00:00:00Z')) / 86400000);
    }
    function synchronize(now) {
        requirePermission('settings.update'); requirePermission('notifications.create');
        if (RHD.mode() !== 'live') throw Error('Không gửi thông báo từ dữ liệu Demo.');
        var config = RHD.getSettings(), today = dateKey(now || new Date()), count = 0;
        rules.forEach(function (rule) {
            if (!config[rule.flag]) return;
            var entity = rule.id === 'contract' ? 'contracts' : 'invoices';
            if (!RHP.can(entity + '.view')) return;
            scoped(entity).forEach(function (row) {
                if (entity === 'invoices' && (!row.issuedAt || !Number.isFinite(Number(row.total)) || Number(row.total) <= 0 || ['unpaid', 'sent', 'overdue', 'payment_pending'].indexOf(row.status) < 0)) return;
                if (entity === 'invoices') {
                    var paid = Number(row.paidAmount || row.amountPaid || 0);
                    if (!Number.isFinite(paid) || paid < 0 || paid >= Number(row.total)) return;
                }
                if (entity === 'contracts' && row.status !== 'active') return;
                var deadline = entity === 'contracts' ? row.endDate : row.dueDate;
                var diff = remaining(deadline, today);
                if (rule.days && (diff === null || days(config[rule.days]).indexOf(diff) < 0)) return;
                var building = RHD.get('buildings', row.buildingId);
                if (!building) return;
                var campaign = 'settings:' + rule.id + ':' + row.id + ':' + (rule.days ? deadline + ':' + diff : row.issuedAt);
                RH.resolveNotificationRecipients(row).filter(function (user) { return user.status === 'active'; }).forEach(function (user) {
                    if (RH.getNotificationsForUser(user.id).some(function (n) {
                        if (n.campaignId === campaign) return true;
                        // Existing delivery paths predate campaign IDs. Suppress a
                        // matching legacy notice conservatively rather than resend it.
                        var matchesObject = n.refId === row.id || (row.code && String(n.body || '').includes(row.code));
                        if (!matchesObject) return false;
                        if (rule.id === 'invoice') return n.type === 'BILLING';
                        var time = new Date(n.createdAt);
                        return Number.isFinite(time.getTime()) && dateKey(time) === today && (rule.id === 'reminder' ? /nhắc|đến hạn/i.test(n.title || '') : /sắp hết hạn/i.test(n.title || ''));
                    })) return;
                    var values = { Ten_Cu_Dan: user.name, Ma_Doi_Tuong: row.code || row.id, Toa_Nha: building.name, So_Tien: new Intl.NumberFormat('vi-VN').format(Math.max(0, Number(row.total || 0) - Number(row.paidAmount || row.amountPaid || 0))) + ' đ', Ngay_Han: deadline || 'Chưa có', So_Ngay: diff == null ? '' : String(diff) };
                    var body = (config.notificationTemplates[rule.id] || rule.template).replace(/\{([^{}]+)\}/g, function (_, key) { return values[key] || ''; });
                    var result = RH.createNotificationForUser(user.id, { campaignId: campaign, type: entity === 'contracts' ? 'CONTRACT' : 'BILLING', title: rule.title, body: body, refType: entity === 'contracts' ? 'contract' : 'invoice', refId: row.id, actionUrl: entity, createdBy: actor().id });
                    if (!result.ok) throw Error(result.error);
                    count++;
                });
            });
        });
        return count;
    }
    function notificationUI(config) {
        var editable = RHP.can('settings.update');
        return '<p>Cấu hình dùng chung với dịch vụ Cài đặt hiện tại của tài khoản quản lý. Đồng bộ nhắc hạn khi bấm nút bên dưới; chưa có tác vụ nền hoặc dịch vụ Email.</p><fieldset ' + (!editable ? 'disabled' : '') + '>' +
            ['notifyInvoice', 'notifyContract', 'notifySupportStatus'].map(function (key, i) { return '<label class="rhgs-check"><input type="checkbox" data-rhgs-setting="' + key + '" ' + (config[key] ? 'checked' : '') + '> ' + ['Thông báo hóa đơn', 'Nhắc hạn hợp đồng', 'Cập nhật hỗ trợ (dùng luồng hiện có)'][i] + '</label>'; }).join('') +
            rules.map(function (rule) { return '<article><h4>' + rule.title + '</h4>' + (rule.days ? '<label>Nhắc trước hạn (ngày, cách nhau dấu phẩy)<input data-rhgs-setting="' + rule.days + '" value="' + esc(config[rule.days]) + '" placeholder="7,3,1,0"></label>' : '') + '<label>Mẫu nội dung<textarea maxlength="2000" data-rhgs-template="' + rule.id + '">' + esc(config.notificationTemplates[rule.id] || rule.template) + '</textarea></label><div class="rhgs-variables">' + variables.map(function (v) { return '<button type="button" data-rhgs-variable="' + v + '" data-target="' + rule.id + '">{' + v + '}</button>'; }).join('') + '</div></article>'; }).join('') + '</fieldset>' + (editable ? '<button type="button" data-rhgs-action="save">Lưu cấu hình thông báo</button> ' : '') + (editable && RHP.can('notifications.create') ? '<button type="button" data-rhgs-action="sync">Đồng bộ thông báo từ dữ liệu thật</button>' : '') + '<p>Trạng thái đã đọc và điều hướng dùng hộp thư/chuông hiện có. Hoạt động tòa nhà tiếp tục dùng Quản lý thông báo hiện tại. Mẫu hỗ trợ và lịch chạy nền cần nối thêm luồng dùng chung trước khi bật.</p>';
    }
    function financeUI() {
        if (!RHP.can('buildings.view')) return '<p>Bạn chưa có quyền xem thông tin tòa nhà.</p>';
        return '<p>Tài khoản nhận tiền đang dùng từ cấu hình từng tòa nhà; không tạo danh sách tài khoản song song.</p><p class="rhgs-warning">Tạm khóa thay đổi thông tin nhận tiền: hóa đơn cũ chưa có bản chụp tài khoản khi phát hành. Cần bổ sung cơ chế này trước khi thêm/sửa/ngừng sử dụng hoặc gán nhiều tài khoản.</p><div class="rhgs-table"><table><thead><tr><th>Tòa nhà</th><th>Ngân hàng</th><th>Số tài khoản</th><th>Chủ tài khoản</th><th>Tình trạng cấu hình</th></tr></thead><tbody>' + scoped('buildings').map(function (b) { var c = b.config || {}; return '<tr><td>' + esc(b.name) + '</td><td>' + esc(c.bankName || 'Chưa cấu hình') + '</td><td>' + esc(c.bankAccountNumber || '—') + '</td><td>' + esc(c.bankAccountHolder || '—') + '</td><td>' + (c.bankName && c.bankAccountNumber && c.bankAccountHolder ? 'Đã có thông tin' : 'Thiếu thông tin') + '</td></tr>'; }).join('') + '</tbody></table></div><p>VietQR và yêu cầu “Đã chuyển khoản” sử dụng chức năng Hóa đơn hiện tại. Quét QR không xác nhận thu tiền. Chưa bổ sung biên lai/mã giao dịch, từ chối giao dịch hoặc đối soát ngân hàng.</p>';
    }
    function activityUI() {
        return '<p>Nhật ký mới ghi các thay đổi qua RHD trên trang quản lý kể từ khi bản này được tải; không tạo lại lịch sử cũ. Chưa bao gồm đăng nhập/đăng xuất và thay đổi phân quyền. Chỉ lưu các trường được phép, không lưu mật khẩu/token.</p><div class="rhgs-filters"><label>Người thực hiện<input data-filter="user" type="search"></label><label>Từ ngày<input data-filter="from" type="date"></label><label>Đến ngày<input data-filter="to" type="date"></label><label>Module<select data-filter="module"><option value="">Tất cả</option>' + Object.keys(labels).map(function (k) { return '<option value="' + k + '">' + labels[k] + '</option>'; }).join('') + '</select></label><label>Hành động<select data-filter="action"><option value="">Tất cả</option>' + Object.keys(actions).map(function (k) { return '<option value="' + k + '">' + actions[k] + '</option>'; }).join('') + '</select></label></div><div class="rhgs-table"><table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Module</th><th>Hành động</th><th>Đối tượng</th><th>Kết quả</th></tr></thead><tbody id="rhgs-log-rows"></tbody></table></div><div id="rhgs-detail"></div>';
    }
    function filterLogs(rows, filters) {
        if (filters.from && filters.to && filters.from > filters.to) return [];
        return rows.filter(function (r) { var day = dateKey(new Date(r.at)); return (!filters.user || String(r.actorName).toLocaleLowerCase('vi').includes(filters.user.toLocaleLowerCase('vi'))) && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to) && (!filters.module || r.module === filters.module) && (!filters.action || r.action === filters.action); }).sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); });
    }
    function renderRows() {
        var root = document.getElementById('rh-general-settings'), filters = {};
        root.querySelectorAll('[data-filter]').forEach(function (el) { filters[el.dataset.filter] = el.value; });
        var rows = filterLogs(logs(), filters);
        root.querySelector('#rhgs-log-rows').innerHTML = rows.map(function (r) { return '<tr><td><button type="button" data-rhgs-log="' + esc(r.id) + '">' + esc(new Date(r.at).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' })) + '</button></td><td>' + esc(r.actorName) + '</td><td>' + esc(labels[r.module]) + '</td><td>' + esc(actions[r.action]) + '</td><td>' + esc(r.objectId) + '</td><td>' + esc(r.result) + '</td></tr>'; }).join('') || '<tr><td colspan="6">' + (filters.from && filters.to && filters.from > filters.to ? 'Khoảng ngày không hợp lệ.' : 'Chưa có nhật ký phù hợp.') + '</td></tr>';
    }
    function mount() {
        var root = document.getElementById('rh-general-settings');
        if (!root) return;
        try {
            requirePermission('settings.view');
            var config = RHD.getSettings();
            root.innerHTML = '<h3>Cài đặt chung</h3><div class="rhgs-tabs">' + [['notifications', 'Cài đặt thông báo'], ['finance', 'Tài khoản tài chính'], ['activity', 'Nhật ký hoạt động']].map(function (t) { return '<button type="button" aria-pressed="' + (tab === t[0]) + '" data-rhgs-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><p role="alert" id="rhgs-error">' + esc(error) + '</p><p role="status" id="rhgs-notice">' + esc(notice) + '</p>' + (tab === 'notifications' ? notificationUI(config) : tab === 'finance' ? financeUI() : activityUI());
            if (tab === 'activity') renderRows();
            root.onclick = function (event) {
                var button = event.target.closest('button');
                if (!button) return;
                try {
                    if (button.dataset.rhgsTab) { tab = button.dataset.rhgsTab; notice = ''; mount(); }
                    else if (button.dataset.rhgsVariable) { var input = root.querySelector('[data-rhgs-template="' + button.dataset.target + '"]'), start = input.selectionStart; input.setRangeText('{' + button.dataset.rhgsVariable + '}', start, input.selectionEnd, 'end'); input.focus(); }
                    else if (button.dataset.rhgsAction === 'save') { var values = { templates: {} }; root.querySelectorAll('[data-rhgs-setting]').forEach(function (el) { values[el.dataset.rhgsSetting] = el.type === 'checkbox' ? el.checked : el.value; }); root.querySelectorAll('[data-rhgs-template]').forEach(function (el) { values.templates[el.dataset.rhgsTemplate] = el.value; }); error = ''; saveNotifications(values); notice = 'Đã lưu cấu hình.'; mount(); }
                    else if (button.dataset.rhgsAction === 'sync') { notice = 'Đã tạo ' + synchronize() + ' thông báo mới. Cấu hình chưa lưu không được áp dụng.'; mount(); }
                    else if (button.dataset.rhgsLog) { var row = logs().find(function (r) { return r.id === button.dataset.rhgsLog; }); if (row) { root.querySelector('#rhgs-detail').innerHTML = '<aside role="dialog" aria-modal="true" aria-label="Chi tiết nhật ký" tabindex="-1"><button type="button" data-rhgs-action="close">Đóng</button><h4>Chi tiết nhật ký</h4><pre>' + esc(JSON.stringify(row, null, 2)) + '</pre></aside>'; root.querySelector('aside').focus(); } }
                    else if (button.dataset.rhgsAction === 'close') root.querySelector('#rhgs-detail').innerHTML = '';
                } catch (e) { root.querySelector('#rhgs-error').textContent = e.message; }
            };
            root.oninput = function (event) { if (event.target.dataset.filter) { try { renderRows(); } catch (e) { root.querySelector('#rhgs-error').textContent = e.message; } } };
            root.onkeydown = function (event) {
                if (event.key === 'Enter' && event.target.matches('input')) event.preventDefault();
                if (event.key === 'Escape' && root.querySelector('#rhgs-detail')) root.querySelector('#rhgs-detail').innerHTML = '';
            };
        } catch (e) { root.textContent = 'Không thể mở Cài đặt chung: ' + e.message; }
    }
    global.RHGeneralSettings = { mount: mount, record: record, logs: logs, filterLogs: filterLogs, saveNotifications: saveNotifications, synchronize: synchronize };
})(window);
