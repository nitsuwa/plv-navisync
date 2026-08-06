-- Restore DELETE as a table privilege while RLS continues to limit it to
-- administrators. The A4 product UI exposes archive/restore, not hard delete;
-- this supports controlled test cleanup and future admin maintenance.
grant delete on table public.campuses to authenticated;
grant delete on table public.campus_versions to authenticated;
