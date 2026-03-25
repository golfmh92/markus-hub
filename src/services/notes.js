import { sb } from '../supabase.js';
import { state } from '../state.js';

export async function loadNotes() {
  const { data, error } = await sb.from('hub_notes')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false });
  if (error) console.error('[loadNotes]', error);
  state.notes = data || [];
}

export async function saveNote(payload) {
  payload.user_id = state.currentUser.id;
  payload.updated_at = new Date().toISOString();
  if (!payload.content) return;

  if (payload.id) {
    const id = payload.id;
    delete payload.id;
    await sb.from('hub_notes').update(payload).eq('id', id);
  } else {
    await sb.from('hub_notes').insert(payload);
  }
  await loadNotes();
}

export async function deleteNote(id) {
  await sb.from('hub_notes').delete().eq('id', id);
  await loadNotes();
}

export async function quickAddNote(content) {
  if (!content) return;
  await sb.from('hub_notes').insert({
    content,
    user_id: state.currentUser.id,
  });
  await loadNotes();
}

export async function toggleNoteCheck(noteId, checkIndex, checked) {
  const n = state.notes.find(n => n.id === noteId);
  if (!n) return;
  const lines = n.content.split('\n');
  const checkItems = lines.filter(l => /^\[[ x]\]\s/.test(l));
  if (checkIndex >= 0 && checkIndex < checkItems.length) {
    const lineIdx = lines.indexOf(checkItems[checkIndex]);
    if (lineIdx >= 0) {
      lines[lineIdx] = (checked ? '[x] ' : '[ ] ') + lines[lineIdx].replace(/^\[[ x]\]\s/, '');
      n.content = lines.join('\n');
      state.notes = [...state.notes];
      await sb.from('hub_notes').update({
        content: n.content,
        updated_at: new Date().toISOString(),
      }).eq('id', noteId);
    }
  }
}
