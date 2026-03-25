import { state } from '../state.js';
import { esc } from '../lib/dom.js';
import { navigate } from '../router.js';
import { saveNote, deleteNote } from '../services/notes.js';
import { catColor } from '../services/categories.js';
import { icons } from '../lib/icons.js';
import { toastSuccess } from '../components/Toast.js';
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

      <div class="floating-toolbar" id="editor-toolbar">
        <button class="tb-btn" data-cmd="bold" title="Fett"><b>B</b></button>
        <button class="tb-btn" data-cmd="italic" title="Kursiv"><i>I</i></button>
        <span class="tb-sep"></span>
        <button class="tb-btn" data-cmd="heading" title="Überschrift">H</button>
        <button class="tb-btn" data-cmd="bulletList" title="Liste">•</button>
        <button class="tb-btn" data-cmd="orderedList" title="Nummerierung">1.</button>
        <button class="tb-btn" data-cmd="taskList" title="Checkliste">☑</button>
        <span class="tb-sep"></span>
        <button class="tb-btn" data-cmd="codeBlock" title="Code">&lt;/&gt;</button>
        <button class="tb-btn" data-cmd="blockquote" title="Zitat">❝</button>
        <button class="tb-btn" data-cmd="horizontalRule" title="Trennlinie">—</button>
      </div>

      <div id="tiptap-editor" style="min-height: 400px;"></div>

      <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:8px">
        <span style="flex:1;font-size:var(--text-xs);color:var(--text-tertiary);align-self:center">Tippe <span class="kbd">/</span> für Befehle</span>
        <button class="btn btn-primary" id="nd-save">Speichern <span class="kbd" style="margin-left:4px;background:rgba(255,255,255,0.2);border-color:rgba(255,255,255,0.3);color:#fff">⌘↵</span></button>
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

  // Toolbar buttons
  container.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!editor) return;
      const cmd = btn.dataset.cmd;
      switch (cmd) {
        case 'bold': editor.chain().focus().toggleBold().run(); break;
        case 'italic': editor.chain().focus().toggleItalic().run(); break;
        case 'heading': editor.chain().focus().toggleHeading({ level: 2 }).run(); break;
        case 'bulletList': editor.chain().focus().toggleBulletList().run(); break;
        case 'orderedList': editor.chain().focus().toggleOrderedList().run(); break;
        case 'taskList': editor.chain().focus().toggleTaskList().run(); break;
        case 'codeBlock': editor.chain().focus().toggleCodeBlock().run(); break;
        case 'blockquote': editor.chain().focus().toggleBlockquote().run(); break;
        case 'horizontalRule': editor.chain().focus().setHorizontalRule().run(); break;
      }
      updateToolbarState(container);
    });
  });

  // Update toolbar active states on selection change
  if (editor) {
    editor.on('selectionUpdate', () => updateToolbarState(container));
    editor.on('update', () => updateToolbarState(container));
  }

  // Save
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
    toastSuccess('Notiz gespeichert');
    navigate('notes');
  });

  container.querySelector('#nd-delete')?.addEventListener('click', async () => {
    await deleteNote(note.id);
    toastSuccess('Notiz gelöscht');
    navigate('notes');
  });
}

function updateToolbarState(container) {
  if (!editor) return;
  container.querySelectorAll('[data-cmd]').forEach(btn => {
    const cmd = btn.dataset.cmd;
    let active = false;
    switch (cmd) {
      case 'bold': active = editor.isActive('bold'); break;
      case 'italic': active = editor.isActive('italic'); break;
      case 'heading': active = editor.isActive('heading'); break;
      case 'bulletList': active = editor.isActive('bulletList'); break;
      case 'orderedList': active = editor.isActive('orderedList'); break;
      case 'taskList': active = editor.isActive('taskList'); break;
      case 'codeBlock': active = editor.isActive('codeBlock'); break;
      case 'blockquote': active = editor.isActive('blockquote'); break;
    }
    btn.classList.toggle('active', active);
  });
}
