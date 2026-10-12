-- Preserve the A1/A7 administrator-only lifecycle contract for existing
-- integration consumers. A6 browser code uses publish_validated_campus_draft;
-- this legacy RPC remains protected by its internal active-admin check.
grant execute on function public.publish_campus_version(uuid) to authenticated;

comment on function public.publish_campus_version(uuid) is
  'Backward-compatible authenticated RPC with an internal active-admin check. New A6 clients use publish_validated_campus_draft for optimistic concurrency.';
