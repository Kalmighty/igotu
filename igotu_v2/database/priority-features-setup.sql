-- IGotU Priority Features Setup
-- Run this in Supabase SQL Editor before testing the updated files.
-- This file adds provider trust verification, payment proof fields, notification support,
-- and read/update policies needed by the client, provider, and admin pages.

-- =========================================================
-- 1. Provider trust / verification fields
-- =========================================================

alter table if exists provider_profiles
add column if not exists is_verified boolean not null default false;

alter table if exists provider_profiles
add column if not exists verified_at timestamptz;

alter table if exists provider_profiles
add column if not exists verified_by uuid references users(id) on delete set null;

-- =========================================================
-- 2. Payment proof fields
-- Code uses these column names: proof_url, proof_path, proof_uploaded_at
-- =========================================================

alter table if exists payment_records
add column if not exists proof_url text;

alter table if exists payment_records
add column if not exists proof_path text;

alter table if exists payment_records
add column if not exists proof_uploaded_at timestamptz;

-- =========================================================
-- 3. Notifications table
-- =========================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_id on notifications(user_id);
create index if not exists idx_notifications_created_at on notifications(created_at desc);

-- =========================================================
-- 4. Payment proof storage bucket
-- =========================================================

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', true)
on conflict (id) do update set public = true;

-- =========================================================
-- 5. Row Level Security helper policies
-- These policies are safe to re-run because old versions are dropped first.
-- =========================================================

alter table if exists notifications enable row level security;
alter table if exists provider_profiles enable row level security;
alter table if exists service_reviews enable row level security;
alter table if exists service_requests enable row level security;
alter table if exists payment_records enable row level security;

-- =========================================================
-- 6. Client request cancellation
-- Cancellation keeps the request record and changes only its status.
-- It is permitted before the provider confirms the request.
-- =========================================================

create or replace function public.client_cancel_request(p_request_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests%rowtype;
begin
  select *
  into v_request
  from public.service_requests
  where request_id = p_request_id
  for update;

  if not found then
    raise exception 'Service request not found.';
  end if;

  if auth.uid() is null or v_request.client_id <> auth.uid() then
    raise exception 'You are not allowed to cancel this request.';
  end if;

  if v_request.status not in ('pending', 'provider_selected') then
    raise exception 'Only pending or provider-selected requests can be cancelled.';
  end if;

  update public.service_requests
  set status = 'cancelled'
  where request_id = p_request_id;
end;
$$;

revoke all on function public.client_cancel_request(text) from public;
grant execute on function public.client_cancel_request(text) to authenticated;

-- =========================================================
-- 7. Client request editing
-- Only pending requests can be edited, before provider selection.
-- =========================================================

create or replace function public.client_update_request(
  p_request_id text,
  p_title text,
  p_category text,
  p_description text,
  p_preferred_date date,
  p_preferred_time time,
  p_location text,
  p_client_lat numeric,
  p_client_lng numeric,
  p_budget numeric,
  p_priority text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests%rowtype;
  v_category public.service_requests.category%type;
  v_priority public.service_requests.priority%type;
begin
  select *
  into v_request
  from public.service_requests
  where request_id = p_request_id
  for update;

  if not found then
    raise exception 'Service request not found.';
  end if;

  if auth.uid() is null or v_request.client_id <> auth.uid() then
    raise exception 'You are not allowed to edit this request.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending requests can be edited.';
  end if;

  if nullif(trim(p_title), '') is null
     or nullif(trim(p_description), '') is null
     or nullif(trim(p_location), '') is null
     or p_preferred_date is null
     or p_preferred_time is null
     or p_client_lat is null
     or p_client_lng is null then
    raise exception 'Please complete all required request fields.';
  end if;

  if p_category not in ('Cleaning', 'Delivery', 'Repair', 'Moving Help', 'Errands', 'Tutoring', 'Other') then
    raise exception 'Invalid service category.';
  end if;

  if p_priority not in ('normal', 'urgent') then
    raise exception 'Invalid request priority.';
  end if;

  if p_budget is not null and p_budget < 0 then
    raise exception 'Budget cannot be negative.';
  end if;

  -- Convert text parameters to the database column types. This supports
  -- PostgreSQL enum columns such as service_category.
  v_category := p_category;
  v_priority := p_priority;

  update public.service_requests
  set title = trim(p_title),
      category = v_category,
      description = trim(p_description),
      preferred_date = p_preferred_date,
      preferred_time = p_preferred_time,
      location = trim(p_location),
      client_lat = p_client_lat,
      client_lng = p_client_lng,
      budget = p_budget,
      priority = v_priority
  where request_id = p_request_id;
end;
$$;

revoke all on function public.client_update_request(
  text, text, text, text, date, time, text, numeric, numeric, numeric, text
) from public;

grant execute on function public.client_update_request(
  text, text, text, text, date, time, text, numeric, numeric, numeric, text
) to authenticated;

-- Notifications

drop policy if exists "Users can read own notifications" on notifications;
create policy "Users can read own notifications"
on notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can update own notifications" on notifications;
create policy "Users can update own notifications"
on notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Authenticated users can create notifications" on notifications;
create policy "Authenticated users can create notifications"
on notifications
for insert
to authenticated
with check (true);

-- Provider profile read/update for trust section and admin verification

drop policy if exists "Authenticated users can read provider profiles" on provider_profiles;
create policy "Authenticated users can read provider profiles"
on provider_profiles
for select
to authenticated
using (true);

drop policy if exists "Providers can update own profile" on provider_profiles;
create policy "Providers can update own profile"
on provider_profiles
for update
to authenticated
using (provider_id = auth.uid())
with check (provider_id = auth.uid());

drop policy if exists "Admins can verify provider profiles" on provider_profiles;
create policy "Admins can verify provider profiles"
on provider_profiles
for update
to authenticated
using (
  exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
      and users.status = 'active'
  )
)
with check (
  exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
      and users.status = 'active'
  )
);

-- Reviews can be read by authenticated users so provider trust statistics can be shown.

drop policy if exists "Authenticated users can read service reviews" on service_reviews;
create policy "Authenticated users can read service reviews"
on service_reviews
for select
to authenticated
using (true);

-- Service requests read policy needed for completed service count.
-- This also allows admin monitoring and provider/client request displays to work smoothly.

drop policy if exists "Authenticated users can read service request summaries" on service_requests;
create policy "Authenticated users can read service request summaries"
on service_requests
for select
to authenticated
using (true);

-- Payment records visibility for client, provider, and admin.

drop policy if exists "Clients providers admins can read payment records" on payment_records;
create policy "Clients providers admins can read payment records"
on payment_records
for select
to authenticated
using (
  client_id = auth.uid()
  or provider_id = auth.uid()
  or exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
      and users.status = 'active'
  )
);

drop policy if exists "Clients can insert own payment records" on payment_records;
create policy "Clients can insert own payment records"
on payment_records
for insert
to authenticated
with check (client_id = auth.uid());

-- Storage policies for payment proof uploads and viewing.

drop policy if exists "Authenticated users can upload payment proofs" on storage.objects;
create policy "Authenticated users can upload payment proofs"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'payment-proofs');

drop policy if exists "Authenticated users can view payment proofs" on storage.objects;
create policy "Authenticated users can view payment proofs"
on storage.objects
for select
to authenticated
using (bucket_id = 'payment-proofs');

drop policy if exists "Authenticated users can update own payment proofs" on storage.objects;
create policy "Authenticated users can update own payment proofs"
on storage.objects
for update
to authenticated
using (bucket_id = 'payment-proofs' and owner = auth.uid())
with check (bucket_id = 'payment-proofs' and owner = auth.uid());
