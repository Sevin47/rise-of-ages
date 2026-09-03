/**
 * Citizens as units: getting them to a job, moving them there, and telling the
 * simulation what they add up to.
 *
 * The contract with `sim.ts` is narrow on purpose. Once a frame, `syncToState`
 * writes two things into `GameState`: how many of each building exist, and how
 * many citizens are *actually standing at* a producing building, per resource.
 * `derive()` then runs exactly as it always did. Nothing here knows a rate.
 *
 * The one economic consequence of putting citizens on a map is that walking is
 * not working. A citizen crossing the valley contributes nothing until they
 * arrive, which is the cost that makes placement a real decision.
 */
import { BUILDING_BY_ID, RESOURCES, type ResourceId } from './content';
import {
  centreOf,
  footprint,
  MAP_W,
  MAP_H,
  placementById,
  slotsOf,
  terrainAt,
  TILE,
  walkable,
  type Terrain,
  type GameMap,
  type Placement,
  type Worker,
} from './map';
import type { GameState } from './state';

/** World pixels per second. Tuned so crossing the starting valley reads as a real trip. */
export const SPEED = 61;

// ---------------------------------------------------------------- paths --

/** Walkable tiles bordering a building, which is as close as anyone can get. */
function approachTiles(map: GameMap, p: Placement): number[] {
  const n = footprint(p.def);
  const out: number[] = [];
  for (let d = -1; d <= n; d++) {
    const ring: [number, number][] = [
      [p.tx + d, p.ty - 1],
      [p.tx + d, p.ty + n],
      [p.tx - 1, p.ty + d],
      [p.tx + n, p.ty + d],
    ];
    for (const [x, y] of ring) {
      if (walkable(map, x, y)) out.push(y * MAP_W + x);
    }
  }
  return out;
}

/**
 * A* to the nearest tile in `goals`. The grid is small (64x44) and workers only
 * repath when they are given a new job, so the simple version is plenty.
 */
function findPath(map: GameMap, start: number, goals: number[]): number[] | null {
  if (!goals.length) return null;
  const goalSet = new Set(goals);
  if (goalSet.has(start)) return [];

  const gx = goals.map((g) => g % MAP_W);
  const gy = goals.map((g) => Math.floor(g / MAP_W));
  const heuristic = (i: number) => {
    const x = i % MAP_W;
    const y = Math.floor(i / MAP_W);
    let best = Infinity;
    for (let k = 0; k < goals.length; k++) {
      const d = Math.abs(x - gx[k]) + Math.abs(y - gy[k]);
      if (d < best) best = d;
    }
    return best;
  };

  const size = MAP_W * MAP_H;
  const came = new Int32Array(size).fill(-1);
  const gScore = new Float32Array(size).fill(Infinity);
  const seen = new Uint8Array(size);
  gScore[start] = 0;

  // A plain binary heap; the alternative is a linear scan that shows up as a
  // stutter once the map is busy.
  const heap: number[] = [start];
  const fScore = new Float32Array(size).fill(Infinity);
  fScore[start] = heuristic(start);
  const swap = (a: number, b: number) => {
    const t = heap[a];
    heap[a] = heap[b];
    heap[b] = t;
  };
  const push = (i: number) => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (fScore[heap[p]] <= fScore[heap[c]]) break;
      swap(p, c);
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1;
        const r = l + 1;
        let s = p;
        if (l < heap.length && fScore[heap[l]] < fScore[heap[s]]) s = l;
        if (r < heap.length && fScore[heap[r]] < fScore[heap[s]]) s = r;
        if (s === p) break;
        swap(s, p);
        p = s;
      }
    }
    return top;
  };

  while (heap.length) {
    const cur = pop();
    if (seen[cur]) continue;
    seen[cur] = 1;
    if (goalSet.has(cur)) {
      const path: number[] = [];
      for (let i = cur; i !== start && i !== -1; i = came[i]) path.push(i);
      path.reverse();
      return path;
    }
    const cx = cur % MAP_W;
    const cy = Math.floor(cur / MAP_W);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walkable(map, nx, ny)) continue;
      const ni = ny * MAP_W + nx;
      const next = gScore[cur] + 1;
      if (next >= gScore[ni]) continue;
      came[ni] = cur;
      gScore[ni] = next;
      fScore[ni] = next + heuristic(ni);
      push(ni);
    }
  }
  return null;
}

// -------------------------------------------------------------- posting --

function tileOf(w: Worker): number {
  const tx = Math.max(0, Math.min(MAP_W - 1, Math.floor(w.x / TILE)));
  const ty = Math.max(0, Math.min(MAP_H - 1, Math.floor(w.y / TILE)));
  return ty * MAP_W + tx;
}

/** Nearest walkable tile to a worker who has ended up standing on a blocked one. */
function nearestOpen(map: GameMap, from: number): number {
  if (walkable(map, from % MAP_W, Math.floor(from / MAP_W))) return from;
  const fx = from % MAP_W;
  const fy = Math.floor(from / MAP_W);
  for (let r = 1; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (walkable(map, fx + dx, fy + dy)) return (fy + dy) * MAP_W + (fx + dx);
      }
    }
  }
  return from;
}

/**
 * Send one citizen to a building. Fails if the building is full or if no route
 * exists, and says so rather than leaving a worker walking into a lake.
 */
export function post(map: GameMap, w: Worker, target: Placement): boolean {
  if (postedAtExcluding(map, target.id, w.id) >= slotsOf(target.def)) return false;
  const path = findPath(map, nearestOpen(map, tileOf(w)), approachTiles(map, target));
  if (path === null) return false;
  w.post = target.id;
  w.phase = 'walk';
  w.path = path;
  return true;
}

function postedAtExcluding(map: GameMap, id: number, exceptWorker: number): number {
  let n = 0;
  for (const w of map.workers) if (w.post === id && w.id !== exceptWorker) n++;
  return n;
}

export function unpost(w: Worker): void {
  w.post = null;
  w.phase = 'idle';
  w.path = [];
}

/** Free citizens, nearest to a point first — so "post one here" picks sensibly. */
export function idleWorkers(map: GameMap, near?: { x: number; y: number }): Worker[] {
  const free = map.workers.filter((w) => w.post === null);
  if (near) free.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
  return free;
}

/** Fill a building to its slot count from the nearest idle citizens. */
export function fill(map: GameMap, target: Placement): number {
  const room = slotsOf(target.def) - postedAt(map, target.id);
  if (room <= 0) return 0;
  const c = centreOf(target);
  let sent = 0;
  for (const w of idleWorkers(map, c)) {
    if (sent >= room) break;
    if (post(map, w, target)) sent++;
  }
  return sent;
}

export function emptyBuilding(map: GameMap, id: number): number {
  let freed = 0;
  for (const w of map.workers) {
    if (w.post === id) {
      unpost(w);
      freed++;
    }
  }
  return freed;
}

export function postedAt(map: GameMap, id: number): number {
  let n = 0;
  for (const w of map.workers) if (w.post === id) n++;
  return n;
}

/**
 * Citizens actually standing at a building. This is what produces — the ones
 * still walking are posted but earning nothing, so the panel must not count
 * them or it promises output the player is not receiving yet.
 */
export function workingAt(map: GameMap, id: number): number {
  let n = 0;
  for (const w of map.workers) if (w.post === id && w.phase === 'work') n++;
  return n;
}

/**
 * Spread every idle citizen over whatever posts are open, nearest job first.
 * This is the map equivalent of the old auto-assign button.
 */
export function autoPost(map: GameMap): number {
  let sent = 0;
  const open = map.placements.filter((p) => slotsOf(p.def) > postedAt(map, p.id));
  for (const p of open) sent += fill(map, p);
  return sent;
}

export function recallAll(map: GameMap): void {
  for (const w of map.workers) unpost(w);
}

// -------------------------------------------------------------- movement --

// Ambling is much slower than commuting: a citizen crossing the valley to a new
// job is travelling, a citizen at work is pottering about.
const WORK_SPEED = 26;
const IDLE_SPEED = 17;

/** Terrain a building's crew actually goes out to work on. */
const WORKS_ON: Partial<Record<string, Terrain>> = {
  camp: 'forest',
  mine: 'hills',
  farm: 'grass',
  well: 'desert',
};

/** A random open point inside a tile, so nobody stands dead centre. */
function pointInTile(tx: number, ty: number): { x: number; y: number } {
  return {
    x: (tx + 0.2 + Math.random() * 0.6) * TILE,
    y: (ty + 0.2 + Math.random() * 0.6) * TILE,
  };
}

/**
 * Somewhere for a working citizen to go next: either a patch of the terrain
 * their building lives off — trees for a camp, rock for a mine, open field for
 * a farm — or a spot beside the building itself, as though carrying something
 * back. Alternating between the two is what makes a site look worked rather
 * than merely occupied.
 */
function workTarget(map: GameMap, p: Placement): { x: number; y: number } {
  const wants = WORKS_ON[p.def];
  const n = footprint(p.def);

  if (wants && Math.random() < 0.62) {
    // Search outward for the right ground, so a crew works the nearest trees
    // rather than a random tree on the far side of the wood.
    for (let r = 1; r <= 4; r++) {
      const found: [number, number][] = [];
      for (let dy = -r; dy <= r + n; dy++) {
        for (let dx = -r; dx <= r + n; dx++) {
          const tx = p.tx + dx;
          const ty = p.ty + dy;
          if (!walkable(map, tx, ty)) continue;
          if (terrainAt(map, tx, ty) !== wants) continue;
          found.push([tx, ty]);
        }
      }
      if (found.length) {
        const [tx, ty] = found[Math.floor(Math.random() * found.length)];
        return pointInTile(tx, ty);
      }
    }
  }

  // Fall back to milling around the building.
  const c = centreOf(p);
  const a = Math.random() * Math.PI * 2;
  const d = (n * TILE) / 2 + 4 + Math.random() * 12;
  return { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
}

/** Somewhere for an unemployed citizen to drift to, near where they already are. */
function idleTarget(map: GameMap, w: Worker, home: { x: number; y: number } | null): { x: number; y: number } {
  const anchor = home ?? { x: w.x, y: w.y };
  for (let attempt = 0; attempt < 8; attempt++) {
    const a = Math.random() * Math.PI * 2;
    const d = 20 + Math.random() * 130;
    const x = anchor.x + Math.cos(a) * d;
    const y = anchor.y + Math.sin(a) * d;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (walkable(map, tx, ty)) return { x, y };
  }
  return { x: w.x, y: w.y };
}

/**
 * Step toward a point, refusing to walk onto blocked ground. Ambling is
 * straight-line rather than pathfound — these are short local hops and A* for
 * every one of them would be absurd — but a straight line between two open
 * points can still cut through a building, and villagers strolling over the
 * castle roof looked exactly as wrong as it sounds. Blocked means the walk is
 * abandoned and a new destination picked next tick.
 */
function stepToward(
  map: GameMap,
  w: Worker,
  tgt: { x: number; y: number },
  speed: number,
  dt: number,
): boolean {
  const dx = tgt.x - w.x;
  const dy = tgt.y - w.y;
  const d = Math.hypot(dx, dy);
  if (d < 1.5) return true;

  const step = Math.min(d, speed * dt);
  const nx = w.x + (dx / d) * step;
  const ny = w.y + (dy / d) * step;
  if (!walkable(map, Math.floor(nx / TILE), Math.floor(ny / TILE))) return true;

  w.x = nx;
  w.y = ny;
  return false;
}

/**
 * Walk anyone standing on blocked ground out to the nearest open tile.
 *
 * People end up inside buildings legitimately — a city raised over them, or an
 * older save written before movement was checked. They cannot be left to sort
 * it out by wandering, for two reasons: a strict destination check walls them
 * in permanently, since the first step out of a building is still inside it,
 * and simply exempting them lets them stroll about inside the walls. So being
 * stuck is handled as its own case, with one unambiguous destination.
 *
 * Returns true if it took charge of this citizen for the frame.
 */
function escapeIfStuck(map: GameMap, w: Worker, dt: number): boolean {
  const here = tileOf(w);
  if (walkable(map, here % MAP_W, Math.floor(here / MAP_W))) return false;

  const open = nearestOpen(map, here);
  const tx = (open % MAP_W + 0.5) * TILE;
  const ty = (Math.floor(open / MAP_W) + 0.5) * TILE;
  const dx = tx - w.x;
  const dy = ty - w.y;
  const d = Math.hypot(dx, dy) || 1;
  const step = Math.min(d, WORK_SPEED * dt);
  w.x += (dx / d) * step;
  w.y += (dy / d) * step;

  // Whatever they were heading for is no longer relevant.
  w.tgt = null;
  w.wait = 0;
  return true;
}

export function updateWorkers(map: GameMap, dt: number): void {
  // The nearest city is where the unemployed congregate. Computed once rather
  // than per citizen, since there are only ever a handful of cities.
  const cities = map.placements.filter((p) => p.def === 'city').map(centreOf);

  for (const w of map.workers) {
    w.bob += dt;

    if (w.post === null) {
      w.phase = 'idle';
      idleAbout(map, w, cities, dt);
      continue;
    }

    const target = placementById(map, w.post);
    if (!target) {
      unpost(w);
      continue;
    }

    if (w.path.length) {
      commute(w, dt);
      continue;
    }

    // Arrived, and now working the site.
    w.phase = 'work';
    if (escapeIfStuck(map, w, dt)) continue;
    if (w.wait > 0) {
      w.wait -= dt;
      continue;
    }
    if (!w.tgt) w.tgt = workTarget(map, target);
    if (stepToward(map, w, w.tgt, WORK_SPEED, dt)) {
      w.tgt = null;
      // A pause at each stop reads as the actual work being done.
      w.wait = 0.7 + Math.random() * 1.9;
    }
  }
}

/** Follow the remaining waypoints of a commute, spending the whole frame's distance. */
function commute(w: Worker, dt: number): void {
  let budget = SPEED * dt;
  while (budget > 0 && w.path.length) {
    const t = w.path[0];
    const tx = (t % MAP_W) * TILE + TILE / 2;
    const ty = Math.floor(t / MAP_W) * TILE + TILE / 2;
    const dx = tx - w.x;
    const dy = ty - w.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget) {
      w.x = tx;
      w.y = ty;
      budget -= d;
      w.path.shift();
    } else {
      w.x += (dx / d) * budget;
      w.y += (dy / d) * budget;
      budget = 0;
    }
  }
  if (!w.path.length) {
    w.phase = 'work';
    w.tgt = null;
    w.wait = 0;
  }
}

/**
 * Unemployed citizens drift around the nearest city instead of standing in a
 * heap where they spawned. Before this they were invisible: a hundred idle
 * people occupied the same few pixels, so the headcount in the panel looked
 * like a lie.
 */
function idleAbout(
  map: GameMap,
  w: Worker,
  cities: { x: number; y: number }[],
  dt: number,
): void {
  if (escapeIfStuck(map, w, dt)) return;
  if (w.wait > 0) {
    w.wait -= dt;
    return;
  }
  if (!w.tgt) {
    let home: { x: number; y: number } | null = null;
    let best = Infinity;
    for (const c of cities) {
      const d = Math.hypot(c.x - w.x, c.y - w.y);
      if (d < best) {
        best = d;
        home = c;
      }
    }
    w.tgt = idleTarget(map, w, home);
  }
  if (stepToward(map, w, w.tgt, IDLE_SPEED, dt)) {
    w.tgt = null;
    w.wait = 0.8 + Math.random() * 3.5;
  }
}

// ------------------------------------------------------- the sim bridge --

/**
 * Keep the number of unit sprites equal to the population the simulation has
 * grown. New citizens appear at the oldest city; lost ones are taken from the
 * idle first, so a famine never empties a mine before it empties the square.
 */
export function syncWorkers(state: GameState, map: GameMap): void {
  const want = Math.max(0, Math.floor(state.citizens));

  while (map.workers.length > want) {
    const idx = map.workers.findIndex((w) => w.post === null);
    map.workers.splice(idx >= 0 ? idx : map.workers.length - 1, 1);
  }

  if (map.workers.length < want) {
    const home = map.placements.find((p) => p.def === 'city');
    const c = home ? centreOf(home) : { x: WORLD_CENTRE.x, y: WORLD_CENTRE.y };
    // Outside the walls, not inside them: a city covers three tiles.
    const clear = home ? (footprint(home.def) * TILE) / 2 + 8 : 20;
    while (map.workers.length < want) {
      const a = Math.random() * Math.PI * 2;
      const d = clear + Math.random() * 40;
      map.workers.push({
        id: map.nextWorker++,
        x: c.x + Math.cos(a) * d,
        y: c.y + Math.sin(a) * d,
        post: null,
        phase: 'idle',
        path: [],
        bob: Math.random() * 6,
        tgt: null,
        wait: Math.random() * 3,
      });
    }
  }
}

const WORLD_CENTRE = { x: (MAP_W * TILE) / 2, y: (MAP_H * TILE) / 2 };

/**
 * Fold the map back into the shape `sim.ts` reads. Only citizens who have
 * actually arrived count toward output; the ones still walking are paid
 * nothing, which is the whole point of having a map.
 */
export function syncToState(state: GameState, map: GameMap): void {
  const buildings: Record<string, number> = {};
  for (const p of map.placements) buildings[p.def] = (buildings[p.def] ?? 0) + 1;
  state.buildings = buildings;

  for (const r of RESOURCES) state.jobs[r.id] = 0;
  for (const w of map.workers) {
    if (w.phase !== 'work' || w.post === null) continue;
    const p = placementById(map, w.post);
    if (!p) continue;
    const res = BUILDING_BY_ID.get(p.def)?.produces?.res;
    if (res) state.jobs[res as ResourceId]++;
  }
}

/** Citizens on the payroll but not yet at a desk — surfaced in the HUD. */
export function walkingCount(map: GameMap): number {
  let n = 0;
  for (const w of map.workers) if (w.phase === 'walk') n++;
  return n;
}
