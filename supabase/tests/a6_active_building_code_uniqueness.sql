-- Regression: only active Building codes reserve a code within their Campus.
-- Archived codes can be reused; active case-insensitive duplicates cannot.
begin;

do $$
begin
  if not exists (select 1 from public.profiles where role = 'admin' and is_active) then
    raise exception 'A6 Building-code test requires an active admin fixture';
  end if;
end $$;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id from public.profiles where role = 'admin' and is_active limit 1), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

insert into public.campuses (id, name, code, status, canvas_width, canvas_height)
values ('a6100000-0000-4000-8000-000000000001', 'A6 Code Test', 'A6CODE', 'draft', 900, 600);

insert into public.buildings (id, campus_id, name, code, category, width, height)
values ('a6200000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000001', 'First', 'CEIT', 'academic', 100, 80);

do $$
declare
  v_constraint text;
begin
  begin
    insert into public.buildings (id, campus_id, name, code, category, width, height)
    values ('a6200000-0000-4000-8000-000000000002', 'a6100000-0000-4000-8000-000000000001', 'Duplicate', 'CEIT', 'academic', 100, 80);
    raise exception 'duplicate active Building code unexpectedly succeeded';
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'buildings_campus_active_code_uq' then raise; end if;
  end;
end $$;

update public.buildings
set archived_at = now()
where id = 'a6200000-0000-4000-8000-000000000001';

insert into public.buildings (id, campus_id, name, code, category, width, height)
values ('a6200000-0000-4000-8000-000000000003', 'a6100000-0000-4000-8000-000000000001', 'Reuse Archived Code', 'CEIT', 'academic', 100, 80);

do $$
begin
  if not exists (
    select 1 from public.buildings
    where id = 'a6200000-0000-4000-8000-000000000003'
      and code = 'CEIT'
      and archived_at is null
  ) then raise exception 'archived Building code was not reusable'; end if;
end $$;

rollback;
