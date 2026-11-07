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
