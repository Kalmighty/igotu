-- =============================================================
-- IGotU Profile Onboarding Setup
-- Run this ONCE in Supabase SQL Editor before using the new pages.
-- =============================================================

-- 1. Basic onboarding fields
alter table public.users
add column if not exists phone text;

alter table public.users
add column if not exists profile_completed boolean not null default false;

-- Existing accounts are already using the system, so keep them working.
-- New registrations created after this migration will use the default FALSE.
update public.users
set profile_completed = true
where profile_completed = false;

-- 2. Secure RPC used by client/provider onboarding pages.
create or replace function public.complete_basic_profile(
  p_full_name text,
  p_phone text
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in.';
  end if;

  if nullif(trim(p_full_name), '') is null then
    raise exception 'Full name is required.';
  end if;

  if nullif(trim(p_phone), '') is null then
    raise exception 'Phone number is required.';
  end if;

  if length(regexp_replace(p_phone, '[^0-9+]', '', 'g')) < 7 then
    raise exception 'Please enter a valid phone number.';
  end if;

  select *
  into v_user
  from public.users
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'User profile not found.';
  end if;

  if v_user.role::text not in ('client', 'provider') then
    raise exception 'This profile setup is only for clients and providers.';
  end if;

  update public.users
  set
    full_name = trim(p_full_name),
    phone = trim(p_phone),
    profile_completed = true
  where id = auth.uid()
  returning * into v_user;

  return v_user;
end;
$$;

revoke all on function public.complete_basic_profile(text, text) from public;
grant execute on function public.complete_basic_profile(text, text) to authenticated;

-- Admin accounts never use onboarding.
update public.users
set profile_completed = true
where role::text = 'admin';

-- Optional test command AFTER setup:
-- update public.users set profile_completed = false, phone = null where email = 'YOUR_TEST_EMAIL';
