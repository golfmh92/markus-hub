import { sb } from '../supabase.js';
import { state } from '../state.js';

export async function loadProfile() {
  const { data } = await sb.from('hub_profiles').select('*').eq('id', state.currentUser.id).single();
  if (data) state.userProfile = data;
}

export async function saveProfile(openaiKey, anthropicKey) {
  await sb.from('hub_profiles').upsert({
    id: state.currentUser.id,
    openai_key: openaiKey || null,
    anthropic_key: anthropicKey || null,
    updated_at: new Date().toISOString(),
  });
  state.userProfile = { ...state.userProfile, openai_key: openaiKey, anthropic_key: anthropicKey };
}
