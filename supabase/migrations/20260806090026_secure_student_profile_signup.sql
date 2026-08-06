-- PLV NaviSync A2 student account lifecycle.
--
-- Public signup metadata is untrusted. This trigger copies only the reviewed
-- student profile fields, validates their bounds, and always hardcodes the
-- authorization fields. A caller-supplied role, active flag, or email is
-- deliberately ignored.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text := btrim(coalesce(new.raw_user_meta_data ->> 'first_name', ''));
  v_last_name text := btrim(coalesce(new.raw_user_meta_data ->> 'last_name', ''));
  v_student_number text := nullif(upper(btrim(coalesce(new.raw_user_meta_data ->> 'student_number', ''))), '');
begin
  if char_length(v_first_name) not between 1 and 100 then
    raise exception 'first name must be between 1 and 100 characters';
  end if;

  if char_length(v_last_name) not between 1 and 100 then
    raise exception 'last name must be between 1 and 100 characters';
  end if;

  if v_student_number is null
     or char_length(v_student_number) not between 4 and 32
     or v_student_number !~ '^[A-Z0-9]+([ -][A-Z0-9]+)*$' then
    raise exception 'student number must be 4-32 letters, numbers, spaces, or hyphens';
  end if;

  insert into public.profiles (
    id,
    role,
    first_name,
    last_name,
    email,
    student_number,
    is_active
  )
  values (
    new.id,
    'student',
    v_first_name,
    v_last_name,
    coalesce(new.email, ''),
    v_student_number,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;

comment on function public.handle_new_user() is
  'Auth trigger only. Creates an active student profile from validated name/student-number metadata and ignores all caller-supplied authorization fields.';
