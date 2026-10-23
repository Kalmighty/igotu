-- IGotU Request Cancellation Setup
-- Run this file in Supabase SQL Editor if the other priority setup has already been applied.
-- Cancellation retains the service request and changes its status to cancelled.

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
