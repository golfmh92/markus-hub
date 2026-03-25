import { sb } from '../supabase.js';
import { state } from '../state.js';

export async function loadMeetings() {
  const { data, error } = await sb.from('hub_meetings')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .neq('status', 'draft')
    .order('meeting_date', { ascending: false });
  if (error) console.error('[loadMeetings]', error);
  state.meetings = data || [];
  // Cleanup old drafts
  const cutoff = new Date(Date.now() - 3600000).toISOString();
  await sb.from('hub_meetings').delete()
    .eq('user_id', state.currentUser.id)
    .eq('status', 'draft')
    .lt('created_at', cutoff);
}

export async function createMeeting(title, date, projectId) {
  const { data, error } = await sb.from('hub_meetings').insert({
    title,
    meeting_date: date,
    project_id: projectId || null,
    status: 'draft',
    user_id: state.currentUser.id,
  }).select('id').single();
  if (error) throw error;
  return data?.id;
}

export async function deleteMeeting(id) {
  const m = state.meetings.find(m => m.id === id);
  if (m?.audio_path) {
    await sb.storage.from('meeting-audio').remove([m.audio_path]);
  }
  await sb.from('hub_meetings').delete().eq('id', id);
  await loadMeetings();
}

export async function getMeeting(id) {
  const { data } = await sb.from('hub_meetings').select('*').eq('id', id).single();
  return data;
}

export async function updateMeetingStatus(id, status, extra = {}) {
  await sb.from('hub_meetings').update({
    ...extra,
    status,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}

export async function setMeetingError(id, msg, rawResponse = null) {
  console.error('[pipeline error]', msg);
  await sb.from('hub_meetings').update({
    status: 'error',
    error_raw: rawResponse || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}

export async function transcribeAudio(blob, ext, meetingId) {
  try {
    const formData = new FormData();
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'de');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.userProfile.openai_key}` },
      body: formData,
    });
    if (!res.ok) {
      await setMeetingError(meetingId, await res.text());
      return null;
    }
    const data = await res.json();
    return data.text || '';
  } catch (e) {
    await setMeetingError(meetingId, e.message);
    return null;
  }
}

export async function summarizeWithClaude(transcript, meetingId) {
  const prompt = `Du bist ein Assistent der Meeting-Protokolle erstellt.
Analysiere das folgende Transkript und antworte NUR mit validem JSON (kein Markdown, keine Erklärung).

Format:
{
  "summary": "2-3 Sätze Zusammenfassung",
  "participants": ["Name"],
  "agenda": ["Thema"],
  "decisions": ["Beschluss"],
  "action_items": [{ "text": "Aufgabe", "assignee": "Person oder null", "due": "YYYY-MM-DD oder null" }]
}

Transkript:
${transcript}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': state.userProfile.anthropic_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      await setMeetingError(meetingId, await res.text());
      return null;
    }
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    try {
      return JSON.parse(text);
    } catch {
      await setMeetingError(meetingId, 'Claude returned invalid JSON', text);
      return null;
    }
  } catch (e) {
    await setMeetingError(meetingId, e.message);
    return null;
  }
}

export async function startPipeline(meetingId, audioBlob, duration, ext) {
  const userId = state.currentUser.id;
  const audioPath = `${userId}/${meetingId}.${ext}`;

  // Upload
  const { error: uploadError } = await sb.storage.from('meeting-audio').upload(audioPath, audioBlob, {
    contentType: audioBlob.type || `audio/${ext}`,
    upsert: true,
  });
  if (uploadError) {
    await setMeetingError(meetingId, uploadError.message);
    return;
  }

  await updateMeetingStatus(meetingId, 'transcribing', {
    audio_path: audioPath,
    duration_seconds: duration || null,
  });

  // Transcribe
  const transcript = await transcribeAudio(audioBlob, ext, meetingId);
  if (!transcript) return;

  await updateMeetingStatus(meetingId, 'summarizing', { transcript });

  // Summarize
  const result = await summarizeWithClaude(transcript, meetingId);
  if (!result) return;

  await updateMeetingStatus(meetingId, 'done', {
    summary: result.summary,
    protocol: result,
  });
  await loadMeetings();
}
