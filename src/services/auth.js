import { sb } from '../supabase.js';
import { state } from '../state.js';

export async function initSession(onReady) {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    state.currentUser = session.user;
    onReady();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (!state.currentUser && session?.user) {
        state.currentUser = session.user;
        onReady();
      }
    } else if (event === 'SIGNED_OUT') {
      state.currentUser = null;
      location.reload();
    }
  });
}

export async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function register(email, password) {
  const { error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
}

export async function logout() {
  await sb.auth.signOut();
  location.reload();
}
