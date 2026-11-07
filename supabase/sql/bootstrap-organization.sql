-- ResidentHub: one-time organization bootstrap. Run by the OPERATOR in the
-- Supabase Dashboard → SQL Editor (runs as the database owner), AFTER:
--   1. all files in supabase/migrations/ were applied in order;
--   2. the Admin login exists in Authentication → Users with a CONFIRMED email
--      (Add user → "Create new user", tick "Auto Confirm User"; the person sets
--      or receives their own password — never paste it into Git or chat).
--
-- It creates the organization, the four default account types (copied from
-- permissions.js DEFAULT_TYPES) and ONE Admin membership. It refuses to run if
-- that Auth user already belongs to an organization: nothing is overwritten.
-- Edit the four values below, run once, copy the printed Organization UUID into
-- the public config (VITE_SUPABASE_ORGANIZATION_ID).
do $bootstrap$
declare
    v_org_name     text := 'ResidentHub';
    v_admin_email  text := 'manager@residenthub.vn';
    v_admin_id     text := 'u-manager-1';          -- keep the legacy ID: buildings.managerId etc. stay valid
    v_admin_name   text := 'Quản lý ResidentHub';
    v_org uuid; v_uid uuid;
begin
    select id into v_uid from auth.users
     where lower(email) = lower(v_admin_email) and email_confirmed_at is not null;
    if v_uid is null then
        raise exception 'Auth user % not found or email not confirmed. Create/confirm it first.', v_admin_email;
    end if;
    if exists (select 1 from public.rh_memberships where auth_user_id = v_uid) then
        raise exception 'Auth user % already has a membership. Aborting without changes.', v_admin_email;
    end if;

    -- identity + business data enabled: this is a brand-new, empty organization.
    insert into public.rh_organizations(name, identity_enabled, data_access_enabled)
    values (v_org_name, true, true) returning id into v_org;

    insert into public.rh_account_types(organization_id, id, name, portal, system_type, full_access, permissions, description) values
    (v_org, 'at-admin', 'Admin', 'manager', true, true, '{}', 'Toàn quyền hệ thống, kể cả các chức năng được bổ sung sau này.'),
    (v_org, 'at-building-manager', 'Quản lý tòa nhà', 'manager', false, false, array[
        'dashboard.view','buildings.view','buildings.update','buildings.assignable',
        'apartments.view','apartments.create','apartments.update','apartments.delete',
        'assets.view','assets.create','assets.update','assets.delete','assetTypes.view','assetTypes.create','assetTypes.update',
        'customers.view','customers.create','customers.update','customers.delete',
        'meters.view','meters.create','meters.update','meters.delete','meters.approve',
        'contracts.view','contracts.create','contracts.update','contracts.delete',
        'invoices.view','invoices.create','invoices.update','invoices.delete','invoices.approve','invoices.issue','invoices.send','invoices.collect','invoices.adjust',
        'support.view','support.update','reports.view','users.view','users.approveResident','templates.view'],
        'Phụ trách vận hành các tòa nhà được giao.'),
    (v_org, 'at-staff', 'Nhân viên', 'manager', false, false, array[
        'dashboard.view','staffTasks.view','staffTasks.accept','staffTasks.update','staffTasks.report','staffIncome.view','support.create'],
        'Nhiệm vụ được giao, tiền công cá nhân và gửi yêu cầu hỗ trợ; dùng chung cho Kỹ thuật, Vệ sinh, An ninh.'),
    (v_org, 'at-resident', 'Cư dân', 'resident', true, false, '{}', 'Tài khoản cư dân dùng Cổng cư dân.');

    insert into public.rh_memberships(organization_id, id, auth_user_id, account_type_id, role, status, name, all_buildings)
    values (v_org, v_admin_id, v_uid, 'at-admin', 'manager', 'active', v_admin_name, true);

    raise notice 'Organization UUID: %', v_org;
end
$bootstrap$;

-- Show the UUID again at any time:
-- select id, name, identity_enabled, data_access_enabled from public.rh_organizations;

-- ---------------------------------------------------------------------------
-- OPTIONAL: link another EXISTING, CONFIRMED Auth user (created in the
-- Dashboard) to the organization, e.g. a teammate testing on another machine.
-- Prefer the in-app invitation (Edge Function identity-invite) once deployed.
-- Admin (at-admin) memberships must only be granted after verifying the person.
--
-- insert into public.rh_memberships(organization_id, id, auth_user_id, account_type_id, role, status, name, all_buildings)
-- select '<ORGANIZATION-UUID>', '<member-id>', u.id, 'at-building-manager', 'manager', 'active', '<Họ tên>', false
--   from auth.users u where lower(u.email) = lower('<email>') and u.email_confirmed_at is not null
--    and not exists (select 1 from public.rh_memberships m where m.auth_user_id = u.id);
