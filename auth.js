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
    var ROLES = { MANAGER: 'manager', RESIDENT: 'resident' };

    function readUsers() {
        try {
            var raw = localStorage.getItem(USERS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function writeUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
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
        var normalized = String(email || '').trim().toLowerCase();
        var users = readUsers();
        for (var i = 0; i < users.length; i++) {
            if (users[i].email.toLowerCase() === normalized) return users[i];
        }
        return null;
    }

    function createUser(data) {
        var name = String(data.name || '').trim();
        var email = String(data.email || '').trim();
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
            unit: data.unit ? String(data.unit).trim() : '',
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
        if (patch.email !== undefined) user.email = String(patch.email).trim();
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
        var user = findUserByEmail(email);
        if (!user || user.password !== password) return null;
        return user;
    }

    function isRemembered() {
        return !!localStorage.getItem(SESSION_KEY);
    }

    function login(user, remember) {
        var session = { id: user.id, name: user.name, email: user.email, role: user.role, unit: user.unit || '', loginAt: Date.now() };
        var data = JSON.stringify(session);
        if (remember) {
            localStorage.setItem(SESSION_KEY, data);
            sessionStorage.removeItem(SESSION_KEY);
        } else {
            sessionStorage.setItem(SESSION_KEY, data);
            localStorage.removeItem(SESSION_KEY);
        }
        return session;
    }

    function getSession() {
        try {
            var raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function logout() {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
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
        login: login,
        logout: logout,
        getSession: getSession,
        requireRole: requireRole
    };
})(window);
