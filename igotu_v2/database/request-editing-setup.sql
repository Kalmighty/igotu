-- IGotU Request Editing Setup
-- Run this file in Supabase SQL Editor if the priority setup has already been applied.
-- Clients can edit only their own pending requests before provider selection.

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
