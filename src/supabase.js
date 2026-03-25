import { createClient } from '@supabase/supabase-js';

const SUPA_URL = import.meta.env.VITE_SUPA_URL;
const SUPA_KEY = import.meta.env.VITE_SUPA_KEY;

export const sb = createClient(SUPA_URL, SUPA_KEY, {
  auth: {
    flowType: 'implicit',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const VAPID_PUBLIC_KEY = 'BK175YA9RJrizyS0Jdwz3bsU35oE1VU_x3KKIPZ5PTe3EXVGCCa7T-quDvQ_NJ-zkcQmGy6ZEOCasQr-8VpoRGg';
