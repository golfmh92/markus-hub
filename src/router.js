import { state } from './state.js';

const routes = [];
let currentCleanup = null;

export function route(pattern, handler) {
  // pattern: 'today', 'tasks', 'projects/:id', 'notes/:id', etc.
  const parts = pattern.split('/');
  routes.push({ parts, handler });
}

export function navigate(path) {
  window.location.hash = '#/' + path;
}

export function currentPath() {
  return window.location.hash.replace(/^#\/?/, '') || 'today';
}

function matchRoute(path) {
  const pathParts = path.split('/').filter(Boolean);

  for (const r of routes) {
    const params = {};
    const rParts = r.parts;

    if (rParts.length !== pathParts.length) continue;

    let match = true;
    for (let i = 0; i < rParts.length; i++) {
      if (rParts[i].startsWith(':')) {
        params[rParts[i].slice(1)] = pathParts[i];
      } else if (rParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) return { handler: r.handler, params };
  }
  return null;
}

function handleRoute() {
  const path = currentPath();
  const result = matchRoute(path);

  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  if (result) {
    const viewName = path.split('/')[0];
    state.currentView = viewName;
    state.currentParams = result.params;
    currentCleanup = result.handler(result.params) || null;
  } else {
    // Default to today
    navigate('today');
  }
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  // Initial route
  handleRoute();
}
