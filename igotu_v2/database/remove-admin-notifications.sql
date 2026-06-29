-- Optional cleanup after removing the admin notification feature.
-- Run once in Supabase SQL Editor to remove existing admin notification rows.

delete from public.notifications
where user_id in (
  select id
  from public.users
  where role = 'admin'
);
