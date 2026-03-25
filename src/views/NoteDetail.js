import { state } from '../state.js';
import { esc } from '../lib/dom.js';
import { navigate } from '../router.js';
import { saveNote, deleteNote } from '../services/notes.js';
import { catColor } from '../services/categories.js';
import { icons } from '../lib/icons.js';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';

let editor = null;

export function renderNoteDetail(container, { id }) {
  const n = state.notes.find(n => n.id === id);
  if (!n) {
    navigate('notes');
    return;
  }

  const proj = n.project_id ? state.projects.find(p => p.id === n.project_id) : null;

  container.innerHTML = `
    <div class="page-inner">
      <div class="breadcrumb">
        <a data-back>Notizen</a>
        <span class="breadcrumb-sep">/</span>
        <span>${n.category || 'Notiz'}</span>
      </div>

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <div style="flex:1">
          ${n.pinned ? '<span style="font-size:12px">📌 Angepinnt</span>' : ''}
          ${n.category ? `<span class="badge" style="background:${catColor(n.category)}18;color:${catColor(n.category)}">${esc(n.category)}</span>` : ''}
          ${proj ? `<span class="badge" style="background:var(--bg-secondary)">📁 ${esc(proj.name)}</span>` : ''}
        </div>
        <div style="display:flex;gap:4px;">
          <select id="nd-cat" class="input" style="width:auto;height:28px;font-size:12px;padding:2px 24px 2px 8px">
            <option value="">Keine Kategorie</option>
            ${state.categories.map(c => `<option value="${esc(c.name)}" ${n.category === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
          <select id="nd-project" class="input" style="width:auto;height:28px;font-size:12px;padding:2px 24px 2px 8px">
            <option value="">Kein Projekt</option>
            ${state.projects.filter(p => !p.archived).map(p => `<option value="${p.id}" ${n.project_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;margin:0;cursor:pointer">
            <input type="checkbox" id="nd-pinned" ${n.pinned ? 'checked' : ''} style="width:14px;height:14px"> Pin
          </label>
          <button class="btn btn-danger" id="nd-delete" style="font-size:12px;height:28px">${icons.trash}</button>
        </div>
      </div>

      <div id="tiptap-editor" style="min-height: 400px;"></div>

      <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-primary" id="nd-save">Speichern</button>
      </div>
    </div>
  `;

  // Initialize Tiptap
  initEditor(container, n);
  bindNoteDetailEvents(container, n);

  return () => {
    if (editor) {
      editor.destroy();
      editor = null;
    }
  };
}

function initEditor(container, note) {
  const el = container.querySelector('#tiptap-editor');
  if (!el) return;

  if (editor) {
    editor.destroy();
    editor = null;
  }

  // Convert stored markdown-like text to HTML for Tiptap
  const html = textToTiptapHTML(note.content);

  editor = new Editor({
    element: el,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Schreibe hier...' }),
    ],
    content: html,
    editorProps: {
      attributes: {
        style: 'outline:none;min-height:400px;font-size:15px;line-height:1.7;color:var(--text-primary)',
      },
    },
  });
}

function textToTiptapHTML(text) {
  if (!text) return '<p></p>';
  // If already HTML, return as-is
  if (/<[a-z][\s\S]*>/i.test(text)) return text;

  const lines = text.split('\n');
  let html = '';
  let inUl = false;
  let inOl = false;
  let inTaskList = false;

  for (const line of lines) {
    const cbMatch = /^\[([ x])\]\s(.*)/.exec(line);
    const bullet = /^[-•]\s(.*)/.exec(line);
    const numbered = /^(\d+)\.\s(.*)/.exec(line);

    if (cbMatch) {
      if (!inTaskList) {
        if (inUl) { html += '</ul>'; inUl = false; }
        if (inOl) { html += '</ol>'; inOl = false; }
        html += '<ul data-type="taskList">';
        inTaskList = true;
      }
      const checked = cbMatch[1] === 'x';
      html += `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox" ${checked ? 'checked' : ''}></label><div><p>${escHTML(cbMatch[2])}</p></div></li>`;
    } else if (bullet) {
      if (inTaskList) { html += '</ul>'; inTaskList = false; }
      if (!inUl) {
        if (inOl) { html += '</ol>'; inOl = false; }
        html += '<ul>';
        inUl = true;
      }
      html += `<li><p>${escHTML(bullet[1])}</p></li>`;
    } else if (numbered) {
      if (inTaskList) { html += '</ul>'; inTaskList = false; }
      if (!inOl) {
        if (inUl) { html += '</ul>'; inUl = false; }
        html += '<ol>';
        inOl = true;
      }
      html += `<li><p>${escHTML(numbered[2])}</p></li>`;
    } else {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
      if (inTaskList) { html += '</ul>'; inTaskList = false; }
      if (line.trim() === '') {
        html += '<p></p>';
      } else {
        html += `<p>${escHTML(line)}</p>`;
      }
    }
  }
  if (inUl) html += '</ul>';
  if (inOl) html += '</ol>';
  if (inTaskList) html += '</ul>';

  // Bold/italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');

  return html;
}

function tiptapHTMLToText(html) {
  const div = document.createElement('div');
  div.innerHTML = html;

  // Task lists
  div.querySelectorAll('ul[data-type="taskList"]').forEach(ul => {
    const items = ul.querySelectorAll('li[data-type="taskItem"]');
    const text = Array.from(items).map(li => {
      const checked = li.getAttribute('data-checked') === 'true';
      const content = li.querySelector('div p')?.textContent?.trim() || li.textContent.trim();
      return (checked ? '[x] ' : '[ ] ') + content;
    }).join('\n');
    ul.replaceWith(document.createTextNode(text + '\n'));
  });

  // Bold/italic
  div.querySelectorAll('strong, b').forEach(el => {
    el.replaceWith(document.createTextNode('**' + el.textContent + '**'));
  });
  div.querySelectorAll('em, i').forEach(el => {
    el.replaceWith(document.createTextNode('*' + el.textContent + '*'));
  });

  // Regular lists
  div.querySelectorAll('ul').forEach(ul => {
    const items = ul.querySelectorAll('li');
    const text = Array.from(items).map(li => '- ' + li.textContent.trim()).join('\n');
    ul.replaceWith(document.createTextNode(text + '\n'));
  });
  div.querySelectorAll('ol').forEach(ol => {
    const items = ol.querySelectorAll('li');
    const text = Array.from(items).map((li, i) => (i + 1) + '. ' + li.textContent.trim()).join('\n');
    ol.replaceWith(document.createTextNode(text + '\n'));
  });

  // Paragraphs to newlines
  div.querySelectorAll('p').forEach(p => {
    p.insertAdjacentText('afterend', '\n');
  });

  return div.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

function escHTML(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function bindNoteDetailEvents(container, note) {
  container.querySelector('[data-back]')?.addEventListener('click', () => navigate('notes'));

  container.querySelector('#nd-save')?.addEventListener('click', async () => {
    if (!editor) return;
    const content = tiptapHTMLToText(editor.getHTML());
    await saveNote({
      id: note.id,
      content,
      category: container.querySelector('#nd-cat').value || null,
      project_id: container.querySelector('#nd-project').value || null,
      pinned: container.querySelector('#nd-pinned').checked,
    });
    navigate('notes');
  });

  container.querySelector('#nd-delete')?.addEventListener('click', async () => {
    await deleteNote(note.id);
    navigate('notes');
  });
}
