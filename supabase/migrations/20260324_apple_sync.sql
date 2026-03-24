-- =============================================================================
-- Migration: Apple Calendar & Reminders Sync
-- Run in Supabase SQL Editor
-- =============================================================================

-- 1. Calendar events table (read-only sync from Apple)
create table if not exists hub_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  apple_uid text not null,
  apple_etag text,
  calendar_name text,
  title text not null,
  description text,
  location text,
  start_at text not null,
  end_at text not null,
  all_day boolean default false,
  last_synced_at timestamptz default now(),
  unique(user_id, apple_uid)
);

alter table hub_calendar_events enable row level security;
create policy "own cal events select" on hub_calendar_events for select using (auth.uid() = user_id);
create policy "own cal events insert" on hub_calendar_events for insert with check (auth.uid() = user_id);
create policy "own cal events update" on hub_calendar_events for update using (auth.uid() = user_id);
create policy "own cal events delete" on hub_calendar_events for delete using (auth.uid() = user_id);

create index idx_cal_events_user_date on hub_calendar_events(user_id, start_at);

-- 2. Add source tracking to hub_tasks (for Reminders sync)
alter table hub_tasks add column if not exists source text default 'manual';
alter table hub_tasks add column if not exists external_id text;

create index if not exists idx_tasks_external_id on hub_tasks(external_id) where external_id is not null;
