import { sb } from '../supabase.js';
import { state } from '../state.js';

export async function loadCalendarEvents() {
  const { data, error } = await sb.from('hub_calendar_events')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('start_at', { ascending: true });
  if (error) console.error('[loadCalendarEvents]', error);
  state.calendarEvents = data || [];
}

export const CAL_COLORS = {
  'Privat': '#2961A5',
  'Arbeit': '#51B2D2',
  'Events (Arbeit Markus)': '#4E7A27',
  'Turniere': '#054C1C',
  '👫🏼': '#FF9500',
  'Büro (Sandra)': '#FFCC00',
  'Liverpool': '#FF2968',
  'Formula 1': '#FF2968',
  'BGZ': '#CC73E1',
  'Österreichische Feiertage': '#B1DD8B',
  'Teamtrainings': '#49A375',
};
