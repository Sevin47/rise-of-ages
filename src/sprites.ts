/**
 * The Kenney sprite set: what each game concept looks like, and a loader that
 * hands the renderer an image only once it is safe to draw.
 *
 * The art is Kenney's Medieval RTS and Board Game Icons packs, both CC0 — see
 * `public/kenney/CREDITS.txt`. Everything is a 64x64 PNG, which is why the
 * renderer can treat every sprite identically and just scale on draw.
 *
 * Files are addressed through `import.meta.env.BASE_URL` because the production
 * build is served from a subpath on GitHub Pages; a hard-coded "/kenney/..."
 * works in dev and 404s in the build.
 */

const BASE = `${import.meta.env.BASE_URL}kenney/`;

/** Terrain, with several interchangeable tiles per type for visual variety. */
export const TERRAIN_TILES: Record<string, string[]> = {
  water: ['tile/27', 'tile/28'],
  // Deliberately only the two bare tiles. The pack's sparse-bush tile reads as
  // woodland at a glance, and grass has to be unmistakable: it is the terrain
  // that decides where a Farm may stand.
  grass: ['tile/57', 'tile/58'],
  forest: ['tile/44', 'tile/46', 'tile/47', 'tile/48'],
  hills: ['tile/15', 'tile/16'],
  desert: ['tile/01', 'tile/02'],
};

/**
 * Which structure stands in for each building. The pack is medieval and the
 * game runs to the Information Age, so these are chosen to read by silhouette
 * rather than to be literal — the Oil Well gets the stone tower because it is
 * the only thing in the set that reads as industrial at 32 pixels.
 */
export const BUILDING_SPRITES: Record<string, string> = {
  city: 'structure/06', // walled castle — the landmark on the map
  farm: 'structure/19', // barn with the red door
  camp: 'structure/21', // cabin with a timber lean-to
  mine: 'structure/08', // stone adit cut into the hill
  market: 'structure/07', // stall under an awning
  library: 'structure/11', // plain stone hall
  granary: 'structure/23', // round-doored storehouse
  temple: 'structure/04', // church
  warehouse: 'structure/03', // long low store
  workshop: 'structure/20', // house with the forge chimney
  university: 'structure/05', // stone keep
  well: 'structure/12', // stone tower
};

/**
 * Citizens are colour-coded by what they are doing. These are picked for
 * contrast against green terrain at roughly 22 pixels, not for their medieval
 * roles — the pack's green villagers disappear into the grass entirely, and
 * two tan ones are indistinguishable at that size.
 */
export const UNIT_SPRITES = {
  idle: 'unit/17', // pale, so a crowd of unemployed recedes
  walk: 'unit/04', // blue, unmistakable while crossing open ground
  work: 'unit/10', // orange and gold, warm against the fields
} as const;

/** Resource icons for the ledger. */
export const RESOURCE_SPRITES: Record<string, string> = {
  food: 'icon/resource_wheat',
  timber: 'icon/resource_wood',
  metal: 'icon/resource_iron',
  wealth: 'icon/pouch',
  knowledge: 'icon/book_open',
  oil: 'icon/flask_full',
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
  Object.values(BUILDING_SPRITES).forEach(sprite);
  Object.values(UNIT_SPRITES).forEach(sprite);
  Object.values(RESOURCE_SPRITES).forEach(sprite);
}

/** True once every requested sprite has loaded (or failed). */
export function spritesReady(): boolean {
  return pending > 0 && settled >= pending;
}
