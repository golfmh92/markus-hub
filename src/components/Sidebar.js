import { state } from '../state.js';
import { icons } from '../lib/icons.js';
import { navigate, currentPath } from '../router.js';
import { logout } from '../services/auth.js';
import { toggleDarkMode, isDarkMode } from '../main.js';

const NAV_ITEMS = [
  { key: 'today', label: 'Heute', icon: 'today' },
  { key: 'tasks', label: 'Tasks', icon: 'tasks' },
  { key: 'projects', label: 'Projekte', icon: 'projects' },
  { key: 'notes', label: 'Notizen', icon: 'notes' },
  { key: 'calendar', label: 'Kalender', icon: 'calendar' },
  { key: 'meetings', label: 'Meetings', icon: 'meetings' },
];

export function renderSidebar(container) {
  const activeKey = currentPath().split('/')[0] || 'today';
  const dark = isDarkMode();
  const openTasks = state.tasks.filter(t => !t.done).length;

  container.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">Loom</div>
    </div>
    <nav class="sidebar-nav">
      ${NAV_ITEMS.map(item => {
        const badge = item.key === 'tasks' && openTasks > 0
          ? `<span style="margin-left:auto;font-size:11px;background:var(--bg-active);padding:1px 7px;border-radius:10px;color:var(--text-secondary)">${openTasks}</span>`
          : '';
        return `
          <button class="sidebar-item ${activeKey === item.key ? 'active' : ''}" data-nav="${item.key}">
            ${icons[item.icon]}
            <span>${item.label}</span>
            ${badge}
          </button>`;
      }).join('')}
      <div class="sidebar-section-label" style="margin-top: auto;">Konto</div>
      <button class="sidebar-item ${activeKey === 'settings' ? 'active' : ''}" data-nav="settings">
        ${icons.settings}
        <span>Einstellungen</span>
      </button>
    </nav>
    <div class="sidebar-bottom">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="sidebar-email">${state.currentUser?.email || ''}</div>
        <button id="dark-toggle" class="btn btn-ghost" style="padding:4px;height:auto" title="${dark ? 'Light Mode' : 'Dark Mode'}">
          ${dark ? '☀️' : '🌙'}
        </button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <button class="sidebar-logout" id="sidebar-logout">
          ${icons.logout}
          Abmelden
        </button>
        <span style="font-size:11px;color:var(--text-tertiary)"><span class="kbd">?</span> Shortcuts</span>
      </div>
    </div>
  `;

  // Event handlers
  container.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.nav);
      closeMobileSidebar();
    });
  });

  container.querySelector('#sidebar-logout')?.addEventListener('click', logout);

  container.querySelector('#dark-toggle')?.addEventListener('click', () => {
    toggleDarkMode();
    renderSidebar(container);
  });
}

export function closeMobileSidebar() {
  document.querySelector('.sidebar')?.classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('open');
}

export function openMobileSidebar() {
  document.querySelector('.sidebar')?.classList.add('open');
  document.querySelector('.sidebar-overlay')?.classList.add('open');
}
