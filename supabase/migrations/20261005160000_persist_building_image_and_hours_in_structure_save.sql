-- The generic campus writer already receives these Building fields from the
-- client, but its active Building recordset/upsert omitted both columns.
-- Patch only that block of the current private writer. This preserves its
-- two-phase Floor save, Event Overlay isolation, archive rules and grants.
do $migration$
declare
  v_definition text;
  v_building_block text;
  v_updated_block text;
  v_start integer;
  v_end integer;
  v_before text;
begin
  select pg_get_functiondef('public.save_campus_structure_unchecked(uuid,jsonb)'::regprocedure)
    into v_definition;
  v_start := strpos(v_definition, 'insert into public.buildings (');
  v_end := strpos(v_definition, 'from jsonb_array_elements(coalesce(p_payload->''buildings'', ''[]''::jsonb));');
  if v_start = 0 or v_end <= v_start then
    raise exception 'private campus writer Building block changed; refusing unsafe migration';
  end if;
  v_building_block := substr(v_definition, v_start, v_end - v_start + length('from jsonb_array_elements(coalesce(p_payload->''buildings'', ''[]''::jsonb));'));
  if position('image_path' in v_building_block) > 0 or position('operating_hours' in v_building_block) > 0 then
    if position('image_path' in v_building_block) > 0 and position('operating_hours' in v_building_block) > 0 then
      return;
    end if;
    raise exception 'private campus writer has a partial Building column update';
  end if;

  v_updated_block := v_building_block;
  v_before := v_updated_block;
  v_updated_block := regexp_replace(v_updated_block,
    'rotation,[[:space:]]+is_searchable,[[:space:]]+is_visible,[[:space:]]+is_accessible,[[:space:]]+metadata,[[:space:]]+updated_by',
    'rotation, is_searchable, is_visible, is_accessible, image_path, operating_hours, metadata, updated_by');
  if v_updated_block = v_before then raise exception 'Building insert columns changed'; end if;

  v_before := v_updated_block;
  v_updated_block := regexp_replace(v_updated_block,
    'rotation,[[:space:]]+is_searchable,[[:space:]]+is_visible,[[:space:]]+is_accessible,[[:space:]]+coalesce\(metadata',
    'rotation, is_searchable, is_visible, is_accessible, image_path, operating_hours, coalesce(metadata');
  if v_updated_block = v_before then raise exception 'Building insert values changed'; end if;

  v_before := v_updated_block;
  v_updated_block := regexp_replace(v_updated_block,
    'is_searchable boolean,[[:space:]]+is_visible boolean,[[:space:]]+is_accessible boolean,[[:space:]]+metadata jsonb',
    'is_searchable boolean, is_visible boolean, is_accessible boolean, image_path text, operating_hours text, metadata jsonb');
  if v_updated_block = v_before then raise exception 'Building payload recordset changed'; end if;

  v_before := v_updated_block;
  v_updated_block := regexp_replace(v_updated_block,
    'is_visible=excluded\.is_visible,[[:space:]]+is_accessible=excluded\.is_accessible,[[:space:]]+metadata=excluded\.metadata',
    'is_visible=excluded.is_visible, is_accessible=excluded.is_accessible, image_path=excluded.image_path, operating_hours=excluded.operating_hours, metadata=excluded.metadata');
  if v_updated_block = v_before then raise exception 'Building conflict update changed'; end if;

  execute replace(v_definition, v_building_block, v_updated_block);
end;
$migration$;
