-- IGotU Service Specialization Matching Setup
-- Run once in Supabase SQL Editor.
-- This adds specific service types so clients are matched to relevant providers,
-- e.g. Roofing requests will not match a Plumbing-only provider.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.service_requests
add column if not exists service_type text;

create table if not exists public.provider_specializations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  specialization text not null,
  created_at timestamptz not null default now(),
  constraint provider_specializations_unique unique (provider_id, category, specialization)
);

create index if not exists idx_provider_specializations_match
on public.provider_specializations(category, specialization, provider_id);

alter table public.provider_specializations enable row level security;

drop policy if exists "Authenticated users can view provider specializations" on public.provider_specializations;
create policy "Authenticated users can view provider specializations"
on public.provider_specializations
for select
to authenticated
using (true);

drop policy if exists "Providers can insert own specializations" on public.provider_specializations;
create policy "Providers can insert own specializations"
on public.provider_specializations
for insert
to authenticated
with check (provider_id = auth.uid());

drop policy if exists "Providers can delete own specializations" on public.provider_specializations;
create policy "Providers can delete own specializations"
on public.provider_specializations
for delete
to authenticated
using (provider_id = auth.uid());

drop policy if exists "Providers can update own specializations" on public.provider_specializations;
create policy "Providers can update own specializations"
on public.provider_specializations
for update
to authenticated
using (provider_id = auth.uid())
with check (provider_id = auth.uid());

grant select, insert, update, delete on public.provider_specializations to authenticated;

-- Seed specializations for the demo providers currently used in IGotU.
-- Existing rows are kept safe with ON CONFLICT DO NOTHING.
insert into public.provider_specializations (provider_id, category, specialization)
select id, 'Repair', specialization
from public.users
cross join (values
  ('Roofing'), ('General Repair')
) s(specialization)
where email = 'sitihomerepair@igotu.demo'
on conflict do nothing;

insert into public.provider_specializations (provider_id, category, specialization)
select id, 'Repair', specialization
from public.users
cross join (values
  ('Roofing'), ('Furniture Repair'), ('General Repair')
) s(specialization)
where email = 'ahmadrepairservice@igotu.demo'
on conflict do nothing;

insert into public.provider_specializations (provider_id, category, specialization)
select id, 'Repair', specialization
from public.users
cross join (values
  ('Electrical'), ('Furniture Repair'), ('General Repair')
) s(specialization)
where email = 'benfixithelper@igotu.demo'
on conflict do nothing;

insert into public.provider_specializations (provider_id, category, specialization)
select id, 'Repair', specialization
from public.users
cross join (values
  ('Appliance Repair'), ('Electrical')
) s(specialization)
where email = 'kevinappliancerepair@igotu.demo'
on conflict do nothing;

insert into public.provider_specializations (provider_id, category, specialization)
select id, 'Repair', 'Plumbing'
from public.users
where email = 'raviplumbingrepair@igotu.demo'
on conflict do nothing;

-- Cleaning providers
insert into public.provider_specializations (provider_id, category, specialization)
select id, 'Cleaning', x.specialization from public.users u
cross join lateral (values
  (case when u.email='nuraisyahcleaning@igotu.demo' then 'Home Cleaning'
        when u.email='cleanspacesabah@igotu.demo' then 'Office Cleaning'
        when u.email='mariahomecleaner@igotu.demo' then 'Home Cleaning'
        when u.email='spotlesskinarut@igotu.demo' then 'General Cleaning'
        when u.email='doreendeepclean@igotu.demo' then 'Deep Cleaning' end)
) x(specialization)
where u.email in ('nuraisyahcleaning@igotu.demo','cleanspacesabah@igotu.demo','mariahomecleaner@igotu.demo','spotlesskinarut@igotu.demo','doreendeepclean@igotu.demo')
  and x.specialization is not null
on conflict do nothing;

-- Delivery providers
insert into public.provider_specializations (provider_id, category, specialization)
select id, 'Delivery', x.specialization from public.users u
cross join lateral (values
  (case when u.email='fastgodelivery@igotu.demo' then 'Grocery Delivery'
        when u.email='hafizrunnerservice@igotu.demo' then 'General Delivery'
        when u.email='minadeliveryhelper@igotu.demo' then 'Food Delivery'
        when u.email='jayacourierhelp@igotu.demo' then 'Parcel Delivery'
        when u.email='kamilerranddelivery@igotu.demo' then 'Document Delivery' end)
) x(specialization)
where u.email in ('fastgodelivery@igotu.demo','hafizrunnerservice@igotu.demo','minadeliveryhelper@igotu.demo','jayacourierhelp@igotu.demo','kamilerranddelivery@igotu.demo')
  and x.specialization is not null
on conflict do nothing;

-- Moving Help providers
insert into public.provider_specializations (provider_id, category, specialization)
select id, 'Moving Help', x.specialization from public.users u
cross join lateral (values
  (case when u.email='danielmovinghelper@igotu.demo' then 'Furniture Moving'
        when u.email='movematesabah@igotu.demo' then 'General Moving Help'
        when u.email='azmimovingcrew@igotu.demo' then 'Loading & Unloading'
        when u.email='liyanapackinghelper@igotu.demo' then 'Packing & Unpacking'
        when u.email='tanhousemoving@igotu.demo' then 'House Moving' end)
) x(specialization)
where u.email in ('danielmovinghelper@igotu.demo','movematesabah@igotu.demo','azmimovingcrew@igotu.demo','liyanapackinghelper@igotu.demo','tanhousemoving@igotu.demo')
  and x.specialization is not null
on conflict do nothing;

-- Errand providers
insert into public.provider_specializations (provider_id, category, specialization)
select id, 'Errands', x.specialization from public.users u
cross join lateral (values
  (case when u.email='everydayerrandhelper@igotu.demo' then 'General Errands'
        when u.email='puteripersonalrunner@igotu.demo' then 'Personal Runner'
        when u.email='briangeneralhelper@igotu.demo' then 'Item Pickup'
        when u.email='ainaquickassist@igotu.demo' then 'Queueing'
        when u.email='localhelperkk@igotu.demo' then 'Document Collection' end)
) x(specialization)
where u.email in ('everydayerrandhelper@igotu.demo','puteripersonalrunner@igotu.demo','briangeneralhelper@igotu.demo','ainaquickassist@igotu.demo','localhelperkk@igotu.demo')
  and x.specialization is not null
on conflict do nothing;

-- Tutoring providers
insert into public.provider_specializations (provider_id, category, specialization)
select id, 'Tutoring', x.specialization from public.users u
cross join lateral (values
  (case when u.email='teacheraintutor@igotu.demo' then 'General Tutoring'
        when u.email='mathbuddysabah@igotu.demo' then 'Mathematics'
        when u.email='cybertutor@igotu.demo' then 'ICT / Computer'
        when u.email='muetmentor@igotu.demo' then 'English / MUET'
        when u.email='sciencecoachsabah@igotu.demo' then 'Science' end)
) x(specialization)
where u.email in ('teacheraintutor@igotu.demo','mathbuddysabah@igotu.demo','cybertutor@igotu.demo','muetmentor@igotu.demo','sciencecoachsabah@igotu.demo')
  and x.specialization is not null
on conflict do nothing;

-- Other providers
insert into public.provider_specializations (provider_id, category, specialization)
select id, 'Other', x.specialization from public.users u
cross join lateral (values
  (case when u.email='handyprogeneralservice@igotu.demo' then 'General Assistance'
        when u.email='eventhelpersabah@igotu.demo' then 'Event Setup'
        when u.email='setupassistantkk@igotu.demo' then 'Event Setup'
        when u.email='communityhelper@igotu.demo' then 'General Assistance'
        when u.email='multiskillhelper@igotu.demo' then 'Other Service' end)
) x(specialization)
where u.email in ('handyprogeneralservice@igotu.demo','eventhelpersabah@igotu.demo','setupassistantkk@igotu.demo','communityhelper@igotu.demo','multiskillhelper@igotu.demo')
  and x.specialization is not null
on conflict do nothing;

-- Add General specialization for any provider/category not yet mapped.
insert into public.provider_specializations (provider_id, category, specialization)
select ps.provider_id, ps.category::text,
  case ps.category::text
    when 'Cleaning' then 'General Cleaning'
    when 'Delivery' then 'General Delivery'
    when 'Repair' then 'General Repair'
    when 'Moving Help' then 'General Moving Help'
    when 'Errands' then 'General Errands'
    when 'Tutoring' then 'General Tutoring'
    when 'Other' then 'General Assistance'
  end
from public.provider_skills ps
where not exists (
  select 1 from public.provider_specializations x
  where x.provider_id = ps.provider_id and x.category = ps.category::text
)
and ps.category::text in ('Cleaning','Delivery','Repair','Moving Help','Errands','Tutoring','Other')
on conflict do nothing;

-- Infer service type for existing requests so old requests can use the new matching logic.
update public.service_requests
set service_type = case
  when category::text='Repair' and (title ilike '%roof%' or description ilike '%roof%') then 'Roofing'
  when category::text='Repair' and (title ilike '%pipe%' or title ilike '%plumb%' or title ilike '%leak%' or description ilike '%pipe%' or description ilike '%plumb%' or description ilike '%leak%') then 'Plumbing'
  when category::text='Repair' and (title ilike '%electric%' or title ilike '%wiring%' or description ilike '%electric%' or description ilike '%wiring%') then 'Electrical'
  when category::text='Repair' and (title ilike '%appliance%' or title ilike '%fridge%' or description ilike '%appliance%' or description ilike '%fridge%') then 'Appliance Repair'
  when category::text='Repair' and (title ilike '%furniture%' or title ilike '%chair%' or title ilike '%table%' or description ilike '%furniture%') then 'Furniture Repair'
  when category::text='Repair' then 'General Repair'
  when category::text='Cleaning' and (title ilike '%deep%' or description ilike '%deep%') then 'Deep Cleaning'
  when category::text='Cleaning' then 'General Cleaning'
  when category::text='Delivery' and (title ilike '%food%' or description ilike '%food%') then 'Food Delivery'
  when category::text='Delivery' and (title ilike '%grocery%' or title ilike '%milo%' or description ilike '%grocery%') then 'Grocery Delivery'
  when category::text='Delivery' and (title ilike '%parcel%' or description ilike '%parcel%') then 'Parcel Delivery'
  when category::text='Delivery' and (title ilike '%document%' or description ilike '%document%') then 'Document Delivery'
  when category::text='Delivery' then 'General Delivery'
  when category::text='Moving Help' and (title ilike '%pack%' or description ilike '%pack%') then 'Packing & Unpacking'
  when category::text='Moving Help' and (title ilike '%furniture%' or description ilike '%furniture%') then 'Furniture Moving'
  when category::text='Moving Help' then 'General Moving Help'
  when category::text='Errands' and (title ilike '%queue%' or description ilike '%queue%') then 'Queueing'
  when category::text='Errands' and (title ilike '%document%' or description ilike '%document%') then 'Document Collection'
  when category::text='Errands' then 'General Errands'
  when category::text='Tutoring' and (title ilike '%math%' or description ilike '%math%') then 'Mathematics'
  when category::text='Tutoring' and (title ilike '%science%' or description ilike '%science%') then 'Science'
  when category::text='Tutoring' and (title ilike '%muet%' or title ilike '%english%' or description ilike '%muet%' or description ilike '%english%') then 'English / MUET'
  when category::text='Tutoring' and (title ilike '%ict%' or title ilike '%computer%' or description ilike '%ict%' or description ilike '%computer%') then 'ICT / Computer'
  when category::text='Tutoring' then 'General Tutoring'
  when category::text='Other' and (title ilike '%event%' or description ilike '%event%') then 'Event Setup'
  when category::text='Other' then 'General Assistance'
  else service_type
end
where service_type is null or trim(service_type) = '';

-- Update the edit RPC so service_type is saved when a client edits a pending request.
drop function if exists public.client_update_request(text, text, text, text, date, time, text, numeric, numeric, numeric, text);

create or replace function public.client_update_request(
  p_request_id text,
  p_title text,
  p_category text,
  p_service_type text,
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
  select * into v_request
  from public.service_requests
  where request_id = p_request_id
  for update;

  if not found then raise exception 'Service request not found.'; end if;
  if auth.uid() is null or v_request.client_id <> auth.uid() then raise exception 'You are not allowed to edit this request.'; end if;
  if v_request.status <> 'pending' then raise exception 'Only pending requests can be edited.'; end if;

  if nullif(trim(p_title),'') is null or nullif(trim(p_service_type),'') is null
     or nullif(trim(p_description),'') is null or nullif(trim(p_location),'') is null
     or p_preferred_date is null or p_preferred_time is null
     or p_client_lat is null or p_client_lng is null then
    raise exception 'Please complete all required request fields.';
  end if;

  if p_category not in ('Cleaning','Delivery','Repair','Moving Help','Errands','Tutoring','Other') then
    raise exception 'Invalid service category.';
  end if;

  if not (
    (p_category='Repair' and p_service_type in ('Roofing','Plumbing','Electrical','Appliance Repair','Furniture Repair','General Repair')) or
    (p_category='Cleaning' and p_service_type in ('Home Cleaning','Deep Cleaning','Move-in / Move-out Cleaning','Office Cleaning','Post-event Cleaning','General Cleaning')) or
    (p_category='Delivery' and p_service_type in ('Food Delivery','Grocery Delivery','Parcel Delivery','Document Delivery','General Delivery')) or
    (p_category='Moving Help' and p_service_type in ('Furniture Moving','House Moving','Room Moving','Packing & Unpacking','Loading & Unloading','General Moving Help')) or
    (p_category='Errands' and p_service_type in ('Grocery Shopping','Queueing','Item Pickup','Document Collection','Personal Runner','General Errands')) or
    (p_category='Tutoring' and p_service_type in ('Mathematics','Science','English / MUET','ICT / Computer','General Tutoring')) or
    (p_category='Other' and p_service_type in ('Event Setup','General Assistance','Other Service'))
  ) then
    raise exception 'Invalid service type for selected category.';
  end if;

  if p_priority not in ('normal','urgent') then raise exception 'Invalid request priority.'; end if;
  if p_budget is not null and p_budget < 0 then raise exception 'Budget cannot be negative.'; end if;

  v_category := p_category;
  v_priority := p_priority;

  update public.service_requests
  set title=trim(p_title), category=v_category, service_type=trim(p_service_type),
      description=trim(p_description), preferred_date=p_preferred_date, preferred_time=p_preferred_time,
      location=trim(p_location), client_lat=p_client_lat, client_lng=p_client_lng,
      budget=p_budget, priority=v_priority
  where request_id=p_request_id;
end;
$$;

revoke all on function public.client_update_request(text,text,text,text,text,date,time,text,numeric,numeric,numeric,text) from public;
grant execute on function public.client_update_request(text,text,text,text,text,date,time,text,numeric,numeric,numeric,text) to authenticated;
