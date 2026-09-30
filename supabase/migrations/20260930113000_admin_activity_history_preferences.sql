-- Per-administrator Activity Logs dismissal. The append-only audit table is
-- intentionally untouched; this timestamp only hides older rows in the UI.
create table if not exists public.admin_activity_preferences (
  admin_id uuid primary key references public.profiles(id) on delete cascade,
  activity_cleared_before timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_activity_preferences enable row level security;

drop policy if exists "admin_activity_preferences_select_own"
  on public.admin_activity_preferences;
create policy "admin_activity_preferences_select_own"
  on public.admin_activity_preferences
  for select to authenticated
  using (admin_id = auth.uid() and public.is_admin());

revoke all on public.admin_activity_preferences from public, anon, authenticated;
grant select on public.admin_activity_preferences to authenticated;

create or replace function public.clear_admin_activity_history()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_cleared_before timestamptz := clock_timestamp();
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'administrator access required';
  end if;

  insert into public.admin_activity_preferences (admin_id, activity_cleared_before, updated_at)
  values (v_admin_id, v_cleared_before, v_cleared_before)
  on conflict (admin_id) do update
    set activity_cleared_before = excluded.activity_cleared_before,
        updated_at = excluded.updated_at;

  return v_cleared_before;
end;
$$;

revoke all on function public.clear_admin_activity_history() from public, anon;
grant execute on function public.clear_admin_activity_history() to authenticated;

comment on table public.admin_activity_preferences is
  'Per-admin Activity Logs view preferences; audit activity remains append-only in activity_logs.';

notify pgrst, 'reload schema';
