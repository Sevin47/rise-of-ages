import { serializeMap } from './map';
import { reconcile, type GameState } from './state';

const KEY = 'rise-of-ages/save/v1';

/** Typed arrays do not survive JSON, so the map goes out in its packed form. */
function toSaveable(state: GameState): unknown {
  return { ...state, map: serializeMap(state.map) };
}

export function save(state: GameState): void {
  state.savedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(toSaveable(state)));
  } catch {
    // Private browsing or a full quota. Losing a save beats crashing the tab.
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return reconcile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function wipe(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

export function exportSave(state: GameState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(toSaveable(state)))));
}

export function importSave(text: string): GameState | null {
  try {
    return reconcile(JSON.parse(decodeURIComponent(escape(atob(text.trim())))));
  } catch {
    return null;
  }
}
