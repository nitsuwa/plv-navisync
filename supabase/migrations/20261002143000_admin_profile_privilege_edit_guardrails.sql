-- Keep privileged-profile edits available to Super Admins while preserving
-- self-protection and the last-active-Super-Admin invariant at the database.
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
  v_actor_role text;
  v_before public.profiles;
  v_after public.profiles;
  v_first_name text := btrim(coalesce(p_first_name, ''));
  v_last_name text := btrim(coalesce(p_last_name, ''));
  v_department text := nullif(btrim(coalesce(p_department, '')), '');
  v_student_number text;
  v_action text := 'admin.profile_updated';
begin
  select p.role into v_actor_role
  from public.profiles p
  where p.id = v_actor_id and p.is_active;
  if v_actor_role is null or v_actor_role not in ('admin', 'super_admin') then
    raise exception using errcode = '42501', message = 'active administrator access required';
  end if;
  if p_role is null or p_role not in ('student', 'student_org', 'admin', 'super_admin') then
    raise exception using errcode = '22023', message = 'invalid role';
  end if;
  if v_actor_role = 'admin' and p_role in ('admin', 'super_admin') then
    raise exception using errcode = '42501', message = 'only a Super Admin can manage privileged roles';
  end if;
  if length(v_first_name) not between 1 and 80 or length(v_last_name) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'first and last name are required';
  end if;
  if p_is_active is null then raise exception using errcode = '22023', message = 'account status is required'; end if;
  if length(coalesce(v_department, '')) > 120 then
    raise exception using errcode = '22023', message = 'department exceeds the allowed length';
  end if;

  select * into v_before from public.profiles where id = p_target_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'profile not found'; end if;
  if v_actor_role = 'admin' and v_before.role in ('admin', 'super_admin') then
    raise exception using errcode = '42501', message = 'only a Super Admin can manage privileged accounts';
  end if;
  if p_target_id = v_actor_id and (p_role <> v_before.role or p_is_active <> v_before.is_active) then
    raise exception using errcode = '42501', message = 'you cannot change your own role or deactivate your own account';
  end if;
  if exists (
    select 1 from public.admin_user_invitations i
    where i.profile_id = p_target_id and i.accepted_at is null and i.revoked_at is null
  ) and p_is_active then
    raise exception using errcode = '42501', message = 'an invitation must be accepted before activating this account';
  end if;

  if p_role = 'student' then
    v_student_number := coalesce(nullif(btrim(coalesce(p_student_number, '')), ''), v_before.student_number);
    if coalesce(v_student_number, '') !~ '^[0-9]{2}-[0-9]{4}$' then
      raise exception using errcode = '22023', message = 'student ID must use the format NN-NNNN';
    end if;
  else
    -- Student IDs are not retained on non-Student profiles.
    v_student_number := null;
  end if;

  if v_before.role = 'super_admin' and v_before.is_active
    and (p_role <> 'super_admin' or not p_is_active) then
    -- Serialize only transitions that can reduce the active Super Admin count.
    -- This keeps two concurrent role/access changes from both removing the last one.
    perform pg_catalog.pg_advisory_xact_lock(1700341, 1);
    if not exists (
      select 1 from public.profiles p
      where p.id <> p_target_id and p.role = 'super_admin' and p.is_active
    ) then
      raise exception using errcode = '23514', message = 'at least one active Super Admin is required';
    end if;
  end if;

  perform set_config('navisync.admin_profile_update', '1', true);
  update public.profiles
  set first_name = v_first_name, last_name = v_last_name, department = v_department,
      student_number = v_student_number, role = p_role, is_active = p_is_active, updated_at = now()
  where id = p_target_id returning * into v_after;

  if v_before.role <> v_after.role then
    v_action := 'admin.user_role_changed';
  elsif v_before.is_active and not v_after.is_active then
    v_action := 'admin.user_deactivated';
  elsif not v_before.is_active and v_after.is_active then
    v_action := 'admin.user_activated';
  end if;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_actor_id,
    v_action,
    'profile',
    p_target_id,
    jsonb_build_object(
      'target_name', concat_ws(' ', v_after.first_name, v_after.last_name),
      'from_role', v_before.role,
      'to_role', v_after.role,
      'before_active', v_before.is_active,
      'after_active', v_after.is_active
    )
  );
  return v_after;
end;
$$;

revoke all on function public.admin_update_profile(uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_update_profile(uuid, text, text, text, text, text, boolean) to authenticated, service_role;
