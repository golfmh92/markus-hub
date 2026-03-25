import { state } from '../state.js';
import { navigate } from '../router.js';
import { esc } from '../lib/dom.js';
import { quickAddTask } from '../services/tasks.js';
import { quickAddNote } from '../services/notes.js';

let isOpen = false;

export function initCommandBar() {
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggleCommandBar();
    }
    if (e.key === 'Escape' && isOpen) {
      closeCommandBar();
    }
  });
}

function toggleCommandBar() {
  isOpen ? closeCommandBar() : openCommandBar();
}

function openCommandBar() {
  isOpen = true;
  let overlay = document.querySelector('.cmd-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'cmd-overlay';
    overlay.innerHTML = `
      <div class="cmd-box">
        <input class="cmd-input" placeholder="Suche oder erstelle..." autofocus>
        <div class="cmd-results"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeCommandBar();
    });

    const input = overlay.querySelector('.cmd-input');
    input.addEventListener('input', () => updateResults(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const active = overlay.querySelector('.cmd-item.active') || overlay.querySelector('.cmd-item');
        if (active) active.click();
      }
    });
  }

  overlay.classList.add('open');
  const input = overlay.querySelector('.cmd-input');
  input.value = '';
  input.focus();
  updateResults('');
}

function closeCommandBar() {
  isOpen = false;
  document.querySelector('.cmd-overlay')?.classList.remove('open');
}

function updateResults(query) {
  const results = document.querySelector('.cmd-results');
  if (!results) return;
  const q = query.toLowerCase().trim();

  const items = [];

  // Navigation commands
  if (!q) {
    items.push({ label: 'Neuer Task', type: 'action', action: () => { navigate('tasks'); } });
    items.push({ label: 'Neue Notiz', type: 'action', action: () => { navigate('notes'); } });
    items.push({ label: 'Heute', type: 'nav', action: () => navigate('today') });
    items.push({ label: 'Tasks', type: 'nav', action: () => navigate('tasks') });
    items.push({ label: 'Projekte', type: 'nav', action: () => navigate('projects') });
    items.push({ label: 'Notizen', type: 'nav', action: () => navigate('notes') });
    items.push({ label: 'Kalender', type: 'nav', action: () => navigate('calendar') });
  } else {
    // Quick create
    items.push({
      label: `Task erstellen: "${query}"`,
      type: 'action',
      action: async () => { await quickAddTask(query); navigate('tasks'); },
    });
    items.push({
      label: `Notiz erstellen: "${query}"`,
      type: 'action',
      action: async () => { await quickAddNote(query); navigate('notes'); },
    });

    // Search tasks
    state.tasks.filter(t => t.title.toLowerCase().includes(q)).slice(0, 5).forEach(t => {
      items.push({ label: t.title, type: 'Task', action: () => navigate('tasks') });
    });

    // Search notes
    state.notes.filter(n => n.content.toLowerCase().includes(q)).slice(0, 3).forEach(n => {
      const preview = n.content.slice(0, 60).replace(/\n/g, ' ');
      items.push({ label: preview, type: 'Notiz', action: () => navigate(`notes/${n.id}`) });
    });

    // Search projects
    state.projects.filter(p => p.name.toLowerCase().includes(q)).slice(0, 3).forEach(p => {
      items.push({ label: p.name, type: 'Projekt', action: () => navigate(`projects/${p.id}`) });
    });
  }

  results.innerHTML = items.map((item, i) => `
    <div class="cmd-item ${i === 0 ? 'active' : ''}" data-idx="${i}">
      <span>${esc(item.label)}</span>
      <span class="cmd-item-type">${item.type}</span>
    </div>
  `).join('');

  results.querySelectorAll('.cmd-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      items[i].action();
      closeCommandBar();
    });
  });
}
