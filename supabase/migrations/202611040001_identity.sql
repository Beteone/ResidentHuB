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
