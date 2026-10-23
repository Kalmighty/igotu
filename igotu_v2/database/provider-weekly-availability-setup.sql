-- IGotU Provider Weekly Availability (Malaysia local time, MYT / UTC+08)
-- Run once in Supabase SQL Editor before deploying new JS files.
-- Existing providers are NOT modified. Until they save hours, they continue to
-- appear as available based on their existing is_available flag.

create table if not exists public.provider_weekly_availability (
  provider_id uuid not null references public.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time without time zone not null,
  end_time time without time zone not null,
  primary key (provider_id, day_of_week),
  constraint weekly_availability_valid_range check (start_time < end_time)
);

-- day_of_week: Sunday=0, Monday=1, Tuesday=2, ... Saturday=6.
create index if not exists provider_weekly_availability_day_idx
  on public.provider_weekly_availability (day_of_week, start_time, end_time);

alter table public.provider_weekly_availability enable row level security;

drop policy if exists "Authenticated users can read working hours" on public.provider_weekly_availability;
create policy "Authenticated users can read working hours"
  on public.provider_weekly_availability for select to authenticated
  using (true);

drop policy if exists "Providers can add their working hours" on public.provider_weekly_availability;
create policy "Providers can add their working hours"
  on public.provider_weekly_availability for insert to authenticated
  with check (provider_id = auth.uid());

drop policy if exists "Providers can edit their working hours" on public.provider_weekly_availability;
create policy "Providers can edit their working hours"
  on public.provider_weekly_availability for update to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

drop policy if exists "Providers can delete their working hours" on public.provider_weekly_availability;
create policy "Providers can delete their working hours"
  on public.provider_weekly_availability for delete to authenticated
  using (provider_id = auth.uid());

grant select, insert, update, delete on public.provider_weekly_availability to authenticated;

-- Example ONLY (do not run for a real provider without choosing their UUID):
-- INSERT INTO public.provider_weekly_availability (provider_id, day_of_week, start_time, end_time)
-- VALUES ('PROVIDER_UUID', 1, '08:00', '20:00'), ('PROVIDER_UUID', 4, '08:00', '20:00'),
--        ('PROVIDER_UUID', 0, '11:00', '17:00')
-- ON CONFLICT (provider_id, day_of_week) DO UPDATE
-- SET start_time = excluded.start_time, end_time = excluded.end_time;
