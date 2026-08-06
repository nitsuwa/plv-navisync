-- Repeatable A3 privileged profile assertions. All fixtures and logs roll back.

begin;

do $$
declare
  v_admin_id uuid;
  v_target_id uuid := gen_random_uuid();
  v_target public.profiles;
  v_denied boolean := false;
begin
  select id into strict v_admin_id
  from public.profiles
  where role = 'admin' and is_active
  order by created_at
  limit 1;

  insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_target_id,
    'authenticated',
    'authenticated',
    'a3-fixture-' || v_target_id || '@example.invalid',
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('first_name', 'A3', 'last_name', 'Fixture', 'student_number', 'A3-' || left(v_target_id::text, 8)),
    now(),
    now()
  );

  perform set_config('request.jwt.claim.sub', v_target_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.admin_update_profile(v_target_id, 'Unsafe', 'Student', '', '', 'admin', true);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'A3 assertion failed: student executed the admin profile RPC';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform public.admin_update_profile(v_target_id, 'Updated', 'Fixture', 'Testing', 'A3-UPDATED', 'admin', true);
  perform public.admin_update_profile(v_target_id, 'Updated', 'Fixture', 'Testing', 'A3-UPDATED', 'admin', false);

  select * into strict v_target from public.profiles where id = v_target_id;
  if v_target.first_name <> 'Updated' or v_target.department <> 'Testing' or v_target.is_active then
    raise exception 'A3 assertion failed: approved admin update was not applied';
  end if;

  if not exists (
    select 1 from public.activity_logs
    where actor_id = v_admin_id
      and entity_id = v_target_id
      and action = 'admin.profile_updated'
  ) then
    raise exception 'A3 assertion failed: privileged update was not audited';
  end if;

  perform set_config('request.jwt.claim.sub', v_target_id::text, true);
  v_denied := false;
  begin
    perform public.admin_update_profile(v_target_id, 'Inactive', 'Admin', '', '', 'admin', true);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'A3 assertion failed: inactive administrator retained privileged access';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_denied := false;
  begin
    perform public.admin_update_profile(v_admin_id, 'Self', 'Admin', '', '', 'student', false);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'A3 assertion failed: administrator could self-demote/deactivate';
  end if;

  if has_function_privilege('anon', 'public.admin_update_profile(uuid,text,text,text,text,text,boolean)', 'EXECUTE') then
    raise exception 'A3 assertion failed: anonymous function execution remains granted';
  end if;
end;
$$;

rollback;

select 'A3 administrator user-management assertions passed' as result;
