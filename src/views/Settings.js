import { state } from '../state.js';
import { esc } from '../lib/dom.js';
import { DEFAULT_CATEGORIES } from '../state.js';
import { addCategory, removeCategory } from '../services/categories.js';
import { saveProfile } from '../services/profile.js';
import { initPush, isPushActive, subscribePush, unsubscribePush } from '../services/push.js';
import { logout } from '../services/auth.js';
import { toggleDarkMode, isDarkMode } from '../main.js';
import { toastSuccess } from '../components/Toast.js';

export function renderSettings(container) {
  const done = state.tasks.filter(t => t.done).length;
  const dark = isDarkMode();
  const open = state.tasks.filter(t => !t.done).length;
  const pushActive = isPushActive();

  container.innerHTML = `
    <div class="page-inner">
      <div class="page-title" style="margin-bottom: 24px;">Einstellungen</div>

      <!-- Profile Hero -->
      <div class="widget" style="margin-bottom:24px;overflow:hidden">
        <div style="background:var(--accent-gradient);padding:24px 20px;display:flex;align-items:center;gap:16px">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;backdrop-filter:blur(8px)">
            ${(state.currentUser?.email || '?')[0].toUpperCase()}
          </div>
          <div style="color:#fff">
            <div style="font-size:var(--text-base);font-weight:600">${esc(state.currentUser?.email)}</div>
            <div style="font-size:var(--text-sm);opacity:0.8">${open} offen · ${done} erledigt · ${state.projects.length} Projekte · ${state.notes.length} Notizen</div>
          </div>
        </div>
      </div>

      <!-- Appearance -->
      <div style="margin-bottom:32px">
        <div class="section-label" style="margin-bottom:12px">Darstellung</div>
        <div style="border:1px solid var(--divider);border-radius:var(--radius-md);padding:16px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:var(--text-sm);font-weight:600">Dark Mode</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary)">Dunkles Design für die Augen</div>
          </div>
          <button class="btn ${dark ? 'btn-primary' : 'btn-secondary'}" id="dark-mode-toggle" style="min-width:80px">
            ${dark ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </div>

      <!-- Keyboard Shortcuts -->
      <div style="margin-bottom:32px">
        <div class="section-label" style="margin-bottom:12px">Keyboard Shortcuts</div>
        <div style="border:1px solid var(--divider);border-radius:var(--radius-md);padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:var(--text-sm)">
          <div style="display:flex;justify-content:space-between;align-items:center"><span>Suche</span><span class="kbd">⌘K</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center"><span>Neuer Task</span><span class="kbd">N</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center"><span>Neue Notiz</span><span class="kbd">⇧N</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center"><span>Speichern</span><span class="kbd">⌘↵</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center"><span>Schließen</span><span class="kbd">Esc</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center"><span>Navigation</span><span><span class="kbd">1</span>-<span class="kbd">6</span></span></div>
        </div>
      </div>

      <!-- Categories -->
      <div style="margin-bottom:32px">
        <div class="section-label" style="margin-bottom:12px">Kategorien</div>
        <div id="cat-list">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
            ${state.categories.map(c => `
              <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:var(--radius);transition:background .1s;border:1px solid var(--divider)" class="cat-row">
                <div style="width:8px;height:8px;border-radius:50%;background:${c.color};flex-shrink:0"></div>
                <div style="flex:1;font-size:var(--text-xs);font-weight:500">${esc(c.name)}</div>
                ${!DEFAULT_CATEGORIES.find(d => d.name === c.name) ? `<button class="btn btn-ghost" data-remove-cat="${esc(c.name)}" style="font-size:10px;color:var(--text-tertiary);padding:0;height:auto">×</button>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="quick-add" style="margin-top:8px;padding:6px 12px;border:1px solid var(--divider);border-radius:var(--radius-md)">
          <input class="input" placeholder="Neue Kategorie..." id="new-cat-input">
        </div>
      </div>

      <!-- Push -->
      <div style="margin-bottom:32px">
        <div class="section-label" style="margin-bottom:12px">Benachrichtigungen</div>
        <div style="border:1px solid var(--divider);border-radius:var(--radius-md);padding:16px">
          <div style="font-size:var(--text-sm);color:${pushActive ? 'var(--green)' : 'var(--text-secondary)'};margin-bottom:10px">
            Push-Benachrichtigungen sind ${pushActive ? 'aktiv' : 'deaktiviert'}
          </div>
          <button class="btn ${pushActive ? 'btn-danger' : 'btn-primary'} btn-block" id="push-toggle">
            Push ${pushActive ? 'deaktivieren' : 'aktivieren'}
          </button>
        </div>
      </div>

      <!-- API Keys -->
      <div style="margin-bottom:32px">
        <div class="section-label" style="margin-bottom:12px">KI-Integration</div>
        <div style="border:1px solid var(--divider);border-radius:var(--radius-md);padding:16px">
          <div class="form-group">
            <label>OpenAI API Key (für Transkription)</label>
            <input id="profile-openai-key" class="input" type="password" placeholder="sk-..." value="${esc(state.userProfile.openai_key || '')}">
          </div>
          <div class="form-group">
            <label>Anthropic API Key (für Protokoll)</label>
            <input id="profile-anthropic-key" class="input" type="password" placeholder="sk-ant-..." value="${esc(state.userProfile.anthropic_key || '')}">
          </div>
          <button class="btn btn-primary btn-block" id="save-profile">Speichern</button>
          <div id="profile-save-msg" style="text-align:center;margin-top:8px;font-size:var(--text-sm);color:var(--green)"></div>
        </div>
      </div>

      <button class="btn btn-danger btn-block" id="logout-btn" style="margin-top:20px">Abmelden</button>
    </div>
  `;

  bindSettingsEvents(container);
}

function bindSettingsEvents(container) {
  // Add category
  const catInput = container.querySelector('#new-cat-input');
  catInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && catInput.value.trim()) {
      addCategory(catInput.value.trim());
      catInput.value = '';
      renderSettings(container);
    }
  });

  // Remove category
  container.querySelectorAll('[data-remove-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      removeCategory(btn.dataset.removeCat);
      renderSettings(container);
    });
  });

  // Hover on cat rows
  container.querySelectorAll('.cat-row').forEach(row => {
    row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-hover)');
    row.addEventListener('mouseleave', () => row.style.background = '');
  });

  // Dark mode toggle
  container.querySelector('#dark-mode-toggle')?.addEventListener('click', () => {
    toggleDarkMode();
    renderSettings(container);
  });

  // Push toggle
  container.querySelector('#push-toggle')?.addEventListener('click', async () => {
    try {
      if (isPushActive()) {
        await unsubscribePush();
      } else {
        await subscribePush();
      }
      renderSettings(container);
    } catch (e) {
      alert(e.message);
    }
  });

  // Save profile
  container.querySelector('#save-profile')?.addEventListener('click', async () => {
    await saveProfile(
      container.querySelector('#profile-openai-key').value.trim(),
      container.querySelector('#profile-anthropic-key').value.trim()
    );
    toastSuccess('Gespeichert');
  });

  // Logout
  container.querySelector('#logout-btn')?.addEventListener('click', logout);
}
