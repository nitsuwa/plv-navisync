-- Repeatable privilege checks for admin_update_profile. Test users/logs roll back.
begin;

do $$
declare
  v_root_a uuid := gen_random_uuid();
  v_root_b uuid := gen_random_uuid();
  v_admin_id uuid := gen_random_uuid();
  v_student_id uuid := gen_random_uuid();
  v_denied boolean;
  v_profile public.profiles;
begin
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_root_a, 'authenticated', 'authenticated', 'a4-root-a-' || v_root_a || '@example.invalid',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('first_name', 'A4', 'last_name', 'RootA', 'student_number', '90-' || lpad((floor(random() * 10000))::int::text, 4, '0')), now(), now()),
    (v_root_b, 'authenticated', 'authenticated', 'a4-root-b-' || v_root_b || '@example.invalid',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('first_name', 'A4', 'last_name', 'RootB', 'student_number', '91-' || lpad((floor(random() * 10000))::int::text, 4, '0')), now(), now()),
    (v_admin_id, 'authenticated', 'authenticated', 'a4-admin-' || v_admin_id || '@example.invalid',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('first_name', 'A4', 'last_name', 'Admin', 'student_number', '92-' || lpad((floor(random() * 10000))::int::text, 4, '0')), now(), now()),
    (v_student_id, 'authenticated', 'authenticated', 'a4-student-' || v_student_id || '@example.invalid',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('first_name', 'A4', 'last_name', 'Student', 'student_number', '93-' || lpad((floor(random() * 10000))::int::text, 4, '0')), now(), now());

  perform set_config('navisync.admin_profile_update', '1', true);
  update public.profiles set role = 'super_admin' where id in (v_root_a, v_root_b);
  update public.profiles set role = 'admin' where id = v_admin_id;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_root_a::text, true);

  -- Another Super Admin can demote and deactivate this Super Admin because A remains active.
  perform public.admin_update_profile(v_root_b, 'A4', 'RootB', 'Office', null, 'admin', true);
  select * into strict v_profile from public.profiles where id = v_root_b;
  if v_profile.role <> 'admin' then raise exception 'A4 assertion failed: Super Admin could not demote another Super Admin'; end if;
  perform public.admin_update_profile(v_root_b, 'A4', 'RootB', 'Office', null, 'super_admin', true);
  perform public.admin_update_profile(v_root_b, 'A4', 'RootB', 'Office', null, 'super_admin', false);
  select * into strict v_profile from public.profiles where id = v_root_b;
  if v_profile.is_active then raise exception 'A4 assertion failed: Super Admin could not deactivate another Super Admin'; end if;

  -- An ordinary Admin cannot manage a privileged target, regardless of submitted role.
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_denied := false;
  begin
    perform public.admin_update_profile(v_root_a, 'A4', 'RootA', '', null, 'admin', true);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'A4 assertion failed: ordinary Admin managed a Super Admin'; end if;

  -- Self-demotion/deactivation is blocked server-side.
  perform set_config('request.jwt.claim.sub', v_root_a::text, true);
  v_denied := false;
  begin
    perform public.admin_update_profile(v_root_a, 'A4', 'RootA', '', null, 'admin', false);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'A4 assertion failed: Super Admin could demote/deactivate self'; end if;

  -- Non-Student role conversions must clear Student ID rather than preserve stale identity data.
  perform public.admin_update_profile(v_student_id, 'A4', 'Student', 'Office', null, 'student_org', true);
  select * into strict v_profile from public.profiles where id = v_student_id;
  if v_profile.student_number is not null then raise exception 'A4 assertion failed: Student ID remained on non-Student profile'; end if;

  if has_function_privilege('anon', 'public.admin_update_profile(uuid,text,text,text,text,text,boolean)', 'EXECUTE') then
    raise exception 'A4 assertion failed: anonymous function execution remains granted';
  end if;
end;
$$;

rollback;

select 'A4 Super Admin profile-management assertions passed' as result;
