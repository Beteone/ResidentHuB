/* Supabase Auth + identity RPCs. No legacy account/password/storage import. */
(function (global) {
    'use strict';
    var config = global.RH_AUTH_CONFIG || { mode: 'unconfigured' };
    var enabled = config.mode !== 'local';
    var context = null, tokens = null, generation = 0, refreshing = null, revision = 0, refreshSequence = 0;
    var sessionKey = 'residenthub_central_auth_v1';
    var ready = Promise.resolve();
    function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function failure(message) { return { ok: false, reason: 'central_unavailable', error: message || 'Không thể kết nối hệ thống tài khoản chung. Vui lòng thử lại.' }; }
    function changed() {
        revision++;
        if (global.dispatchEvent && global.CustomEvent) global.dispatchEvent(new CustomEvent('residenthub:identity-changed'));
    }
    function clear(silent) {
        generation++; context = null; tokens = null;
        try { global.sessionStorage.removeItem(sessionKey); } catch (_) { /* memory is already cleared */ }
        if (!silent) changed();
    }
    function validate() {
        if (config.mode !== 'supabase') throw new Error('Chế độ xác thực không hợp lệ.');
        var url = new URL(config.url);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Cần Supabase URL HTTPS hợp lệ.');
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.organizationId || '') || !config.publicKey) throw new Error('Thiếu cấu hình tài khoản chung.');
        if (!/^sb_publishable_[\w-]+$/.test(config.publicKey)) {
            try {
                var payload = JSON.parse(global.atob(config.publicKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                if (payload.role !== 'anon') throw new Error();
            } catch (_) { throw new Error('Chỉ chấp nhận publishable/anon public key.'); }
        }
    }
    async function request(path, body, method, token) {
        validate();
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 15000);
        try {
            var response = await global.fetch(config.url.replace(/\/$/, '') + path, {
                method: method || 'POST', credentials: 'omit', cache: 'no-store', signal: controller.signal,
                headers: Object.assign({ apikey: config.publicKey, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
                body: body === undefined ? undefined : JSON.stringify(body)
            });
            var data = response.status === 204 ? null : await response.json();
            if (!response.ok) {
                var error = new Error('Yêu cầu tài khoản chung bị từ chối.');
                error.status = response.status; // Never include server bodies, tokens or credentials in UI/logs.
                throw error;
            }
            return data;
        } finally { clearTimeout(timeout); }
    }
    function persist() {
        // Tokens are session-scoped, not the legacy localStorage auth source.
        global.sessionStorage.setItem(sessionKey, JSON.stringify(tokens));
    }
    async function accessToken() {
        if (!tokens) throw new Error('Vui lòng đăng nhập lại.');
        if (tokens.expires_at > Date.now() / 1000 + 60) return tokens.access_token;
        if (!refreshing) {
            var ticket = generation;
            refreshing = request('/auth/v1/token?grant_type=refresh_token', { refresh_token: tokens.refresh_token }).then(function (data) {
                if (ticket !== generation) throw new Error('Phiên đã thay đổi.');
                tokens = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() / 1000 + data.expires_in };
                persist(); return tokens.access_token;
            }).finally(function () { refreshing = null; });
        }
        return refreshing;
    }
    async function rpc(name, args) {
        return request('/rest/v1/rpc/' + name, Object.assign({ p_org: config.organizationId }, args || {}), 'POST', await accessToken());
    }
    async function refresh() {
        var ticket = generation;
        var sequence = ++refreshSequence;
        try {
            var next = await rpc('rh_identity_context');
            if (ticket !== generation || sequence !== refreshSequence) return failure('Phiên đã thay đổi.');
            if (!next || !next.user || next.user.status !== 'active' || !next.types || !next.users) throw new Error();
            var different = JSON.stringify(context) !== JSON.stringify(next);
            context = next; if (different) changed(); return { ok: true };
        } catch (_) {
            if (ticket === generation && sequence === refreshSequence) { context = null; changed(); }
            return failure();
        }
    }
    async function authenticate(identifier, password) {
        clear();
        var ticket = generation;
        try {
            // Supabase email/password only; never look up legacy users by display name.
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(identifier).trim())) return { ok: false, reason: 'invalid' };
            var data = await request('/auth/v1/token?grant_type=password', { email: String(identifier).trim(), password: password });
            if (ticket !== generation) return failure('Phiên đã thay đổi.');
            tokens = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() / 1000 + data.expires_in };
            persist();
            var result = await refresh();
            if (!result.ok) { await logout(); return { ok: false, reason: 'membership_denied' }; }
            return { ok: true, user: clone(context.user) };
        } catch (e) {
            if (ticket === generation) clear();
            return e.status === 429 ? { ok: false, reason: 'rate_limited' } : e.status === 400 || e.status === 401 ? { ok: false, reason: 'invalid' } : failure();
        }
    }
    async function logout() {
        var token = tokens && tokens.access_token;
        clear(true);
        if (token) try { await request('/auth/v1/logout?scope=local', undefined, 'POST', token); } catch (_) { /* local credentials discarded */ }
        changed();
        return { ok: true };
    }
    async function mutate(name, args) {
        try {
            var result = await rpc(name, args);
            var sync = await refresh();
            if (!sync.ok) return failure('Thay đổi đã gửi; cần kết nối lại để kiểm tra kết quả.');
            return { ok: true, item: result, user: result };
        } catch (_) { await refresh(); return failure('Không thể lưu. Kiểm tra quyền, dữ liệu liên kết và kết nối rồi thử lại.'); }
    }
    async function recover(email) {
        try {
            var callback = new URL('auth-callback.html', global.location.href).href;
            await request('/auth/v1/recover?redirect_to=' + encodeURIComponent(callback), { email: String(email).trim() });
            return { ok: true, emailSent: true };
        } catch (_) { return failure(); }
    }
    async function changePassword(input) {
        if (!input || input.newPassword !== input.confirmPassword || String(input.newPassword).length < 12) return failure('Mật khẩu mới cần ít nhất 12 ký tự và xác nhận khớp.');
        try {
            // Reauthenticate on the server; never compare a browser-stored password.
            var me = context && context.user;
            if (!me) return failure('Vui lòng đăng nhập lại.');
            var proof = await request('/auth/v1/token?grant_type=password', { email: me.email, password: input.currentPassword });
            try { await request('/auth/v1/user', { password: input.newPassword }, 'PUT', proof.access_token); }
            finally { await request('/auth/v1/logout?scope=local', undefined, 'POST', proof.access_token).catch(function () {}); }
            await logout(); return { ok: true, passwordChanged: true };
        } catch (_) { return failure('Không đổi được mật khẩu. Kiểm tra mật khẩu hiện tại hoặc yêu cầu đặt lại qua email.'); }
    }
    function getSession() { return clone(context && context.user); }
    async function completePasswordSetup(credentials, password) {
        if (String(password).length < 12) return failure('Mật khẩu cần ít nhất 12 ký tự.');
        try {
            var token = credentials.access_token;
            if (credentials.token_hash && ['invite', 'recovery'].indexOf(credentials.type) !== -1) {
                var verified = await request('/auth/v1/verify', { token_hash: credentials.token_hash, type: credentials.type });
                token = verified.access_token;
            }
            if (!token) throw new Error();
            await request('/auth/v1/user', undefined, 'GET', token);
            await request('/auth/v1/user', { password: password }, 'PUT', token);
            await request('/auth/v1/logout?scope=global', undefined, 'POST', token);
            clear(); return { ok: true };
        } catch (_) { return failure('Liên kết hết hạn hoặc Auth yêu cầu xác minh lại. Hãy yêu cầu email mới.'); }
    }
    function install(api) {
        if (!enabled) return;
        api.central = true;
        api.ready = ready;
        api.getUsers = function () { return clone(context ? context.users : []); };
        api.findUserByEmail = function (email) { return api.getUsers().find(function (u) { return u.email === email; }) || null; };
        api.authenticateDetailed = authenticate;
        api.authenticate = async function (id, password) { var r = await authenticate(id, password); return r.ok ? r.user : null; };
        api.login = function () { return getSession(); }; // Auth response + DB context already established identity.
        api.logout = logout; api.getSession = getSession;
        api.getCurrentUserId = function () { var s = getSession(); return s ? s.id : null; };
        api.refreshIdentity = refresh;
        api.updateUser = function (id, patch) {
            if ('password' in patch || 'pass' in patch) return Promise.resolve(failure('Mật khẩu phải do chính người dùng đặt qua Auth.'));
            return mutate('rh_identity_update_member', { p_id: id, p_patch: patch });
        };
        api.deleteUser = function (id) { return mutate('rh_identity_delete_member', { p_id: id }); };
        api.createUser = async function (data) {
            if (data.password || data.pass) return failure('Tạo tài khoản bằng lời mời email; không nhập mật khẩu thay người dùng.');
            try {
                var result = await request('/functions/v1/identity-invite', { organizationId: config.organizationId, member: data }, 'POST', await accessToken());
                await refresh(); return { ok: true, user: result, item: result };
            } catch (_) { return failure('Không gửi được lời mời. Kiểm tra email trùng, quyền và cấu hình Edge Function.'); }
        };
        api.requestPasswordRecovery = recover;
        api.beginOwnPasswordChange = changePassword;
        api.resendOwnPasswordCode = api.confirmOwnPasswordChange = api.resetPassword = function () { return failure('Dùng liên kết Auth gửi qua email để đặt lại mật khẩu.'); };
        // Legacy registration cannot create a privileged membership or upload passwords.
        api.submitAccountRequest = api.approveAccountRequest = api.rejectAccountRequest = function () { return failure('Đăng ký tập trung cần người quản trị gửi lời mời đã xác minh.'); };
        api.listAccountRequests = function () { return []; };
        api.getAccountRequest = function () { return null; };
        api.updateCurrentUserProfile = function (patch) {
            patch = Object.assign({}, patch);
            if ('email' in patch) { patch.contactEmail = patch.email; delete patch.email; }
            return mutate('rh_identity_update_profile', { p_patch: patch });
        };
        api.updateCurrentUserSettings = async function (patch) {
            var before = api.getCurrentUserSettings();
            var preferences = Object.assign({}, before, patch);
            if (patch.notifications) {
                preferences.notifications = Object.assign({}, before.notifications, patch.notifications);
                ['channels', 'categories'].forEach(function (key) {
                    preferences.notifications[key] = Object.assign({}, before.notifications && before.notifications[key], patch.notifications[key]);
                });
            }
            var result = await mutate('rh_identity_update_profile', { p_patch: { preferences: preferences } });
            return Object.assign(result, result.ok ? { preferences: api.getCurrentUserSettings() } : {});
        };
        api.updateStaffProfileFollowUp = async function (id, updateId, patch) {
            var result = await mutate('rh_identity_profile_follow_up', { p_id: id, p_update: updateId, p_patch: patch });
            return Object.assign(result, result.ok ? { update: result.item } : {});
        };
        api.inspectAuthEnvironment = function () { return { storage: 'supabase', sharedIdentity: !!context, connected: !!context, configured: !!config.url, businessData: 'browser-local', revision: revision }; };
    }
    if (enabled) {
        ready = (async function () {
            try {
                validate();
                var raw = global.sessionStorage.getItem(sessionKey);
                if (raw) {
                    tokens = JSON.parse(raw);
                    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_at)) throw new Error();
                    await refresh();
                }
            } catch (_) { clear(); }
        })();
        if (global.addEventListener) {
            global.addEventListener('focus', function () { if (tokens) refresh(); });
            global.setInterval(function () { if (tokens) refresh(); }, 30000);
        }
    }
    global.RHCentral = {
        enabled: enabled, install: install, getSession: getSession,
        users: function () { return clone(context ? context.users : []); },
        types: function () { return clone(context ? context.types : []); },
        revision: function () { return revision; },
        saveType: function (id, data) { return mutate('rh_identity_save_type', { p_id: id || null, p_data: data }); },
        deleteType: function (id) { return mutate('rh_identity_delete_type', { p_id: id }); },
        ready: ready, completePasswordSetup: completePasswordSetup
    };
})(window);
