-- Return optimistic-concurrency failures as HTTP 409 without triggering
-- transaction retry behavior in the PostgREST/pooler path.

create or replace function public.save_campus_draft(
  p_campus_id uuid,
  p_structure jsonb,
  p_snapshot jsonb,
  p_change_summary text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_updated_at timestamptz;
  v_draft public.campus_versions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_structure) <> 'object' or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'campus structure and snapshot must be JSON objects' using errcode = '22023';
  end if;
  if p_snapshot->>'id' is distinct from p_campus_id::text then
    raise exception 'campus snapshot id does not match the target campus' using errcode = '23514';
  end if;

  select updated_at
    into v_current_updated_at
    from public.campuses
   where id = p_campus_id and archived_at is null
   for update;
  if not found then
    raise exception 'active campus not found' using errcode = 'P0002';
  end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'campus draft changed in another session' using errcode = 'PT409';
  end if;

  perform public.save_campus_structure(p_campus_id, p_structure);

  select *
    into v_draft
    from public.campus_versions
   where campus_id = p_campus_id and state = 'draft'
   order by version_number desc, created_at desc, id desc
   limit 1
   for update;

  if v_draft.id is null then
    insert into public.campus_versions (
      campus_id, version_number, state, snapshot, change_summary,
      validation_score, created_by, updated_at
    )
    values (
      p_campus_id,
      coalesce((select max(version_number) + 1 from public.campus_versions where campus_id = p_campus_id), 1),
      'draft', p_snapshot, nullif(btrim(p_change_summary), ''), null, auth.uid(), v_now
    )
    returning * into v_draft;
  else
    update public.campus_versions
       set snapshot = p_snapshot,
           change_summary = nullif(btrim(p_change_summary), ''),
           validation_score = null,
           updated_at = v_now
     where id = v_draft.id
     returning * into v_draft;
  end if;

  update public.campuses
     set updated_by = auth.uid(), updated_at = v_now
   where id = p_campus_id;

  insert into public.activity_logs (actor_id, campus_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), p_campus_id, 'campus_version.draft_saved', 'campus_versions', v_draft.id,
    jsonb_build_object('version_number', v_draft.version_number, 'change_summary', v_draft.change_summary)
  );

  return jsonb_build_object(
    'version_id', v_draft.id,
    'version_number', v_draft.version_number,
    'campus_updated_at', v_now,
    'version_updated_at', v_draft.updated_at
  );
end;
$$;
-- B5 hands A6 a deterministic issue list. Store the run and its issues in one
-- transaction; counts and publishability are derived server-side.
create or replace function public.record_campus_validation(
  p_version_id uuid,
  p_status text,
  p_score numeric,
  p_issues jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campus_id uuid;
  v_run_id uuid;
  v_errors integer;
  v_warnings integer;
  v_passed integer;
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  if p_status not in ('passed', 'warning', 'failed')
     or p_score < 0 or p_score > 100
     or jsonb_typeof(p_issues) <> 'array' then
    raise exception 'invalid validation result' using errcode = '22023';
  end if;

  select campus_id
    into v_campus_id
    from public.campus_versions
   where id = p_version_id and state = 'draft'
   for update;
  if not found then
    raise exception 'draft version not found' using errcode = 'P0002';
  end if;

  select
    count(*) filter (where value->>'severity' = 'error'),
    count(*) filter (where value->>'severity' = 'warning'),
    count(*) filter (where value->>'severity' = 'info')
    into v_errors, v_warnings, v_passed
    from jsonb_array_elements(p_issues);

  if (p_status = 'failed') is distinct from (v_errors > 0) then
    raise exception 'validation status does not match issue severities' using errcode = '22023';
  end if;
  if p_status = 'passed' and v_warnings > 0 then
    raise exception 'passed validation cannot contain warnings' using errcode = '22023';
  end if;

  insert into public.validation_runs (
    campus_id, campus_version_id, status, score, errors_count,
    warnings_count, passed_count, run_by
  )
  values (
    v_campus_id, p_version_id, p_status, p_score, v_errors,
    v_warnings, v_passed, auth.uid()
  )
  returning id into v_run_id;

  insert into public.validation_issues (
    validation_run_id, severity, rule_code, message, entity_type,
    entity_id, suggested_resolution
  )
  select
    v_run_id, severity, rule_code, message, nullif(entity_type, ''),
    nullif(entity_id, '')::uuid, nullif(suggested_resolution, '')
  from jsonb_to_recordset(p_issues) as issue(
    severity text, rule_code text, message text, entity_type text,
    entity_id text, suggested_resolution text
  );

  update public.campus_versions
     set validation_score = p_score
   where id = p_version_id;

  return v_run_id;
end;
$$;

-- Atomic publication preserves the previous active version unless every gate
-- succeeds. The validation must be newer than the last draft snapshot save.
create or replace function public.publish_validated_campus_draft(
  p_version_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.campus_versions%rowtype;
  v_campus_updated_at timestamptz;
  v_validation public.validation_runs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;

  select * into v_version
    from public.campus_versions
   where id = p_version_id and state = 'draft'
   for update;
  if not found then
    raise exception 'draft version not found' using errcode = 'P0002';
  end if;

  select updated_at into v_campus_updated_at
    from public.campuses
   where id = v_version.campus_id and archived_at is null
   for update;
  if not found then
    raise exception 'active campus not found' using errcode = 'P0002';
  end if;
  if v_campus_updated_at is distinct from p_expected_updated_at then
    raise exception 'campus draft changed in another session' using errcode = 'PT409';
  end if;

  select * into v_validation
    from public.validation_runs
   where campus_version_id = p_version_id
   order by created_at desc, id desc
   limit 1;
  if v_validation.id is null
     or v_validation.created_at < v_version.updated_at
     or v_validation.status = 'failed'
     or v_validation.errors_count > 0 then
    raise exception 'the current draft has not passed validation' using errcode = '23514';
  end if;

  update public.campus_versions
     set state = 'superseded'
   where campus_id = v_version.campus_id and state = 'published';

  update public.campus_versions
     set state = 'published', published_by = auth.uid(), published_at = v_now
   where id = p_version_id;

  update public.campuses
     set latest_published_version_id = p_version_id,
         status = 'published', archived_at = null,
         updated_by = auth.uid(), updated_at = v_now
   where id = v_version.campus_id;

  insert into public.activity_logs (actor_id, campus_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), v_version.campus_id, 'campus_version.published', 'campus_versions', p_version_id,
    jsonb_build_object(
      'version_number', v_version.version_number,
      'change_summary', v_version.change_summary,
      'validation_run_id', v_validation.id,
      'validation_score', v_validation.score
    )
  );

  return jsonb_build_object(
    'version_id', p_version_id,
    'version_number', v_version.version_number,
    'published_at', v_now,
    'campus_updated_at', v_now
  );
end;
$$;

create or replace function public.unpublish_campus_map(
  p_campus_id uuid,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_updated_at timestamptz;
  v_published_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  select updated_at, latest_published_version_id
    into v_current_updated_at, v_published_id
    from public.campuses where id = p_campus_id and archived_at is null for update;
  if not found then raise exception 'active campus not found' using errcode = 'P0002'; end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'campus changed in another session' using errcode = 'PT409';
  end if;

  update public.campus_versions set state = 'superseded'
   where id = v_published_id and state = 'published';
  update public.campuses
     set latest_published_version_id = null, status = 'draft',
         updated_by = auth.uid(), updated_at = v_now
   where id = p_campus_id;
  insert into public.activity_logs (actor_id, campus_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_campus_id, 'campus.unpublished', 'campuses', p_campus_id,
    jsonb_build_object('previous_version_id', v_published_id));
  return v_now;
end;
$$;

create or replace function public.archive_campus_map(
  p_campus_id uuid,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_updated_at timestamptz;
  v_published_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  select updated_at, latest_published_version_id
    into v_current_updated_at, v_published_id
    from public.campuses where id = p_campus_id for update;
  if not found then raise exception 'campus not found' using errcode = 'P0002'; end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'campus changed in another session' using errcode = 'PT409';
  end if;

  update public.campus_versions set state = 'superseded'
   where id = v_published_id and state = 'published';
  update public.campuses
     set latest_published_version_id = null, status = 'archived', archived_at = v_now,
         is_default = false, updated_by = auth.uid(), updated_at = v_now
   where id = p_campus_id;
  insert into public.activity_logs (actor_id, campus_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_campus_id, 'campus.archived', 'campuses', p_campus_id,
    jsonb_build_object('previous_version_id', v_published_id));
  return v_now;
end;
$$;

create or replace function public.discard_campus_draft(
  p_version_id uuid,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campus_id uuid;
  v_version_number integer;
  v_current_updated_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  select campus_id, version_number into v_campus_id, v_version_number
    from public.campus_versions where id = p_version_id and state = 'draft' for update;
  if not found then raise exception 'draft version not found' using errcode = 'P0002'; end if;
  select updated_at into v_current_updated_at
    from public.campuses where id = v_campus_id for update;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'campus changed in another session' using errcode = 'PT409';
  end if;

  delete from public.validation_runs where campus_version_id = p_version_id;
  delete from public.campus_versions where id = p_version_id;
  update public.campuses set updated_by = auth.uid(), updated_at = v_now where id = v_campus_id;
  insert into public.activity_logs (actor_id, campus_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_campus_id, 'campus_version.draft_discarded', 'campus_versions', p_version_id,
    jsonb_build_object('version_number', v_version_number));
  return v_now;
end;
$$;
