import { esc } from '../lib/dom.js';
import { fmtDate, today } from '../lib/date.js';
import { catColor } from '../services/categories.js';
import { toggleTask } from '../services/tasks.js';
import { navigate } from '../router.js';

export function taskHTML(t, { clickToEdit = true } = {}) {
  const cc = catColor(t.category);
  const isOverdue = !t.done && t.due_date && t.due_date < today();
  const priColor = t.priority === 'high' ? 'var(--red)' : t.priority === 'low' ? 'var(--text-tertiary)' : 'var(--orange)';

  return `
    <div class="task-item ${t.done ? 'done' : ''}" data-task-id="${t.id}">
      <div class="task-check ${t.done ? 'checked' : ''}" data-toggle-task="${t.id}"></div>
      <div class="task-body" ${clickToEdit ? `data-edit-task="${t.id}"` : ''}>
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          <span class="task-cat" style="background:${cc}18;color:${cc}">${esc(t.category)}</span>
          ${t.due_date ? `<span class="task-due ${isOverdue ? 'overdue' : ''}">${isOverdue ? '! ' : ''}${fmtDate(t.due_date)}</span>` : ''}
          <span class="priority-dot" style="background:${priColor}"></span>
        </div>
      </div>
    </div>`;
}

export function bindTaskEvents(container) {
  container.addEventListener('click', async (e) => {
    const toggleEl = e.target.closest('[data-toggle-task]');
    if (toggleEl) {
      e.stopPropagation();
      await toggleTask(toggleEl.dataset.toggleTask);
      return;
    }
  });
}
