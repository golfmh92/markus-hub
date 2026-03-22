-- =============================================================================
-- Markus Hub - Database Schema
-- Run this in the Supabase SQL Editor to set up all tables
-- =============================================================================

-- 1. Projects (must be created first, referenced by other tables)
create table hub_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  category text not null default 'Persönlich',
  color text default '#0055D4',
  icon text default '📁',
  archived boolean default false,
  created_at timestamptz default now()
);

-- 2. Tasks
create table hub_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  category text not null default 'Persönlich',
  priority text default 'normal',       -- low, normal, high
  due_date date,
  done boolean default false,
  done_at timestamptz,
  project_id uuid references hub_projects(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Project Entries (timeline items)
create table hub_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references hub_projects(id) on delete cascade not null,
  title text not null,
  content text,
  entry_type text default 'note',        -- note, decision, price, contact, todo
  entry_date date default current_date,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- 4. Quick Notes
create table hub_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  category text,
  project_id uuid references hub_projects(id) on delete set null,
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table hub_projects enable row level security;
alter table hub_tasks    enable row level security;
alter table hub_entries  enable row level security;
alter table hub_notes    enable row level security;

-- Projects
create policy "Users can view own projects"
  on hub_projects for select using (auth.uid() = user_id);
create policy "Users can insert own projects"
  on hub_projects for insert with check (auth.uid() = user_id);
create policy "Users can update own projects"
  on hub_projects for update using (auth.uid() = user_id);
create policy "Users can delete own projects"
  on hub_projects for delete using (auth.uid() = user_id);

-- Tasks
create policy "Users can view own tasks"
  on hub_tasks for select using (auth.uid() = user_id);
create policy "Users can insert own tasks"
  on hub_tasks for insert with check (auth.uid() = user_id);
create policy "Users can update own tasks"
  on hub_tasks for update using (auth.uid() = user_id);
create policy "Users can delete own tasks"
  on hub_tasks for delete using (auth.uid() = user_id);

-- Entries
create policy "Users can view own entries"
  on hub_entries for select using (auth.uid() = user_id);
create policy "Users can insert own entries"
  on hub_entries for insert with check (auth.uid() = user_id);
create policy "Users can update own entries"
  on hub_entries for update using (auth.uid() = user_id);
create policy "Users can delete own entries"
  on hub_entries for delete using (auth.uid() = user_id);

-- Notes
create policy "Users can view own notes"
  on hub_notes for select using (auth.uid() = user_id);
create policy "Users can insert own notes"
  on hub_notes for insert with check (auth.uid() = user_id);
create policy "Users can update own notes"
  on hub_notes for update using (auth.uid() = user_id);
create policy "Users can delete own notes"
  on hub_notes for delete using (auth.uid() = user_id);

-- =============================================================================
-- Indexes for performance
-- =============================================================================

create index idx_tasks_user_id    on hub_tasks(user_id);
create index idx_tasks_due_date   on hub_tasks(user_id, due_date) where done = false;
create index idx_tasks_done       on hub_tasks(user_id, done);
create index idx_tasks_category   on hub_tasks(user_id, category);
create index idx_tasks_project    on hub_tasks(project_id) where project_id is not null;

create index idx_projects_user_id on hub_projects(user_id);
create index idx_projects_active  on hub_projects(user_id) where archived = false;

create index idx_entries_project  on hub_entries(project_id);
create index idx_entries_user_id  on hub_entries(user_id);
create index idx_entries_date     on hub_entries(entry_date);

create index idx_notes_user_id   on hub_notes(user_id);
create index idx_notes_pinned    on hub_notes(user_id, pinned) where pinned = true;
create index idx_notes_project   on hub_notes(project_id) where project_id is not null;
