-- =============================================================
-- IGotU Trust & Safety Features Setup
-- Features:
-- 1. Report / Dispute System
-- 2. Cancellation Reason + Provider Re-matching
-- 3. Provider Double-booking Prevention
-- 4. Location Privacy support (application UI)
-- 5. Explicit Data API grants for new tables
--
-- Run this ONCE in Supabase SQL Editor before testing the files.
-- Safe to re-run: policies/functions are replaced and columns use IF NOT EXISTS.
-- =============================================================

create extension if not exists pgcrypto;

-- =============================================================
-- A. Cancellation audit fields
-- =============================================================

alter table public.service_requests
add column if not exists cancelled_by uuid references public.users(id) on delete set null;

alter table public.service_requests
add column if not exists cancellation_reason text;

alter table public.service_requests
add column if not exists cancelled_at timestamptz;

-- =============================================================
-- B. Provider decline history
-- A declined provider is excluded when the client re-matches the same request.
-- =============================================================

create table if not exists public.service_request_declines (
    id uuid primary key default gen_random_uuid(),
    request_id text not null references public.service_requests(request_id) on delete cascade,
    provider_id uuid not null references public.users(id) on delete cascade,
    reason text not null,
    created_at timestamptz not null default now(),
    unique (request_id, provider_id)
);

create index if not exists idx_service_request_declines_request
on public.service_request_declines(request_id);

create index if not exists idx_service_request_declines_provider
on public.service_request_declines(provider_id);

alter table public.service_request_declines enable row level security;

drop policy if exists "Participants can read request declines"
on public.service_request_declines;

create policy "Participants can read request declines"
on public.service_request_declines
for select
to authenticated
using (
    provider_id = auth.uid()
    or exists (
        select 1
        from public.service_requests sr
        where sr.request_id = service_request_declines.request_id
          and sr.client_id = auth.uid()
    )
    or exists (
        select 1
        from public.users admin_user
        where admin_user.id = auth.uid()
          and admin_user.role::text = 'admin'
          and admin_user.status::text = 'active'
    )
);

-- =============================================================
-- C. Service reports / disputes
-- =============================================================

create table if not exists public.service_reports (
    id uuid primary key default gen_random_uuid(),
    request_id text not null references public.service_requests(request_id) on delete cascade,
    reporter_id uuid not null references public.users(id) on delete cascade,
    reported_user_id uuid not null references public.users(id) on delete cascade,
    reason text not null,
    description text not null,
    evidence_path text,
    status text not null default 'pending'
        check (status in ('pending', 'under_review', 'resolved', 'dismissed')),
    admin_note text,
    created_at timestamptz not null default now(),
    reviewed_at timestamptz,
    reviewed_by uuid references public.users(id) on delete set null,
    unique (request_id, reporter_id, reported_user_id)
);

create index if not exists idx_service_reports_status
on public.service_reports(status, created_at desc);

create index if not exists idx_service_reports_reporter
on public.service_reports(reporter_id, created_at desc);

create index if not exists idx_service_reports_reported_user
on public.service_reports(reported_user_id, created_at desc);

alter table public.service_reports enable row level security;

drop policy if exists "Reporters and admins can read reports"
on public.service_reports;

create policy "Reporters and admins can read reports"
on public.service_reports
for select
to authenticated
using (
    reporter_id = auth.uid()
    or exists (
        select 1
        from public.users admin_user
        where admin_user.id = auth.uid()
          and admin_user.role::text = 'admin'
          and admin_user.status::text = 'active'
    )
);

-- =============================================================
-- D. PRIVATE report evidence bucket
-- =============================================================

insert into storage.buckets (id, name, public)
values ('report-evidence', 'report-evidence', false)
on conflict (id) do update set public = false;

drop policy if exists "Users upload own report evidence"
on storage.objects;

create policy "Users upload own report evidence"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'report-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users and admins read report evidence"
on storage.objects;

create policy "Users and admins read report evidence"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'report-evidence'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (
            select 1
            from public.users admin_user
            where admin_user.id = auth.uid()
              and admin_user.role::text = 'admin'
              and admin_user.status::text = 'active'
        )
    )
);

drop policy if exists "Users delete own report evidence"
on storage.objects;

create policy "Users delete own report evidence"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'report-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
);

-- =============================================================
-- E. Client cancellation with reason
-- Allows cancellation before service starts: pending, provider_selected, confirmed.
-- =============================================================

drop function if exists public.client_cancel_request(text);

drop function if exists public.client_cancel_request(text, text);

create function public.client_cancel_request(
    p_request_id text,
    p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then
        raise exception 'You must be logged in.';
    end if;

    if nullif(trim(p_reason), '') is null then
        raise exception 'Please provide a cancellation reason.';
    end if;

    select *
    into v_request
    from public.service_requests
    where request_id = p_request_id
    for update;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if v_request.client_id <> auth.uid() then
        raise exception 'You can only cancel your own request.';
    end if;

    if v_request.status::text not in ('pending', 'provider_selected', 'confirmed') then
        raise exception 'This request can no longer be cancelled.';
    end if;

    update public.service_requests
    set status = 'cancelled',
        cancelled_by = auth.uid(),
        cancellation_reason = trim(p_reason),
        cancelled_at = now()
    where request_id = p_request_id;
end;
$$;

revoke all on function public.client_cancel_request(text, text) from public;
grant execute on function public.client_cancel_request(text, text) to authenticated;

-- =============================================================
-- F. Provider decline with reason + automatic re-matching
-- The request returns to pending and selected_provider_id is cleared.
-- =============================================================

drop function if exists public.provider_decline_request(text);
drop function if exists public.provider_decline_request(text, text);

create function public.provider_decline_request(
    p_request_id text,
    p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then
        raise exception 'You must be logged in.';
    end if;

    if nullif(trim(p_reason), '') is null then
        raise exception 'Please provide a decline reason.';
    end if;

    select *
    into v_request
    from public.service_requests
    where request_id = p_request_id
    for update;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if v_request.selected_provider_id <> auth.uid() then
        raise exception 'This request is not assigned to you.';
    end if;

    if v_request.status::text <> 'provider_selected' then
        raise exception 'Only newly selected requests can be declined.';
    end if;

    insert into public.service_request_declines (
        request_id,
        provider_id,
        reason,
        created_at
    )
    values (
        p_request_id,
        auth.uid(),
        trim(p_reason),
        now()
    )
    on conflict (request_id, provider_id)
    do update set
        reason = excluded.reason,
        created_at = now();

    update public.service_requests
    set selected_provider_id = null,
        status = 'pending'
    where request_id = p_request_id;
end;
$$;

revoke all on function public.provider_decline_request(text, text) from public;
grant execute on function public.provider_decline_request(text, text) to authenticated;

-- =============================================================
-- G. Smart provider selection with double-booking prevention
-- Prevents selecting a provider already selected/confirmed/in progress
-- at the same requested date + time, and prevents selecting a provider
-- who previously declined this same request.
-- =============================================================

create or replace function public.client_select_provider(
    p_request_id text,
    p_provider_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_request public.service_requests%rowtype;
    v_provider public.users%rowtype;
begin
    if auth.uid() is null then
        raise exception 'You must be logged in.';
    end if;

    select *
    into v_request
    from public.service_requests
    where request_id = p_request_id
    for update;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if v_request.client_id <> auth.uid() then
        raise exception 'You can only select a provider for your own request.';
    end if;

    if v_request.status::text <> 'pending' then
        raise exception 'A provider can only be selected while the request is pending.';
    end if;

    select *
    into v_provider
    from public.users
    where id = p_provider_id;

    if not found
       or v_provider.role::text <> 'provider'
       or v_provider.status::text <> 'active' then
        raise exception 'The selected provider is not available.';
    end if;

    if exists (
        select 1
        from public.provider_profiles pp
        where pp.provider_id = p_provider_id
          and pp.is_available = false
    ) then
        raise exception 'The selected provider is currently unavailable.';
    end if;

    if exists (
        select 1
        from public.service_request_declines d
        where d.request_id = p_request_id
          and d.provider_id = p_provider_id
    ) then
        raise exception 'This provider previously declined this request. Please choose another provider.';
    end if;

    if nullif(trim(coalesce(v_request.service_type, '')), '') is not null
       and not exists (
            select 1
            from public.provider_specializations ps
            where ps.provider_id = p_provider_id
              and ps.category::text = v_request.category::text
              and ps.specialization = v_request.service_type
       ) then
        raise exception 'This provider does not match the requested service specialization.';
    end if;

    if exists (
        select 1
        from public.service_requests busy
        where busy.selected_provider_id = p_provider_id
          and busy.request_id <> p_request_id
          and busy.status::text in ('provider_selected', 'confirmed', 'in_progress')
          and busy.preferred_date = v_request.preferred_date
          and busy.preferred_time = v_request.preferred_time
    ) then
        raise exception 'This provider is already booked at the requested date and time.';
    end if;

    update public.service_requests
    set selected_provider_id = p_provider_id,
        status = 'provider_selected'
    where request_id = p_request_id;
end;
$$;

revoke all on function public.client_select_provider(text, uuid) from public;
grant execute on function public.client_select_provider(text, uuid) to authenticated;

-- =============================================================
-- H. Provider confirmation with final double-booking check
-- =============================================================

create or replace function public.provider_confirm_request(
    p_request_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then
        raise exception 'You must be logged in.';
    end if;

    select *
    into v_request
    from public.service_requests
    where request_id = p_request_id
    for update;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if v_request.selected_provider_id <> auth.uid() then
        raise exception 'This request is not assigned to you.';
    end if;

    if v_request.status::text <> 'provider_selected' then
        raise exception 'This request is no longer waiting for confirmation.';
    end if;

    if exists (
        select 1
        from public.service_requests busy
        where busy.selected_provider_id = auth.uid()
          and busy.request_id <> p_request_id
          and busy.status::text in ('confirmed', 'in_progress')
          and busy.preferred_date = v_request.preferred_date
          and busy.preferred_time = v_request.preferred_time
    ) then
        raise exception 'You already have another confirmed service at this date and time. Decline this request so the client can re-match.';
    end if;

    update public.service_requests
    set status = 'confirmed'
    where request_id = p_request_id;
end;
$$;

revoke all on function public.provider_confirm_request(text) from public;
grant execute on function public.provider_confirm_request(text) to authenticated;

-- =============================================================
-- I. Submit service report RPC
-- Validates that reporter and reported user are the two participants.
-- =============================================================

create or replace function public.submit_service_report(
    p_request_id text,
    p_reported_user_id uuid,
    p_reason text,
    p_description text,
    p_evidence_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_request public.service_requests%rowtype;
    v_report_id uuid;
    v_expected_reported_user uuid;
begin
    if auth.uid() is null then
        raise exception 'You must be logged in.';
    end if;

    if nullif(trim(p_reason), '') is null then
        raise exception 'Please select a report reason.';
    end if;

    if nullif(trim(p_description), '') is null then
        raise exception 'Please describe what happened.';
    end if;

    select *
    into v_request
    from public.service_requests
    where request_id = p_request_id;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if auth.uid() = v_request.client_id then
        if v_request.selected_provider_id is null then
            raise exception 'There is no selected provider to report for this request.';
        end if;
        v_expected_reported_user := v_request.selected_provider_id;
    elsif auth.uid() = v_request.selected_provider_id then
        v_expected_reported_user := v_request.client_id;
    else
        raise exception 'You are not a participant in this service request.';
    end if;

    if p_reported_user_id <> v_expected_reported_user then
        raise exception 'The reported user does not match this service request.';
    end if;

    if p_evidence_path is not null
       and p_evidence_path not like auth.uid()::text || '/%' then
        raise exception 'Invalid evidence file path.';
    end if;

    insert into public.service_reports (
        request_id,
        reporter_id,
        reported_user_id,
        reason,
        description,
        evidence_path,
        status
    )
    values (
        p_request_id,
        auth.uid(),
        p_reported_user_id,
        trim(p_reason),
        trim(p_description),
        p_evidence_path,
        'pending'
    )
    returning id into v_report_id;

    return v_report_id;
exception
    when unique_violation then
        raise exception 'You have already submitted a report for this user on this service request.';
end;
$$;

revoke all on function public.submit_service_report(text, uuid, text, text, text) from public;
grant execute on function public.submit_service_report(text, uuid, text, text, text) to authenticated;

-- =============================================================
-- J. Admin report review RPC
-- =============================================================

create or replace function public.admin_review_service_report(
    p_report_id uuid,
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
    v_report public.service_reports%rowtype;
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
       or v_admin.status::text <> 'active' then
        raise exception 'Only an active administrator can review reports.';
    end if;

    if p_status not in ('under_review', 'resolved', 'dismissed') then
        raise exception 'Invalid report status.';
    end if;

    select *
    into v_report
    from public.service_reports
    where id = p_report_id
    for update;

    if not found then
        raise exception 'Report not found.';
    end if;

    update public.service_reports
    set status = p_status,
        admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = p_report_id;

    if p_status in ('resolved', 'dismissed') then
        insert into public.notifications (user_id, title, message, is_read, created_at)
        values (
            v_report.reporter_id,
            case when p_status = 'resolved' then 'Report resolved' else 'Report dismissed' end,
            case
                when p_status = 'resolved'
                    then 'Your report for request ' || v_report.request_id || ' has been reviewed and resolved.'
                else 'Your report for request ' || v_report.request_id || ' has been reviewed and dismissed.'
            end,
            false,
            now()
        );
    end if;
end;
$$;

revoke all on function public.admin_review_service_report(uuid, text, text) from public;
grant execute on function public.admin_review_service_report(uuid, text, text) to authenticated;

-- =============================================================
-- K. Explicit Data API grants
-- Future-proofs these new tables for Supabase's explicit grant behaviour.
-- RLS policies still control which rows are visible.
-- =============================================================

grant select on table public.service_request_declines to authenticated;
grant select on table public.service_reports to authenticated;

grant select, insert, update, delete on table public.service_request_declines to service_role;
grant select, insert, update, delete on table public.service_reports to service_role;

-- Existing verification table: make its intended API grants explicit too.
grant select, insert on table public.verification_requests to authenticated;
grant select, insert, update, delete on table public.verification_requests to service_role;

-- =============================================================
-- SETUP COMPLETE
-- =============================================================
