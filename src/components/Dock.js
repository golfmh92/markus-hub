import { state } from '../state.js';
import { icons } from '../lib/icons.js';
import { navigate, currentPath } from '../router.js';
import { toggleDarkMode, isDarkMode } from '../main.js';

const NAV_ITEMS = [
  { key: 'today', label: 'Heute', icon: 'today' },
  { key: 'tasks', label: 'Tasks', icon: 'tasks' },
  { key: 'projects', label: 'Projekte', icon: 'projects' },
  { key: 'notes', label: 'Notizen', icon: 'notes' },
  { key: 'calendar', label: 'Kalender', icon: 'calendar' },
  { key: 'meetings', label: 'Meetings', icon: 'meetings' },
];

export function renderDock() {
  let dock = document.getElementById('loom-dock');
  if (!dock) {
    dock = document.createElement('nav');
    dock.id = 'loom-dock';
    dock.className = 'dock';
    document.body.appendChild(dock);
  }

  const activeKey = currentPath().split('/')[0] || 'today';
  const openTasks = state.tasks.filter(t => !t.done).length;
  const initial = (state.currentUser?.email || '?')[0].toUpperCase();

  dock.innerHTML = `
    ${NAV_ITEMS.map(item => {
      const badge = item.key === 'tasks' && openTasks > 0
        ? `<span class="dock-badge">${openTasks > 99 ? '99+' : openTasks}</span>`
        : '';
      return `
        <button class="dock-item ${activeKey === item.key ? 'active' : ''}" data-nav="${item.key}" data-label="${item.label}">
          ${icons[item.icon]}
          ${badge}
        </button>`;
    }).join('')}
    <div class="dock-sep"></div>
    <button class="dock-item" data-nav="search" data-label="Suche ⌘K">
      ${icons.search}
    </button>
    <button class="dock-item ${activeKey === 'settings' ? 'active' : ''}" data-nav="settings" data-label="Einstellungen">
      <div class="dock-avatar">${initial}</div>
    </button>
  `;

  // Event handlers
  dock.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.nav === 'search') {
        // Trigger Cmd+K
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
        return;
      }
      navigate(btn.dataset.nav);
    });
  });
}
