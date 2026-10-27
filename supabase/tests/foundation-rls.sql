-- NOT YET RUN. Run as postgres ONLY on an isolated test project after migration.
-- Uses synthetic fixtures and JWT claim simulation, NOT real Auth sign-in.
-- Always ends in ROLLBACK. Stop immediately on the first SQL error.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-a000-000000000001','rls-a@example.invalid'),
 ('00000000-0000-4000-a000-000000000002','rls-b@example.invalid');
insert into public.rh_organizations(id,name,data_access_enabled) values
 ('10000000-0000-4000-a000-000000000001','TEST ONLY A',true),
 ('10000000-0000-4000-a000-000000000002','TEST ONLY B',true);
insert into public.rh_account_types(organization_id,id,name,portal,permissions) values
 ('10000000-0000-4000-a000-000000000001','test-manager','Test manager','manager',array['buildings.view','buildings.update']),
 ('10000000-0000-4000-a000-000000000002','test-manager','Test manager','manager',array['buildings.view','buildings.update']);
insert into public.rh_memberships(organization_id,id,auth_user_id,account_type_id,role,status,name,all_buildings) values
 ('10000000-0000-4000-a000-000000000001','test-a','00000000-0000-4000-a000-000000000001','test-manager','manager','active','TEST A',true),
 ('10000000-0000-4000-a000-000000000002','test-b','00000000-0000-4000-a000-000000000002','test-manager','manager','active','TEST B',true);
insert into public.rh_buildings(organization_id,payload) values
 ('10000000-0000-4000-a000-000000000001','{"id":"test-building-a","name":"TEST A"}'),
 ('10000000-0000-4000-a000-000000000002','{"id":"test-building-b","name":"TEST B"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000001',true);
do $$ begin
 if (select count(*) from public.rh_buildings) <> 1 then raise exception 'FAIL organization isolation'; end if;
 if exists(select 1 from public.rh_buildings where organization_id = '10000000-0000-4000-a000-000000000002') then raise exception 'FAIL supplied organization bypass'; end if;
 if rh_private.can('10000000-0000-4000-a000-000000000001','buildings.create') then raise exception 'FAIL manager create escalation'; end if;
 begin
   insert into public.rh_buildings(organization_id,payload) values ('10000000-0000-4000-a000-000000000001','{"id":"not-allowed"}');
   raise exception 'FAIL direct insert accepted';
 exception when insufficient_privilege then null;
 end;
 begin
   update public.rh_memberships set all_buildings = true, account_type_id = 'at-admin';
   raise exception 'FAIL membership update accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
update public.rh_memberships set status = 'locked' where id = 'test-a';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.rh_buildings) then raise exception 'FAIL locked session reads'; end if;
 if rh_private.can('10000000-0000-4000-a000-000000000001','buildings.view') then raise exception 'FAIL locked session permissions'; end if;
end $$;
reset role;
update public.rh_memberships set status = 'active', all_buildings = false where id = 'test-a';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.rh_buildings) then raise exception 'FAIL unassigned scope'; end if;
end $$;
reset role;
insert into public.rh_building_assignments(organization_id,member_id,building_id) values
 ('10000000-0000-4000-a000-000000000001','test-a','test-building-a');
set local role authenticated;
do $$ begin
 if (select count(*) from public.rh_buildings) <> 1 then raise exception 'FAIL explicit scope assignment'; end if;
end $$;
reset role;
do $$ begin
 begin
   insert into public.rh_apartments(organization_id,payload) values ('10000000-0000-4000-a000-000000000001','{"id":"bad-reference","buildingId":"test-building-b"}');
   raise exception 'FAIL cross-organization FK accepted';
 exception when foreign_key_violation then null;
 end;
 begin
   insert into public.rh_account_requests(organization_id,id,email,status,payload) values ('10000000-0000-4000-a000-000000000001','secret-test','test@example.invalid','pending','{"nested":{"password":"MUST NOT STORE"}}');
   raise exception 'FAIL legacy password accepted';
 exception when check_violation then null;
 end;
end $$;
update public.rh_organizations set data_access_enabled = false;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.rh_buildings) then raise exception 'FAIL deployment gate'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
   perform * from public.rh_buildings;
   raise exception 'FAIL anonymous read accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
