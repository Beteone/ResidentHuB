/*
 * ResidentHub - central business data adapter (RHCentralData).
 *
 * Active ONLY when RH_AUTH_CONFIG = { mode: 'supabase', businessData: 'central', ... }.
 * Every module in this project reads/writes business data through a small set of
 * localStorage keys (residenthub_live_buildings, residenthub_live_contracts, ...),
 * many of them directly (templates.js, contract-documents.js, billing.js, the TS
 * bundles). This file routes exactly those keys to the shared database instead of
 * the browser:
 *
 *   - reads  come from an in-memory snapshot loaded by RPC rh_data_load (scoped
 *            by the server to the signed-in member's permissions);
 *   - writes are diffed per record and committed by RPC rh_data_apply BEFORE the
 *            call returns (synchronous request), so RHD.create/update/remove keep
 *            their existing synchronous contract and only report success after the
 *            database committed. Rejections throw; nothing is kept locally.
 *   - each record carries the version it was read at; a stale write from another
 *     device raises a conflict instead of overwriting (then a fresh snapshot loads).
 *
 * The legacy browser keys are never read, written or deleted in central mode:
 * they stay intact for the encrypted backup / import tools (tools/migration/).
 * Demo mode (residenthub_demo_*), UI preferences and drafts stay local.
 */
(function (global) {
    'use strict';
    var central = global.RHCentral;
    var config = global.RH_AUTH_CONFIG || {};
    var enabled = !!(central && central.enabled && central.businessData && config.businessData === 'central');
    var ENTITIES = ['buildings', 'apartments', 'customers', 'meters', 'contracts', 'deposits', 'depositTransactions',
        'invoices', 'cashflows', 'supportRequests', 'assets', 'assetTypes', 'financialAccounts', 'billingRuns', 'templates'];
    var KEYS = Object.create(null);
    ENTITIES.forEach(function (entity) { KEYS['residenthub_live_' + entity] = entity; });
    KEYS.residenthub_live_activity_v1 = 'activity';
    KEYS.residenthub_notification_campaigns_v1 = 'notificationCampaigns';
    var COLLECTIONS = Object.keys(KEYS).map(function (key) { return KEYS[key]; });
    var SIGNAL = 'residenthub_central_data_signal';
    var BATCH = 200;
    var state = null;           // { member, rows, versions, raw, docs }
    var scratch = Object.create(null); // pre-login page writes: memory only, never sent
    var loading = null, lastLoad = 0;
    var proto = global.Storage && global.Storage.prototype;
    var nativeGet = proto && proto.getItem, nativeSet = proto && proto.setItem, nativeRemove = proto && proto.removeItem;

    function canonical(value) {
        if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
        if (value && typeof value === 'object') {
            return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonical(value[key]); }).join(',') + '}';
        }
        return JSON.stringify(value);
    }
    function normalize(value) { return JSON.parse(JSON.stringify(value)); }

    function memberDoc(key) {
        if (!state) return null;
        var id = encodeURIComponent(state.member);
        if (key === 'residenthub_settings_v1_' + id) return 'settings';
        if (key === 'residenthub_invoice_module_v1_live_' + id) return 'invoiceModule';
        return null;
    }
    function route(storage, key) {
        if (!enabled || storage !== global.localStorage) return null;
        if (KEYS[key]) return { kind: 'collection', name: KEYS[key] };
        if (key === 'residenthub_live_billingMeta') return { kind: 'doc', name: 'billingMeta' };
        // Another member's personal document is not readable/writable from here.
        if (key.indexOf('residenthub_settings_v1_') === 0 || key.indexOf('residenthub_invoice_module_v1_live_') === 0) return { kind: 'doc', name: memberDoc(key) };
        return null;
    }

    // ------------------------------------------------------------- errors
    var noticeTimer = null;
    function showNotice(message) {
        if (!global.document || !global.document.body) return;
        var box = global.document.getElementById('rhCentralDataNotice');
        if (!box) {
            box = global.document.createElement('div');
            box.id = 'rhCentralDataNotice';
            box.setAttribute('role', 'alert');
            box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;max-width:min(560px,calc(100vw - 32px));padding:12px 16px;border-radius:10px;background:#7f1d1d;color:#fff;font:14px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25)';
            global.document.body.appendChild(box);
        }
        box.textContent = message;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 7000);
    }
    function failure(code, status) {
        var message = code === '40001' ? 'Dữ liệu vừa được thay đổi ở thiết bị khác nên thao tác này chưa được lưu. Hệ thống đang tải lại dữ liệu mới nhất, vui lòng kiểm tra và thực hiện lại.'
            : code === '42501' || status === 401 || status === 403 ? 'Máy chủ từ chối thao tác: tài khoản không có quyền với dữ liệu này hoặc phiên đăng nhập đã hết hạn. Thay đổi chưa được lưu.'
            : code === '23503' || code === '23001' ? 'Không lưu được vì dữ liệu liên kết không hợp lệ hoặc bản ghi vẫn đang được dữ liệu khác sử dụng.'
            : code === '23505' ? 'Dữ liệu trùng với bản ghi đã có trên máy chủ. Thay đổi chưa được lưu.'
            : code === '22023' || code === '23514' || code === '23502' ? 'Dữ liệu gửi lên không hợp lệ nên máy chủ không lưu.'
            : 'Không kết nối được máy chủ dữ liệu. Thay đổi CHƯA được lưu; vui lòng kiểm tra mạng rồi thử lại.';
        var error = new Error(message);
        error.residentHubCentral = true;
        error.code = code || '';
        error.conflict = code === '40001';
        // Modules that catch the error (RHD) mark it handled; otherwise show it once.
        setTimeout(function () { if (!error.handled) showNotice(message); }, 0);
        if (error.conflict) setTimeout(function () { refresh(true); }, 0);
        return error;
    }
    function call(name, args) {
        try { return central.dataRpcSync(name, args); }
        catch (error) { throw failure(error && error.code, error && error.status); }
    }

    // ------------------------------------------------------------- reads/writes
    function read(target, key) {
        if (!state) return Object.prototype.hasOwnProperty.call(scratch, key) ? scratch[key] : null;
        if (target.kind === 'collection') return state.raw[target.name];
        var doc = target.name && state.docs[target.name];
        return doc ? JSON.stringify(doc.value) : null;
    }
    function rowId(row) {
        if (!row || typeof row !== 'object' || Array.isArray(row) || !(typeof row.id === 'string' || typeof row.id === 'number') || String(row.id) === '') {
            throw failure('22023');
        }
        return String(row.id);
    }
    function writeCollection(name, value) {
        var next;
        try { next = normalize(JSON.parse(value)); } catch (_) { throw failure('22023'); }
        if (!Array.isArray(next)) throw failure('22023');
        var before = state.rows[name], versions = state.versions[name];
        var old = Object.create(null), seen = Object.create(null), changes = [];
        before.forEach(function (row) { old[String(row.id)] = row; });
        next.forEach(function (row) {
            var id = rowId(row);
            if (seen[id]) throw failure('22023');
            seen[id] = true;
            if (!old[id]) changes.push({ op: 'upsert', id: id, version: 0, payload: row });
            else if (canonical(old[id]) !== canonical(row)) changes.push({ op: 'upsert', id: id, version: versions[id] || 0, payload: row });
        });
        before.forEach(function (row) {
            var id = String(row.id);
            if (!seen[id]) changes.push({ op: 'delete', id: id, version: versions[id] || 0 });
        });
        if (!changes.length) return;
        var committed = Object.create(null);
        try {
            for (var i = 0; i < changes.length; i += BATCH) {
                (call('rh_data_apply', { p_entity: name, p_changes: changes.slice(i, i + BATCH) }) || []).forEach(function (item) { committed[item.id] = item; });
            }
        } catch (error) {
            // A multi-batch write may have partly committed: reload the truth.
            if (changes.length > BATCH) setTimeout(function () { refresh(true); }, 0);
            throw error;
        }
        var rows = [];
        next.forEach(function (row) {
            var id = String(row.id), item = committed[id];
            if (item && item.op === 'upsert') { versions[id] = item.version; rows.push(item.payload); }
            else rows.push(row);
        });
        changes.forEach(function (change) { if (change.op === 'delete') delete versions[change.id]; });
        state.rows[name] = rows;
        state.raw[name] = JSON.stringify(rows);
        signal();
    }
    function writeDoc(name, value) {
        if (!name) throw failure('42501');
        var parsed;
        try { parsed = normalize(JSON.parse(value)); } catch (_) { throw failure('22023'); }
        var doc = state.docs[name];
        if (doc && canonical(doc.value) === canonical(parsed)) return;
        var result = call('rh_data_save_doc', { p_doc: name, p_value: parsed, p_version: doc ? doc.v : 0 });
        state.docs[name] = { value: parsed, v: result.version };
        signal();
    }
    function write(target, key, value) {
        if (!state) { scratch[key] = value; return; }
        if (target.kind === 'collection') writeCollection(target.name, value);
        else writeDoc(target.name, value);
    }

    // ------------------------------------------------------------- loading
    function install(data) {
        var next = { member: data.member, kind: data.kind, rows: {}, versions: {}, raw: {}, docs: {} };
        COLLECTIONS.forEach(function (name) {
            var list = data.collections[name] || [];
            next.rows[name] = list.map(function (item) { return item.p; });
            next.versions[name] = {};
            list.forEach(function (item) { next.versions[name][String(item.p.id)] = item.v; });
            next.raw[name] = JSON.stringify(next.rows[name]);
        });
        Object.keys(data.docs || {}).forEach(function (name) { next.docs[name] = { value: data.docs[name].value, v: data.docs[name].v }; });
        var previous = state;
        state = next;
        scratch = Object.create(null);
        return previous;
    }
    function announce(previous) {
        Object.keys(KEYS).forEach(function (key) {
            var name = KEYS[key];
            if (previous.raw[name] === state.raw[name]) return;
            try {
                global.dispatchEvent(new global.StorageEvent('storage', { key: key, oldValue: previous.raw[name], newValue: state.raw[name], url: global.location.href, storageArea: global.localStorage }));
            } catch (_) { /* older engines: custom event below still fires */ }
            if (name !== 'activity' && name !== 'notificationCampaigns') {
                global.dispatchEvent(new CustomEvent('residenthub:business-data-changed', { detail: { entity: name, mode: 'live', source: 'central' } }));
            }
        });
    }
    function load() {
        if (loading) return loading;
        loading = central.dataRpc('rh_data_load').then(function (data) {
            if (!data || typeof data.member !== 'string' || !data.collections) throw new Error('Phản hồi dữ liệu không hợp lệ.');
            var previous = install(data);
            lastLoad = Date.now();
            if (previous && previous.member === state.member) announce(previous);
            return { ok: true };
        }).finally(function () { loading = null; });
        return loading;
    }
    function refresh(force) {
        if (!state || !central.getSession()) return Promise.resolve(null);
        if (!force && Date.now() - lastLoad < 15000) return Promise.resolve(null);
        return load().catch(function () { showNotice('Không làm mới được dữ liệu từ máy chủ. Dữ liệu trên màn hình có thể chưa phải bản mới nhất.'); });
    }
    function signal() {
        try { nativeSet.call(global.localStorage, SIGNAL, String(Date.now()) + Math.random()); } catch (_) { /* other tabs refresh on focus */ }
    }

    if (enabled && proto) {
        proto.getItem = function (key) {
            var target = route(this, String(key));
            return target ? read(target, String(key)) : nativeGet.apply(this, arguments);
        };
        proto.setItem = function (key, value) {
            var target = route(this, String(key));
            if (!target) return nativeSet.apply(this, arguments);
            write(target, String(key), String(value));
        };
        proto.removeItem = function (key) {
            var target = route(this, String(key));
            if (!target) return nativeRemove.apply(this, arguments);
            if (!state) { delete scratch[String(key)]; return; }
            throw failure('22023'); // never wipe a shared collection through a key delete
        };
        global.addEventListener('focus', function () { refresh(false); });
        global.addEventListener('storage', function (event) { if (event.key === SIGNAL) refresh(true); });
        global.addEventListener('residenthub:identity-changed', function () {
            if (!central.getSession()) { state = null; scratch = Object.create(null); }
        });
    }

    var ready = !enabled ? Promise.resolve(null) : Promise.resolve(central.ready).then(function () {
        return central.getSession() ? load() : null;
    });
    ready.catch(function () { /* surfaced by auth-page.js */ });

    global.RHCentralData = {
        enabled: enabled,
        ready: ready,
        reload: function () { return enabled ? load() : Promise.resolve(null); },
        status: function () {
            var counts = {};
            if (state) COLLECTIONS.forEach(function (name) { counts[name] = state.rows[name].length; });
            return { enabled: enabled, loaded: !!state, member: state ? state.member : null, kind: state ? state.kind : null, counts: counts, lastLoad: lastLoad ? new Date(lastLoad).toISOString() : null };
        },
        storageKeys: Object.keys(KEYS).concat(['residenthub_live_billingMeta', 'residenthub_settings_v1_<member>', 'residenthub_invoice_module_v1_live_<member>'])
    };
})(window);
