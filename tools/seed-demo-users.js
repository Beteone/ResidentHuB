#!/usr/bin/env node
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORGANIZATION_ID = process.env.SUPABASE_ORGANIZATION_ID;

const DEMO_USERS = [
    { email: 'manager@demo.com', password: 'Demo@123456', name: 'Quản lý Demo', role: 'manager', accountTypeId: 'at-building-manager', portal: 'manager' },
    { email: 'staff@demo.com', password: 'Demo@123456', name: 'Nhân viên Demo', role: 'staff', accountTypeId: 'at-staff', portal: 'manager' },
    { email: 'resident@demo.com', password: 'Demo@123456', name: 'Cư dân Demo', role: 'resident', accountTypeId: 'at-resident', portal: 'resident' }
];

function requireEnvironment() {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ORGANIZATION_ID) {
        throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ORGANIZATION_ID.');
    }

    const url = new URL(SUPABASE_URL);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        throw new Error('SUPABASE_URL must use HTTPS (except for localhost).');
    }
    if (url.username || url.password || url.search || url.hash) {
        throw new Error('SUPABASE_URL must not contain credentials, a query, or a fragment.');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ORGANIZATION_ID)) {
        throw new Error('SUPABASE_ORGANIZATION_ID must be a UUID.');
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
            ...options.headers
        }
    });
    const text = await response.text();
    let data;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(`Supabase returned invalid JSON (${response.status}).`);
    }
    if (!response.ok) {
        const detail = data?.message || data?.msg || data?.error_description || data?.error || response.statusText;
        throw new Error(`Supabase request failed (${response.status}): ${detail}`);
    }
    return data;
}

async function findAuthUser(baseUrl, email) {
    const pageSize = 1000;
    for (let page = 1; ; page++) {
        const query = new URLSearchParams({ page: String(page), per_page: String(pageSize) });
        const result = await request(baseUrl, `/auth/v1/admin/users?${query}`);
        const users = Array.isArray(result) ? result : result?.users;
        if (!Array.isArray(users)) throw new Error('Unexpected response while listing Auth users.');
        const matches = users.filter(user => user.email?.toLowerCase() === email.toLowerCase());
        if (matches.length > 1) throw new Error(`Multiple Auth users found for ${email}.`);
        if (matches.length) return matches[0];
        if (users.length < pageSize) return null;
    }
}

async function ensureAuthUser(baseUrl, demoUser) {
    const existing = await findAuthUser(baseUrl, demoUser.email);
    const body = {
        email: demoUser.email,
        password: demoUser.password,
        email_confirm: true,
        user_metadata: { name: demoUser.name }
    };

    if (existing) {
        const updated = await request(baseUrl, `/auth/v1/admin/users/${encodeURIComponent(existing.id)}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        return updated?.user || updated;
    }

    const created = await request(baseUrl, '/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify(body)
    });
    const user = created?.user || created;
    if (!user?.id) throw new Error(`Supabase did not return an Auth user ID for ${demoUser.email}.`);
    return user;
}

async function ensureMembership(baseUrl, demoUser, authUserId) {
    const query = new URLSearchParams({
        organization_id: `eq.${ORGANIZATION_ID}`,
        auth_user_id: `eq.${authUserId}`,
        select: 'id'
    });
    const matches = await request(baseUrl, `/rest/v1/rh_memberships?${query}`);
    if (!Array.isArray(matches) || matches.length > 1) {
        throw new Error(`Unexpected membership result for ${demoUser.email}.`);
    }

    const membership = {
        organization_id: ORGANIZATION_ID,
        auth_user_id: authUserId,
        account_type_id: demoUser.accountTypeId,
        role: demoUser.role,
        status: 'active',
        name: demoUser.name,
        all_buildings: false,
        resident_id: null
    };

    if (matches.length) {
        const updateQuery = new URLSearchParams({
            organization_id: `eq.${ORGANIZATION_ID}`,
            id: `eq.${matches[0].id}`
        });
        await request(baseUrl, `/rest/v1/rh_memberships?${updateQuery}`, {
            method: 'PATCH',
            body: JSON.stringify(membership)
        });
        return;
    }

    await request(baseUrl, '/rest/v1/rh_memberships', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
            ...membership,
            id: `u-demo-${demoUser.role}-${authUserId}`,
            profile: {}
        })
    });
}

async function main() {
    const baseUrl = requireEnvironment();
    const orgQuery = new URLSearchParams({
        id: `eq.${ORGANIZATION_ID}`,
        select: 'id,identity_enabled,data_access_enabled'
    });
    const organizations = await request(baseUrl, `/rest/v1/rh_organizations?${orgQuery}`);
    if (!Array.isArray(organizations) || organizations.length !== 1) {
        throw new Error('The configured organization was not found.');
    }
    if (!organizations[0].identity_enabled || !organizations[0].data_access_enabled) {
        throw new Error('The organization must have identity_enabled and data_access_enabled enabled.');
    }

    const typeQuery = new URLSearchParams({
        organization_id: `eq.${ORGANIZATION_ID}`,
        select: 'id,portal'
    });
    const types = await request(baseUrl, `/rest/v1/rh_account_types?${typeQuery}`);
    const typesById = new Map((types || []).map(type => [type.id, type]));
    for (const demoUser of DEMO_USERS) {
        if (typesById.get(demoUser.accountTypeId)?.portal !== demoUser.portal) {
            throw new Error(`Required account type ${demoUser.accountTypeId} is missing or has the wrong portal.`);
        }
    }

    for (const demoUser of DEMO_USERS) {
        const authUser = await ensureAuthUser(baseUrl, demoUser);
        if (!authUser?.id) throw new Error(`Supabase did not return an Auth user ID for ${demoUser.email}.`);
        await ensureMembership(baseUrl, demoUser, authUser.id);
        console.log(`Seeded ${demoUser.email} (${demoUser.role}).`);
    }
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
