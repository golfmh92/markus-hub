// Loom — Personal Workspace
// Entry point

// Styles
import './styles/tokens.css';
import './styles/typography.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/editor.css';

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
  initCommandBar();
  initModalClose();
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

// Boot
initSession(onReady).then(() => {
  // If no user, show auth
  if (!state.currentUser) {
    buildAuthScreen();
  }
});
