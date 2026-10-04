-- Catalog checks only. Functional role checks use verify-current-event-poster-permissions.mjs.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'event_posters'
    AND public = true AND file_size_limit = 5242880
    AND allowed_mime_types @> ARRAY['image/jpeg','image/png','image/webp']::text[]
    AND cardinality(allowed_mime_types) = 3) THEN
    RAISE EXCEPTION 'Proposal poster bucket or file constraints are missing';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname IN ('event_posters_insert_owner','event_posters_select_owner_admin','event_posters_delete_owner_admin')) <> 3 THEN
    RAISE EXCEPTION 'Proposal poster owner policies are missing';
  END IF;
END $$;
ROLLBACK;
