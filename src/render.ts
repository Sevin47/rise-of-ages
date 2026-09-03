/**
 * Canvas renderer for the map.
 *
 * Terrain is baked once into an offscreen canvas and blitted each frame — it
 * only changes when a new map is generated, so redrawing 2,816 tiles every
 * frame would be pure waste. Buildings and citizens are drawn live on top.
 *
 * All art is Kenney's CC0 sprite sets (see `public/kenney/CREDITS.txt`). Every
 * sprite is a 64x64 PNG, so drawing is uniform: pick a name, scale to the box.
 * Because the sprites load over the network the first bake can happen before
 * they arrive, so the bake is repeated once they are all in.
 */
import {
  footprint,
  MAP_H,
  MAP_W,
  slotsOf,
  TILE,
  WORLD_H,
  WORLD_W,
  type GameMap,
  type Terrain,
} from './map';
import { BUILDING_SPRITES, DECOR, sprite, spritesReady, TERRAIN_TILES, UNIT_SPRITES } from './sprites';
import { postedAt } from './units';

export interface Camera {
  /** World coordinate sitting at the centre of the viewport. */
  x: number;
  y: number;
  zoom: number;
}

export interface ViewState {
  cam: Camera;
  /** Building def the player is currently placing, if any. */
  ghost: string | null;
  ghostTile: { tx: number; ty: number } | null;
  ghostOk: boolean;
  selected: number | null;
  hover: number | null;
}

const TERRAIN_ORDER: Terrain[] = ['water', 'grass', 'forest', 'hills', 'desert'];

/** Flat fallback colours, drawn under the tiles and shown until they load. */
const GROUND: Record<Terrain, string> = {
  water: '#8ad3ef',
  grass: '#4aa03f',
  forest: '#3c8a37',
  hills: '#b6b6b6',
  desert: '#eadcb4',
};

/** Cheap deterministic hash, so a tile picks the same variant every bake. */
function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A seeded stream of numbers for one tile, so its scatter never changes. */
function tileRandom(tx: number, ty: number): () => number {
  let a = (tx * 73856093) ^ (ty * 19349663);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bake the world.
 *
 * Three passes, and the order is the whole trick:
 *
 *  1. Ground tiles, which on their own are 32-pixel squares with hard edges —
 *     the stair-stepped coastlines and rectangular hills that made the map look
 *     blocky.
 *  2. A blur over just that ground layer, which softens every one of those
 *     edges at once and turns the stair-steps into shorelines.
 *  3. Decor — trees, rocks, bushes — drawn crisp on top at positions that pay
 *     no attention to tile boundaries, and are allowed to overhang them. This
 *     is what actually breaks up the lattice: the eye follows the scatter and
 *     stops seeing the grid underneath.
 */
function bakeTerrain(map: GameMap): HTMLCanvasElement {
  const ground = document.createElement('canvas');
  ground.width = WORLD_W;
  ground.height = WORLD_H;
  const gg = ground.getContext('2d')!;

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = TERRAIN_ORDER[map.terrain[ty * MAP_W + tx]];
      const x = tx * TILE;
      const y = ty * TILE;

      gg.fillStyle = GROUND[t];
      gg.fillRect(x, y, TILE, TILE);

      const variants = TERRAIN_TILES[t];
      const img = sprite(variants[Math.floor(hash(tx, ty) * variants.length) % variants.length]);
      // Bleed each tile a pixel past its edge; with the blur that follows it
      // stops a faint seam showing along every boundary.
      if (img) gg.drawImage(img, x - 1, y - 1, TILE + 2, TILE + 2);
    }
  }

  dissolveBoundaries(gg, map);

  const out = document.createElement('canvas');
  out.width = WORLD_W;
  out.height = WORLD_H;
  const g = out.getContext('2d')!;

  // Soften what is left. `filter` is unsupported on some older browsers, where
  // this silently does nothing and the map simply looks a little harder.
  g.filter = 'blur(3px)';
  g.drawImage(ground, 0, 0);
  g.filter = 'none';

  scatterDecor(g, map);
  return out;
}

const NEIGHBOURS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Break up the straight edges between one terrain and another.
 *
 * Blurring alone was not enough, and it is worth being precise about why: a
 * blur makes a straight line fuzzy, but it leaves it straight. The regions
 * themselves were still tile-aligned rectangles, so sand met rock in a clean
 * horizontal run with a ninety-degree corner, and that is exactly what reads as
 * "blocky" however soft the pixels are.
 *
 * So the boundary is dissolved before it is blurred: where two terrains meet,
 * each spills a few irregular lobes across the shared edge into the other. The
 * two sides interlock, the corner disappears, and the eye stops finding the
 * grid. Depth is capped below half a tile so a tile still reads as its own
 * terrain — placement is decided per tile, and the picture must not lie about
 * which tile is which.
 */
function dissolveBoundaries(g: CanvasRenderingContext2D, map: GameMap): void {
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const here = TERRAIN_ORDER[map.terrain[ty * MAP_W + tx]];

      for (const [dx, dy] of NEIGHBOURS) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (TERRAIN_ORDER[map.terrain[ny * MAP_W + nx]] === here) continue;

        // Seeded per directed edge, so the bake is identical every time.
        const rand = tileRandom(tx * 31 + dx * 7, ty * 17 + dy * 11);
        const lobes = 2 + Math.floor(rand() * 3);
        g.fillStyle = GROUND[here];

        for (let i = 0; i < lobes; i++) {
          const along = rand();
          const depth = (0.05 + rand() * 0.4) * TILE;
          const r = TILE * (0.16 + rand() * 0.22);

          // Walk out from the shared edge into the neighbouring tile.
          const edgeX = (tx + (dx === 1 ? 1 : 0)) * TILE;
          const edgeY = (ty + (dy === 1 ? 1 : 0)) * TILE;
          const cx = dx !== 0 ? edgeX + dx * depth : (tx + along) * TILE;
          const cy = dy !== 0 ? edgeY + dy * depth : (ty + along) * TILE;

          g.beginPath();
          g.arc(cx, cy, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
}

function scatterDecor(g: CanvasRenderingContext2D, map: GameMap): void {
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = TERRAIN_ORDER[map.terrain[ty * MAP_W + tx]];
      const decor = DECOR[t];
      if (!decor) continue;

      const rand = tileRandom(tx, ty);
      const count = decor.min + Math.floor(rand() * (decor.max - decor.min + 1));
      for (let i = 0; i < count; i++) {
        const name = decor.sprites[Math.floor(rand() * decor.sprites.length)];
        const img = sprite(name);
        const size = TILE * (decor.scale[0] + rand() * (decor.scale[1] - decor.scale[0]));
        // Deliberately allowed past the tile edge — that overhang is what
        // stops the scatter from re-drawing the grid it is meant to hide.
        const x = (tx + rand()) * TILE - size / 2;
        const y = (ty + rand()) * TILE - size * 0.6;
        if (!img) continue;

        // A contact shadow, so a tree sits in the grass rather than on it.
        g.fillStyle = 'rgba(24,40,18,0.20)';
        g.beginPath();
        g.ellipse(x + size / 2, y + size * 0.86, size * 0.26, size * 0.1, 0, 0, Math.PI * 2);
        g.fill();
        g.drawImage(img, x, y, size, size);
      }
    }
  }
}

// -------------------------------------------------------------- renderer --

export function createRenderer(canvas: HTMLCanvasElement) {
  const g = canvas.getContext('2d')!;
  let baked: HTMLCanvasElement | null = null;
  let bakedSeed = NaN;
  let bakedComplete = false;

  function screenToWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    return { x: (sx - w / 2) / cam.zoom + cam.x, y: (sy - h / 2) / cam.zoom + cam.y };
  }

  /** Draw a sprite into a box, falling back to a muted block while it loads. */
  function blit(name: string, x: number, y: number, w: number, h: number): void {
    const img = sprite(name);
    if (img) {
      g.drawImage(img, x, y, w, h);
    } else {
      g.fillStyle = 'rgba(70,54,36,0.45)';
      g.fillRect(x + w * 0.15, y + h * 0.15, w * 0.7, h * 0.7);
    }
  }

  function draw(map: GameMap, view: ViewState): void {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    // Re-bake once, after the tile sprites finish loading, so the opening
    // frames are not stuck showing flat fallback colour.
    if (!baked || bakedSeed !== map.seed || (!bakedComplete && spritesReady())) {
      baked = bakeTerrain(map);
      bakedSeed = map.seed;
      bakedComplete = spritesReady();
    }

    const cam = view.cam;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#1d2b33';
    g.fillRect(0, 0, w, h);
    g.imageSmoothingEnabled = true;

    g.save();
    g.translate(w / 2, h / 2);
    g.scale(cam.zoom, cam.zoom);
    g.translate(-cam.x, -cam.y);

    // Only blit the slice of the world that is actually on screen.
    const vx = cam.x - w / 2 / cam.zoom;
    const vy = cam.y - h / 2 / cam.zoom;
    const vw = w / cam.zoom;
    const vh = h / cam.zoom;
    const sx = Math.max(0, Math.floor(vx));
    const sy = Math.max(0, Math.floor(vy));
    const sw = Math.min(WORLD_W - sx, Math.ceil(vw) + 2);
    const sh = Math.min(WORLD_H - sy, Math.ceil(vh) + 2);
    if (sw > 0 && sh > 0) g.drawImage(baked, sx, sy, sw, sh, sx, sy, sw, sh);

    drawPlacements(map, view, vx, vy, vw, vh);
    drawGhost(view);
    drawWorkers(map, vx, vy, vw, vh);

    g.restore();

  }

  function drawPlacements(
    map: GameMap,
    view: ViewState,
    vx: number,
    vy: number,
    vw: number,
    vh: number,
  ): void {
    for (const p of map.placements) {
      const n = footprint(p.def);
      const x = p.tx * TILE;
      const y = p.ty * TILE;
      const s = n * TILE;
      if (x + s < vx || y + s < vy || x > vx + vw || y > vy + vh) continue;

      // A soft contact shadow so the building sits on the ground rather than
      // floating over it. The sprites have no shadow of their own.
      g.fillStyle = 'rgba(20,30,15,0.22)';
      g.beginPath();
      g.ellipse(x + s / 2, y + s * 0.86, s * 0.36, s * 0.13, 0, 0, Math.PI * 2);
      g.fill();

      if (p.id === view.selected) {
        g.strokeStyle = '#ffd94a';
        g.lineWidth = 2.5;
        g.strokeRect(x + 1, y + 1, s - 2, s - 2);
      }

      blit(BUILDING_SPRITES[p.def] ?? 'structure/11', x, y, s, s);

      // Slot pips: filled for a citizen posted here.
      const slots = slotsOf(p.def);
      if (slots) {
        const posted = postedAt(map, p.id);
        const pw = 5;
        const total = slots * (pw + 2) - 2;
        let px = x + s / 2 - total / 2;
        for (let i = 0; i < slots; i++) {
          g.fillStyle = i < posted ? '#ffd94a' : 'rgba(15,25,12,0.55)';
          g.fillRect(px, y - 6, pw, 3.5);
          px += pw + 2;
        }
      }
    }
  }

  function drawGhost(view: ViewState): void {
    if (!view.ghost || !view.ghostTile) return;
    const n = footprint(view.ghost);
    const x = view.ghostTile.tx * TILE;
    const y = view.ghostTile.ty * TILE;
    const s = n * TILE;

    g.fillStyle = view.ghostOk ? 'rgba(120,220,110,0.32)' : 'rgba(220,80,70,0.38)';
    g.fillRect(x, y, s, s);
    g.strokeStyle = view.ghostOk ? '#8fe07d' : '#e0736a';
    g.lineWidth = 2;
    g.strokeRect(x, y, s, s);

    g.globalAlpha = 0.8;
    blit(BUILDING_SPRITES[view.ghost] ?? 'structure/11', x, y, s, s);
    g.globalAlpha = 1;
  }

  function drawWorkers(map: GameMap, vx: number, vy: number, vw: number, vh: number): void {
    // Citizens are drawn a little larger than a half tile so they stay legible
    // when the camera is pulled back.
    const size = TILE * 0.72;
    for (const wk of map.workers) {
      if (wk.x < vx - size || wk.y < vy - size || wk.x > vx + vw + size || wk.y > vy + vh + size) {
        continue;
      }
      // A gentle bob while working, so a staffed site visibly has people at it.
      const bob = wk.phase === 'work' ? Math.sin(wk.bob * 3) * 1.2 : 0;
      const x = wk.x - size / 2;
      const y = wk.y - size * 0.72 + bob;
      const cy = wk.y + size * 0.2;
      const rx = size * 0.24;
      const ry = size * 0.11;

      g.fillStyle = 'rgba(20,30,15,0.26)';
      g.beginPath();
      g.ellipse(wk.x, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();

      // The pack's villagers are near-identical at this size, so the sprite
      // alone cannot carry what a citizen is doing. A ring at their feet can:
      // it stays readable when they are ten pixels tall.
      if (wk.phase !== 'idle') {
        g.strokeStyle = wk.phase === 'work' ? 'rgba(255,217,74,0.95)' : 'rgba(120,196,255,0.95)';
        g.lineWidth = Math.max(1, size * 0.075);
        g.beginPath();
        g.ellipse(wk.x, cy, rx, ry, 0, 0, Math.PI * 2);
        g.stroke();
      }

      blit(UNIT_SPRITES[wk.phase], x, y, size, size);
    }
  }

  /**
   * Paint the minimap into its own canvas. Buildings become pips because their
   * sprites would be mud at this scale, and the white box shows where the
   * camera is looking.
   */
  function drawMinimap(mini: HTMLCanvasElement, map: GameMap, view: ViewState): void {
    if (!baked) return;
    const dpr = window.devicePixelRatio || 1;
    const w = mini.clientWidth;
    const h = mini.clientHeight;
    if (!w || !h) return;
    if (mini.width !== Math.round(w * dpr) || mini.height !== Math.round(h * dpr)) {
      mini.width = Math.round(w * dpr);
      mini.height = Math.round(h * dpr);
    }
    const m = mini.getContext('2d')!;
    m.setTransform(dpr, 0, 0, dpr, 0, 0);
    m.clearRect(0, 0, w, h);
    m.drawImage(baked, 0, 0, WORLD_W, WORLD_H, 0, 0, w, h);

    const sx = w / WORLD_W;
    const sy = h / WORLD_H;

    for (const p of map.placements) {
      const size = p.def === 'city' ? 4 : 3;
      m.fillStyle = p.def === 'city' ? '#ffd94a' : '#ffb454';
      m.fillRect((p.tx + 0.5) * TILE * sx - size / 2, (p.ty + 0.5) * TILE * sy - size / 2, size, size);
    }

    const cw = canvas.clientWidth / view.cam.zoom;
    const ch = canvas.clientHeight / view.cam.zoom;
    m.strokeStyle = 'rgba(255,255,255,0.9)';
    m.lineWidth = 1;
    m.strokeRect((view.cam.x - cw / 2) * sx, (view.cam.y - ch / 2) * sy, cw * sx, ch * sy);
  }

  return { draw, drawMinimap, screenToWorld };
}
