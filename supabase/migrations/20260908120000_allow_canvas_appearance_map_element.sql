-- Canvas Appearance is persisted through the existing map_elements channel.
-- Preserve the deployed check expression instead of copying a stale enum-like
-- list: later migrations may have added legal element types (for example,
-- event_overlay).  This migration only extends the current contract with the
-- non-rendered campus metadata record.
do $$
declare
  existing_check text;
begin
  select pg_get_expr(conbin, conrelid)
    into existing_check
  from pg_constraint
  where conrelid = 'public.map_elements'::regclass
    and conname = 'map_elements_element_type_check'
    and contype = 'c';

  if existing_check is null then
    raise exception 'map_elements_element_type_check was not found; refusing to replace an unknown validation contract';
  end if;

  -- Re-running the migration is a safe no-op when a previous deployment (or
  -- a manual repair) already permits Canvas Appearance.
  if position('canvas_appearance' in existing_check) > 0 then
    return;
  end if;

  alter table public.map_elements
    drop constraint map_elements_element_type_check;

  execute format(
    'alter table public.map_elements add constraint map_elements_element_type_check check ((%s) or element_type = ''canvas_appearance'')',
    existing_check
  );
end
$$;
