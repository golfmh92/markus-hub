// DOM utilities

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Render HTML string into a container, replacing its content
export function render(container, html) {
  if (typeof container === 'string') container = $(container);
  if (!container) return;
  container.innerHTML = html;
}

// Create element from HTML string
export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstChild;
}
