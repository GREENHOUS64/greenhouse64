-- GREENHOUSE initial database proposal.
-- Review the target Supabase project and back up any existing data before applying.
-- Public forms must write through a server-side Edge Function; never expose service_role.

create schema greenhouse_private;
revoke all on schema greenhouse_private from public, anon, authenticated;
grant usage on schema greenhouse_private to authenticated;

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'operator')),
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now()
);

create table public.lead_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  phone text not null check (char_length(phone) between 3 and 32),
  message text not null default '' check (char_length(message) <= 3000),
  consent_at timestamptz not null,
  consent_version text not null,
  source text not null default 'website'
    check (source in ('website', 'assistant')),
  status text not null default 'new'
    check (status in ('new', 'ai_review', 'operator', 'closed')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.lead_requests (id) on delete cascade,
  actor_kind text not null check (actor_kind in ('admin', 'ai', 'system')),
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null check (event_type in ('status_changed', 'note', 'ai_summary')),
  from_status text check (from_status in ('new', 'ai_review', 'operator', 'closed')),
  to_status text check (to_status in ('new', 'ai_review', 'operator', 'closed')),
  note text check (note is null or char_length(note) <= 3000),
  created_at timestamptz not null default pg_catalog.now()
);

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  category text not null check (char_length(category) between 1 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  availability text not null default 'ask_operator'
    check (availability in ('available', 'ask_operator', 'unavailable')),
  is_published boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now()
);

create table greenhouse_private.lead_rate_limits (
  ip_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (ip_hash, window_start)
);
alter table greenhouse_private.lead_rate_limits enable row level security;
create policy service_role_manage_rate_limits
  on greenhouse_private.lead_rate_limits for all to service_role
  using (true) with check (true);


revoke all on table greenhouse_private.lead_rate_limits from public, anon, authenticated;
grant usage on schema greenhouse_private to service_role;
grant select, insert, update, delete on table greenhouse_private.lead_rate_limits to service_role;

create index lead_requests_status_created_idx
  on public.lead_requests (status, created_at desc);
create index lead_events_lead_created_idx
  on public.lead_events (lead_id, created_at desc);
create index lead_events_actor_user_id_idx
  on public.lead_events (actor_user_id);

create function greenhouse_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users as admin
    where admin.user_id = (select auth.uid())
      and admin.is_active
  );
$$;

create function greenhouse_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create function public.submit_lead(
  p_name text,
  p_phone text,
  p_message text,
  p_consent_at timestamptz,
  p_consent_version text,
  p_ip_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
  v_count integer;
  v_id uuid;
begin
  if p_name is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 100
     or p_phone is null or pg_catalog.char_length(pg_catalog.btrim(p_phone)) not between 3 and 32
     or p_message is null or pg_catalog.char_length(p_message) > 3000
     or p_consent_at is null or p_consent_version is distinct from '2026-11-16'
     or p_ip_hash is null or pg_catalog.char_length(p_ip_hash) <> 64 then
    raise exception 'invalid request';
  end if;

  delete from greenhouse_private.lead_rate_limits
  where window_start < v_window - interval '1 hour';

  insert into greenhouse_private.lead_rate_limits(ip_hash, window_start, request_count)
  values (p_ip_hash, v_window, 1)
  on conflict (ip_hash, window_start)
  do update set request_count = greenhouse_private.lead_rate_limits.request_count + 1
  returning request_count into v_count;

  if v_count > 5 then
    raise exception 'rate limit exceeded';
  end if;

  insert into public.lead_requests(name, phone, message, consent_at, consent_version, source)
  values (
    pg_catalog.btrim(p_name),
    pg_catalog.btrim(p_phone),
    pg_catalog.btrim(p_message),
    p_consent_at,
    p_consent_version,
    'website'
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function greenhouse_private.is_admin() from public, anon;
grant execute on function greenhouse_private.is_admin() to authenticated;
revoke all on function greenhouse_private.set_updated_at() from public, anon, authenticated;
revoke all on function public.submit_lead(text, text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.submit_lead(text, text, text, timestamptz, text, text) to service_role;

create trigger lead_requests_set_updated_at
  before update on public.lead_requests
  for each row execute function greenhouse_private.set_updated_at();
create trigger plants_set_updated_at
  before update on public.plants
  for each row execute function greenhouse_private.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.lead_requests enable row level security;
alter table public.lead_events enable row level security;
alter table public.plants enable row level security;

revoke all on table public.admin_users, public.lead_requests,
  public.lead_events, public.plants from anon, authenticated;

grant select on table public.admin_users to authenticated;
grant select, update on table public.lead_requests to authenticated;
grant select, insert on table public.lead_events to authenticated;
grant select on table public.plants to anon, authenticated;
grant insert, update, delete on table public.plants to authenticated;

create policy admin_users_read_self
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));

create policy admins_read_leads
  on public.lead_requests for select to authenticated
  using ((select greenhouse_private.is_admin()));
create policy admins_update_leads
  on public.lead_requests for update to authenticated
  using ((select greenhouse_private.is_admin()))
  with check ((select greenhouse_private.is_admin()));

create policy admins_read_lead_events
  on public.lead_events for select to authenticated
  using ((select greenhouse_private.is_admin()));
create policy admins_add_lead_events
  on public.lead_events for insert to authenticated
  with check (
    (select greenhouse_private.is_admin())
    and actor_kind = 'admin'
    and actor_user_id = (select auth.uid())
  );

create policy public_read_published_plants
  on public.plants for select to anon
  using (is_published);
create policy authenticated_read_plants
  on public.plants for select to authenticated
  using (is_published or (select greenhouse_private.is_admin()));
create policy admins_insert_plants
  on public.plants for insert to authenticated
  with check ((select greenhouse_private.is_admin()));
create policy admins_update_plants
  on public.plants for update to authenticated
  using ((select greenhouse_private.is_admin()))
  with check ((select greenhouse_private.is_admin()));
create policy admins_delete_plants
  on public.plants for delete to authenticated
  using ((select greenhouse_private.is_admin()));

comment on table public.lead_requests is
  'Contact requests. Public inserts are handled by a validated server-side function.';
comment on table public.lead_events is
  'Private status and AI activity history for contact requests.';
comment on table public.admin_users is
  'Allowlist of authenticated GREENHOUSE operators; users cannot grant themselves access.';
comment on table public.plants is
  'Plant catalog and availability only. Prices are intentionally not stored here.';
comment on table greenhouse_private.lead_rate_limits is
  'Hourly hashed-IP request counters for the public lead form; no raw IP addresses are stored.';


