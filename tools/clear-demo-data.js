#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ORGANIZATION_ID = '32652966-796f-48ac-abe1-dbbc19f5fd75';
const ORGANIZATION_ID = process.env.SUPABASE_ORGANIZATION_ID || DEFAULT_ORGANIZATION_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_PREFIX = 'demo-rh-';
const DEMO_PATTERN = `${DEMO_PREFIX}*`;
const ID_FILTER = `like.${DEMO_PATTERN}`;
const ORGANIZATION_COLUMNS = {
    rh_memberships: 'organization_id',
    rh_building_assignments: 'organization_id',
    rh_notifications: 'organization_id',
    rh_notification_campaigns: 'organization_id',
    rh_records: 'organization_id',
    rh_cashflows: 'organization_id',
    rh_deposit_transactions: 'organization_id',
    rh_deposits: 'organization_id',
    rh_assets: 'organization_id',
    rh_support_requests: 'organization_id',
    rh_invoices: 'organization_id',
    rh_meters: 'organization_id',
    rh_contract_tenants: 'organization_id',
    rh_contracts: 'organization_id',
    rh_apartments: 'organization_id',
    rh_customers: 'organization_id',
    rh_buildings: 'organization_id'
};
export const DEMO_DELETE_STEPS = [
    { table: 'rh_notifications', filters: { id: ID_FILTER } },
    { table: 'rh_notification_campaigns', filters: { id: ID_FILTER } },
    { table: 'rh_records', filters: { collection: 'eq.billingRuns', id: ID_FILTER } },
    { table: 'rh_cashflows', filters: { id: ID_FILTER } },
    { table: 'rh_deposit_transactions', filters: { id: ID_FILTER } },
    { table: 'rh_invoices', filters: { id: ID_FILTER } },
    { table: 'rh_contract_tenants', filters: { contract_id: ID_FILTER } },
    { table: 'rh_contracts', filters: { id: ID_FILTER } },
    { table: 'rh_contracts', filters: { apartment_id: ID_FILTER } },
    { table: 'rh_deposits', filters: { id: ID_FILTER } },
    { table: 'rh_meters', filters: { id: ID_FILTER } },
    { table: 'rh_meters', filters: { apartment_id: ID_FILTER } },
    { table: 'rh_support_requests', filters: { id: ID_FILTER } },
    { table: 'rh_assets', filters: { id: ID_FILTER } },
    { table: 'rh_apartments', filters: { id: ID_FILTER } },
    { table: 'rh_customers', filters: { id: ID_FILTER } },
    { table: 'rh_building_assignments', filters: { building_id: ID_FILTER } },
    { table: 'rh_buildings', filters: { id: ID_FILTER } }
].map(step => Object.freeze(step));

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
    return `/rest/v1/${table}?${params}`;
}

async function deleteRows(baseUrl, table, filters) {
    await request(baseUrl, restPath(table, filters), { method: 'DELETE' });
}

async function findDemoResidentMembership(baseUrl) {
    const users = [];
    for (let page = 1; ; page++) {
        const params = new URLSearchParams({ page: String(page), per_page: '1000' });
        const result = await request(baseUrl, `/auth/v1/admin/users?${params}`);
        const batch = Array.isArray(result) ? result : result?.users;
        if (!Array.isArray(batch)) throw new Error('Không đọc được danh sách Auth users.');
        users.push(...batch);
        if (batch.length < 1000) break;
    }

    const matches = users.filter(user => user.email?.toLowerCase() === 'resident@demo.com');
    if (matches.length > 1) throw new Error('Có nhiều Auth user resident@demo.com; dừng để tránh cập nhật nhầm.');
    if (!matches.length) return null;

    const memberships = await request(baseUrl, restPath('rh_memberships', {
        auth_user_id: `eq.${matches[0].id}`,
        select: 'id,resident_id,profile'
    }));
    if (!Array.isArray(memberships) || memberships.length > 1) {
        throw new Error('Membership của resident@demo.com không hợp lệ.');
    }
    return memberships[0] || null;
}

async function detachDemoResident(baseUrl, member) {
    if (!member) return;
    const patch = {};
    if (typeof member.resident_id === 'string' && member.resident_id.startsWith(`${DEMO_PREFIX}customer-`)) {
        patch.resident_id = null;
    }
    if (member.profile?.apartmentId?.startsWith(`${DEMO_PREFIX}apartment-`)) {
        const profile = { ...member.profile };
        delete profile.apartmentId;
        patch.profile = profile;
    }
    if (!Object.keys(patch).length) return;
    await request(baseUrl, restPath('rh_memberships', { id: `eq.${member.id}` }), {
        method: 'PATCH',
        body: JSON.stringify(patch)
    });
}

export async function clearDemoData(baseUrl, residentMembership) {
    const member = residentMembership === undefined
        ? await findDemoResidentMembership(baseUrl)
        : residentMembership;
    await detachDemoResident(baseUrl, member);

    for (const step of DEMO_DELETE_STEPS) {
        await deleteRows(baseUrl, step.table, step.filters);
        if (step.table === 'rh_contracts') {
            const remaining = await request(baseUrl, restPath('rh_contracts', {
                id: ID_FILTER,
                select: 'id'
            }));
            if (!Array.isArray(remaining)) throw new Error('Không xác minh được hợp đồng demo sau khi dọn dữ liệu.');
            if (remaining.length) {
                throw new Error(`Còn ${remaining.length} hợp đồng demo; dừng trước khi xóa căn hộ để tránh vi phạm khóa ngoại.`);
            }
        }
    }
}

async function main() {
    const baseUrl = assertEnvironment();
    await clearDemoData(baseUrl);
    console.log('Đã xóa dữ liệu demo ResidentHuB có tiền tố demo-rh- (không xóa Auth users hoặc account types).');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
