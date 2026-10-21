-- Persist the campus-wide SOS destination policy independently from authored
-- geometry. Legacy campuses default to Fixed Primary, preserving their prior
-- Student routing behavior.
alter table public.campuses
  add column if not exists emergency_destination_policy text not null default 'fixed_primary';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campuses_emergency_destination_policy_check'
      and conrelid = 'public.campuses'::regclass
  ) then
    alter table public.campuses
      add constraint campuses_emergency_destination_policy_check
      check (emergency_destination_policy in ('fixed_primary', 'nearest_eligible'));
  end if;
end;
$$;

comment on column public.campuses.emergency_destination_policy is
  'Campus-wide SOS destination policy: Fixed Primary by default, or explicitly enabled Nearest Eligible based on complete emergency-safe route cost.';
