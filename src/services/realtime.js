import { sb } from '../supabase.js';
import { state } from '../state.js';
import { loadTasks } from './tasks.js';
import { loadNotes } from './notes.js';
import { loadProjects } from './projects.js';
import { loadCalendarEvents } from './calendar.js';

let channel = null;

export function initRealtime(onUpdate) {
  try {
    if (channel) channel.unsubscribe();

    channel = sb.channel('loom-changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'hub_tasks',
        filter: `user_id=eq.${state.currentUser.id}`,
      }, async () => { await loadTasks(); onUpdate(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'hub_notes',
        filter: `user_id=eq.${state.currentUser.id}`,
      }, async () => { await loadNotes(); onUpdate(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'hub_projects',
        filter: `user_id=eq.${state.currentUser.id}`,
      }, async () => { await loadProjects(); onUpdate(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'hub_calendar_events',
        filter: `user_id=eq.${state.currentUser.id}`,
      }, async () => { await loadCalendarEvents(); onUpdate(); })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          // Silently stop retrying — realtime is optional
          channel?.unsubscribe();
          channel = null;
        }
      });
  } catch (e) {
    // Realtime is optional, don't crash the app
    console.warn('[realtime] Could not connect:', e.message);
  }
}
