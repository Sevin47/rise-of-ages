/**
 * Headless balance probe. Runs a reasonable-but-not-optimal autoplayer over the
 * real simulation and prints when each age falls. Not part of the shipped game.
 *
 *   npx tsc --ignoreConfig balance.ts --module commonjs --target ES2022 \
 *     --lib ES2022,DOM --skipLibCheck --outDir <tmp> && node <tmp>/balance.js
 */
import { AGES, BUILDINGS, MAX_AGE, MAX_TRACK_LEVEL, RARES, RESOURCES, TRACKS, WONDERS } from './src/content';
import {
  advanceAge,
  ageCost,
  autoAssign,
  build,
  buildWonder,
  buildingCost,
  canAfford,
  derive,
  research,
  tick,
  toggleRoute,
  tracksReady,
} from './src/sim';
import { newGame } from './src/state';

const state = newGame();
const marks: string[] = [];
let t = 0;
const DT = 1;
const LIMIT = 200 * 3600; // two hundred hours of simulated play

function hhmm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(4)}h ${String(m).padStart(2, '0')}m`;
}

/** One decision, made every five simulated seconds. */
function decide(): void {
  const d = derive(state);
  autoAssign(state);

  // Trade routes cost nothing, so always run as many as exist.
  if (state.routes.length < d.routeCap) {
    const pick = RARES.find((r) => !state.routes.includes(r.id));
    if (pick) toggleRoute(state, pick.id);
  }

  if (tracksReady(state) && canAfford(state, ageCost(state, d))) {
    const before = state.age;
    if (advanceAge(state)) {
      marks.push(`${hhmm(t)}  ${AGES[before + 1].name}`);
      return;
    }
  }

  // Research the shallowest legal track first so the four stay level — that is
  // what the age gate rewards.
  const track = TRACKS.filter((tr) => state.tracks[tr.id] < MAX_TRACK_LEVEL && state.tracks[tr.id] <= state.age).sort(
    (a, b) => state.tracks[a.id] - state.tracks[b.id],
  )[0];
  if (track && research(state, track.id)) return;

  const wonder = WONDERS.find((w) => w.age <= state.age && !state.wonders.includes(w.id) && canAfford(state, w.cost));
  if (wonder && buildWonder(state, wonder.id)) return;

  // Keep headroom: found a city before the last slots are gone.
  if (d.buildCap - d.buildUsed <= 2 && (state.buildings.city ?? 0) < d.cityCap) {
    if (build(state, 'city')) return;
  }

  const unlocked = BUILDINGS.filter((b) => b.age <= state.age && b.id !== 'city');
  const affordable = (id: string) => canAfford(state, buildingCost(state, id, d));

  // A first copy of every producer beats a tenth copy of any of them.
  const missing = unlocked.find((b) => b.produces && (state.buildings[b.id] ?? 0) === 0);
  if (missing) {
    if (affordable(missing.id)) build(state, missing.id);
    return; // otherwise save up for it rather than spending elsewhere
  }

  // Relieve whatever is actually pinching.
  const atCap = RESOURCES.filter((r) => state.res[r.id] >= d.caps[r.id] * 0.98);
  if (atCap.length) {
    for (const store of ['granary', 'warehouse'] as const) {
      const def = BUILDINGS.find((b) => b.id === store)!;
      const helps = atCap.some((r) => def.effects?.caps?.[r.id]);
      if (def.age <= state.age && helps && affordable(store) && build(state, store)) return;
    }
  }
  if (state.citizens >= d.popCap * 0.98 && affordable('temple') && build(state, 'temple')) return;
  if ((state.buildings.workshop ?? 0) < 6 && affordable('workshop') && build(state, 'workshop')) return;

  // Otherwise widen the narrowest producer line, keeping a few slots spare so
  // there is always room to answer a storage or population pinch.
  if (d.buildCap - d.buildUsed <= 4) return;
  const producers = unlocked.filter((b) => b.produces && affordable(b.id));
  producers.sort((a, b) => (state.buildings[a.id] ?? 0) - (state.buildings[b.id] ?? 0));
  if (producers.length) build(state, producers[0].id);
}

while (t < LIMIT && state.age < MAX_AGE) {
  tick(state, DT);
  t += DT;
  if (t % 5 === 0) decide();
}

const d = derive(state);
console.log(marks.join('\n'));
console.log(`\nstopped at ${hhmm(t)} in the ${AGES[state.age].name}`);
console.log(`citizens ${Math.floor(state.citizens)}/${d.popCap}  slots ${d.buildUsed}/${d.buildCap}  cities ${state.buildings.city}`);
console.log(`tracks ${TRACKS.map((x) => `${x.name.slice(0, 2)}${state.tracks[x.id]}`).join(' ')}  wonders ${state.wonders.length}  routes ${state.routes.length}/${d.routeCap}`);
console.log(`output x${d.globalOut.toFixed(2)}  food/s ${d.net.food.toFixed(1)}  knowledge/s ${d.net.knowledge.toFixed(2)}`);
console.log('buildings', JSON.stringify(state.buildings));
