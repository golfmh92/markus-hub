import { state } from '../state.js';
import { esc } from '../lib/dom.js';
import { fmtDate } from '../lib/date.js';
import { catColor } from '../services/categories.js';
import { quickAddNote } from '../services/notes.js';
import { navigate } from '../router.js';
import { calcExpr } from '../lib/calc.js';
import { toastSuccess } from '../components/Toast.js';

let noteCatFilter = 'all';

export function renderNotes(container) {
  const search = container.querySelector('#note-search')?.value?.toLowerCase() || '';

  let filtered = [...state.notes];
  if (noteCatFilter !== 'all') filtered = filtered.filter(n => n.category === noteCatFilter);
  if (search) filtered = filtered.filter(n => n.content.toLowerCase().includes(search));
  filtered.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.created_at) - new Date(a.created_at));

  const pinnedCount = state.notes.filter(n => n.pinned).length;

  container.innerHTML = `
    <div class="page-inner">
      <div class="view-header">
        <div class="view-header-left">
          <div class="page-title">Notizen</div>
        </div>
      </div>

      <!-- Note Stats -->
      <div class="stats-row" style="margin-bottom:16px">
        <div class="stat-card-v2" style="--stat-color:var(--accent);--stat-bg:var(--accent-bg)">
          <div class="stat-card-v2-num">${state.notes.length}</div>
          <div class="stat-card-v2-label">Gesamt</div>
          <div class="stat-card-v2-icon">📝</div>
        </div>
        <div class="stat-card-v2" style="--stat-color:var(--purple);--stat-bg:var(--purple-bg)">
          <div class="stat-card-v2-num">${pinnedCount}</div>
          <div class="stat-card-v2-label">Angepinnt</div>
          <div class="stat-card-v2-icon">📌</div>
        </div>
      </div>

      <div class="filter-toolbar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input class="input" placeholder="Suchen..." id="note-search" style="border:none;background:none;padding:0;height:auto;flex:1" value="${esc(search)}">
        <div class="filter-sep"></div>
        ${['all', ...state.categories.map(c => c.name)].map(c => {
          const label = c === 'all' ? 'Alle' : c;
          return `<button class="filter-pill ${noteCatFilter === c ? 'active' : ''}" data-ncat="${c}" style="font-size:10px;padding:2px 7px">${label}</button>`;
        }).join('')}
      </div>

      <div class="quick-add-box">
        <div class="quick-add-icon">+</div>
        <input class="input" placeholder="Schnelle Notiz..." id="note-quick-input">
        <span style="font-size:var(--text-xs);color:var(--text-tertiary)"><span class="kbd">⇧N</span></span>
      </div>

      <div class="notes-grid" id="notes-grid">
        ${filtered.length
          ? filtered.map(n => noteCardHTML(n)).join('')
          : '<div class="widget-empty" style="grid-column:1/-1"><div style="font-size:28px;margin-bottom:8px">📝</div>Noch keine Notizen</div>'}
      </div>
    </div>
  `;

  bindNotesEvents(container);
}

function noteCardHTML(n) {
  const proj = n.project_id ? state.projects.find(p => p.id === n.project_id)?.name : null;
  const preview = fmtNotePreview(n.content);

  return `
    <div class="note-card ${n.pinned ? 'pinned' : ''}" data-note-id="${n.id}">
      ${n.pinned ? '<div style="position:absolute;top:8px;right:10px;font-size:11px">📌</div>' : ''}
      <div class="note-content-preview">${preview}</div>
      <div class="note-meta">
        ${n.category ? `<span class="task-cat" style="background:${catColor(n.category)}18;color:${catColor(n.category)};font-size:10px;padding:1px 6px">${esc(n.category)}</span>` : ''}
        ${proj ? `<span>📁 ${esc(proj)}</span>` : ''}
        <span>${fmtDate(n.created_at?.split('T')[0])}</span>
      </div>
    </div>`;
}

function fmtNotePreview(s) {
  if (!s) return '';
  let text = esc(s);
  // Render markdown bold/italic
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
  // Checklists
  text = text.replace(/^\[x\]\s(.*)$/gm, '<span style="text-decoration:line-through;color:var(--text-tertiary)">✓ $1</span>');
  text = text.replace(/^\[ \]\s(.*)$/gm, '☐ $1');
  // Calc
  text = text.replace(/^(.+?)\s*=\s*\?\s*$/gm, (_, expr) => {
    const result = calcExpr(expr);
    return result !== null ? `${expr} <span style="color:var(--accent);font-weight:600">= ${result}</span>` : expr + ' = ?';
  });
  return text;
}

function bindNotesEvents(container) {
  // Quick add
  const quickInput = container.querySelector('#note-quick-input');
  quickInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && quickInput.value.trim()) {
      await quickAddNote(quickInput.value.trim());
      quickInput.value = '';
      toastSuccess('Notiz erstellt');
      renderNotes(container);
    }
  });

  // Search
  container.querySelector('#note-search')?.addEventListener('input', () => {
    renderNotes(container);
  });

  // Category filter
  container.querySelectorAll('[data-ncat]').forEach(btn => {
    btn.addEventListener('click', () => {
      noteCatFilter = btn.dataset.ncat;
      renderNotes(container);
    });
  });

  // Click note -> open detail
  container.querySelectorAll('[data-note-id]').forEach(el => {
    el.addEventListener('click', () => {
      navigate(`notes/${el.dataset.noteId}`);
    });
  });
}
