import { state } from '../state.js';
import { icons } from '../lib/icons.js';
import { navigate, currentPath } from '../router.js';
import { logout } from '../services/auth.js';

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

  container.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">Loom</div>
    </div>
    <nav class="sidebar-nav">
      ${NAV_ITEMS.map(item => `
        <button class="sidebar-item ${activeKey === item.key ? 'active' : ''}" data-nav="${item.key}">
          ${icons[item.icon]}
          <span>${item.label}</span>
        </button>
      `).join('')}
      <div class="sidebar-section-label" style="margin-top: auto;">Konto</div>
      <button class="sidebar-item" data-nav="settings">
        ${icons.settings}
        <span>Einstellungen</span>
      </button>
    </nav>
    <div class="sidebar-bottom">
      <div class="sidebar-email">${state.currentUser?.email || ''}</div>
      <button class="sidebar-logout" id="sidebar-logout">
        ${icons.logout}
        Abmelden
      </button>
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
}

export function closeMobileSidebar() {
  document.querySelector('.sidebar')?.classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('open');
}

export function openMobileSidebar() {
  document.querySelector('.sidebar')?.classList.add('open');
  document.querySelector('.sidebar-overlay')?.classList.add('open');
}
