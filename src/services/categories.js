import { state, DEFAULT_CATEGORIES, PROJECT_COLORS } from '../state.js';

export function loadCategories() {
  const key = `loom_cats_${state.currentUser.id}`;
  const stored = localStorage.getItem(key);
  if (stored) {
    try { state.categories = JSON.parse(stored); } catch { state.categories = [...DEFAULT_CATEGORIES]; }
  } else {
    // Migrate from old "hub_cats_" key
    const oldKey = `hub_cats_${state.currentUser.id}`;
    const oldStored = localStorage.getItem(oldKey);
    if (oldStored) {
      try { state.categories = JSON.parse(oldStored); } catch { state.categories = [...DEFAULT_CATEGORIES]; }
    } else {
      state.categories = [...DEFAULT_CATEGORIES];
    }
  }
}

export function saveCategories() {
  localStorage.setItem(`loom_cats_${state.currentUser.id}`, JSON.stringify(state.categories));
}

export function addCategory(name) {
  if (!name || state.categories.find(c => c.name === name)) return;
  const usedColors = new Set(state.categories.map(c => c.color));
  const available = PROJECT_COLORS.filter(c => !usedColors.has(c));
  const color = available.length > 0 ? available[0] : PROJECT_COLORS[state.categories.length % PROJECT_COLORS.length];
  state.categories = [...state.categories, { name, color }];
  saveCategories();
}

export function removeCategory(name) {
  if (DEFAULT_CATEGORIES.find(c => c.name === name)) return;
  state.categories = state.categories.filter(c => c.name !== name);
  saveCategories();
}

export function catColor(name) {
  const c = state.categories.find(c => c.name === name);
  return c ? c.color : '#7c5cff';
}
