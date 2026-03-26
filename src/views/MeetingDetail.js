import { state } from '../state.js';
import { sb } from '../supabase.js';
import { esc } from '../lib/dom.js';
import { fmtDate, today } from '../lib/date.js';
import { getMeeting, deleteMeeting, startPipeline, setMeetingError, loadMeetings } from '../services/meetings.js';
import { navigate } from '../router.js';
import { icons } from '../lib/icons.js';

let currentMeeting = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let pendingAudioBlob = null;
let pendingAudioDuration = 0;
let pendingAudioExt = 'webm';

export async function renderMeetingDetail(container, { id }) {
  const m = await getMeeting(id);
  if (!m) { navigate('meetings'); return; }
  currentMeeting = m;

  const proj = state.projects.find(p => p.id === m.project_id);
  const dur = m.duration_seconds ? `${Math.floor(m.duration_seconds / 60)} Min ${m.duration_seconds % 60} Sek` : '';

  let audioHTML = '';
  if (m.audio_path) {
    const { data: signedData } = await sb.storage.from('meeting-audio').createSignedUrl(m.audio_path, 3600);
    if (signedData?.signedUrl) {
      audioHTML = `<audio controls style="width:100%;margin-bottom:16px;border-radius:var(--radius-md)" src="${signedData.signedUrl}"></audio>`;
    }
  }

  let mainContent = '';
  if (m.status === 'draft' || m.status === 'new') {
    mainContent = renderAudioCapture();
  } else if (m.status === 'transcribing' || m.status === 'summarizing') {
    const label = m.status === 'transcribing' ? 'Transkribiere Audio...' : 'Erstelle Protokoll...';
    const pct = m.status === 'transcribing' ? 40 : 75;
    mainContent = `
      <div style="text-align:center;padding:32px 0;color:var(--text-secondary)">
        <div class="spinner" style="margin:0 auto 12px"></div>
        <div>${label}</div>
        <div style="height:4px;background:var(--divider);border-radius:2px;margin:12px 0;overflow:hidden">
          <div style="height:100%;background:var(--accent);border-radius:2px;width:${pct}%;transition:width .5s"></div>
        </div>
      </div>`;
    setTimeout(() => renderMeetingDetail(container, { id }), 3000);
  } else if (m.status === 'error') {
    mainContent = `
      <div style="background:var(--red-bg);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">
        <div style="color:var(--red);font-weight:600;margin-bottom:8px">Fehler bei der Verarbeitung</div>
        ${m.error_raw ? `<pre style="font-size:11px;white-space:pre-wrap;margin-top:6px;padding:10px;background:var(--bg-secondary);border-radius:var(--radius);max-height:200px;overflow:auto">${esc(m.error_raw)}</pre>` : '<div style="font-size:var(--text-sm);color:var(--text-secondary)">Kein Fehlerdetail vorhanden</div>'}
        <button class="btn btn-primary" id="retry-btn" style="margin-top:12px">Erneut versuchen</button>
      </div>
      ${audioHTML}`;
  } else if (m.status === 'done') {
    mainContent = renderResults(m, audioHTML);
  }

  container.innerHTML = `
    <div class="page-inner">
      <div class="breadcrumb">
        <a data-back>Meetings</a>
        <span class="breadcrumb-sep">/</span>
        <span>${esc(m.title)}</span>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
        <div>
          <div class="page-title" style="font-size:var(--text-2xl)">${esc(m.title)}</div>
          <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:4px;display:flex;gap:10px;flex-wrap:wrap">
            <span>📅 ${fmtDate(m.meeting_date)}</span>
            ${dur ? `<span>⏱ ${dur}</span>` : ''}
            ${proj ? `<span class="badge" style="background:${proj.color}18;color:${proj.color}">${esc(proj.name)}</span>` : ''}
          </div>
        </div>
        <button class="btn btn-danger" id="delete-meeting-btn">${icons.trash}</button>
      </div>

      ${mainContent}
    </div>
  `;

  bindMeetingDetailEvents(container, m);
}

function renderAudioCapture() {
  return `
    <div style="border:1px solid var(--divider);border-radius:var(--radius-md);padding:24px;text-align:center">
      <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:16px">Audio hinzufügen</div>
      <div style="display:flex;gap:24px;justify-content:center">
        <div style="text-align:center">
          <button class="record-btn" id="record-btn">🎙</button>
          <div id="record-timer" style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:8px">Aufnehmen</div>
        </div>
        <div style="text-align:center">
          <label style="display:inline-flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer">
            <div style="width:64px;height:64px;border-radius:50%;background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;font-size:24px">📁</div>
            <div style="font-size:var(--text-sm);color:var(--text-secondary)">Datei</div>
            <input type="file" accept=".mp3,.m4a,.wav,.mp4,.webm,audio/*" style="display:none" id="audio-file-input">
          </label>
        </div>
      </div>
      <div id="audio-preview" style="margin-top:16px;display:none">
        <audio id="audio-preview-player" controls style="width:100%;border-radius:var(--radius-md)"></audio>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-ghost" style="flex:1" id="discard-audio">Verwerfen</button>
          <button class="btn btn-primary" style="flex:1" id="start-pipeline">Transkribieren & Zusammenfassen</button>
        </div>
      </div>
    </div>`;
}

function renderResults(m, audioHTML) {
  const p = m.protocol || {};
  const participants = (p.participants || []).join(', ') || '–';
  const agenda = (p.agenda || []).map(a => `<li>${esc(a)}</li>`).join('') || '<li>–</li>';
  const decisions = (p.decisions || []).map(d => `<li>${esc(d)}</li>`).join('') || '<li>–</li>';
  const actionItems = (p.action_items || []).map((ai, i) => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--divider)">
      <div style="flex:1;min-width:0">
        <div style="font-size:var(--text-sm)">${esc(ai.text)}</div>
        ${ai.assignee ? `<div style="font-size:var(--text-xs);color:var(--text-secondary)">👤 ${esc(ai.assignee)}</div>` : ''}
        ${ai.due ? `<div style="font-size:var(--text-xs);color:var(--text-secondary)">📅 ${fmtDate(ai.due)}</div>` : ''}
      </div>
    </div>
  `).join('') || '<div style="color:var(--text-tertiary);font-size:var(--text-sm)">Keine Action Items</div>';

  return `
    ${audioHTML}
    ${m.summary ? `<div class="summary-box">${esc(m.summary)}</div>` : ''}
    <div class="protocol-section"><h3>Teilnehmer</h3><div style="font-size:var(--text-sm)">${esc(participants)}</div></div>
    <div class="protocol-section"><h3>Agenda</h3><ul style="padding-left:16px;font-size:var(--text-sm)">${agenda}</ul></div>
    <div class="protocol-section"><h3>Beschlüsse</h3><ul style="padding-left:16px;font-size:var(--text-sm)">${decisions}</ul></div>
    <div class="protocol-section"><h3>Action Items</h3>${actionItems}</div>
    ${m.transcript ? `
      <details style="margin-top:16px">
        <summary style="cursor:pointer;font-size:var(--text-sm);color:var(--text-secondary);padding:8px 0">Transkript anzeigen</summary>
        <div style="font-size:var(--text-sm);line-height:1.7;color:var(--text-secondary);white-space:pre-wrap">${esc(m.transcript)}</div>
      </details>
    ` : ''}
  `;
}

function bindMeetingDetailEvents(container, m) {
  container.querySelector('[data-back]')?.addEventListener('click', () => navigate('meetings'));

  container.querySelector('#delete-meeting-btn')?.addEventListener('click', async () => {
    await deleteMeeting(m.id);
    navigate('meetings');
  });

  // Recording
  container.querySelector('#record-btn')?.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording(container);
    } else {
      await startRecording(container);
    }
  });

  // File upload
  container.querySelector('#audio-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { alert('Max 25 MB'); return; }
    pendingAudioExt = file.name.split('.').pop().toLowerCase() || 'mp3';
    pendingAudioBlob = file;
    const tempAudio = document.createElement('audio');
    tempAudio.preload = 'metadata';
    const url = URL.createObjectURL(file);
    tempAudio.src = url;
    tempAudio.onloadedmetadata = () => {
      pendingAudioDuration = Math.round(tempAudio.duration) || 0;
      URL.revokeObjectURL(url);
    };
    showAudioPreview(container, file);
  });

  container.querySelector('#discard-audio')?.addEventListener('click', () => {
    pendingAudioBlob = null;
    pendingAudioDuration = 0;
    const preview = container.querySelector('#audio-preview');
    if (preview) preview.style.display = 'none';
    container.querySelector('#audio-preview-player').src = '';
  });

  container.querySelector('#start-pipeline')?.addEventListener('click', async () => {
    if (!pendingAudioBlob) return;
    try {
      const blob = pendingAudioBlob;
      const dur = pendingAudioDuration;
      const ext = pendingAudioExt;
      pendingAudioBlob = null;
      await startPipeline(m.id, blob, dur, ext);
    } catch (e) {
      console.error('[start-pipeline]', e);
      await setMeetingError(m.id, 'Start-Fehler: ' + (e.message || String(e)));
    }
    renderMeetingDetail(container, { id: m.id });
  });

  container.querySelector('#retry-btn')?.addEventListener('click', async () => {
    try {
      if (!m.audio_path) {
        await setMeetingError(m.id, 'Kein Audio-Pfad vorhanden');
        renderMeetingDetail(container, { id: m.id });
        return;
      }
      const { data: fileData, error: dlError } = await sb.storage.from('meeting-audio').download(m.audio_path);
      if (dlError || !fileData) {
        await setMeetingError(m.id, 'Audio Download fehlgeschlagen: ' + (dlError?.message || 'Datei nicht gefunden'));
        renderMeetingDetail(container, { id: m.id });
        return;
      }
      await startPipeline(m.id, fileData, m.duration_seconds || 0, m.audio_path.split('.').pop());
    } catch (e) {
      console.error('[retry]', e);
      await setMeetingError(m.id, 'Retry-Fehler: ' + (e.message || String(e)));
    }
    renderMeetingDetail(container, { id: m.id });
  });
}

async function startRecording(container) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    recordingSeconds = 0;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    pendingAudioExt = mimeType === 'audio/webm' ? 'webm' : 'mp4';
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordedChunks, { type: mimeType });
      pendingAudioBlob = blob;
      pendingAudioDuration = recordingSeconds;
      showAudioPreview(container, blob);
    };
    mediaRecorder.start(1000);
    const btn = container.querySelector('#record-btn');
    if (btn) { btn.classList.add('recording'); btn.textContent = '⏹'; }
    recordingTimer = setInterval(() => {
      recordingSeconds++;
      const mm = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
      const ss = (recordingSeconds % 60).toString().padStart(2, '0');
      const timer = container.querySelector('#record-timer');
      if (timer) timer.textContent = `${mm}:${ss}`;
    }, 1000);
  } catch {
    alert('Mikrofonzugriff verweigert');
  }
}

function stopRecording(container) {
  if (mediaRecorder) mediaRecorder.stop();
  clearInterval(recordingTimer);
  const btn = container.querySelector('#record-btn');
  if (btn) { btn.classList.remove('recording'); btn.textContent = '🎙'; }
  const timer = container.querySelector('#record-timer');
  if (timer) timer.textContent = 'Aufnehmen';
}

function showAudioPreview(container, blob) {
  const url = URL.createObjectURL(blob);
  const player = container.querySelector('#audio-preview-player');
  if (player) player.src = url;
  const preview = container.querySelector('#audio-preview');
  if (preview) preview.style.display = 'block';
}
