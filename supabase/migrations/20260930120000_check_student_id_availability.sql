-- Return only whether a syntactically valid Student ID is available.
-- This does not expose profiles and does not change their RLS policies.
create or replace function public.check_student_id_availability(p_student_number text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_student_number ~ '^[0-9]{2}-[0-9]{4}$', false)
    and not exists (
      select 1
      from public.profiles p
      where p.student_number = p_student_number
    );
$$;

revoke all on function public.check_student_id_availability(text) from public, anon, authenticated;
grant execute on function public.check_student_id_availability(text) to anon, authenticated;

comment on function public.check_student_id_availability(text) is
  'Returns only whether one correctly formatted Student ID is available for public registration.';
