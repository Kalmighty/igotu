-- IGotU Cancel Request Setup
-- Run this in Supabase SQL Editor if you only want to add the cancellation feature.
-- Cancellation does not delete a service request. It updates the request status to cancelled.

alter table if exists service_requests enable row level security;

drop policy if exists "Clients can cancel own open requests" on service_requests;
create policy "Clients can cancel own open requests"
on service_requests
for update
to authenticated
using (
  client_id = auth.uid()
  and status in ('pending', 'provider_selected', 'confirmed')
)
with check (
  client_id = auth.uid()
  and status = 'cancelled'
);

create or replace function client_cancel_request(p_request_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_status text;
begin
  select client_id, status
  into v_client_id, v_status
  from service_requests
  where request_id = p_request_id;

  if v_client_id is null then
    raise exception 'Request not found.';
  end if;

  if v_client_id <> auth.uid() then
    raise exception 'You can only cancel your own request.';
  end if;

  if v_status not in ('pending', 'provider_selected', 'confirmed') then
    raise exception 'This request can no longer be cancelled.';
  end if;

  update service_requests
  set status = 'cancelled'
  where request_id = p_request_id;
end;
$$;

grant execute on function client_cancel_request(text) to authenticated;
