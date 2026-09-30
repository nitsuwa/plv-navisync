-- Enforce the public Student registration ID format at the database boundary.
-- Existing profile values are left intact; public Auth signups must use NN-NNNN.
-- The existing profiles_student_number_uq index remains the uniqueness source.

do $$
begin
  if exists (
    select 1
    from public.profiles
    where student_number is not null
    group by student_number
    having count(*) > 1
  ) then
    raise exception 'Duplicate profiles.student_number values must be reviewed before enabling Student ID uniqueness.';
  end if;

  execute 'create unique index if not exists profiles_student_number_uq on public.profiles (student_number) where student_number is not null';
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text := btrim(coalesce(new.raw_user_meta_data ->> 'first_name', ''));
  v_last_name text := btrim(coalesce(new.raw_user_meta_data ->> 'last_name', ''));
  v_student_number text := btrim(coalesce(new.raw_user_meta_data ->> 'student_number', ''));
  v_constraint_name text;
begin
  if char_length(v_first_name) not between 1 and 100 then
    raise exception 'first name must be between 1 and 100 characters';
  end if;

  if char_length(v_last_name) not between 1 and 100 then
    raise exception 'last name must be between 1 and 100 characters';
  end if;

  if v_student_number !~ '^[0-9]{2}-[0-9]{4}$' then
    raise exception 'student ID must use the format NN-NNNN';
  end if;

  begin
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
  exception when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = 'profiles_student_number_uq' then
      raise exception using
        errcode = '23505',
        constraint = 'profiles_student_number_uq',
        message = 'Student ID is already registered';
    end if;
    raise;
  end;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;

comment on function public.handle_new_user() is
  'Auth trigger: validates NN-NNNN Student IDs, enforces the existing unique index, and always creates public registrations as active students.';
