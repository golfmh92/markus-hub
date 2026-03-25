create table if not exists hub_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table hub_push_subscriptions enable row level security;
create policy "own push select" on hub_push_subscriptions for select using (auth.uid() = user_id);
create policy "own push insert" on hub_push_subscriptions for insert with check (auth.uid() = user_id);
create policy "own push update" on hub_push_subscriptions for update using (auth.uid() = user_id);
create policy "own push delete" on hub_push_subscriptions for delete using (auth.uid() = user_id);
