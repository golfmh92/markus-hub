import { sb } from '../supabase.js';
import { state } from '../state.js';

export async function loadProjects() {
  const { data, error } = await sb.from('hub_projects')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false });
  if (error) console.error('[loadProjects]', error);
  state.projects = data || [];
}

export async function saveProject(payload) {
  payload.user_id = state.currentUser.id;
  if (!payload.name) return null;

  if (payload.id) {
    const id = payload.id;
    delete payload.id;
    await sb.from('hub_projects').update(payload).eq('id', id);
    await loadProjects();
    return id;
  } else {
    const { data } = await sb.from('hub_projects').insert(payload).select('id').single();
    await loadProjects();
    return data?.id;
  }
}

export async function archiveProject(id) {
  const p = state.projects.find(p => p.id === id);
  if (!p) return;
  await sb.from('hub_projects').update({ archived: !p.archived }).eq('id', id);
  await loadProjects();
}

export async function loadEntries(projectId) {
  const { data, error } = await sb.from('hub_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('entry_date', { ascending: false });
  if (error) console.error('[loadEntries]', error);
  state.entries = data || [];
}

export async function saveEntry(payload) {
  payload.user_id = state.currentUser.id;
  if (!payload.title) return;

  if (payload.id) {
    const id = payload.id;
    delete payload.id;
    await sb.from('hub_entries').update(payload).eq('id', id);
  } else {
    await sb.from('hub_entries').insert(payload);
  }
}

export async function deleteEntry(id) {
  await sb.from('hub_entries').delete().eq('id', id);
}
