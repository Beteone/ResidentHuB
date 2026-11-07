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
