import { sb } from '../supabase.js';
import { state } from '../state.js';
import { today } from '../lib/date.js';

export async function loadTasks() {
  const { data, error } = await sb.from('hub_tasks')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false });
  if (error) console.error('[loadTasks]', error);
  state.tasks = data || [];
}

export async function saveTask(payload) {
  payload.user_id = state.currentUser.id;
  payload.updated_at = new Date().toISOString();
  if (!payload.title) return;

  if (payload.id) {
    const id = payload.id;
    delete payload.id;
    await sb.from('hub_tasks').update(payload).eq('id', id);
  } else {
    await sb.from('hub_tasks').insert(payload);
  }
  await loadTasks();
}

export async function deleteTask(id) {
  await sb.from('hub_tasks').delete().eq('id', id);
  await loadTasks();
}

export async function toggleTask(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  const done = !t.done;
  const done_at = done ? new Date().toISOString() : null;
  // Optimistic update
  t.done = done;
  t.done_at = done_at;
  state.tasks = [...state.tasks];
  await sb.from('hub_tasks').update({ done, done_at, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function quickAddTask(title) {
  if (!title) return;
  await sb.from('hub_tasks').insert({
    title,
    category: state.categories[0]?.name || 'Persönlich',
    priority: 'normal',
    due_date: today(),
    user_id: state.currentUser.id,
  });
  await loadTasks();
}
