alter table public.campuses
  add column if not exists canvas_configured boolean not null default false;

comment on column public.campuses.canvas_configured is
  'True after the administrator completes initial canvas setup, even when dimensions remain at their defaults.';
