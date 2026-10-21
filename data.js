/*
 * ResidentHub - shared business data module (RHD).
 * Same pattern as auth.js: no backend, localStorage is the source of truth.
 * Holds Buildings -> Apartments -> Customers -> Meter readings -> Contracts -> Invoices
 * and keeps every module cross-linked so data entered once is reused everywhere.
 *
 * Two independent datasets share this same API via RHD.setMode():
 *  - 'live'  : real data for a logged-in manager account (localStorage residenthub_live_*)
 *  - 'demo'  : sandboxed data for the unauthenticated "Xem không gian quản lý" demo
 *              (localStorage residenthub_demo_*), capped by DEMO_LIMITS so the free
 *              demo never becomes a substitute for a paid account.
 * Nothing under 'demo' is ever read by 'live' screens and vice versa.
 */
(function (global) {
    var ENTITIES = ['buildings', 'apartments', 'customers', 'meters', 'contracts', 'deposits', 'depositTransactions', 'invoices', 'cashflows', 'supportRequests'];

    // Single source of truth for Demo Mode caps — change values here only, every
    // screen (banner, add-buttons, block messages) reads through RHD.limitInfo().
    // Sized as: seed sample data + roughly one more round the visitor enters themselves.
    var DEMO_LIMITS = {
        buildings: 2,
        apartments: 6,
        customers: 10,
        meters: 12,
        contracts: 6,
        deposits: 12,
        depositTransactions: 24,
        invoices: 10
    };

    var DEMO_LIMIT_LABELS = {
        buildings: 'tòa nhà',
        apartments: 'căn hộ',
        customers: 'khách hàng',
        meters: 'bản ghi chỉ số',
        contracts: 'hợp đồng',
        deposits: 'đặt cọc',
        depositTransactions: 'giao dịch cọc',
        invoices: 'hóa đơn'
    };

    var FEE_TYPES = [
        { id: 'rent', label: 'Tiền nhà' },
        { id: 'deposit', label: 'Tiền cọc' },
        { id: 'electricity', label: 'Tiền điện' },
        { id: 'water', label: 'Tiền nước' },
        { id: 'cleaning', label: 'Tiền vệ sinh' },
        { id: 'internet', label: 'Tiền internet' },
        { id: 'management', label: 'Phí quản lý' },
        { id: 'parking', label: 'Phí gửi xe' },
        { id: 'service', label: 'Phí dịch vụ' },
        { id: 'other', label: 'Phí khác' }
    ];

    var CALC_METHODS = [
        { id: 'fixed', label: 'Mức cố định' },
        { id: 'meter', label: 'Theo chỉ số (điện/nước)' },
        { id: 'quantity', label: 'Theo số lượng' },
        { id: 'apartment', label: 'Theo căn hộ' },
        { id: 'person', label: 'Theo đầu người' },
        { id: 'cycle', label: 'Theo kỳ thanh toán' }
    ];

    var APARTMENT_STATUSES = [
        { id: 'vacant', label: 'Trống', color: '#1683ff', bg: '#eaf3ff' },
        { id: 'occupied', label: 'Đang ở', color: '#18a878', bg: '#e6f8ef' },
        { id: 'deposited', label: 'Đã đặt cọc', color: '#a5680c', bg: '#fff4df' },
        { id: 'maintenance', label: 'Đang bảo trì', color: '#ef4444', bg: '#fee2e2' }
    ];

    var VEHICLE_TYPES = ['Ô tô', 'Ô tô điện', 'Xe máy', 'Xe máy điện', 'Xe đạp'];

    var PAYMENT_CYCLES = [
        { id: 'monthly', label: 'Hàng tháng' },
        { id: 'quarterly', label: 'Hàng quý' },
        { id: 'yearly', label: 'Hàng năm' }
    ];

    var INVOICE_STATUSES = [
        { id: 'unpaid', label: 'Chưa thanh toán', color: '#a5680c', bg: '#fff4df' },
        { id: 'sent', label: 'Đã gửi', color: '#0d65d5', bg: '#eaf3ff' },
        { id: 'payment_pending', label: 'Chờ xác nhận thanh toán', color: '#a5680c', bg: '#fff4df' },
        { id: 'paid', label: 'Đã thanh toán', color: '#18a878', bg: '#e6f8ef' },
        { id: 'overdue', label: 'Quá hạn', color: '#ef4444', bg: '#fee2e2' }
    ];
    var ISSUED_INVOICE_STATUSES = ['unpaid', 'sent', 'paid', 'overdue'];

    function isIssuedInvoice(invoice) {
        return !!invoice && ISSUED_INVOICE_STATUSES.indexOf(invoice.status || 'unpaid') !== -1;
    }

    // Canonical status vocabulary shared by manager and resident support screens.
    var SUPPORT_STATUSES = [
        { id: 'new', label: 'Chưa xử lý', color: '#0d65d5', bg: '#eaf3ff' },
        { id: 'accepted', label: 'Đã tiếp nhận', color: '#7c3aed', bg: '#f3e8ff' },
        { id: 'in_progress', label: 'Đang xử lý', color: '#a5680c', bg: '#fff4df' },
        { id: 'resolved', label: 'Đã xử lý', color: '#18a878', bg: '#e6f8ef' },
        { id: 'closed', label: 'Đã đóng', color: '#61708a', bg: '#f1f5f9' }
    ];
    var SETTINGS_DEFAULTS = {
        orgLogo: '',
        orgName: '',
        orgHotline: '',
        orgEmail: '',
        orgAddress: '',
        autoOccupyOnContract: false,
        contractExpiringDays: 30,
        contractNoticeDays: 30,
        contractReminderDays: '30,15,7,0',
        invoiceDueMode: 'days',
        invoiceDueDays: 5,
        invoiceDueDayOfMonth: 10,
        autoMarkOverdue: false,
        invoiceRequireSend: false,
        residentOnlinePayment: false,
        invoiceReminderDays: '',
        supportAutoAssignee: '',
        supportAllowRating: true,
        notifyInvoice: true,
        notifyContract: true,
        notifySupportStatus: true,
        notifyAccountApproved: true,
        notificationTemplates: {},
        notificationDelivery: {},
        notifyBuildingActivity: true,
        financialAlerts: { enabled: false, actions: ['update', 'lock', 'delete'], recipientIds: [] }
    };
    var SUPPORT_PRIORITIES = [
        { id: 'normal', label: 'Bình thường', color: '#526174', bg: '#f1f5f9' },
        { id: 'needed', label: 'Cần xử lý', color: '#a16207', bg: '#fff7df' },
        { id: 'urgent', label: 'Khẩn cấp', color: '#c24141', bg: '#fff0f0' }
    ];
    var SUPPORT_CATEGORIES = ['Sửa chữa căn hộ', 'Cơ sở vật chất chung', 'An ninh', 'Vệ sinh', 'Phí & thanh toán', 'Phản ánh / góp ý', 'Khác'];
    var SUPPORT_STAFF_GROUPS = [
        { id: 'technical', label: 'Kỹ thuật – Sửa chữa', description: 'Kiểm tra, sửa điện nước, điều hòa, đèn và thiết bị hoặc cơ sở vật chất.' },
        { id: 'cleaning', label: 'Vệ sinh – Lao công', description: 'Vệ sinh hành lang, cầu thang, thang máy và khu vực chung.' },
        { id: 'security', label: 'An ninh – Bảo vệ', description: 'Giám sát an ninh, kiểm tra khu vực và ghi nhận sự cố.' }
    ];

    // Small reference list — not the full VN administrative dataset (out of scope for a
    // demo/pitch app). Wards are free-typed with suggestions instead of a full mapping.
    var PROVINCES = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Thái Nguyên',
        'Bắc Ninh', 'Nghệ An', 'Thanh Hóa', 'Khánh Hòa', 'Lâm Đồng', 'Bình Dương', 'Đồng Nai', 'Quảng Ninh'];
    var WARD_SUGGESTIONS = {
        'Thái Nguyên': ['Phường Tích Lương', 'Phường Gia Sàng', 'Phường Phú Xá'],
        'Hà Nội': ['Phường Cầu Giấy', 'Phường Ba Đình', 'Phường Hoàng Mai'],
        'TP. Hồ Chí Minh': ['Phường Bến Nghé', 'Phường Tân Định', 'Phường An Phú']
    };

    function mode() { return global.RHD_MODE || 'live'; }
    function prefix() { return 'residenthub_' + mode() + '_'; }
    function key(entity) { return prefix() + entity; }

    function settingsKey() {
        var session = global.RH && global.RH.getSession ? global.RH.getSession() : null;
        return 'residenthub_settings_v1_' + encodeURIComponent(session && session.id || 'standalone');
    }

    function getSettings() {
        var raw = localStorage.getItem(settingsKey());
        if (!raw) return Object.assign({}, SETTINGS_DEFAULTS);
        var settings = JSON.parse(raw);
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            throw new Error('Cài đặt ResidentHub phải là một đối tượng hợp lệ.');
        }
        return Object.assign({}, SETTINGS_DEFAULTS, settings);
    }

    function saveSettings(patch) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
            throw new TypeError('Dữ liệu cài đặt phải là một đối tượng.');
        }
        Object.keys(patch).forEach(function (setting) {
            if (!Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, setting)) {
                throw new Error('Không hỗ trợ khóa cài đặt: ' + setting);
            }
        });
        var before = getSettings();
        var settings = Object.assign({}, before, patch);
        localStorage.setItem(settingsKey(), JSON.stringify(settings));
        auditChange('settings', 'update', before, settings);
        return settings;
    }

    // Optional settings audit bridge. Audit failures never change a business result.
    function auditChange(entity, action, before, after) {
        try {
            if (global.RHActivity) global.RHActivity.record(entity, action, before, after);
            else if (global.RHGeneralSettings) global.RHGeneralSettings.record(entity, action, before, after);
        } catch (error) {
            if (global.console) console.error('Không ghi được nhật ký Cài đặt chung.', error);
        }
    }

    function readAll(entity) {
        try {
            var raw = localStorage.getItem(key(entity));
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function writeAll(entity, list) {
        localStorage.setItem(key(entity), JSON.stringify(list));
        try {
            global.dispatchEvent(new CustomEvent('residenthub:business-data-changed', { detail: { entity: entity, mode: mode() } }));
        } catch (e) {
            /* Storage events remain available across tabs. */
        }
    }

    function notifyMeterChanges(readings) {
        if (!global.RHB || typeof global.RHB.meterChanged !== 'function') return;
        var seen = Object.create(null);
        readings.forEach(function (reading) {
            if (!reading) return;
            var period = reading.readingPeriod || reading.periodMonth || '';
            var slot = String(reading.apartmentId || '') + '|' + String(period);
            if (seen[slot]) return;
            seen[slot] = true;
            global.RHB.meterChanged(reading);
        });
    }

    function genId(prefixStr) {
        return (prefixStr || 'id') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }

    function pad(num, len) {
        var s = String(num);
        while (s.length < len) s = '0' + s;
        return s;
    }

    function list(entity) { return readAll(entity); }

    function get(entity, id) {
        var items = readAll(entity);
        for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
        return null;
    }

    function limitInfo(entity) {
        if (mode() !== 'demo') return { limited: false };
        var max = DEMO_LIMITS[entity];
        var count = readAll(entity).length;
        var reached = count >= max;
        // "near" = warn before the visitor actually hits the wall (70% of the cap).
        var near = !reached && count >= Math.ceil(max * 0.7);
        return { limited: true, max: max, count: count, reached: reached, near: near, label: DEMO_LIMIT_LABELS[entity] };
    }

    function contractDataError(contract, excludeId) {
        contract = contract || {};
        var terminal = ['draft', 'ended', 'terminated', 'expired', 'liquidated', 'settled', 'closed', 'deposit', 'deposited', 'forfeited', 'deposit_forfeited'];
        var tenantIds = contractTenantIds(contract);
        var overlaps = readAll('contracts').some(function (other) {
            if (other.id === excludeId || terminal.indexOf(String(other.status || '').toLowerCase()) !== -1 ||
                terminal.indexOf(String(contract.status || '').toLowerCase()) !== -1) return false;
            var dateOverlap = (!other.endDate || !contract.startDate || other.endDate >= contract.startDate) &&
                (!other.startDate || !contract.endDate || other.startDate <= contract.endDate);
            var sameTenant = contractTenantIds(other).some(function (id) {
                return tenantIds.indexOf(id) !== -1;
            });
            return dateOverlap && (other.apartmentId === contract.apartmentId || sameTenant);
        });
        if (overlaps) return 'Căn hộ hoặc khách thuê đã có hợp đồng đang hiệu lực trong thời gian này.';

        var assets = Array.isArray(contract.handoverAssets) ? contract.handoverAssets : [];
        var assetIds = assets.map(function (asset) { return asset.assetId; });
        if (assetIds.some(function (id, index) { return !id || assetIds.indexOf(id) !== index; })) return 'Tài sản bàn giao bị trùng hoặc thiếu mã tài sản.';
        for (var i = 0; i < assets.length; i++) {
            var original = get('assets', assets[i].assetId);
            var quantity = Number(assets[i].quantity);
            if (!original || original.apartmentId !== contract.apartmentId || !Number.isInteger(quantity) ||
                quantity < 1 || quantity > Number(original.quantity)) return 'Số lượng hoặc tài sản bàn giao không hợp lệ.';
        }
        return '';
    }

    function create(entity, data) {
        if (mode() === 'demo') {
            var info = limitInfo(entity);
            if (info.reached) {
                return { ok: false, limitReached: true, error: 'Bạn đã đạt giới hạn ' + info.max + ' ' + info.label + ' trong bản Demo.' };
            }
        }
        if (entity === 'contracts') {
            var contractError = contractDataError(data, null);
            if (contractError) return { ok: false, error: contractError };
            if (data.signDate && global.RHDocuments && typeof global.RHDocuments.prepare === 'function') {
                var prepared = global.RHDocuments.prepare(data, null);
                if (!prepared.ok) return { ok: false, error: prepared.error };
                data = prepared.item;
            }
        }
        var items = readAll(entity);
        var record = Object.assign({ id: genId(entity), createdAt: Date.now() }, data);
        items.push(record);
        writeAll(entity, items);
        auditChange(entity, 'create', null, record);
        if (entity === 'meters') notifyMeterChanges([record]);
        return { ok: true, item: record };
    }

    function update(entity, id, patch) {
        var items = readAll(entity);
        var idx = -1;
        for (var i = 0; i < items.length; i++) if (items[i].id === id) { idx = i; break; }
        if (idx === -1) return { ok: false, error: 'Không tìm thấy bản ghi.' };
        var previous = items[idx];
        var updated = Object.assign({}, previous, patch, { id: previous.id, createdAt: previous.createdAt });
        if (entity === 'contracts' && ['apartmentId', 'customerId', 'customerIds', 'tenantIds', 'startDate', 'endDate', 'status', 'handoverAssets'].some(function (key) {
            return Object.prototype.hasOwnProperty.call(patch, key);
        })) {
            var contractError = contractDataError(updated, previous.id);
            if (contractError) return { ok: false, error: contractError };
        }
        if (entity === 'contracts' && (patch.signDate || patch.contractTemplateId || patch.apartmentId || patch.customerId || patch.customerIds || patch.tenantIds || patch.startDate || patch.endDate || patch.handoverAssets) &&
            updated.signDate && global.RHDocuments && typeof global.RHDocuments.prepare === 'function') {
            var prepared = global.RHDocuments.prepare(updated, previous);
            if (!prepared.ok) return { ok: false, error: prepared.error };
            updated = prepared.item;
        }
        items[idx] = updated;
        writeAll(entity, items);
        auditChange(entity, 'update', previous, items[idx]);
        if (entity === 'meters') notifyMeterChanges([previous, items[idx]]);
        return { ok: true, item: items[idx] };
    }

    function remove(entity, id) {
        var items = readAll(entity);
        var removed = items.filter(function (r) { return r.id === id; });
        var next = items.filter(function (r) { return r.id !== id; });
        if (next.length === items.length) return { ok: false, error: 'Không tìm thấy bản ghi.' };
        writeAll(entity, next);
        auditChange(entity, 'delete', items.filter(function (r) { return r.id === id; })[0], null);
        if (entity === 'meters') notifyMeterChanges(removed);
        return { ok: true };
    }

    // ---- derived helpers -------------------------------------------------

    function buildingFullAddress(building) {
        if (!building) return '';
        return [building.addressDetail, building.ward, building.province].filter(Boolean).join(', ');
    }

    function apartmentsOf(buildingId) {
        return readAll('apartments').filter(function (a) { return a.buildingId === buildingId; });
    }

    function contractsOf(apartmentId) {
        return readAll('contracts').filter(function (c) { return c.apartmentId === apartmentId; });
    }

    function activeContractFor(apartmentId) {
        var contracts = contractsOf(apartmentId).filter(function (c) { return c.status !== 'ended' && c.status !== 'terminated' && c.status !== 'expired'; });
        contracts.sort(function (a, b) { return b.createdAt - a.createdAt; });
        return contracts[0] || null;
    }

    function latestMeter(apartmentId, meterType) {
        var readings = readAll('meters').filter(function (m) { return m.apartmentId === apartmentId && m.meterType === meterType; });
        readings.sort(function (a, b) { return b.createdAt - a.createdAt; });
        return readings[0] || null;
    }

    function assetsOf(field, id) {
        return readAll('assets').filter(function (a) { return a[field] === id; });
    }

    // ---- relationship resolvers ---------------------------------------------
    // Building.managerId -> staff login account (auth.js users). Only the id is
    // stored on the building; name/email/phone are always resolved from here.
    // Demo Mode never reads real accounts: its only "staff" is the demo session
    // itself (RH_SESSION set by dashboard.html), so the picker still works there.
    function managerAccounts() {
        if (mode() === 'demo') {
            var s = global.RH_SESSION;
            return s && s.demo ? [{ id: s.id, name: s.name, email: s.email || '', phone: '', role: 'manager', status: 'active' }] : [];
        }
        if (!global.RH) return [];
        return global.RH.getUsers().filter(function (u) { return u.role === 'manager'; });
    }

    // Accounts that may be picked as a building's manager: staff whose account
    // type grants "buildings.assignable" (permissions.js). Resolution of an
    // existing managerId still uses managerAccounts(), so a past assignment
    // keeps showing even if that permission is later removed.
    function eligibleManagers() {
        if (mode() === 'demo' || !global.RHP) return managerAccounts();
        return global.RHP.eligibleManagers();
    }

    function buildingManager(building) {
        if (!building || !building.managerId) return null;
        return managerAccounts().filter(function (u) { return u.id === building.managerId; })[0] || null;
    }

    // Resident Profile (customer) -> its contracts, and through the newest
    // non-ended one the Apartment and Building. Customers carry no copy of
    // apartment/building data, so this is the single place that walks the links.
    function residentPlacement(customerId) {
        var customer = customerId ? get('customers', customerId) : null;
        if (!customer) return null;
        var contracts = readAll('contracts').filter(function (c) { return contractTenantIds(c).indexOf(customer.id) !== -1; })
            .sort(function (a, b) { return b.createdAt - a.createdAt; });
        var active = contracts.filter(function (c) { return c.status !== 'ended'; })[0] || null;
        var ref = active || contracts[0] || null;
        var apartment = ref ? get('apartments', ref.apartmentId) : null;
        var building = apartment ? get('buildings', apartment.buildingId) : (ref ? get('buildings', ref.buildingId) : null);
        return { customer: customer, contracts: contracts, contract: active, lastContract: ref, apartment: apartment, building: building };
    }

    function findApartmentByUnit(unitText, buildingText) {
        var norm = String(unitText || '').trim().toLowerCase();
        if (!norm) return null;
        var apartments = readAll('apartments');
        var matches = apartments.filter(function (apartment) {
            return String(apartment.name || '').trim().toLowerCase() === norm;
        });
        if (matches.length === 1) return matches[0];
        var buildingNorm = String(buildingText || '').trim().toLowerCase();
        if (buildingNorm) {
            matches = matches.filter(function (apartment) {
                var building = get('buildings', apartment.buildingId);
                return building && [building.id, building.code, building.shortName, building.name].some(function (value) {
                    return String(value || '').trim().toLowerCase() === buildingNorm;
                });
            });
        }
        return matches.length === 1 ? matches[0] : null;
    }

    // Resolves everything a logged-in resident session is allowed to see, purely
    // from RH_SESSION (auth.js) + this module's own records — the single place
    // resident-web.html asks "which apartment/contract/customer am I?" instead of
    // keeping its own copy of that logic.
    function residentContext(session) {
        if (!session) return null;
        // The login session is a point-in-time snapshot (auth.js RH.login) and can be
        // stale — e.g. a manager links the account to an apartment after the resident
        // already has a session open. Re-read the live user record for
        // apartmentId/unit/residentId instead of trusting the snapshot, and only fall
        // back to it if the user record is unavailable for some reason.
        var liveUser = global.RH ? global.RH.getUsers().filter(function (u) { return u.id === session.id; })[0] : null;
        var residentId = (liveUser && liveUser.residentId) || session.residentId || '';
        var apartmentId = (liveUser && liveUser.apartmentId) || session.apartmentId;
        var unit = (liveUser && liveUser.unit) || session.unit;
        var customer = residentId ? get('customers', residentId) : null;
        var apartment = (apartmentId && get('apartments', apartmentId)) || findApartmentByUnit(unit, liveUser && liveUser.building || session.building);
        var allContracts = readAll('contracts');
        var contracts = allContracts.filter(function (item) {
            return item.status !== 'ended' && item.status !== 'terminated' && item.status !== 'expired';
        });
        var contractCandidates = apartment ? contracts.filter(function (item) { return item.apartmentId === apartment.id; }) : contracts.filter(function (item) { return customer && contractTenantIds(item).indexOf(customer.id) !== -1; });
        contractCandidates.sort(function (a, b) {
            if (customer && apartment) {
                var aMatchesCustomer = contractTenantIds(a).indexOf(customer.id) !== -1 ? 1 : 0;
                var bMatchesCustomer = contractTenantIds(b).indexOf(customer.id) !== -1 ? 1 : 0;
                if (aMatchesCustomer !== bMatchesCustomer) return bMatchesCustomer - aMatchesCustomer;
            }
            return (b.createdAt || 0) - (a.createdAt || 0);
        });
        var contract = contractCandidates[0] || null;
        if (!apartment && contract) apartment = get('apartments', contract.apartmentId);
        if (!apartment) return { apartment: null, building: null, contract: null, customer: customer, invoices: [], supportRequests: [] };
        var building = get('buildings', apartment.buildingId);
        if (!customer && contract) customer = get('customers', contract.customerId) || null;
        var residentContracts = contract ? allContracts.filter(function (item) {
            return item.apartmentId === apartment.id && (!customer || contractTenantIds(item).indexOf(customer.id) !== -1);
        }) : [];
        var residentContractIds = residentContracts.reduce(function (ids, item) { ids[item.id] = true; return ids; }, {});
        var invoices = readAll('invoices').filter(function (inv) {
            if (inv.apartmentId !== apartment.id) return false;
            if (inv.contractId) {
                var invoiceContract = allContracts.filter(function (item) { return item.id === inv.contractId; })[0];
                return !!(invoiceContract && residentContractIds[invoiceContract.id]);
            }
            return !!(customer && inv.customerId === customer.id);
        })
            .sort(function (a, b) { return b.createdAt - a.createdAt; });
        var supportRequests = readAll('supportRequests').filter(function (r) {
            return r.apartmentId === apartment.id || r.residentEmail === session.email;
        }).sort(function (a, b) { return b.createdAt - a.createdAt; });
        return { apartment: apartment, building: building, contract: contract, customer: customer, invoices: invoices, supportRequests: supportRequests };
    }

    // "30, 15,7,0,-1" -> [30,15,7,0,-1] (positive = before end, negative = after).
    function parseReminderDays(value) {
        var seen = {};
        return String(value || '').split(',').map(function (s) { return parseInt(s, 10); })
            .filter(function (n) { if (!isFinite(n) || seen[n]) return false; seen[n] = true; return true; })
            .sort(function (a, b) { return b - a; });
    }

    function isoDate(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
    }

    // Default "Hạn thanh toán" for an invoice issued on issueDateStr (YYYY-MM-DD).
    function defaultDueDate(issueDateStr) {
        var s = getSettings();
        var issue = issueDateStr ? new Date(issueDateStr + 'T00:00:00') : new Date();
        if (s.invoiceDueMode === 'dayOfMonth') {
            var due = new Date(issue.getFullYear(), issue.getMonth(), s.invoiceDueDayOfMonth);
            if (due <= issue) due = new Date(issue.getFullYear(), issue.getMonth() + 1, s.invoiceDueDayOfMonth);
            return isoDate(due);
        }
        issue.setDate(issue.getDate() + s.invoiceDueDays);
        return isoDate(issue);
    }

    // "Tự động chuyển quá hạn": flips unpaid/sent invoices past their dueDate.
    // Returns the invoices it changed so callers can notify / re-render.
    function markOverdueInvoices() {
        if (!getSettings().autoMarkOverdue) return [];
        var todayStr = isoDate(new Date());
        var items = readAll('invoices');
        var changed = [];
        items.forEach(function (inv) {
            if ((inv.status === 'unpaid' || inv.status === 'sent') && inv.dueDate && inv.dueDate < todayStr) {
                inv.status = 'overdue';
                changed.push(inv);
            }
        });
        if (changed.length) writeAll('invoices', items);
        return changed;
    }

    function invoiceVisibleToResident(inv) {
        if (!isIssuedInvoice(inv)) return false; // drafts / approved / cancelled stay internal
        return !getSettings().invoiceRequireSend || inv.status !== 'unpaid';
    }

    // Groups an invoice line into the Dashboard's fee buckets, using the
    // building service's feeType when the line references one.
    function feeGroupOf(item, building) {
        var svc = building && item.serviceId ? (building.services || []).filter(function (s) { return s.id === item.serviceId; })[0] : null;
        var type = svc ? svc.feeType : '';
        var label = String(item.label || '');
        if (type === 'rent' || (!type && /thuê|tiền nhà/i.test(label))) return 'rent';
        if (type === 'electricity' || (!type && /điện|kwh/i.test(label))) return 'electricity';
        if (type === 'water' || (!type && /nước|m³/i.test(label))) return 'water';
        return 'other';
    }

    function monthKey(value) {
        if (!value) return '';
        if (typeof value === 'string' && /^\d{4}-\d{2}/.test(value)) return value.slice(0, 7);
        var d = new Date(value);
        return isNaN(d) ? '' : d.getFullYear() + '-' + pad(d.getMonth() + 1, 2);
    }

    function topBy(list, keyFn) {
        var counts = {};
        list.forEach(function (x) { var k = keyFn(x); if (k) counts[k] = (counts[k] || 0) + 1; });
        var best = null;
        Object.keys(counts).forEach(function (k) { if (!best || counts[k] > best.count) best = { key: k, count: counts[k] }; });
        return best;
    }

    function contractTenantIds(contract) {
        if (Array.isArray(contract.tenantIds) && contract.tenantIds.length) return contract.tenantIds;
        if (Array.isArray(contract.customerIds) && contract.customerIds.length) return contract.customerIds;
        return contract.customerId ? [contract.customerId] : [];
    }

    // Everything the Dashboard shows, computed from the entity stores on every
    // call (optionally scoped to one building). Nothing is cached or stored, so
    // records added in any module show up automatically.
    // buildingId: '' / null = all buildings, a single id, or an array of ids
    // (the signed-in user's building scope, see permissions.js).
    function dashboardStats(buildingId) {
        var settings = getSettings();
        var now = new Date();
        var todayStr = isoDate(now);
        var curMonth = monthKey(todayStr);
        var prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        var soon = new Date(); soon.setDate(soon.getDate() + settings.contractExpiringDays);
        var soonStr = isoDate(soon);
        var scopeIds = Array.isArray(buildingId) ? buildingId : (buildingId ? [buildingId] : null);
        var inScope = function (r) { return !scopeIds || scopeIds.indexOf(r.buildingId) !== -1; };

        var buildings = readAll('buildings').filter(function (b) { return !scopeIds || scopeIds.indexOf(b.id) !== -1; });
        var apartments = readAll('apartments').filter(inScope);
        var contracts = readAll('contracts').filter(inScope);
        var invoices = readAll('invoices').filter(function (i) { return inScope(i) && isIssuedInvoice(i); });
        var requests = readAll('supportRequests').filter(inScope);
        var meters = readAll('meters').filter(inScope);
        var allCustomers = readAll('customers');
        var customerIdsInBuilding = {};
        contracts.forEach(function (c) { contractTenantIds(c).forEach(function (id) { customerIdsInBuilding[id] = true; }); });
        var customers = scopeIds ? allCustomers.filter(function (c) { return customerIdsInBuilding[c.id]; }) : allCustomers;
        var sum = function (list) { return list.reduce(function (s, i) { return s + (Number(i.total) || 0); }, 0); };

        // Apartments by status
        var aptStatus = {};
        APARTMENT_STATUSES.forEach(function (st) { aptStatus[st.id] = apartments.filter(function (a) { return a.status === st.id; }).length; });

        // Contracts
        var isEnded = function (c) { return c.status === 'ended' || (c.endDate && c.endDate < todayStr); };
        var activeContracts = contracts.filter(function (c) { return !isEnded(c); });
        var expiringContracts = activeContracts.filter(function (c) { return c.endDate && c.endDate >= todayStr && c.endDate <= soonStr; });

        // Invoices
        var isOverdue = function (i) { return i.status === 'overdue' || (i.status !== 'paid' && i.dueDate && i.dueDate < todayStr); };
        var invoiceMonth = function (i) { return i.period || monthKey(i.issueDate) || monthKey(i.createdAt); };
        var monthInvoices = invoices.filter(function (i) { return invoiceMonth(i) === curMonth; });
        var prevMonthInvoices = invoices.filter(function (i) { return invoiceMonth(i) === prevMonth; });
        var buildingById = {};
        readAll('buildings').forEach(function (b) { buildingById[b.id] = b; });
        var feeGroups = { rent: { total: 0, paid: 0 }, electricity: { total: 0, paid: 0 }, water: { total: 0, paid: 0 }, other: { total: 0, paid: 0 } };
        monthInvoices.forEach(function (inv) {
            (inv.items || []).forEach(function (it) {
                var g = feeGroups[feeGroupOf(it, buildingById[inv.buildingId])];
                var amount = (Number(it.amount) || 0) + (Number(it.tax) || 0);
                g.total += amount;
                if (inv.status === 'paid') g.paid += amount;
            });
        });
        var revenue12 = [];
        for (var m = 11; m >= 0; m--) {
            var key12 = monthKey(new Date(now.getFullYear(), now.getMonth() - m, 1));
            revenue12.push({
                month: key12,
                billed: sum(invoices.filter(function (i) { return invoiceMonth(i) === key12; })),
                collected: sum(invoices.filter(function (i) { return i.status === 'paid' && monthKey(i.paidAt) === key12; }))
            });
        }

        // Resident accounts (auth.js, global store) — never shown in Demo Mode.
        var accountRequests = (mode() !== 'demo' && global.RH && global.RH.listAccountRequests)
            ? global.RH.listAccountRequests().filter(inScope) : [];
        var customerIds = {};
        customers.forEach(function (c) { customerIds[c.id] = true; });
        var linkedAccounts = (mode() !== 'demo' && global.RH)
            ? global.RH.getUsers().filter(function (u) { return u.role === 'resident' && u.residentId && customerIds[u.residentId]; }) : [];
        var activeCustomerIds = {};
        activeContracts.forEach(function (c) { activeCustomerIds[c.customerId] = true; });

        // Support requests
        var openRequests = requests.filter(function (r) { return r.status === 'new' || r.status === 'in_progress'; });
        var ratings = [5, 4, 3, 2, 1].map(function (star) { return { star: star, count: requests.filter(function (r) { return Number(r.rating) === star; }).length }; });
        var ratedCount = ratings.reduce(function (s, r) { return s + r.count; }, 0);
        var topBuilding = topBy(requests, function (r) { return r.buildingId; });
        var topApartment = topBy(requests, function (r) { return r.apartmentId; });
        var topCategory = topBy(requests, function (r) { return r.category; });
        var topAssignee = topBy(openRequests, function (r) { return r.assignee; });

        return {
            buildingId: Array.isArray(buildingId) ? '' : (buildingId || ''),
            buildings: buildings.length,
            apartments: apartments,
            aptStatus: aptStatus,
            occupancyRate: apartments.length ? Math.round(aptStatus.occupied * 1000 / apartments.length) / 10 : 0,
            customers: customers.length,
            customersNewThisMonth: customers.filter(function (c) { return monthKey(c.createdAt) === curMonth; }).length,
            customersWithoutContract: customers.filter(function (c) { return !activeCustomerIds[c.id]; }).length,
            linkedAccounts: linkedAccounts.length,
            accountRequests: {
                pending: accountRequests.filter(function (r) { return r.status === 'pending'; }).length,
                approved: accountRequests.filter(function (r) { return r.status === 'approved'; }).length,
                rejected: accountRequests.filter(function (r) { return r.status === 'rejected'; }).length,
                thisMonth: accountRequests.filter(function (r) { return monthKey(r.submittedAt) === curMonth; }).length
            },
            contracts: contracts,
            activeContracts: activeContracts,
            expiringContracts: expiringContracts,
            endedContracts: contracts.filter(isEnded),
            contractsSignedThisMonth: contracts.filter(function (c) { return monthKey(c.signDate || c.startDate || c.createdAt) === curMonth; }).length,
            contractsEndedThisMonth: contracts.filter(function (c) { return isEnded(c) && monthKey(c.endDate) === curMonth; }).length,
            meters: meters.length,
            invoices: invoices,
            unpaidInvoices: invoices.filter(function (i) { return i.status !== 'paid'; }),
            overdueInvoices: invoices.filter(isOverdue),
            month: {
                key: curMonth,
                total: sum(monthInvoices),
                paid: sum(monthInvoices.filter(function (i) { return i.status === 'paid'; })),
                prevTotal: sum(prevMonthInvoices),
                count: monthInvoices.length,
                groups: feeGroups
            },
            revenue12: revenue12,
            requests: requests,
            openRequests: openRequests,
            newRequests: requests.filter(function (r) { return r.status === 'new'; }),
            requestsByStatus: {
                new: requests.filter(function (r) { return r.status === 'new'; }).length,
                in_progress: requests.filter(function (r) { return r.status === 'in_progress'; }).length,
                resolved: requests.filter(function (r) { return r.status === 'resolved'; }).length
            },
            requestsThisMonth: requests.filter(function (r) { return monthKey(r.createdAt) === curMonth; }).length,
            requestsDoneThisMonth: requests.filter(function (r) { return (r.status === 'resolved' || r.status === 'closed') && monthKey(r.updatedAt) === curMonth; }).length,
            ratings: ratings,
            ratedCount: ratedCount,
            ratingAverage: ratedCount ? Math.round(ratings.reduce(function (s, r) { return s + r.star * r.count; }, 0) * 10 / ratedCount) / 10 : 0,
            hotspots: {
                building: topBuilding ? { label: (get('buildings', topBuilding.key) || {}).name || '—', count: topBuilding.count } : null,
                apartment: topApartment ? { label: (get('apartments', topApartment.key) || {}).name || '—', count: topApartment.count } : null,
                category: topCategory ? { label: topCategory.key, count: topCategory.count } : null,
                assignee: topAssignee ? { label: topAssignee.key, count: topAssignee.count } : null
            },
            todayStr: todayStr,
            expiringDays: settings.contractExpiringDays
        };
    }

    // ---- code generators ---------------------------------------------------

    function nextBuildingCode() {
        var n = readAll('buildings').length + 1;
        return 'TN' + pad(n, 4);
    }

    function nextContractCode(building, apartment) {
        var year = new Date().getFullYear();
        var seq = readAll('contracts').length + 1;
        var buildingTag = (building && (building.shortName || building.name) || 'TN').toUpperCase().replace(/\s+/g, '').slice(0, 6);
        var aptTag = (apartment && apartment.name || 'CH').toUpperCase().replace(/\s+/g, '');
        return buildingTag + '-' + aptTag + '-' + year + '-' + pad(seq, 3);
    }

    function nextInvoiceCode() {
        var year = new Date().getFullYear();
        var seq = readAll('invoices').length + 1;
        return 'HD' + year + '-' + pad(seq, 4);
    }

    function nextSupportCode() {
        var seq = readAll('supportRequests').length + 1;
        return 'YC-' + pad(seq, 4);
    }

    // ---- fee calculation ----------------------------------------------------

    // Computes one invoice line for a building service, using a meter reading
    // when the service is billed 'meter'-style (electricity/water) and a
    // generic quantity for the other calc methods. This is a pitch-ready
    // approximation, not a full billing engine.
    // Electricity/water entered with the default "fixed" method is ambiguous.
    // Only an explicit package label/flag permits billing it without a meter.
    function utilityPolicy(service) {
        var label = String(service.name || '').toLowerCase();
        var type = service.feeType === 'water' || service.feeType === 'electricity' ? service.feeType :
            (/^(tiền\s+)?nước\b|m³|m3/i.test(label) ? 'water' : /^(tiền\s+)?điện\b|kwh/i.test(label) ? 'electricity' : null);
        var packageFee = service.calcMethod === 'fixed' && (service.billingMode === 'flat' || service.flatRate === true || /trọn gói|tron goi/i.test(label));
        return { meterType: type, metered: service.calcMethod === 'meter' || (!!type && !packageFee), packageFee: packageFee };
    }

    function calcServiceAmount(service, ctx) {
        ctx = ctx || {};
        var unitPrice = Number(service.unitPrice) || 0;
        var qty = 1;
        if (service.calcMethod === 'meter' || utilityPolicy(service).metered) {
            var reading = ctx.meterReading;
            var readingPeriod = reading && (reading.readingPeriod || reading.periodMonth);
            if (ctx.readingPeriod && readingPeriod !== ctx.readingPeriod) reading = null;
            qty = reading ? Number(reading.consumption) || 0 : 0;
        } else if (service.calcMethod === 'quantity' || service.calcMethod === 'person') {
            qty = ctx.quantity != null ? Number(ctx.quantity) : 1;
        } else {
            qty = 1;
        }
        var amount = unitPrice * qty;
        var tax = amount * (Number(service.taxRate) || 0) / 100;
        return { qty: qty, unitPrice: unitPrice, amount: amount, tax: tax, total: amount + tax };
    }

    // ---- demo seed -----------------------------------------------------------

    function seedDataset(targetMode) {
        var prevMode = global.RHD_MODE;
        global.RHD_MODE = targetMode;
        try {
            if (readAll('buildings').length > 0) return;

            var building = {
                id: genId('building'), code: 'TN0001', name: 'Chung cư Riverside Residence', shortName: 'CT1',
                province: 'Thái Nguyên', ward: 'Phường Tích Lương', addressDetail: 'Tổ 14',
                services: [
                    { id: genId('svc'), name: 'Tiền thuê nhà', feeType: 'rent', calcMethod: 'fixed', unitPrice: 0, taxRate: 0 },
                    { id: genId('svc'), name: 'Tiền điện', feeType: 'electricity', calcMethod: 'meter', unitPrice: 3800, taxRate: 8 },
                    { id: genId('svc'), name: 'Tiền nước', feeType: 'water', calcMethod: 'meter', unitPrice: 18000, taxRate: 5 },
                    { id: genId('svc'), name: 'Vệ sinh chung cư', feeType: 'cleaning', calcMethod: 'apartment', unitPrice: 50000, taxRate: 0 },
                    { id: genId('svc'), name: 'Internet cáp quang', feeType: 'internet', calcMethod: 'apartment', unitPrice: 100000, taxRate: 0 },
                    { id: genId('svc'), name: 'Phí quản lý vận hành', feeType: 'management', calcMethod: 'apartment', unitPrice: 150000, taxRate: 0 },
                    { id: genId('svc'), name: 'Phí gửi xe máy', feeType: 'parking', calcMethod: 'quantity', unitPrice: 100000, taxRate: 0 }
                ],
                config: {
                    autoDebitAccount: '', eInvoiceEnabled: false, eInvoiceProvider: '',
                    bankName: 'Vietcombank', bankAccountNumber: '', bankAccountHolder: ''
                },
                contractTemplateId: global.RHT ? (global.RHT.getDefault('CONTRACT') || {}).id : '',
                invoiceTemplateId: global.RHT ? (global.RHT.getDefault('INVOICE') || {}).id : '',
                createdAt: Date.now()
            };
            writeAll('buildings', [building]);

            var fullAddress = buildingFullAddress(building);
            var invoiceTemplateId = global.RHT ? (global.RHT.getDefault('INVOICE') || {}).id : '';
            var contractTemplateId = global.RHT ? (global.RHT.getDefault('CONTRACT') || {}).id : '';
            var apt1 = { id: genId('apartment'), buildingId: building.id, name: '501', floor: 'Tầng 5', area: 20, maxGuests: 2, rentPrice: 2000000, depositPrice: 2000000, status: 'occupied', active: true, invoiceTemplateId: invoiceTemplateId, contractTemplateId: contractTemplateId, address: fullAddress, photos: [], note: '', createdAt: Date.now() };
            var apt2 = { id: genId('apartment'), buildingId: building.id, name: '502', floor: 'Tầng 5', area: 22, maxGuests: 3, rentPrice: 2200000, depositPrice: 2200000, status: 'deposited', active: true, invoiceTemplateId: invoiceTemplateId, contractTemplateId: contractTemplateId, address: fullAddress, photos: [], note: '', createdAt: Date.now() };
            var apt3 = { id: genId('apartment'), buildingId: building.id, name: '503', floor: 'Tầng 5', area: 18, maxGuests: 2, rentPrice: 1800000, depositPrice: 1800000, status: 'vacant', active: true, invoiceTemplateId: invoiceTemplateId, contractTemplateId: contractTemplateId, address: fullAddress, photos: [], note: '', createdAt: Date.now() };
            writeAll('apartments', [apt1, apt2, apt3]);

            var cus1 = { id: genId('customer'), fullName: 'Nguyễn Thị Hoa', phone: '0984646471', email: 'hoa.nguyen@email.vn', dob: '1996-03-12', gender: 'Nữ', idNumber: '017296001234', idIssueDate: '2020-05-10', idFrontPhoto: '', idBackPhoto: '', province: 'Thái Nguyên', ward: 'Phường Tích Lương', addressDetail: 'Tổ 14', customerType: 'Cá nhân', note: '', consultantName: 'Trần Văn Bình', consultantPhone: '0912345678', doorFingerprintCode: 'VT-0231', isForeigner: false, nationality: '', passportNumber: '', passportType: '', passportExpiry: '', passportPhoto: '', vehicles: [{ id: genId('veh'), type: 'Xe máy', model: 'Honda Vision', plate: '20-H1 123.45', color: 'Trắng', photo: '', ticket: 'VX-0501' }], createdAt: Date.now() };
            var cus2 = { id: genId('customer'), fullName: 'Lê Minh Đức', phone: '0977123456', email: '', dob: '1990-11-02', gender: 'Nam', idNumber: '017290005678', idIssueDate: '2019-02-18', idFrontPhoto: '', idBackPhoto: '', province: 'Thái Nguyên', ward: 'Phường Tích Lương', addressDetail: 'Tổ 14', customerType: 'Cá nhân', note: 'Đã đặt cọc căn 502', consultantName: 'Trần Văn Bình', consultantPhone: '0912345678', doorFingerprintCode: 'VT-0232', isForeigner: false, nationality: '', passportNumber: '', passportType: '', passportExpiry: '', passportPhoto: '', vehicles: [], createdAt: Date.now() };
            writeAll('customers', [cus1, cus2]);

            var contract1 = {
                id: genId('contract'), code: building.shortName + '-501-' + new Date().getFullYear() + '-001',
                buildingId: building.id, apartmentId: apt1.id, customerId: cus1.id,
                startDate: '2026-01-01', endDate: '2026-12-31', signDate: '2025-12-28',
                contractTemplateId: building.contractTemplateId, invoiceTemplateId: building.invoiceTemplateId,
                rentPrice: apt1.rentPrice, depositPrice: apt1.depositPrice, paymentCycle: 'monthly',
                referrer: '', collaborator: 'Trần Văn Bình', note: '', files: [], status: 'active', createdAt: Date.now()
            };
            writeAll('contracts', [contract1]);

            var meter1 = { id: genId('meter'), buildingId: building.id, apartmentId: apt1.id, meterType: 'electricity', meterCode: 'CTĐ-501', previousIndex: 80, latestIndex: 100, periodMonth: '2026-09', closingDate: '2026-09-30', consumption: 20, photo: '', createdAt: Date.now() };
            var meter2 = { id: genId('meter'), buildingId: building.id, apartmentId: apt1.id, meterType: 'water', meterCode: 'CTN-501', previousIndex: 10, latestIndex: 16, periodMonth: '2026-09', closingDate: '2026-09-30', consumption: 6, photo: '', createdAt: Date.now() };
            writeAll('meters', [meter1, meter2]);

            var elecSvc = building.services[1], waterSvc = building.services[2];
            var elecLine = calcServiceAmount(elecSvc, { meterReading: meter1 });
            var waterLine = calcServiceAmount(waterSvc, { meterReading: meter2 });
            var rentLine = { qty: 1, unitPrice: apt1.rentPrice, amount: apt1.rentPrice, tax: 0, total: apt1.rentPrice };
            var items = [
                { serviceId: building.services[0].id, label: 'Tiền thuê nhà', qty: 1, unitPrice: rentLine.unitPrice, amount: rentLine.amount, tax: rentLine.tax },
                { serviceId: elecSvc.id, label: 'Tiền điện (' + elecLine.qty + ' kWh)', qty: elecLine.qty, unitPrice: elecLine.unitPrice, amount: elecLine.amount, tax: elecLine.tax },
                { serviceId: waterSvc.id, label: 'Tiền nước (' + waterLine.qty + ' m³)', qty: waterLine.qty, unitPrice: waterLine.unitPrice, amount: waterLine.amount, tax: waterLine.tax }
            ];
            var subtotal = items.reduce(function (s, it) { return s + it.amount; }, 0);
            var taxTotal = items.reduce(function (s, it) { return s + it.tax; }, 0);
            var invoice1 = {
                id: genId('invoice'), code: 'HD' + new Date().getFullYear() + '-0001', contractId: contract1.id,
                buildingId: building.id, apartmentId: apt1.id, customerId: cus1.id, invoiceTemplateId: contract1.invoiceTemplateId,
                period: '2026-09', issueDate: '2026-09-30', dueDate: '2026-10-10',
                items: items, subtotal: subtotal, tax: taxTotal, total: subtotal + taxTotal,
                status: 'unpaid', sentAt: null, paidAt: null, createdAt: Date.now()
            };
            writeAll('invoices', [invoice1]);

            var request1 = {
                id: genId('support'), code: 'YC-0001', buildingId: building.id, apartmentId: apt1.id, customerId: cus1.id,
                residentEmail: 'resident@residenthub.vn', residentName: cus1.fullName,
                category: 'Sửa chữa căn hộ', title: 'Điều hòa phòng khách không lạnh',
                description: 'Điều hòa bật lên nhưng không làm lạnh, nhờ kỹ thuật kiểm tra giúp.',
                location: 'Phòng khách, căn ' + apt1.name, priority: 'needed', status: 'in_progress',
                assignee: 'Nguyễn Văn A', attachments: 0, messages: [],
                createdAt: Date.now() - 3 * 3600000, updatedAt: Date.now() - 1800000
            };
            writeAll('supportRequests', [request1]);
        } finally {
            global.RHD_MODE = prevMode;
        }
    }

    function setMode(m) {
        global.RHD_MODE = m === 'demo' ? 'demo' : 'live';
        // Template library seeds first — building seed data below references
        // RHT.getDefault() to pick its default contract/invoice template.
        if (global.RHT) global.RHT.seed();
        // Seeds once (seedDataset no-ops once a dataset already has data), so a demo
        // visitor always sees a complete sample system on first visit, and anything
        // they add afterwards persists alongside it instead of being wiped.
        // DEMO_LIMITS is sized with headroom above the seed so "Thêm" stays usable.
        seedDataset(global.RHD_MODE);
    }

    function resetDemo() {
        ENTITIES.forEach(function (entity) {
            localStorage.removeItem('residenthub_demo_' + entity);
        });
        localStorage.removeItem('residenthub_demo_templates');
        if (global.RHT) global.RHT.seed();
        seedDataset('demo');
    }

    global.RHD = {
        ENTITIES: ENTITIES,
        DEMO_LIMITS: DEMO_LIMITS,
        FEE_TYPES: FEE_TYPES,
        CALC_METHODS: CALC_METHODS,
        APARTMENT_STATUSES: APARTMENT_STATUSES,
        VEHICLE_TYPES: VEHICLE_TYPES,
        PAYMENT_CYCLES: PAYMENT_CYCLES,
        INVOICE_STATUSES: INVOICE_STATUSES,
        ISSUED_INVOICE_STATUSES: ISSUED_INVOICE_STATUSES,
        isIssuedInvoice: isIssuedInvoice,
        SUPPORT_STATUSES: SUPPORT_STATUSES,
        SUPPORT_PRIORITIES: SUPPORT_PRIORITIES,
        SUPPORT_CATEGORIES: SUPPORT_CATEGORIES,
        SUPPORT_STAFF_GROUPS: SUPPORT_STAFF_GROUPS,
        SETTINGS_DEFAULTS: SETTINGS_DEFAULTS,
        PROVINCES: PROVINCES,
        WARD_SUGGESTIONS: WARD_SUGGESTIONS,
        setMode: setMode,
        mode: mode,
        getSettings: getSettings,
        saveSettings: saveSettings,
        list: list,
        get: get,
        create: create,
        update: update,
        remove: remove,
        limitInfo: limitInfo,
        apartmentsOf: apartmentsOf,
        contractsOf: contractsOf,
        activeContractFor: activeContractFor,
        latestMeter: latestMeter,
        assetsOf: assetsOf,
        managerAccounts: managerAccounts,
        eligibleManagers: eligibleManagers,
        buildingManager: buildingManager,
        residentPlacement: residentPlacement,
        parseReminderDays: parseReminderDays,
        defaultDueDate: defaultDueDate,
        markOverdueInvoices: markOverdueInvoices,
        dashboardStats: dashboardStats,
        utilityPolicy: utilityPolicy,
        findApartmentByUnit: findApartmentByUnit,
        residentContext: residentContext,
        nextBuildingCode: nextBuildingCode,
        nextContractCode: nextContractCode,
        nextInvoiceCode: nextInvoiceCode,
        nextSupportCode: nextSupportCode,
        buildingFullAddress: buildingFullAddress,
        calcServiceAmount: calcServiceAmount,
        resetDemo: resetDemo
    };
})(window);
