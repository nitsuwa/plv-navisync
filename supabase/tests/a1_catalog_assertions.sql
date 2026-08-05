-- Read-only catalog assertions for A1.
-- Run against the linked development project or through the Supabase SQL tool.
-- The block raises an exception on the first failed invariant.

do $$
declare
  missing_rls_tables text[];
  unexpected_public_functions text[];
begin
  select array_agg(c.relname order by c.relname)
    into missing_rls_tables
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity;

  if coalesce(cardinality(missing_rls_tables), 0) > 0 then
    raise exception 'A1 catalog check failed: RLS disabled on %', missing_rls_tables;
  end if;

  if (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  ) <> 20 then
    raise exception 'A1 catalog check failed: expected exactly 20 public application tables';
  end if;

  if (select count(*) from pg_policies where schemaname = 'storage') <> 20 then
    raise exception 'A1 catalog check failed: expected exactly 20 Storage policies';
  end if;

  if exists (
    values
      ('avatars'::text, 2097152::bigint),
      ('building-images', 5242880),
      ('floor-plans', 15728640),
      ('report-images', 8388608),
      ('event-images', 5242880)
    except
    select id, file_size_limit
    from storage.buckets
    where id in ('avatars', 'building-images', 'floor-plans', 'report-images', 'event-images')
  ) then
    raise exception 'A1 catalog check failed: Storage size limits do not match the approved contract';
  end if;

  if exists (
    select 1
    from storage.buckets
    where id in ('avatars', 'building-images', 'floor-plans', 'report-images', 'event-images')
      and allowed_mime_types is distinct from array['image/jpeg', 'image/png', 'image/webp']::text[]
  ) then
    raise exception 'A1 catalog check failed: Storage MIME allowlists do not match the approved contract';
  end if;

  select array_agg(p.proname order by p.proname)
    into unexpected_public_functions
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in ('campus_is_published', 'is_published_floor_plan');

  if coalesce(cardinality(unexpected_public_functions), 0) > 0 then
    raise exception 'A1 catalog check failed: unexpected anon SECURITY DEFINER functions %', unexpected_public_functions;
  end if;

  if has_function_privilege('anon', 'public.publish_campus_version(uuid)', 'EXECUTE') then
    raise exception 'A1 catalog check failed: anon can execute publish_campus_version';
  end if;

  if not has_function_privilege('authenticated', 'public.publish_campus_version(uuid)', 'EXECUTE') then
    raise exception 'A1 catalog check failed: authenticated role cannot invoke the guarded publish RPC';
  end if;

  if not has_function_privilege('anon', 'public.campus_is_published(uuid)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.is_published_floor_plan(text)', 'EXECUTE') then
    raise exception 'A1 catalog check failed: a required public policy helper is unavailable';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
      and with_check is not null
  ) then
    raise exception 'A1 catalog check failed: profiles_update_own lacks WITH CHECK';
  end if;
end;
$$;

select 'A1 catalog assertions passed' as result;
