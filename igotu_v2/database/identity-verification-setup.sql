-- =============================================================
-- IGotU Identity Verification Setup
-- Client + Provider verification with Admin review
-- Run this ONCE in Supabase SQL Editor before testing the pages.
-- =============================================================

create extension if not exists pgcrypto;

alter table public.users
add column if not exists identity_verified boolean not null default false;

alter table public.users
add column if not exists identity_verified_at timestamptz;

alter table public.users
add column if not exists identity_verified_by uuid references public.users(id) on delete set null;

update public.users u
set
  identity_verified = true,
  identity_verified_at = coalesce(pp.verified_at, now()),
  identity_verified_by = pp.verified_by
from public.provider_profiles pp
where u.id = pp.provider_id
  and pp.is_verified = true
  and u.identity_verified = false;

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('client', 'provider')),
  legal_name text not null,
  id_type text not null check (id_type in ('mykad', 'passport')),
  id_number_last4 text not null,
  identity_document_path text not null,
  supporting_document_path text,
  business_name text,
  ssm_number text,
  professional_license text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null
);

create index if not exists idx_verification_requests_user
  on public.verification_requests(user_id, submitted_at desc);

create index if not exists idx_verification_requests_status
  on public.verification_requests(status, submitted_at desc);

alter table public.verification_requests enable row level security;

drop policy if exists "Users can read own verification requests"
on public.verification_requests;

create policy "Users can read own verification requests"
on public.verification_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.users admin_user
    where admin_user.id = auth.uid()
      and admin_user.role::text = 'admin'
      and admin_user.status = 'active'
  )
);

drop policy if exists "Users can submit own verification request"
on public.verification_requests;

create policy "Users can submit own verification request"
on public.verification_requests
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.users current_user_profile
    where current_user_profile.id = auth.uid()
      and current_user_profile.role::text in ('client', 'provider')
      and current_user_profile.role::text = public.verification_requests.role
      and current_user_profile.status = 'active'
  )
);

insert into storage.buckets (id, name, public)
values ('verification-documents', 'verification-documents', false)
on conflict (id) do update set public = false;

drop policy if exists "Users upload own verification documents"
on storage.objects;

create policy "Users upload own verification documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users and admins read verification documents"
on storage.objects;

create policy "Users and admins read verification documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'verification-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.users admin_user
      where admin_user.id = auth.uid()
        and admin_user.role::text = 'admin'
        and admin_user.status = 'active'
    )
  )
);

drop policy if exists "Users delete own verification documents"
on storage.objects;

create policy "Users delete own verification documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and not exists (
    select 1
    from public.verification_requests vr
    where vr.user_id = auth.uid()
      and (
        vr.identity_document_path = name
        or vr.supporting_document_path = name
      )
  )
);

create or replace function public.admin_review_verification(
  p_request_id uuid,
  p_status text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_request public.verification_requests%rowtype;
  v_approved boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in.';
  end if;

  select *
  into v_admin
  from public.users
  where id = auth.uid();

  if not found
     or v_admin.role::text <> 'admin'
     or v_admin.status <> 'active' then
    raise exception 'Only an active administrator can review verification requests.';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Verification status must be approved or rejected.';
  end if;

  select *
  into v_request
  from public.verification_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Verification request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This verification request has already been reviewed.';
  end if;

  v_approved := p_status = 'approved';

  update public.verification_requests
  set
    status = p_status,
    admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_request_id;

  update public.users
  set
    identity_verified = v_approved,
    identity_verified_at = case when v_approved then now() else null end,
    identity_verified_by = case when v_approved then auth.uid() else null end
  where id = v_request.user_id;

  if v_request.role = 'provider' then
    update public.provider_profiles
    set
      is_verified = v_approved,
      verified_at = case when v_approved then now() else null end,
      verified_by = case when v_approved then auth.uid() else null end
    where provider_id = v_request.user_id;
  end if;
end;
$$;

revoke all on function public.admin_review_verification(uuid, text, text) from public;
grant execute on function public.admin_review_verification(uuid, text, text) to authenticated;
