import { esc } from '../lib/dom.js';
import { fmtDate, today } from '../lib/date.js';
import { catColor } from '../services/categories.js';
import { toggleTask, saveTask } from '../services/tasks.js';
import { navigate } from '../router.js';
import { toastSuccess } from './Toast.js';
import { icons } from '../lib/icons.js';

export function taskHTML(t, { clickToEdit = true } = {}) {
  const cc = catColor(t.category);
  const isOverdue = !t.done && t.due_date && t.due_date < today();
  const priColor = t.priority === 'high' ? 'var(--red)' : t.priority === 'low' ? 'var(--text-tertiary)' : 'var(--orange)';

  return `
    <div class="task-item ${t.done ? 'done' : ''}" data-task-id="${t.id}" ${clickToEdit ? `data-edit-task="${t.id}"` : ''}>
      <div class="task-check ${t.done ? 'checked' : ''}" data-toggle-task="${t.id}"></div>
      <div class="task-body">
        <div class="task-title" data-inline-title="${t.id}">${esc(t.title)}</div>
        <div class="task-meta">
          <span class="task-cat" style="background:${cc}18;color:${cc}">${esc(t.category)}</span>
          ${t.due_date ? `<span class="task-due ${isOverdue ? 'overdue' : ''}">${isOverdue ? '! ' : ''}${fmtDate(t.due_date)}</span>` : ''}
          <span class="priority-dot" style="background:${priColor}"></span>
        </div>
      </div>
      <div class="task-edit-hint" style="color:var(--text-tertiary);flex-shrink:0">${icons.edit}</div>
    </div>`;
}

export function bindTaskEvents(container) {
  // Remove old listener if exists, then rebind
  if (container._taskClickHandler) {
    container.removeEventListener('click', container._taskClickHandler);
  }
  if (container._taskDblClickHandler) {
    container.removeEventListener('dblclick', container._taskDblClickHandler);
  }

  container._taskClickHandler = async (e) => {
    // Ignore clicks inside modals
    if (e.target.closest('.modal-overlay')) return;

    // Toggle done
    const toggleEl = e.target.closest('[data-toggle-task]');
    if (toggleEl) {
      e.stopPropagation();
      const taskItem = toggleEl.closest('.task-item');
      // Add completion animation
      if (taskItem && !taskItem.classList.contains('done')) {
        taskItem.classList.add('just-done');
        toastSuccess('Task erledigt');
        // Fade out and remove after 1.5s
        setTimeout(() => {
          taskItem.style.transition = 'opacity 0.4s, max-height 0.4s, padding 0.4s, margin 0.4s';
          taskItem.style.opacity = '0';
          taskItem.style.maxHeight = '0';
          taskItem.style.padding = '0 10px';
          taskItem.style.margin = '0';
          taskItem.style.overflow = 'hidden';
          setTimeout(() => taskItem.remove(), 400);
        }, 1200);
      }
      await toggleTask(toggleEl.dataset.toggleTask);
      return;
    }
  };
  container.addEventListener('click', container._taskClickHandler);

  // Double-click for inline title editing
  container._taskDblClickHandler = (e) => {
    const titleEl = e.target.closest('[data-inline-title]');
    if (!titleEl) return;
    e.preventDefault();
    e.stopPropagation();

    const taskId = titleEl.dataset.inlineTitle;
    const currentText = titleEl.textContent.trim();

    const input = document.createElement('input');
    input.className = 'inline-edit-input';
    input.value = currentText;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const finish = async (save) => {
      const newTitle = input.value.trim();
      const span = document.createElement('div');
      span.className = 'task-title';
      span.setAttribute('data-inline-title', taskId);
      span.textContent = save && newTitle ? newTitle : currentText;
      input.replaceWith(span);

      if (save && newTitle && newTitle !== currentText) {
        await saveTask({ id: taskId, title: newTitle });
        toastSuccess('Task aktualisiert');
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  };
  container.addEventListener('dblclick', container._taskDblClickHandler);
}
