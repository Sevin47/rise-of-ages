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
  TILE,
  walkable,
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

/**
 * Where a worker stands once they arrive: spaced around the building so a full
 * site reads as a crew rather than one sprite with others hidden underneath.
 */
function workSpot(p: Placement, slot: number, total: number): { x: number; y: number } {
  const c = centreOf(p);
  const r = (footprint(p.def) * TILE) / 2 + 5;
  const a = (slot / Math.max(1, total)) * Math.PI * 2 + p.id;
  return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
}

export function updateWorkers(map: GameMap, dt: number): void {
  // Index posted workers so each gets a distinct standing spot.
  const crews = new Map<number, Worker[]>();
  for (const w of map.workers) {
    if (w.post === null) continue;
    let crew = crews.get(w.post);
    if (!crew) crews.set(w.post, (crew = []));
    crew.push(w);
  }

  for (const w of map.workers) {
    w.bob += dt;
    if (w.post === null) {
      w.phase = 'idle';
      continue;
    }
    const target = placementById(map, w.post);
    if (!target) {
      unpost(w);
      continue;
    }

    if (w.path.length) {
      // Walk the remaining waypoints, spending the whole frame's distance.
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
      if (!w.path.length) w.phase = 'work';
      continue;
    }

    // Arrived: settle onto the assigned standing spot and start producing.
    w.phase = 'work';
    const crew = crews.get(w.post)!;
    const spot = workSpot(target, crew.indexOf(w), crew.length);
    w.x += (spot.x - w.x) * Math.min(1, dt * 4);
    w.y += (spot.y - w.y) * Math.min(1, dt * 4);
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
    while (map.workers.length < want) {
      const a = Math.random() * Math.PI * 2;
      const d = 18 + Math.random() * 26;
      map.workers.push({
        id: map.nextWorker++,
        x: c.x + Math.cos(a) * d,
        y: c.y + Math.sin(a) * d,
        post: null,
        phase: 'idle',
        path: [],
        bob: Math.random() * 6,
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
