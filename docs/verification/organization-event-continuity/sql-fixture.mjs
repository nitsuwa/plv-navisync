// Controlled dependencies for real SQL tests. Never applied to the live project.
export const continuityFixtureSql=`
create role anon; create role authenticated;
create schema auth; grant usage on schema auth to authenticated,anon;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.profiles(id uuid primary key,first_name text,last_name text,role text,is_active boolean not null default true);
insert into profiles values
('00000000-0000-0000-0000-000000000001','Admin','One','admin',true),
('00000000-0000-0000-0000-000000000002','Old','Representative','student_org',true),
('00000000-0000-0000-0000-000000000003','New','Representative','student_org',true),
('00000000-0000-0000-0000-000000000004','Other','Org','student_org',true),
('00000000-0000-0000-0000-000000000005','Ordinary','Student','student',true),
('00000000-0000-0000-0000-000000000006','Inactive','Representative','student_org',false);
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','super_admin') and is_active) $$;
create function public.is_student_org() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='student_org' and is_active) $$;
create schema continuity_test;
create table continuity_test.results(name text primary key);
grant usage on schema continuity_test to authenticated,anon;
grant insert on continuity_test.results to authenticated,anon;
create function continuity_test.assert(p_name text,p_ok boolean) returns void language plpgsql as $$ begin if p_ok is distinct from true then raise exception 'FAILED: %',p_name; end if; insert into continuity_test.results values(p_name); end $$;
create function continuity_test.denied(p_name text,p_query text,p_code text default '42501') returns void language plpgsql as $$ begin begin execute p_query; exception when others then if sqlstate=p_code then perform continuity_test.assert(p_name,true); return; else raise; end if; end; raise exception 'FAILED: % unexpectedly succeeded',p_name; end $$;
select set_config('app.continuity_test','isolated',false);
`;
