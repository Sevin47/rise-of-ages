/**
 * The map: terrain, where buildings stand on it, and the citizens walking
 * around it.
 *
 * This module owns the physical world. It deliberately owns none of the
 * economy: `sim.ts` still computes every rate, and it reads exactly two things
 * out of `GameState` — how many of each building exist, and how many citizens
 * are posted per resource. So the map's job is to be the thing that *decides*
 * those two numbers, by placing buildings on tiles and walking workers to them.
 * Everything downstream of that (ages, tracks, wonders, caps) is untouched.
 *
 * Gathering is continuous, the way Rise of Nations does it: a citizen walks to
 * a site once and then produces for as long as they stand there. There are no
 * hauling round trips, which is what lets the existing per-citizen rates carry
 * over unchanged. Travel time is the one new cost — a worker in transit is
 * producing nothing, so a mine on the far ridge really is worse than one built
 * beside the city.
 */
import { BUILDING_BY_ID } from './content';

export const TILE = 32;
export const MAP_W = 64;
export const MAP_H = 44;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export type Terrain = 'water' | 'grass' | 'forest' | 'hills' | 'desert';

/** Terrain a building must stand on. Anything else is an illegal placement. */
const NEEDS: Record<string, Terrain[]> = {
  camp: ['forest'],
  mine: ['hills'],
  well: ['desert'],
  farm: ['grass'],
};

/** Everything not named above just wants open, workable ground. */
const DEFAULT_GROUND: Terrain[] = ['grass', 'desert'];

export function groundFor(def: string): Terrain[] {
  return NEEDS[def] ?? DEFAULT_GROUND;
}

/** Footprint in tiles. Cities are the landmark, so they read larger. */
export function footprint(def: string): number {
  return def === 'city' ? 3 : 2;
}

export interface Placement {
  id: number;
  def: string;
  tx: number;
  ty: number;
}

export type Phase = 'idle' | 'walk' | 'work';

export interface Worker {
  id: number;
  /** World pixels, continuous — this is what the renderer draws. */
  x: number;
  y: number;
  post: number | null;
  phase: Phase;
  /** Remaining waypoints as tile indices, nearest first. */
  path: number[];
  /** Cosmetic only: keeps a crowd from marching in lockstep. */
  bob: number;
}

export interface GameMap {
  seed: number;
  terrain: Uint8Array;
  /** Placement id occupying each tile, or 0 for open ground. */
  occupied: Int32Array;
  placements: Placement[];
  workers: Worker[];
  nextPlacement: number;
  nextWorker: number;
}

const TERRAIN_ORDER: Terrain[] = ['water', 'grass', 'forest', 'hills', 'desert'];
const TERRAIN_CODE: Record<Terrain, number> = {
  water: 0,
  grass: 1,
  forest: 2,
  hills: 3,
  desert: 4,
};

export function terrainAt(map: GameMap, tx: number, ty: number): Terrain {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 'water';
  return TERRAIN_ORDER[map.terrain[ty * MAP_W + tx]];
}

/** Water is the only terrain nobody can cross; buildings block everything else. */
export function walkable(map: GameMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const i = ty * MAP_W + tx;
  return map.terrain[i] !== TERRAIN_CODE.water && map.occupied[i] === 0;
}

// --------------------------------------------------------------- terrain --

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Value noise: one coarse grid of random values, smoothly interpolated. Cheap,
 * deterministic from the seed, and it gives blobs that read as terrain rather
 * than the salt-and-pepper you get from per-tile randomness.
 */
function noise(rand: () => number, cols: number, rows: number): (x: number, y: number) => number {
  const grid = new Float32Array((cols + 1) * (rows + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = (x / MAP_W) * cols;
    const gy = (y / MAP_H) * rows;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = smooth(gx - x0);
    const fy = smooth(gy - y0);
    const at = (cx: number, cy: number) =>
      grid[Math.min(rows, cy) * (cols + 1) + Math.min(cols, cx)];
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const bot = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bot * fy;
  };
}

function generate(seed: number): Uint8Array {
  const rand = mulberry32(seed);
  const water = noise(rand, 5, 4);
  const wood = noise(rand, 7, 5);
  const rock = noise(rand, 9, 6);
  const dry = noise(rand, 4, 3);
  const out = new Uint8Array(MAP_W * MAP_H);

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      let t: Terrain = 'grass';
      if (water(tx, ty) < 0.3) t = 'water';
      else if (rock(tx, ty) > 0.72) t = 'hills';
      else if (wood(tx, ty) > 0.62) t = 'forest';
      else if (dry(tx, ty) > 0.74) t = 'desert';
      out[ty * MAP_W + tx] = TERRAIN_CODE[t];
    }
  }
  return out;
}

/**
 * Flatten a landing site so the opening move is never blocked by the terrain
 * roll. The first city has to have somewhere to stand, and a player staring at
 * a lake on turn one has no way to recover.
 */
function clearing(terrain: Uint8Array, cx: number, cy: number, r: number): void {
  for (let ty = cy - r; ty <= cy + r; ty++) {
    for (let tx = cx - r; tx <= cx + r; tx++) {
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      if (Math.hypot(tx - cx, ty - cy) > r) continue;
      terrain[ty * MAP_W + tx] = TERRAIN_CODE.grass;
    }
  }
}

export function newMap(seed = Math.floor(Math.random() * 2 ** 31)): GameMap {
  const terrain = generate(seed);
  const cx = Math.floor(MAP_W / 2);
  const cy = Math.floor(MAP_H / 2);
  clearing(terrain, cx, cy, 5);

  // Guarantee the two terrains the opening buildings need are within reach of
  // that clearing, so a Camp and a Mine are always placeable from turn one.
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const ring = (t: Terrain, count: number, min: number, max: number) => {
    for (let n = 0; n < count; n++) {
      const a = rand() * Math.PI * 2;
      const d = min + rand() * (max - min);
      const tx = Math.round(cx + Math.cos(a) * d);
      const ty = Math.round(cy + Math.sin(a) * d);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx;
          const y = ty + dy;
          if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
          terrain[y * MAP_W + x] = TERRAIN_CODE[t];
        }
      }
    }
  };
  ring('forest', 3, 6, 9);
  ring('hills', 2, 7, 10);

  return {
    seed,
    terrain,
    occupied: new Int32Array(MAP_W * MAP_H),
    placements: [],
    workers: [],
    nextPlacement: 1,
    nextWorker: 1,
  };
}

// ------------------------------------------------------------- placement --

/** Every tile a building of this def at this origin would cover. */
export function footprintTiles(def: string, tx: number, ty: number): number[] {
  const n = footprint(def);
  const out: number[] = [];
  for (let y = ty; y < ty + n; y++) {
    for (let x = tx; x < tx + n; x++) {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return [];
      out.push(y * MAP_W + x);
    }
  }
  return out;
}

export type PlaceError = null | 'edge' | 'ground' | 'taken';

/**
 * Whether a building may stand here, and if not, why. The caller shows the
 * reason under the cursor, so a refusal is never silent.
 */
export function placementError(map: GameMap, def: string, tx: number, ty: number): PlaceError {
  const tiles = footprintTiles(def, tx, ty);
  if (!tiles.length) return 'edge';
  const wants = groundFor(def);
  for (const i of tiles) {
    if (map.occupied[i] !== 0) return 'taken';
    const t = TERRAIN_ORDER[map.terrain[i]];
    if (t === 'water') return 'ground';
    if (!wants.includes(t)) return 'ground';
  }
  return null;
}

export function place(map: GameMap, def: string, tx: number, ty: number): Placement | null {
  if (placementError(map, def, tx, ty)) return null;
  const p: Placement = { id: map.nextPlacement++, def, tx, ty };
  map.placements.push(p);
  for (const i of footprintTiles(def, tx, ty)) map.occupied[i] = p.id;
  return p;
}

export function removePlacement(map: GameMap, id: number): Placement | null {
  const idx = map.placements.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const p = map.placements[idx];
  map.placements.splice(idx, 1);
  for (const i of footprintTiles(p.def, p.tx, p.ty)) {
    if (map.occupied[i] === id) map.occupied[i] = 0;
  }
  // Anyone posted there is out of a job and goes idle where they stand.
  for (const w of map.workers) {
    if (w.post === id) {
      w.post = null;
      w.phase = 'idle';
      w.path = [];
    }
  }
  return p;
}

export function placementAt(map: GameMap, tx: number, ty: number): Placement | null {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return null;
  const id = map.occupied[ty * MAP_W + tx];
  if (!id) return null;
  return map.placements.find((p) => p.id === id) ?? null;
}

export function placementById(map: GameMap, id: number): Placement | null {
  return map.placements.find((p) => p.id === id) ?? null;
}

/** World-pixel centre of a placement, which is where its workers gather. */
export function centreOf(p: Placement): { x: number; y: number } {
  const n = footprint(p.def);
  return { x: (p.tx + n / 2) * TILE, y: (p.ty + n / 2) * TILE };
}

/**
 * How many citizens this building can hold. The number comes straight from the
 * existing content table, so the per-building cap on the map adds up to exactly
 * the aggregate slot count `sim.ts` already enforced.
 */
export function slotsOf(def: string): number {
  return BUILDING_BY_ID.get(def)?.produces?.slots ?? 0;
}

// ----------------------------------------------------------- persistence --

export interface SavedMap {
  seed: number;
  /** One digit per tile. 2,816 characters, which JSON handles happily. */
  terrain: string;
  placements: Placement[];
  workers: { x: number; y: number; post: number | null }[];
  nextPlacement: number;
  nextWorker: number;
}

export function serializeMap(map: GameMap): SavedMap {
  let terrain = '';
  for (let i = 0; i < map.terrain.length; i++) terrain += String.fromCharCode(48 + map.terrain[i]);
  return {
    seed: map.seed,
    terrain,
    placements: map.placements.map((p) => ({ ...p })),
    // Phase and path are not saved: a posted citizen is restored already at
    // work, which is where they would have been by the time you came back.
    workers: map.workers.map((w) => ({ x: w.x, y: w.y, post: w.post })),
    nextPlacement: map.nextPlacement,
    nextWorker: map.nextWorker,
  };
}

export function deserializeMap(raw: unknown): GameMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<SavedMap>;
  if (typeof s.seed !== 'number' || typeof s.terrain !== 'string') return null;
  if (s.terrain.length !== MAP_W * MAP_H) return null;

  const terrain = new Uint8Array(MAP_W * MAP_H);
  for (let i = 0; i < terrain.length; i++) {
    const v = s.terrain.charCodeAt(i) - 48;
    terrain[i] = v >= 0 && v < TERRAIN_ORDER.length ? v : 1;
  }

  const map: GameMap = {
    seed: s.seed,
    terrain,
    occupied: new Int32Array(MAP_W * MAP_H),
    placements: [],
    workers: [],
    nextPlacement: 1,
    nextWorker: 1,
  };

  for (const p of Array.isArray(s.placements) ? s.placements : []) {
    if (!p || typeof p.id !== 'number' || typeof p.def !== 'string') continue;
    if (!BUILDING_BY_ID.has(p.def)) continue;
    const tiles = footprintTiles(p.def, p.tx, p.ty);
    if (!tiles.length) continue;
    map.placements.push({ id: p.id, def: p.def, tx: p.tx, ty: p.ty });
    for (const i of tiles) map.occupied[i] = p.id;
  }

  const live = new Set(map.placements.map((p) => p.id));
  for (const w of Array.isArray(s.workers) ? s.workers : []) {
    if (!w || typeof w.x !== 'number' || typeof w.y !== 'number') continue;
    const post = typeof w.post === 'number' && live.has(w.post) ? w.post : null;
    map.workers.push({
      id: map.nextWorker++,
      x: w.x,
      y: w.y,
      post,
      phase: post === null ? 'idle' : 'work',
      path: [],
      bob: Math.random() * 6,
    });
  }

  map.nextPlacement = Math.max(
    typeof s.nextPlacement === 'number' ? s.nextPlacement : 1,
    ...map.placements.map((p) => p.id + 1),
    1,
  );
  return map;
}
