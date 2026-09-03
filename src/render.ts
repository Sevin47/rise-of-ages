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
import { BUILDING_SPRITES, sprite, spritesReady, TERRAIN_TILES, UNIT_SPRITES } from './sprites';
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

function bakeTerrain(map: GameMap): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = WORLD_W;
  c.height = WORLD_H;
  const g = c.getContext('2d')!;

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = TERRAIN_ORDER[map.terrain[ty * MAP_W + tx]];
      const x = tx * TILE;
      const y = ty * TILE;

      // Flat colour first: it is the fallback if the sprite has not loaded,
      // and it stops seams showing between scaled tiles.
      g.fillStyle = GROUND[t];
      g.fillRect(x, y, TILE, TILE);

      const variants = TERRAIN_TILES[t];
      const img = sprite(variants[Math.floor(hash(tx, ty) * variants.length) % variants.length]);
      if (img) g.drawImage(img, x, y, TILE, TILE);
    }
  }
  return c;
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

  return { draw, screenToWorld };
}
