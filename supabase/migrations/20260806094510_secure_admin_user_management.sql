-- A3: administrator profile management with validation and append-only auditing.
-- The applied 001 baseline is intentionally left unchanged.

create or replace function public.admin_update_profile(
  p_target_id uuid,
  p_first_name text,
  p_last_name text,
  p_department text,
  p_student_number text,
  p_role text,
  p_is_active boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_before public.profiles;
  v_after public.profiles;
  v_first_name text := btrim(coalesce(p_first_name, ''));
  v_last_name text := btrim(coalesce(p_last_name, ''));
  v_department text := nullif(btrim(coalesce(p_department, '')), '');
  v_student_number text := nullif(btrim(coalesce(p_student_number, '')), '');
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'active administrator access required';
  end if;

  if p_role not in ('student', 'admin') then
    raise exception using errcode = '22023', message = 'role must be student or admin';
  end if;

  if length(v_first_name) not between 1 and 80
    or length(v_last_name) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'first and last name are required and must not exceed 80 characters';
  end if;

  if length(coalesce(v_department, '')) > 120
    or length(coalesce(v_student_number, '')) > 50 then
    raise exception using errcode = '22023', message = 'profile field exceeds the allowed length';
  end if;

  select * into v_before
  from public.profiles
  where id = p_target_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'profile not found';
  end if;

  if p_target_id = v_actor_id
    and (p_role <> v_before.role or p_is_active <> v_before.is_active) then
    raise exception using errcode = '42501', message = 'administrators cannot change their own role or active status';
  end if;

  if v_before.role = 'admin' and v_before.is_active
    and (p_role <> 'admin' or not p_is_active)
    and not exists (
      select 1
      from public.profiles p
      where p.id <> p_target_id
        and p.role = 'admin'
        and p.is_active
    ) then
    raise exception using errcode = '23514', message = 'at least one active administrator is required';
  end if;

  update public.profiles
  set first_name = v_first_name,
      last_name = v_last_name,
      department = v_department,
      student_number = v_student_number,
      role = p_role,
      is_active = p_is_active
  where id = p_target_id
  returning * into v_after;

  insert into public.activity_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_actor_id,
    'admin.profile_updated',
    'profile',
    p_target_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'role', v_before.role,
        'is_active', v_before.is_active,
        'first_name', v_before.first_name,
        'last_name', v_before.last_name,
        'department', v_before.department,
        'student_number', v_before.student_number
      ),
      'after', jsonb_build_object(
        'role', v_after.role,
        'is_active', v_after.is_active,
        'first_name', v_after.first_name,
        'last_name', v_after.last_name,
        'department', v_after.department,
        'student_number', v_after.student_number
      )
    )
  );

  return v_after;
end;
$$;

comment on function public.admin_update_profile(uuid, text, text, text, text, text, boolean) is
  'Intentional authenticated Data API helper. Validates active-admin authority, prevents self-lockout and last-admin removal, updates approved profile fields, and appends an audit record.';

revoke all on function public.admin_update_profile(uuid, text, text, text, text, text, boolean) from public;
revoke all on function public.admin_update_profile(uuid, text, text, text, text, text, boolean) from anon;
grant execute on function public.admin_update_profile(uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text, text, text, text, boolean) to service_role;
