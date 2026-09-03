import './style.css';
import { BUILDING_BY_ID, type ResourceId, type TrackId } from './content';
import {
  centreOf,
  footprint,
  MAP_H,
  MAP_W,
  newMap,
  place,
  placementAt,
  placementById,
  placementError,
  removePlacement,
  slotsOf,
  TILE,
  WORLD_H,
  WORLD_W,
} from './map';
import { createRenderer, type ViewState } from './render';
import {
  advanceAge,
  buildWonder,
  derive,
  legacyOnReset,
  offlineCatchUp,
  payBuild,
  refundBuild,
  research,
  tick,
  toggleRoute,
} from './sim';
import { log, newGame, type GameState } from './state';
import { exportSave, importSave, load, save, wipe } from './storage';
import {
  autoPost,
  emptyBuilding,
  fill,
  idleWorkers,
  post,
  postedAt,
  recallAll,
  syncToState,
  syncWorkers,
  unpost,
  updateWorkers,
  walkingCount,
  workingAt,
} from './units';
import { preloadSprites } from './sprites';
import { render, renderMenu, type MapInfo, type TabId, type UiState } from './ui';

const canvas = document.getElementById('map') as HTMLCanvasElement;
const overlay = document.getElementById('ui')!;
const renderer = createRenderer(canvas);

/**
 * The game opens on a menu, so there is no nation until the player asks for
 * one. `state` stays null for the whole of that screen, and — this is the part
 * that matters — nothing is ever written to storage while it is null. If the
 * menu ran the loop with a throwaway game, the autosave would quietly destroy
 * the very save the Continue button is offering.
 */
type Screen = 'menu' | 'playing';

let screen: Screen = 'menu';
let state: GameState | null = null;

/** The save on disk, read once for the menu and refreshed on returning to it. */
let savedGame: GameState | null = load();

const ui: UiState = { tab: null, dialog: null };

const view: ViewState = {
  cam: { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1.0 },
  ghost: null,
  ghostTile: null,
  ghostOk: false,
  selected: null,
  hover: null,
};

// A throwaway world drifting behind the menu. It is never played and never
// saved; it exists so the landing screen shows the game rather than describing
// it, and it costs one terrain bake.
const menuMap = newMap();
const menuView: ViewState = {
  cam: { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1.25 },
  ghost: null,
  ghostTile: null,
  ghostOk: false,
  selected: null,
  hover: null,
};
let menuT = 0;

function driftMenuCamera(dt: number): void {
  menuT += dt;
  // Swing only as far as the world actually allows, so the drift can never
  // wander off the edge and show the void behind it. Deriving the amplitude
  // from the viewport also keeps it correct when the window is resized.
  const slackX = Math.max(0, WORLD_W / 2 - canvas.clientWidth / 2 / menuView.cam.zoom) * 0.82;
  const slackY = Math.max(0, WORLD_H / 2 - canvas.clientHeight / 2 / menuView.cam.zoom) * 0.82;
  // Two slow, mismatched periods, so the pan never visibly repeats.
  menuView.cam.x = WORLD_W / 2 + Math.cos(menuT * 0.045) * slackX;
  menuView.cam.y = WORLD_H / 2 + Math.sin(menuT * 0.031) * slackY;
}

/** Leave the menu and begin playing the given nation. */
function startGame(next: GameState): void {
  state = next;
  screen = 'playing';

  // Time away is credited on entering the game, not on page load: the player
  // may have sat on the menu for a while, and that counts as being away too.
  const away = offlineCatchUp(next, Date.now() - next.savedAt);
  if (away > 60) {
    const hours = Math.floor(away / 3600);
    const mins = Math.round((away % 3600) / 60);
    log(
      next,
      'age',
      `While you were gone your nation kept working for ${hours ? `${hours}h ` : ''}${mins}m at half pace.`,
    );
  }

  // Reconcile the map into the economy before the first painted frame, so it
  // shows what is on the ground rather than what the save was written with.
  syncWorkers(next, next.map);
  syncToState(next, next.map);

  ui.tab = null;
  ui.dialog = null;
  resetView(next);
  touch();
  paint();
}

/** Save and hand the screen back to the menu. */
function toMenu(): void {
  if (state) save(state);
  savedGame = load();
  state = null;
  screen = 'menu';
  ui.tab = null;
  ui.dialog = null;
  touch();
  paint();
}

// ------------------------------------------------------------------ paint

function mapInfo(g: GameState): MapInfo {
  const sel = view.selected === null ? null : placementById(g.map, view.selected);
  return {
    selected: sel,
    postedHere: sel ? postedAt(g.map, sel.id) : 0,
    workingHere: sel ? workingAt(g.map, sel.id) : 0,
    slotsHere: sel ? slotsOf(sel.def) : 0,
    idle: idleWorkers(g.map).length,
    walking: walkingCount(g.map),
    ghost: view.ghost,
  };
}

let dirty = true;

function paint(): void {
  overlay.innerHTML =
    screen === 'menu' || !state
      ? renderMenu(savedGame, ui)
      : render(state, derive(state), ui, mapInfo(state));
  dirty = false;
}

function touch(): void {
  dirty = true;
}

// ------------------------------------------------------------ map input

function clampCamera(): void {
  const halfW = canvas.clientWidth / 2 / view.cam.zoom;
  const halfH = canvas.clientHeight / 2 / view.cam.zoom;
  // Allow a little overscroll so edge tiles are reachable on small windows.
  view.cam.x = Math.max(-halfW / 2, Math.min(WORLD_W + halfW / 2, view.cam.x));
  view.cam.y = Math.max(-halfH / 2, Math.min(WORLD_H + halfH / 2, view.cam.y));
}

/** Ghost origin, offset so the footprint sits under the cursor. */
function ghostOrigin(wx: number, wy: number, def: string): { tx: number; ty: number } {
  const n = footprint(def);
  return {
    tx: Math.max(0, Math.min(MAP_W - n, Math.floor(wx / TILE) - (n >> 1))),
    ty: Math.max(0, Math.min(MAP_H - n, Math.floor(wy / TILE) - (n >> 1))),
  };
}

function updateGhost(sx: number, sy: number): void {
  if (!view.ghost) {
    view.ghostTile = null;
    return;
  }
  const w = renderer.screenToWorld(view.cam, sx, sy);
  const o = ghostOrigin(w.x, w.y, view.ghost);
  view.ghostTile = o;
  view.ghostOk = state !== null && placementError(state.map, view.ghost, o.tx, o.ty) === null;
}

let dragging = false;
let dragMoved = false;
let lastPointer = { x: 0, y: 0 };

canvas.addEventListener('pointerdown', (ev) => {
  if (screen !== 'playing' || ev.button !== 0) return;
  dragging = true;
  dragMoved = false;
  lastPointer = { x: ev.clientX, y: ev.clientY };
  canvas.setPointerCapture(ev.pointerId);
});

canvas.addEventListener('pointermove', (ev) => {
  if (screen !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  if (dragging) {
    const dx = ev.clientX - lastPointer.x;
    const dy = ev.clientY - lastPointer.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    if (dragMoved) {
      view.cam.x -= dx / view.cam.zoom;
      view.cam.y -= dy / view.cam.zoom;
      clampCamera();
    }
    lastPointer = { x: ev.clientX, y: ev.clientY };
  }
  updateGhost(ev.clientX - rect.left, ev.clientY - rect.top);
});

canvas.addEventListener('pointerup', (ev) => {
  if (screen !== 'playing' || !dragging) return;
  dragging = false;
  canvas.releasePointerCapture(ev.pointerId);
  if (dragMoved) return;

  const rect = canvas.getBoundingClientRect();
  const w = renderer.screenToWorld(view.cam, ev.clientX - rect.left, ev.clientY - rect.top);
  const tx = Math.floor(w.x / TILE);
  const ty = Math.floor(w.y / TILE);

  if (!state) return;
  if (view.ghost) {
    tryPlace(state, view.ghost, w.x, w.y);
  } else {
    const hit = placementAt(state.map, tx, ty);
    view.selected = hit ? hit.id : null;
  }
  touch();
  paint();
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  if (screen !== 'playing') return;
  if (view.ghost) {
    view.ghost = null;
    view.ghostTile = null;
  } else {
    view.selected = null;
  }
  paint();
});

canvas.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    if (screen !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const before = renderer.screenToWorld(view.cam, sx, sy);
    const factor = Math.exp(-ev.deltaY * 0.0016);
    view.cam.zoom = Math.max(0.55, Math.min(3.2, view.cam.zoom * factor));
    // Keep the world point under the cursor pinned while zooming.
    const after = renderer.screenToWorld(view.cam, sx, sy);
    view.cam.x += before.x - after.x;
    view.cam.y += before.y - after.y;
    clampCamera();
    updateGhost(sx, sy);
  },
  { passive: false },
);

/**
 * Pay for a building and raise it. The order matters: placement is checked
 * first so an illegal spot never costs anything.
 */
function tryPlace(g: GameState, def: string, wx: number, wy: number): void {
  const o = ghostOrigin(wx, wy, def);
  const err = placementError(g.map, def, o.tx, o.ty);
  if (err) {
    const why =
      err === 'taken'
        ? 'Something already stands there.'
        : err === 'edge'
          ? 'That runs off the edge of the map.'
          : `A ${BUILDING_BY_ID.get(def)?.name ?? def} cannot stand on that ground.`;
    log(g, 'warn', why);
    return;
  }
  if (!payBuild(g, def)) {
    log(g, 'warn', 'Not enough in store for that yet.');
    return;
  }
  const p = place(g.map, def, o.tx, o.ty);
  syncToState(g, g.map);
  if (p) {
    view.selected = p.id;
    // Staffing a new site immediately is what the player wants nine times in
    // ten, and they can recall from the panel if not.
    fill(g.map, p);
  }
  // Shift keeps the palette armed for a run of the same building.
  if (!heldShift) view.ghost = null;
}

let heldShift = false;

// ------------------------------------------------------------ overlay input

/** Post or recall citizens on a whole resource line, nearest job first. */
function shiftLine(g: GameState, res: ResourceId, delta: number): void {
  const map = g.map;
  const sites = map.placements.filter((p) => BUILDING_BY_ID.get(p.def)?.produces?.res === res);
  if (delta > 0) {
    for (let n = 0; n < delta; n++) {
      const open = sites.filter((p) => postedAt(map, p.id) < slotsOf(p.def));
      if (!open.length) break;
      const free = idleWorkers(map);
      if (!free.length) break;
      // Nearest open site to the nearest idle citizen.
      let best = open[0];
      let bestD = Infinity;
      for (const p of open) {
        const c = centreOf(p);
        const d = Math.hypot(c.x - free[0].x, c.y - free[0].y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (!post(map, free[0], best)) break;
    }
  } else {
    for (let n = 0; n < -delta; n++) {
      const staffed = sites.filter((p) => postedAt(map, p.id) > 0);
      if (!staffed.length) break;
      const victim = map.workers.find((w) => w.post === staffed[0].id);
      if (!victim) break;
      unpost(victim);
    }
  }
}

/**
 * Menu clicks. Kept separate from the in-game handler because almost nothing
 * is shared: there is no nation to act on yet, and the actions that exist are
 * about deciding which one to load.
 */
function menuClick(act: string, target: HTMLElement, ev: MouseEvent): void {
  switch (act) {
    case 'menu-continue':
      if (savedGame) startGame(savedGame);
      return;
    case 'menu-new':
      startGame(newGame());
      return;
    case 'menu-new-confirm':
      // Starting fresh over an existing run destroys it, and the save is the
      // only copy, so this asks first.
      if (confirm('Start a new nation? The saved nation on this browser is replaced, and there is no undo.')) {
        startGame(newGame());
      }
      return;
    case 'import':
      ui.dialog = { kind: 'import' };
      break;
    case 'about':
      ui.dialog = { kind: 'about' };
      break;
    case 'do-import': {
      const box = document.getElementById('import-blob') as HTMLTextAreaElement | null;
      const next = box ? importSave(box.value) : null;
      if (next) {
        startGame(next);
        return;
      }
      if (box) {
        box.value = '';
        box.placeholder = "That did not read as a save. Paste the whole block, including any '=' at the end.";
      }
      break;
    }
    case 'dismiss':
      ui.dialog = null;
      break;
    case 'dismiss-bg':
      if (target === ev.target) ui.dialog = null;
      break;
    default:
      return;
  }
  touch();
  paint();
}

overlay.addEventListener('click', (ev) => {
  const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!target) return;
  const act = target.dataset.act!;
  const id = target.dataset.id ?? '';

  if (screen === 'menu' || !state) {
    menuClick(act, target, ev);
    return;
  }

  const g = state;
  const sel = view.selected === null ? null : placementById(g.map, view.selected);

  switch (act) {
    case 'to-menu':
      toMenu();
      return;
    case 'tab':
      // Clicking the open tab closes the drawer and gives the map the screen.
      ui.tab = ui.tab === (id as TabId) ? null : (id as TabId);
      break;
    case 'pick':
      view.ghost = view.ghost === id ? null : id;
      view.ghostTile = null;
      view.selected = null;
      break;
    case 'deselect':
      view.selected = null;
      break;
    case 'post-here':
      if (sel) {
        const free = idleWorkers(g.map, centreOf(sel));
        if (free.length) post(g.map, free[0], sel);
      }
      break;
    case 'fill-here':
      if (sel) fill(g.map, sel);
      break;
    case 'empty-here':
      if (sel) emptyBuilding(g.map, sel.id);
      break;
    case 'raze': {
      if (!sel) break;
      const def = BUILDING_BY_ID.get(sel.def);
      if (def?.cityLimited && (g.buildings.city ?? 0) <= 1) break;
      refundBuild(g, sel.def);
      removePlacement(g.map, sel.id);
      view.selected = null;
      syncToState(g, g.map);
      break;
    }
    case 'job':
      shiftLine(g, id as ResourceId, Number(target.dataset.d ?? 0));
      break;
    case 'auto':
      autoPost(g.map);
      break;
    case 'recall':
      recallAll(g.map);
      break;
    case 'research':
      research(g, id as TrackId);
      break;
    case 'wonder':
      buildWonder(g, id);
      break;
    case 'route':
      toggleRoute(g, id);
      break;
    case 'advance':
      advanceAge(g);
      break;
    case 'export':
      ui.dialog = { kind: 'export', text: exportSave(g) };
      break;
    case 'import':
      ui.dialog = { kind: 'import' };
      break;
    case 'about':
      ui.dialog = { kind: 'about' };
      break;
    case 'reset':
      ui.dialog = { kind: 'reset' };
      break;
    case 'do-reset': {
      const earned = g.legacy + legacyOnReset(g);
      const dynasties = g.dynasties + 1;
      const fresh = newGame(earned, dynasties);
      log(fresh, 'age', `Dynasty ${dynasties} begins with ${earned} legacy behind it.`);
      state = fresh;
      resetView(fresh);
      ui.dialog = null;
      break;
    }
    case 'do-import': {
      const box = document.getElementById('import-blob') as HTMLTextAreaElement | null;
      const next = box ? importSave(box.value) : null;
      if (next) {
        state = next;
        resetView(next);
        ui.dialog = null;
      } else if (box) {
        box.value = '';
        box.placeholder = "That did not read as a save. Paste the whole block, including any '=' at the end.";
      }
      break;
    }
    case 'wipe':
      if (confirm('Erase this nation and every banked legacy point? There is no undo.')) {
        wipe();
        savedGame = null;
        state = null;
        screen = 'menu';
        ui.tab = null;
        ui.dialog = null;
      }
      break;
    case 'dismiss':
      ui.dialog = null;
      break;
    case 'dismiss-bg':
      if (target === ev.target) ui.dialog = null;
      break;
    default:
      return;
  }

  touch();
  paint();
});

function resetView(g: GameState): void {
  view.selected = null;
  view.ghost = null;
  view.ghostTile = null;
  const home = g.map.placements.find((p) => p.def === 'city');
  const c = home ? centreOf(home) : { x: WORLD_W / 2, y: WORLD_H / 2 };
  view.cam.x = c.x;
  view.cam.y = c.y;
}

// --------------------------------------------------------------- keyboard

const held = new Set<string>();

document.addEventListener('keydown', (ev) => {
  heldShift = ev.shiftKey;
  if (ev.key === 'Escape') {
    if (ui.dialog) ui.dialog = null;
    else if (view.ghost) view.ghost = null;
    else if (view.selected !== null) view.selected = null;
    else if (ui.tab) ui.tab = null;
    paint();
    return;
  }
  // Leave typing alone; the import dialog holds a textarea.
  if ((ev.target as HTMLElement)?.tagName === 'TEXTAREA') return;
  held.add(ev.key.toLowerCase());
});

document.addEventListener('keyup', (ev) => {
  heldShift = ev.shiftKey;
  held.delete(ev.key.toLowerCase());
});

window.addEventListener('blur', () => held.clear());

function panFromKeys(dt: number): void {
  const step = (520 / view.cam.zoom) * dt;
  let dx = 0;
  let dy = 0;
  if (held.has('a') || held.has('arrowleft')) dx -= step;
  if (held.has('d') || held.has('arrowright')) dx += step;
  if (held.has('w') || held.has('arrowup')) dy -= step;
  if (held.has('s') || held.has('arrowdown')) dy += step;
  if (dx || dy) {
    view.cam.x += dx;
    view.cam.y += dy;
    clampCamera();
  }
}

// ------------------------------------------------------------------- loop

let last = performance.now();
let sinceOverlay = 0;
let sinceSave = 0;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.5);
  last = now;

  const g = state;
  if (screen !== 'playing' || !g) {
    // Menu: draw the drifting backdrop and nothing else. No simulation runs
    // and, above all, no save is written.
    driftMenuCamera(dt);
    renderer.draw(menuMap, menuView);
    if (dirty) paint();
    requestAnimationFrame(frame);
    return;
  }

  panFromKeys(dt);

  // Order matters: the map decides what exists and who is working, then the
  // economy runs on those numbers.
  syncWorkers(g, g.map);
  updateWorkers(g.map, dt);
  syncToState(g, g.map);
  tick(g, dt);

  renderer.draw(g.map, view);

  sinceOverlay += dt;
  sinceSave += dt;

  // A dialog holds a textarea the player may be typing into, so leave the
  // overlay DOM alone while one is open. The map keeps running underneath.
  if (!ui.dialog && (dirty || sinceOverlay >= 0.25)) {
    sinceOverlay = 0;
    paint();
  }

  if (sinceSave >= 10) {
    sinceSave = 0;
    save(g);
  }

  requestAnimationFrame(frame);
}

// Both of these are guarded: saving from the menu would write a nation that
// does not exist over the one that does.
window.addEventListener('beforeunload', () => {
  if (state) save(state);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state) save(state);
});

preloadSprites();
paint();
requestAnimationFrame(frame);
