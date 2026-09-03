/**
 * Player preferences.
 *
 * These live under their own storage key, deliberately not inside the save.
 * Settings are about the person at the keyboard, not about the nation, so they
 * have to survive starting a new nation, importing someone else's save, and
 * "Erase everything" — all of which replace or destroy the game state.
 */

const KEY = 'rise-of-ages/settings/v1';

export interface Settings {
  sound: boolean;
  music: boolean;
}

const DEFAULTS: Settings = {
  sound: true,
  // Background music is the more intrusive of the two and the easier to get
  // wrong on someone else's speakers, so it starts off and is opted into.
  music: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULTS.sound,
      music: typeof saved.music === 'boolean' ? saved.music : DEFAULTS.music,
    };
  } catch {
    // Private browsing, or a value someone hand-edited into nonsense.
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Losing a preference beats crashing the tab.
  }
}
