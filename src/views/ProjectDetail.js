import { state } from '../state.js';
import { esc } from '../lib/dom.js';
import { fmtDate, today } from '../lib/date.js';
import { catColor } from '../services/categories.js';
import { loadEntries, saveEntry, deleteEntry, saveProject, archiveProject } from '../services/projects.js';
import { taskHTML, bindTaskEvents } from '../components/TaskItem.js';
import { quickAddTask, saveTask, loadTasks } from '../services/tasks.js';
import { sb } from '../supabase.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from '../components/Modal.js';
import { icons } from '../lib/icons.js';

let entryYearFilter = null;

export async function renderProjectDetail(container, { id }) {
  const proj = state.projects.find(p => p.id === id);
  if (!proj) {
    navigate('projects');
    return;
  }

  await loadEntries(id);

  const projTasks = state.tasks.filter(t => t.project_id === id);
  const openTasks = projTasks.filter(t => !t.done);
  const doneTasks = projTasks.filter(t => t.done);
  const projNotes = state.notes.filter(n => n.project_id === id);

  // Year filter for entries
  const years = [...new Set(state.entries.map(e => e.entry_date?.split('-')[0]).filter(Boolean))].sort().reverse();
  let filteredEntries = [...state.entries];
  if (entryYearFilter) filteredEntries = filteredEntries.filter(e => e.entry_date?.startsWith(entryYearFilter));

  const entryTypeLabel = { note: 'Notiz', decision: 'Entscheidung', price: 'Preis', contact: 'Kontakt', todo: 'To-Do' };
  const entryTypeColor = { note: 'var(--accent)', decision: 'var(--orange)', price: 'var(--green)', contact: 'var(--purple)', todo: 'var(--red)' };

  container.innerHTML = `
    <div class="page-inner">
      <div class="breadcrumb">
        <a data-back>Projekte</a>
        <span class="breadcrumb-sep">/</span>
        <span>${esc(proj.name)}</span>
      </div>

      <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:32px;">
        <div class="project-icon" style="background:${proj.color}18;font-size:32px;width:56px;height:56px;border-radius:12px">${proj.icon || '📁'}</div>
        <div style="flex:1">
          <div class="page-title" style="font-size:var(--text-3xl)">${esc(proj.name)}</div>
          ${proj.description ? `<div style="color:var(--text-secondary);margin-top:4px">${esc(proj.description)}</div>` : ''}
          <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
            <span class="badge" style="background:${catColor(proj.category)}18;color:${catColor(proj.category)}">${esc(proj.category)}</span>
            ${proj.next_date ? `<span style="font-size:var(--text-xs);color:var(--text-secondary)">📅 ${fmtDate(proj.next_date)}</span>` : ''}
            ${proj.location ? `<span style="font-size:var(--text-xs);color:var(--text-secondary)">📍 ${esc(proj.location)}</span>` : ''}
          </div>
        </div>
        <button class="btn btn-ghost" id="edit-project-btn">${icons.edit}</button>
      </div>

      <!-- Tasks Section -->
      <div style="margin-bottom:32px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="section-label">Tasks (${openTasks.length} offen)</div>
        </div>
        <div class="quick-add" style="margin-bottom:12px;padding:6px 12px;border:1px solid var(--divider);border-radius:var(--radius-md)">
          <input class="input" placeholder="Neuen Task hinzufügen..." id="proj-task-input">
        </div>
        <div id="proj-tasks">
          ${openTasks.length ? openTasks.map(t => taskHTML(t)).join('') : '<div style="color:var(--text-tertiary);font-size:var(--text-sm);padding:8px 0">Keine offenen Tasks</div>'}
        </div>
        ${doneTasks.length ? `
          <details style="margin-top:8px">
            <summary style="cursor:pointer;font-size:var(--text-xs);color:var(--text-tertiary);padding:4px 0">${doneTasks.length} erledigt</summary>
            ${doneTasks.map(t => taskHTML(t)).join('')}
          </details>
        ` : ''}
      </div>

      <!-- Notes Section -->
      ${projNotes.length ? `
        <div style="margin-bottom:32px">
          <div class="section-label" style="margin-bottom:12px">Notizen (${projNotes.length})</div>
          ${projNotes.map(n => `
            <div style="padding:10px 12px;border-radius:var(--radius);cursor:pointer;transition:background .1s" class="note-link" data-note-id="${n.id}">
              <div style="font-size:var(--text-sm);color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.content.split('\n')[0])}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:2px">${fmtDate(n.created_at?.split('T')[0])}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Entries Section -->
      <div style="margin-bottom:32px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="section-label">Einträge</div>
          <button class="btn btn-ghost" id="new-entry-btn" style="font-size:var(--text-xs)">+ Eintrag</button>
        </div>
        ${years.length > 1 ? `
          <div class="filter-pills" style="margin-bottom:12px">
            <button class="filter-pill ${!entryYearFilter ? 'active' : ''}" data-year="">Alle</button>
            ${years.map(y => `<button class="filter-pill ${entryYearFilter === y ? 'active' : ''}" data-year="${y}">${y}</button>`).join('')}
          </div>
        ` : ''}
        ${filteredEntries.length
          ? filteredEntries.map(e => `
            <div class="entry-item" style="border-left-color:${entryTypeColor[e.entry_type] || 'var(--accent)'}" data-entry="${e.id}">
              <div class="entry-header">
                <span class="entry-type-badge" style="background:${(entryTypeColor[e.entry_type] || 'var(--accent)').replace('var(', 'rgba(').replace(')', ',0.1)')}18;color:${entryTypeColor[e.entry_type] || 'var(--accent)'}">${entryTypeLabel[e.entry_type] || e.entry_type}</span>
                <div class="entry-title">${esc(e.title)}</div>
                <div class="entry-date">${fmtDate(e.entry_date)}</div>
              </div>
              <div class="entry-body" style="display:none">
                ${e.content ? `<div style="white-space:pre-wrap">${esc(e.content)}</div>` : '<div style="color:var(--text-tertiary)">Kein Inhalt</div>'}
                <div style="display:flex;gap:8px;margin-top:10px">
                  <button class="btn btn-ghost" style="font-size:var(--text-xs)" data-delete-entry="${e.id}">Löschen</button>
                </div>
              </div>
            </div>
          `).join('')
          : '<div style="color:var(--text-tertiary);font-size:var(--text-sm);padding:8px 0">Noch keine Einträge</div>'}
      </div>

      ${archiveButtonHTML(proj)}
    </div>

    ${entryModalHTML()}
  `;

  bindTaskEvents(container);
  bindProjectDetailEvents(container, proj);
}

function archiveButtonHTML(proj) {
  return `<button class="btn btn-danger btn-block" id="archive-btn" style="margin-top:20px">${proj.archived ? 'Wiederherstellen' : 'Archivieren'}</button>`;
}

function entryModalHTML() {
  return `
    <div class="modal-overlay" id="entry-modal">
      <div class="modal">
        <h2>Neuer Eintrag</h2>
        <div class="form-group">
          <label>Typ</label>
          <select id="em-type" class="input">
            <option value="note">Notiz</option>
            <option value="decision">Entscheidung</option>
            <option value="price">Preis</option>
            <option value="contact">Kontakt</option>
            <option value="todo">To-Do</option>
          </select>
        </div>
        <div class="form-group">
          <label>Titel</label>
          <input id="em-title" class="input" placeholder="Titel">
        </div>
        <div class="form-group">
          <label>Inhalt</label>
          <textarea id="em-content" class="input" placeholder="Details..."></textarea>
        </div>
        <div class="form-group">
          <label>Datum</label>
          <input id="em-date" class="input" type="date">
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="em-cancel">Abbrechen</button>
          <button class="btn btn-primary" id="em-save">Speichern</button>
        </div>
      </div>
    </div>`;
}

function bindProjectDetailEvents(container, proj) {
  container.querySelector('[data-back]')?.addEventListener('click', () => navigate('projects'));
  container.querySelector('#edit-project-btn')?.addEventListener('click', () => navigate(`projects`)); // TODO: open edit modal

  // Quick add task
  const taskInput = container.querySelector('#proj-task-input');
  taskInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && taskInput.value.trim()) {
      const title = taskInput.value.trim();
      await saveTask({
        title,
        category: state.categories[0]?.name || 'Persönlich',
        priority: 'normal',
        due_date: today(),
        project_id: proj.id,
      });
      taskInput.value = '';
      renderProjectDetail(container, { id: proj.id });
    }
  });

  // Note links
  container.querySelectorAll('.note-link').forEach(el => {
    el.addEventListener('click', () => navigate(`notes/${el.dataset.noteId}`));
    el.addEventListener('mouseenter', () => el.style.background = 'var(--bg-hover)');
    el.addEventListener('mouseleave', () => el.style.background = '');
  });

  // Entry toggles
  container.querySelectorAll('[data-entry]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const body = el.querySelector('.entry-body');
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });
  });

  // Delete entries
  container.querySelectorAll('[data-delete-entry]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deleteEntry(btn.dataset.deleteEntry);
      await loadEntries(proj.id);
      renderProjectDetail(container, { id: proj.id });
    });
  });

  // Year filter
  container.querySelectorAll('[data-year]').forEach(btn => {
    btn.addEventListener('click', () => {
      entryYearFilter = btn.dataset.year || null;
      renderProjectDetail(container, { id: proj.id });
    });
  });

  // New entry
  container.querySelector('#new-entry-btn')?.addEventListener('click', () => {
    container.querySelector('#em-title').value = '';
    container.querySelector('#em-content').value = '';
    container.querySelector('#em-type').value = 'note';
    container.querySelector('#em-date').value = today();
    openModal('entry-modal');
  });

  container.querySelector('#em-save')?.addEventListener('click', async () => {
    await saveEntry({
      project_id: proj.id,
      title: container.querySelector('#em-title').value.trim(),
      content: container.querySelector('#em-content').value.trim() || null,
      entry_type: container.querySelector('#em-type').value,
      entry_date: container.querySelector('#em-date').value || today(),
    });
    closeModal('entry-modal');
    await loadEntries(proj.id);
    renderProjectDetail(container, { id: proj.id });
  });
  container.querySelector('#em-cancel')?.addEventListener('click', () => closeModal('entry-modal'));

  // Archive
  container.querySelector('#archive-btn')?.addEventListener('click', async () => {
    await archiveProject(proj.id);
    navigate('projects');
  });

  // Task edit
  container.addEventListener('click', (e) => {
    const editEl = e.target.closest('[data-edit-task]');
    if (editEl) navigate('tasks'); // Navigate to tasks for editing
  });
}
