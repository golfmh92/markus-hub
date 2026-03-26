import { sb } from '../supabase.js';
import { state } from '../state.js';
import { loadTasks } from './tasks.js';
import { loadNotes } from './notes.js';
import { loadProjects } from './projects.js';
import { loadCalendarEvents } from './calendar.js';

let channel = null;
let retryCount = 0;
const MAX_RETRIES = 3;

export function initRealtime(onUpdate) {
  try {
    if (channel) {
      channel.unsubscribe();
      channel = null;
    }

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
        if (status === 'SUBSCRIBED') {
          retryCount = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          channel?.unsubscribe();
          channel = null;
          // Retry a few times, then give up silently
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            setTimeout(() => initRealtime(onUpdate), 5000 * retryCount);
          }
        }
      });
  } catch (e) {
    // Realtime is optional
    console.warn('[realtime] Init failed:', e.message);
  }
}
