import { state } from '../state.js';
import { sb } from '../supabase.js';
import { esc } from '../lib/dom.js';
import { fmtDate, today } from '../lib/date.js';
import { getMeeting, deleteMeeting, startPipeline, setMeetingError, loadMeetings } from '../services/meetings.js';
import { navigate } from '../router.js';
import { icons } from '../lib/icons.js';
import { toastSuccess } from '../components/Toast.js';

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
  const durMin = m.duration_seconds ? Math.floor(m.duration_seconds / 60) : 0;
  const durSec = m.duration_seconds ? m.duration_seconds % 60 : 0;

  let audioHTML = '';
  if (m.audio_path) {
    const { data: signedData } = await sb.storage.from('meeting-audio').createSignedUrl(m.audio_path, 3600);
    if (signedData?.signedUrl) {
      audioHTML = `
        <div class="meeting-audio-card">
          <div class="meeting-audio-icon">🎧</div>
          <audio controls src="${signedData.signedUrl}" style="flex:1;height:36px"></audio>
        </div>`;
    }
  }

  let mainContent = '';
  if (m.status === 'draft' || m.status === 'new') {
    mainContent = renderAudioCapture();
  } else if (m.status === 'transcribing' || m.status === 'summarizing') {
    const label = m.status === 'transcribing' ? 'Audio wird transkribiert...' : 'Protokoll wird erstellt...';
    const pct = m.status === 'transcribing' ? 40 : 75;
    mainContent = `
      <div class="meeting-processing">
        <div class="meeting-processing-icon">${m.status === 'transcribing' ? '🎙' : '✨'}</div>
        <div class="meeting-processing-label">${label}</div>
        <div class="progress-bar" style="max-width:300px;margin:0 auto">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
    setTimeout(() => renderMeetingDetail(container, { id }), 3000);
  } else if (m.status === 'error') {
    mainContent = `
      <div class="meeting-error">
        <div style="font-size:20px;margin-bottom:8px">⚠️</div>
        <div style="font-weight:600;margin-bottom:4px">Verarbeitung fehlgeschlagen</div>
        ${m.error_raw ? `<pre class="meeting-error-detail">${esc(m.error_raw)}</pre>` : ''}
        <button class="btn btn-primary" id="retry-btn" style="margin-top:16px">Erneut versuchen</button>
      </div>
      ${audioHTML}`;
  } else if (m.status === 'done') {
    mainContent = renderResults(m, audioHTML);
  }

  container.innerHTML = `
    <div class="page-inner">
      <div class="breadcrumb" style="margin-bottom:24px">
        <a data-back>← Meetings</a>
      </div>

      <!-- Hero Header -->
      <div class="meeting-hero">
        <div class="meeting-hero-icon">🎙</div>
        <div class="meeting-hero-body">
          <h1 class="meeting-hero-title">${esc(m.title)}</h1>
          <div class="meeting-hero-meta">
            <span>📅 ${fmtDate(m.meeting_date)}</span>
            ${m.duration_seconds ? `<span>⏱ ${durMin}:${String(durSec).padStart(2, '0')}</span>` : ''}
            ${proj ? `<span class="badge" style="background:${proj.color}15;color:${proj.color}">${esc(proj.name)}</span>` : ''}
          </div>
        </div>
        <button class="btn btn-ghost" id="delete-meeting-btn" style="align-self:start">${icons.trash}</button>
      </div>

      ${mainContent}
    </div>
  `;

  bindMeetingDetailEvents(container, m);
}

function renderAudioCapture() {
  return `
    <div class="meeting-capture">
      <div class="meeting-capture-title">Audio aufnehmen oder hochladen</div>
      <div class="meeting-capture-options">
        <div class="meeting-capture-option">
          <button class="meeting-record-btn" id="record-btn">
            <span class="meeting-record-btn-inner">🎙</span>
          </button>
          <div id="record-timer" class="meeting-capture-label">Aufnehmen</div>
        </div>
        <div class="meeting-capture-divider"></div>
        <div class="meeting-capture-option">
          <label class="meeting-upload-btn">
            <span class="meeting-upload-btn-inner">📁</span>
            <input type="file" accept=".mp3,.m4a,.wav,.mp4,.webm,audio/*" style="display:none" id="audio-file-input">
          </label>
          <div class="meeting-capture-label">Datei wählen</div>
        </div>
      </div>
      <div id="audio-preview" class="meeting-audio-preview" style="display:none">
        <audio id="audio-preview-player" controls style="width:100%"></audio>
        <div class="meeting-audio-preview-actions">
          <button class="btn btn-ghost" id="discard-audio">Verwerfen</button>
          <button class="btn btn-primary" id="start-pipeline">✨ Transkribieren & Zusammenfassen</button>
        </div>
      </div>
    </div>`;
}

function renderResults(m, audioHTML) {
  const p = m.protocol || {};
  const participants = p.participants || [];
  const agenda = p.agenda || [];
  const decisions = p.decisions || [];
  const actionItems = p.action_items || [];

  return `
    <!-- Summary -->
    ${m.summary ? `
      <div class="meeting-summary">
        <div class="meeting-summary-label">Zusammenfassung</div>
        <div class="meeting-summary-text">${esc(m.summary)}</div>
      </div>
    ` : ''}

    <!-- Audio Player -->
    ${audioHTML}

    <!-- Protocol Grid -->
    <div class="meeting-protocol-grid">
      ${participants.length ? `
        <div class="meeting-protocol-card">
          <div class="meeting-protocol-card-icon">👥</div>
          <div class="meeting-protocol-card-title">Teilnehmer</div>
          <div class="meeting-protocol-card-content">
            ${participants.map(p => `<div class="meeting-participant">${esc(p)}</div>`).join('')}
          </div>
        </div>
      ` : ''}

      ${agenda.length ? `
        <div class="meeting-protocol-card">
          <div class="meeting-protocol-card-icon">📋</div>
          <div class="meeting-protocol-card-title">Agenda</div>
          <div class="meeting-protocol-card-content">
            ${agenda.map(a => `<div class="meeting-agenda-item">• ${esc(a)}</div>`).join('')}
          </div>
        </div>
      ` : ''}

      ${decisions.length && decisions[0] !== '–' ? `
        <div class="meeting-protocol-card">
          <div class="meeting-protocol-card-icon">⚡</div>
          <div class="meeting-protocol-card-title">Beschlüsse</div>
          <div class="meeting-protocol-card-content">
            ${decisions.map(d => `<div class="meeting-decision-item">✓ ${esc(d)}</div>`).join('')}
          </div>
        </div>
      ` : ''}

      ${actionItems.length ? `
        <div class="meeting-protocol-card meeting-protocol-card-full">
          <div class="meeting-protocol-card-icon">🎯</div>
          <div class="meeting-protocol-card-title">Action Items</div>
          <div class="meeting-protocol-card-content">
            ${actionItems.map((ai, i) => `
              <div class="meeting-action-item">
                <div class="meeting-action-item-check"></div>
                <div class="meeting-action-item-body">
                  <div class="meeting-action-item-text">${esc(ai.text)}</div>
                  <div class="meeting-action-item-meta">
                    ${ai.assignee ? `<span>👤 ${esc(ai.assignee)}</span>` : ''}
                    ${ai.due ? `<span>📅 ${fmtDate(ai.due)}</span>` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    <!-- Transcript -->
    ${m.transcript ? `
      <div class="meeting-transcript">
        <details>
          <summary class="meeting-transcript-toggle">
            <span>📝 Vollständiges Transkript</span>
            <span style="font-size:var(--text-xs);color:var(--text-tertiary)">Klicken zum Aufklappen</span>
          </summary>
          <div class="meeting-transcript-text">${esc(m.transcript)}</div>
        </details>
      </div>
    ` : ''}
  `;
}

function bindMeetingDetailEvents(container, m) {
  container.querySelector('[data-back]')?.addEventListener('click', () => navigate('meetings'));

  container.querySelector('#delete-meeting-btn')?.addEventListener('click', async () => {
    await deleteMeeting(m.id);
    toastSuccess('Meeting gelöscht');
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
    if (btn) { btn.classList.add('recording'); }
    const inner = btn?.querySelector('.meeting-record-btn-inner');
    if (inner) inner.textContent = '⏹';
    recordingTimer = setInterval(() => {
      recordingSeconds++;
      const mm = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
      const ss = (recordingSeconds % 60).toString().padStart(2, '0');
      const timer = container.querySelector('#record-timer');
      if (timer) timer.textContent = `${mm}:${ss}`;
    }, 1000);
  } catch {
    toastSuccess('Mikrofonzugriff verweigert');
  }
}

function stopRecording(container) {
  if (mediaRecorder) mediaRecorder.stop();
  clearInterval(recordingTimer);
  const btn = container.querySelector('#record-btn');
  if (btn) btn.classList.remove('recording');
  const inner = btn?.querySelector('.meeting-record-btn-inner');
  if (inner) inner.textContent = '🎙';
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
