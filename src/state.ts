import { BASE, RESOURCES, TRACKS, type ResourceId, type TrackId } from './content';
import {
  deserializeMap,
  MAP_H,
  MAP_W,
  newMap,
  place,
  type GameMap,
} from './map';

export interface LogLine {
  t: number;
  msg: string;
  kind: 'age' | 'build' | 'tech' | 'wonder' | 'warn';
}

export interface GameState {
  version: number;
  age: number;
  /** Current stock of each resource. */
  res: Record<ResourceId, number>;
  /** How many of each building have been raised. */
  buildings: Record<string, number>;
  /** Citizens posted to each resource line. Idle citizens are the remainder. */
  jobs: Record<ResourceId, number>;
  citizens: number;
  tracks: Record<TrackId, number>;
  /** Wonder ids already completed. */
  wonders: string[];
  /** Rare good ids currently running on a trade route. */
  routes: string[];
  /** Banked prestige points. Each is a permanent global output bonus. */
  legacy: number;
  /** Dynasties completed, purely for the record. */
  dynasties: number;
  startedAt: number;
  savedAt: number;
  log: LogLine[];
  /**
   * The physical world. `buildings` and `jobs` above are recomputed from this
   * every frame by `units.syncToState`, so the map is the source of truth for
   * both and they are kept only because `sim.ts` reads them.
   */
  map: GameMap;
}

function zeroed<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
}

export const SAVE_VERSION = 1;

export function newGame(legacy = 0, dynasties = 0): GameState {
  const res = zeroed(RESOURCES.map((r) => r.id));
  for (const [id, amount] of Object.entries(BASE.startResources)) {
    res[id as ResourceId] = amount as number;
  }
  const now = Date.now();
  const map = newMap();
  // The opening city goes in the middle of the guaranteed clearing, so the
  // first thing the player sees is their own nation rather than empty ground.
  place(map, 'city', Math.floor(MAP_W / 2) - 1, Math.floor(MAP_H / 2) - 1);
  return {
    version: SAVE_VERSION,
    age: 0,
    res,
    buildings: { city: 1 },
    jobs: zeroed(RESOURCES.map((r) => r.id)),
    citizens: BASE.citizens,
    tracks: zeroed(TRACKS.map((t) => t.id)),
    wonders: [],
    routes: [],
    legacy,
    dynasties,
    startedAt: now,
    savedAt: now,
    log: [
      {
        t: now,
        kind: 'age',
        msg: 'Your people settle by the river. Three of them, and a great deal of forest.',
      },
    ],
    map,
  };
}

export function log(state: GameState, kind: LogLine['kind'], msg: string): void {
  state.log.unshift({ t: Date.now(), kind, msg });
  if (state.log.length > 60) state.log.length = 60;
}

/**
 * Fold a loaded save onto a fresh one so a save written by an older build never
 * arrives with missing keys. Anything unrecognised is dropped.
 */
export function reconcile(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const saved = raw as Partial<GameState>;
  if (typeof saved.age !== 'number' || typeof saved.citizens !== 'number') return null;

  const base = newGame(saved.legacy ?? 0, saved.dynasties ?? 0);
  const state: GameState = {
    ...base,
    age: Math.max(0, Math.min(saved.age, 7)),
    citizens: Math.max(0, saved.citizens),
    wonders: Array.isArray(saved.wonders) ? saved.wonders.filter((w) => typeof w === 'string') : [],
    routes: Array.isArray(saved.routes) ? saved.routes.filter((r) => typeof r === 'string') : [],
    startedAt: saved.startedAt ?? base.startedAt,
    savedAt: saved.savedAt ?? Date.now(),
    log: Array.isArray(saved.log) ? saved.log.slice(0, 60) : base.log,
    buildings: {},
  };

  for (const r of RESOURCES) {
    const v = saved.res?.[r.id];
    state.res[r.id] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0;
    const j = saved.jobs?.[r.id];
    state.jobs[r.id] = typeof j === 'number' && Number.isFinite(j) ? Math.max(0, Math.floor(j)) : 0;
  }
  for (const t of TRACKS) {
    const v = saved.tracks?.[t.id];
    state.tracks[t.id] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  }
  for (const [id, n] of Object.entries(saved.buildings ?? {})) {
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) state.buildings[id] = Math.floor(n);
  }
  if (!state.buildings.city) state.buildings.city = 1;

  // A save written before the map existed has no world to restore. Rather than
  // throw the run away, generate one and re-found the city on it; the economy
  // carries over intact and the player replaces the layout as they go.
  const restored = deserializeMap((saved as { map?: unknown }).map);
  if (restored && restored.placements.length) {
    state.map = restored;
  } else {
    state.map = newMap();
    place(state.map, 'city', Math.floor(MAP_W / 2) - 1, Math.floor(MAP_H / 2) - 1);
  }

  return state;
}
