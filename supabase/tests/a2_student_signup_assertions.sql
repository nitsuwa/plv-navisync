-- Repeatable A2 student-profile trigger assertions.
-- The controlled auth fixture and its trigger-created profile are rolled back.

begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_profile public.profiles%rowtype;
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    'authenticated',
    'authenticated',
    'a2-fixture-' || v_user_id || '@example.invalid',
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object(
      'first_name', 'Fixture',
      'last_name', 'Student',
      'student_number', 'a2-2026-0001',
      'role', 'admin',
      'is_active', false
    ),
    now(),
    now()
  );

  select * into strict v_profile
  from public.profiles
  where id = v_user_id;

  if v_profile.role <> 'student' then
    raise exception 'A2 assertion failed: public signup metadata changed role to %', v_profile.role;
  end if;

  if not v_profile.is_active then
    raise exception 'A2 assertion failed: public signup metadata disabled the profile';
  end if;

  if v_profile.first_name <> 'Fixture'
     or v_profile.last_name <> 'Student'
     or v_profile.student_number <> 'A2-2026-0001' then
    raise exception 'A2 assertion failed: reviewed student metadata was not preserved';
  end if;

  if has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') then
    raise exception 'A2 assertion failed: browser roles can execute the auth trigger function';
  end if;
end;
$$;

rollback;

select 'A2 student signup assertions passed' as result;
