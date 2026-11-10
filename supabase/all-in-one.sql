-- ResidentHub schema bundle for a fresh Supabase project.
-- Apply once in Supabase SQL Editor. Do not run on a database where these migrations were applied.
-- Migration order: foundation -> identity -> identity invites -> business data.
-- Does not seed an organization, users, account types, or business data.
-- Bootstrap and RLS test SQL are intentionally excluded; see supabase/sql/bootstrap-organization.sql and supabase/tests/foundation-rls.sql.

-- ===== BEGIN supabase/migrations/202610210001_foundation.sql =====
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
-- ===== END supabase/migrations/202610210001_foundation.sql =====

-- ===== BEGIN supabase/migrations/202611040001_identity.sql =====
-- Review/apply AFTER foundation on staging. No data, users, roles or secrets seeded.
begin;
alter table public.rh_organizations add column identity_enabled boolean not null default false;
alter table public.rh_memberships add column session_valid_after timestamptz not null default '-infinity';

-- Check a real Auth session on EVERY identity RPC/RLS decision, including old JWTs.
create function rh_private.identity_active(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from public.rh_memberships m join public.rh_organizations o on o.id=m.organization_id
  join auth.sessions s on s.user_id=m.auth_user_id
  where m.organization_id=org and m.auth_user_id=auth.uid() and m.status='active'
    and o.identity_enabled and s.id::text=auth.jwt()->>'session_id'
    and s.created_at >= m.session_valid_after
    and (s.not_after is null or s.not_after > now())
 );
$$;
create function rh_private.identity_can(org uuid, permission text) returns boolean
language sql stable security definer set search_path = '' as $$
 select rh_private.identity_active(org) and exists (
  select 1 from public.rh_memberships m join public.rh_account_types t
    on t.organization_id=m.organization_id and t.id=m.account_type_id
  where m.organization_id=org and m.auth_user_id=auth.uid() and m.role in ('manager','staff')
    and t.portal='manager' and (t.full_access or permission=any(t.permissions))
 );
$$;
create function rh_private.identity_admin(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select rh_private.identity_active(org) and exists (
  select 1 from public.rh_memberships m join public.rh_account_types t
    on t.organization_id=m.organization_id and t.id=m.account_type_id
  where m.organization_id=org and m.auth_user_id=auth.uid() and m.role='manager' and t.full_access and t.portal='manager'
 );
$$;
create function rh_private.identity_scope(org uuid, member text) returns text[]
language sql stable security definer set search_path = '' as $$
 select coalesce(array_agg(distinct id),array[]::text[]) from (
  select a.building_id id from public.rh_building_assignments a where a.organization_id=org and a.member_id=member
  union select b.id from public.rh_buildings b where b.organization_id=org and b.manager_id=member
 ) ids;
$$;
-- A delegated editor cannot manage an identity with broader permissions/scope.
create function rh_private.identity_manageable(org uuid, target text) returns boolean
language sql stable security definer set search_path = '' as $$
 select rh_private.identity_admin(org) or exists (
  select 1 from public.rh_memberships actor
  join public.rh_account_types own on own.organization_id=org and own.id=actor.account_type_id
  join public.rh_memberships other on other.organization_id=org and other.id=target
  join public.rh_account_types granted on granted.organization_id=org and granted.id=other.account_type_id
  where actor.organization_id=org and actor.auth_user_id=auth.uid() and actor.id<>target
    and rh_private.identity_active(org) and not granted.full_access
    and granted.permissions <@ own.permissions
    and (actor.all_buildings or (not other.all_buildings and rh_private.identity_scope(org,other.id) <@ rh_private.identity_scope(org,actor.id)))
 );
$$;
create function rh_private.identity_user(org uuid, member text) returns jsonb
language sql stable security definer set search_path = '' as $$
 select m.profile || jsonb_build_object('id',m.id,'name',m.name,'email',u.email,'role',m.role,
   'status',m.status,'accountTypeId',m.account_type_id,'allBuildings',m.all_buildings,
   'residentId',coalesce(m.resident_id,''),'buildingIds',to_jsonb(rh_private.identity_scope(org,m.id)))
 from public.rh_memberships m join auth.users u on u.id=m.auth_user_id
 where m.organization_id=org and m.id=member;
$$;
create function public.rh_identity_context(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.rh_memberships; result jsonb;
begin
 if not rh_private.identity_active(p_org) then raise exception 'Identity unavailable' using errcode='42501'; end if;
 select * into strict me from public.rh_memberships where organization_id=p_org and auth_user_id=auth.uid();
 select jsonb_build_object('user',rh_private.identity_user(p_org,me.id),
  'users',(select coalesce(jsonb_agg(rh_private.identity_user(p_org,m.id)),'[]'::jsonb) from public.rh_memberships m
    where m.organization_id=p_org and (m.id=me.id or (rh_private.identity_can(p_org,'users.view') and rh_private.identity_manageable(p_org,m.id)))),
  'types',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'portal',t.portal,'system',t.system_type,
    'fullAccess',t.full_access,'permissions',t.permissions,'description',t.description)),'[]'::jsonb)
    from public.rh_account_types t where t.organization_id=p_org and
      (t.id=me.account_type_id or rh_private.identity_can(p_org,'roles.view') or rh_private.identity_can(p_org,'users.view')))) into result;
 return result;
end;
$$;

create function public.rh_identity_update_profile(p_org uuid,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.rh_memberships; changes jsonb:='[]'; field text; history jsonb; prefs jsonb; entry record;
begin
 if not rh_private.identity_active(p_org) then raise exception 'Denied' using errcode='42501'; end if;
 if jsonb_typeof(p_patch)<>'object' or rh_private.has_credentials(p_patch) or exists
  (select 1 from jsonb_object_keys(p_patch) k where k not in ('phone','avatar','contactEmail','preferences')) then raise exception 'Invalid profile'; end if;
 select * into strict me from public.rh_memberships where organization_id=p_org and auth_user_id=auth.uid() for update;
 if octet_length(p_patch::text)>3000000 then raise exception 'Profile too large'; end if;
 if p_patch ? 'contactEmail' and (jsonb_typeof(p_patch->'contactEmail')<>'string' or p_patch->>'contactEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_patch->>'contactEmail')>254) then raise exception 'Invalid email'; end if;
 if p_patch ? 'phone' and (jsonb_typeof(p_patch->'phone')<>'string' or (p_patch->>'phone'<>'' and p_patch->>'phone' !~ '^\+?[0-9 ().-]{7,22}$')) then raise exception 'Invalid phone'; end if;
 if p_patch ? 'avatar' and (jsonb_typeof(p_patch->'avatar')<>'string' or
   (p_patch->>'avatar'<>'' and p_patch->>'avatar' !~ '^https://[^[:space:]]+$' and p_patch->>'avatar' !~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$')) then raise exception 'Invalid avatar'; end if;
 if p_patch ? 'preferences' and jsonb_typeof(p_patch->'preferences')<>'object' then raise exception 'Invalid preferences'; end if;
 prefs:=p_patch->'preferences';
 if exists(select 1 from jsonb_object_keys(prefs) k where k not in ('theme','density','fontSize','accentColor','notifications')) then raise exception 'Unknown preference'; end if;
 if (prefs ? 'theme' and prefs->>'theme' not in ('light','dark','system')) or
    (prefs ? 'density' and prefs->>'density' not in ('comfortable','compact')) or
    (prefs ? 'fontSize' and prefs->>'fontSize' not in ('small','medium','large')) or
    (prefs ? 'accentColor' and prefs->>'accentColor' not in ('blue','green','purple','orange','red','teal')) then raise exception 'Invalid preference'; end if;
 if prefs ? 'notifications' then
  if jsonb_typeof(prefs->'notifications')<>'object' or exists(select 1 from jsonb_object_keys(prefs->'notifications') k where k not in ('channels','categories')) then raise exception 'Invalid notification preferences'; end if;
  if prefs->'notifications' ? 'channels' then
   if jsonb_typeof(prefs->'notifications'->'channels')<>'object' then raise exception 'Invalid channels'; end if;
   for entry in select * from jsonb_each(prefs->'notifications'->'channels') loop
    if entry.key not in ('inApp','email') or jsonb_typeof(entry.value)<>'boolean' or (entry.key='email' and entry.value<>'false'::jsonb) then raise exception 'Unsupported channel'; end if;
   end loop;
  end if;
  if prefs->'notifications' ? 'categories' then
   if jsonb_typeof(prefs->'notifications'->'categories')<>'object' then raise exception 'Invalid categories'; end if;
   for entry in select * from jsonb_each(prefs->'notifications'->'categories') loop
    if entry.key not in ('taskNew','assignmentChanged','deadline','infoRequest','taskStatus','system') or jsonb_typeof(entry.value)<>'boolean' then raise exception 'Invalid category'; end if;
   end loop;
  end if;
 end if;
 if me.role='staff' or me.account_type_id='at-staff' then
  foreach field in array array['contactEmail','phone','avatar'] loop
   if p_patch ? field and p_patch->field is distinct from me.profile->field then
    changes:=changes || jsonb_build_array(case when field='avatar' then jsonb_build_object('field',field,'label','Ảnh đại diện')
      else jsonb_build_object('field',field,'label',case when field='phone' then 'Số điện thoại' else 'Email liên hệ' end,'before',me.profile->field,'after',p_patch->field) end);
   end if;
  end loop;
 end if;
 history:=coalesce(me.profile->'profileUpdateHistory','[]');
 if jsonb_array_length(changes)>0 then
  history:=history || jsonb_build_array(jsonb_build_object('id','profile-update-'||gen_random_uuid()::text,'at',clock_timestamp(),
    'actorId',me.id,'actorName',me.name,'changes',changes,'managerStatus','new','managerNote',''));
  select coalesce(jsonb_agg(item order by ord),'[]') into history from jsonb_array_elements(history) with ordinality as h(item,ord)
    where ord>greatest(jsonb_array_length(history)-50,0);
 end if;
 update public.rh_memberships set profile=profile || p_patch || case when jsonb_array_length(changes)>0 then jsonb_build_object('profileUpdateHistory',history) else '{}'::jsonb end
  where organization_id=p_org and id=me.id;
 return rh_private.identity_user(p_org,me.id);
end;
$$;

create function public.rh_identity_profile_follow_up(p_org uuid,p_id text,p_update text,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target public.rh_memberships; actor public.rh_memberships; history jsonb; result jsonb;
begin
 if not rh_private.identity_can(p_org,'users.update') or not rh_private.identity_manageable(p_org,p_id) then raise exception 'Denied' using errcode='42501'; end if;
 select * into strict actor from public.rh_memberships where organization_id=p_org and auth_user_id=auth.uid() and role='manager' and account_type_id<>'at-staff';
 select * into strict target from public.rh_memberships where organization_id=p_org and id=p_id and (role='staff' or account_type_id='at-staff') for update;
 if jsonb_typeof(p_patch)<>'object' or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('managerStatus','managerNote'))
  or (p_patch ? 'managerStatus' and p_patch->>'managerStatus' not in ('new','contacted','resolved'))
  or length(p_patch->>'managerNote')>1000 then raise exception 'Invalid follow up'; end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(target.profile->'profileUpdateHistory','[]')) item where item->>'id'=p_update) then raise exception 'Missing update'; end if;
 select jsonb_agg(case when item->>'id'=p_update then item || p_patch || jsonb_build_object('reviewedAt',clock_timestamp(),'reviewedBy',actor.id,'reviewedByName',actor.name) else item end order by ord)
  into history from jsonb_array_elements(target.profile->'profileUpdateHistory') with ordinality as h(item,ord);
 update public.rh_memberships set profile=jsonb_set(profile,'{profileUpdateHistory}',history) where organization_id=p_org and id=p_id;
 select item into result from jsonb_array_elements(history) item where item->>'id'=p_update;
 return result;
end;
$$;

create function public.rh_identity_update_member(p_org uuid,p_id text,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target public.rh_memberships; actor public.rh_memberships; next_type public.rh_account_types;
        own_type public.rh_account_types; new_all boolean; new_scope text[]; new_role text; auth_email text;
begin
 -- Serialize identity edits in this org (prevents last-admin and grant races).
 perform 1 from public.rh_organizations where id=p_org for update;
 if not rh_private.identity_active(p_org) or not rh_private.identity_manageable(p_org,p_id) then raise exception 'Denied' using errcode='42501'; end if;
 if jsonb_typeof(p_patch)<>'object' or rh_private.has_credentials(p_patch) or exists
  (select 1 from jsonb_object_keys(p_patch) k where k not in
    ('name','email','phone','accountTypeId','role','status','allBuildings','buildingIds','residentId','apartmentId','unit','building','floor','department','title','employeeCode','staffGroup','supervisorId','avatar')) then raise exception 'Invalid member patch'; end if;
 if p_patch ? 'status' and not rh_private.identity_can(p_org,'users.lock') then raise exception 'Lock permission required' using errcode='42501'; end if;
 if p_patch - 'status' <> '{}'::jsonb and not rh_private.identity_can(p_org,'users.update') then raise exception 'Update permission required' using errcode='42501'; end if;
 select * into strict actor from public.rh_memberships where organization_id=p_org and auth_user_id=auth.uid();
 select * into strict target from public.rh_memberships where organization_id=p_org and id=p_id for update;
 select * into strict next_type from public.rh_account_types where organization_id=p_org and id=coalesce(p_patch->>'accountTypeId',target.account_type_id);
 select * into strict own_type from public.rh_account_types where organization_id=p_org and id=actor.account_type_id;
 new_role:=coalesce(p_patch->>'role',target.role);
 if (next_type.portal='resident')<>(new_role='resident') or (new_role='staff' and next_type.portal<>'manager') then raise exception 'Portal mismatch'; end if;
 if next_type.full_access and (new_role<>'manager' or not rh_private.identity_admin(p_org)) then raise exception 'Admin denied' using errcode='42501'; end if;
 if not rh_private.identity_admin(p_org) and not next_type.permissions <@ own_type.permissions then raise exception 'Grant exceeds editor permissions' using errcode='42501'; end if;
 select email into strict auth_email from auth.users where id=target.auth_user_id;
 if p_patch ? 'email' and lower(btrim(p_patch->>'email'))<>lower(auth_email) then raise exception 'Login email changes require Auth verification'; end if;
 if next_type.full_access and not exists(select 1 from auth.users where id=target.auth_user_id and email_confirmed_at is not null) then raise exception 'Verified identity required'; end if;
 if actor.id=target.id and (next_type.id<>target.account_type_id or coalesce(p_patch->>'status',target.status)<>'active' or new_role<>target.role) then raise exception 'Cannot revoke own identity'; end if;
 if exists(select 1 from public.rh_account_types where organization_id=p_org and id=target.account_type_id and full_access)
   and (not next_type.full_access or coalesce(p_patch->>'status',target.status)<>'active')
   and not exists(select 1 from public.rh_memberships m join public.rh_account_types t on t.organization_id=m.organization_id and t.id=m.account_type_id
     where m.organization_id=p_org and m.id<>p_id and m.status='active' and t.full_access) then raise exception 'Last active Admin'; end if;
 new_all:=coalesce((p_patch->>'allBuildings')::boolean,target.all_buildings);
 new_scope:=case when p_patch ? 'buildingIds' then array(select jsonb_array_elements_text(p_patch->'buildingIds')) else rh_private.identity_scope(p_org,p_id) end;
 if not rh_private.identity_admin(p_org) and not actor.all_buildings and (new_all or not new_scope <@ rh_private.identity_scope(p_org,actor.id)) then raise exception 'Scope exceeds editor'; end if;
 update public.rh_memberships set name=coalesce(p_patch->>'name',name),role=new_role,account_type_id=next_type.id,
  status=coalesce(p_patch->>'status',status),all_buildings=new_all,
  resident_id=case when p_patch ? 'residentId' then nullif(p_patch->>'residentId','') else resident_id end,
  profile=profile || (p_patch - array['name','email','role','accountTypeId','status','allBuildings','buildingIds','residentId']),
  session_valid_after=case when p_patch ? 'status' and p_patch->>'status'<>status then clock_timestamp() else session_valid_after end
 where organization_id=p_org and id=p_id;
 if p_patch ? 'buildingIds' then
  delete from public.rh_building_assignments where organization_id=p_org and member_id=p_id;
  insert into public.rh_building_assignments(organization_id,member_id,building_id) select p_org,p_id,b from unnest(new_scope) b;
 end if;
 return rh_private.identity_user(p_org,p_id);
end;
$$;

create function public.rh_identity_delete_member(p_org uuid,p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform 1 from public.rh_organizations where id=p_org for update;
 if not rh_private.identity_can(p_org,'users.delete') or not rh_private.identity_manageable(p_org,p_id)
 or exists(select 1 from public.rh_memberships m join public.rh_account_types t on t.organization_id=m.organization_id and t.id=m.account_type_id
   where m.organization_id=p_org and m.id=p_id and (m.auth_user_id=auth.uid() or t.full_access)) then raise exception 'Denied' using errcode='42501'; end if;
 -- FK restrictions preserve linked business data; never delete the Auth identity here.
 delete from public.rh_building_assignments where organization_id=p_org and member_id=p_id;
 delete from public.rh_memberships where organization_id=p_org and id=p_id;
 if not found then raise exception 'Missing membership'; end if;
 return jsonb_build_object('id',p_id);
end;
$$;

create function public.rh_identity_save_type(p_org uuid,p_id text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare old public.rh_account_types; own public.rh_account_types; wanted text[]; next_id text;
begin
 perform 1 from public.rh_organizations where id=p_org for update;
 if not rh_private.identity_can(p_org,case when p_id is null then 'roles.create' else 'roles.update' end) then raise exception 'Denied' using errcode='42501'; end if;
 if jsonb_typeof(p_data)<>'object' or rh_private.has_credentials(p_data) or exists
  (select 1 from jsonb_object_keys(p_data) k where k not in ('name','description','portal','permissions')) then raise exception 'Invalid type patch'; end if;
 if p_id is not null then
  select * into strict old from public.rh_account_types where organization_id=p_org and id=p_id for update;
 end if;
 select t.* into strict own from public.rh_account_types t join public.rh_memberships m on m.organization_id=t.organization_id and m.account_type_id=t.id
  where m.organization_id=p_org and m.auth_user_id=auth.uid();
 wanted:=array(select distinct jsonb_array_elements_text(p_data->'permissions'));
 if not rh_private.identity_admin(p_org) and (p_id=own.id or coalesce(old.full_access,false) or not coalesce(old.permissions,array[]::text[]) <@ own.permissions or not wanted <@ own.permissions)
 then raise exception 'Grant exceeds editor permissions' using errcode='42501'; end if;
 if old.system_type and p_data->>'portal'<>old.portal then raise exception 'System portal immutable'; end if;
 -- full_access/system_type cannot be created or changed by this browser RPC.
 next_id:=coalesce(p_id,'at-'||gen_random_uuid()::text);
 if p_id is null then
  insert into public.rh_account_types(organization_id,id,name,portal,description,permissions)
  values(p_org,next_id,btrim(p_data->>'name'),p_data->>'portal',coalesce(p_data->>'description',''),wanted);
 else
  if exists(select 1 from public.rh_memberships where organization_id=p_org and account_type_id=p_id
      and ((role='resident')<>(p_data->>'portal'='resident'))) then raise exception 'Linked portal mismatch'; end if;
  update public.rh_account_types set name=btrim(p_data->>'name'),portal=coalesce(p_data->>'portal',portal),
    description=coalesce(p_data->>'description',''),permissions=wanted where organization_id=p_org and id=p_id;
 end if;
 return jsonb_build_object('id',next_id);
end;
$$;
create function public.rh_identity_delete_type(p_org uuid,p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform 1 from public.rh_organizations where id=p_org for update;
 if not rh_private.identity_can(p_org,'roles.delete') or not rh_private.identity_admin(p_org) then raise exception 'Admin required' using errcode='42501'; end if;
 delete from public.rh_account_types where organization_id=p_org and id=p_id and not system_type and not full_access;
 if not found then raise exception 'Protected or missing type'; end if;
 return jsonb_build_object('id',p_id);
end;
$$;

-- Password changes invalidate ALL old sessions immediately in DB authorization.
create function rh_private.identity_password_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password then
  update public.rh_memberships set session_valid_after=clock_timestamp() where auth_user_id=new.id;
 end if;
 return new;
end;
$$;
create trigger rh_identity_password_changed after update of encrypted_password on auth.users
for each row execute function rh_private.identity_password_changed();

-- Add session/lock revocation to the EXISTING business RLS helpers as well.
create or replace function rh_private.active_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select rh_private.identity_active(org) and exists(select 1 from public.rh_organizations where id=org and data_access_enabled);
$$;
-- Existing can/in_building still check status/gates; extra restrictive RLS below
-- makes password/session revocation apply to every protected table read/write.
create or replace function rh_private.can(org uuid, permission text) returns boolean
language sql stable security definer set search_path = '' as $$
 select rh_private.identity_active(org) and exists (
  select 1 from public.rh_memberships m join public.rh_organizations o on o.id=m.organization_id
  join public.rh_account_types t on t.organization_id=m.organization_id and t.id=m.account_type_id
  where m.organization_id=org and m.auth_user_id=auth.uid() and m.status='active' and o.data_access_enabled
   and m.role in ('manager','staff') and t.portal='manager' and (t.full_access or permission=any(t.permissions))
 );
$$;
create or replace function rh_private.in_building(org uuid, building text) returns boolean
language sql stable security definer set search_path = '' as $$
 select rh_private.identity_active(org) and exists (
  select 1 from public.rh_memberships m join public.rh_organizations o on o.id=m.organization_id
  join public.rh_account_types t on t.organization_id=m.organization_id and t.id=m.account_type_id
  where m.organization_id=org and m.auth_user_id=auth.uid() and m.status='active' and o.data_access_enabled
   and m.role in ('manager','staff') and t.portal='manager'
   and (t.full_access or m.all_buildings or building=any(rh_private.identity_scope(org,m.id)))
 );
$$;
do $$
declare item record;
begin
 for item in select tablename from pg_tables where schemaname='public' and tablename like 'rh\_%' escape '\' loop
  if item.tablename='rh_organizations' then
   execute format('create policy rh_identity_session_gate on public.%I as restrictive for all to authenticated using (rh_private.identity_active(id)) with check (rh_private.identity_active(id))',item.tablename);
  else
   execute format('create policy rh_identity_session_gate on public.%I as restrictive for all to authenticated using (rh_private.identity_active(organization_id)) with check (rh_private.identity_active(organization_id))',item.tablename);
  end if;
 end loop;
end;
$$;

revoke all on function rh_private.identity_active(uuid),rh_private.identity_can(uuid,text),rh_private.identity_admin(uuid),rh_private.identity_scope(uuid,text),rh_private.identity_manageable(uuid,text),rh_private.identity_user(uuid,text),rh_private.identity_password_changed() from public,anon,authenticated;
grant execute on function rh_private.identity_active(uuid) to authenticated;
revoke all on function public.rh_identity_context(uuid),public.rh_identity_update_profile(uuid,jsonb),public.rh_identity_profile_follow_up(uuid,text,text,jsonb),public.rh_identity_update_member(uuid,text,jsonb),public.rh_identity_delete_member(uuid,text),public.rh_identity_save_type(uuid,text,jsonb),public.rh_identity_delete_type(uuid,text) from public,anon,authenticated;
grant execute on function public.rh_identity_context(uuid),public.rh_identity_update_profile(uuid,jsonb),public.rh_identity_profile_follow_up(uuid,text,text,jsonb),public.rh_identity_update_member(uuid,text,jsonb),public.rh_identity_delete_member(uuid,text),public.rh_identity_save_type(uuid,text,jsonb),public.rh_identity_delete_type(uuid,text) to authenticated;
commit;
-- ===== END supabase/migrations/202611040001_identity.sql =====

-- ===== BEGIN supabase/migrations/202611040002_identity_invites.sql =====
-- No invitation is sent by migration. Edge Function must be deployed separately.
begin;
create function rh_private.identity_invite_allowed(p_org uuid,p_member jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare kind public.rh_account_types; actor public.rh_memberships; own public.rh_account_types; scope text[];
begin
 if not rh_private.identity_active(p_org) then raise exception 'Denied' using errcode='42501'; end if;
 if jsonb_typeof(p_member)<>'object' or rh_private.has_credentials(p_member) or exists
  (select 1 from jsonb_object_keys(p_member) k where k not in
   ('name','email','phone','accountTypeId','role','status','allBuildings','buildingIds','residentId','apartmentId','unit','building','floor','department','title','employeeCode','staffGroup','supervisorId','avatar')) then raise exception 'Invalid member'; end if;
 select * into strict kind from public.rh_account_types where organization_id=p_org and id=p_member->>'accountTypeId';
 if kind.full_access then raise exception 'Admin requires separate verified provisioning'; end if;
 if not rh_private.identity_can(p_org,case when kind.portal='resident' then 'users.createResident' else 'users.create' end) then raise exception 'Denied' using errcode='42501'; end if;
 if (kind.portal='resident')<>(p_member->>'role'='resident') then raise exception 'Portal mismatch'; end if;
 if nullif(btrim(p_member->>'name'),'') is null or p_member->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Name/email required'; end if;
 if p_member->>'status' is null or p_member->>'status' not in ('active','inactive') or
    p_member->>'role' is null or p_member->>'role' not in ('manager','staff','resident') then raise exception 'Invalid initial status/role'; end if;
 select * into strict actor from public.rh_memberships where organization_id=p_org and auth_user_id=auth.uid();
 select * into strict own from public.rh_account_types where organization_id=p_org and id=actor.account_type_id;
 scope:=array(select jsonb_array_elements_text(coalesce(p_member->'buildingIds','[]'::jsonb)));
 if not rh_private.identity_admin(p_org) and (not kind.permissions <@ own.permissions or
    (not actor.all_buildings and (coalesce((p_member->>'allBuildings')::boolean,false) or not scope <@ rh_private.identity_scope(p_org,actor.id)))) then raise exception 'Grant exceeds editor'; end if;
 if exists(select 1 from public.rh_memberships m join auth.users u on u.id=m.auth_user_id
   where m.organization_id=p_org and lower(u.email)=lower(btrim(p_member->>'email'))) then raise exception 'Identity already exists'; end if;
 return jsonb_build_object('actor',auth.uid(),'session',auth.jwt()->>'session_id');
end;
$$;

create function public.rh_identity_invite_check(p_org uuid,p_member jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor jsonb;
begin
 actor:=rh_private.identity_invite_allowed(p_org,p_member);
 -- Even an unconfirmed/orphaned Auth user requires explicit reconciliation.
 -- inviteUserByEmail may re-send an old invitation; never auto-link that UID.
 if exists(select 1 from auth.users where lower(email)=lower(btrim(p_member->>'email'))) then raise exception 'Auth identity already exists'; end if;
 return actor || jsonb_build_object('checkedAt',clock_timestamp());
end;
$$;

-- ONLY Edge Function's server client can call this. Never accept an auth UID
-- from a browser invite request or attach an existing user by matching email.
create function public.rh_identity_attach_invite(p_org uuid,p_member jsonb,p_auth_user uuid,p_actor uuid,p_session uuid,p_started timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare new_id text; old_claims text;
begin
 perform 1 from public.rh_organizations where id=p_org for update;
 old_claims:=current_setting('request.jwt.claims',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated','session_id',p_session)::text,true);
 perform rh_private.identity_invite_allowed(p_org,p_member);
 if p_started is null or p_started < clock_timestamp()-interval '5 minutes' or
    not exists(select 1 from auth.users where id=p_auth_user and lower(email)=lower(btrim(p_member->>'email')) and invited_at is not null and created_at>=p_started)
   or exists(select 1 from public.rh_memberships where auth_user_id=p_auth_user) then raise exception 'New invitation identity required'; end if;
 new_id:='u-'||gen_random_uuid()::text;
 insert into public.rh_memberships(organization_id,id,auth_user_id,account_type_id,role,status,name,profile,all_buildings,resident_id)
 values(p_org,new_id,p_auth_user,p_member->>'accountTypeId',p_member->>'role',p_member->>'status',btrim(p_member->>'name'),
  p_member-array['email','name','accountTypeId','role','status','allBuildings','buildingIds','residentId'],
  coalesce((p_member->>'allBuildings')::boolean,false),nullif(p_member->>'residentId',''));
 insert into public.rh_building_assignments(organization_id,member_id,building_id)
 select p_org,new_id,b from jsonb_array_elements_text(coalesce(p_member->'buildingIds','[]'::jsonb)) b;
 perform set_config('request.jwt.claims',coalesce(old_claims,'{}'),true);
 return jsonb_build_object('id',new_id,'invited',true);
end;
$$;
revoke all on function rh_private.identity_invite_allowed(uuid,jsonb),public.rh_identity_invite_check(uuid,jsonb),public.rh_identity_attach_invite(uuid,jsonb,uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.rh_identity_invite_check(uuid,jsonb) to authenticated;
grant execute on function public.rh_identity_attach_invite(uuid,jsonb,uuid,uuid,uuid,timestamptz) to service_role;
commit;
-- ===== END supabase/migrations/202611040002_identity_invites.sql =====

-- ===== BEGIN supabase/migrations/202611070001_business_data.sql =====
-- Phase D: central business data for ResidentHub.
-- Apply AFTER 202610210001_foundation.sql, 202611040001_identity.sql and
-- 202611040002_identity_invites.sql on a backed-up staging/production project.
--
-- Browser access is ONLY through the three RPCs below (load / apply / save_doc).
-- No table grants are added for anon/authenticated; RLS stays as in foundation.
-- Every decision re-reads membership, account type, scope and session from the
-- database (identity_active => locked accounts / revoked sessions fail at once).
-- Nothing is seeded. An organization keeps data_access_enabled=false until an
-- operator enables it (see supabase/sql/bootstrap-organization.sql).
begin;

-- Resident/staff support requests can exist before an apartment link exists.
alter table public.rh_support_requests alter column building_id drop not null;

-- Collections without a dedicated relational table (no FK semantics needed).
create table public.rh_records (
    organization_id uuid not null references public.rh_organizations(id) on delete restrict,
    collection text not null check (collection in ('billingRuns','activity')),
    id text generated always as (payload->>'id') stored not null,
    payload jsonb not null check (jsonb_typeof(payload) = 'object'),
    version bigint not null default 1 check (version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (organization_id, collection, id),
    check (length(id) between 1 and 200)
);
alter table public.rh_records add constraint rh_payload_no_credentials check (not rh_private.has_credentials(payload));
-- Billing ledger idempotency across devices: one run per ledger key.
create unique index rh_billing_run_key on public.rh_records (organization_id, (payload->>'key'))
    where collection = 'billingRuns' and payload ? 'key';
alter table public.rh_records enable row level security;
revoke all on public.rh_records from public, anon, authenticated;
grant all on public.rh_records to service_role;
create policy rh_identity_session_gate on public.rh_records as restrictive for all to authenticated
    using (rh_private.identity_active(organization_id)) with check (rh_private.identity_active(organization_id));

-- ---------------------------------------------------------------- actor
create type rh_private.data_actor as (
    id text, name text, kind text, full_access boolean, all_buildings boolean,
    permissions text[], resident_id text, apartment_id text, email text, scope text[]
);
create type rh_private.data_ctx as (
    contracts text[], apartments text[], buildings text[], customers text[], deposits text[], tasks text[]
);

-- kind: manager | staff | resident. Staff = role staff or the at-staff account
-- type on a manager login (same rule as data.js isStaffPortalSession()).
create function rh_private.data_actor(org uuid) returns rh_private.data_actor
language sql stable security definer set search_path = '' as $$
 select row(m.id, m.name,
   case when m.role = 'resident' then 'resident'
        when m.role = 'staff' or m.account_type_id = 'at-staff' then 'staff' else 'manager' end,
   t.full_access, (t.full_access or m.all_buildings), t.permissions,
   m.resident_id, nullif(m.profile->>'apartmentId', ''), lower(coalesce(u.email, '')),
   rh_private.identity_scope(org, m.id))::rh_private.data_actor
 from public.rh_memberships m
 join public.rh_organizations o on o.id = m.organization_id
 join public.rh_account_types t on t.organization_id = m.organization_id and t.id = m.account_type_id
 join auth.users u on u.id = m.auth_user_id
 where m.organization_id = org and m.auth_user_id = auth.uid() and m.status = 'active'
   and o.data_access_enabled and rh_private.identity_active(org)
   and (m.role = 'resident') = (t.portal = 'resident');
$$;

create function rh_private.data_has(a rh_private.data_actor, perms text[]) returns boolean
language sql immutable set search_path = '' as $$
 select a.kind <> 'resident' and (a.full_access or coalesce(a.permissions && perms, false));
$$;
create function rh_private.data_in_scope(a rh_private.data_actor, building text) returns boolean
language sql immutable set search_path = '' as $$
 select a.kind <> 'resident' and (a.all_buildings or (building is not null and building = any(a.scope)));
$$;

-- ---------------------------------------------------------------- catalog
create function rh_private.data_entities() returns text[]
language sql immutable set search_path = '' as $$
 select array['buildings','apartments','customers','meters','contracts','deposits','depositTransactions',
   'invoices','cashflows','supportRequests','assets','assetTypes','financialAccounts','templates',
   'notificationCampaigns','billingRuns','activity'];
$$;
create function rh_private.data_table(entity text) returns text
language sql immutable set search_path = '' as $$
 select case entity
  when 'buildings' then 'rh_buildings' when 'apartments' then 'rh_apartments' when 'customers' then 'rh_customers'
  when 'meters' then 'rh_meters' when 'contracts' then 'rh_contracts' when 'deposits' then 'rh_deposits'
  when 'depositTransactions' then 'rh_deposit_transactions' when 'invoices' then 'rh_invoices'
  when 'cashflows' then 'rh_cashflows' when 'supportRequests' then 'rh_support_requests'
  when 'assets' then 'rh_assets' when 'assetTypes' then 'rh_asset_types'
  when 'financialAccounts' then 'rh_financial_accounts' when 'templates' then 'rh_templates'
  when 'notificationCampaigns' then 'rh_notification_campaigns'
  when 'billingRuns' then 'rh_records' when 'activity' then 'rh_records' end;
$$;
create function rh_private.data_module(entity text) returns text
language sql immutable set search_path = '' as $$
 select case entity when 'supportRequests' then 'support' when 'notificationCampaigns' then 'notifications'
  when 'depositTransactions' then 'deposits' else entity end;
$$;

-- Same rule as data.js staffCanReadRequest().
create function rh_private.data_staff_task(a rh_private.data_actor, p jsonb) returns boolean
language sql immutable set search_path = '' as $$
 select (p->>'source' = 'staff' and p->>'requesterId' = a.id)
   or (case when p->>'source' = 'staff' then rh_private.data_has(a, array['support.view','support.update'])
            else rh_private.data_has(a, array['staffTasks.view','staffIncome.view']) end
       and case when coalesce(p->>'assigneeId', '') <> '' then p->>'assigneeId' = a.id
                else coalesce(btrim(p->>'assignee'), '') <> ''
                     and lower(btrim(p->>'assignee')) in (lower(btrim(coalesce(a.name, ''))), a.email) end);
$$;

create function rh_private.data_context(org uuid, a rh_private.data_actor) returns rh_private.data_ctx
language plpgsql stable security definer set search_path = '' as $$
declare c rh_private.data_ctx;
begin
 c := row('{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[])::rh_private.data_ctx;
 if a.kind = 'resident' then
  select coalesce(array_agg(x.id), '{}'),
         coalesce(array_agg(distinct x.apartment_id) filter (where x.apartment_id is not null), '{}'),
         coalesce(array_agg(distinct x.customer_id) filter (where x.customer_id is not null), '{}')
    into c.contracts, c.apartments, c.customers
    from public.rh_contracts x
   where x.organization_id = org and (
     (a.resident_id is not null and exists (select 1 from public.rh_contract_tenants t
        where t.organization_id = org and t.contract_id = x.id and t.customer_id = a.resident_id))
     or (a.resident_id is null and a.apartment_id is not null and x.apartment_id = a.apartment_id));
  if a.apartment_id is not null and not (a.apartment_id = any(c.apartments)) then c.apartments := c.apartments || a.apartment_id; end if;
  if a.resident_id is not null and not (a.resident_id = any(c.customers)) then c.customers := c.customers || a.resident_id; end if;
  select coalesce(array_agg(distinct building_id), '{}') into c.buildings
    from public.rh_apartments where organization_id = org and id = any(c.apartments);
  if a.resident_id is not null then
   select coalesce(array_agg(id), '{}') into c.deposits from public.rh_deposits
    where organization_id = org and customer_id = a.resident_id;
  end if;
 elsif a.kind = 'staff' then
  select coalesce(array_agg(s.id), '{}') into c.tasks from public.rh_support_requests s
   where s.organization_id = org and rh_private.data_staff_task(a, s.payload);
 end if;
 return c;
end;
$$;

-- ---------------------------------------------------------------- read rules
create function rh_private.data_customer_visible(org uuid, a rh_private.data_actor, p jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
 select a.all_buildings
   or rh_private.data_in_scope(a, nullif(p->>'buildingId', ''))
   or exists (select 1 from public.rh_contract_tenants t join public.rh_contracts k
              on k.organization_id = t.organization_id and k.id = t.contract_id
              where t.organization_id = org and t.customer_id = p->>'id' and rh_private.data_in_scope(a, k.building_id))
   -- Customers not yet linked to a building/contract stay usable by every manager.
   or (nullif(p->>'buildingId', '') is null and not exists (select 1 from public.rh_contract_tenants t
              where t.organization_id = org and t.customer_id = p->>'id'));
$$;

create function rh_private.data_visible(org uuid, a rh_private.data_actor, c rh_private.data_ctx, entity text, p jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare b text := nullif(p->>'buildingId', ''); rid text := p->>'id'; apt text := nullif(p->>'apartmentId', '');
begin
 if a.kind = 'manager' then
  -- Managers read everything inside their building scope (same as the UI today);
  -- module permissions are enforced on every WRITE in data_authorize().
  case entity
   when 'buildings' then return rh_private.data_in_scope(a, rid);
   when 'customers' then return rh_private.data_customer_visible(org, a, p);
   when 'activity' then return rh_private.data_has(a, array['settings.view'])
        and (p->>'actorId' = a.id or a.all_buildings or rh_private.data_in_scope(a, b));
   when 'notificationCampaigns' then return rh_private.data_has(a, array['notifications.view']);
   when 'billingRuns' then return rh_private.data_has(a, array['invoices.view','invoices.create'])
        and (b is null or rh_private.data_in_scope(a, b));
   when 'assetTypes', 'financialAccounts' then return true;
   else return b is null or rh_private.data_in_scope(a, b);
  end case;
 elsif a.kind = 'staff' then
  case entity
   when 'buildings' then return rh_private.data_in_scope(a, rid);
   when 'apartments' then return rh_private.data_in_scope(a, b);
   when 'supportRequests' then return rh_private.data_staff_task(a, p);
   when 'cashflows' then return rh_private.data_has(a, array['staffIncome.view'])
        and coalesce(p->>'taskId', '') <> '' and (p->>'taskId') = any(c.tasks);
   when 'activity' then return p->>'actorId' = a.id;
   when 'customers' then return rh_private.data_has(a, array['customers.view']) and rh_private.data_customer_visible(org, a, p);
   when 'templates', 'assetTypes' then return rh_private.data_has(a, array[entity || '.view']);
   when 'billingRuns', 'notificationCampaigns', 'financialAccounts' then return false;
   else return rh_private.data_has(a, array[rh_private.data_module(entity) || '.view']) and rh_private.data_in_scope(a, b);
  end case;
 else
  case entity
   when 'buildings' then return rid = any(c.buildings);
   when 'apartments' then return rid = any(c.apartments);
   when 'customers' then return rid = any(c.customers);
   when 'contracts' then return rid = any(c.contracts);
   when 'invoices' then return coalesce(apt = any(c.apartments), false)
        and (coalesce(p->>'contractId' = any(c.contracts), false) or (a.resident_id is not null and p->>'customerId' = a.resident_id))
        and coalesce(p->>'status', 'unpaid') in ('unpaid','sent','payment_pending','paid','overdue');
   when 'supportRequests' then return coalesce(apt = any(c.apartments), false)
        or (a.email <> '' and lower(coalesce(p->>'residentEmail', '')) = a.email);
   when 'meters', 'assets' then return coalesce(apt = any(c.apartments), false);
   when 'deposits' then return rid = any(c.deposits);
   when 'depositTransactions' then return coalesce(p->>'depositId' = any(c.deposits), false);
   when 'templates', 'assetTypes' then return true;
   when 'notificationCampaigns' then return coalesce(p->'recipients', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', a.id))
        or coalesce(p->'targetUserIds', '[]'::jsonb) @> jsonb_build_array(a.id);
   else return false;
  end case;
 end if;
end;
$$;

-- Field projection for limited portals (never widens what the row contains).
create function rh_private.data_project(a rh_private.data_actor, entity text, p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
 select case
  when a.kind = 'staff' and entity = 'supportRequests' and not rh_private.data_has(a, array['staffIncome.view']) then p - 'staffWage'
  when a.kind = 'resident' and entity = 'customers' and p->>'id' is distinct from a.resident_id
    then jsonb_build_object('id', p->'id', 'fullName', p->'fullName', 'name', p->'name')
  when a.kind = 'resident' and entity = 'notificationCampaigns'
    then p || jsonb_build_object('recipients', coalesce((select jsonb_agg(r) from jsonb_array_elements(coalesce(p->'recipients', '[]'::jsonb)) r where r->>'id' = a.id), '[]'::jsonb),
                                 'targetUserIds', jsonb_build_array(a.id))
  else p end;
$$;

-- Keys whose value differs between two payloads (hidden keys excluded).
create function rh_private.data_changed_keys(oldp jsonb, newp jsonb, hidden text[]) returns text[]
language sql immutable set search_path = '' as $$
 select coalesce(array_agg(k), '{}') from (
   select k from jsonb_object_keys(coalesce(oldp, '{}'::jsonb)) k union select k from jsonb_object_keys(newp) k
 ) keys(k) where not (k = any(hidden)) and (oldp->k) is distinct from (newp->k);
$$;
create function rh_private.data_merge(oldp jsonb, newp jsonb, keys text[]) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare result jsonb := oldp; k text;
begin
 foreach k in array keys loop
  if newp ? k then result := result || jsonb_build_object(k, newp->k); else result := result - k; end if;
 end loop;
 return result;
end;
$$;

-- ---------------------------------------------------------------- write rules
-- Returns the payload to store, or raises 42501. Mirrors the existing UI guards
-- (RHP.guard/can + data.js staff rules) so a direct API call cannot bypass them.
create function rh_private.data_authorize(org uuid, a rh_private.data_actor, c rh_private.data_ctx, entity text, op text, oldp jsonb, newp jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare act text; need text[]; changed text[]; allowed text[]; perm text; assigned boolean; apt_building text;
        b_old text := nullif(oldp->>'buildingId', ''); b_new text := nullif(newp->>'buildingId', '');
        terminal text[] := array['ended','terminated','expired','liquidated','settled','closed','cancelled'];
begin
 act := case when op = 'delete' then 'delete' when oldp is null then 'create' else 'update' end;
 if entity = 'activity' then
  -- Append-only audit: own rows only, never edited or removed.
  if act <> 'create' or newp->>'actorId' is distinct from a.id or a.kind = 'resident' then raise exception 'Denied' using errcode = '42501'; end if;
  return newp;
 end if;

 if a.kind = 'manager' then
  need := case
   when entity in ('deposits','depositTransactions') then array['contracts.create','contracts.update','customers.update']
   when entity = 'cashflows' then array['invoices.collect','invoices.update','invoices.create','support.update','settings.update']
   when entity = 'financialAccounts' then array['settings.update']
   when entity = 'billingRuns' then array['invoices.create']
   when entity = 'supportRequests' and act = 'create' then array['support.create','support.update']
   when entity = 'supportRequests' then array['support.update']
   when entity = 'invoices' and act = 'update' then array['invoices.update','invoices.approve','invoices.issue','invoices.send','invoices.collect','invoices.adjust']
   else array[rh_private.data_module(entity) || '.' || act] end;
  if not rh_private.data_has(a, need) then raise exception 'Denied' using errcode = '42501'; end if;
  if entity = 'invoices' and act = 'update' then
   if newp->>'status' = 'paid' and oldp->>'status' is distinct from 'paid' and not rh_private.data_has(a, array['invoices.collect']) then raise exception 'Denied' using errcode = '42501'; end if;
   if newp->>'status' = 'approved' and oldp->>'status' is distinct from 'approved' and not rh_private.data_has(a, array['invoices.approve']) then raise exception 'Denied' using errcode = '42501'; end if;
  end if;
  if entity = 'meters' and act = 'update' and (oldp->'approvalStatus') is distinct from (newp->'approvalStatus')
     and (newp->>'approvalStatus' = 'đã_duyệt' or oldp->>'approvalStatus' = 'đã_duyệt')
     and not rh_private.data_has(a, array['meters.approve']) then raise exception 'Denied' using errcode = '42501'; end if;
  if entity = 'buildings' then
   if act = 'create' and not (a.all_buildings or newp->>'managerId' = a.id) then raise exception 'Denied' using errcode = '42501'; end if;
   if act <> 'create' and not rh_private.data_in_scope(a, oldp->>'id') then raise exception 'Denied' using errcode = '42501'; end if;
  elsif (b_old is not null and not rh_private.data_in_scope(a, b_old)) or (b_new is not null and not rh_private.data_in_scope(a, b_new)) then
   raise exception 'Denied' using errcode = '42501';
  end if;
  return newp;
 end if;

 if a.kind = 'staff' then
  if entity <> 'supportRequests' or act = 'delete' then raise exception 'Denied' using errcode = '42501'; end if;
  if act = 'create' then
   if not rh_private.data_has(a, array['support.create']) or newp->>'source' is distinct from 'staff'
      or newp->>'requesterId' is distinct from a.id or not rh_private.data_in_scope(a, b_new)
      or newp ? 'staffWage' or coalesce(newp->>'assigneeId', '') <> '' then raise exception 'Denied' using errcode = '42501'; end if;
   return newp;
  end if;
  assigned := case when coalesce(oldp->>'assigneeId', '') <> '' then oldp->>'assigneeId' = a.id
                   else coalesce(btrim(oldp->>'assignee'), '') <> '' and lower(btrim(oldp->>'assignee')) in (lower(btrim(coalesce(a.name, ''))), a.email) end;
  perm := case when oldp->>'source' = 'staff' then 'support.update'
               when newp->>'staffTaskStatus' = 'pending_approval' then 'staffTasks.report'
               when newp->>'staffTaskStatus' = 'in_progress' then 'staffTasks.accept' else 'staffTasks.update' end;
  allowed := case when oldp->>'source' = 'staff' then array['status','response','messages','updatedAt']
                  else array['status','staffTaskStatus','startedAt','acceptedAt','staffCompletionNote','staffCompletedAt','staffProgress','staffMaterials','updatedAt'] end;
  changed := rh_private.data_changed_keys(oldp, newp, case when rh_private.data_has(a, array['staffIncome.view']) then '{}'::text[] else array['staffWage'] end);
  if not assigned or not rh_private.data_has(a, array[perm]) or not (changed <@ allowed)
     or (newp ? 'staffWage' and not rh_private.data_has(a, array['staffIncome.view']))
     or (oldp->>'source' is distinct from 'staff' and 'status' = any(changed) and (newp->>'status' is distinct from 'in_progress' or not rh_private.data_has(a, array['staffTasks.accept'])))
     or (oldp->>'source' is distinct from 'staff' and 'staffTaskStatus' = any(changed) and coalesce(newp->>'staffTaskStatus', '') not in ('in_progress','pending_approval'))
     or (oldp->>'source' is distinct from 'staff' and newp->>'staffTaskStatus' = 'pending_approval' and 'staffTaskStatus' = any(changed) and oldp->>'status' is distinct from 'in_progress')
     or (oldp->>'source' = 'staff' and 'status' = any(changed) and coalesce(newp->>'status', '') not in ('new','accepted','in_progress','resolved','closed'))
  then raise exception 'Denied' using errcode = '42501'; end if;
  return rh_private.data_merge(oldp, newp, changed);
 end if;

 -- Resident portal.
 if entity = 'supportRequests' and act = 'create' then
  if b_new is null and nullif(newp->>'apartmentId', '') is null then apt_building := null;
  else select building_id into apt_building from public.rh_apartments where organization_id = org and id = nullif(newp->>'apartmentId', ''); end if;
  if (coalesce(newp->>'customerId', '') <> '' and newp->>'customerId' is distinct from a.resident_id)
     or (nullif(newp->>'apartmentId', '') is not null and not (newp->>'apartmentId' = any(c.apartments)))
     or (nullif(newp->>'apartmentId', '') is not null and b_new is distinct from apt_building)
     or (nullif(newp->>'apartmentId', '') is null and b_new is not null and not (b_new = any(c.buildings)))
     or lower(coalesce(newp->>'residentEmail', '')) is distinct from a.email
     or coalesce(newp->>'status', 'new') <> 'new' or newp ? 'staffWage' or coalesce(newp->>'assigneeId', '') <> ''
  then raise exception 'Denied' using errcode = '42501'; end if;
  return newp;
 end if;
 if act <> 'update' then raise exception 'Denied' using errcode = '42501'; end if;
 changed := rh_private.data_changed_keys(oldp, newp, '{}'::text[]);
 if entity = 'supportRequests' then
  allowed := array['messages','status','step','closedAt','resolvedAt','updatedAt','rating','reviewText','ratedAt'];
  if 'status' = any(changed) and coalesce(newp->>'status', '') not in ('closed','in_progress') then raise exception 'Denied' using errcode = '42501'; end if;
 elsif entity = 'invoices' then
  allowed := array['status','paymentMethod','paymentAmount','paymentRequestedAt','paymentTransactions','paymentReview'];
  if coalesce(oldp->>'status', 'unpaid') not in ('unpaid','sent','overdue','payment_pending')
     or ('status' = any(changed) and newp->>'status' is distinct from 'payment_pending') then raise exception 'Denied' using errcode = '42501'; end if;
 elsif entity = 'contracts' then
  allowed := array['renewalRequest','status','signedAt','updatedAt'];
  if 'status' = any(changed) and (newp->>'status' is distinct from 'active' or lower(coalesce(oldp->>'status', '')) = any(terminal)) then raise exception 'Denied' using errcode = '42501'; end if;
 else
  raise exception 'Denied' using errcode = '42501';
 end if;
 if not (changed <@ allowed) then raise exception 'Denied' using errcode = '42501'; end if;
 return rh_private.data_merge(oldp, newp, changed);
end;
$$;

-- ---------------------------------------------------------------- RPCs
create function public.rh_data_load(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a rh_private.data_actor; c rh_private.data_ctx; e text; tbl text; rows jsonb; collections jsonb := '{}'; docs jsonb;
begin
 a := rh_private.data_actor(p_org);
 if a.id is null then raise exception 'Data access denied' using errcode = '42501'; end if;
 c := rh_private.data_context(p_org, a);
 foreach e in array rh_private.data_entities() loop
  tbl := rh_private.data_table(e);
  execute format('select coalesce(jsonb_agg(jsonb_build_object(''p'', rh_private.data_project($2, $4, payload), ''v'', version) order by created_at, id), ''[]''::jsonb)
                    from public.%I where organization_id = $1 %s and rh_private.data_visible($1, $2, $3, $4, payload) is true',
                 tbl, case when tbl = 'rh_records' then 'and collection = $4' else '' end)
   into rows using p_org, a, c, e;
  collections := collections || jsonb_build_object(e, rows);
 end loop;
 select coalesce(jsonb_object_agg(substring(s.id from '[^:]+$'), jsonb_build_object('value', s.payload->'value', 'v', s.version)), '{}'::jsonb)
   into docs from public.rh_settings s
  where s.organization_id = p_org and (
    (s.member_id = a.id and s.id in ('member:' || a.id || ':settings', 'member:' || a.id || ':invoiceModule'))
    or (s.id = 'org:billingMeta' and a.kind = 'manager' and rh_private.data_has(a, array['invoices.view','invoices.create'])));
 return jsonb_build_object('member', a.id, 'kind', a.kind, 'collections', collections, 'docs', docs, 'serverTime', now());
end;
$$;

-- p_changes: [{op:'upsert'|'delete', id, version, payload}] for ONE collection.
-- version = the version the browser last read (0 = new record). Any mismatch
-- raises 40001 instead of overwriting another device's change.
create function public.rh_data_apply(p_org uuid, p_entity text, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a rh_private.data_actor; c rh_private.data_ctx; tbl text; filter text; ch jsonb; op text; rid text;
        expected bigint; oldp jsonb; oldv bigint; newp jsonb; finalp jsonb; v bigint; result jsonb := '[]';
begin
 a := rh_private.data_actor(p_org);
 if a.id is null then raise exception 'Data access denied' using errcode = '42501'; end if;
 tbl := rh_private.data_table(p_entity);
 if tbl is null then raise exception 'Unknown collection' using errcode = '22023'; end if;
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 500
    or octet_length(p_changes::text) > 25000000 then raise exception 'Invalid change set' using errcode = '22023'; end if;
 -- Serialize writers of the same collection so visibility/FK checks see a stable state.
 perform pg_advisory_xact_lock(hashtext(p_org::text || '|' || p_entity));
 c := rh_private.data_context(p_org, a);
 filter := case when tbl = 'rh_records' then ' and collection = $3' else '' end;
 for ch in select value from jsonb_array_elements(p_changes) loop
  op := ch->>'op'; rid := ch->>'id';
  if op is null or op not in ('upsert','delete') or rid is null or length(rid) not between 1 and 200
     or jsonb_typeof(ch->'version') is distinct from 'number' then raise exception 'Invalid change' using errcode = '22023'; end if;
  expected := (ch->>'version')::bigint;
  oldp := null; oldv := null;
  execute format('select payload, version from public.%I where organization_id = $1 and id = $2' || filter || ' for update', tbl)
   into oldp, oldv using p_org, rid, p_entity;
  if oldp is not null and rh_private.data_visible(p_org, a, c, p_entity, oldp) is not true then
   raise exception 'Denied' using errcode = '42501';
  end if;
  if op = 'delete' then
   if oldp is null then continue; end if; -- already removed elsewhere: same end state
   if oldv <> expected then raise exception 'rh_conflict' using errcode = '40001'; end if;
   perform rh_private.data_authorize(p_org, a, c, p_entity, 'delete', oldp, null);
   if p_entity = 'contracts' then delete from public.rh_contract_tenants where organization_id = p_org and contract_id = rid; end if;
   if p_entity = 'buildings' then delete from public.rh_building_assignments where organization_id = p_org and building_id = rid; end if;
   execute format('delete from public.%I where organization_id = $1 and id = $2' || filter, tbl) using p_org, rid, p_entity;
   result := result || jsonb_build_array(jsonb_build_object('op', 'delete', 'id', rid));
   continue;
  end if;
  newp := ch->'payload';
  if jsonb_typeof(newp) is distinct from 'object' or newp->>'id' is distinct from rid then raise exception 'Invalid payload' using errcode = '22023'; end if;
  if rh_private.has_credentials(newp) then raise exception 'Credential fields are not stored' using errcode = '22023'; end if;
  if coalesce(oldv, 0) <> expected then raise exception 'rh_conflict' using errcode = '40001'; end if;
  finalp := rh_private.data_authorize(p_org, a, c, p_entity, 'upsert', oldp, newp);
  if oldp is null then
   if tbl = 'rh_records' then
    insert into public.rh_records(organization_id, collection, payload) values (p_org, p_entity, finalp);
   else
    execute format('insert into public.%I(organization_id, payload) values ($1, $2)', tbl) using p_org, finalp;
   end if;
   v := 1;
  else
   execute format('update public.%I set payload = $4, version = version + 1, updated_at = now() where organization_id = $1 and id = $2' || filter || ' returning version', tbl)
    into v using p_org, rid, p_entity, finalp;
  end if;
  if p_entity = 'contracts' then
   -- Co-tenant relation is derived server-side; FK rejects unknown customers.
   delete from public.rh_contract_tenants where organization_id = p_org and contract_id = rid;
   insert into public.rh_contract_tenants(organization_id, contract_id, customer_id)
   select distinct p_org, rid, t from (
     select jsonb_array_elements_text(case when jsonb_typeof(finalp->'tenantIds') = 'array' then finalp->'tenantIds' else '[]'::jsonb end) t
     union select jsonb_array_elements_text(case when jsonb_typeof(finalp->'customerIds') = 'array' then finalp->'customerIds' else '[]'::jsonb end)
     union select finalp->>'customerId'
   ) ids where coalesce(t, '') <> '';
  end if;
  result := result || jsonb_build_array(jsonb_build_object('op', 'upsert', 'id', rid, 'version', v, 'payload', rh_private.data_project(a, p_entity, finalp)));
 end loop;
 return result;
end;
$$;

-- Small JSON documents: per-member settings/invoice module and the org billing meta.
create function public.rh_data_save_doc(p_org uuid, p_doc text, p_value jsonb, p_version bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a rh_private.data_actor; did text; mid text; oldv bigint; v bigint;
begin
 a := rh_private.data_actor(p_org);
 if a.id is null then raise exception 'Data access denied' using errcode = '42501'; end if;
 if p_doc in ('settings','invoiceModule') then did := 'member:' || a.id || ':' || p_doc; mid := a.id;
 elsif p_doc = 'billingMeta' and a.kind = 'manager' and rh_private.data_has(a, array['invoices.create']) then did := 'org:billingMeta'; mid := null;
 else raise exception 'Denied' using errcode = '42501'; end if;
 if p_value is null or octet_length(p_value::text) > 5000000 or rh_private.has_credentials(p_value) or p_version is null then
  raise exception 'Invalid document' using errcode = '22023';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_org::text || '|doc|' || did));
 select version into oldv from public.rh_settings where organization_id = p_org and id = did for update;
 if coalesce(oldv, 0) <> p_version then raise exception 'rh_conflict' using errcode = '40001'; end if;
 if oldv is null then
  insert into public.rh_settings(organization_id, id, member_id, payload) values (p_org, did, mid, jsonb_build_object('value', p_value));
  v := 1;
 else
  update public.rh_settings set payload = jsonb_build_object('value', p_value), version = version + 1
   where organization_id = p_org and id = did returning version into v;
 end if;
 return jsonb_build_object('doc', p_doc, 'version', v);
end;
$$;

revoke all on function rh_private.data_actor(uuid), rh_private.data_has(rh_private.data_actor, text[]),
  rh_private.data_in_scope(rh_private.data_actor, text), rh_private.data_entities(), rh_private.data_table(text),
  rh_private.data_module(text), rh_private.data_staff_task(rh_private.data_actor, jsonb),
  rh_private.data_context(uuid, rh_private.data_actor), rh_private.data_customer_visible(uuid, rh_private.data_actor, jsonb),
  rh_private.data_visible(uuid, rh_private.data_actor, rh_private.data_ctx, text, jsonb),
  rh_private.data_project(rh_private.data_actor, text, jsonb), rh_private.data_changed_keys(jsonb, jsonb, text[]),
  rh_private.data_merge(jsonb, jsonb, text[]),
  rh_private.data_authorize(uuid, rh_private.data_actor, rh_private.data_ctx, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.rh_data_load(uuid), public.rh_data_apply(uuid, text, jsonb),
  public.rh_data_save_doc(uuid, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.rh_data_load(uuid), public.rh_data_apply(uuid, text, jsonb),
  public.rh_data_save_doc(uuid, text, jsonb, bigint) to authenticated;
commit;
-- ===== END supabase/migrations/202611070001_business_data.sql =====
