begin;

-- Report workflow integrity.
--
-- Before this migration an administrator could move a report between any two
-- statuses (e.g. straight from pending to resolved) and close it with a
-- one-word note or, when dismissing, none at all. The reporter had no way to
-- say the problem was still there.
--
-- Now:
--   * Status changes go through public.transition_report() (administrators)
--     or public.reopen_own_report() (the reporter). A direct UPDATE of
--     reports.status is refused.
--   * Only the transitions below are allowed; a report must be reviewed
--     before it can be resolved.
--   * Resolving or dismissing needs a reason of at least 15 characters, and
--     reopening one of at least 10. Every reason lands in report_history,
--     which the reporter can read.
--   * A reporter may reopen their own resolved/dismissed report, up to twice,
--     within 30 days of it closing.
--
-- The client mirrors these rules in src/lib/reportWorkflow.ts.
--
--   pending      -> under_review | rejected
--   under_review -> in_progress | resolved | rejected
--   in_progress  -> resolved | under_review
--   resolved     -> under_review   (reopen)
--   rejected     -> under_review   (reopen)

alter table public.reports
  add column if not exists reopen_count integer not null default 0,
  add column if not exists last_reopened_at timestamptz;

alter table public.reports
  add constraint reports_reopen_count_nonnegative check (reopen_count >= 0);

-- ── Workflow guard ─────────────────────────────────────────────────────────
-- The transition functions announce themselves and pass the reason through
-- transaction-local settings. PostgREST does not expose set_config, so a
-- client cannot forge them.
create function private.enforce_report_workflow()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  transition_mode text := coalesce(current_setting('plv.report_transition', true), '');
  reason text := nullif(btrim(coalesce(current_setting('plv.report_transition_note', true), '')), '');
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if transition_mode not in ('admin', 'reporter') then
    raise exception 'Report status changes must go through transition_report()'
      using errcode = 'P0001';
  end if;

  if not (
    (old.status = 'pending' and new.status in ('under_review', 'rejected'))
    or (old.status = 'under_review' and new.status in ('in_progress', 'resolved', 'rejected'))
    or (old.status = 'in_progress' and new.status in ('resolved', 'under_review'))
    or (old.status in ('resolved', 'rejected') and new.status = 'under_review')
  ) then
    raise exception 'A report cannot move from % to %', old.status, new.status
      using errcode = 'P0001';
  end if;

  if new.status in ('resolved', 'rejected') and char_length(coalesce(reason, '')) < 15 then
    raise exception 'Explain this to the reporter in at least 15 characters'
      using errcode = 'P0001';
  end if;

  if old.status in ('resolved', 'rejected') and char_length(coalesce(reason, '')) < 10 then
    raise exception 'A reason of at least 10 characters is required to reopen a report'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke all on function private.enforce_report_workflow() from public, anon, authenticated;
create trigger reports_enforce_workflow before update on public.reports
  for each row execute function private.enforce_report_workflow();

-- ── History: record reasons and allow the reporter's reopen ────────────────
create or replace function private.record_report_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  history_action text;
  transition_mode text := coalesce(current_setting('plv.report_transition', true), '');
  reason text := nullif(btrim(coalesce(current_setting('plv.report_transition_note', true), '')), '');
begin
  if tg_op = 'INSERT' then
    if actor is null then raise exception 'Authentication required to submit reports'; end if;
    if new.reporter_id <> actor and not public.is_admin() then
      raise exception 'Cannot submit a report for another user';
    end if;
    history_action := 'report.pending';
  else
    if new.status is distinct from old.status then
      history_action := case
        when old.status in ('resolved', 'rejected') and new.status = 'under_review' then 'report.reopened'
        else 'report.' || new.status
      end;
    elsif new.archived_at is distinct from old.archived_at then
      history_action := case when new.archived_at is null then 'report.restored' else 'report.archive' end;
    elsif new.resolution_notes is distinct from old.resolution_notes then
      history_action := 'report.resolution_updated';
    else return new;
    end if;

    if actor is null then raise exception 'Administrator access required'; end if;
    if not public.is_admin() then
      -- The only non-admin update: a reporter reopening their own closed
      -- report through reopen_own_report().
      if not (transition_mode = 'reporter' and actor = new.reporter_id and history_action = 'report.reopened') then
        raise exception 'Administrator access required';
      end if;
    end if;
  end if;

  insert into public.report_history(report_id, action, old_status, new_status, note, performed_by)
  values (
    new.id,
    history_action,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    case
      when tg_op = 'UPDATE' and reason is not null then reason
      when new.status in ('resolved', 'rejected') then new.resolution_notes
      else null
    end,
    actor
  );
  return new;
end;
$$;
revoke all on function private.record_report_lifecycle() from public, anon, authenticated;

-- ── Administrator transitions ──────────────────────────────────────────────
create function public.transition_report(p_report_id uuid, p_status text, p_note text default null)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare
  current_report public.reports;
  updated_report public.reports;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into current_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if current_report.archived_at is not null then
    raise exception 'Restore the report before changing its status' using errcode = 'P0001';
  end if;

  perform set_config('plv.report_transition', 'admin', true);
  perform set_config('plv.report_transition_note', coalesce(clean_note, ''), true);

  update public.reports set
    status = p_status,
    -- The closing reason is what the reporter sees on the report itself.
    -- Reopening clears it so the next closure needs a fresh one.
    resolution_notes = case
      when p_status in ('resolved', 'rejected') then clean_note
      when current_report.status in ('resolved', 'rejected') then null
      else resolution_notes
    end,
    resolved_at = case when p_status = 'resolved' then now() else null end,
    updated_at = now()
  where id = p_report_id
  returning * into updated_report;

  perform set_config('plv.report_transition', '', true);
  perform set_config('plv.report_transition_note', '', true);
  return updated_report;
end;
$$;
revoke all on function public.transition_report(uuid, text, text) from public, anon;
grant execute on function public.transition_report(uuid, text, text) to authenticated;

-- ── Reporter reopen ────────────────────────────────────────────────────────
create function public.reopen_own_report(p_report_id uuid, p_reason text)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_report public.reports;
  updated_report public.reports;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into current_report from public.reports where id = p_report_id for update;
  if not found or current_report.reporter_id <> actor then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if current_report.status not in ('resolved', 'rejected') then
    raise exception 'Only resolved or dismissed reports can be reopened' using errcode = 'P0001';
  end if;
  if current_report.archived_at is not null then
    raise exception 'This report has been archived and can no longer be reopened' using errcode = 'P0001';
  end if;
  if coalesce(current_report.resolved_at, current_report.updated_at) < now() - interval '30 days' then
    raise exception 'Reports can be reopened within 30 days of closing. Please submit a new report.' using errcode = 'P0001';
  end if;
  if current_report.reopen_count >= 2 then
    raise exception 'This report has already been reopened twice. Please submit a new report.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(clean_reason, '')) < 10 then
    raise exception 'Tell us what is still wrong in at least 10 characters' using errcode = 'P0001';
  end if;

  perform set_config('plv.report_transition', 'reporter', true);
  perform set_config('plv.report_transition_note', 'Reopened by reporter: ' || clean_reason, true);

  update public.reports set
    status = 'under_review',
    reopen_count = reopen_count + 1,
    last_reopened_at = now(),
    resolved_at = null,
    resolution_notes = null,
    updated_at = now()
  where id = p_report_id
  returning * into updated_report;

  perform set_config('plv.report_transition', '', true);
  perform set_config('plv.report_transition_note', '', true);
  return updated_report;
end;
$$;
revoke all on function public.reopen_own_report(uuid, text) from public, anon;
grant execute on function public.reopen_own_report(uuid, text) to authenticated;

commit;
