BEGIN;

-- Dedicated proposal poster storage; existing event-images remains admin-only.
-- Matches the existing event-image JPEG/PNG/WebP and 5 MB constraints.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event_posters', 'event_posters', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY event_posters_insert_owner ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'event_posters'
  AND (SELECT public.is_student_org())
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Public URLs serve poster contents; authenticated listing is scoped to owners/admins.
CREATE POLICY event_posters_select_owner_admin ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'event_posters'
  AND ((SELECT public.is_admin()) OR (
    (SELECT public.is_student_org())
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  ))
);

CREATE POLICY event_posters_delete_owner_admin ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'event_posters'
  AND ((SELECT public.is_admin()) OR (
    (SELECT public.is_student_org())
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  ))
);

-- No UPDATE policy: each upload uses a fresh name and cannot overwrite an existing poster.
NOTIFY pgrst, 'reload schema';
COMMIT;
