-- Adds one elevated administrator role and a server-controlled invitation lifecycle.
-- Existing profiles and their current roles are preserved.

do $$
declare
  v_constraint record;
begin
  -- Discover and replace the live role check instead of assuming a constraint name.
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', v_constraint.conname);
  end loop;
  alter table public.profiles add constraint profiles_role_check
    check (role in ('student', 'student_org', 'admin', 'super_admin'));
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'super_admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated, service_role;

-- User lifecycle writes must go through the audited definer RPCs / Auth trigger.
-- Retain self-update for safe profile fields, but never grant browser insert/delete.
drop policy if exists "profiles_insert_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_super_admin_safe_fields"
  on public.profiles for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
revoke insert, delete on public.profiles from anon, authenticated;

create or replace function public.protect_profile_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('navisync.admin_profile_update', true) = '1'
    or current_setting('navisync.invitation_completion', true) = '1' then
    return new;
  end if;
  if new.id is distinct from old.id then raise exception 'profile id cannot be changed'; end if;
  if new.role is distinct from old.role then raise exception 'role can only be changed through user management'; end if;
  if new.is_active is distinct from old.is_active then raise exception 'account status can only be changed through user management'; end if;
  if new.email is distinct from old.email then raise exception 'email is synchronized from authentication'; end if;
  if new.last_login_at is distinct from old.last_login_at then raise exception 'last_login_at is managed by backend logic'; end if;
  return new;
end;
$$;

create table if not exists public.admin_user_invitations (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  invited_role text not null check (invited_role in ('student', 'student_org', 'admin', 'super_admin')),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index if not exists admin_user_invitations_pending_idx
  on public.admin_user_invitations (invited_at desc)
  where accepted_at is null and revoked_at is null;

alter table public.admin_user_invitations enable row level security;
revoke all on public.admin_user_invitations from anon;
revoke insert, update, delete on public.admin_user_invitations from authenticated;
grant select on public.admin_user_invitations to authenticated;
drop policy if exists admin_user_invitations_select_admin on public.admin_user_invitations;
create policy admin_user_invitations_select_admin
  on public.admin_user_invitations for select to authenticated
  using (public.is_admin());
grant all on public.admin_user_invitations to service_role;

-- The intent is written only by the trusted Edge Function immediately before
-- Supabase Auth creates an invited user. It prevents public signup metadata
-- from choosing a privileged role or bypassing the Student ID requirement.
create table if not exists public.admin_invitation_intents (
  email text primary key,
  first_name text not null,
  last_name text not null,
  department text,
  student_number text,
  invited_role text not null check (invited_role in ('student', 'student_org', 'admin', 'super_admin')),
  invited_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

alter table public.admin_invitation_intents enable row level security;
revoke all on public.admin_invitation_intents from public, anon, authenticated;
grant all on public.admin_invitation_intents to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.admin_invitation_intents%rowtype;
  v_is_invite boolean := false;
  v_first_name text;
  v_last_name text;
  v_department text;
  v_student_number text;
  v_role text := 'student';
  v_is_active boolean := true;
  v_inviter_name text;
  v_constraint_name text;
begin
  -- A matching email alone is not enough: a concurrent public sign-up must
  -- never consume a privileged invite intent. Supabase sets invited_at only
  -- for its server-side invitation creation path.
  if new.invited_at is not null then
    select * into v_intent
    from public.admin_invitation_intents i
    where i.email = lower(btrim(coalesce(new.email, '')))
      and i.expires_at > now()
    for update;
    v_is_invite := found;
  end if;
  if v_is_invite then
    v_first_name := btrim(v_intent.first_name);
    v_last_name := btrim(v_intent.last_name);
    v_department := nullif(btrim(coalesce(v_intent.department, '')), '');
    v_student_number := nullif(btrim(coalesce(v_intent.student_number, '')), '');
    v_role := v_intent.invited_role;
    v_is_active := false;
  else
    -- Public signup is always an active Student and must contain a valid ID.
    v_first_name := btrim(coalesce(new.raw_user_meta_data ->> 'first_name', ''));
    v_last_name := btrim(coalesce(new.raw_user_meta_data ->> 'last_name', ''));
    v_department := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'department', '')), '');
    v_student_number := btrim(coalesce(new.raw_user_meta_data ->> 'student_number', ''));
  end if;

  if char_length(v_first_name) not between 1 and 100
    or char_length(v_last_name) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'first and last name are required';
  end if;

  if v_role = 'student' and coalesce(v_student_number, '') !~ '^[0-9]{2}-[0-9]{4}$' then
    raise exception using errcode = '22023', message = 'student ID must use the format NN-NNNN';
  end if;
  if v_role <> 'student' then v_student_number := null; end if;

  begin
    insert into public.profiles (id, role, first_name, last_name, email, student_number, department, is_active)
    values (new.id, v_role, v_first_name, v_last_name, lower(new.email), v_student_number, v_department, v_is_active)
    on conflict (id) do nothing;
  exception when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = 'profiles_student_number_uq' then
      raise exception using errcode = '23505', constraint = 'profiles_student_number_uq', message = 'Student ID is already registered';
    end if;
    raise;
  end;

  if v_is_invite then
    select nullif(concat_ws(' ', nullif(btrim(p.first_name), ''), nullif(btrim(p.last_name), '')), '')
      into v_inviter_name from public.profiles p where p.id = v_intent.invited_by;
    insert into public.admin_user_invitations (profile_id, email, invited_role, invited_by)
    values (new.id, lower(new.email), v_role, v_intent.invited_by);

    insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata)
    values (
      v_intent.invited_by,
      'admin.user_invited',
      'profile',
      new.id,
      jsonb_build_object('target_name', concat_ws(' ', v_first_name, v_last_name), 'role', v_role, 'actor_name', v_inviter_name)
    );

    delete from public.admin_invitation_intents where email = v_intent.email;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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
    raise exception using errcode = '42501', message = 'you cannot change your own role or active status';
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
    -- Keep a previously assigned ID as historical identity data. It is no
    -- longer required for this role, but is not silently discarded.
    v_student_number := v_before.student_number;
  end if;

  if v_before.role = 'super_admin' and v_before.is_active
    and (p_role <> 'super_admin' or not p_is_active)
    and not exists (
      select 1 from public.profiles p
      where p.id <> p_target_id and p.role = 'super_admin' and p.is_active
    ) then
    raise exception using errcode = '23514', message = 'at least one active Super Admin is required';
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

create or replace function public.complete_user_invitation()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_password_set boolean;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'invitation session required'; end if;
  select exists (
    select 1 from auth.users u where u.id = v_user_id and coalesce(u.encrypted_password, '') <> ''
  ) into v_password_set;
  if not v_password_set then raise exception using errcode = '42501', message = 'create a password before completing account setup'; end if;

  perform set_config('navisync.invitation_completion', '1', true);
  update public.admin_user_invitations i
  set accepted_at = now()
  where i.profile_id = v_user_id and i.accepted_at is null and i.revoked_at is null;
  if not found then raise exception using errcode = 'P0002', message = 'invitation is no longer valid'; end if;

  update public.profiles p set is_active = true, updated_at = now()
  where p.id = v_user_id returning * into v_profile;
  if not found then raise exception using errcode = 'P0002', message = 'invited profile not found'; end if;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata)
  values (v_user_id, 'admin.user_invitation_accepted', 'profile', v_user_id,
    jsonb_build_object('target_name', concat_ws(' ', v_profile.first_name, v_profile.last_name), 'role', v_profile.role));
  return v_profile;
end;
$$;

revoke all on function public.complete_user_invitation() from public, anon;
grant execute on function public.complete_user_invitation() to authenticated;

comment on table public.admin_user_invitations is
  'Invitation lifecycle metadata only. It stores no invitation tokens, passwords, or auth credentials.';
comment on table public.admin_invitation_intents is
  'Short-lived server-only data used by the auth profile trigger while creating an administrator-managed invitation.';
