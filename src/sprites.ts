/**
 * What each game concept looks like, and a loader that hands the renderer an
 * image only once it is safe to draw.
 *
 * The art is generated: `art/blender/render_web.py` builds it from the same
 * models the Godot build uses, photographed from a different camera, since this
 * build draws a square grid from above rather than an isometric diamond. Every
 * sprite is a square PNG, which is why the renderer can treat them identically
 * and just scale on draw.
 *
 * Files are addressed through `import.meta.env.BASE_URL` because the production
 * build is served from a subpath on GitHub Pages; a hard-coded "/art/..." works
 * in dev and 404s in the build.
 */

const BASE = `${import.meta.env.BASE_URL}art/`;

/**
 * The ground each terrain is drawn on.
 *
 * Note that forest uses the *grass* tiles. Drawing forest as a tile with trees
 * printed on it is what made the map look like a spreadsheet: every tree landed
 * on a 32-pixel lattice and the eye read the grid instead of the wood. Trees
 * are now scattered sprites (see DECOR) at positions that ignore tile edges, so
 * the ground underneath can stay plain.
 */
export const TERRAIN_TILES: Record<string, string[]> = {
  water: ['tile/water_0', 'tile/water_1'],
  grass: ['tile/grass_0', 'tile/grass_1'],
  forest: ['tile/grass_0', 'tile/grass_1'],
  hills: ['tile/hills_0', 'tile/hills_1'],
  desert: ['tile/desert_0', 'tile/desert_1'],
};

/**
 * Things strewn across the ground, per terrain: how many to a tile, how big,
 * and which sprites to choose from. Density is a range so that clumps thin out
 * and thicken naturally instead of reading as a uniform texture.
 */
export interface Decor {
  sprites: string[];
  /** Minimum and maximum items per tile. */
  min: number;
  max: number;
  /** Sprite size as a fraction of a tile. */
  scale: [number, number];
}

export const DECOR: Record<string, Decor> = {
  forest: {
    sprites: ['env/forest_0', 'env/forest_1', 'env/forest_2', 'env/forest_3'],
    min: 2, max: 4, scale: [0.85, 1.25],
  },
  hills: {
    sprites: ['env/hills_0', 'env/hills_1', 'env/hills_2', 'env/hills_3'],
    min: 1, max: 2, scale: [0.6, 0.95],
  },
  // A stray bush or fallen log, sparse enough that open ground still reads as
  // open ground — a Farm has to be placeable on it at a glance.
  grass: { sprites: ['env/grass_0', 'env/grass_1'], min: 0, max: 1, scale: [0.4, 0.6] },
  desert: { sprites: ['env/desert_0'], min: 0, max: 1, scale: [0.4, 0.6] },
};

/** The structure drawn for each building. Rendered from the model of the same
 * name in `art/blender/render_buildings.py`, so the two builds show the same
 * farm from different angles rather than two different farms.
 */
export const BUILDING_SPRITES: Record<string, string> = {
  city: 'structure/city',
  farm: 'structure/farm',
  camp: 'structure/camp',
  mine: 'structure/mine',
  market: 'structure/market',
  library: 'structure/library',
  granary: 'structure/granary',
  temple: 'structure/temple',
  warehouse: 'structure/warehouse',
  workshop: 'structure/workshop',
  university: 'structure/university',
  well: 'structure/well',
};

/**
 * Citizens are colour-coded by what they are doing. These are picked for
 * contrast against green terrain at roughly 22 pixels, not for their medieval
 * roles — the pack's green villagers disappear into the grass entirely, and
 * two tan ones are indistinguishable at that size.
 */
export const UNIT_SPRITES = {
  idle: 'unit/idle', // pale, so a crowd of unemployed recedes
  walk: 'unit/walk', // blue, unmistakable while crossing open ground
  work: 'unit/work', // gold, warm against the fields
} as const;

/** Resource icons for the ledger. */
export const RESOURCE_SPRITES: Record<string, string> = {
  food: 'icon/food',
  timber: 'icon/timber',
  metal: 'icon/metal',
  wealth: 'icon/wealth',
  knowledge: 'icon/knowledge',
  oil: 'icon/oil',
};

/** Public URL for a sprite name, for use in an `<img src>` in the overlay. */
export function spriteUrl(name: string): string {
  return `${BASE}${name}.png`;
}

// ------------------------------------------------------------- the loader --

const cache = new Map<string, HTMLImageElement>();
let pending = 0;
let settled = 0;

/**
 * An image ready to draw, or null while it loads. Callers draw a placeholder
 * for the frame or two before it resolves rather than blocking the game on it.
 */
export function sprite(name: string): HTMLImageElement | null {
  const hit = cache.get(name);
  if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null;

  const img = new Image();
  pending++;
  const done = () => {
    settled++;
  };
  img.addEventListener('load', done);
  img.addEventListener('error', () => {
    done();
    console.warn(`sprite failed to load: ${name}`);
  });
  img.src = spriteUrl(name);
  cache.set(name, img);
  return null;
}

/** Warm the cache so the first frame is not drawn full of placeholders. */
export function preloadSprites(): void {
  for (const list of Object.values(TERRAIN_TILES)) list.forEach(sprite);
  for (const d of Object.values(DECOR)) d.sprites.forEach(sprite);
  Object.values(BUILDING_SPRITES).forEach(sprite);
  Object.values(UNIT_SPRITES).forEach(sprite);
  Object.values(RESOURCE_SPRITES).forEach(sprite);
}

/** True once every requested sprite has loaded (or failed). */
export function spritesReady(): boolean {
  return pending > 0 && settled >= pending;
}
