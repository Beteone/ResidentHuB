/* Settings-only UI. Uses RHD settings/entities, RHP permissions and RH inboxes. */
(function (global) {
    'use strict';
    var tab = 'notifications', error = '', notice = '';
    var labels = { settings: 'Cài đặt', buildings: 'Tòa nhà', apartments: 'Căn hộ', customers: 'Cư dân', contracts: 'Hợp đồng', invoices: 'Hóa đơn', supportRequests: 'Hỗ trợ', meters: 'Ghi chỉ số', deposits: 'Đặt cọc', depositTransactions: 'Giao dịch cọc', auth: 'Đăng nhập / đăng xuất', users: 'Tài khoản người dùng', roles: 'Phân quyền', financialAccounts: 'Tài khoản tài chính', cashflows: 'Thu chi' };
    var actions = { create: 'Tạo', update: 'Cập nhật', delete: 'Xóa', login: 'Đăng nhập', logout: 'Đăng xuất', lock: 'Khóa sổ', transfer: 'Chuyển liên kết' };
    var rules = [
        { id: 'invoice', flag: 'notifyInvoice', title: 'Hóa đơn đã phát hành', template: 'Xin chào {Ten_Cu_Dan}, hóa đơn {Ma_Doi_Tuong} của tòa {Toa_Nha} có số tiền còn lại {So_Tien}, hạn thanh toán {Ngay_Han}.' },
        { id: 'reminder', flag: 'notifyInvoice', title: 'Nhắc hạn hóa đơn', days: 'invoiceReminderDays', template: 'Xin chào {Ten_Cu_Dan}, hóa đơn {Ma_Doi_Tuong} còn {So_Ngay} ngày đến hạn {Ngay_Han}. Số tiền còn lại: {So_Tien}.' },
        { id: 'contract', flag: 'notifyContract', title: 'Hợp đồng sắp hết hạn', days: 'contractReminderDays', template: 'Xin chào {Ten_Cu_Dan}, hợp đồng {Ma_Doi_Tuong} tại {Toa_Nha} còn {So_Ngay} ngày đến ngày kết thúc {Ngay_Han}.' },
        { id: 'support', flag: 'notifySupportStatus', title: 'Cập nhật yêu cầu hỗ trợ', template: 'Xin chào {Ten_Cu_Dan}, yêu cầu {Ma_Doi_Tuong} tại {Toa_Nha} đã được cập nhật: {Trang_Thai}.' },
        { id: 'activity', flag: 'notifyBuildingActivity', title: 'Hoạt động tòa nhà', template: 'Xin chào {Ten_Cu_Dan}, {Noi_Dung}' }
    ];
    var variables = ['Ten_Cu_Dan', 'Ma_Doi_Tuong', 'Toa_Nha', 'So_Tien', 'Ngay_Han', 'So_Ngay', 'Trang_Thai', 'Noi_Dung'];
    function ruleVariables(id) { return variables.filter(function (key) { return (id === 'activity' ? ['Ten_Cu_Dan', 'Ma_Doi_Tuong', 'Toa_Nha', 'Noi_Dung'] : id === 'support' ? ['Ten_Cu_Dan', 'Ma_Doi_Tuong', 'Toa_Nha', 'Trang_Thai', 'Noi_Dung'] : id === 'contract' ? ['Ten_Cu_Dan', 'Ma_Doi_Tuong', 'Toa_Nha', 'Ngay_Han', 'So_Ngay'] : ['Ten_Cu_Dan', 'Ma_Doi_Tuong', 'Toa_Nha', 'So_Tien', 'Ngay_Han', 'So_Ngay']).includes(key); }); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function actor() { return global.RHP && RHP.currentUser(); }
    function requirePermission(key) { if (!global.RHP || !RHP.can(key)) throw Error('Bạn không có quyền thực hiện thao tác này.'); }
    function readLogs() {
        if (!global.RHActivity) throw Error('Dịch vụ nhật ký chưa được tải.');
        return global.RHActivity.read();
    }
    function record(entity, action, before, after) {
        if (global.RHActivity) global.RHActivity.record(entity, action, before, after);
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
        var current = RHD.getSettings(), templates = {}, delivery = Object.assign({}, current.notificationDelivery);
        rules.forEach(function (r) {
            var text = String(values.templates[r.id] === undefined ? current.notificationTemplates[r.id] || r.template : values.templates[r.id]).trim();
            if (!text || text.length > 2000) throw Error('Mẫu nội dung cần có từ 1 đến 2000 ký tự.');
            var tags = text.match(/\{[^{}]*\}/g) || [];
            if (tags.some(function (tag) { return ruleVariables(r.id).indexOf(tag.slice(1, -1)) < 0; }) || /[{}]/.test(text.replace(/\{[^{}]*\}/g, ''))) throw Error('Mẫu chứa trường dữ liệu không được hỗ trợ cho loại thông báo này.');
            templates[r.id] = text;
            if (values.delivery && values.delivery[r.id]) {
                var setting = values.delivery[r.id];
                if (typeof setting.enabled !== 'boolean' || (setting.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(setting.time))) throw Error('Giờ gửi phải có định dạng HH:mm hợp lệ.');
                delivery[r.id] = { enabled: setting.enabled, time: setting.time || '' };
            }
        });
        var patch = { notificationTemplates: templates, notificationDelivery: delivery, notifyBuildingActivity: values.notifyBuildingActivity === undefined ? current.notifyBuildingActivity : !!values.notifyBuildingActivity };
        ['notifyInvoice', 'notifyContract', 'notifySupportStatus'].forEach(function (k) { patch[k] = !!values[k]; });
        ['invoiceReminderDays', 'contractReminderDays'].forEach(function (k) { patch[k] = days(values[k]).join(','); });
        if (!current.notificationTemplates || typeof current.notificationTemplates !== 'object' || Array.isArray(current.notificationTemplates)) throw Error('Dữ liệu mẫu hiện tại không hợp lệ; không ghi đè dữ liệu cũ.');
        if (values.financialAlerts) {
            var alerts = values.financialAlerts;
            var recipients = internalRecipients();
            if (!Array.isArray(alerts.actions) || alerts.actions.some(function (a) { return ['update', 'lock', 'delete'].indexOf(a) < 0; }) || !Array.isArray(alerts.recipientIds) || alerts.recipientIds.some(function (id) { return !recipients.some(function (u) { return u.id === id; }); })) throw Error('Người nhận cảnh báo phải là tài khoản quản lý có quyền trong phạm vi.');
            if (alerts.enabled && (!alerts.actions.length || !alerts.recipientIds.length)) throw Error('Cần chọn hành động và người nhận cho cảnh báo nội bộ.');
            patch.financialAlerts = { enabled: !!alerts.enabled, actions: Array.from(new Set(alerts.actions)), recipientIds: Array.from(new Set(alerts.recipientIds)) };
        }
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
    function ready(rule, config, now, automatic) {
        var setting = config.notificationDelivery[rule.id] || {};
        if (setting.enabled === false || !config[rule.flag]) return false;
        if (automatic && !setting.time) return false;
        var time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
        return !setting.time || time >= setting.time;
    }
    function supportMessage(row, user, config) {
        var building = RHD.get('buildings', row.buildingId), rule = rules.find(function (r) { return r.id === 'support'; });
        var status = (RHD.SUPPORT_STATUSES.find(function (s) { return s.id === row.status; }) || {}).label || row.status;
        return (config.notificationTemplates.support || rule.template).replace(/\{([^{}]+)\}/g, function (_, key) { return { Ten_Cu_Dan: user.name, Ma_Doi_Tuong: row.code || row.id, Toa_Nha: building && building.name || '', Trang_Thai: status, Noi_Dung: row.response || '' }[key] || ''; });
    }
    function prepareSupport(message, user) {
        if (message.refType !== 'request' || !global.RHD || RHD.mode() !== 'live') return message;
        var config = RHD.getSettings(), row = RHD.get('supportRequests', message.id);
        if (!config.notifySupportStatus || (config.notificationDelivery.support || {}).enabled === false) return null;
        if (!row || !/^Yêu cầu .+ đã được cập nhật$/.test(message.title || '')) return message;
        if (!RHP.can('support.view') || !RHP.inScope(row.buildingId) || user.status !== 'active') return null;
        if (!ready(rules.find(function (r) { return r.id === 'support'; }), config, new Date(), false)) return null;
        return Object.assign({}, message, { body: supportMessage(row, user, config), campaignId: 'settings:support:' + row.id + ':' + row.status + ':' + (row.updatedAt || '') });
    }
    function prepareRecordNotice(row, kind, user) {
        if (RHD.mode() !== 'live' || user.status !== 'active') return null;
        var entity = kind === 'contract' ? 'contracts' : 'invoices';
        row = row && RHD.get(entity, row.id);
        if (!row || !RHP.can(entity + '.view') || !RHP.inScope(row.buildingId) || !RHD.get('buildings', row.buildingId)) return null;
        var config = RHD.getSettings(), rule = rules.find(function (r) { return r.id === (kind === 'contract' ? 'contract' : 'invoice'); });
        if (!config[rule.flag] || (config.notificationDelivery[rule.id] || {}).enabled === false) return null;
        if (kind === 'invoice' && (!row.issuedAt || !['unpaid', 'sent', 'overdue', 'paid', 'payment_pending'].includes(row.status))) return null;
        if (kind === 'contract' && !['active', 'ended', 'expired', 'terminated'].includes(row.status)) return null;
        var message = { type: kind === 'contract' ? 'CONTRACT' : 'BILLING', subType: kind === 'contract' ? 'CONTRACT_UPDATED' : 'INVOICE_UPDATED', title: kind === 'contract' ? 'Hợp đồng đã được cập nhật' : 'Hóa đơn đã được phát hành', body: kind === 'contract' ? 'Ban quản lý đã cập nhật hợp đồng ' + (row.code || row.id) + ' của bạn.' : '', refType: kind === 'contract' ? 'contract' : 'invoice', refId: row.id, actionUrl: kind === 'contract' ? 'contracts' : 'invoices', actionLabel: 'Xem chi tiết' };
        if (kind === 'invoice') {
            if (row.status === 'paid') {
                message.title = 'Đã ghi nhận thanh toán hóa đơn'; message.body = 'Ban quản lý đã ghi nhận thanh toán hóa đơn ' + (row.code || row.id) + '.';
                message.campaignId = 'settings:invoice-paid:' + row.id + ':' + (row.paidAt || row.issuedAt);
            } else {
                if (!Number.isFinite(Number(row.total)) || Number(row.total) <= 0 || !ready(rule, config, new Date(), false)) return null;
                var building = RHD.get('buildings', row.buildingId), values = { Ten_Cu_Dan: user.name, Ma_Doi_Tuong: row.code || row.id, Toa_Nha: building && building.name || '', So_Tien: new Intl.NumberFormat('vi-VN').format(Math.max(0, Number(row.total) - Number(row.paidAmount || row.amountPaid || 0))) + ' đ', Ngay_Han: row.dueDate || 'Chưa có', So_Ngay: remaining(row.dueDate, dateKey(new Date())) };
                message.body = (config.notificationTemplates.invoice || rule.template).replace(/\{([^{}]+)\}/g, function (_, key) { return values[key] == null ? '' : values[key]; });
                message.campaignId = 'settings:invoice:' + row.id + ':' + row.issuedAt;
            }
        }
        return message;
    }
    function synchronize(now, automatic) {
        requirePermission('settings.update'); requirePermission('notifications.create');
        if (RHD.mode() !== 'live') throw Error('Không gửi thông báo từ dữ liệu Demo.');
        now = now || new Date();
        var config = RHD.getSettings(), today = dateKey(now), count = 0;
        rules.forEach(function (rule) {
            if (rule.id === 'activity' || !ready(rule, config, now, automatic)) return;
            var entity = rule.id === 'contract' ? 'contracts' : rule.id === 'support' ? 'supportRequests' : 'invoices';
            if (!RHP.can((entity === 'supportRequests' ? 'support' : entity) + '.view')) return;
            scoped(entity).forEach(function (row) {
                if (entity === 'invoices' && (!row.issuedAt || !Number.isFinite(Number(row.total)) || Number(row.total) <= 0 || ['unpaid', 'sent', 'overdue', 'payment_pending'].indexOf(row.status) < 0)) return;
                if (entity === 'invoices') {
                    var paid = Number(row.paidAmount || row.amountPaid || 0);
                    if (!Number.isFinite(paid) || paid < 0 || paid >= Number(row.total)) return;
                }
                if (entity === 'contracts' && row.status !== 'active') return;
                if (entity === 'supportRequests' && (!row.updatedAt || !row.status || row.status === 'new' || !row.createdAt || row.updatedAt <= row.createdAt)) return;
                var deadline = entity === 'contracts' ? row.endDate : row.dueDate;
                var diff = remaining(deadline, today);
                if (rule.days && (diff === null || days(config[rule.days]).indexOf(diff) < 0)) return;
                var building = RHD.get('buildings', row.buildingId);
                if (!building) return;
                var campaign = 'settings:' + rule.id + ':' + row.id + ':' + (rule.id === 'support' ? row.status + ':' + row.updatedAt : rule.days ? deadline + ':' + diff : row.issuedAt);
                RH.resolveNotificationRecipients(row).filter(function (user) { return user.status === 'active'; }).forEach(function (user) {
                    if (RH.getNotificationsForUser(user.id).some(function (n) {
                        if (n.campaignId === campaign) return true;
                        if (rule.id === 'support') return false;
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
                    if (rule.id === 'support') body = supportMessage(row, user, config);
                    var result = RH.createNotificationForUser(user.id, { campaignId: campaign, type: entity === 'contracts' ? 'CONTRACT' : rule.id === 'support' ? 'REQUEST' : 'BILLING', title: rule.title, body: body, refType: entity === 'contracts' ? 'contract' : rule.id === 'support' ? 'request' : 'invoice', refId: row.id, actionUrl: rule.id === 'support' ? 'requests' : entity, createdBy: actor().id });
                    if (!result.ok) throw Error(result.error);
                    count++;
                });
            });
        });
        return count;
    }
    function internalRecipients() {
        var current = actor();
        if (!current) return [];
        var scope = RHP.buildingScope(current);
        return RH.getUsers().filter(function (u) {
            if (u.role !== 'manager' || u.status !== 'active' || !RHP.can('settings.view', u) || !RHP.can('settings.update', u)) return false;
            if (u.id === current.id || RHP.isAdmin(current) || RHP.isAdmin(u)) return true;
            var other = RHP.buildingScope(u);
            return scope === null || other === null || scope.some(function (id) { return other.indexOf(id) >= 0; });
        });
    }
    function financialAlert(action, account) {
        try {
            if (RHD.mode() !== 'live') return;
            var prefs = RHD.getSettings().financialAlerts;
            if (!prefs.enabled || prefs.actions.indexOf(action) < 0) return;
            var targets = internalRecipients().filter(function (u) { return prefs.recipientIds.indexOf(u.id) >= 0; });
            targets.forEach(function (u) {
                var result = RH.createNotificationForUser(u.id, { campaignId: 'finance:' + account.id + ':' + action + ':' + (account.updatedAt || Date.now()), type: 'ANNOUNCEMENT', subType: 'FINANCIAL_ALERT', title: 'Cảnh báo tài khoản tài chính', body: actor().name + ' đã ' + ({ update: 'cập nhật', lock: 'khóa sổ', delete: 'xóa' }[action] || action) + ' tài khoản ' + account.code + ' — ' + account.name + '.', refType: 'financialAccount', refId: account.id, actionUrl: 'settings', createdBy: actor().id });
                if (!result.ok) throw Error(result.error);
            });
        } catch (e) { error = 'Tài khoản đã được lưu nhưng gửi cảnh báo nội bộ chưa thành công: ' + e.message; }
    }
    function campaignPolicy() {
        var config = RHD.getSettings(), prefs = config.notificationDelivery.activity || {};
        return { enabled: config.notifyBuildingActivity && prefs.enabled !== false, time: prefs.time || '', template: config.notificationTemplates.activity || rules.find(function (r) { return r.id === 'activity'; }).template };
    }
    function campaignBody(campaign, user) {
        if (!campaign.notificationPolicy) return campaign.body;
        var building = RHD.get('buildings', campaign.buildingId);
        return campaign.notificationPolicy.template.replace(/\{([^{}]+)\}/g, function (_, key) { return { Ten_Cu_Dan: user.name, Noi_Dung: campaign.body, Toa_Nha: building && building.name || campaign.audienceName || '', Ma_Doi_Tuong: campaign.id }[key] || ''; });
    }
    function nextCampaignSend(time, now) {
        now = now || new Date();
        var at = Date.parse(dateKey(now) + 'T' + time + ':00+07:00');
        return at > now.getTime() ? at : at + 86400000;
    }
    function notificationUI(config) {
        var editable = RHP.can('settings.update');
        var alerts = config.financialAlerts;
        return '<p>Cấu hình thông báo trong ứng dụng. Giờ gửi dùng múi giờ Việt Nam (UTC+7); lịch tự chạy khi trang quản lý đang mở và tài khoản có quyền gửi. Hoạt động tòa nhà dùng lịch gửi của Quản lý thông báo.</p><fieldset ' + (!editable ? 'disabled' : '') + '>' +
            ['notifyInvoice', 'notifyContract', 'notifySupportStatus', 'notifyBuildingActivity'].map(function (key, i) { return '<label class="rhgs-check"><input type="checkbox" data-rhgs-setting="' + key + '" ' + (config[key] ? 'checked' : '') + '> ' + ['Thông báo hóa đơn', 'Nhắc hạn hợp đồng', 'Cập nhật hỗ trợ', 'Hoạt động tòa nhà'][i] + '</label>'; }).join('') +
            rules.map(function (rule) { var prefs = config.notificationDelivery[rule.id] || {}; return '<article><h4>' + rule.title + '</h4><div class="rhgs-form-grid"><label class="rhgs-check"><input type="checkbox" data-rhgs-enabled="' + rule.id + '" ' + (prefs.enabled !== false ? 'checked' : '') + '> Bật loại thông báo này</label><label>Giờ gửi (bỏ trống để gửi khi đồng bộ)<input type="time" data-rhgs-time="' + rule.id + '" value="' + esc(prefs.time || '') + '"></label>' + (rule.days ? '<label>Nhắc trước hạn (ngày, cách nhau dấu phẩy)<input data-rhgs-setting="' + rule.days + '" value="' + esc(config[rule.days]) + '" placeholder="7,3,1,0"></label>' : '') + '</div><label>Mẫu nội dung<textarea maxlength="2000" data-rhgs-template="' + rule.id + '">' + esc(config.notificationTemplates[rule.id] || rule.template) + '</textarea></label><div class="rhgs-variables">' + ruleVariables(rule.id).map(function (v) { return '<button type="button" data-rhgs-variable="' + v + '" data-target="' + rule.id + '">{' + v + '}</button>'; }).join('') + '</div></article>'; }).join('') +
            '<article><h4>Cảnh báo nội bộ về tài khoản tài chính</h4><p>Chỉ gửi đến người quản lý được chọn có quyền phù hợp. Không mặc định gửi cho cư dân.</p><label class="rhgs-check"><input type="checkbox" data-alert-enabled ' + (alerts.enabled ? 'checked' : '') + '> Bật cảnh báo nội bộ</label><div class="rhgs-variables">' + [['update', 'Thay đổi thông tin'], ['lock', 'Khóa sổ'], ['delete', 'Xóa tài khoản']].map(function (a) { return '<label class="rhgs-check"><input type="checkbox" data-alert-action="' + a[0] + '" ' + (alerts.actions.includes(a[0]) ? 'checked' : '') + '> ' + a[1] + '</label>'; }).join('') + '</div><label>Người nhận cảnh báo<select multiple data-alert-recipients size="4" aria-label="Người nhận cảnh báo nội bộ">' + internalRecipients().map(function (u) { return '<option value="' + esc(u.id) + '" ' + (alerts.recipientIds.includes(u.id) ? 'selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select></label><p>Giữ Ctrl/Command để chọn nhiều người. Cảnh báo khóa sổ chỉ phát sinh khi nghiệp vụ khóa sổ đã được triển khai và thực hiện thành công.</p></article></fieldset>' +
            (editable ? '<button type="button" class="rhgs-primary" data-rhgs-action="save">Lưu cấu hình thông báo</button> ' : '') + (editable && RHP.can('notifications.create') ? '<button type="button" data-rhgs-action="sync">Đồng bộ thông báo từ dữ liệu thật</button>' : '') + '<p>Trạng thái đã đọc và điều hướng dùng hộp thư/chuông hiện có. Không gửi Email, không gửi từ nháp hay dữ liệu Demo.</p>';
    }
    function financeUI() {
        if (!global.RHFinancialAccounts) throw Error('Chưa tải được dịch vụ tài khoản tài chính.');
        return RHFinancialAccounts.render();
    }
    function activityUI() {
        return '<p>Ghi nhận đăng nhập, đăng xuất và thay đổi dữ liệu, tài khoản, phân quyền, cấu hình kể từ khi triển khai. Nhật ký chỉ mô tả thao tác; giao dịch tiền thực tế vẫn được lưu trong Thu chi.</p><div class="rhgs-filters"><label>Người thực hiện<input data-filter="user" type="search"></label><label>Từ ngày<input data-filter="from" type="date"></label><label>Đến ngày<input data-filter="to" type="date"></label><label>Module<select data-filter="module"><option value="">Tất cả</option>' + Object.keys(labels).map(function (k) { return '<option value="' + k + '">' + labels[k] + '</option>'; }).join('') + '</select></label><label>Hành động<select data-filter="action"><option value="">Tất cả</option>' + Object.keys(actions).map(function (k) { return '<option value="' + k + '">' + actions[k] + '</option>'; }).join('') + '</select></label></div><div class="rhgs-table"><table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Module</th><th>Hành động</th><th>Đối tượng</th><th>Kết quả</th></tr></thead><tbody id="rhgs-log-rows"></tbody></table></div><div id="rhgs-detail"></div>';
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
            if (global.RHActivity && RHActivity.error()) error = RHActivity.error();
            root.innerHTML = '<h3>Cài đặt chung</h3><div class="rhgs-tabs">' + [['notifications', 'Cài đặt thông báo'], ['finance', 'Tài khoản tài chính'], ['activity', 'Nhật ký hoạt động']].map(function (t) { return '<button type="button" aria-pressed="' + (tab === t[0]) + '" data-rhgs-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><p role="alert" id="rhgs-error">' + esc(error) + '</p><p role="status" id="rhgs-notice">' + esc(notice) + '</p>' + (tab === 'notifications' ? notificationUI(config) : tab === 'finance' ? financeUI() : activityUI());
            if (tab === 'activity') renderRows();
            root.onclick = function (event) {
                var button = event.target.closest('button');
                if (!button) return;
                try {
                    if (global.RHFinancialAccounts && RHFinancialAccounts.handle(button)) return;
                    if (button.dataset.rhgsTab) { if (global.RHFinancialAccounts) RHFinancialAccounts.close(); tab = button.dataset.rhgsTab; notice = ''; mount(); }
                    else if (button.dataset.rhgsVariable) { var input = root.querySelector('[data-rhgs-template="' + button.dataset.target + '"]'), start = input.selectionStart; input.setRangeText('{' + button.dataset.rhgsVariable + '}', start, input.selectionEnd, 'end'); input.focus(); }
                    else if (button.dataset.rhgsAction === 'save') {
                        var values = { templates: {}, delivery: {}, financialAlerts: { enabled: root.querySelector('[data-alert-enabled]').checked, actions: [], recipientIds: [] } };
                        root.querySelectorAll('[data-rhgs-setting]').forEach(function (el) { values[el.dataset.rhgsSetting] = el.type === 'checkbox' ? el.checked : el.value; });
                        root.querySelectorAll('[data-rhgs-template]').forEach(function (el) { values.templates[el.dataset.rhgsTemplate] = el.value; });
                        root.querySelectorAll('[data-rhgs-enabled]').forEach(function (el) { values.delivery[el.dataset.rhgsEnabled] = { enabled: el.checked, time: root.querySelector('[data-rhgs-time="' + el.dataset.rhgsEnabled + '"]').value }; });
                        root.querySelectorAll('[data-alert-action]:checked').forEach(function (el) { values.financialAlerts.actions.push(el.dataset.alertAction); });
                        Array.from(root.querySelector('[data-alert-recipients]').selectedOptions).forEach(function (el) { values.financialAlerts.recipientIds.push(el.value); });
                        error = ''; saveNotifications(values); notice = 'Đã lưu cấu hình.'; mount();
                    }
                    else if (button.dataset.rhgsAction === 'sync') { notice = 'Đã tạo ' + synchronize() + ' thông báo mới. Cấu hình chưa lưu không được áp dụng.'; mount(); }
                    else if (button.dataset.rhgsLog) { var row = logs().find(function (r) { return r.id === button.dataset.rhgsLog; }); if (row) { root.querySelector('#rhgs-detail').innerHTML = '<aside role="dialog" aria-modal="true" aria-label="Chi tiết nhật ký" tabindex="-1"><button type="button" data-rhgs-action="close">Đóng</button><h4>Chi tiết nhật ký</h4><pre>' + esc(JSON.stringify(row, null, 2)) + '</pre></aside>'; root.querySelector('aside').focus(); } }
                    else if (button.dataset.rhgsAction === 'close') root.querySelector('#rhgs-detail').innerHTML = '';
                } catch (e) { root.querySelector('#rhgs-error').textContent = e.message; }
            };
            root.oninput = function (event) { try { if (global.RHFinancialAccounts) RHFinancialAccounts.change(event); if (event.target.dataset.filter) renderRows(); } catch (e) { root.querySelector('#rhgs-error').textContent = e.message; } };
            root.onchange = function (event) { if (event.target.matches('[data-finance-type]') && global.RHFinancialAccounts) RHFinancialAccounts.change(event); };
            root.onkeydown = function (event) {
                if (event.key === 'Enter' && event.target.matches('input')) event.preventDefault();
                if (event.key === 'Escape' && global.RHFinancialAccounts && RHFinancialAccounts.isModalOpen()) RHFinancialAccounts.close();
                if (event.key === 'Escape' && root.querySelector('#rhgs-detail')) root.querySelector('#rhgs-detail').innerHTML = '';
                var dialog = root.querySelector('[role=dialog]');
                if (event.key === 'Tab' && dialog) {
                    var items = Array.from(dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'));
                    var first = items[0], last = items[items.length - 1];
                    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
                    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
                }
            };
        } catch (e) { root.textContent = 'Không thể mở Cài đặt chung: ' + e.message; }
    }
    global.RHGeneralSettings = { mount: mount, record: record, logs: logs, filterLogs: filterLogs, saveNotifications: saveNotifications, synchronize: synchronize, prepareSupport: prepareSupport, prepareRecordNotice: prepareRecordNotice, campaignPolicy: campaignPolicy, campaignBody: campaignBody, nextCampaignSend: nextCampaignSend, financialAlert: financialAlert };
    if (global.setInterval) global.setInterval(function () {
        try {
            if (!global.RHP || !global.RHD || !RHP.can('settings.update') || !RHP.can('notifications.create') || RHD.mode() !== 'live') return;
            var prefs = RHD.getSettings().notificationDelivery;
            if (Object.keys(prefs).some(function (id) { return id !== 'activity' && prefs[id].enabled !== false && prefs[id].time; })) synchronize(new Date(), true);
        } catch (e) { error = 'Chưa đồng bộ được lịch thông báo: ' + e.message; }
    }, 60000);
})(window);
