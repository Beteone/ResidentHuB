-- Phase B foundation, NOT an application cutover.
-- Run once against a NEW Supabase project after reviewing SETUP.md.
-- Existing application remains local until phases C/D are implemented/tested.
-- No user, organization, business/demo data or passwords are seeded here.
begin;

create schema rh_private;
revoke all on schema rh_private from public, anon, authenticated;
grant usage on schema rh_private to authenticated;
grant usage on schema rh_private to service_role;

-- Legacy passwords/tokens belong only in the encrypted offline backup,
-- never inside flexible application JSON (including nested objects).
create function rh_private.has_credentials(value jsonb) returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare item record; child jsonb;
begin
    if jsonb_typeof(value) = 'object' then
        for item in select * from jsonb_each(value) loop
            if lower(item.key) = any(array['password','pass','password_hash','passwordhash','access_token','refresh_token','service_role','service_role_key'])
               or rh_private.has_credentials(item.value) then return true; end if;
        end loop;
    elsif jsonb_typeof(value) = 'array' then
        for child in select * from jsonb_array_elements(value) loop
            if rh_private.has_credentials(child) then return true; end if;
        end loop;
    end if;
    return false;
end;
$$;
revoke all on function rh_private.has_credentials(jsonb) from public, anon, authenticated;
grant execute on function rh_private.has_credentials(jsonb) to service_role;

create table public.rh_organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(btrim(name)) between 1 and 200),
    -- Deliberate deployment gate. Do NOT enable before phase C/D acceptance.
    data_access_enabled boolean not null default false,
    created_at timestamptz not null default now()
);

create table public.rh_account_types (
    organization_id uuid not null references public.rh_organizations(id) on delete restrict,
    id text not null check (length(id) between 1 and 200),
    name text not null,
    portal text not null check (portal in ('manager', 'resident')),
    full_access boolean not null default false,
    system_type boolean not null default false,
    permissions text[] not null default '{}',
    description text not null default '',
    primary key (organization_id, id),
    check (not full_access or (portal = 'manager' and system_type))
);
create unique index rh_account_type_name on public.rh_account_types (organization_id, lower(btrim(name)));

-- No trigger on auth.users: signup never creates memberships or grants Admin.
-- id retains a legacy application ID; auth_user_id is the NEW Supabase UID.
create table public.rh_memberships (
    organization_id uuid not null references public.rh_organizations(id) on delete restrict,
    id text not null,
    auth_user_id uuid not null references auth.users(id) on delete restrict,
    account_type_id text not null,
    role text not null check (role in ('manager','staff','resident')),
    status text not null default 'inactive' check (status in ('active','inactive','locked')),
    name text not null,
    profile jsonb not null default '{}' check (jsonb_typeof(profile) = 'object' and not rh_private.has_credentials(profile)),
    all_buildings boolean not null default false,
    resident_id text,
    primary key (organization_id, id),
    unique (organization_id, auth_user_id),
    foreign key (organization_id, account_type_id) references public.rh_account_types(organization_id, id) on delete restrict,
    check (role <> 'resident' or not all_buildings)
);
create index rh_membership_auth on public.rh_memberships (auth_user_id, status);

-- JSONB preserves existing business attributes/formulas, signed snapshots,
-- arrays, timestamps and legacy IDs. Relational/generated columns below own
-- identity and FK constraints; payload cannot claim another parent/org.
do $migration$
declare entity text;
begin
    foreach entity in array array[
        'buildings','apartments','customers','meters','contracts','invoices',
        'deposits','deposit_transactions','cashflows','financial_accounts',
        'support_requests','assets','asset_types','templates','notification_campaigns'
    ] loop
        execute format($table$
            create table public.%I (
                organization_id uuid not null references public.rh_organizations(id) on delete restrict,
                id text generated always as (payload->>'id') stored not null,
                payload jsonb not null check (jsonb_typeof(payload) = 'object'),
                version bigint not null default 1 check (version > 0),
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now(),
                primary key (organization_id, id),
                check (length(id) between 1 and 200)
            )
        $table$, 'rh_' || entity);
    end loop;
end
$migration$;

alter table public.rh_buildings add column manager_id text generated always as (nullif(payload->>'managerId','')) stored;
alter table public.rh_buildings add foreign key (organization_id, manager_id) references public.rh_memberships(organization_id, id) on delete restrict;

-- Building scope is a relation, never a trusted buildingIds array sent by UI.
create table public.rh_building_assignments (
    organization_id uuid not null,
    member_id text not null,
    building_id text not null,
    primary key (organization_id, member_id, building_id),
    foreign key (organization_id, member_id) references public.rh_memberships(organization_id, id) on delete restrict,
    foreign key (organization_id, building_id) references public.rh_buildings(organization_id, id) on delete restrict
);

do $migration$
declare entity text;
begin
    foreach entity in array array['apartments','customers','meters','contracts','invoices','deposits','deposit_transactions','cashflows','support_requests','assets','templates'] loop
        execute format('alter table public.%I add column building_id text generated always as (nullif(payload->>''buildingId'','''')) stored', 'rh_' || entity);
        execute format('alter table public.%I add foreign key (organization_id, building_id) references public.rh_buildings(organization_id, id) on delete restrict', 'rh_' || entity);
        execute format('create index on public.%I (organization_id, building_id)', 'rh_' || entity);
    end loop;
    foreach entity in array array['apartments','meters','contracts','invoices','deposits','support_requests'] loop
        execute format('alter table public.%I alter column building_id set not null', 'rh_' || entity);
    end loop;
end
$migration$;

-- Composite parent reference ensures apartment AND building belong together.
alter table public.rh_apartments add unique (organization_id, id, building_id);
do $migration$
declare entity text;
begin
    foreach entity in array array['meters','contracts','invoices','deposits','support_requests','assets'] loop
        execute format('alter table public.%I add column apartment_id text generated always as (nullif(payload->>''apartmentId'','''')) stored', 'rh_' || entity);
        execute format('alter table public.%I add foreign key (organization_id, apartment_id) references public.rh_apartments(organization_id, id) on delete restrict', 'rh_' || entity);
        execute format('alter table public.%I add foreign key (organization_id, apartment_id, building_id) references public.rh_apartments(organization_id, id, building_id) on delete restrict', 'rh_' || entity);
        -- If apartment is set, building must also be set (MATCH SIMPLE null bypass).
        execute format('alter table public.%I add check (apartment_id is null or building_id is not null)', 'rh_' || entity);
    end loop;
end
$migration$;
alter table public.rh_meters alter column apartment_id set not null;
alter table public.rh_contracts alter column apartment_id set not null;
alter table public.rh_contracts add unique (organization_id, id, apartment_id, building_id);

create table public.rh_contract_tenants (
    organization_id uuid not null,
    contract_id text not null,
    customer_id text not null,
    primary key (organization_id, contract_id, customer_id),
    foreign key (organization_id, contract_id) references public.rh_contracts(organization_id, id) on delete restrict,
    foreign key (organization_id, customer_id) references public.rh_customers(organization_id, id) on delete restrict
);
alter table public.rh_memberships add foreign key (organization_id, resident_id) references public.rh_customers(organization_id, id) on delete restrict;
create unique index rh_resident_account on public.rh_memberships (organization_id, resident_id) where resident_id is not null;

-- Additional links are derived from payload, scoped by the same organization.
do $migration$
declare link record;
begin
    for link in select * from (values
        ('contracts','customerId','customer_id','customers'),
        ('invoices','contractId','contract_id','contracts'),
        ('invoices','customerId','customer_id','customers'),
        ('invoices','financialAccountId','financial_account_id','financial_accounts'),
        ('deposits','customerId','customer_id','customers'),
        ('deposit_transactions','depositId','deposit_id','deposits'),
        ('deposit_transactions','financialAccountId','financial_account_id','financial_accounts'),
        ('cashflows','financialAccountId','financial_account_id','financial_accounts'),
        ('cashflows','invoiceId','invoice_id','invoices'),
        ('support_requests','customerId','customer_id','customers'),
        ('assets','assetTypeId','asset_type_id','asset_types')
    ) as links(entity, field, column_name, target)
    loop
        execute format('alter table public.%I add column %I text generated always as (nullif(payload->>%L,'''')) stored', 'rh_' || link.entity, link.column_name, link.field);
        execute format('alter table public.%I add foreign key (organization_id, %I) references public.%I(organization_id, id) on delete restrict', 'rh_' || link.entity, link.column_name, 'rh_' || link.target);
    end loop;
end
$migration$;
alter table public.rh_invoices add foreign key (organization_id, contract_id, apartment_id, building_id) references public.rh_contracts(organization_id, id, apartment_id, building_id) on delete restrict;
alter table public.rh_deposit_transactions alter column deposit_id set not null;

create table public.rh_settings (
    organization_id uuid not null references public.rh_organizations(id) on delete restrict,
    id text not null,
    member_id text,
    payload jsonb not null check (jsonb_typeof(payload) = 'object'),
    version bigint not null default 1 check (version > 0),
    primary key (organization_id, id),
    foreign key (organization_id, member_id) references public.rh_memberships(organization_id, id) on delete restrict
);
create table public.rh_notifications (
    organization_id uuid not null,
    id text not null,
    recipient_id text not null,
    payload jsonb not null check (jsonb_typeof(payload) = 'object'),
    primary key (organization_id, id),
    foreign key (organization_id, recipient_id) references public.rh_memberships(organization_id, id) on delete restrict
);
create table public.rh_account_requests (
    organization_id uuid not null references public.rh_organizations(id) on delete restrict,
    id text not null,
    email text not null,
    status text not null check (status in ('pending','approved','rejected')),
    payload jsonb not null check (jsonb_typeof(payload) = 'object'),
    primary key (organization_id, id)
);
create unique index rh_pending_request_email on public.rh_account_requests(organization_id, lower(btrim(email))) where status = 'pending';
create table public.rh_activity (
    organization_id uuid not null,
    id uuid primary key default gen_random_uuid(),
    actor_id text not null,
    entity text not null,
    record_id text,
    action text not null,
    occurred_at timestamptz not null default now(),
    -- Phase D RPC writes allowlisted, redacted values only.
    detail jsonb not null default '{}',
    foreign key (organization_id, actor_id) references public.rh_memberships(organization_id, id) on delete restrict
);

-- Definer helpers have a pinned search_path and derive identity from auth.uid().
-- Never consult raw_user_meta_data, supplied user ID, org ID alone or JWT roles.
create function rh_private.active_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.rh_memberships m join public.rh_organizations o on o.id = m.organization_id
        where m.organization_id = org and m.auth_user_id = (select auth.uid())
          and m.status = 'active' and o.data_access_enabled
    );
$$;
create function rh_private.can(org uuid, permission text) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.rh_memberships m
        join public.rh_organizations o on o.id = m.organization_id
        join public.rh_account_types t on t.organization_id = m.organization_id and t.id = m.account_type_id
        where m.organization_id = org and m.auth_user_id = (select auth.uid())
          and m.status = 'active' and o.data_access_enabled
          and m.role in ('manager','staff') and t.portal = 'manager'
          and (t.full_access or permission = any(t.permissions))
    );
$$;
create function rh_private.in_building(org uuid, building text) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.rh_memberships m
        join public.rh_organizations o on o.id = m.organization_id
        join public.rh_account_types t on t.organization_id = m.organization_id and t.id = m.account_type_id
        where m.organization_id = org and m.auth_user_id = (select auth.uid())
          and m.status = 'active' and o.data_access_enabled and m.role in ('manager','staff') and t.portal = 'manager'
          and (t.full_access or m.all_buildings or exists (
              select 1 from public.rh_building_assignments a where a.organization_id = org and a.member_id = m.id and a.building_id = building
          ) or exists (
              select 1 from public.rh_buildings b where b.organization_id = org and b.id = building and b.manager_id = m.id
          ))
    );
$$;
create function rh_private.is_self(org uuid, member text) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.rh_memberships m where m.organization_id = org and m.id = member and m.auth_user_id = (select auth.uid()) and m.status = 'active')
      and rh_private.active_member(org);
$$;
revoke all on function rh_private.active_member(uuid), rh_private.can(uuid,text), rh_private.in_building(uuid,text), rh_private.is_self(uuid,text) from public, anon, authenticated;
grant execute on function rh_private.active_member(uuid), rh_private.can(uuid,text), rh_private.in_building(uuid,text), rh_private.is_self(uuid,text) to authenticated;

-- Revoke even if the project's default grants are permissive. No anon access.
do $migration$
declare item record;
begin
    for item in select tablename from pg_tables where schemaname = 'public' and tablename like 'rh\_%' escape '\' loop
        execute format('alter table public.%I enable row level security', item.tablename);
        execute format('revoke all on public.%I from public, anon, authenticated', item.tablename);
        execute format('grant select on public.%I to authenticated', item.tablename);
        execute format('grant all on public.%I to service_role', item.tablename);
        if exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = item.tablename and c.column_name = 'payload') then
            execute format('alter table public.%I add constraint rh_payload_no_credentials check (not rh_private.has_credentials(payload))', item.tablename);
        end if;
    end loop;
end
$migration$;

create policy rh_organization_read on public.rh_organizations for select to authenticated using (rh_private.active_member(id));
create policy rh_membership_read on public.rh_memberships for select to authenticated using (rh_private.is_self(organization_id,id) or rh_private.can(organization_id,'users.view'));
create policy rh_type_read on public.rh_account_types for select to authenticated using (
    rh_private.can(organization_id,'roles.view') or exists (
        select 1 from public.rh_memberships m where m.organization_id = rh_account_types.organization_id and m.account_type_id = rh_account_types.id and m.auth_user_id = (select auth.uid()) and m.status = 'active'
    ) and rh_private.active_member(organization_id)
);
create policy rh_assignment_read on public.rh_building_assignments for select to authenticated using (rh_private.is_self(organization_id,member_id) or rh_private.can(organization_id,'users.view'));
create policy rh_building_read on public.rh_buildings for select to authenticated using (rh_private.can(organization_id,'buildings.view') and rh_private.in_building(organization_id,id));

do $migration$
declare item record;
begin
    for item in select * from (values
        ('apartments','apartments'),('meters','meters'),('contracts','contracts'),('invoices','invoices'),
        ('assets','assets'),('support_requests','support'),
        -- Existing app has no deposit/cashflow-specific permission keys.
        -- Fail closed until that mapping is reviewed, do not invent grants.
        ('deposits',null),('deposit_transactions',null),('cashflows',null)
    ) as mappings(entity, permission_module)
    loop
        if item.permission_module is not null then
            execute format('create policy rh_staff_read on public.%I for select to authenticated using (rh_private.can(organization_id,%L) and rh_private.in_building(organization_id,building_id))', 'rh_' || item.entity, item.permission_module || '.view');
        end if;
    end loop;
end
$migration$;

-- Customers are scoped through ALL contract tenants, not just customerId.
-- Unlinked customers: only unrestricted staff until scope rules are confirmed.
create policy rh_customer_read on public.rh_customers for select to authenticated using (
    rh_private.can(organization_id,'customers.view') and (
        rh_private.in_building(organization_id,null) or exists (
            select 1 from public.rh_contract_tenants ct join public.rh_contracts c
            on c.organization_id = ct.organization_id and c.id = ct.contract_id
            where ct.organization_id = rh_customers.organization_id and ct.customer_id = rh_customers.id
              and rh_private.in_building(ct.organization_id,c.building_id)
        )
    )
);
create policy rh_tenant_read on public.rh_contract_tenants for select to authenticated using (
    rh_private.can(organization_id,'contracts.view') and exists (
        select 1 from public.rh_contracts c where c.organization_id = rh_contract_tenants.organization_id and c.id = rh_contract_tenants.contract_id
    )
);
create policy rh_asset_type_read on public.rh_asset_types for select to authenticated using (rh_private.can(organization_id,'assetTypes.view'));
create policy rh_template_read on public.rh_templates for select to authenticated using (rh_private.can(organization_id,'templates.view') and (building_id is null or rh_private.in_building(organization_id,building_id)));
create policy rh_campaign_read on public.rh_notification_campaigns for select to authenticated using (rh_private.can(organization_id,'notifications.view') and rh_private.in_building(organization_id,null));
create policy rh_settings_read on public.rh_settings for select to authenticated using (rh_private.can(organization_id,'settings.view') and (member_id is null or rh_private.is_self(organization_id,member_id)));
create policy rh_notification_read on public.rh_notifications for select to authenticated using (rh_private.is_self(organization_id,recipient_id));
create policy rh_request_read on public.rh_account_requests for select to authenticated using (rh_private.can(organization_id,'users.approveResident'));
create policy rh_activity_read on public.rh_activity for select to authenticated using (rh_private.can(organization_id,'settings.view') and rh_private.is_self(organization_id,actor_id));

-- Intentionally NO browser INSERT/UPDATE/DELETE policies/grants in phase B.
-- NO resident contract/invoice SELECT until reviewed projections prevent
-- leakage of other tenants and private manager/customer information.
-- NO signup auto-grants, automatic demo seed, imports or service key in UI.
-- Phase D must add transactional business RPCs (special invoice permissions,
-- scope + relationship checks, optimistic concurrency, redacted audit) before
-- enabling any organization. This schema alone is NOT a working sync feature.
commit;
