-- Reassert the explicitly designated GREENHOUS owner account in the allowlist.
insert into public.admin_users (user_id, role, is_active)
select id, 'owner', true
from auth.users
where lower(email) = lower('egorte2008@mail.ru')
on conflict (user_id) do update set role = 'owner', is_active = true;
