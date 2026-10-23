-- IGotU Payment Proof Setup
-- Main code column names: proof_url, proof_path, proof_uploaded_at

alter table if exists payment_records
add column if not exists proof_url text;

alter table if exists payment_records
add column if not exists proof_path text;

alter table if exists payment_records
add column if not exists proof_uploaded_at timestamptz;

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', true)
on conflict (id) do update set public = true;

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
