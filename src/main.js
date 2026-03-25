// Loom — Personal Workspace
// Entry point

// Styles
import './styles/tokens.css';
import './styles/typography.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/editor.css';
import './styles/animations.css';
import './styles/dark.css';

// Core
import { state } from './state.js';
import { route, navigate, initRouter, currentPath } from './router.js';
import { initSession, login, register } from './services/auth.js';
import { loadTasks } from './services/tasks.js';
import { loadProjects } from './services/projects.js';
import { loadNotes } from './services/notes.js';
import { loadCalendarEvents } from './services/calendar.js';
import { loadMeetings } from './services/meetings.js';
import { loadProfile } from './services/profile.js';
import { loadCategories } from './services/categories.js';
import { initRealtime } from './services/realtime.js';
import { initPush } from './services/push.js';
import { renderSidebar, openMobileSidebar, closeMobileSidebar } from './components/Sidebar.js';
import { initCommandBar } from './components/CommandBar.js';
import { initModalClose } from './components/Modal.js';
import { icons } from './lib/icons.js';

// Views
import { renderToday } from './views/Today.js';
import { renderTasks } from './views/Tasks.js';
import { renderNotes } from './views/Notes.js';
import { renderNoteDetail } from './views/NoteDetail.js';
import { renderProjects } from './views/Projects.js';
import { renderProjectDetail } from './views/ProjectDetail.js';
import { renderCalendar } from './views/Calendar.js';
import { renderMeetings } from './views/Meetings.js';
import { renderMeetingDetail } from './views/MeetingDetail.js';
import { renderSettings } from './views/Settings.js';

// Build app shell
const app = document.getElementById('app');

function buildShell() {
  app.innerHTML = `
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <aside class="sidebar" id="sidebar"></aside>
    <div class="main-content">
      <header class="mobile-header">
        <button class="mobile-header-menu" id="mobile-menu">${icons.menu}</button>
        <span class="mobile-header-title">Loom</span>
      </header>
      <main class="page" id="page"></main>
    </div>
  `;
}

function buildAuthScreen() {
  app.innerHTML = `
    <div class="auth-screen" id="auth-screen">
      <div class="auth-box">
        <div class="auth-logo">Loom</div>
        <div class="auth-sub">Dein persönlicher Workspace</div>
        <div id="auth-error" class="auth-error"></div>
        <div class="form-group">
          <input id="auth-email" class="input" type="email" placeholder="E-Mail" autocomplete="email" style="height:40px">
        </div>
        <div class="form-group">
          <input id="auth-pass" class="input" type="password" placeholder="Passwort" autocomplete="current-password" style="height:40px">
        </div>
        <button id="auth-btn" class="btn btn-primary btn-block btn-lg">Anmelden</button>
        <div style="text-align:center;margin-top:16px;font-size:var(--text-sm);color:var(--text-secondary)">
          <span id="auth-toggle-text">Noch kein Konto? </span>
          <span id="auth-toggle-link" style="color:var(--accent);cursor:pointer;font-weight:600">Registrieren</span>
        </div>
      </div>
    </div>
  `;

  let authMode = 'login';

  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-pass');
  const authBtn = document.getElementById('auth-btn');
  const errorEl = document.getElementById('auth-error');

  authBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const pass = passInput.value;
    if (!email || !pass) {
      errorEl.textContent = 'Bitte E-Mail und Passwort eingeben.';
      errorEl.style.display = 'block';
      return;
    }
    authBtn.textContent = 'Laden...';
    authBtn.disabled = true;
    try {
      if (authMode === 'login') await login(email, pass);
      else await register(email, pass);
    } catch (e) {
      errorEl.textContent = e.message || 'Fehler bei der Anmeldung';
      errorEl.style.display = 'block';
      authBtn.textContent = authMode === 'login' ? 'Anmelden' : 'Registrieren';
      authBtn.disabled = false;
    }
  });

  // Enter key on password
  passInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authBtn.click();
  });

  document.getElementById('auth-toggle-link').addEventListener('click', () => {
    authMode = authMode === 'login' ? 'register' : 'login';
    authBtn.textContent = authMode === 'login' ? 'Anmelden' : 'Registrieren';
    document.getElementById('auth-toggle-text').textContent = authMode === 'login' ? 'Noch kein Konto? ' : 'Bereits registriert? ';
    document.getElementById('auth-toggle-link').textContent = authMode === 'login' ? 'Registrieren' : 'Anmelden';
    errorEl.style.display = 'none';
  });
}

async function onReady() {
  buildShell();

  // Load data
  loadCategories();
  await Promise.all([loadTasks(), loadProjects(), loadNotes(), loadMeetings(), loadProfile(), loadCalendarEvents()]);

  // Render sidebar
  const sidebar = document.getElementById('sidebar');
  renderSidebar(sidebar);

  // Mobile menu
  document.getElementById('mobile-menu')?.addEventListener('click', openMobileSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeMobileSidebar);

  // Init features
  initDarkMode();
  initCommandBar();
  initModalClose();
  initKeyboardShortcuts();
  initPush();
  initRealtime(() => {
    // Re-render current view on realtime updates
    const page = document.getElementById('page');
    if (page) renderCurrentRoute(page);
    renderSidebar(sidebar);
  });

  // Setup routes
  const page = document.getElementById('page');

  route('today', () => { renderToday(page); updateSidebar(); });
  route('tasks', () => { renderTasks(page); updateSidebar(); });
  route('notes', () => { renderNotes(page); updateSidebar(); });
  route('notes/:id', (params) => { return renderNoteDetail(page, params); updateSidebar(); });
  route('projects', () => { renderProjects(page); updateSidebar(); });
  route('projects/:id', (params) => { renderProjectDetail(page, params); updateSidebar(); });
  route('calendar', () => { renderCalendar(page); updateSidebar(); });
  route('meetings', () => { renderMeetings(page); updateSidebar(); });
  route('meetings/:id', (params) => { renderMeetingDetail(page, params); updateSidebar(); });
  route('settings', () => { renderSettings(page); updateSidebar(); });

  initRouter();
}

function updateSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) renderSidebar(sidebar);
}

function renderCurrentRoute(page) {
  const path = currentPath();
  const view = path.split('/')[0];
  switch (view) {
    case 'today': renderToday(page); break;
    case 'tasks': renderTasks(page); break;
    case 'notes':
      if (path.includes('/')) {
        const id = path.split('/')[1];
        renderNoteDetail(page, { id });
      } else {
        renderNotes(page);
      }
      break;
    case 'projects':
      if (path.includes('/')) {
        const id = path.split('/')[1];
        renderProjectDetail(page, { id });
      } else {
        renderProjects(page);
      }
      break;
    case 'calendar': renderCalendar(page); break;
    case 'meetings':
      if (path.includes('/')) {
        const id = path.split('/')[1];
        renderMeetingDetail(page, { id });
      } else {
        renderMeetings(page);
      }
      break;
    case 'settings': renderSettings(page); break;
    default: renderToday(page);
  }
}

// Dark Mode
export function initDarkMode() {
  const saved = localStorage.getItem('loom_dark');
  if (saved === 'true' || (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
  // Listen for system changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (localStorage.getItem('loom_dark') === null) {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  });
}

export function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('loom_dark', isDark);
  return isDark;
}

export function isDarkMode() {
  return document.documentElement.classList.contains('dark');
}

// Keyboard Shortcuts
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Skip if in input/textarea/contenteditable
    const tag = e.target.tagName;
    const editable = e.target.isContentEditable;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) {
      // Only Escape works in inputs
      if (e.key === 'Escape') {
        e.target.blur();
        // Close any open modal
        document.querySelector('.modal-overlay.open')?.classList.remove('open');
      }
      // Cmd+Enter to save in modals
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const modal = e.target.closest('.modal');
        if (modal) {
          const saveBtn = modal.querySelector('.btn-primary');
          if (saveBtn) { e.preventDefault(); saveBtn.click(); }
        }
      }
      return;
    }

    // Escape: close modals/command bar
    if (e.key === 'Escape') {
      const modal = document.querySelector('.modal-overlay.open');
      if (modal) { modal.classList.remove('open'); return; }
      const cmd = document.querySelector('.cmd-overlay.open');
      if (cmd) { cmd.classList.remove('open'); return; }
    }

    // N: New Task (navigate to tasks)
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      navigate('tasks');
      setTimeout(() => document.getElementById('task-quick-input')?.focus(), 100);
    }

    // Shift+N: New Note
    if (e.key === 'N' && e.shiftKey) {
      e.preventDefault();
      navigate('notes');
      setTimeout(() => document.getElementById('note-quick-input')?.focus(), 100);
    }

    // 1-6: Quick navigate
    if (e.key >= '1' && e.key <= '6' && !e.metaKey && !e.ctrlKey) {
      const views = ['today', 'tasks', 'projects', 'notes', 'calendar', 'meetings'];
      const idx = parseInt(e.key) - 1;
      if (views[idx]) { e.preventDefault(); navigate(views[idx]); }
    }
  });
}

// Boot
initSession(onReady).then(() => {
  // If no user, show auth
  if (!state.currentUser) {
    buildAuthScreen();
  }
});
