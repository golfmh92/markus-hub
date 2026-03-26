import { state } from '../state.js';
import { esc } from '../lib/dom.js';
import { today, daysFromNow, fmtDate } from '../lib/date.js';
import { taskHTML, bindTaskEvents } from '../components/TaskItem.js';
import { quickAddTask, saveTask, deleteTask } from '../services/tasks.js';
import { catColor } from '../services/categories.js';
import { openModal, closeModal } from '../components/Modal.js';
import { toastSuccess } from '../components/Toast.js';
import { PROJECT_ICONS, PROJECT_COLORS } from '../state.js';

let taskFilter = 'alle';
let taskCatFilter = 'all';
let taskSort = 'due';
let taskGroup = 'none'; // none, date, project, category, priority

export function renderTasks(container) {
  const td = today();
  const weekStr = daysFromNow(7);

  // Filter
  let filtered = [...state.tasks];
  switch (taskFilter) {
    case 'heute': filtered = filtered.filter(t => !t.done && t.due_date === td); break;
    case 'week': filtered = filtered.filter(t => !t.done && t.due_date && t.due_date <= weekStr); break;
    case 'overdue': filtered = filtered.filter(t => !t.done && t.due_date && t.due_date < td); break;
    case 'done': filtered = filtered.filter(t => t.done); break;
    default: filtered = filtered.filter(t => !t.done); break;
  }

  if (taskCatFilter !== 'all') {
    filtered = filtered.filter(t => t.category === taskCatFilter);
  }

  // Sort
  switch (taskSort) {
    case 'due': filtered.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')); break;
    case 'priority': filtered.sort((a, b) => {
      const order = { high: 0, normal: 1, low: 2 };
      return (order[a.priority] || 1) - (order[b.priority] || 1);
    }); break;
    case 'category': filtered.sort((a, b) => a.category.localeCompare(b.category)); break;
  }

  const filters = [['Alle', 'alle'], ['Heute', 'heute'], ['Diese Woche', 'week'], ['Überfällig', 'overdue'], ['Erledigt', 'done']];
  const sorts = ['due', 'priority', 'category'];
  const sortLabels = { due: 'Fällig', priority: 'Priorität', category: 'Kategorie' };

  const total = state.tasks.filter(t => !t.done).length;

  const doneTasks = state.tasks.filter(t => t.done).length;
  const todayDue = state.tasks.filter(t => !t.done && t.due_date === td).length;
  const overdueTasks = state.tasks.filter(t => !t.done && t.due_date && t.due_date < td).length;

  container.innerHTML = `
    <div class="page-inner">
      <div class="view-header">
        <div class="view-header-left">
          <div class="page-title">Tasks</div>
        </div>
      </div>

      <!-- Task Stats -->
      <div class="stats-row" style="margin-bottom:16px">
        <div class="stat-card-v2" style="--stat-color:var(--accent);--stat-bg:var(--accent-bg)">
          <div class="stat-card-v2-num">${total}</div>
          <div class="stat-card-v2-label">Offen</div>
          <div class="stat-card-v2-icon">📋</div>
        </div>
        <div class="stat-card-v2" style="--stat-color:var(--green);--stat-bg:var(--green-bg)">
          <div class="stat-card-v2-num">${doneTasks}</div>
          <div class="stat-card-v2-label">Erledigt</div>
          <div class="stat-card-v2-icon">✅</div>
        </div>
        <div class="stat-card-v2" style="--stat-color:var(--orange);--stat-bg:var(--orange-bg)">
          <div class="stat-card-v2-num">${todayDue}</div>
          <div class="stat-card-v2-label">Heute</div>
          <div class="stat-card-v2-icon">📅</div>
        </div>
        ${overdueTasks > 0 ? `
          <div class="stat-card-v2" style="--stat-color:var(--red);--stat-bg:var(--red-bg)">
            <div class="stat-card-v2-num">${overdueTasks}</div>
            <div class="stat-card-v2-label">Überfällig</div>
            <div class="stat-card-v2-icon">⚠️</div>
          </div>
        ` : ''}
      </div>

      <div class="quick-add-box">
        <div class="quick-add-icon">+</div>
        <input class="input" placeholder="Neuen Task hinzufügen..." id="task-quick-input">
        <span style="font-size:var(--text-xs);color:var(--text-tertiary)"><span class="kbd">N</span></span>
      </div>

      <div class="filter-toolbar">
        ${filters.map(([label, key]) =>
          `<button class="filter-pill ${taskFilter === key ? 'active' : ''}" data-filter="${key}">${label}</button>`
        ).join('')}
        <div class="filter-sep"></div>
        ${['all', ...state.categories.map(c => c.name)].map(c => {
          const label = c === 'all' ? 'Alle' : c;
          return `<button class="filter-pill ${taskCatFilter === c ? 'active' : ''}" data-cat="${c}" style="font-size:10px;padding:2px 7px">${label}</button>`;
        }).join('')}
        <div style="margin-left:auto;display:flex;gap:4px;align-items:center">
          <select id="group-select" class="input" style="width:auto;height:24px;font-size:10px;padding:1px 20px 1px 6px;border-radius:4px">
            <option value="none" ${taskGroup === 'none' ? 'selected' : ''}>Gruppierung</option>
            <option value="project" ${taskGroup === 'project' ? 'selected' : ''}>Projekt</option>
            <option value="category" ${taskGroup === 'category' ? 'selected' : ''}>Kategorie</option>
            <option value="priority" ${taskGroup === 'priority' ? 'selected' : ''}>Priorität</option>
          </select>
          <button class="btn btn-ghost" id="sort-btn" style="font-size:10px;height:24px;padding:0 8px">
            ↕ ${sortLabels[taskSort]}
          </button>
        </div>
      </div>

      <div class="tasks-columns" id="tasks-list">
        ${filtered.length
          ? renderGroupedTasks(filtered)
          : '<div class="widget-empty" style="grid-column:1/-1"><div style="font-size:28px;margin-bottom:8px">📋</div>Keine Tasks<br><span style="font-size:var(--text-xs);color:var(--text-tertiary)">Drücke <span class="kbd">N</span> zum Erstellen</span></div>'}
      </div>

      <!-- Mobile FAB -->
      <button id="new-task-fab" style="position:fixed;bottom:88px;right:20px;width:52px;height:52px;border-radius:50%;background:var(--accent-gradient);color:#fff;border:none;font-size:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(99,102,241,0.3);cursor:pointer;z-index:50">+</button>
    </div>

    ${taskModalHTML()}
  `;

  bindTaskEvents(container);
  bindTaskViewEvents(container);
}

function renderGroupedTasks(tasks) {
  if (taskGroup === 'none') {
    // Split into two columns
    const mid = Math.ceil(tasks.length / 2);
    const left = tasks.slice(0, mid);
    const right = tasks.slice(mid);
    return `
      <div class="widget">
        <div class="widget-body-flush task-list-widget">${left.map(t => taskHTML(t)).join('')}</div>
      </div>
      <div class="widget">
        <div class="widget-body-flush task-list-widget">${right.map(t => taskHTML(t)).join('')}</div>
      </div>`;
  }

  const groups = {};
  const priorityLabels = { high: '🔴 Hoch', normal: '🟡 Normal', low: '⚪ Niedrig' };

  for (const t of tasks) {
    let key;
    switch (taskGroup) {
      case 'project':
        const proj = t.project_id ? state.projects.find(p => p.id === t.project_id) : null;
        key = proj ? proj.name : 'Kein Projekt';
        break;
      case 'category': key = t.category || 'Ohne Kategorie'; break;
      case 'priority': key = priorityLabels[t.priority] || '🟡 Normal'; break;
      default: key = 'Alle';
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  return Object.entries(groups).map(([label, items]) => `
    <div class="widget">
      <div class="widget-header">
        <div class="widget-header-title">${esc(label)} <span class="widget-header-count">${items.length}</span></div>
      </div>
      <div class="widget-body-flush task-list-widget">
        ${items.map(t => taskHTML(t)).join('')}
      </div>
    </div>
  `).join('');
}

function bindTaskViewEvents(container) {
  // Mobile FAB -> open task modal
  container.querySelector('#new-task-fab')?.addEventListener('click', () => {
    openTaskModal(null, container);
  });

  // Quick add with smart parsing
  const quickInput = container.querySelector('#task-quick-input');
  quickInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && quickInput.value.trim()) {
      const raw = quickInput.value.trim();
      await quickAddTask(raw);
      quickInput.value = '';
      toastSuccess('Task erstellt');
      renderTasks(container);
    }
  });

  // Filters
  container.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      taskFilter = btn.dataset.filter;
      renderTasks(container);
    });
  });

  // Category filters
  container.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      taskCatFilter = btn.dataset.cat;
      renderTasks(container);
    });
  });

  // Sort
  container.querySelector('#sort-btn')?.addEventListener('click', () => {
    const sorts = ['due', 'priority', 'category'];
    taskSort = sorts[(sorts.indexOf(taskSort) + 1) % sorts.length];
    renderTasks(container);
  });

  // Grouping
  container.querySelector('#group-select')?.addEventListener('change', (e) => {
    taskGroup = e.target.value;
    renderTasks(container);
  });

  // Edit task (click on body)
  container.addEventListener('click', (e) => {
    const editEl = e.target.closest('[data-edit-task]');
    if (editEl) {
      openTaskModal(editEl.dataset.editTask, container);
    }
  });

  // Modal events
  container.querySelector('#tm-save')?.addEventListener('click', async () => {
    const id = container.querySelector('#task-edit-id').value;
    await saveTask({
      id: id || undefined,
      title: container.querySelector('#tm-title').value.trim(),
      description: container.querySelector('#tm-desc').value.trim() || null,
      category: container.querySelector('#tm-cat').value,
      priority: container.querySelector('#tm-priority').value,
      due_date: container.querySelector('#tm-due').value || null,
      project_id: container.querySelector('#tm-project').value || null,
    });
    closeModal('task-modal');
    toastSuccess('Task gespeichert');
    renderTasks(container);
  });

  container.querySelector('#tm-cancel')?.addEventListener('click', () => closeModal('task-modal'));

  container.querySelector('#tm-delete')?.addEventListener('click', async () => {
    const id = container.querySelector('#task-edit-id').value;
    if (id) {
      await deleteTask(id);
      closeModal('task-modal');
      toastSuccess('Task gelöscht');
      renderTasks(container);
    }
  });

  // Quick date buttons
  container.querySelectorAll('[data-quick-date]').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.quickDate);
      const d = new Date();
      d.setDate(d.getDate() + days);
      container.querySelector('#tm-due').value = d.toISOString().split('T')[0];
    });
  });
}

function openTaskModal(editId, container) {
  const modal = container.querySelector('#task-modal');
  if (!modal) return;

  const catSelect = container.querySelector('#tm-cat');
  const projSelect = container.querySelector('#tm-project');
  catSelect.innerHTML = state.categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
  projSelect.innerHTML = '<option value="">– Kein Projekt –</option>' +
    state.projects.filter(p => !p.archived).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

  if (editId) {
    const t = state.tasks.find(t => t.id === editId);
    if (!t) return;
    container.querySelector('#task-modal-title').textContent = 'Task bearbeiten';
    container.querySelector('#task-edit-id').value = t.id;
    container.querySelector('#tm-title').value = t.title;
    container.querySelector('#tm-desc').value = t.description || '';
    catSelect.value = t.category;
    container.querySelector('#tm-priority').value = t.priority;
    container.querySelector('#tm-due').value = t.due_date || '';
    projSelect.value = t.project_id || '';
    container.querySelector('#tm-delete').style.display = 'block';
  } else {
    container.querySelector('#task-modal-title').textContent = 'Neuer Task';
    container.querySelector('#task-edit-id').value = '';
    container.querySelector('#tm-title').value = '';
    container.querySelector('#tm-desc').value = '';
    catSelect.value = state.categories[0]?.name || '';
    container.querySelector('#tm-priority').value = 'normal';
    container.querySelector('#tm-due').value = today();
    projSelect.value = '';
    container.querySelector('#tm-delete').style.display = 'none';
  }

  openModal('task-modal');
}

function taskModalHTML() {
  return `
    <div class="modal-overlay" id="task-modal">
      <div class="modal">
        <h2 id="task-modal-title">Neuer Task</h2>
        <input type="hidden" id="task-edit-id">
        <div class="form-group">
          <label>Titel</label>
          <input id="tm-title" class="input" placeholder="Was muss erledigt werden?">
        </div>
        <div class="form-group">
          <label>Beschreibung</label>
          <textarea id="tm-desc" class="input" placeholder="Details (optional)"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Kategorie</label>
            <select id="tm-cat" class="input"></select>
          </div>
          <div class="form-group">
            <label>Priorität</label>
            <select id="tm-priority" class="input">
              <option value="low">Niedrig</option>
              <option value="normal" selected>Normal</option>
              <option value="high">Hoch</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Fällig am</label>
            <input id="tm-due" class="input" type="date">
            <div style="display:flex;gap:4px;margin-top:4px">
              <button type="button" class="quick-date-btn" data-quick-date="0">Heute</button>
              <button type="button" class="quick-date-btn" data-quick-date="1">Morgen</button>
              <button type="button" class="quick-date-btn" data-quick-date="7">+1 Woche</button>
            </div>
          </div>
          <div class="form-group">
            <label>Projekt</label>
            <select id="tm-project" class="input"></select>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="tm-cancel">Abbrechen</button>
          <button class="btn btn-primary" id="tm-save">Speichern</button>
        </div>
        <button class="btn btn-danger btn-block" style="margin-top:12px;display:none" id="tm-delete">Task löschen</button>
      </div>
    </div>`;
}
