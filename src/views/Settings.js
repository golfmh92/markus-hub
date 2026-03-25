import { state } from '../state.js';
import { esc } from '../lib/dom.js';
import { DEFAULT_CATEGORIES } from '../state.js';
import { addCategory, removeCategory } from '../services/categories.js';
import { saveProfile } from '../services/profile.js';
import { initPush, isPushActive, subscribePush, unsubscribePush } from '../services/push.js';
import { logout } from '../services/auth.js';

export function renderSettings(container) {
  const done = state.tasks.filter(t => t.done).length;
  const open = state.tasks.filter(t => !t.done).length;
  const pushActive = isPushActive();

  container.innerHTML = `
    <div class="page-inner">
      <div class="page-title" style="margin-bottom: 24px;">Einstellungen</div>

      <!-- Profile -->
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:32px">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff">
          ${(state.currentUser?.email || '?')[0].toUpperCase()}
        </div>
        <div>
          <div style="font-size:var(--text-base);font-weight:600">${esc(state.currentUser?.email)}</div>
          <div style="font-size:var(--text-sm);color:var(--text-secondary)">${open} offene Tasks · ${done} erledigt · ${state.projects.length} Projekte</div>
        </div>
      </div>

      <!-- Categories -->
      <div style="margin-bottom:32px">
        <div class="section-label" style="margin-bottom:12px">Kategorien</div>
        <div id="cat-list">
          ${state.categories.map(c => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--radius);transition:background .1s" class="cat-row">
              <div style="width:10px;height:10px;border-radius:50%;background:${c.color};flex-shrink:0"></div>
              <div style="flex:1;font-size:var(--text-sm)">${esc(c.name)}</div>
              ${!DEFAULT_CATEGORIES.find(d => d.name === c.name) ? `<button class="btn btn-ghost" data-remove-cat="${esc(c.name)}" style="font-size:var(--text-xs);color:var(--text-tertiary)">×</button>` : ''}
            </div>
          `).join('')}
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
    const msg = container.querySelector('#profile-save-msg');
    if (msg) {
      msg.textContent = 'Gespeichert ✓';
      setTimeout(() => { msg.textContent = ''; }, 2000);
    }
  });

  // Logout
  container.querySelector('#logout-btn')?.addEventListener('click', logout);
}
