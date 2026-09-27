begin;

-- Building codes are unique among active Buildings within one Campus. Archived
-- rows keep their historical code for audit, but do not reserve it forever.
alter table public.buildings
  drop constraint if exists buildings_campus_code_uq;

-- Keep one canonical representation for old rows and future saves.
update public.buildings
set code = upper(btrim(code))
where code is distinct from upper(btrim(code));

alter table public.buildings
  drop constraint if exists buildings_code_canonical_check;

alter table public.buildings
  add constraint buildings_code_canonical_check
  check (code = upper(btrim(code)));

create unique index if not exists buildings_campus_active_code_uq
  on public.buildings (campus_id, upper(btrim(code)))
  where archived_at is null;

commit;
