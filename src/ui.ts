import { art } from './art';
import {
  AGES,
  BUILDINGS,
  MAX_AGE,
  MAX_TRACK_LEVEL,
  RARES,
  RESOURCES,
  TRACKS,
  TRACKS_NEEDED_TO_ADVANCE,
  WONDERS,
  type ResourceId,
} from './content';
import { groundFor, type Placement } from './map';
import type { Settings } from './settings';
import { BUILDING_SPRITES, RESOURCE_SPRITES, spriteUrl, UNIT_SPRITES } from './sprites';
import {
  AGE_OUTPUT_STEP,
  AGE_STORAGE_STEP,
  ageCost,
  buildBlock,
  buildingCost,
  canAfford,
  legacyOnReset,
  trackCost,
  tracksReady,
  type Cost,
  type Derived,
} from './sim';
import type { GameState } from './state';

export type TabId = 'library' | 'wonders' | 'trade' | 'nation';

export interface UiState {
  /** Which side panel is open, or null when the map has the screen to itself. */
  tab: TabId | null;
  dialog: null | {
    kind: 'export' | 'import' | 'reset' | 'about' | 'settings' | 'newgame';
    text?: string;
  };
  /** Player preferences, so the settings dialog can draw its toggles. */
  settings: Settings;
}

/** What the map layer knows that the overlay needs in order to draw itself. */
export interface MapInfo {
  selected: Placement | null;
  postedHere: number;
  /** Of those posted, how many have arrived and are producing. */
  workingHere: number;
  slotsHere: number;
  idle: number;
  walking: number;
  ghost: string | null;
}

const TERRAIN_WORD: Record<string, string> = {
  forest: 'woodland',
  hills: 'hills',
  desert: 'sand',
  grass: 'open ground',
};

/** Plain-language version of where a building is allowed to stand. */
function groundNote(def: string): string {
  const wants = groundFor(def);
  if (wants.length > 1) return 'open ground';
  return TERRAIN_WORD[wants[0]] ?? wants[0];
}

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Compact number for a UI that will eventually be showing quadrillions. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  let v = Math.abs(n);
  if (v < 1000) return sign + (v < 10 ? v.toFixed(1) : Math.floor(v).toString());
  let tier = 0;
  while (v >= 1000 && tier < SUFFIX.length - 1) {
    v /= 1000;
    tier += 1;
  }
  return sign + v.toFixed(v < 10 ? 2 : 1) + SUFFIX[tier];
}

function rate(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  const v = Math.abs(n);
  return `${sign}${v < 10 ? v.toFixed(2) : fmt(v)}/s`;
}

/** A multiplier where higher is better, shown as the multiplier itself. */
function times(mult: number): string {
  return `x${mult.toFixed(2)}`;
}

/** A multiplier where lower is better, shown as the discount it represents. */
function cheaper(mult: number): string {
  const off = Math.round((1 - mult) * 100);
  return off <= 0 ? 'full price' : `${off}% off`;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/**
 * Rendered sprites for the things that also appear on the map — resources,
 * buildings and citizens. Wonders, trade goods and library tracks keep the
 * hand-drawn icons in `art.ts`; nothing has been modelled for a pyramid or a
 * silk route, and a generic glyph would say less.
 */
function resIcon(id: string): string {
  const name = RESOURCE_SPRITES[id];
  return name ? `<img class="icon" src="${spriteUrl(name)}" alt="">` : art(id);
}

function buildIcon(def: string): string {
  const name = BUILDING_SPRITES[def];
  return name ? `<img class="icon" src="${spriteUrl(name)}" alt="">` : art(def);
}

function citizenIcon(): string {
  return `<img class="icon" src="${spriteUrl(UNIT_SPRITES.idle)}" alt="">`;
}

/** One labelled on/off switch. The whole row is the hit target. */
function toggleRow(id: string, name: string, note: string, on: boolean): string {
  return `<button class="toggle-row ${on ? 'on' : 'off'}" data-act="toggle" data-id="${id}"
      role="switch" aria-checked="${on}">
      <span class="toggle-text">
        <span class="toggle-name">${name}</span>
        <span class="toggle-note">${note}</span>
      </span>
      <span class="toggle-switch"><i></i></span>
      <span class="toggle-state">${on ? 'On' : 'Off'}</span>
    </button>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function costRow(state: GameState, cost: Cost): string {
  const parts = Object.entries(cost).map(([res, v]) => {
    const short = state.res[res as ResourceId] < (v as number);
    return `<span class="${short ? 'short' : ''}"><i>${resIcon(res)}</i>${fmt(v as number)}</span>`;
  });
  return `<div class="cost">${parts.join('')}</div>`;
}

function panel(title: string, note: string, body: string): string {
  // The key survives the rebuild; main.ts uses it to restore scroll position.
  const key = title.toLowerCase().replace(/[^a-z]+/g, '-');
  return `<div class="panel"><div class="sheet">
    <div class="panel-title"><span>${title}</span>${note ? `<small>${note}</small>` : ''}</div>
    <div class="panel-body" data-scroll="panel-${key}">${body}</div>
  </div></div>`;
}

// ---------------------------------------------------------------- ledger

// ----------------------------------------------------------- citizen desk

/**
 * The workforce, shown in the bar whenever nothing is selected.
 *
 * This replaces a full panel that gave every resource line two rows and a
 * five-button stepper. It did not fit the bar and had to be scrolled, which is
 * useless for something read at a glance mid-game. One line per resource now,
 * and only the two buttons anyone reaches for.
 */
function people(state: GameState, d: Derived, info: MapInfo): string {
  const rows = RESOURCES.filter((r) => d.slots[r.id] > 0)
    .map((r) => {
      const posted = state.jobs[r.id];
      const full = posted >= d.slots[r.id];
      return `<div class="crew-row">
        <span class="crew-ico">${resIcon(r.id)}</span>
        <span class="crew-name">${r.name}</span>
        <span class="crew-rate">${fmt(d.gross[r.id])}/s</span>
        <span class="crew-posted">${posted}/${d.slots[r.id]}</span>
        <button class="btn small" data-act="job" data-id="${r.id}" data-d="-1"
          ${posted <= 0 ? 'disabled' : ''} aria-label="Recall one from ${r.name}">&minus;</button>
        <button class="btn small" data-act="job" data-id="${r.id}" data-d="1"
          ${info.idle <= 0 || full ? 'disabled' : ''} aria-label="Post one to ${r.name}">+</button>
      </div>`;
    })
    .join('');

  return `<div class="crew">
    <div class="crew-head">
      <span class="crew-title">Workforce</span>
      <span class="crew-sum">${info.idle} idle${info.walking ? `, ${info.walking} walking` : ''}</span>
      <button class="btn ghost small" data-act="auto" ${info.idle <= 0 ? 'disabled' : ''}>Send to work</button>
      <button class="btn ghost small" data-act="recall">Recall all</button>
    </div>
    ${rows || '<div class="crew-empty">Nothing to work at yet. Put up a farm or a camp.</div>'}
    ${
      d.starving
        ? '<div class="crew-warn">The larder is empty and people are leaving. Post more to Food, or build farms.</div>'
        : ''
    }
  </div>`;
}

function chronicle(state: GameState): string {
  const lines = state.log
    .map((l) => `<div class="${l.kind}">${esc(l.msg)}</div>`)
    .join('');
  return panel('Chronicle', '', `<div class="log" data-scroll="log">${lines}</div>`);
}

// ------------------------------------------------------------------ tabs

/**
 * The build palette. Picking one here does not build it — it arms placement,
 * and the building is paid for and raised where the player clicks on the map.
 */
function buildPalette(state: GameState, d: Derived, info: MapInfo): string {
  const items = BUILDINGS.filter((b) => b.age <= state.age + 1)
    .map((def) => {
      const locked = def.age > state.age;
      const owned = state.buildings[def.id] ?? 0;
      const cost = buildingCost(state, def.id, d);
      const block = locked ? 'age' : buildBlock(state, def.id, d);
      const armed = info.ghost === def.id;

      const why = locked
        ? `Unlocks in the ${AGES[def.age].name}`
        : block === 'cities'
          ? `${owned} / ${d.cityCap} cities. Raise Civic for more`
          : block === 'slots'
            ? 'No build slots left. Found another city'
            : block === 'cost'
              ? 'Not enough in store'
              : `Needs ${groundNote(def.id)}`;

      const price = Object.entries(cost)
        .map(([r, v]) => `${fmt(v as number)} ${r}`)
        .join(' · ');

      // Icon and a count, with everything else in the tooltip. A name and a
      // price cannot fit a command-card button at any size that still lets the
      // whole card show at once; trying spilled the text outside the button.
      return `<button class="pal ${armed ? 'armed' : ''} ${block ? 'blocked' : ''}"
        data-act="pick" data-id="${def.id}" ${locked ? 'disabled' : ''}
        aria-label="${esc(def.name)}"
        title="${esc(def.name)}
${esc(def.blurb)}
${esc(price)}
${esc(why)}">
        <span class="pal-art">${buildIcon(def.id)}</span>
        ${owned ? `<span class="pal-count">${owned}</span>` : ''}
      </button>`;
    })
    .join('');

  const hint = info.ghost
    ? `Click the map to place your ${esc(BUILDING_BY_NAME(info.ghost))}. Right-click or Esc to cancel.`
    : 'Hover a building to see what it does. Click one, then click the map.';

  return `<div class="palette">
    <div class="palette-hint">${hint}</div>
    <div class="palette-row" data-scroll="palette">${items}</div>
  </div>`;
}

function BUILDING_BY_NAME(id: string): string {
  return BUILDINGS.find((b) => b.id === id)?.name ?? id;
}

/** Details and orders for whatever building is currently selected. */
function selectionPanel(state: GameState, d: Derived, info: MapInfo): string {
  const p = info.selected;
  if (!p) return '';
  const def = BUILDINGS.find((b) => b.id === p.def);
  if (!def) return '';

  let body = '';
  if (def.produces) {
    // The same live figures the map shows, so the panel and the pips agree.
    const scale = d.globalOut * d.resOut[def.produces.res] * d.ageOutput;
    const perCopy = def.produces.base * scale;
    const perHead = def.produces.perCitizen * scale * d.citizenBonus;
    // perHead already carries citizenBonus, and only arrived citizens pay out.
    const here = perCopy + info.workingHere * perHead;
    const enRoute = info.postedHere - info.workingHere;
    body = `<div class="sel-rate">${fmt(here)}/s ${def.produces.res}</div>
      <div class="sel-sub">${fmt(perCopy)}/s standing · +${fmt(perHead)}/s each citizen at work</div>
      <div class="sel-sub">${info.postedHere} / ${info.slotsHere} posts filled${
        enRoute ? ` · ${enRoute} still walking` : ''
      } · ${info.idle} idle</div>
      <div class="sel-orders">
        <button class="btn small" data-act="post-here"
          ${info.idle <= 0 || info.postedHere >= info.slotsHere ? 'disabled' : ''}>Post one</button>
        <button class="btn small" data-act="fill-here"
          ${info.idle <= 0 || info.postedHere >= info.slotsHere ? 'disabled' : ''}>Fill</button>
        <button class="btn ghost small" data-act="empty-here"
          ${info.postedHere <= 0 ? 'disabled' : ''}>Recall</button>
      </div>`;
  } else {
    body = '<div class="sel-sub">Takes no citizens. It works just by standing here.</div>';
  }

  const cities = state.buildings.city ?? 0;
  const lastCity = def.cityLimited && cities <= 1;

  return `<div class="selection"><div class="sheet">
    <div class="sel-head">
      <span class="sel-art">${buildIcon(def.id)}</span>
      <span>
        <span class="sel-name">${def.name}</span>
        <span class="sel-blurb">${esc(def.blurb)}</span>
      </span>
      <button class="btn ghost small" data-act="deselect" title="Close">✕</button>
    </div>
    ${body}
    <div class="sel-foot">
      <button class="btn ghost small" data-act="raze" ${lastCity ? 'disabled' : ''}
        title="${lastCity ? 'Your last city cannot be razed' : 'Tear it down for half its cost'}">Raze</button>
    </div>
  </div></div>`;
}

function libraryTab(state: GameState, d: Derived): string {
  const cards = TRACKS.map((track) => {
    const level = state.tracks[track.id];
    const maxed = level >= MAX_TRACK_LEVEL;
    const ageBlocked = !maxed && level > state.age;
    const cost = trackCost(state, track.id, d);
    const ok = !maxed && !ageBlocked && canAfford(state, cost);
    return `<div class="card ${maxed ? 'done' : ''}">
      <div class="card-art">${art(track.icon)}</div>
      <div>
        <div class="card-head"><span class="card-name">${track.name}</span><span class="card-owned">${level}</span></div>
        <div class="card-blurb">${esc(track.blurb)}</div>
        <div class="card-effect">Next level: ${track.perLevel}</div>
        <div class="card-foot">
          ${maxed ? '<div class="cost">Fully researched</div>' : costRow(state, cost)}
          <button class="btn small" data-act="research" data-id="${track.id}" ${ok ? '' : 'disabled'}>Research</button>
        </div>
        ${ageBlocked ? `<div class="card-blurb" style="margin:6px 0 0">Level ${level + 1} needs the ${AGES[Math.min(level, MAX_AGE)].name}.</div>` : ''}
      </div>
    </div>`;
  }).join('');

  const need = state.age + 1;
  const met = TRACKS.filter((t) => state.tracks[t.id] >= need).length;
  return panel(
    'The Library',
    `${met} / ${TRACKS_NEEDED_TO_ADVANCE} tracks at level ${need}`,
    `<div class="card-blurb" style="margin:0 0 10px">
       Four tracks, one level per age. To leave an age you need at least
       ${TRACKS_NEEDED_TO_ADVANCE} of the 4 standing at the level that matches it. No single
       track will carry you forward alone.
     </div>
     <div class="grid">${cards}</div>`,
  );
}

function wondersTab(state: GameState): string {
  const cards = WONDERS.filter((w) => w.age <= state.age + 1)
    .map((w) => {
      const built = state.wonders.includes(w.id);
      const locked = w.age > state.age;
      const ok = !built && !locked && canAfford(state, w.cost);
      return `<div class="card ${built ? 'done' : locked ? 'locked' : ''}">
        <div class="card-art">${art(w.icon)}</div>
        <div>
          <div class="card-head"><span class="card-name">${w.name}</span>
            <span class="card-owned">${built ? '✦' : AGES[w.age].name.split(' ')[0]}</span></div>
          <div class="card-blurb">${esc(w.blurb)}</div>
          <div class="card-effect">${w.effectText}</div>
          <div class="card-foot">
            ${built ? '<div class="cost">Standing</div>' : costRow(state, w.cost)}
            ${built ? '' : `<button class="btn small" data-act="wonder" data-id="${w.id}" ${ok ? '' : 'disabled'}>Raise</button>`}
          </div>
        </div>
      </div>`;
    })
    .join('');
  return panel(
    'Wonders',
    `${state.wonders.length} / ${WONDERS.length} standing`,
    `<div class="card-blurb" style="margin:0 0 10px">
       Built once, kept forever, and never lost to a new dynasty's reckoning of what it cost.
     </div>
     <div class="grid">${cards}</div>`,
  );
}

function tradeTab(state: GameState, d: Derived): string {
  const cards = RARES.map((r) => {
    const active = state.routes.includes(r.id);
    const full = !active && state.routes.length >= d.routeCap;
    return `<div class="card ${active ? 'done' : full ? 'locked' : ''}">
      <div class="card-art">${art(r.icon)}</div>
      <div>
        <div class="card-head"><span class="card-name">${r.name}</span>
          <span class="card-owned">${active ? '✦' : ''}</span></div>
        <div class="card-effect" style="margin-top:4px">${r.effectText}</div>
        <div class="card-foot">
          <div class="cost">${active ? 'On a route' : full ? 'No route free' : 'Idle'}</div>
          <button class="btn small ${active ? 'ghost' : ''}" data-act="route" data-id="${r.id}"
            ${full ? 'disabled' : ''}>${active ? 'Drop' : 'Route'}</button>
        </div>
      </div>
    </div>`;
  }).join('');

  return panel(
    'Trade Routes',
    `${state.routes.length} / ${d.routeCap} routes running`,
    `<div class="card-blurb" style="margin:0 0 10px">
       Every second Market opens a route, and Commerce opens more. Re-routing is free, so
       swap goods whenever your bottleneck moves.
     </div>
     <div class="grid">${cards}</div>`,
  );
}

function nationTab(state: GameState, d: Derived): string {
  const last = state.age >= MAX_AGE;
  const need = state.age + 1;
  const reqs = TRACKS.map((t) => {
    const met = state.tracks[t.id] >= need;
    return `<div class="req ${met ? 'met' : 'unmet'}"><i>${art(t.icon)}</i>${t.name} ${state.tracks[t.id]} / ${need}</div>`;
  }).join('');

  const cost = ageCost(state, d);
  const ready = tracksReady(state);
  const ok = !last && ready && canAfford(state, cost);

  const advance = last
    ? `<div class="card-blurb">Your nation has reached the Information Age. There is no further rung, so
         start a new dynasty to carry what you learned into the next run.</div>`
    : `<div class="advance">
         <div class="card-blurb" style="margin:0">
           Advancing to the <strong>${AGES[state.age + 1].name}</strong> needs
           ${TRACKS_NEEDED_TO_ADVANCE} of 4 library tracks at level ${need}, and the stores below.
           Every building you own becomes a building of the new age:
           <strong>output x${AGE_OUTPUT_STEP}</strong> and
           <strong>storage x${AGE_STORAGE_STEP}</strong>, immediately and permanently.
         </div>
         <div class="reqs">${reqs}</div>
         ${costRow(state, cost)}
         <button class="btn wide" data-act="advance" ${ok ? '' : 'disabled'}>
           ${ready ? `Enter the ${AGES[state.age + 1].name}` : 'The library is not ready'}
         </button>
       </div>`;

  const gain = legacyOnReset(state);
  const stats = [
    ['Output multiplier', times(d.globalOut * Math.pow(AGE_OUTPUT_STEP, state.age))],
    ['Food storage vs. a bare start', times(d.caps.food / RESOURCES[0].baseCap)],
    ['Research cost', cheaper(d.researchMult)],
    ['Construction cost', cheaper(d.buildMult)],
    ['Age advance cost', cheaper(d.ageMult)],
    ['Build slots', `${d.buildUsed} / ${d.buildCap}`],
    ['Cities', `${state.buildings.city ?? 0} / ${d.cityCap}`],
    ['Wonders standing', `${state.wonders.length}`],
  ]
    .map(
      ([k, v]) =>
        `<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px dashed rgba(90,68,30,.2)">
           <span style="font-size:12px;color:var(--ink-soft)">${k}</span>
           <strong style="font-size:12.5px;font-variant-numeric:tabular-nums">${v}</strong>
         </div>`,
    )
    .join('');

  return `${panel('Advance the Age', '', advance)}
    ${panel('The State of the Nation', '', stats)}
    ${panel(
      'A New Dynasty',
      `${state.legacy} legacy banked · ${state.dynasties} dynasties`,
      `<div class="card-blurb" style="margin:0 0 8px">
         Ending the run wipes your cities, stores, library and wonders, and mints
         <strong>legacy</strong> from how far you got. Each point is a permanent
         <strong>+3% output</strong> on every run that follows.
       </div>
       <div class="card-foot">
         <div class="cost"><span><i>${art('legacy')}</i>${gain} legacy from this run</span></div>
         <button class="btn" data-act="reset" ${gain <= 0 ? 'disabled' : ''}>Found a new dynasty</button>
       </div>`,
    )}
    ${panel(
      'Records',
      '',
      `<div style="display:flex;gap:8px;flex-wrap:wrap">
         <button class="btn ghost small" data-act="export">Export save</button>
         <button class="btn ghost small" data-act="import">Import save</button>
         <button class="btn ghost small" data-act="settings">Settings</button>
         <button class="btn ghost small" data-act="about">About</button>
         <button class="btn ghost small" data-act="to-menu">Main menu</button>
         <button class="btn ghost small" data-act="wipe">Erase everything</button>
       </div>`,
    )}`;
}

// ---------------------------------------------------------------- dialogs

function dialog(ui: UiState, state: GameState | null): string {
  if (!ui.dialog) return '';
  const d = ui.dialog;
  let title = '';
  let body = '';
  let actions = '<button class="btn ghost" data-act="dismiss">Close</button>';

  if (d.kind === 'export') {
    title = 'Export save';
    body = `<p>Copy this text somewhere safe. Importing it anywhere restores this nation exactly.</p>
      <textarea class="save-blob" readonly>${esc(d.text ?? '')}</textarea>`;
  } else if (d.kind === 'import') {
    title = 'Import save';
    body = `<p>Paste an exported save. This replaces the nation you are playing now.</p>
      <textarea class="save-blob" id="import-blob" placeholder="Paste here"></textarea>`;
    actions = `<button class="btn ghost" data-act="dismiss">Cancel</button>
      <button class="btn" data-act="do-import">Replace my nation</button>`;
  } else if (d.kind === 'reset' && state) {
    title = 'Found a new dynasty?';
    body = `<p>Your cities, stores, library and wonders all go. You keep
      <strong>${state.legacy + legacyOnReset(state)} legacy</strong>, worth
      <strong>+${(state.legacy + legacyOnReset(state)) * 3}% output</strong> from the first minute of the next run.</p>
      <p>This cannot be undone.</p>`;
    actions = `<button class="btn ghost" data-act="dismiss">Not yet</button>
      <button class="btn" data-act="do-reset">Begin again</button>`;
  } else if (d.kind === 'newgame') {
    title = 'Start a new nation?';
    body = `<p>The nation saved in this browser is replaced, and it is the only copy.
      There is no undo.</p>
      <p>If you want to keep it, close this, continue that game, and use
      <strong>Export save</strong> in the Nation panel first.</p>`;
    actions = `<button class="btn ghost" data-act="dismiss">Keep it</button>
      <button class="btn" data-act="do-new">Start a new nation</button>`;
  } else if (d.kind === 'settings') {
    title = 'Settings';
    body = `<div class="settings">
      ${toggleRow(
        'sound',
        'Sound effects',
        'Clicks, placing a building, and the bell when an age turns.',
        ui.settings.sound,
      )}
      ${toggleRow(
        'music',
        'Music',
        'A slow generated score that sits under the game. Off by default.',
        ui.settings.music,
      )}
    </div>`;
  } else {
    title = 'About';
    body = `<p>The map, buildings, citizens, resource icons and sound effects are
      <a href="https://kenney.nl" target="_blank" rel="noopener">Kenney's</a> Medieval RTS,
      Board Game Icons and Interface Sounds packs, released under CC0, which puts them in the public domain. Free for
      any use. Credit is not required by that licence; it is given because it is deserved.</p>
      <p>The wonder, trade-good and library-track icons, and every panel texture, are original
      work drawn as inline SVG and CSS. The parchment and stone are procedural gradients over an
      SVG turbulence filter.</p>
      <p>The music is not a recording. Kenney publishes jingles but no looping score, so rather
      than take on a track under a different licence it is generated as you play, in WebAudio.</p>
      <p>The game itself is MIT licensed and open source.</p>`;
  }

  return `<div class="scrim" data-act="dismiss-bg"><div class="panel"><div class="sheet">
    <div class="panel-title"><span>${title}</span></div>
    <div class="dialog-body">${body}<div class="dialog-actions">${actions}</div></div>
  </div></div></div>`;
}

// ------------------------------------------------------------------ shell

/** True when a tab has something the player could act on right now. */
function hasAction(state: GameState, d: Derived, tab: TabId): boolean {
  if (tab === 'library') {
    return TRACKS.some(
      (t) =>
        state.tracks[t.id] < MAX_TRACK_LEVEL &&
        state.tracks[t.id] <= state.age &&
        canAfford(state, trackCost(state, t.id, d)),
    );
  }
  if (tab === 'wonders') {
    return WONDERS.some((w) => w.age <= state.age && !state.wonders.includes(w.id) && canAfford(state, w.cost));
  }
  if (tab === 'trade') return state.routes.length < d.routeCap;
  return state.age < MAX_AGE && tracksReady(state) && canAfford(state, ageCost(state, d));
}

const TAB_NAMES: Record<TabId, string> = {
  library: 'Library',
  wonders: 'Wonders',
  trade: 'Trade',
  nation: 'Nation',
};

/**
 * The heads-up display, arranged the way Rise of Nations arranges one.
 *
 * Resources read down the top-left corner, the age sits centred above the map,
 * population sits top-right, and the chronicle runs as bare text down the left
 * with no panel around it. Everything you act on lives in one solid bar along
 * the bottom: the build card on the left, the minimap in the middle, and a
 * context panel on the right showing whatever is selected, or the workforce
 * when nothing is.
 *
 * The middle of that bar is deliberately left empty. The minimap is painted
 * onto the map canvas underneath, at coordinates measured from that hole, so it
 * survives the overlay being rebuilt four times a second.
 */
export function render(state: GameState, d: Derived, ui: UiState, info: MapInfo): string {
  const tabs = (Object.keys(TAB_NAMES) as TabId[])
    .map(
      (id) =>
        `<button class="tab ${ui.tab === id ? 'active' : ''}" data-act="tab" data-id="${id}">
           ${TAB_NAMES[id]}${hasAction(state, d, id) ? '<span class="pip"></span>' : ''}
         </button>`,
    )
    .join('');

  let content = '';
  if (ui.tab === 'library') content = libraryTab(state, d);
  else if (ui.tab === 'wonders') content = wondersTab(state);
  else if (ui.tab === 'trade') content = tradeTab(state, d);
  else if (ui.tab === 'nation') content = nationTab(state, d);

  // With something selected the right of the bar reports on it; otherwise it
  // falls back to the workforce, which is what you most often want next.
  const context = info.selected ? selectionPanel(state, d, info) : people(state, d, info);

  return `<div class="hud-res">${resourceStack(state, d)}</div>
    <div class="hud-age">${ageBanner(state, d)}</div>
    <div class="hud-pop">${popReadout(state, d, info)}</div>
    <div class="hud-log">${chronicle(state)}</div>
    <div class="hud-drawer">
      ${ui.tab ? `<div class="drawer" data-scroll="drawer">${content}</div>` : ''}
    </div>
    <div class="hud-bar">
      <div class="bar-card">${buildPalette(state, d, info)}</div>
      <div class="bar-mid">
        <div class="minimap-slot" id="minimap-slot"></div>
        <div class="tabs">${tabs}</div>
      </div>
      <div class="bar-context">${context}</div>
    </div>
    ${dialog(ui, state)}`;
}

/** Resources down the top-left corner: amount, cap, and the rate under it. */
function resourceStack(state: GameState, d: Derived): string {
  return RESOURCES.filter((r) => state.age >= r.age || state.res[r.id] > 0)
    .map((r) => {
      const amount = state.res[r.id];
      const cap = d.caps[r.id];
      const net = d.net[r.id];
      const full = amount / cap >= 0.999;
      return `<div class="res-row ${full ? 'full' : ''}" title="${esc(r.blurb)}">
        <span class="res-ico">${resIcon(r.id)}</span>
        <span class="res-num">${fmt(amount)}<span class="res-cap">/${fmt(cap)}</span></span>
        <span class="res-net ${net < 0 ? 'negative' : ''}">${rate(net)}</span>
      </div>`;
    })
    .join('');
}

function ageBanner(state: GameState, d: Derived): string {
  const age = AGES[state.age];
  const last = state.age >= MAX_AGE;
  const ready = tracksReady(state);
  const affordable = canAfford(state, ageCost(state, d));
  const label = last ? 'Final age' : ready ? 'Advance the age' : 'Library not ready';
  return `<div class="age-strip">
    <span class="age-mark">${ROMAN[state.age]}</span>
    <span class="age-title">${age.name}</span>
    <button class="btn small" data-act="tab" data-id="nation" ${last ? 'disabled' : ''}>
      ${label}${!last && ready && affordable ? ' •' : ''}
    </button>
  </div>`;
}

function popReadout(state: GameState, d: Derived, info: MapInfo): string {
  return `<div class="pop-strip">
    <span class="pop-ico">${citizenIcon()}</span>
    <span class="pop-num">${Math.floor(state.citizens)}<span class="res-cap">/${d.popCap}</span></span>
    <span class="pop-sub">${info.idle} idle${info.walking ? `, ${info.walking} walking` : ''}</span>
  </div>`;
}

// ------------------------------------------------------------------- menu

/** How long ago a save was written, in words. */
function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 90) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/**
 * The landing screen. It runs before any nation exists, so it takes the saved
 * game rather than a live one — and crucially the caller must not have started
 * the simulation or the autosave yet, or continuing would be overwritten by
 * the very menu offering it.
 */
export function renderMenu(saved: GameState | null, ui: UiState): string {
  let resume = '';
  if (saved) {
    const cities = saved.buildings.city ?? 0;
    const built = Object.values(saved.buildings).reduce((a, b) => a + b, 0);
    resume = `<button class="menu-item primary" data-act="menu-continue">
        <span class="menu-item-name">Continue</span>
        <span class="menu-item-note">
          ${AGES[saved.age].name} · ${Math.floor(saved.citizens)} citizens ·
          ${cities} ${cities === 1 ? 'city' : 'cities'} ·
          ${built} ${built === 1 ? 'building' : 'buildings'}
          <br>saved ${ago(Date.now() - saved.savedAt)}${
            saved.dynasties ? ` · dynasty ${saved.dynasties + 1}` : ''
          }
        </span>
      </button>`;
  }

  // Starting fresh silently destroys an existing run, so when there is one to
  // lose the button says so and routes through a confirmation.
  const newAct = saved ? 'menu-new-confirm' : 'menu-new';
  const newNote = saved
    ? 'Abandons the nation above and generates a new map'
    : 'Generate a map and settle your first city';

  return `<div class="menu-screen">
    <div class="menu-card">
      <div class="menu-head">
        <div class="menu-title">Rise of Ages</div>
        <div class="menu-sub">
          Carry one nation from the Ancient world to the Information Age.
          Where you build matters as much as what.
        </div>
      </div>

      <div class="menu-items">
        ${resume}
        <button class="menu-item ${saved ? '' : 'primary'}" data-act="${newAct}">
          <span class="menu-item-name">New Nation</span>
          <span class="menu-item-note">${newNote}</span>
        </button>
        <button class="menu-item" data-act="import">
          <span class="menu-item-name">Import a save</span>
          <span class="menu-item-note">Paste a save exported from another browser</span>
        </button>
        <button class="menu-item" data-act="settings">
          <span class="menu-item-name">Settings</span>
          <span class="menu-item-note">Sound and music</span>
        </button>
        <button class="menu-item" data-act="about">
          <span class="menu-item-name">About</span>
          <span class="menu-item-note">Credits and licensing</span>
        </button>
        <a class="menu-item" href="${import.meta.env.BASE_URL}godot/">
          <span class="menu-item-name">The isometric version</span>
          <span class="menu-item-note">Same economy, rebuilt in Godot. Slower to load</span>
        </a>
      </div>

      <div class="menu-keys">
        <span><b>Drag</b> or <b>WASD</b> to pan</span>
        <span><b>Wheel</b> to zoom</span>
        <span><b>Shift</b> to place several</span>
        <span><b>Esc</b> to cancel</span>
      </div>
    </div>
    ${dialog(ui, saved)}
  </div>`;
}
