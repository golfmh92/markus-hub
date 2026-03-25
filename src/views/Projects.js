import { state } from '../state.js';
import { esc } from '../lib/dom.js';
import { fmtDate } from '../lib/date.js';
import { catColor } from '../services/categories.js';
import { saveProject } from '../services/projects.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from '../components/Modal.js';
import { PROJECT_ICONS, PROJECT_COLORS } from '../state.js';

let projectFilter = 'all';

export function renderProjects(container) {
  let filtered = [...state.projects];
  if (projectFilter === 'active') filtered = filtered.filter(p => !p.archived);
  else if (projectFilter === 'archived') filtered = filtered.filter(p => p.archived);

  const taskCounts = {};
  state.tasks.filter(t => !t.done && t.project_id).forEach(t => {
    taskCounts[t.project_id] = (taskCounts[t.project_id] || 0) + 1;
  });

  container.innerHTML = `
    <div class="page-inner">
      <div class="view-header">
        <div class="view-header-left">
          <div class="page-title">Projekte</div>
          <span class="view-header-count">${filtered.length}</span>
        </div>
        <button class="btn btn-primary" id="new-project-btn" style="height:28px;font-size:var(--text-xs)">+ Neues Projekt</button>
      </div>

      <div class="filter-toolbar" style="margin-bottom:16px">
        ${[['Alle', 'all'], ['Aktiv', 'active'], ['Archiv', 'archived']].map(([label, key]) =>
          `<button class="filter-pill ${projectFilter === key ? 'active' : ''}" data-pfilter="${key}">${label}</button>`
        ).join('')}
      </div>

      <div class="projects-grid-view">
        ${filtered.length
          ? filtered.map(p => {
              const tc = taskCounts[p.id] || 0;
              const allProjTasks = state.tasks.filter(t => t.project_id === p.id);
              const doneProjTasks = allProjTasks.filter(t => t.done);
              const pct = allProjTasks.length > 0 ? Math.round(doneProjTasks.length / allProjTasks.length * 100) : 0;
              return `
                <div class="project-card-v2" data-project-id="${p.id}" style="--proj-color:${p.color}">
                  <div class="project-card-v2-header">
                    <div class="project-card-v2-icon" style="background:${p.color}18">${p.icon || '📁'}</div>
                    <div class="project-card-v2-title">${esc(p.name)}</div>
                  </div>
                  <div class="project-card-v2-meta">
                    <span class="task-cat" style="background:${catColor(p.category)}18;color:${catColor(p.category)};font-size:9px;padding:1px 5px">${esc(p.category)}</span>
                    ${p.next_date ? `<span>📅 ${fmtDate(p.next_date)}</span>` : ''}
                  </div>
                  ${allProjTasks.length > 0 ? `
                    <div class="project-card-v2-tasks">
                      <span>${tc} offen</span>
                      <div class="project-card-v2-bar">
                        <div class="project-card-v2-bar-fill" style="width:${pct}%;background:${p.color}"></div>
                      </div>
                      <span>${pct}%</span>
                    </div>
                  ` : `<div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:8px">Keine Tasks</div>`}
                </div>`;
            }).join('')
          : '<div class="widget-empty" style="grid-column:1/-1"><div style="font-size:28px;margin-bottom:8px">📂</div>Noch keine Projekte</div>'}
      </div>
    </div>

    ${projectModalHTML()}
  `;

  bindProjectEvents(container);
}

function bindProjectEvents(container) {
  container.querySelectorAll('[data-pfilter]').forEach(btn => {
    btn.addEventListener('click', () => {
      projectFilter = btn.dataset.pfilter;
      renderProjects(container);
    });
  });

  container.querySelectorAll('[data-project-id]').forEach(el => {
    el.addEventListener('click', () => navigate(`projects/${el.dataset.projectId}`));
  });

  container.querySelector('#new-project-btn')?.addEventListener('click', () => openProjectModal(null, container));

  // Modal save
  container.querySelector('#pm-save')?.addEventListener('click', async () => {
    await saveProject({
      id: container.querySelector('#proj-edit-id').value || undefined,
      name: container.querySelector('#pm-name').value.trim(),
      description: container.querySelector('#pm-desc').value.trim() || null,
      category: container.querySelector('#pm-cat').value,
      icon: window._projIcon || '📁',
      color: window._projColor || '#0055D4',
      next_date: container.querySelector('#pm-next-date').value || null,
      location: container.querySelector('#pm-location').value.trim() || null,
    });
    closeModal('project-modal');
    renderProjects(container);
  });
  container.querySelector('#pm-cancel')?.addEventListener('click', () => closeModal('project-modal'));
}

function openProjectModal(editId, container) {
  const catSelect = container.querySelector('#pm-cat');
  catSelect.innerHTML = state.categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');

  let selectedIcon = '📁';
  let selectedColor = '#0055D4';

  if (editId) {
    const p = state.projects.find(p => p.id === editId);
    if (p) {
      container.querySelector('#pm-name').value = p.name;
      container.querySelector('#pm-desc').value = p.description || '';
      catSelect.value = p.category;
      container.querySelector('#pm-next-date').value = p.next_date || '';
      container.querySelector('#pm-location').value = p.location || '';
      selectedIcon = p.icon || '📁';
      selectedColor = p.color || '#0055D4';
    }
    container.querySelector('#proj-edit-id').value = editId;
  } else {
    container.querySelector('#pm-name').value = '';
    container.querySelector('#pm-desc').value = '';
    catSelect.value = state.categories[0]?.name || '';
    container.querySelector('#pm-next-date').value = '';
    container.querySelector('#pm-location').value = '';
    container.querySelector('#proj-edit-id').value = '';
  }

  window._projIcon = selectedIcon;
  window._projColor = selectedColor;

  // Icon picker
  container.querySelector('#pm-icon-grid').innerHTML = PROJECT_ICONS.map(icon =>
    `<button type="button" class="btn" style="padding:4px 6px;font-size:16px;${icon === selectedIcon ? 'background:var(--accent-bg);' : ''}" data-icon="${icon}">${icon}</button>`
  ).join('');

  container.querySelectorAll('[data-icon]').forEach(btn => {
    btn.addEventListener('click', () => {
      window._projIcon = btn.dataset.icon;
      container.querySelectorAll('[data-icon]').forEach(b => b.style.background = '');
      btn.style.background = 'var(--accent-bg)';
    });
  });

  // Color picker
  container.querySelector('#pm-color-grid').innerHTML = PROJECT_COLORS.map(color =>
    `<button type="button" style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid ${color === selectedColor ? 'var(--text-primary)' : 'transparent'};cursor:pointer" data-color="${color}"></button>`
  ).join('');

  container.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      window._projColor = btn.dataset.color;
      container.querySelectorAll('[data-color]').forEach(b => b.style.borderColor = 'transparent');
      btn.style.borderColor = 'var(--text-primary)';
    });
  });

  openModal('project-modal');
}

function projectModalHTML() {
  return `
    <div class="modal-overlay" id="project-modal">
      <div class="modal">
        <h2>Neues Projekt</h2>
        <input type="hidden" id="proj-edit-id">
        <div class="form-group">
          <label>Name</label>
          <input id="pm-name" class="input" placeholder="Projektname">
        </div>
        <div class="form-group">
          <label>Beschreibung</label>
          <textarea id="pm-desc" class="input" placeholder="Beschreibung (optional)"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Nächster Termin</label>
            <input type="date" id="pm-next-date" class="input">
          </div>
          <div class="form-group">
            <label>Ort</label>
            <input type="text" id="pm-location" class="input" placeholder="z.B. GC Föhrenwald">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Kategorie</label>
            <select id="pm-cat" class="input"></select>
          </div>
          <div class="form-group">
            <label>Icon</label>
            <div id="pm-icon-grid" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Farbe</label>
          <div id="pm-color-grid" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px"></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="pm-cancel">Abbrechen</button>
          <button class="btn btn-primary" id="pm-save">Speichern</button>
        </div>
      </div>
    </div>`;
}
