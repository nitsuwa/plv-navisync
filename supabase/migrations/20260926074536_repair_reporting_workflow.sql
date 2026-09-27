begin;

-- Notes belong in an independently protected table, not a student-readable row.
create table public.report_admin_notes (
  report_id uuid primary key references public.reports(id) on delete cascade,
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.report_admin_notes enable row level security;
revoke all on public.report_admin_notes from public, anon;
grant select, insert, update on public.report_admin_notes to authenticated;
create policy report_admin_notes_admin_only on public.report_admin_notes
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
insert into public.report_admin_notes(report_id, notes)
  select id, internal_notes from public.reports where internal_notes is not null;
update public.reports set internal_notes = null where internal_notes is not null;
-- Preserve the legacy column for older insert policies, but prevent new leaks.
alter table public.reports add constraint reports_private_notes_separate check (internal_notes is null);

-- Record history in the same transaction as the report write. Students cannot
-- insert history themselves. This restricted trigger is the sole elevated writer.
create schema if not exists private;
create function private.record_report_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  history_action text;
begin
  if tg_op = 'INSERT' then
    if actor is null then raise exception 'Authentication required to submit reports'; end if;
    if new.reporter_id <> actor and not public.is_admin() then
      raise exception 'Cannot submit a report for another user';
    end if;
    history_action := 'report.pending';
  else
    if new.status is distinct from old.status then
      history_action := 'report.' || new.status;
    elsif new.archived_at is distinct from old.archived_at then
      history_action := case when new.archived_at is null then 'report.restored' else 'report.archive' end;
    elsif new.resolution_notes is distinct from old.resolution_notes then
      history_action := 'report.resolution_updated';
    else return new;
    end if;
    if actor is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  end if;
  insert into public.report_history(report_id, action, old_status, new_status, note, performed_by)
  values (new.id, history_action, case when tg_op = 'UPDATE' then old.status else null end,
    new.status, case when new.status in ('resolved', 'rejected') then new.resolution_notes else null end, actor);
  return new;
end;
$$;
revoke all on function private.record_report_lifecycle() from public, anon, authenticated;
create trigger reports_record_lifecycle after insert or update on public.reports
  for each row execute function private.record_report_lifecycle();

-- Keep room/floor/building context internally consistent, not merely same-campus.
create function private.validate_report_location()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.building_id is not null and new.floor_id is not null and not exists (
    select 1 from public.floors f where f.id = new.floor_id and f.building_id = new.building_id
  ) then raise exception 'The selected floor does not belong to this building'; end if;
  if new.map_element_id is not null and new.floor_id is not null and new.building_id is not null and not exists (
    select 1 from public.map_elements e where e.id = new.map_element_id
      and e.floor_id = new.floor_id and e.building_id = new.building_id
  ) then raise exception 'The selected room does not belong to this floor'; end if;
  if new.status = 'resolved' and (tg_op = 'INSERT' or new.status is distinct from old.status)
    and nullif(btrim(new.resolution_notes), '') is null then
    raise exception 'Resolution notes are required';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_report_location() from public, anon, authenticated;
create trigger reports_validate_location before insert or update on public.reports
  for each row execute function private.validate_report_location();

-- Restore student-visible lifecycle history from the old admin audit channel.
insert into public.report_history(report_id, action, new_status, note, performed_by, created_at)
select r.id, a.action, substring(a.action from 8), a.metadata->>'resolutionNotes', a.actor_id, a.created_at
from public.activity_logs a join public.reports r on r.id = a.entity_id
where a.entity_type = 'report' and a.actor_id is not null
  and a.action in ('report.pending','report.under_review','report.in_progress','report.resolved','report.rejected')
  and not exists (select 1 from public.report_history h where h.report_id = r.id and h.action = a.action and h.created_at = a.created_at);

commit;
