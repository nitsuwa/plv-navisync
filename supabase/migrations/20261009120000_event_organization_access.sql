-- Verified organization identity and one current representative. Additive; no event content changes.
begin;
create schema if not exists private;
create table if not exists public.event_organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(btrim(code)) and length(code) between 1 and 40),
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.event_organization_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.event_organizations(id) on delete restrict,
  representative_id uuid not null references public.profiles(id) on delete restrict,
  academic_year text not null check (length(btrim(academic_year)) between 1 and 40),
  starts_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete restrict,
  end_reason text,
  check (expires_at > starts_at),
  check ((ended_at is null and ended_by is null and end_reason is null)
    or (ended_at is not null and ended_by is not null and length(btrim(end_reason)) between 1 and 500))
);
create unique index if not exists event_organization_one_open_grant on public.event_organization_grants(organization_id) where ended_at is null;
create index if not exists event_organization_grants_representative_idx on public.event_organization_grants(representative_id,organization_id) where ended_at is null;
create index if not exists event_organization_grants_granted_by_idx on public.event_organization_grants(granted_by);
create index if not exists event_organization_grants_ended_by_idx on public.event_organization_grants(ended_by);
create table if not exists public.event_organization_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.event_organizations(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists event_organization_audit_org_idx on public.event_organization_audit(organization_id,created_at desc);
create index if not exists event_organization_audit_actor_idx on public.event_organization_audit(actor_id);
alter table public.event_organizations enable row level security;
alter table public.event_organization_grants enable row level security;
alter table public.event_organization_audit enable row level security;
revoke all on public.event_organizations,public.event_organization_grants,public.event_organization_audit from public,anon,authenticated;
grant select on public.event_organizations,public.event_organization_grants,public.event_organization_audit to authenticated;

create or replace function private.event_organization_access(p_organization_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select auth.uid() is not null and public.is_student_org() and exists (
    select 1 from public.event_organization_grants g join public.event_organizations o on o.id=g.organization_id
    where o.id=p_organization_id and o.is_active and g.representative_id=auth.uid()
      and g.ended_at is null and g.starts_at <= clock_timestamp() and g.expires_at > clock_timestamp()
  );
$$;
revoke all on function private.event_organization_access(uuid) from public,anon,authenticated;
-- Boolean wrapper needed for policies; never accepts an actor supplied by the client.
create or replace function public.has_event_organization_access(p_organization_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select private.event_organization_access(p_organization_id);
$$;
revoke all on function public.has_event_organization_access(uuid) from public,anon;
grant execute on function public.has_event_organization_access(uuid) to authenticated;
drop policy if exists event_organizations_read on public.event_organizations;
create policy event_organizations_read on public.event_organizations for select to authenticated
  using (public.is_admin() or public.has_event_organization_access(id));
drop policy if exists event_organization_grants_read on public.event_organization_grants;
create policy event_organization_grants_read on public.event_organization_grants for select to authenticated
  using (public.is_admin() or public.has_event_organization_access(organization_id));
drop policy if exists event_organization_audit_read on public.event_organization_audit;
create policy event_organization_audit_read on public.event_organization_audit for select to authenticated
  using (public.is_admin() or public.has_event_organization_access(organization_id));

create or replace function public.get_my_event_organizations()
returns table(organization_id uuid,organization_name text,grant_id uuid,academic_year text,expires_at timestamptz)
language sql volatile security definer set search_path='' as $$
  select o.id,o.name,g.id,g.academic_year,g.expires_at
  from public.event_organizations o join public.event_organization_grants g on g.organization_id=o.id
  where private.event_organization_access(o.id) and g.representative_id=auth.uid() and g.ended_at is null
  order by o.name,o.id;
$$;

create or replace function public.admin_save_event_organization(
  p_id uuid,p_code text,p_name text,p_is_active boolean,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before public.event_organizations%rowtype; v_after public.event_organizations%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_code is null or length(btrim(p_code)) not between 1 and 40 or p_name is null or length(btrim(p_name)) not between 1 and 120 or p_is_active is null then
    raise exception 'Enter an organization code and name.' using errcode='23514'; end if;
  if p_id is null then
    insert into public.event_organizations(code,name,is_active) values(upper(btrim(p_code)),btrim(p_name),p_is_active) returning * into v_after;
  else
    select * into v_before from public.event_organizations where id=p_id for update;
    if not found then raise exception 'Organization not found.' using errcode='23514'; end if;
    if p_expected_updated_at is null or v_before.updated_at is distinct from p_expected_updated_at then
      raise exception 'Organization changed. Refresh before saving.' using errcode='40001'; end if;
    update public.event_organizations set code=upper(btrim(p_code)),name=btrim(p_name),is_active=p_is_active,updated_at=clock_timestamp() where id=p_id returning * into v_after;
  end if;
  insert into public.event_organization_audit(organization_id,actor_id,action,before_data,after_data)
    values(v_after.id,auth.uid(),case when p_id is null then 'organization_created' else 'organization_updated' end,to_jsonb(v_before),to_jsonb(v_after));
  return to_jsonb(v_after);
end $$;

create or replace function public.admin_set_event_representative(
  p_organization_id uuid,p_profile_id uuid,p_academic_year text,p_expires_at timestamptz,p_expected_grant_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org public.event_organizations%rowtype; v_old public.event_organization_grants%rowtype;
  v_new public.event_organization_grants%rowtype; v_target public.profiles%rowtype; v_now timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  select * into v_org from public.event_organizations where id=p_organization_id for update;
  if not found or not v_org.is_active then raise exception 'Choose an active organization.' using errcode='23514'; end if;
  select * into v_old from public.event_organization_grants where organization_id=p_organization_id and ended_at is null;
  if v_old.id is distinct from p_expected_grant_id then raise exception 'Representative changed. Refresh before assigning.' using errcode='40001'; end if;
  select * into v_target from public.profiles where id=p_profile_id for share;
  if not found or v_target.role <> 'student_org' or not v_target.is_active then
    raise exception 'Choose an active Student Organization account.' using errcode='23514'; end if;
  v_now:=clock_timestamp();
  if p_academic_year is null or length(btrim(p_academic_year)) not between 1 and 40 or p_expires_at is null or p_expires_at <= v_now or not isfinite(p_expires_at) then
    raise exception 'Enter an academic year and a future access expiry.' using errcode='23514'; end if;
  if v_old.id is not null then
    update public.event_organization_grants set ended_at=v_now,ended_by=auth.uid(),end_reason='replaced' where id=v_old.id;
  end if;
  insert into public.event_organization_grants(organization_id,representative_id,academic_year,starts_at,expires_at,granted_by)
    values(v_org.id,p_profile_id,btrim(p_academic_year),v_now,p_expires_at,auth.uid()) returning * into v_new;
  insert into public.event_organization_audit(organization_id,actor_id,action,before_data,after_data)
    values(v_org.id,auth.uid(),'representative_assigned',to_jsonb(v_old),to_jsonb(v_new));
  return jsonb_build_object('organization_id',v_org.id,'organization_name',v_org.name,'grant_id',v_new.id,'academic_year',v_new.academic_year,'expires_at',v_new.expires_at);
end $$;

create or replace function public.admin_revoke_event_representative(p_organization_id uuid,p_expected_grant_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_old public.event_organization_grants%rowtype; v_new public.event_organization_grants%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  perform 1 from public.event_organizations where id=p_organization_id for update;
  if not found then raise exception 'Organization not found.' using errcode='23514'; end if;
  select * into v_old from public.event_organization_grants where organization_id=p_organization_id and ended_at is null;
  if v_old.id is null or v_old.id is distinct from p_expected_grant_id then raise exception 'Representative changed. Refresh before revoking.' using errcode='40001'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'Enter the reason for ending access.' using errcode='23514'; end if;
  update public.event_organization_grants set ended_at=clock_timestamp(),ended_by=auth.uid(),end_reason=btrim(p_reason) where id=v_old.id returning * into v_new;
  insert into public.event_organization_audit(organization_id,actor_id,action,before_data,after_data) values(p_organization_id,auth.uid(),'representative_revoked',to_jsonb(v_old),to_jsonb(v_new));
end $$;

create or replace function public.admin_list_event_organizations()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object('grants',coalesce((
    select jsonb_agg(to_jsonb(g) || jsonb_build_object('representative_name',concat_ws(' ',p.first_name,p.last_name),'profile_active',p.is_active,'profile_role',p.role) order by g.starts_at desc,g.id)
    from public.event_organization_grants g join public.profiles p on p.id=g.representative_id where g.organization_id=o.id
  ),'[]'::jsonb)) order by o.name,o.id),'[]'::jsonb) into v_result from public.event_organizations o;
  return v_result;
end $$;
revoke all on function public.get_my_event_organizations() from public,anon;
revoke all on function public.admin_save_event_organization(uuid,text,text,boolean,timestamptz) from public,anon;
revoke all on function public.admin_set_event_representative(uuid,uuid,text,timestamptz,uuid) from public,anon;
revoke all on function public.admin_revoke_event_representative(uuid,uuid,text) from public,anon;
revoke all on function public.admin_list_event_organizations() from public,anon;
grant execute on function public.get_my_event_organizations(),public.admin_save_event_organization(uuid,text,text,boolean,timestamptz),public.admin_set_event_representative(uuid,uuid,text,timestamptz,uuid),public.admin_revoke_event_representative(uuid,uuid,text),public.admin_list_event_organizations() to authenticated;
notify pgrst,'reload schema';
commit;
