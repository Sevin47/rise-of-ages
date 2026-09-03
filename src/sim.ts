import {
  AGES,
  BASE,
  BUILDINGS,
  BUILDING_BY_ID,
  MAX_AGE,
  MAX_TRACK_LEVEL,
  RARE_BY_ID,
  RESOURCES,
  TRACKS,
  TRACKS_NEEDED_TO_ADVANCE,
  WONDERS,
  techCost,
  type ResourceId,
  type TrackId,
} from './content';
import { log, type GameState } from './state';

export type Cost = Partial<Record<ResourceId, number>>;

/**
 * How much every building's output and every store's capacity grows per age.
 * Age prices climb roughly six-fold a rung; these two plus the tracks, wonders
 * and a larger population are what has to meet that.
 */
export const AGE_OUTPUT_STEP = 3.2;
export const AGE_STORAGE_STEP = 3.2;

/**
 * Everything the UI and the tick need that is a pure function of the save.
 * Recomputed from scratch each frame — it is a few dozen multiplications, and
 * having no cached derived state means no cache to get stale.
 */
export interface Derived {
  /** Output multiplier applied to every producer. */
  globalOut: number;
  /** Extra per-resource multiplier stacked on top of globalOut. */
  resOut: Record<ResourceId, number>;
  /** Gross production per second, before upkeep. */
  gross: Record<ResourceId, number>;
  /** Net per second, including citizen food upkeep. */
  net: Record<ResourceId, number>;
  caps: Record<ResourceId, number>;
  /** Citizen jobs available on each resource line. */
  slots: Record<ResourceId, number>;
  popCap: number;
  idle: number;
  buildCap: number;
  buildUsed: number;
  cityCap: number;
  routeCap: number;
  growthPerSec: number;
  upkeep: number;
  /** Output multiplier a single posted citizen carries, from Civic. */
  citizenBonus: number;
  /** Multiplier every producer gets purely for the age you are in. */
  ageOutput: number;
  /** Multiplier on research prices. Lower is better. */
  researchMult: number;
  /** Multiplier on construction prices. Lower is better. */
  buildMult: number;
  /** Multiplier on the price of advancing an age. */
  ageMult: number;
  starving: boolean;
}

function zeroed(): Record<ResourceId, number> {
  return Object.fromEntries(RESOURCES.map((r) => [r.id, 0])) as Record<ResourceId, number>;
}

function ones(): Record<ResourceId, number> {
  return Object.fromEntries(RESOURCES.map((r) => [r.id, 1])) as Record<ResourceId, number>;
}

export function derive(state: GameState): Derived {
  const t = state.tracks;

  // --- collect every additive modifier from buildings, wonders and routes ---
  let outputMult = 0;
  let capMult = 0;
  let popMult = 0;
  let growthMult = 0;
  let buildDiscount = 0;
  let researchFactor = 1;
  let popCapFlat = BASE.popCap;
  let buildCap = BASE.buildCap;
  let routeCapRaw = BASE.routes;
  const capsFlat = zeroed();
  const capsScale = ones();
  const resOut = ones();
  for (const r of RESOURCES) capsFlat[r.id] = r.baseCap;

  for (const def of BUILDINGS) {
    const n = state.buildings[def.id] ?? 0;
    if (!n || !def.effects) continue;
    const e = def.effects;
    if (e.popCap) popCapFlat += e.popCap * n;
    if (e.buildCap) buildCap += e.buildCap * n;
    if (e.outputMult) outputMult += e.outputMult * n;
    if (e.growthMult) growthMult += e.growthMult * n;
    if (e.routes) routeCapRaw += e.routes * n;
    if (e.researchDiscount) researchFactor *= Math.pow(1 - e.researchDiscount, n);
    if (e.caps) {
      for (const [res, v] of Object.entries(e.caps)) capsFlat[res as ResourceId] += (v as number) * n;
    }
    if (e.capScale) {
      for (const [res, v] of Object.entries(e.capScale)) {
        capsScale[res as ResourceId] *= Math.pow(1 + (v as number), n);
      }
    }
  }

  for (const id of state.wonders) {
    const w = WONDERS.find((x) => x.id === id);
    if (!w) continue;
    const e = w.effects;
    if (e.outputMult) outputMult += e.outputMult;
    if (e.capMult) capMult += e.capMult;
    if (e.popMult) popMult += e.popMult;
    if (e.growthMult) growthMult += e.growthMult;
    if (e.researchDiscount) researchFactor *= 1 - e.researchDiscount;
    if (e.resMult) {
      for (const [res, v] of Object.entries(e.resMult)) resOut[res as ResourceId] += v as number;
    }
  }

  for (const id of state.routes) {
    const rare = RARE_BY_ID.get(id);
    if (!rare) continue;
    const e = rare.effects;
    if (e.outputMult) outputMult += e.outputMult;
    if (e.capMult) capMult += e.capMult;
    if (e.growthMult) growthMult += e.growthMult;
    if (e.buildDiscount) buildDiscount += e.buildDiscount;
    if (e.resMult) {
      for (const [res, v] of Object.entries(e.resMult)) resOut[res as ResourceId] += v as number;
    }
  }

  // ------------------------------------------- library tracks and prestige --
  // A building is of its age: an Industrial farm is not an Ancient one with a
  // bigger multiplier bolted on. Build slots cap how MANY buildings you can own,
  // so without this the only growth left would be the tracks, and no amount of
  // them keeps pace with age costs that climb six-fold a rung.
  const ageOutput = Math.pow(AGE_OUTPUT_STEP, state.age);
  const ageStorage = Math.pow(AGE_STORAGE_STEP, state.age);

  const globalOut = 1 + outputMult + t.craft * 0.11 + state.legacy * 0.03;
  resOut.wealth += t.commerce * 0.08;
  resOut.knowledge += t.science * 0.12;

  const citizenBonus = 1 + t.civic * 0.04;
  const popCap = Math.floor((popCapFlat + t.civic * 14) * (1 + popMult));
  const cityCap = BASE.cityCap + t.civic;
  const routeCap = Math.floor(routeCapRaw) + Math.floor(t.commerce / 2);
  const researchMult = researchFactor * Math.pow(0.93, t.science);
  const buildMult = Math.pow(0.95, t.craft) * (1 - Math.min(0.5, buildDiscount));
  const ageMult = Math.pow(0.96, t.science);

  const caps = zeroed();
  for (const r of RESOURCES) {
    caps[r.id] = Math.floor(
      capsFlat[r.id] * capsScale[r.id] * (1 + capMult) * Math.pow(1.6, t.commerce) * ageStorage,
    );
  }

  // ------------------------------------------------ citizens fill the best --
  // jobs paying the most per head first, so a University quietly outbids a
  // Library for the same posted citizens without the player micromanaging.
  const slots = zeroed();
  const gross = zeroed();
  for (const def of BUILDINGS) {
    const n = state.buildings[def.id] ?? 0;
    if (!n || !def.produces) continue;
    slots[def.produces.res] += n * def.produces.slots;
    gross[def.produces.res] += n * def.produces.base;
  }

  for (const r of RESOURCES) {
    let remaining = Math.min(state.jobs[r.id], slots[r.id]);
    const producers = BUILDINGS.filter((b) => b.produces?.res === r.id && (state.buildings[b.id] ?? 0) > 0).sort(
      (a, b) => b.produces!.perCitizen - a.produces!.perCitizen,
    );
    for (const def of producers) {
      if (remaining <= 0) break;
      const capacity = (state.buildings[def.id] ?? 0) * def.produces!.slots;
      const worked = Math.min(remaining, capacity);
      gross[r.id] += worked * def.produces!.perCitizen * citizenBonus;
      remaining -= worked;
    }
    gross[r.id] *= globalOut * resOut[r.id] * ageOutput;
  }

  const upkeep = state.citizens * BASE.upkeep;
  const net = { ...gross };
  net.food -= upkeep;

  let buildUsed = 0;
  for (const [id, n] of Object.entries(state.buildings)) {
    const def = BUILDING_BY_ID.get(id);
    if (def && !def.freeOfBuildCap) buildUsed += n;
  }

  const posted = RESOURCES.reduce((sum, r) => sum + Math.min(state.jobs[r.id], slots[r.id]), 0);
  const starving = state.res.food <= 0 && net.food < 0;
  const growthPerSec = starving
    ? 0
    : (BASE.growth * (1 + growthMult) * popCap * Math.max(0, 1 - state.citizens / popCap)) / 10;

  return {
    globalOut,
    resOut,
    gross,
    net,
    caps,
    slots,
    popCap,
    idle: Math.max(0, Math.floor(state.citizens) - posted),
    buildCap,
    buildUsed,
    cityCap,
    routeCap,
    growthPerSec,
    upkeep,
    citizenBonus,
    ageOutput,
    researchMult,
    buildMult,
    ageMult,
    starving,
  };
}

/** Advance the simulation by `dt` seconds. Safe to call with a large dt. */
export function tick(state: GameState, dt: number): void {
  const d = derive(state);

  for (const r of RESOURCES) {
    const next = state.res[r.id] + d.net[r.id] * dt;
    state.res[r.id] = Math.max(0, Math.min(next, d.caps[r.id]));
  }

  if (d.starving) {
    // The larder is empty and production does not cover upkeep. People leave.
    const deficit = -d.net.food;
    state.citizens = Math.max(1, state.citizens - deficit * BASE.starvation * dt);
  } else {
    state.citizens = Math.min(d.popCap, state.citizens + d.growthPerSec * dt);
  }

  // Posted citizens can never exceed the head count or the jobs that exist.
  clampJobs(state, d);
}

/** Trim postings that outgrew their slots (buildings sold, citizens starved). */
export function clampJobs(state: GameState, d: Derived): void {
  let budget = Math.floor(state.citizens);
  for (const r of RESOURCES) {
    const allowed = Math.min(state.jobs[r.id], d.slots[r.id], budget);
    state.jobs[r.id] = Math.max(0, allowed);
    budget -= state.jobs[r.id];
  }
}

// ------------------------------------------------------------------ costs

/** Price of the next copy of a building, after every discount. */
export function buildingCost(state: GameState, id: string, d: Derived): Cost {
  const def = BUILDING_BY_ID.get(id);
  if (!def) return {};
  const n = state.buildings[id] ?? 0;
  const scale = Math.pow(def.growth, n) * d.buildMult;
  const out: Cost = {};
  for (const [res, v] of Object.entries(def.cost)) {
    out[res as ResourceId] = Math.max(1, Math.ceil((v as number) * scale));
  }
  return out;
}

export function trackCost(state: GameState, id: TrackId, d: Derived): Cost {
  const track = TRACKS.find((t) => t.id === id)!;
  const level = state.tracks[id];
  const raw = techCost(level);
  return {
    knowledge: Math.ceil(raw.knowledge * d.researchMult),
    [track.with]: Math.ceil(raw.secondary * d.researchMult),
  };
}

export function ageCost(state: GameState, d: Derived): Cost {
  const out: Cost = {};
  for (const [res, v] of Object.entries(AGES[state.age].cost)) {
    out[res as ResourceId] = Math.ceil((v as number) * d.ageMult);
  }
  return out;
}

export function canAfford(state: GameState, cost: Cost): boolean {
  return Object.entries(cost).every(([res, v]) => state.res[res as ResourceId] >= (v as number));
}

function pay(state: GameState, cost: Cost): void {
  for (const [res, v] of Object.entries(cost)) state.res[res as ResourceId] -= v as number;
}

// ----------------------------------------------------------------- actions

export function build(state: GameState, id: string): boolean {
  const def = BUILDING_BY_ID.get(id);
  if (!def || def.age > state.age) return false;
  const d = derive(state);
  const owned = state.buildings[id] ?? 0;
  if (def.cityLimited && owned >= d.cityCap) return false;
  if (!def.freeOfBuildCap && d.buildUsed >= d.buildCap) return false;

  const cost = buildingCost(state, id, d);
  if (!canAfford(state, cost)) return false;
  pay(state, cost);
  state.buildings[id] = owned + 1;
  if (def.id === 'city') log(state, 'build', `A new city is founded. Your ${owned + 1} cities have room to grow.`);
  return true;
}

// --------------------------------------------------- placement on the map --
// The map owns `state.buildings` (it is recomputed from the placements each
// frame), so these charge and refund only. They deliberately sit alongside
// `build`/`demolish` rather than replacing them: those still work without a
// map, which is what lets `balance.ts` probe the economy on its own.

export type BuildBlock = null | 'age' | 'cities' | 'slots' | 'cost';

/** Why this building cannot be started right now, or null if it can. */
export function buildBlock(state: GameState, id: string, d: Derived): BuildBlock {
  const def = BUILDING_BY_ID.get(id);
  if (!def) return 'age';
  if (def.age > state.age) return 'age';
  const owned = state.buildings[id] ?? 0;
  if (def.cityLimited && owned >= d.cityCap) return 'cities';
  if (!def.freeOfBuildCap && d.buildUsed >= d.buildCap) return 'slots';
  if (!canAfford(state, buildingCost(state, id, d))) return 'cost';
  return null;
}

/** Charge for a building. The caller is responsible for placing it. */
export function payBuild(state: GameState, id: string): boolean {
  const d = derive(state);
  if (buildBlock(state, id, d)) return false;
  pay(state, buildingCost(state, id, d));
  if (id === 'city') {
    const n = (state.buildings.city ?? 0) + 1;
    log(state, 'build', `A new city is founded. Your ${n} cities have room to grow.`);
  }
  return true;
}

/** Refund half of what the copy being removed cost. The caller unplaces it. */
export function refundBuild(state: GameState, id: string): void {
  const def = BUILDING_BY_ID.get(id);
  if (!def) return;
  const d = derive(state);
  const owned = state.buildings[id] ?? 1;
  const scale = Math.pow(def.growth, owned - 1) * d.buildMult;
  for (const [res, v] of Object.entries(def.cost)) {
    const key = res as ResourceId;
    state.res[key] = Math.min(d.caps[key], state.res[key] + Math.floor((v as number) * scale * 0.5));
  }
}

/**
 * Tear a building down for half of what the copy being removed cost. Without
 * this a player who fills every build slot with farms has no way back, so razing
 * is always available and never gated.
 */
export function demolish(state: GameState, id: string): boolean {
  const def = BUILDING_BY_ID.get(id);
  const owned = state.buildings[id] ?? 0;
  if (!def || owned <= 0) return false;
  if (def.cityLimited && owned <= 1) return false;

  const d = derive(state);
  const scale = Math.pow(def.growth, owned - 1) * d.buildMult;
  for (const [res, v] of Object.entries(def.cost)) {
    const key = res as ResourceId;
    state.res[key] = Math.min(d.caps[key], state.res[key] + Math.floor((v as number) * scale * 0.5));
  }

  if (owned - 1 === 0) delete state.buildings[id];
  else state.buildings[id] = owned - 1;

  const after = derive(state);
  clampJobs(state, after);
  for (const r of RESOURCES) state.res[r.id] = Math.min(state.res[r.id], after.caps[r.id]);
  return true;
}

export function research(state: GameState, id: TrackId): boolean {
  const level = state.tracks[id];
  // A track can only ever run one level ahead of nothing: level N needs age N-1.
  if (level >= MAX_TRACK_LEVEL || level > state.age) return false;
  const d = derive(state);
  const cost = trackCost(state, id, d);
  if (!canAfford(state, cost)) return false;
  pay(state, cost);
  state.tracks[id] = level + 1;
  const track = TRACKS.find((t) => t.id === id)!;
  log(state, 'tech', `${track.name} reaches level ${level + 1}.`);
  return true;
}

/** True when the library tracks are far enough along to leave this age. */
export function tracksReady(state: GameState): boolean {
  return TRACKS.filter((t) => state.tracks[t.id] >= state.age + 1).length >= TRACKS_NEEDED_TO_ADVANCE;
}

export function advanceAge(state: GameState): boolean {
  if (state.age >= MAX_AGE || !tracksReady(state)) return false;
  const d = derive(state);
  const cost = ageCost(state, d);
  if (!canAfford(state, cost)) return false;
  pay(state, cost);
  state.age += 1;
  log(state, 'age', `Your nation enters the ${AGES[state.age].name}.`);
  return true;
}

export function buildWonder(state: GameState, id: string): boolean {
  const w = WONDERS.find((x) => x.id === id);
  if (!w || w.age > state.age || state.wonders.includes(id)) return false;
  if (!canAfford(state, w.cost)) return false;
  pay(state, w.cost);
  state.wonders.push(id);
  log(state, 'wonder', `${w.name} is completed. ${w.effectText}.`);
  return true;
}

/** Put a rare good on a route, or take it off. Free either way. */
export function toggleRoute(state: GameState, id: string): boolean {
  const at = state.routes.indexOf(id);
  if (at >= 0) {
    state.routes.splice(at, 1);
    return true;
  }
  const d = derive(state);
  if (state.routes.length >= d.routeCap) return false;
  state.routes.push(id);
  return true;
}

export function assign(state: GameState, res: ResourceId, delta: number): void {
  const d = derive(state);
  const want = state.jobs[res] + delta;
  const ceiling = Math.min(d.slots[res], state.jobs[res] + d.idle);
  state.jobs[res] = Math.max(0, Math.min(want, ceiling));
}

/** Spread every citizen evenly over the lines that still have open jobs. */
export function autoAssign(state: GameState): void {
  const d = derive(state);
  for (const r of RESOURCES) state.jobs[r.id] = 0;
  let budget = Math.floor(state.citizens);
  const lines = RESOURCES.filter((r) => d.slots[r.id] > 0);
  let progress = true;
  while (budget > 0 && progress) {
    progress = false;
    for (const r of lines) {
      if (budget <= 0) break;
      if (state.jobs[r.id] >= d.slots[r.id]) continue;
      state.jobs[r.id] += 1;
      budget -= 1;
      progress = true;
    }
  }
}

// ---------------------------------------------------------------- prestige

/**
 * Legacy earned by ending the current run. Ages carry most of the weight, so a
 * dynasty that pushed one age further is always worth more than one that built
 * wide in the same age.
 */
export function legacyOnReset(state: GameState): number {
  const fromAges = state.age * (state.age + 1);
  const fromWonders = state.wonders.length * 2;
  return fromAges + fromWonders;
}

export function offlineCatchUp(state: GameState, elapsedMs: number): number {
  // Eight hours of credit, at half rate, in one-minute steps.
  const seconds = Math.min(elapsedMs / 1000, 8 * 3600);
  if (seconds < 30) return 0;
  let remaining = seconds * 0.5;
  while (remaining > 0) {
    const step = Math.min(60, remaining);
    tick(state, step);
    remaining -= step;
  }
  return seconds;
}
