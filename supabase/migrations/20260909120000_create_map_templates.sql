-- Custom Floor templates are physical authoring definitions only. The legacy
-- room scope/category columns remain for backwards-compatible rows, while all
-- active editor writes use scope = 'floor'. Built-ins remain in source code;
-- this table stores campus/shared admin-created definitions and never contains
-- generated navigation data.
create table if not exists public.map_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  scope            text not null check (scope in ('room', 'floor')),
  category         text not null,
  source_scope     text not null check (source_scope in ('campus', 'shared')),
  campus_id        uuid references public.campuses (id) on delete cascade,
  created_by       uuid not null references public.profiles (id) on delete restrict,
  template_data    jsonb not null check (jsonb_typeof(template_data) = 'object'),
  preview_metadata jsonb,
  is_archived      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint map_templates_name_not_blank check (btrim(name) <> ''),
  constraint map_templates_source_context_check check (
    (source_scope = 'campus' and campus_id is not null)
    or (source_scope = 'shared' and campus_id is null)
  )
);

create index if not exists map_templates_catalogue_idx
  on public.map_templates (scope, source_scope, campus_id, is_archived, updated_at desc);

alter table public.map_templates enable row level security;

drop policy if exists "map_templates_select_admin" on public.map_templates;
create policy "map_templates_select_admin"
  on public.map_templates
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "map_templates_insert_admin" on public.map_templates;
create policy "map_templates_insert_admin"
  on public.map_templates
  for insert
  to authenticated
  with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "map_templates_update_owner_admin" on public.map_templates;
create policy "map_templates_update_owner_admin"
  on public.map_templates
  for update
  to authenticated
  using (public.is_admin() and created_by = auth.uid())
  with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "map_templates_delete_owner_admin" on public.map_templates;
create policy "map_templates_delete_owner_admin"
  on public.map_templates
  for delete
  to authenticated
  using (public.is_admin() and created_by = auth.uid());

drop trigger if exists map_templates_set_updated_at on public.map_templates;
create trigger map_templates_set_updated_at
  before update on public.map_templates
  for each row execute function public.set_updated_at();

comment on table public.map_templates is
  'Admin-created visual/physical Floor templates. Legacy room rows may remain for compatibility; navigation-sensitive data is excluded by the application sanitizer.';
