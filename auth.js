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
    var ACCOUNT_REQUESTS_KEY = 'residenthub_account_requests';
    var MAX_LOGIN_ATTEMPTS = 5;
    var LOCKOUT_MS = 5 * 60 * 1000;
    var ROLES = { MANAGER: 'manager', RESIDENT: 'resident', STAFF: 'staff' };
    var REQUEST_STATUSES = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' };

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
        var campaignId = payload && payload.campaignId;
        if (campaignId) {
            var existing = getNotificationsForUser(userId).find(function (item) {
                return String(item.campaignId || '') === String(campaignId);
            });
            if (existing) return { ok: true, item: existing };
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
            campaignId: payload && payload.campaignId ? payload.campaignId : '',
            audience: payload && payload.audience ? payload.audience : 'all',
            audienceName: payload && payload.audienceName ? payload.audienceName : '',
            recipientCount: Number(payload && payload.recipientCount) || 0,
            status: payload && payload.status ? payload.status : 'sent',
            scheduledAt: payload && payload.scheduledAt ? payload.scheduledAt : '',
            createdBy: payload && payload.createdBy ? payload.createdBy : '',
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
        if (global.RHD && typeof global.RHD.list === 'function') {
            return global.RHD.list(store) || [];
        }
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
        if (global.RHD && typeof global.RHD.mode === 'function' && global.RHD.mode() === 'demo') return [];
        var customers = managerStore('customers');
        var customer = customers.filter(function (item) { return item.id === record.customerId; })[0];
        var apartments = managerStore('apartments');
        var apartment = apartments.filter(function (item) { return item.id === record.apartmentId; })[0];
        var normalize = function (value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
        var users = readUsers();
        var buildings = managerStore('buildings');
        var building = apartment && buildings.filter(function (item) { return item.id === apartment.buildingId; })[0];
        var legacyUnitUsers = [];
        if (apartment && !apartments.some(function (item) { return item.id !== apartment.id && normalize(item.name) === normalize(apartment.name); })) {
            legacyUnitUsers = users.filter(function (user) {
                if (user.role !== ROLES.RESIDENT || user.apartmentId || normalize(user.unit) !== normalize(apartment.name)) return false;
                if (user.building && [apartment.buildingId, building && building.shortName, building && building.name].every(function (value) { return normalize(value) !== normalize(user.building); })) return false;
                return true;
            });
            if (legacyUnitUsers.length !== 1) legacyUnitUsers = [];
        }
        return users.filter(function (user) {
            if (user.role !== ROLES.RESIDENT) return false;
            if (record.userId && user.id === record.userId) return true;
            if (user.apartmentId && record.apartmentId && user.apartmentId !== record.apartmentId) return false;
            if (customer && ((customer.userId && user.id === customer.userId) || (user.residentId && user.residentId === customer.id))) return true;
            if (user.apartmentId && record.apartmentId && user.apartmentId === record.apartmentId) return true;
            if (customer && customer.email && user.email && customer.email.toLowerCase() === user.email.toLowerCase()) return true;
            return legacyUnitUsers.indexOf(user) !== -1;
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
            var changed = !existing || JSON.stringify(existing) !== JSON.stringify(mapped);
            if (existing) {
                userData[collection] = userData[collection].map(function (item) { return item.id === existing.id ? Object.assign({}, item, mapped) : item; });
            } else {
                userData[collection].unshift(mapped);
            }
            data.users[user.id] = userData;
            writeDataStore(data);
            if (changed) {
                var notificationPayload = global.RHGeneralSettings ? global.RHGeneralSettings.prepareRecordNotice(record, kind, user) : {
                    type: kind === 'contract' ? 'CONTRACT' : 'BILLING',
                    subType: kind === 'contract' ? 'CONTRACT_UPDATED' : 'INVOICE_UPDATED',
                    title: kind === 'contract' ? 'Hợp đồng đã được cập nhật' : 'Hóa đơn mới đã được cập nhật',
                    body: kind === 'contract' ? 'Ban quản lý đã cập nhật hợp đồng của bạn.' : 'Ban quản lý đã tạo hoặc cập nhật hóa đơn của bạn.',
                    refType: kind === 'contract' ? 'contract' : 'invoice',
                    refId: record.id,
                    actionUrl: kind === 'contract' ? 'contracts' : 'invoices',
                    actionLabel: kind === 'contract' ? 'Xem hợp đồng' : 'Xem hóa đơn'
                };
                if (notificationPayload) createNotificationForUser(user.id, notificationPayload);
            }
        });
        return { ok: true, count: targets.length };
    }

    function syncResidentApartmentRecords(user) {
        if (!user || user.role !== ROLES.RESIDENT || !user.apartmentId || !global.RHD || global.RHD.mode() === 'demo') return;
        var contracts = managerStore('contracts').filter(function (contract) {
            return contract.apartmentId === user.apartmentId && contract.status !== 'ended' && contract.status !== 'terminated' && contract.status !== 'expired';
        });
        contracts.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        if (!contracts.length && user.residentId && global.RHD) {
            var apartment = global.RHD.get('apartments', user.apartmentId);
            var building = apartment && global.RHD.get('buildings', apartment.buildingId);
            var customer = global.RHD.get('customers', user.residentId);
            if (apartment && customer) {
                var start = new Date();
                var startDate = [start.getFullYear(), String(start.getMonth() + 1).padStart(2, '0'), String(start.getDate()).padStart(2, '0')].join('-');
                var end = new Date(start.getFullYear(), start.getMonth(), start.getDate());
                end.setFullYear(end.getFullYear() + 1);
                var endDate = [end.getFullYear(), String(end.getMonth() + 1).padStart(2, '0'), String(end.getDate()).padStart(2, '0')].join('-');
                var draft = global.RHD.create('contracts', {
                    code: global.RHD.nextContractCode && building ? global.RHD.nextContractCode(building, apartment) : 'HD-' + Date.now(),
                    buildingId: apartment.buildingId,
                    apartmentId: apartment.id,
                    customerId: customer.id,
                    startDate: startDate,
                    endDate: endDate,
                    signDate: '',
                    noticeDays: 30,
                    rentPrice: Number(apartment.rentPrice) || 0,
                    depositPrice: Number(apartment.depositPrice) || 0,
                    paymentCycle: 'monthly',
                    files: [],
                    status: 'draft',
                    note: 'Bản nháp được tạo khi duyệt tài khoản cư dân; ban quản lý cần rà soát và xác nhận trước khi ký.'
                });
                if (draft && draft.ok) contracts.push(draft.item);
            }
        }
        if (!contracts.length) return;
        var customerContracts = user.residentId ? contracts.filter(function (contract) { return contract.customerId === user.residentId; }) : [];
        var currentContract = customerContracts[0] || contracts[0];
        var linkedContracts = contracts.filter(function (contract) { return contract.customerId === currentContract.customerId; });
        var linkedContractIds = {};
        linkedContracts.forEach(function (contract) { linkedContractIds[contract.id] = true; });
        var invoices = managerStore('invoices').filter(function (invoice) {
            if (invoice.apartmentId !== user.apartmentId) return false;
            if (invoice.contractId) return !!linkedContractIds[invoice.contractId];
            return invoice.customerId === currentContract.customerId;
        });
        var linkedInvoiceIds = {};
        invoices.forEach(function (invoice) { linkedInvoiceIds[invoice.id] = true; });
        var data = readDataStore();
        var userData = data.users && data.users[user.id];
        if (userData) {
            ['contracts', 'invoices'].forEach(function (collection) {
                var allowed = collection === 'contracts' ? linkedContractIds : linkedInvoiceIds;
                userData[collection] = (userData[collection] || []).filter(function (record) {
                    return !record.managerRecordId || !!allowed[record.managerRecordId];
                });
            });
            data.users[user.id] = userData;
            writeDataStore(data);
        }
        linkedContracts.forEach(function (contract) { syncManagerRecord(contract, 'contract'); });
        invoices.forEach(function (invoice) { syncManagerRecord(invoice, 'invoice'); });
    }

    function removeManagerRecord(record, kind) {
        if (!record) return { ok: false, count: 0 };
        var collection = kind === 'contract' ? 'contracts' : 'invoices';
        var removed = 0;
        usersForManagerRecord(record).forEach(function (user) {
            var data = readDataStore();
            var userData = data.users && data.users[user.id];
            if (!userData || !Array.isArray(userData[collection])) return;
            var records = userData[collection];
            userData[collection] = records.filter(function (item) {
                var matches = item.managerRecordId === record.id || item.id === record.id;
                if (matches) removed++;
                return !matches;
            });
            if (userData[collection].length !== records.length) {
                data.users[user.id] = userData;
                writeDataStore(data);
            }
        });
        return { ok: true, count: removed };
    }

    function syncManagerNotification(record) {
        var targets = usersForManagerRecord(record);
        targets.forEach(function (user) {
            var message = global.RHGeneralSettings ? global.RHGeneralSettings.prepareSupport(record, user) : record;
            if (!message) return;
            createNotificationForUser(user.id, {
                type: ({ info: 'ANNOUNCEMENT', announcement: 'ANNOUNCEMENT', billing: 'BILLING', request: 'REQUEST', contract: 'CONTRACT' }[String(message.type || '').toLowerCase()] || String(message.type || 'ANNOUNCEMENT').toUpperCase()),
                subType: 'MANAGER_MESSAGE',
                campaignId: message.campaignId || '',
                title: message.title || 'Thông báo từ ban quản lý',
                body: message.body || '',
                refType: message.refType || 'notifications',
                refId: message.id || '',
                actionUrl: message.actionUrl || 'notifications',
                actionLabel: message.actionLabel || 'Xem thông báo'
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

    function normalizeRole(value) {
        return [ROLES.MANAGER, ROLES.RESIDENT, ROLES.STAFF].indexOf(value) !== -1 ? value : ROLES.MANAGER;
    }

    function normalizeUserRecord(user) {
        if (!user || typeof user !== 'object') return null;
        var normalized = Object.assign({}, user);
        normalized.id = String(normalized.id || normalized.userId || '').trim();
        normalized.name = String(normalized.name || '').trim();
        normalized.email = normalizeEmail(normalized.email || normalized.username || normalized.userEmail);
        if (!normalized.password && normalized.pass) normalized.password = normalized.pass;
        normalized.role = normalizeRole(normalized.role);
        normalized.unit = String(normalized.unit || '').trim();
        normalized.building = String(normalized.building || '').trim();
        normalized.floor = String(normalized.floor || '').trim();
        normalized.phone = String(normalized.phone || '').trim();
        normalized.accountTypeId = String(normalized.accountTypeId || '').trim();
        normalized.allBuildings = normalized.allBuildings === true;
        normalized.buildingIds = Array.isArray(normalized.buildingIds)
            ? normalized.buildingIds.map(function (id) { return String(id || '').trim(); }).filter(function (id, index, ids) { return id && ids.indexOf(id) === index; })
            : [];
        normalized.department = String(normalized.department || '').trim();
        normalized.title = String(normalized.title || '').trim();
        normalized.employeeCode = String(normalized.employeeCode || '').trim();
        // Links a resident login account to its Resident Profile (RHD customer,
        // see data.js). Set once, at account-request approval time, and never
        // re-derived — this is the account's identity link, not a display cache.
        normalized.residentId = String(normalized.residentId || '').trim();
        normalized.avatar = normalized.avatar || '';
        normalized.status = ['inactive', 'locked'].indexOf(normalized.status) !== -1 ? normalized.status : 'active';
        return normalized.id && normalized.email && normalized.password ? normalized : null;
    }

    function seedIfEmpty() {
        var users = readUsers();
        if (users.length > 0) return;
        // No seeded resident login account: residents only ever get an active
        // account through the registration-request + manager-approval flow
        // (see submitAccountRequest/approveAccountRequest below), never mocked in.
        users = [
            {
                id: 'u-manager-1',
                name: 'Nguyễn Văn An',
                email: 'manager@residenthub.vn',
                password: 'Manager@123',
                role: ROLES.MANAGER,
                unit: '',
                createdAt: Date.now()
            }
        ];
        writeUsers(users);
    }

    function seedDemoStaffAccount() {
        var email = 'staff.demo@residenthub.test';
        var users = readUsers();
        var index = users.findIndex(function (user) { return normalizeEmail(user.email) === email; });
        var user = index === -1 ? {
            id: 'u-staff-demo',
            createdAt: Date.now()
        } : users[index];
        var before = JSON.stringify(user);
        user.name = 'Nguyễn Minh Anh';
        user.email = email;
        user.password = 'StaffDemo@2026';
        user.role = ROLES.STAFF;
        user.status = 'active';
        if (index === -1) users.push(user);
        else users[index] = user;
        if (index === -1 || JSON.stringify(user) !== before) writeUsers(users);
    }

    function seedDemoResidentAccount() {
        var email = 'resident.demo@residenthub.test';
        var users = readUsers();
        var index = users.findIndex(function (user) { return normalizeEmail(user.email) === email; });
        var user = index === -1 ? {
            id: 'u-resident-demo',
            createdAt: Date.now()
        } : users[index];
        var before = JSON.stringify(user);
        user.name = 'Cư dân Demo';
        user.email = email;
        user.password = 'ResidentDemo@2026';
        user.role = ROLES.RESIDENT;
        user.status = 'active';
        user.unit = user.unit || '';
        user.apartmentId = user.apartmentId || '';
        user.residentId = user.residentId || '';
        if (index === -1) users.push(user);
        else users[index] = user;
        if (index === -1 || JSON.stringify(user) !== before) writeUsers(users);
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

    function createUserRecord(data) {
        var name = String(data.name || '').trim();
        var email = normalizeEmail(data.email);
        var password = String(data.password || '');
        var role = normalizeRole(data.role);

        if (!name || !email || !password) {
            return { ok: false, error: 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu.' };
        }
        if (password.length < 6) {
            return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
        }
        if (findUserByEmail(email)) {
            return { ok: false, error: 'Email này đã được sử dụng cho một tài khoản khác.' };
        }
        var residentId = String(data.residentId || '').trim();
        var apartmentId = String(data.apartmentId || '').trim();
        if (role === ROLES.RESIDENT) {
            if (residentId && readUsers().some(function (user) { return user.role === ROLES.RESIDENT && user.residentId === residentId; })) {
                return { ok: false, error: 'Hồ sơ cư dân này đã được liên kết với một tài khoản khác.' };
            }
            var apartment = global.RHD && apartmentId ? global.RHD.get('apartments', apartmentId) : null;
            if (!residentId || !global.RHD || !global.RHD.get('customers', residentId) || !apartment) {
                return { ok: false, error: 'Vui lòng liên kết hồ sơ cư dân và căn hộ hợp lệ.' };
            }
            if (global.RHP && !global.RHP.inScope(apartment.buildingId)) {
                return { ok: false, error: 'Căn hộ nằm ngoài phạm vi tòa nhà bạn được quản lý.' };
            }
        }

        var user = {
            id: 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            name: name,
            email: email,
            password: password,
            role: role,
            status: ['active', 'inactive', 'locked'].indexOf(data.status) !== -1 ? data.status : 'active',
            accountTypeId: String(data.accountTypeId || (role === ROLES.RESIDENT && global.RHP ? global.RHP.RESIDENT_TYPE_ID : '') || '').trim(),
            allBuildings: role === ROLES.MANAGER && data.allBuildings === true,
            buildingIds: role === ROLES.MANAGER && Array.isArray(data.buildingIds)
                ? data.buildingIds.map(function (id) { return String(id || '').trim(); }).filter(function (id, index, ids) { return id && ids.indexOf(id) === index; })
                : [],
            department: String(data.department || '').trim(),
            title: String(data.title || '').trim(),
            employeeCode: String(data.employeeCode || '').trim(),
            unit: data.unit ? String(data.unit).trim() : '',
            // Links this login account to a real Apartment record in RHD (data.js), so
            // resident-web.html can look up the actual contracts/invoices/requests that
            // belong to this account instead of showing mock data. Set from the manager's
            // "Quản lý tài khoản" apartment picker; unit stays as a display fallback.
            apartmentId: data.apartmentId || '',
            building: data.building ? String(data.building).trim() : '',
            floor: data.floor ? String(data.floor).trim() : '',
            residentId: data.residentId ? String(data.residentId).trim() : '',
            plan: data.plan || null,
            planStatus: data.plan ? 'active' : null,
            createdAt: Date.now()
        };
        var users = readUsers();
        users.push(user);
        writeUsers(users);
        if (global.RHActivity) global.RHActivity.record('users', 'create', null, user);
        syncResidentApartmentRecords(user);
        return { ok: true, user: user };
    }

    function createUser(data) {
        var role = data && data.role === ROLES.RESIDENT ? ROLES.RESIDENT : ROLES.MANAGER;
        var permission = role === ROLES.RESIDENT ? 'users.createResident' : 'users.create';
        if (global.RHP && !global.RHP.can(permission)) {
            return { ok: false, error: 'Bạn không có quyền tạo loại tài khoản này.' };
        }
        return createUserRecord(data);
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

        var beforeAudit = JSON.parse(JSON.stringify(users[index]));
        var user = users[index];
        if (patch.name !== undefined) user.name = String(patch.name).trim();
        if (patch.email !== undefined) user.email = normalizeEmail(patch.email);
        if (patch.role !== undefined) user.role = normalizeRole(patch.role);
        if (patch.unit !== undefined) user.unit = String(patch.unit).trim();
        if (patch.apartmentId !== undefined) user.apartmentId = patch.apartmentId;
        if (patch.residentId !== undefined) user.residentId = patch.residentId;
        if (patch.building !== undefined) user.building = String(patch.building).trim();
        if (patch.floor !== undefined) user.floor = String(patch.floor).trim();
        if (patch.phone !== undefined) user.phone = String(patch.phone).trim();
        if (patch.avatar !== undefined) user.avatar = patch.avatar || '';
        if (patch.accountTypeId !== undefined) user.accountTypeId = String(patch.accountTypeId || '').trim();
        if (patch.allBuildings !== undefined) user.allBuildings = patch.allBuildings === true;
        if (patch.buildingIds !== undefined) {
            if (!Array.isArray(patch.buildingIds)) return { ok: false, error: 'Phạm vi tòa nhà không hợp lệ.' };
            user.buildingIds = patch.buildingIds.map(function (buildingId) { return String(buildingId || '').trim(); })
                .filter(function (buildingId, index, ids) { return buildingId && ids.indexOf(buildingId) === index; });
        }
        if (patch.department !== undefined) user.department = String(patch.department || '').trim();
        if (patch.title !== undefined) user.title = String(patch.title || '').trim();
        if (patch.employeeCode !== undefined) user.employeeCode = String(patch.employeeCode || '').trim();
        if (patch.status !== undefined) {
            if (['active', 'inactive', 'locked'].indexOf(patch.status) === -1) return { ok: false, error: 'Trạng thái tài khoản không hợp lệ.' };
            user.status = patch.status;
        }
        if (patch.password) user.password = patch.password;

        users[index] = user;
        writeUsers(users);
        if (global.RHActivity) global.RHActivity.record('users', 'update', beforeAudit, user);

        syncResidentApartmentRecords(user);

        var session = getSession();
        if (session && session.id === id) {
            login(user, isRemembered(), true);
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
        if (global.RHActivity) global.RHActivity.record('users', 'delete', removed, null);
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
        var user = null;
        for (var i = 0; i < candidates.length; i++) {
            if (String(candidates[i].password) === String(password || '')) { user = candidates[i]; break; }
        }
        if (!user) {
            if (lockedUntil > Date.now()) return { ok: false, reason: 'rate_limited', retryAfter: lockedUntil };
            if (lockedUntil) delete guard[guardKey];
            // No active account matches this identifier at all (not just a wrong
            // password) — check whether it belongs to a pending/rejected resident
            // registration, so the message is accurate instead of "wrong password".
            // Only when candidates is empty, so this can't be used to probe an
            // existing account's status past the lockout counter below.
            if (!candidates.length) {
                var pendingReq = findAccountRequestByEmail(identifier, [REQUEST_STATUSES.PENDING, REQUEST_STATUSES.REJECTED]);
                if (pendingReq && pendingReq.status === REQUEST_STATUSES.PENDING) {
                    return { ok: false, reason: 'account_pending' };
                }
                if (pendingReq && pendingReq.status === REQUEST_STATUSES.REJECTED) {
                    return { ok: false, reason: 'account_rejected', rejectionReason: pendingReq.rejectionReason };
                }
            }
            var attempt = guard[guardKey] || { count: 0 };
            attempt.count += 1;
            if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
                attempt.count = 0;
                attempt.lockedUntil = Date.now() + LOCKOUT_MS;
            }
            guard[guardKey] = attempt;
            writeLoginGuard(guard);
            return { ok: false, reason: attempt.lockedUntil ? 'rate_limited' : 'invalid', retryAfter: attempt.lockedUntil || 0 };
        }
        delete guard[guardKey];
        writeLoginGuard(guard);
        if (user.status === 'locked') return { ok: false, reason: 'locked' };
        if (user.status === 'inactive') return { ok: false, reason: 'inactive' };
        return { ok: true, user: user };
    }

    // ---- resident account registration requests --------------------------
    // Residents never get an active login account by self-registering. Signing
    // up creates a ResidentAccountRequest (status 'pending'); a manager reviews
    // it in dashboard.html and only approveAccountRequest() below actually
    // calls createUser(). This is a separate, always-global store (not split
    // by RHD live/demo mode) because login accounts themselves are global.

    function readAccountRequests() {
        try {
            var raw = localStorage.getItem(ACCOUNT_REQUESTS_KEY);
            var parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function writeAccountRequests(list) {
        localStorage.setItem(ACCOUNT_REQUESTS_KEY, JSON.stringify(list));
        try {
            global.dispatchEvent(new CustomEvent('residenthub:data-changed', { detail: { accountRequests: list } }));
        } catch (e) {
            /* Older browsers can still use the storage event across tabs. */
        }
    }

    function genRequestId() {
        return 'AR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }

    function normalizeContact(value) {
        return String(value || '').trim().toLowerCase();
    }

    // Finds the Resident Profile (RHD customer, see data.js) this registration
    // most likely belongs to, so the manager isn't asked to re-enter data the
    // Khách hàng module already has. Priority: the chosen apartment's own
    // active contract, then an exact phone/email/CCCD match across all
    // customers. Never guesses when a signal is ambiguous (multiple matches) —
    // the manager links/creates the profile manually in that case (see
    // approveAccountRequest's opts.residentId / opts.createNewProfile).
    function matchResidentProfile(payload) {
        if (!global.RHD) return '';
        var phone = normalizeContact(payload.phone);
        var email = normalizeEmail(payload.email);
        var idNumber = normalizeContact(payload.idNumber);

        if (payload.apartmentId) {
            var contract = global.RHD.activeContractFor(payload.apartmentId);
            if (contract && contract.customerId) {
                var apartmentCustomer = global.RHD.get('customers', contract.customerId);
                if (apartmentCustomer) {
                    var apPhone = normalizeContact(apartmentCustomer.phone);
                    var apEmail = normalizeEmail(apartmentCustomer.email);
                    if ((phone && apPhone === phone) || (email && apEmail === email)) {
                        return apartmentCustomer.id;
                    }
                }
            }
        }

        var customers = global.RHD.list('customers');
        if (phone) {
            var byPhone = customers.filter(function (c) { return normalizeContact(c.phone) === phone; });
            if (byPhone.length === 1) return byPhone[0].id;
        }
        if (email) {
            var byEmail = customers.filter(function (c) { return normalizeEmail(c.email) === email; });
            if (byEmail.length === 1) return byEmail[0].id;
        }
        if (idNumber) {
            var byIdNumber = customers.filter(function (c) { return normalizeContact(c.idNumber) === idNumber; });
            if (byIdNumber.length === 1) return byIdNumber[0].id;
        }
        return '';
    }

    function findAccountRequestByEmail(email, statuses) {
        var normalized = normalizeEmail(email);
        var requests = readAccountRequests().filter(function (r) { return normalizeEmail(r.email) === normalized; });
        if (statuses) requests = requests.filter(function (r) { return statuses.indexOf(r.status) !== -1; });
        requests.sort(function (a, b) { return b.submittedAt - a.submittedAt; });
        return requests[0] || null;
    }

    function submitAccountRequest(payload) {
        var fullName = String((payload && payload.fullName) || '').trim();
        var phone = String((payload && payload.phone) || '').trim();
        var email = normalizeEmail(payload && payload.email);
        var idNumber = String((payload && payload.idNumber) || '').trim();
        var buildingId = String((payload && payload.buildingId) || '').trim();
        var apartmentId = String((payload && payload.apartmentId) || '').trim();
        var password = String((payload && payload.password) || '');

        if (!fullName || !phone || !email || !password) {
            return { ok: false, error: 'Vui lòng nhập đầy đủ họ tên, số điện thoại, email và mật khẩu.' };
        }
        if (password.length < 6) {
            return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
        }
        if (!buildingId || !apartmentId) {
            return { ok: false, error: 'Vui lòng chọn tòa nhà và căn hộ.' };
        }
        if (global.RHD && !global.RHD.get('apartments', apartmentId)) {
            return { ok: false, error: 'Căn hộ đã chọn không hợp lệ. Vui lòng chọn lại.' };
        }
        if (findUserByEmail(email)) {
            return { ok: false, error: 'Email này đã được sử dụng cho một tài khoản khác.' };
        }
        if (findAccountRequestByEmail(email, [REQUEST_STATUSES.PENDING])) {
            return { ok: false, error: 'Email này đã có một yêu cầu đăng ký đang chờ phê duyệt.' };
        }

        var residentId = matchResidentProfile({ phone: phone, email: email, idNumber: idNumber, apartmentId: apartmentId });
        var request = {
            id: genRequestId(),
            fullName: fullName,
            phone: phone,
            email: email,
            idNumber: idNumber,
            buildingId: buildingId,
            apartmentId: apartmentId,
            residentId: residentId,
            password: password,
            status: REQUEST_STATUSES.PENDING,
            submittedAt: Date.now(),
            reviewedAt: null,
            reviewedBy: null,
            rejectionReason: ''
        };
        var requests = readAccountRequests();
        requests.unshift(request);
        writeAccountRequests(requests);
        return { ok: true, item: request };
    }

    function listAccountRequests() {
        return readAccountRequests().slice().sort(function (a, b) { return b.submittedAt - a.submittedAt; });
    }

    function getAccountRequest(id) {
        return readAccountRequests().filter(function (r) { return r.id === id; })[0] || null;
    }

    function approveAccountRequest(requestId, managerId, opts) {
        opts = opts || {};
        var requests = readAccountRequests();
        var idx = -1;
        for (var i = 0; i < requests.length; i++) if (requests[i].id === requestId) { idx = i; break; }
        if (idx === -1) return { ok: false, error: 'Không tìm thấy yêu cầu đăng ký.' };
        var request = requests[idx];
        if (request.status !== REQUEST_STATUSES.PENDING) {
            return { ok: false, error: 'Yêu cầu này đã được xử lý trước đó.' };
        }

        var residentId = opts.residentId !== undefined ? String(opts.residentId || '') : request.residentId;
        if (opts.createNewProfile && global.RHD) {
            var created = global.RHD.create('customers', {
                fullName: request.fullName,
                phone: request.phone,
                email: request.email,
                idNumber: request.idNumber,
                customerType: 'Cá nhân',
                vehicles: []
            });
            if (!created.ok) return { ok: false, error: created.error || 'Không thể tạo hồ sơ cư dân mới.' };
            residentId = created.item.id;
        }
        if (!residentId) {
            return { ok: false, error: 'Vui lòng liên kết một hồ sơ cư dân trước khi phê duyệt.' };
        }
        var conflictingUser = readUsers().filter(function (u) { return u.role === ROLES.RESIDENT && u.residentId === residentId; })[0];
        if (conflictingUser) {
            return { ok: false, error: 'Hồ sơ cư dân này đã được liên kết với một tài khoản khác (' + conflictingUser.email + ').' };
        }

        var apartment = global.RHD ? global.RHD.get('apartments', request.apartmentId) : null;
        var building = (apartment && global.RHD) ? global.RHD.get('buildings', apartment.buildingId) : null;

        var userResult = createUserRecord({
            name: request.fullName,
            email: request.email,
            password: request.password,
            role: ROLES.RESIDENT,
            unit: apartment ? apartment.name : '',
            apartmentId: request.apartmentId,
            building: building ? (building.shortName || building.name) : '',
            residentId: residentId
        });
        if (!userResult.ok) return userResult;

        requests[idx] = Object.assign({}, request, {
            status: REQUEST_STATUSES.APPROVED,
            residentId: residentId,
            reviewedAt: Date.now(),
            reviewedBy: managerId || null,
            rejectionReason: ''
        });
        writeAccountRequests(requests);

        createNotificationForUser(userResult.user.id, {
            type: 'ANNOUNCEMENT',
            subType: 'ACCOUNT_APPROVED',
            title: 'Tài khoản của bạn đã được phê duyệt',
            body: 'Ban quản lý đã phê duyệt yêu cầu đăng ký. Bạn có thể đăng nhập ngay bây giờ.',
            actionUrl: 'overview',
            actionLabel: 'Vào không gian của tôi'
        });

        return { ok: true, user: userResult.user, request: requests[idx] };
    }

    function rejectAccountRequest(requestId, managerId, reason) {
        var requests = readAccountRequests();
        var idx = -1;
        for (var i = 0; i < requests.length; i++) if (requests[i].id === requestId) { idx = i; break; }
        if (idx === -1) return { ok: false, error: 'Không tìm thấy yêu cầu đăng ký.' };
        if (requests[idx].status !== REQUEST_STATUSES.PENDING) {
            return { ok: false, error: 'Yêu cầu này đã được xử lý trước đó.' };
        }
        requests[idx] = Object.assign({}, requests[idx], {
            status: REQUEST_STATUSES.REJECTED,
            reviewedAt: Date.now(),
            reviewedBy: managerId || null,
            rejectionReason: String(reason || '').trim()
        });
        writeAccountRequests(requests);
        return { ok: true, item: requests[idx] };
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

    function login(user, remember, refreshOnly) {
        var session = { id: user.id, name: user.name, email: user.email, role: user.role, unit: user.unit || '', apartmentId: user.apartmentId || '', residentId: user.residentId || '', loginAt: Date.now(), currentUserId: user.id };
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
        if (!refreshOnly && global.RHActivity) global.RHActivity.record('auth', 'login', null, { id: user.id }, { actor: user });
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
                apartmentId: user.apartmentId || '',
                residentId: user.residentId || '',
                currentUserId: user.id
            });
        } catch (e) {
            return null;
        }
    }

    function logout() {
        // Read the raw session to avoid recursion when getSession invalidates it.
        var auditSession = null;
        try {
            auditSession = JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null');
            if (auditSession) auditSession = readUsers().find(function (u) { return u.id === auditSession.id; }) || auditSession;
        } catch (e) { /* Session cleanup must still run. */ }
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(CURRENT_USER_KEY);
        localStorage.removeItem(CURRENT_USER_KEY);
        if (auditSession && global.RHActivity) global.RHActivity.record('auth', 'logout', { id: auditSession.id }, null, { actor: auditSession });
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
            var target = session.role === ROLES.MANAGER ? 'dashboard.html' : session.role === ROLES.STAFF ? 'staff.html' : 'resident-web.html';
            global.location.replace(target + '?denied=1');
            return null;
        }
        return session;
    }

    seedIfEmpty();
    seedDemoStaffAccount();
    seedDemoResidentAccount();

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
        removeManagerRecord: removeManagerRecord,
        syncManagerNotification: syncManagerNotification,
        resolveNotificationRecipients: usersForManagerRecord,
        updateNotificationForUser: updateNotificationForUser,
        updateRequestForUser: updateRequestForUser,
        deleteRequestForUser: deleteRequestForUser,
        submitAccountRequest: submitAccountRequest,
        listAccountRequests: listAccountRequests,
        getAccountRequest: getAccountRequest,
        approveAccountRequest: approveAccountRequest,
        rejectAccountRequest: rejectAccountRequest
    };
})(window);
