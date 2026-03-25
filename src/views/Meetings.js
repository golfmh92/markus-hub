import { state } from '../state.js';
import { sb } from '../supabase.js';
import { esc } from '../lib/dom.js';
import { fmtDate, today } from '../lib/date.js';
import { createMeeting, deleteMeeting, getMeeting, startPipeline, setMeetingError, loadMeetings } from '../services/meetings.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from '../components/Modal.js';

export function renderMeetings(container) {
  const projFilter = container.querySelector('#meeting-proj-filter')?.value || 'all';

  let filtered = [...state.meetings];
  if (projFilter !== 'all') filtered = filtered.filter(m => m.project_id === projFilter);

  container.innerHTML = `
    <div class="page-inner">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div class="page-title">Meetings</div>
        <button class="btn btn-primary" id="new-meeting-btn">+ Neues Meeting</button>
      </div>

      <div style="margin-bottom:16px">
        <select id="meeting-proj-filter" class="input" style="max-width:200px">
          <option value="all">Alle Projekte</option>
          ${state.projects.filter(p => !p.archived).map(p =>
            `<option value="${p.id}" ${projFilter === p.id ? 'selected' : ''}>${esc(p.name)}</option>`
          ).join('')}
        </select>
      </div>

      <div id="meetings-list">
        ${filtered.length
          ? filtered.map(m => meetingCardHTML(m)).join('')
          : '<div class="empty-state"><div class="empty-state-icon">🎙</div><h3>Noch keine Meetings</h3><p>Tippe auf "+ Neues Meeting" um loszulegen</p></div>'}
      </div>
    </div>

    ${meetingModalHTML()}
  `;

  bindMeetingsEvents(container);
}

function meetingCardHTML(m) {
  const proj = state.projects.find(p => p.id === m.project_id);
  const dur = m.duration_seconds ? `${Math.floor(m.duration_seconds / 60)} Min` : '';
  const statusBadge = {
    transcribing: '<span style="color:var(--orange);font-size:12px">⏳ Transkribiere...</span>',
    summarizing: '<span style="color:var(--orange);font-size:12px">⏳ Protokoll...</span>',
    error: '<span style="color:var(--red);font-size:12px">⚠ Fehler</span>',
    new: '<span style="color:var(--text-tertiary);font-size:12px">Kein Audio</span>',
  }[m.status] || '';

  return `
    <div class="meeting-card" data-meeting="${m.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.title)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <span>📅 ${fmtDate(m.meeting_date)}</span>
            ${dur ? `<span>⏱ ${dur}</span>` : ''}
            ${proj ? `<span class="badge" style="background:${proj.color}18;color:${proj.color}">${esc(proj.name)}</span>` : ''}
            ${statusBadge}
          </div>
        </div>
      </div>
      ${m.summary ? `<div style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:10px;line-height:1.5;border-top:1px solid var(--divider);padding-top:10px">${esc(m.summary)}</div>` : ''}
    </div>`;
}

function meetingModalHTML() {
  return `
    <div class="modal-overlay" id="meeting-modal">
      <div class="modal">
        <h2>Neues Meeting</h2>
        <div class="form-group">
          <label>Titel</label>
          <input id="mm-title" class="input" placeholder="Worum ging es?">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Datum</label>
            <input id="mm-date" class="input" type="date">
          </div>
          <div class="form-group">
            <label>Projekt</label>
            <select id="mm-project" class="input">
              <option value="">– Kein Projekt –</option>
              ${state.projects.filter(p => !p.archived).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="mm-cancel">Abbrechen</button>
          <button class="btn btn-primary" id="mm-save">Weiter</button>
        </div>
      </div>
    </div>`;
}

function bindMeetingsEvents(container) {
  container.querySelector('#new-meeting-btn')?.addEventListener('click', () => {
    container.querySelector('#mm-title').value = '';
    container.querySelector('#mm-date').value = today();
    openModal('meeting-modal');
  });

  container.querySelector('#meeting-proj-filter')?.addEventListener('change', () => {
    renderMeetings(container);
  });

  container.querySelector('#mm-save')?.addEventListener('click', async () => {
    const title = container.querySelector('#mm-title').value.trim();
    if (!title) return;
    const id = await createMeeting(title, container.querySelector('#mm-date').value, container.querySelector('#mm-project').value);
    closeModal('meeting-modal');
    navigate(`meetings/${id}`);
  });
  container.querySelector('#mm-cancel')?.addEventListener('click', () => closeModal('meeting-modal'));

  container.querySelectorAll('[data-meeting]').forEach(el => {
    el.addEventListener('click', () => navigate(`meetings/${el.dataset.meeting}`));
  });
}
