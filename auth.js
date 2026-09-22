/*
 * ResidentHub - shared auth/role module.
 * No backend exists in this project, so accounts and sessions are persisted
 * in localStorage/sessionStorage. This is the single source of truth for
 * users and roles used by: the landing page login/signup modals, the
 * manager dashboard's Settings > "Quản lý tài khoản" screen, and the
 * access guards on the manager/resident pages.
 */
(function (global) {
    var USERS_KEY = 'residenthub_users';
    var SESSION_KEY = 'residenthub_session';
    var CURRENT_USER_KEY = 'residenthub_currentUserId';
    var DATA_KEY = 'residenthub_internal_data';
    var RECOVERY_KEY = 'residenthub_password_recovery';
    var LOGIN_GUARD_KEY = 'residenthub_login_guard';
    var MAX_LOGIN_ATTEMPTS = 5;
    var LOCKOUT_MS = 5 * 60 * 1000;
    var ROLES = { MANAGER: 'manager', RESIDENT: 'resident' };

    function readDataStore() {
        try {
            var raw = localStorage.getItem(DATA_KEY);
            if (!raw) {
                return { users: {} };
            }
            var parsed = JSON.parse(raw);
            return parsed && parsed.users ? parsed : { users: {} };
        } catch (e) {
            return { users: {} };
        }
    }

    function writeDataStore(data) {
        localStorage.setItem(DATA_KEY, JSON.stringify(data));
        try {
            global.dispatchEvent(new CustomEvent('residenthub:data-changed', { detail: data }));
        } catch (e) {
            /* Older browsers can still use the storage event across tabs. */
        }
    }

    function ensureUserContainer(userId) {
        var data = readDataStore();
        if (!data.users) data.users = {};
        if (!data.users[userId]) {
            data.users[userId] = {
                userId: userId,
                requests: [],
                contracts: [],
                invoices: [],
                appointments: [],
                notifications: []
            };
            writeDataStore(data);
        }
        return data.users[userId];
    }

    function genInternalId(prefix) {
        return (prefix || 'item') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }

    function getUserData(userId) {
        return ensureUserContainer(userId);
    }

    function getRequestsForUser(userId) {
        return (getUserData(userId) || { requests: [] }).requests;
    }

    function getContractsForUser(userId) {
        return (getUserData(userId) || { contracts: [] }).contracts;
    }

    function getInvoicesForUser(userId) {
        return (getUserData(userId) || { invoices: [] }).invoices;
    }

    function getAppointmentsForUser(userId) {
        return (getUserData(userId) || { appointments: [] }).appointments;
    }

    function getNotificationsForUser(userId) {
        return (getUserData(userId) || { notifications: [] }).notifications;
    }

    function createRecordForUser(userId, collection, payload) {
        var userData = getUserData(userId);
        var data = readDataStore();
        if (!data.users) data.users = {};
        data.users[userId] = userData;
        var records = Array.isArray(userData[collection]) ? userData[collection] : [];
        var record = Object.assign({
            id: payload && payload.id ? payload.id : genInternalId(collection.charAt(0).toUpperCase() + collection.slice(1, 4)),
            userId: userId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }, payload || {});
        records.unshift(record);
        userData[collection] = records;
        data.users[userId] = userData;
        writeDataStore(data);
        return { ok: true, item: record };
    }

    function createRequestForUser(userId, payload) {
        var title = String((payload && payload.title) || '').trim();
        var description = String((payload && payload.description) || '').trim();
        if (!title || !description) {
            return { ok: false, error: 'Vui lòng nhập tiêu đề và mô tả.' };
        }
        var result = createRecordForUser(userId, 'requests', {
            id: payload && payload.id ? payload.id : genInternalId('REQ'),
            title: title,
            type: payload && payload.type ? payload.type : 'Sửa chữa căn hộ',
            subType: payload && payload.subType ? payload.subType : '',
            priority: payload && payload.priority ? payload.priority : 'normal',
            status: payload && payload.status ? payload.status : 'processing',
            date: payload && payload.date ? payload.date : new Date().toLocaleDateString('vi-VN'),
            time: payload && payload.time ? payload.time : new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            description: description,
            location: payload && payload.location ? payload.location : '',
            assignee: payload && payload.assignee ? payload.assignee : 'Đang phân công',
            expected: payload && payload.expected ? payload.expected : 'Chưa xác định',
            step: payload && payload.step ? payload.step : 2,
            attachments: Number(payload && payload.attachments ? payload.attachments : 0),
            messages: Array.isArray(payload && payload.messages) ? payload.messages : [],
            cost: payload && payload.cost ? payload.cost : ''
        });
        if (result.ok) {
            createNotificationForUser(userId, {
                type: 'REQUEST',
                subType: 'REQUEST_CREATED',
                title: 'Yêu cầu mới đã được gửi',
                body: 'Yêu cầu "' + result.item.title + '" đang chờ ban quản lý tiếp nhận.',
                refType: 'request',
                refId: result.item.id,
                actionUrl: 'requests',
                actionLabel: 'Xem yêu cầu'
            });
        }
        return result;
    }

    function createNotificationForUser(userId, payload) {
        var title = String((payload && payload.title) || '').trim();
        if (!title) {
            return { ok: false, error: 'Vui lòng nhập tiêu đề thông báo.' };
        }
        return createRecordForUser(userId, 'notifications', {
            id: payload && payload.id ? payload.id : genInternalId('NT'),
            type: payload && payload.type ? payload.type : 'ANNOUNCEMENT',
            subType: payload && payload.subType ? payload.subType : 'NOTICE',
            title: title,
            body: payload && payload.body ? payload.body : '',
            priority: payload && payload.priority ? payload.priority : 'NORMAL',
            refType: payload && payload.refType ? payload.refType : 'notifications',
            refId: payload && payload.refId ? payload.refId : '',
            actionUrl: payload && payload.actionUrl ? payload.actionUrl : 'notifications',
            actionLabel: payload && payload.actionLabel ? payload.actionLabel : 'Xem thông báo',
            isRead: !!(payload && payload.isRead),
            isPinned: !!(payload && payload.isPinned),
            isArchived: !!(payload && payload.isArchived),
            group: payload && payload.group ? payload.group : 'Hôm nay',
            time: payload && payload.time ? payload.time : new Date().toLocaleDateString('vi-VN'),
            tags: Array.isArray(payload && payload.tags) ? payload.tags : [],
            attachments: Array.isArray(payload && payload.attachments) ? payload.attachments : []
        });
    }

    function createContractForUser(userId, payload) {
        var id = payload && payload.id ? payload.id : genInternalId('HD');
        return createRecordForUser(userId, 'contracts', Object.assign({
            id: id,
            code: id,
            status: 'draft',
            startDate: new Date().toISOString().slice(0, 10),
            endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            noticeDays: 30,
            rentAmount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }, payload || {}));
    }

    function createInvoiceForUser(userId, payload) {
        var code = (payload && payload.code) ? payload.code : genInternalId('INV');
        return createRecordForUser(userId, 'invoices', Object.assign({
            id: payload && payload.id ? payload.id : genInternalId('INV'),
            code: code,
            status: 'pending',
            amount: 0,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            createdAt: Date.now(),
            updatedAt: Date.now()
        }, payload || {}));
    }

    function updateRequestForUser(userId, requestId, patch) {
        var data = readDataStore();
        var userData = data.users && data.users[userId];
        if (!userData || !Array.isArray(userData.requests)) return { ok: false, error: 'Không tìm thấy dữ liệu yêu cầu.' };
        for (var i = 0; i < userData.requests.length; i++) {
            if (userData.requests[i].id === requestId) {
                userData.requests[i] = Object.assign({}, userData.requests[i], patch, {
                    updatedAt: Date.now()
                });
                data.users[userId] = userData;
                writeDataStore(data);
                if (patch && (patch.status || patch.messages || patch.assignee || patch.step)) {
                    createNotificationForUser(userId, {
                        type: 'REQUEST',
                        subType: 'REQUEST_UPDATED',
                        title: 'Yêu cầu đã được cập nhật',
                        body: patch.status ? 'Trạng thái yêu cầu đã chuyển sang ' + patch.status + '.' : 'Ban quản lý đã phản hồi yêu cầu của bạn.',
                        refType: 'request',
                        refId: requestId,
                        actionUrl: 'requests',
                        actionLabel: 'Xem yêu cầu'
                    });
                }
                return { ok: true, item: userData.requests[i] };
            }
        }
        return { ok: false, error: 'Không tìm thấy yêu cầu.' };
    }

    function updateNotificationForUser(userId, notificationId, patch) {
        var data = readDataStore();
        var userData = data.users && data.users[userId];
        if (!userData || !Array.isArray(userData.notifications)) return { ok: false, error: 'Không tìm thấy thông báo.' };
        var index = userData.notifications.findIndex(function (item) { return item.id === notificationId; });
        if (index === -1) return { ok: false, error: 'Không tìm thấy thông báo.' };
        userData.notifications[index] = Object.assign({}, userData.notifications[index], patch, { updatedAt: Date.now() });
        data.users[userId] = userData;
        writeDataStore(data);
        return { ok: true, item: userData.notifications[index] };
    }

    function managerStore(store) {
        try {
            var mode = global.RHDB_MODE || 'live';
            var raw = localStorage.getItem('rh_db_' + mode + '_' + store);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function usersForManagerRecord(record) {
        if (!record) return [];
        var customers = managerStore('customers');
        var customer = customers.filter(function (item) { return item.id === record.customerId; })[0];
        var apartments = managerStore('apartments');
        var apartment = apartments.filter(function (item) { return item.id === record.apartmentId; })[0];
        var normalize = function (value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
        var users = readUsers();
        return users.filter(function (user) {
            return user.role === ROLES.RESIDENT && (
                (record.userId && user.id === record.userId) ||
                (customer && customer.userId && user.id === customer.userId) ||
                (customer && customer.email && user.email && customer.email.toLowerCase() === user.email.toLowerCase()) ||
                (apartment && normalize(apartment.name) === normalize(user.unit))
            );
        });
    }

    function syncManagerRecord(record, kind) {
        var targets = usersForManagerRecord(record);
        targets.forEach(function (user) {
            var collection = kind === 'contract' ? 'contracts' : 'invoices';
            var existing = getUserData(user.id)[collection].filter(function (item) {
                return item.managerRecordId === record.id || item.id === record.id;
            })[0];
            var data = readDataStore();
            var userData = data.users[user.id] || ensureUserContainer(user.id);
            userData[collection] = Array.isArray(userData[collection]) ? userData[collection] : [];
            var mapped = Object.assign({}, record, { managerRecordId: record.id, userId: user.id });
            if (existing) {
                userData[collection] = userData[collection].map(function (item) { return item.id === existing.id ? Object.assign({}, item, mapped) : item; });
            } else {
                userData[collection].unshift(mapped);
            }
            data.users[user.id] = userData;
            writeDataStore(data);
            createNotificationForUser(user.id, {
                type: kind === 'contract' ? 'CONTRACT' : 'BILLING',
                subType: kind === 'contract' ? 'CONTRACT_UPDATED' : 'INVOICE_UPDATED',
                title: kind === 'contract' ? 'Hợp đồng đã được cập nhật' : 'Hóa đơn mới đã được cập nhật',
                body: kind === 'contract' ? 'Ban quản lý đã cập nhật hợp đồng của bạn.' : 'Ban quản lý đã tạo hoặc cập nhật hóa đơn của bạn.',
                refType: kind === 'contract' ? 'contract' : 'invoice',
                refId: record.id,
                actionUrl: kind === 'contract' ? 'contracts' : 'invoices',
                actionLabel: kind === 'contract' ? 'Xem hợp đồng' : 'Xem hóa đơn'
            });
        });
        return { ok: true, count: targets.length };
    }

    function syncManagerNotification(record) {
        var targets = usersForManagerRecord(record);
        targets.forEach(function (user) {
            createNotificationForUser(user.id, {
                type: ({ info: 'ANNOUNCEMENT', announcement: 'ANNOUNCEMENT', billing: 'BILLING', request: 'REQUEST', contract: 'CONTRACT' }[String(record.type || '').toLowerCase()] || String(record.type || 'ANNOUNCEMENT').toUpperCase()),
                subType: 'MANAGER_MESSAGE',
                title: record.title || 'Thông báo từ ban quản lý',
                body: record.body || '',
                refType: record.refType || 'notifications',
                refId: record.id || '',
                actionUrl: record.actionUrl || 'notifications',
                actionLabel: record.actionLabel || 'Xem thông báo'
            });
        });
        return { ok: true, count: targets.length };
    }

    function deleteRequestForUser(userId, requestId) {
        var data = readDataStore();
        var userData = data.users && data.users[userId];
        if (!userData || !Array.isArray(userData.requests)) return { ok: false, error: 'Không tìm thấy dữ liệu yêu cầu.' };
        var beforeLength = userData.requests.length;
        userData.requests = userData.requests.filter(function (request) { return request.id !== requestId; });
        if (userData.requests.length === beforeLength) {
            return { ok: false, error: 'Không tìm thấy yêu cầu cần xóa.' };
        }
        data.users[userId] = userData;
        writeDataStore(data);
        return { ok: true };
    }

    function getCurrentUserId() {
        try {
            var session = sessionStorage.getItem(CURRENT_USER_KEY) || localStorage.getItem(CURRENT_USER_KEY);
            return session || null;
        } catch (e) {
            return null;
        }
    }

    function readUsers() {
        try {
            var raw = localStorage.getItem(USERS_KEY);
            var parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return [];
            var changed = false;
            var users = parsed.map(function (user) {
                var normalized = normalizeUserRecord(user);
                if (!normalized) return null;
                if (JSON.stringify(normalized) !== JSON.stringify(user)) changed = true;
                return normalized;
            }).filter(Boolean);
            if (changed || users.length !== parsed.length) writeUsers(users);
            return users;
        } catch (e) {
            return [];
        }
    }

    function writeUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    function normalizeEmail(value) {
        return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    }

    function normalizeUserRecord(user) {
        if (!user || typeof user !== 'object') return null;
        var normalized = Object.assign({}, user);
        normalized.id = String(normalized.id || normalized.userId || '').trim();
        normalized.name = String(normalized.name || '').trim();
        normalized.email = normalizeEmail(normalized.email || normalized.username || normalized.userEmail);
        if (!normalized.password && normalized.pass) normalized.password = normalized.pass;
        normalized.role = normalized.role === ROLES.RESIDENT ? ROLES.RESIDENT : ROLES.MANAGER;
        normalized.unit = String(normalized.unit || '').trim();
        normalized.status = ['inactive', 'locked'].indexOf(normalized.status) !== -1 ? normalized.status : 'active';
        return normalized.id && normalized.email && normalized.password ? normalized : null;
    }

    function seedIfEmpty() {
        var users = readUsers();
        if (users.length > 0) return;
        users = [
            {
                id: 'u-manager-1',
                name: 'Nguyễn Văn An',
                email: 'manager@residenthub.vn',
                password: 'Manager@123',
                role: ROLES.MANAGER,
                unit: '',
                createdAt: Date.now()
            },
            {
                id: 'u-resident-1',
                name: 'Hương Nguyễn',
                email: 'resident@residenthub.vn',
                password: 'Resident@123',
                role: ROLES.RESIDENT,
                unit: 'A-1208',
                createdAt: Date.now()
            }
        ];
        writeUsers(users);
    }

    function findUserByEmail(email) {
        var normalized = normalizeEmail(email);
        var users = readUsers();
        for (var i = 0; i < users.length; i++) {
            if (normalizeEmail(users[i].email) === normalized) return users[i];
        }
        return null;
    }

    function usersForLogin(identifier) {
        var normalized = normalizeEmail(identifier);
        var name = String(identifier || '').trim().toLowerCase();
        return readUsers().filter(function (user) {
            return normalizeEmail(user.email) === normalized || String(user.name || '').trim().toLowerCase() === name;
        });
    }

    function createUser(data) {
        var name = String(data.name || '').trim();
        var email = normalizeEmail(data.email);
        var password = String(data.password || '');
        var role = data.role === ROLES.RESIDENT ? ROLES.RESIDENT : ROLES.MANAGER;

        if (!name || !email || !password) {
            return { ok: false, error: 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu.' };
        }
        if (password.length < 6) {
            return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
        }
        if (findUserByEmail(email)) {
            return { ok: false, error: 'Email này đã được sử dụng cho một tài khoản khác.' };
        }

        var user = {
            id: 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            name: name,
            email: email,
            password: password,
            role: role,
            status: 'active',
            unit: data.unit ? String(data.unit).trim() : '',
            plan: data.plan || null,
            planStatus: data.plan ? 'active' : null,
            createdAt: Date.now()
        };
        var users = readUsers();
        users.push(user);
        writeUsers(users);
        return { ok: true, user: user };
    }

    function updateUser(id, patch) {
        var users = readUsers();
        var index = -1;
        for (var i = 0; i < users.length; i++) {
            if (users[i].id === id) { index = i; break; }
        }
        if (index === -1) return { ok: false, error: 'Không tìm thấy tài khoản.' };

        if (patch.email) {
            var existing = findUserByEmail(patch.email);
            if (existing && existing.id !== id) {
                return { ok: false, error: 'Email này đã được sử dụng cho một tài khoản khác.' };
            }
        }
        if (patch.password !== undefined && patch.password !== '' && patch.password.length < 6) {
            return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
        }

        var user = users[index];
        if (patch.name !== undefined) user.name = String(patch.name).trim();
        if (patch.email !== undefined) user.email = normalizeEmail(patch.email);
        if (patch.role !== undefined) user.role = patch.role === ROLES.RESIDENT ? ROLES.RESIDENT : ROLES.MANAGER;
        if (patch.unit !== undefined) user.unit = String(patch.unit).trim();
        if (patch.password) user.password = patch.password;

        users[index] = user;
        writeUsers(users);

        var session = getSession();
        if (session && session.id === id) {
            login(user, isRemembered());
        }
        return { ok: true, user: user };
    }

    function deleteUser(id) {
        var session = getSession();
        if (session && session.id === id) {
            return { ok: false, error: 'Bạn không thể xoá tài khoản đang đăng nhập.' };
        }
        var users = readUsers();
        var next = users.filter(function (u) { return u.id !== id; });
        if (next.length === users.length) {
            return { ok: false, error: 'Không tìm thấy tài khoản.' };
        }
        var remainingManagers = next.filter(function (u) { return u.role === ROLES.MANAGER; });
        var removed = users.filter(function (u) { return u.id === id; })[0];
        if (removed && removed.role === ROLES.MANAGER && remainingManagers.length === 0) {
            return { ok: false, error: 'Phải có ít nhất một tài khoản Quản lý trong hệ thống.' };
        }
        writeUsers(next);
        return { ok: true };
    }

    function authenticate(email, password) {
        var result = authenticateDetailed(email, password);
        return result.ok ? result.user : null;
    }

    function readLoginGuard() {
        try { return JSON.parse(localStorage.getItem(LOGIN_GUARD_KEY) || '{}'); } catch (e) { return {}; }
    }

    function writeLoginGuard(guard) {
        localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(guard));
    }

    function authenticateDetailed(identifier, password) {
        var candidates = usersForLogin(identifier);
        var guard = readLoginGuard();
        var guardKey = normalizeEmail(identifier);
        var lockedUntil = Number(guard[guardKey] && guard[guardKey].lockedUntil || 0);
        if (lockedUntil > Date.now()) return { ok: false, reason: 'rate_limited', retryAfter: lockedUntil };
        if (lockedUntil) delete guard[guardKey];
        var user = null;
        for (var i = 0; i < candidates.length; i++) {
            if (String(candidates[i].password) === String(password || '')) { user = candidates[i]; break; }
        }
        if (!user) {
            var attempt = guard[guardKey] || { count: 0 };
            attempt.count += 1;
            if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
                attempt.count = 0;
                attempt.lockedUntil = Date.now() + LOCKOUT_MS;
            }
            guard[guardKey] = attempt;
            writeLoginGuard(guard);
            return { ok: false, reason: attempt.lockedUntil ? 'rate_limited' : 'invalid' };
        }
        delete guard[guardKey];
        writeLoginGuard(guard);
        if (user.status === 'locked') return { ok: false, reason: 'locked' };
        if (user.status === 'inactive') return { ok: false, reason: 'inactive' };
        return { ok: true, user: user };
    }

    function requestPasswordRecovery(email) {
        var user = findUserByEmail(email);
        if (!user) return { ok: false, error: 'Không tìm thấy tài khoản phù hợp.' };
        var token = Math.random().toString(36).slice(2, 8).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
        var recovery = { userId: user.id, token: token, expiresAt: Date.now() + 15 * 60 * 1000 };
        localStorage.setItem(RECOVERY_KEY, JSON.stringify(recovery));
        return { ok: true, token: token, expiresAt: recovery.expiresAt, localOnly: true };
    }

    function resetPassword(token, password) {
        var recovery;
        try { recovery = JSON.parse(localStorage.getItem(RECOVERY_KEY) || 'null'); } catch (e) { recovery = null; }
        if (!recovery || recovery.token !== String(token || '').trim().toUpperCase() || recovery.expiresAt < Date.now()) {
            return { ok: false, error: 'Mã khôi phục không hợp lệ hoặc đã hết hạn.' };
        }
        if (String(password || '').length < 6) return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
        var result = updateUser(recovery.userId, { password: String(password) });
        if (result.ok) localStorage.removeItem(RECOVERY_KEY);
        return result;
    }

    function isRemembered() {
        return !!localStorage.getItem(SESSION_KEY);
    }

    function login(user, remember) {
        var session = { id: user.id, name: user.name, email: user.email, role: user.role, unit: user.unit || '', loginAt: Date.now(), currentUserId: user.id };
        var data = JSON.stringify(session);
        if (remember) {
            localStorage.setItem(SESSION_KEY, data);
            sessionStorage.removeItem(SESSION_KEY);
            localStorage.setItem(CURRENT_USER_KEY, user.id);
            sessionStorage.removeItem(CURRENT_USER_KEY);
        } else {
            sessionStorage.setItem(SESSION_KEY, data);
            localStorage.removeItem(SESSION_KEY);
            sessionStorage.setItem(CURRENT_USER_KEY, user.id);
            localStorage.removeItem(CURRENT_USER_KEY);
        }
        ensureUserContainer(user.id);
        return session;
    }

    function getSession() {
        try {
            var raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            var session = JSON.parse(raw);
            var user = readUsers().filter(function (item) { return item.id === session.id; })[0];
            if (!user) {
                logout();
                return null;
            }
            return Object.assign({}, session, {
                name: user.name,
                email: user.email,
                role: user.role,
                unit: user.unit || '',
                currentUserId: user.id
            });
        } catch (e) {
            return null;
        }
    }

    function logout() {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(CURRENT_USER_KEY);
        localStorage.removeItem(CURRENT_USER_KEY);
    }

    // Blocks unauthorized access to a role-restricted page. Must be called
    // synchronously at the very top of <body>, before any protected markup,
    // so an unauthorized visitor never sees a flash of the page contents.
    function requireRole(role) {
        var session = getSession();
        if (!session) {
            global.location.replace('index.html?authRequired=1');
            return null;
        }
        if (session.role !== role) {
            var target = session.role === ROLES.MANAGER ? 'dashboard.html' : 'resident-web.html';
            global.location.replace(target + '?denied=1');
            return null;
        }
        return session;
    }

    seedIfEmpty();

    global.RH = {
        ROLES: ROLES,
        getUsers: readUsers,
        findUserByEmail: findUserByEmail,
        createUser: createUser,
        updateUser: updateUser,
        deleteUser: deleteUser,
        authenticate: authenticate,
        authenticateDetailed: authenticateDetailed,
        requestPasswordRecovery: requestPasswordRecovery,
        resetPassword: resetPassword,
        login: login,
        logout: logout,
        getSession: getSession,
        requireRole: requireRole,
        getUserData: getUserData,
        getCurrentUserId: getCurrentUserId,
        getRequestsForUser: getRequestsForUser,
        getContractsForUser: getContractsForUser,
        getInvoicesForUser: getInvoicesForUser,
        getAppointmentsForUser: getAppointmentsForUser,
        getNotificationsForUser: getNotificationsForUser,
        createRequestForUser: createRequestForUser,
        createNotificationForUser: createNotificationForUser,
        createContractForUser: createContractForUser,
        createInvoiceForUser: createInvoiceForUser,
        syncManagerRecord: syncManagerRecord,
        syncManagerNotification: syncManagerNotification,
        updateNotificationForUser: updateNotificationForUser,
        updateRequestForUser: updateRequestForUser,
        deleteRequestForUser: deleteRequestForUser
    };
})(window);
