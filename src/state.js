// Simple reactive store with subscriber pattern
const listeners = new Set();

const raw = {
  // Auth
  currentUser: null,
  userProfile: { openai_key: '', anthropic_key: '' },

  // Data
  tasks: [],
  projects: [],
  entries: [],
  notes: [],
  meetings: [],
  calendarEvents: [],

  // Categories (localStorage)
  categories: [],

  // UI
  currentView: 'today',
  currentParams: {},     // e.g. { id: 'abc' }
};

export const state = new Proxy(raw, {
  set(target, prop, value) {
    target[prop] = value;
    notify();
    return true;
  },
});

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch (e) { console.error('[state listener]', e); }
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Default categories
export const DEFAULT_CATEGORIES = [
  { name: 'Business', color: '#0055D4' },
  { name: 'Persönlich', color: '#00C853' },
  { name: 'Golf', color: '#FFB300' },
  { name: 'Strokes App', color: '#FF5252' },
  { name: 'EM', color: '#7c5cff' },
  { name: 'E-Mail', color: '#00BCD4' },
];

export const PROJECT_ICONS = ['📁','📋','🏌️','💼','🎯','🚀','💡','🏆','🎨','📊','🔧','📱','🌍','🎓','❤️','⭐','🏠','✈️','🎵','📸'];
export const PROJECT_COLORS = ['#0055D4','#00C853','#FFB300','#FF5252','#7c5cff','#00BCD4','#FF6D00','#E91E63','#8BC34A','#795548'];
