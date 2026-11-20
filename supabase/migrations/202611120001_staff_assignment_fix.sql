-- Repair the demo staff scope/profile and make two existing open demo requests
-- visible in the staff task list. Safe to re-run from Supabase SQL Editor.
begin;

do $$
declare
    v_org constant uuid := '32652966-796f-48ac-abe1-dbbc19f5fd75';
    v_staff constant text := 'u-demo-staff-b12efa14-78a9-4d96-963d-ffbbc7727176';
    v_auth constant uuid := 'b12efa14-78a9-4d96-963d-ffbbc7727176';
    v_staff_name text;
    v_task_ids text[];
    v_task_count integer;
    v_type_count integer;
begin
    select m.name into strict v_staff_name
    from public.rh_memberships m
    where m.organization_id = v_org
      and m.id = v_staff
      and m.auth_user_id = v_auth
      and m.account_type_id = 'at-staff'
      and m.role = 'staff'
      and m.status = 'active';

    if exists (
        select 1
        from unnest(array[
            'demo-rh-building-01',
            'demo-rh-building-02',
            'demo-rh-building-03'
        ]::text[]) as target(building_id)
        where not exists (
            select 1
            from public.rh_buildings b
            where b.organization_id = v_org
              and b.id = target.building_id
        )
    ) then
        raise exception 'Thiếu một hoặc nhiều tòa demo-rh-building-01..03. Hãy chạy seed demo trước.';
    end if;

    update public.rh_memberships
    set profile = profile || jsonb_build_object(
            'title', 'Kỹ thuật viên',
            'department', 'Kỹ thuật - Sửa chữa',
            'staffGroup', 'technical',
            'employeeCode', 'NV-DEMO-001',
            'employmentStartDate', '2026-01-01'
        ),
        all_buildings = false
    where organization_id = v_org
      and id = v_staff
      and auth_user_id = v_auth;

    insert into public.rh_building_assignments (organization_id, member_id, building_id)
    select v_org, v_staff, target.building_id
    from unnest(array[
        'demo-rh-building-01',
        'demo-rh-building-02',
        'demo-rh-building-03'
    ]::text[]) as target(building_id)
    on conflict (organization_id, member_id, building_id) do nothing;

    update public.rh_account_types t
    set permissions = t.permissions || array(
        select permission
        from unnest(array[
            'staffTasks.view',
            'staffTasks.accept',
            'staffTasks.update',
            'staffTasks.report'
        ]::text[]) as required(permission)
        where not (required.permission = any(t.permissions))
    )
    where t.organization_id = v_org
      and t.id = 'at-staff'
      and t.portal = 'manager';
    get diagnostics v_type_count = row_count;
    if v_type_count <> 1 then
        raise exception 'Không tìm thấy account type at-staff dạng portal manager trong organization demo.';
    end if;

    select coalesce(array_agg(candidate.id), array[]::text[])
    into v_task_ids
    from (
        select s.id
        from public.rh_support_requests s
        where s.organization_id = v_org
          and s.id like 'demo-rh-%'
          and s.building_id = any(array[
              'demo-rh-building-01',
              'demo-rh-building-02',
              'demo-rh-building-03'
          ]::text[])
          and coalesce(s.payload->>'source', '') <> 'staff'
          and coalesce(s.payload->>'status', '') not in ('resolved', 'closed')
        order by s.id
        limit 2
    ) candidate;
    v_task_count := cardinality(v_task_ids);

    if v_task_count > 0 then
        update public.rh_support_requests s
        set payload = s.payload || jsonb_build_object(
                'assigneeId', v_staff,
                'assignee', v_staff_name,
                'staffGroup', 'technical',
                'status', case
                    when s.payload->>'status' = 'new' then 'accepted'
                    else s.payload->>'status'
                end,
                'staffTaskStatus', coalesce(nullif(s.payload->>'staffTaskStatus', ''), 'waiting'),
                'updatedAt', (extract(epoch from clock_timestamp()) * 1000)::bigint
            ),
            version = s.version + 1,
            updated_at = clock_timestamp()
        where s.organization_id = v_org
          and s.id = any(v_task_ids)
          and (
              s.payload->>'assigneeId' is distinct from v_staff
              or s.payload->>'assignee' is distinct from v_staff_name
              or s.payload->>'staffGroup' is distinct from 'technical'
              or (s.payload->>'status' = 'new')
              or coalesce(s.payload->>'staffTaskStatus', '') = ''
          );
    end if;

    if v_task_count < 2 then
        raise notice 'Đã sửa scope/profile; hiện có % yêu cầu hỗ trợ demo đang mở ở 3 tòa. Seed demo sẽ tạo ít nhất hai nhiệm vụ phù hợp.',
            v_task_count;
    end if;
end
$$;

commit;
