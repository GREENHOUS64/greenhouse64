-- GREENHOUS security hardening after initial production setup.
-- Rate-limit rows are private and server-role only.
alter table greenhouse_private.lead_rate_limits enable row level security;
revoke all on schema greenhouse_private from public, anon, authenticated;
revoke all on table greenhouse_private.lead_rate_limits from public, anon, authenticated;
grant usage on schema greenhouse_private to service_role;
grant select, insert, update, delete on table greenhouse_private.lead_rate_limits to service_role;
drop policy if exists service_role_manage_rate_limits on greenhouse_private.lead_rate_limits;
create policy service_role_manage_rate_limits
  on greenhouse_private.lead_rate_limits for all to service_role
  using (true) with check (true);

-- Query support for actor references in the audit log.
drop index if exists public.lead_requests_status_created_idx;
create index if not exists lead_events_actor_user_id_idx
  on public.lead_events (actor_user_id);

-- Separate plant operations so the authenticated read policy does not overlap an ALL policy.
drop policy if exists admins_manage_plants on public.plants;
drop policy if exists admins_insert_plants on public.plants;
drop policy if exists admins_update_plants on public.plants;
drop policy if exists admins_delete_plants on public.plants;
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

-- The website owner account was created through Supabase Auth by the project owner.
insert into public.admin_users (user_id, role, is_active)
select id, 'owner', true from auth.users where lower(email) = lower('egorte2008@mail.ru')
on conflict (user_id) do update set role = 'owner', is_active = true;
