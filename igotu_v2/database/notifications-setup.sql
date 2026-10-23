-- IGotU Notifications Setup

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

alter table if exists notifications enable row level security;

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
