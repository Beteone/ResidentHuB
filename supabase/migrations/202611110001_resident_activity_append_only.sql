begin;

create or replace function rh_private.data_visible(org uuid, a rh_private.data_actor, c rh_private.data_ctx, entity text, p jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare b text := nullif(p->>'buildingId', ''); rid text := p->>'id'; apt text := nullif(p->>'apartmentId', '');
begin
 if a.kind = 'manager' then
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
   when 'activity' then return p->>'actorId' = a.id;
   else return false;
  end case;
 end if;
end;
$$;

create or replace function rh_private.data_authorize(org uuid, a rh_private.data_actor, c rh_private.data_ctx, entity text, op text, oldp jsonb, newp jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare act text; need text[]; changed text[]; allowed text[]; perm text; assigned boolean; apt_building text;
        b_old text := nullif(oldp->>'buildingId', ''); b_new text := nullif(newp->>'buildingId', '');
        terminal text[] := array['ended','terminated','expired','liquidated','settled','closed','cancelled'];
begin
 act := case when op = 'delete' then 'delete' when oldp is null then 'create' else 'update' end;
 if entity = 'activity' then
  if act <> 'create' or newp->>'actorId' is distinct from a.id then raise exception 'Denied' using errcode = '42501'; end if;
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

commit;
