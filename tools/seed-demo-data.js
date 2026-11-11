#!/usr/bin/env node

import { clearDemoData } from './clear-demo-data.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ORGANIZATION_ID = '32652966-796f-48ac-abe1-dbbc19f5fd75';
const ORGANIZATION_ID = process.env.SUPABASE_ORGANIZATION_ID || DEFAULT_ORGANIZATION_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_PREFIX = 'demo-rh-';
const ORGANIZATION_COLUMNS = {
    rh_organizations: 'id',
    rh_account_types: 'organization_id',
    rh_memberships: 'organization_id',
    rh_building_assignments: 'organization_id',
    rh_buildings: 'organization_id',
    rh_apartments: 'organization_id',
    rh_customers: 'organization_id',
    rh_contracts: 'organization_id',
    rh_contract_tenants: 'organization_id',
    rh_deposits: 'organization_id',
    rh_deposit_transactions: 'organization_id',
    rh_meters: 'organization_id',
    rh_invoices: 'organization_id',
    rh_support_requests: 'organization_id',
    rh_assets: 'organization_id',
    rh_notification_campaigns: 'organization_id',
    rh_notifications: 'organization_id'
};
const BUILDING_IDS = Array.from({ length: 4 }, (_, index) =>
    `${DEMO_PREFIX}building-${String(index + 1).padStart(2, '0')}`);
const REQUIRED_MANAGER_VIEWS = [
    'buildings.view', 'apartments.view', 'customers.view', 'meters.view',
    'contracts.view', 'invoices.view', 'support.view', 'assets.view', 'notifications.view'
];

const BUILDING_DETAILS = [
    { district: 'Cầu Giấy', ward: 'Dịch Vọng Hậu', street: 'Trần Thái Tông', number: 42, name: 'An Phú Residence' },
    { district: 'Thanh Xuân', ward: 'Nhân Chính', street: 'Hoàng Đạo Thúy', number: 18, name: 'Green Horizon' },
    { district: 'Nam Từ Liêm', ward: 'Mỹ Đình 1', street: 'Nguyễn Cơ Thạch', number: 25, name: 'Mỹ Đình Garden' },
    { district: 'Hà Đông', ward: 'Mộ Lao', street: 'Nguyễn Văn Lộc', number: 12, name: 'Mộ Lao Central' }
];

const GIVEN_NAMES = ['Minh Anh', 'Thu Hà', 'Quang Huy', 'Ngọc Lan', 'Hoàng Nam', 'Mai Phương', 'Đức Anh', 'Thanh Tâm', 'Gia Bảo', 'Khánh Linh'];
const FAMILY_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ'];
const MIDDLE_NAMES = ['Thị', 'Văn', 'Minh', 'Ngọc', 'Thu', 'Quốc', 'Hồng', 'Xuân'];
const ASSET_TYPES = [
    { name: 'Thang máy', category: 'Thiết bị chung', serial: 'ELV' },
    { name: 'Máy bơm nước', category: 'Thiết bị chung', serial: 'PMP' },
    { name: 'Hệ thống camera', category: 'An ninh', serial: 'CAM' },
    { name: 'Máy phát điện', category: 'Thiết bị chung', serial: 'GEN' }
];
const NOTICES = [
    { title: 'Bảo trì thang máy', body: 'Đơn vị kỹ thuật bảo trì thang máy theo lịch; vui lòng sử dụng thang còn lại trong thời gian thực hiện.', type: 'UTILITY' },
    { title: 'Lịch cắt nước kiểm tra hệ thống', body: 'Ban quản lý tạm ngừng cấp nước trong khung giờ thông báo để kiểm tra đường ống và máy bơm.', type: 'ANNOUNCEMENT' },
    { title: 'Mời họp cư dân', body: 'Kính mời cư dân tham dự cuộc họp định kỳ tại phòng sinh hoạt cộng đồng.', type: 'EVENT' },
    { title: 'Thông báo thu phí tháng', body: 'Hóa đơn phí dịch vụ đã được cập nhật; vui lòng kiểm tra kỳ thanh toán trên ResidentHuB.', type: 'BILLING' }
];

function assertEnvironment() {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        throw new Error('Cần đặt SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong environment.');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ORGANIZATION_ID)) {
        throw new Error('SUPABASE_ORGANIZATION_ID phải là UUID.');
    }
    const url = new URL(SUPABASE_URL);
    if ((url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new Error('SUPABASE_URL phải là URL HTTPS hợp lệ, không kèm thông tin đăng nhập.');
    }
    return url.origin;
}

async function request(baseUrl, path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            Prefer: 'return=minimal',
            ...options.headers
        }
    });
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(`Supabase trả về JSON không hợp lệ (HTTP ${response.status}).`);
    }
    if (!response.ok) {
        const detail = data?.message || data?.msg || data?.error_description || data?.error || response.statusText;
        throw new Error(`Supabase từ chối yêu cầu (HTTP ${response.status}): ${detail}`);
    }
    return data;
}

function restPath(table, query = {}) {
    const organizationColumn = ORGANIZATION_COLUMNS[table];
    if (!organizationColumn) throw new Error(`Chưa khai báo cột organization cho bảng ${table}.`);
    const params = new URLSearchParams({ [organizationColumn]: `eq.${ORGANIZATION_ID}`, ...query });
    const search = params.toString();
    return `/rest/v1/${table}${search ? `?${search}` : ''}`;
}

async function selectRows(baseUrl, table, query) {
    const rows = await request(baseUrl, restPath(table, query));
    if (!Array.isArray(rows)) throw new Error(`Kết quả không hợp lệ khi đọc ${table}.`);
    return rows;
}

async function upsertRows(baseUrl, table, rows, conflictColumns = 'organization_id,id') {
    if (!rows.length) return;
    const params = new URLSearchParams({ on_conflict: conflictColumns });
    await request(baseUrl, `/rest/v1/${table}?${params}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows)
    });
}

async function patchRow(baseUrl, table, query, patch) {
    await request(baseUrl, restPath(table, query), { method: 'PATCH', body: JSON.stringify(patch) });
}

async function adminUsers(baseUrl) {
    const pageSize = 1000;
    const users = [];
    for (let page = 1; ; page++) {
        const params = new URLSearchParams({ page: String(page), per_page: String(pageSize) });
        const result = await request(baseUrl, `/auth/v1/admin/users?${params}`);
        const batch = Array.isArray(result) ? result : result?.users;
        if (!Array.isArray(batch)) throw new Error('Không đọc được danh sách Auth users.');
        users.push(...batch);
        if (batch.length < pageSize) return users;
    }
}

function buildId(kind, ...parts) {
    return `${DEMO_PREFIX}${kind}-${parts.join('-')}`;
}

function marker(id, fields = {}) {
    return { id, demo: true, demoKey: id, ...fields };
}

function monthDate(offset) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
}

function monthKey(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

function daysAfter(date, amount) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + amount);
    return result;
}

function lastDayOfMonth(month) {
    return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
}

function makeCustomer(personIndex, buildingIndex, unit, detail, apartmentId, createdAt) {
    const family = FAMILY_NAMES[personIndex % FAMILY_NAMES.length];
    const middle = MIDDLE_NAMES[personIndex % MIDDLE_NAMES.length];
    const given = GIVEN_NAMES[personIndex % GIVEN_NAMES.length];
    const fullName = `${family} ${middle} ${given}`;
    const unitName = `${Math.ceil(unit / 3) + 1}${String((unit - 1) % 3 + 1).padStart(2, '0')}`;
    const id = buildId('customer', String(personIndex + 1).padStart(3, '0'));
    return marker(id, {
        fullName,
        name: fullName,
        phone: `09${String(10000000 + personIndex + 1).slice(-8)}`,
        email: `resident-${String(personIndex + 1).padStart(3, '0')}@demo.local`,
        dob: `19${80 + (personIndex % 20)}-${String((personIndex % 12) + 1).padStart(2, '0')}-15`,
        gender: personIndex % 2 ? 'Nữ' : 'Nam',
        customerType: 'Cá nhân',
        province: 'Hà Nội',
        ward: detail.ward,
        addressDetail: `${detail.number} ${detail.street}, căn ${unitName}`,
        buildingId: BUILDING_IDS[buildingIndex],
        apartmentId,
        note: 'Dữ liệu mẫu ResidentHuB; không phải hồ sơ cư dân thực.',
        vehicles: [],
        createdAt
    });
}

function buildDataset() {
    const now = Date.now();
    const today = new Date();
    const todayString = isoDate(today);
    const buildings = BUILDING_DETAILS.map((detail, index) => {
        const id = BUILDING_IDS[index];
        const fullAddress = `${detail.number} ${detail.street}, phường ${detail.ward}, quận ${detail.district}, Hà Nội`;
        return marker(id, {
            code: `DEMO-HN-${String(index + 1).padStart(2, '0')}`,
            name: `${detail.name} (Demo)`,
            shortName: `DHN${String(index + 1).padStart(2, '0')}`,
            province: 'Hà Nội',
            ward: `Phường ${detail.ward}`,
            addressDetail: `${detail.number} ${detail.street}, quận ${detail.district}`,
            managerId: null,
            services: [
                { id: buildId('service', index + 1, 'rent'), name: 'Tiền thuê nhà', feeType: 'rent', calcMethod: 'fixed', unitPrice: 0, taxRate: 0 },
                { id: buildId('service', index + 1, 'electricity'), name: 'Tiền điện', feeType: 'electricity', calcMethod: 'meter', unitPrice: 3800, taxRate: 8 },
                { id: buildId('service', index + 1, 'water'), name: 'Tiền nước', feeType: 'water', calcMethod: 'meter', unitPrice: 18000, taxRate: 5 },
                { id: buildId('service', index + 1, 'management'), name: 'Phí quản lý', feeType: 'management', calcMethod: 'apartment', unitPrice: 150000, taxRate: 0 }
            ],
            config: { autoDebitAccount: '', eInvoiceEnabled: false, bankName: '', bankAccountNumber: '', bankAccountHolder: '' },
            createdAt: now,
            address: fullAddress
        });
    });

    const apartments = [];
    const residents = [];
    const contracts = [];
    const contractTenants = [];
    const deposits = [];
    const depositTransactions = [];
    const meters = [];
    const invoices = [];
    const supportRequests = [];
    const assets = [];

    let extraFamilyMembers = 0;
    for (let buildingIndex = 0; buildingIndex < BUILDING_DETAILS.length; buildingIndex++) {
        const detail = BUILDING_DETAILS[buildingIndex];
        const buildingId = BUILDING_IDS[buildingIndex];
        const fullAddress = `${detail.number} ${detail.street}, phường ${detail.ward}, quận ${detail.district}, Hà Nội`;

        for (let unit = 1; unit <= 15; unit++) {
            const unitCode = String(unit).padStart(2, '0');
            const buildingCode = String(buildingIndex + 1).padStart(2, '0');
            const apartmentId = buildId('apartment', buildingCode, unitCode);
            const floorNumber = Math.ceil(unit / 3) + 1;
            const unitName = `${floorNumber}${String((unit - 1) % 3 + 1).padStart(2, '0')}`;
            const occupied = unit <= 11;
            const deposited = unit === 12 || unit === 13;
            const status = occupied ? 'occupied' : deposited ? 'deposited' : 'vacant';
            const area = 35 + ((buildingIndex * 19 + unit * 7) % 76);
            const rentPrice = area * (95000 + (buildingIndex % 4) * 5000);
            const household = [];

            if (occupied) {
                const primary = makeCustomer(residents.length, buildingIndex, unit, detail, apartmentId, now);
                residents.push(primary);
                household.push(primary);
                if (extraFamilyMembers < 2) {
                    const familyMember = makeCustomer(residents.length, buildingIndex, unit, detail, apartmentId, now);
                    residents.push(familyMember);
                    household.push(familyMember);
                    extraFamilyMembers++;
                }
            } else if (deposited) {
                const prospectiveTenant = makeCustomer(residents.length, buildingIndex, unit, detail, apartmentId, now);
                prospectiveTenant.note = 'Khách thuê mẫu đang giữ chỗ; hồ sơ demo.';
                residents.push(prospectiveTenant);
                household.push(prospectiveTenant);
            }

            apartments.push(marker(apartmentId, {
                buildingId,
                name: unitName,
                floor: `Tầng ${floorNumber}`,
                area,
                maxGuests: 2 + (unit % 3),
                rentPrice,
                depositPrice: rentPrice,
                status,
                active: true,
                rentalStatus: occupied ? 'occupied' : deposited ? 'deposited' : 'for_rent',
                address: fullAddress,
                note: deposited ? 'Đã nhận đặt cọc; chờ ngày nhận căn.' : status === 'vacant' ? 'Căn hộ mẫu đang để trống.' : '',
                customerId: household[0]?.id || '',
                createdAt: now
            }));

            if (deposited) {
                const prospectiveTenant = household[0];
                const depositDate = daysAfter(today, -(3 + buildingIndex * 2 + unit));
                const moveInDate = daysAfter(today, 14 + buildingIndex + unit);
                const leaseStartDate = moveInDate;
                const leaseEndDate = new Date(Date.UTC(
                    moveInDate.getUTCFullYear() + 1,
                    moveInDate.getUTCMonth(),
                    moveInDate.getUTCDate()
                ));
                const depositFullAmount = rentPrice;
                const depositReceivedAmount = Math.round(depositFullAmount * 0.3);
                const depositId = buildId('deposit', buildingCode, unitCode);
                const depositCode = `DC-DHN${buildingCode}-${unitName}-${String(unit).padStart(3, '0')}`;
                const transactionId = buildId('deposit-transaction', buildingCode, unitCode, 'receive');
                const depositRecord = marker(depositId, {
                    code: depositCode,
                    buildingId,
                    apartmentId,
                    roomId: '',
                    bedId: '',
                    tenantIds: [prospectiveTenant.id],
                    customerId: prospectiveTenant.id,
                    occupantCount: 1,
                    referrerUserId: '',
                    referrerName: '',
                    rentPrice,
                    depositMonths: 1,
                    depositFullAmount,
                    depositReceivedAmount,
                    depositRemainingAmount: depositFullAmount - depositReceivedAmount,
                    discountMonths: 0,
                    discountAmountPerMonth: 0,
                    depositDate: isoDate(depositDate),
                    moveInDate: isoDate(moveInDate),
                    rentStartDate: isoDate(moveInDate),
                    leaseStartDate: isoDate(leaseStartDate),
                    leaseEndDate: isoDate(leaseEndDate),
                    paymentCycle: 'monthly',
                    receivingAccount: 'Chuyển khoản · tài khoản demo',
                    services: [],
                    status: 'holding',
                    contractId: '',
                    isDeleted: false,
                    createdAt: now,
                    updatedAt: now
                });
                deposits.push(depositRecord);
                depositTransactions.push(marker(transactionId, {
                    depositId,
                    buildingId,
                    type: 'receive',
                    label: 'Nhận cọc',
                    amount: depositReceivedAmount,
                    date: isoDate(depositDate),
                    note: 'Ghi nhận tiền giữ chỗ mẫu; giao dịch demo.',
                    actorId: '',
                    actorName: 'Ban quản lý Demo',
                    createdAt: now
                }));
            }

            if (!occupied) continue;

            const primary = household[0];
            const contractId = buildId('contract', buildingCode, unitCode);
            const tenantIds = household.map(person => person.id);
            const contract = marker(contractId, {
                code: `HD-DEMO-${buildingCode}-${unitCode}`,
                buildingId,
                apartmentId,
                customerId: primary.id,
                tenantIds,
                startDate: isoDate(new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), 1))),
                endDate: isoDate(new Date(Date.UTC(today.getUTCFullYear() + 1, today.getUTCMonth(), 0))),
                signDate: isoDate(new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth() - 1, 20))),
                rentPrice,
                depositPrice: rentPrice,
                paymentCycle: 'monthly',
                status: 'active',
                note: 'Hợp đồng mẫu ResidentHuB.',
                files: [],
                createdAt: now
            });
            contracts.push(contract);
            tenantIds.forEach(customerId => contractTenants.push({
                organization_id: ORGANIZATION_ID,
                contract_id: contractId,
                customer_id: customerId
            }));

            const meterBase = buildingIndex * 31 + unit * 9;
            const utilityDefinitions = [
                { type: 'electricity', code: 'D', start: 130 + meterBase, baseUse: 18, useRange: 25 },
                { type: 'water', code: 'N', start: 28 + Math.floor(meterBase / 3), baseUse: 4, useRange: 6 }
            ];
            for (const utility of utilityDefinitions) {
                let cumulativeIndex = utility.start;
                for (const offset of [1, 0]) {
                    const period = monthDate(offset);
                    const consumption = utility.baseUse + ((buildingIndex * 5 + unit * 3 + offset) % utility.useRange);
                    const previousIndex = cumulativeIndex;
                    const latestIndex = previousIndex + consumption;
                    cumulativeIndex = latestIndex;
                    const closingDate = offset === 0 && today.getUTCDate() < lastDayOfMonth(period).getUTCDate()
                        ? todayString
                        : isoDate(lastDayOfMonth(period));
                    meters.push(marker(buildId('meter', buildingCode, unitCode, utility.code, monthKey(period)), {
                        buildingId,
                        apartmentId,
                        meterType: utility.type,
                        meterCode: `CT${utility.code}-${buildingCode}-${unitCode}`,
                        previousIndex,
                        latestIndex,
                        periodMonth: monthKey(period),
                        closingDate,
                        consumption,
                        createdAt: now
                    }));
                }
            }

            for (const offset of [2, 1, 0]) {
                const periodMonth = monthDate(offset);
                const period = monthKey(periodMonth);
                const invoiceId = buildId('invoice', buildingCode, unitCode, period);
                const sequence = buildingIndex * 11 + unit;
                const isResidentAccountInvoice = buildingIndex === 0 && unit === 1 && offset === 0;
                const status = isResidentAccountInvoice ? 'unpaid'
                    : offset > 0 && sequence % 13 === 0 ? 'overdue'
                        : offset === 0 && sequence % 7 === 0 ? 'unpaid'
                            : 'paid';
                const issue = offset === 0 ? today : lastDayOfMonth(periodMonth);
                const due = daysAfter(issue, status === 'overdue' ? 5 : 10);
                const electricityUse = utilityDefinitions[0].baseUse + ((buildingIndex * 5 + unit * 3) % utilityDefinitions[0].useRange);
                const waterUse = utilityDefinitions[1].baseUse + ((buildingIndex * 5 + unit * 3) % utilityDefinitions[1].useRange);
                const electricityAmount = electricityUse * 3800;
                const waterAmount = waterUse * 18000;
                const managementAmount = 150000;
                const items = [
                    { label: 'Tiền thuê nhà', qty: 1, unitPrice: rentPrice, amount: rentPrice, tax: 0 },
                    { label: `Tiền điện (${electricityUse} kWh)`, qty: electricityUse, unitPrice: 3800, amount: electricityAmount, tax: Math.round(electricityAmount * 0.08) },
                    { label: `Tiền nước (${waterUse} m³)`, qty: waterUse, unitPrice: 18000, amount: waterAmount, tax: Math.round(waterAmount * 0.05) },
                    { label: 'Phí quản lý', qty: 1, unitPrice: managementAmount, amount: managementAmount, tax: 0 }
                ];
                const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
                const taxTotal = items.reduce((sum, item) => sum + item.tax, 0);
                const total = subtotal + taxTotal;
                const paidAt = status === 'paid'
                    ? (offset === 0 ? new Date(now).toISOString() : new Date(daysAfter(issue, 3)).toISOString())
                    : null;
                const paymentTransactions = status === 'paid' ? [{
                    id: buildId('payment', buildingCode, unitCode, period),
                    amount: total,
                    date: paidAt,
                    paymentMethod: 'bank_transfer',
                    reference: `DEMO-${buildingCode}-${unitCode}-${period}`,
                    status: 'completed',
                    demo: true
                }] : [];
                invoices.push(marker(invoiceId, {
                    code: `HD-DEMO-${buildingCode}-${unitCode}-${period.replace('-', '')}`,
                    buildingId,
                    apartmentId,
                    contractId,
                    customerId: primary.id,
                    period,
                    issueDate: isoDate(issue),
                    dueDate: isoDate(due),
                    items,
                    subtotal,
                    tax: taxTotal,
                    taxTotal,
                    total,
                    status,
                    paidAt,
                    paidAmount: status === 'paid' ? total : 0,
                    amountPaid: status === 'paid' ? total : 0,
                    paymentMethod: status === 'paid' ? 'bank_transfer' : '',
                    paymentTransactions,
                    createdAt: now
                }));
            }
        }
    }

    const occupiedApartments = apartments.filter(apartment => apartment.status === 'occupied');
    const targetApartmentId = buildId('apartment', '01', '01');
    const targetCustomer = residents.find(person => person.apartmentId === targetApartmentId);
    if (!targetCustomer) throw new Error('Không tạo được customer cho căn hộ gắn với resident@demo.com.');

    const supportTopics = [
        { category: 'Sửa chữa căn hộ', title: 'Ổ cắm điện phòng ngủ chập chờn', status: 'new' },
        { category: 'Sửa chữa căn hộ', title: 'Vòi nước nhà tắm bị rò rỉ', status: 'in_progress' },
        { category: 'Cơ sở vật chất chung', title: 'Thang máy phát tiếng động khi vận hành', status: 'resolved' },
        { category: 'Sửa chữa căn hộ', title: 'Điều hòa phòng khách cần vệ sinh', status: 'in_progress' },
        { category: 'Cơ sở vật chất chung', title: 'Đèn hành lang tầng bị hỏng', status: 'new' },
        { category: 'Sửa chữa căn hộ', title: 'Bình nóng lạnh chưa làm nóng nước', status: 'resolved' },
        { category: 'Cơ sở vật chất chung', title: 'Kiểm tra áp lực máy bơm nước', status: 'in_progress' },
        { category: 'Sửa chữa căn hộ', title: 'Cửa ban công cần căn chỉnh', status: 'new' }
    ];
    for (let index = 0; index < supportTopics.length; index++) {
        const topic = supportTopics[index];
        const apartment = index === 0
            ? apartments.find(item => item.id === targetApartmentId)
            : occupiedApartments[(index * 5) % occupiedApartments.length];
        const customer = residents.find(person => person.apartmentId === apartment.id);
        supportRequests.push(marker(buildId('support', String(index + 1).padStart(2, '0')), {
            code: `YC-DEMO-${String(index + 1).padStart(2, '0')}`,
            buildingId: apartment.buildingId,
            apartmentId: apartment.id,
            customerId: customer.id,
            residentEmail: index === 0 ? 'resident@demo.com' : customer.email,
            residentName: customer.fullName,
            category: topic.category,
            title: topic.title,
            description: 'Yêu cầu minh họa, không phải sự cố thực tế.',
            location: `Căn ${apartment.name}`,
            priority: index === 0 ? 'needed' : index % 3 === 0 ? 'urgent' : 'normal',
            status: topic.status,
            assignee: '',
            assigneeId: '',
            attachments: 0,
            messages: [],
            createdAt: now - index * 6 * 3600000,
            updatedAt: now - index * 2 * 3600000
        }));
    }

    for (let buildingIndex = 0; buildingIndex < BUILDING_DETAILS.length; buildingIndex++) {
        for (let assetIndex = 0; assetIndex < ASSET_TYPES.length; assetIndex++) {
            const asset = ASSET_TYPES[assetIndex];
            assets.push(marker(buildId('asset', String(buildingIndex + 1).padStart(2, '0'), String(assetIndex + 1).padStart(2, '0')), {
                buildingId: BUILDING_IDS[buildingIndex],
                apartmentId: '',
                name: asset.name,
                category: asset.category,
                serialNumber: `DEMO-${asset.serial}-${String(buildingIndex + 1).padStart(2, '0')}`,
                status: 'active',
                quantity: asset.name === 'Hệ thống camera' ? 12 : 1,
                purchaseDate: '2025-06-15',
                note: 'Tài sản minh họa ResidentHuB.',
                createdAt: now
            }));
        }
    }

    const notificationCampaigns = NOTICES.map((notice, index) => {
        const id = buildId('notice', String(index + 1).padStart(2, '0'));
        return marker(id, {
            title: notice.title,
            body: notice.body,
            type: notice.type,
            priority: 'NORMAL',
            audience: 'all',
            status: 'sent',
            createdAt: now - index * 86400000,
            updatedAt: now,
            targetUserIds: [],
            recipientCount: 0,
            recipients: []
        });
    });

    const data = {
        buildings,
        apartments,
        customers: residents,
        contracts,
        contractTenants,
        deposits,
        depositTransactions,
        meters,
        invoices,
        supportRequests,
        assets,
        notificationCampaigns,
        targetCustomerId: targetCustomer.id,
        targetApartmentId
    };
    validateDataset(data);
    return data;
}

function validateDataset(data) {
    const occupied = data.apartments.filter(apartment => apartment.status === 'occupied').length;
    const occupiedRate = occupied / data.apartments.length;
    if (data.buildings.length !== 4 || data.apartments.length !== 60 ||
        data.customers.length < 50 || data.customers.length > 60 ||
        data.contracts.length !== occupied || data.deposits.length !== data.apartments.filter(apartment => apartment.status === 'deposited').length ||
        data.depositTransactions.length !== data.deposits.length || data.invoices.length !== occupied * 3 ||
        data.meters.length !== occupied * 4 || occupiedRate < 0.65 || occupiedRate > 0.75) {
        throw new Error('Dữ liệu tạo ra không đạt các số lượng/tỷ lệ mẫu đã yêu cầu.');
    }
    for (const recordSet of [
        data.buildings, data.apartments, data.customers, data.contracts, data.meters,
        data.deposits, data.depositTransactions, data.invoices, data.supportRequests, data.assets, data.notificationCampaigns
    ]) {
        if (recordSet.some(record => record.demo !== true || !record.id.startsWith(DEMO_PREFIX))) {
            throw new Error('Có bản ghi không mang demo marker và tiền tố demo-rh-.');
        }
    }
    const residentInvoices = data.invoices.filter(invoice =>
        invoice.apartmentId === data.targetApartmentId && invoice.period === monthKey(monthDate(0)));
    if (residentInvoices.length !== 1 || residentInvoices[0].status !== 'unpaid') {
        throw new Error('Căn hộ cư dân demo phải có đúng một hóa đơn kỳ mới nhất chưa thanh toán.');
    }
    if (!data.invoices.some(invoice => invoice.status === 'overdue') ||
        !data.invoices.filter(invoice => invoice.status === 'paid').every(invoice =>
            invoice.paymentTransactions.length > 0 && invoice.paidAmount === invoice.total)) {
        throw new Error('Dữ liệu hóa đơn thiếu trạng thái quá hạn hoặc lịch sử thanh toán.');
    }
    for (const apartment of data.apartments.filter(item => item.status === 'occupied')) {
        const readings = data.meters.filter(reading => reading.apartmentId === apartment.id);
        const bills = data.invoices.filter(invoice => invoice.apartmentId === apartment.id);
        if (readings.length !== 4 || bills.length !== 3) {
            throw new Error(`Thiếu lịch sử chỉ số hoặc hóa đơn cho căn ${apartment.id}.`);
        }
    }
    for (const deposit of data.deposits) {
        const apartment = data.apartments.find(item => item.id === deposit.apartmentId);
        const tenant = data.customers.find(item => item.id === deposit.customerId);
        if (!apartment || apartment.status !== 'deposited' || !tenant ||
            deposit.buildingId !== apartment.buildingId ||
            deposit.depositReceivedAmount > deposit.depositFullAmount ||
            !data.depositTransactions.some(transaction =>
                transaction.depositId === deposit.id && transaction.type === 'receive' &&
                transaction.amount === deposit.depositReceivedAmount)) {
            throw new Error(`Đặt cọc demo không hợp lệ cho căn ${deposit.apartmentId}.`);
        }
    }
}

async function findDemoMembers(baseUrl) {
    const users = await adminUsers(baseUrl);
    const emails = ['manager@demo.com', 'staff@demo.com', 'resident@demo.com'];
    const authByEmail = new Map();
    for (const email of emails) {
        const matches = users.filter(user => user.email?.toLowerCase() === email);
        if (matches.length !== 1) throw new Error(`Cần đúng một Auth user ${email}; hãy kiểm tra cấu hình demo users trước.`);
        authByEmail.set(email, matches[0]);
    }

    const memberRows = await selectRows(baseUrl, 'rh_memberships', {
        organization_id: `eq.${ORGANIZATION_ID}`,
        select: 'id,auth_user_id,account_type_id,role,status,all_buildings,resident_id,profile,name'
    });
    const result = {};
    for (const [key, email, role, accountTypeId] of [
        ['manager', 'manager@demo.com', 'manager', 'at-building-manager'],
        ['staff', 'staff@demo.com', 'staff', 'at-staff'],
        ['resident', 'resident@demo.com', 'resident', 'at-resident']
    ]) {
        const authUser = authByEmail.get(email);
        const matches = memberRows.filter(member => member.auth_user_id === authUser.id);
        if (matches.length !== 1) throw new Error(`Thiếu hoặc trùng membership của ${email} trong organization.`);
        const member = matches[0];
        if (member.status !== 'active' || member.role !== role || member.account_type_id !== accountTypeId) {
            throw new Error(`${email}: cần membership active, role=${role}, account_type_id=${accountTypeId}; hiện tại status=${member.status}, role=${member.role}, type=${member.account_type_id}.`);
        }
        result[key] = { ...member, email };
    }
    if (result.staff.all_buildings) {
        throw new Error('staff@demo.com đang có all_buildings=true; script dừng để không âm thầm thay đổi phạm vi hiện có.');
    }
    const existingResidentId = result.resident.resident_id;
    if (existingResidentId && !existingResidentId.startsWith(`${DEMO_PREFIX}customer-`)) {
        throw new Error(`resident@demo.com đang gắn với customer không phải demo (${existingResidentId}); từ chối ghi đè.`);
    }
    const currentApartment = result.resident.profile?.apartmentId;
    if (currentApartment && !currentApartment.startsWith(`${DEMO_PREFIX}apartment-`)) {
        throw new Error('profile.apartmentId của resident@demo.com đang trỏ tới dữ liệu không phải demo; từ chối ghi đè.');
    }
    return result;
}

async function inspectSetup(baseUrl) {
    const [organizations, types] = await Promise.all([
        selectRows(baseUrl, 'rh_organizations', {
            id: `eq.${ORGANIZATION_ID}`,
            select: 'id,identity_enabled,data_access_enabled'
        }),
        selectRows(baseUrl, 'rh_account_types', {
            organization_id: `eq.${ORGANIZATION_ID}`,
            id: 'in.(at-building-manager,at-staff,at-resident)',
            select: 'id,portal,permissions,full_access'
        })
    ]);
    if (organizations.length !== 1) throw new Error('Không tìm thấy organization đã cấu hình.');
    if (!organizations[0].identity_enabled || !organizations[0].data_access_enabled) {
        throw new Error('Chưa mở đủ identity/data gate. Hãy kiểm tra và chạy SQL bật cờ trước khi seed; script không tự thay đổi các cờ này.');
    }

    const typeById = new Map(types.map(type => [type.id, type]));
    for (const [id, portal] of [
        ['at-building-manager', 'manager'], ['at-staff', 'manager'], ['at-resident', 'resident']
    ]) {
        if (typeById.get(id)?.portal !== portal) throw new Error(`Thiếu account type ${id} hoặc portal không đúng (${portal}).`);
    }

    const members = await findDemoMembers(baseUrl);
    const managerType = typeById.get(members.manager.account_type_id);
    const permissions = Array.isArray(managerType.permissions) ? managerType.permissions : [];
    const missingViews = REQUIRED_MANAGER_VIEWS.filter(permission =>
        !managerType.full_access && !permissions.includes(permission));
    if (missingViews.length) {
        throw new Error(`at-building-manager thiếu quyền xem: ${missingViews.join(', ')}. Hãy cấp đúng các quyền cần thiết trước khi seed; script không tự sửa quyền.`);
    }
    return members;
}

async function applyAssignments(baseUrl, members) {
    const assignments = [
        ...BUILDING_IDS.map(building_id => ({
            organization_id: ORGANIZATION_ID,
            member_id: members.manager.id,
            building_id
        })),
        ...BUILDING_IDS.slice(0, 3).map(building_id => ({
            organization_id: ORGANIZATION_ID,
            member_id: members.staff.id,
            building_id
        }))
    ];
    await upsertRows(baseUrl, 'rh_building_assignments', assignments, 'organization_id,member_id,building_id');
}

async function bindResident(baseUrl, member, resident) {
    const profile = member.profile && typeof member.profile === 'object' ? { ...member.profile } : {};
    profile.apartmentId = resident.apartmentId;
    await patchRow(baseUrl, 'rh_memberships', {
        id: `eq.${member.id}`
    }, { resident_id: resident.id, profile, all_buildings: false });
}

function bindSupportRequests(data, members) {
    return data.supportRequests.map((record, index) => {
        if (index === 0) {
            return {
                ...record,
                residentEmail: members.resident.email,
                residentName: members.resident.name || record.residentName
            };
        }
        return {
            ...record,
            assignee: members.staff.name,
            assigneeId: members.staff.id,
            responsibleManagerId: members.manager.id
        };
    });
}

async function seedNotifications(baseUrl, campaigns, members) {
    const targetUsers = [members.manager, members.staff, members.resident];
    const campaignRows = campaigns.map(campaign => {
        const recipients = targetUsers.map(member => ({ id: member.id, name: member.name }));
        return {
            ...campaign,
            targetUserIds: targetUsers.map(member => member.id),
            recipientCount: recipients.length,
            recipients
        };
    });
    await upsertRows(baseUrl, 'rh_notification_campaigns', campaignRows.map(payload => ({
        organization_id: ORGANIZATION_ID,
        payload
    })));

    const notifications = targetUsers.flatMap(member => campaignRows.map(campaign => {
        const id = buildId('notification', member.role, campaign.id.slice(`${DEMO_PREFIX}notice-`.length));
        return {
            organization_id: ORGANIZATION_ID,
            id,
            recipient_id: member.id,
            payload: marker(id, {
                title: campaign.title,
                body: campaign.body,
                type: campaign.type,
                subType: 'NOTICE',
                priority: campaign.priority,
                refType: 'notifications',
                refId: campaign.id,
                campaignId: campaign.id,
                eventId: '',
                audience: 'all',
                status: 'sent',
                createdAt: campaign.createdAt,
                isRead: false,
                isPinned: false,
                isArchived: false
            })
        };
    }));
    await upsertRows(baseUrl, 'rh_notifications', notifications, 'organization_id,id');
}

async function main() {
    const data = buildDataset();
    const occupied = data.apartments.filter(apartment => apartment.status === 'occupied').length;
    const deposited = data.apartments.filter(apartment => apartment.status === 'deposited').length;
    const vacant = data.apartments.filter(apartment => apartment.status === 'vacant').length;
    if (process.argv.includes('--dry-run')) {
        console.log(`Dry run: ${data.buildings.length} tòa, ${data.apartments.length} căn (${occupied} đang ở, ${deposited} đặt cọc), ${data.deposits.length} hồ sơ đặt cọc, ${data.depositTransactions.length} giao dịch cọc, ${vacant} căn trống, ${data.customers.length} hồ sơ khách/cư dân, ${data.contracts.length} hợp đồng, ${data.invoices.length} hóa đơn, ${data.meters.length} bản ghi chỉ số, ${data.supportRequests.length} yêu cầu, ${data.assets.length} tài sản, ${data.notificationCampaigns.length} thông báo.`);
        return;
    }

    const baseUrl = assertEnvironment();
    const members = await inspectSetup(baseUrl);
    await clearDemoData(baseUrl, members.resident);

    const buildings = data.buildings.map(building => ({
        ...building,
        managerId: members.manager.id
    }));
    await upsertRows(baseUrl, 'rh_buildings', buildings.map(payload => ({ organization_id: ORGANIZATION_ID, payload })));
    await applyAssignments(baseUrl, members);
    await upsertRows(baseUrl, 'rh_apartments', data.apartments.map(payload => ({ organization_id: ORGANIZATION_ID, payload })));
    await upsertRows(baseUrl, 'rh_customers', data.customers.map(payload => ({ organization_id: ORGANIZATION_ID, payload })));
    await bindResident(baseUrl, members.resident, data.customers.find(customer => customer.id === data.targetCustomerId));
    await upsertRows(baseUrl, 'rh_contracts', data.contracts.map(payload => ({ organization_id: ORGANIZATION_ID, payload })));
    await upsertRows(baseUrl, 'rh_contract_tenants', data.contractTenants, 'organization_id,contract_id,customer_id');
    await upsertRows(baseUrl, 'rh_deposits', data.deposits.map(payload => ({ organization_id: ORGANIZATION_ID, payload })));
    await upsertRows(baseUrl, 'rh_deposit_transactions', data.depositTransactions.map(payload => ({ organization_id: ORGANIZATION_ID, payload })));
    await upsertRows(baseUrl, 'rh_meters', data.meters.map(payload => ({ organization_id: ORGANIZATION_ID, payload })));
    await upsertRows(baseUrl, 'rh_invoices', data.invoices.map(payload => ({ organization_id: ORGANIZATION_ID, payload })));
    await upsertRows(baseUrl, 'rh_support_requests', bindSupportRequests(data, members).map(payload => ({ organization_id: ORGANIZATION_ID, payload })));
    await upsertRows(baseUrl, 'rh_assets', data.assets.map(payload => ({ organization_id: ORGANIZATION_ID, payload })));
    await seedNotifications(baseUrl, data.notificationCampaigns, members);

    console.log(`Seed complete: ${data.buildings.length} tòa, ${data.apartments.length} căn, ${data.customers.length} hồ sơ khách/cư dân, ${data.contracts.length} hợp đồng, ${data.deposits.length} hồ sơ đặt cọc, ${data.depositTransactions.length} giao dịch cọc, ${data.invoices.length} hóa đơn, ${data.meters.length} bản ghi chỉ số, ${data.supportRequests.length} yêu cầu, ${data.assets.length} tài sản, ${data.notificationCampaigns.length} thông báo.`);
    console.log(`Assignments: manager=${BUILDING_IDS.length} tòa, staff=3 tòa; resident@demo.com gắn với căn ${data.targetApartmentId}, hóa đơn kỳ mới nhất chưa thanh toán.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
