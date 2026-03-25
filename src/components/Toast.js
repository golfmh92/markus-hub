// Toast notification system

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

export function toast(message, type = 'info', duration = 3000) {
  const c = ensureContainer();
  const el = document.createElement('div');
  el.className = `toast ${type !== 'info' ? `toast-${type}` : ''}`;
  el.textContent = message;
  c.appendChild(el);

  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

export function toastSuccess(message) { toast(message, 'success'); }
export function toastError(message) { toast(message, 'error'); }
