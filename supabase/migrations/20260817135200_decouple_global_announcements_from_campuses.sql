-- A global announcement must survive independently of campus lifecycle.
alter table public.announcements
  drop constraint if exists announcements_campus_id_fkey;

alter table public.announcements
  alter column campus_id drop not null;

alter table public.announcements
  add constraint announcements_campus_id_fkey
  foreign key (campus_id) references public.campuses (id) on delete set null;

alter table public.announcements
  drop constraint if exists announcements_scope_campus_required_check;

alter table public.announcements
  add constraint announcements_scope_campus_required_check
  check (audience_scope = 'global' or campus_id is not null);

comment on column public.announcements.campus_id is
  'Required for campus-scoped announcements; optional for system-wide global announcements';
