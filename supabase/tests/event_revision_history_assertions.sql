-- Read-only catalog checks. Run after migrations in a staging database.
begin;
do $$
declare v_name text; v_rpc regprocedure;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='event_layout_revisions' and c.relrowsecurity) then
    raise exception 'Revision table missing or RLS disabled'; end if;
  if has_table_privilege('authenticated', 'public.event_layout_revisions', 'INSERT,UPDATE,DELETE')
    or has_table_privilege('anon', 'public.event_layout_revisions', 'SELECT') then
    raise exception 'Revision audit write/read grants are unsafe'; end if;
  foreach v_name in array array['save_pending_event_layout','withdraw_event_submission','list_event_revisions'] loop
    select p.oid::regprocedure into v_rpc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_name;
    if v_rpc is null or not (select prosecdef from pg_proc where oid=v_rpc) then raise exception '% missing SECURITY DEFINER', v_name; end if;
    if not has_function_privilege('authenticated', v_rpc, 'EXECUTE') or has_function_privilege('anon', v_rpc, 'EXECUTE') then
      raise exception 'Unsafe command grants: %', v_name; end if;
  end loop;
  if not exists(select 1 from pg_trigger where tgrelid='public.map_elements'::regclass and tgname='capture_event_revision' and not tgisinternal) then
    raise exception 'Revision capture trigger is missing'; end if;
end $$;
rollback;
