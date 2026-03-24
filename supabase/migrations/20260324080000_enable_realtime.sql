-- Enable realtime for hub tables
alter publication supabase_realtime add table hub_tasks;
alter publication supabase_realtime add table hub_notes;
alter publication supabase_realtime add table hub_projects;
alter publication supabase_realtime add table hub_calendar_events;
