-- IGotU Request Image Setup
-- Run this in Supabase SQL Editor before testing request image upload.
-- Adds optional request image support for service requests.

alter table if exists public.service_requests
add column if not exists request_image_url text;

alter table if exists public.service_requests
add column if not exists request_image_path text;

alter table if exists public.service_requests
add column if not exists request_image_uploaded_at timestamptz;

insert into storage.buckets (id, name, public)
values ('request-images', 'request-images', true)
on conflict (id) do update set public = true;

create or replace function public.client_save_request_image(
  p_request_id text,
  p_request_image_url text,
  p_request_image_path text
)
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
    raise exception 'You are not allowed to update this request image.';
  end if;

  update public.service_requests
  set
    request_image_url = p_request_image_url,
    request_image_path = p_request_image_path,
    request_image_uploaded_at = now()
  where request_id = p_request_id;
end;
$$;

revoke all on function public.client_save_request_image(text, text, text) from public;
grant execute on function public.client_save_request_image(text, text, text) to authenticated;

drop policy if exists "Authenticated users can upload request images" on storage.objects;
create policy "Authenticated users can upload request images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'request-images');

drop policy if exists "Authenticated users can view request images" on storage.objects;
create policy "Authenticated users can view request images"
on storage.objects
for select
to authenticated
using (bucket_id = 'request-images');

drop policy if exists "Authenticated users can update own request images" on storage.objects;
create policy "Authenticated users can update own request images"
on storage.objects
for update
to authenticated
using (bucket_id = 'request-images' and owner = auth.uid())
with check (bucket_id = 'request-images' and owner = auth.uid());
