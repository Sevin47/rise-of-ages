/**
 * All static game data. Nothing here mutates at runtime — the save file only
 * ever stores counts and ids that point back into these tables.
 */

export type ResourceId = 'food' | 'timber' | 'metal' | 'wealth' | 'knowledge' | 'oil';
export type TrackId = 'civic' | 'commerce' | 'science' | 'craft';

export interface ResourceDef {
  id: ResourceId;
  name: string;
  /** Age at which the resource becomes visible at all. */
  age: number;
  baseCap: number;
  blurb: string;
}

export const RESOURCES: ResourceDef[] = [
  { id: 'food', name: 'Food', age: 0, baseCap: 500, blurb: 'Feeds your citizens. Run out and they start leaving.' },
  { id: 'timber', name: 'Timber', age: 0, baseCap: 500, blurb: 'The bones of every building you will ever raise.' },
  { id: 'metal', name: 'Metal', age: 0, baseCap: 300, blurb: 'Tools, then machines, then everything after.' },
  { id: 'wealth', name: 'Wealth', age: 0, baseCap: 300, blurb: 'Coin. Buys what your land cannot grow.' },
  { id: 'knowledge', name: 'Knowledge', age: 0, baseCap: 250, blurb: 'The only currency that buys a new age.' },
  { id: 'oil', name: 'Oil', age: 5, baseCap: 400, blurb: 'Nothing in the modern world moves without it.' },
];

// ------------------------------------------------------------------- ages

export interface AgeDef {
  name: string;
  blurb: string;
  /** Hue used to tint the age badge and the header trim. */
  tint: string;
  cost: Partial<Record<ResourceId, number>>;
}

/**
 * Advancing also demands library levels: at least THREE of the four tracks must
 * sit at the level matching the age you are leaving. That is what stops you
 * from rushing a single track and skipping the tree.
 */
export const TRACKS_NEEDED_TO_ADVANCE = 3;

export const AGES: AgeDef[] = [
  {
    name: 'Ancient Age',
    blurb: 'A few huts, a river, and more forest than you can cut.',
    tint: '#8a6f4a',
    cost: { food: 400, timber: 400, metal: 150, knowledge: 150 },
  },
  {
    name: 'Classical Age',
    blurb: 'Roads, coin, and the first buildings meant to outlive their builders.',
    tint: '#a8794a',
    cost: { food: 13000, timber: 13000, metal: 6600, wealth: 4200, knowledge: 5400 },
  },
  {
    name: 'Medieval Age',
    blurb: 'Stone walls, guilds, and universities that argue with the temple.',
    tint: '#7a4a52',
    cost: { food: 72000, timber: 72000, metal: 42000, wealth: 30000, knowledge: 33000 },
  },
  {
    name: 'Gunpowder Age',
    blurb: 'Powder changes what a wall is worth and what a nation can reach.',
    tint: '#4a453d',
    cost: { food: 4.2e5, timber: 4.2e5, metal: 2.7e5, wealth: 2.0e5, knowledge: 2.0e5 },
  },
  {
    name: 'Enlightenment Age',
    blurb: 'Measurement, banking, and the conviction that everything is knowable.',
    tint: '#4a6a72',
    cost: { food: 2.5e6, timber: 2.5e6, metal: 1.7e6, wealth: 1.4e6, knowledge: 1.3e6 },
  },
  {
    name: 'Industrial Age',
    blurb: 'Coal smoke over the valley. Output stops being limited by daylight.',
    tint: '#5d5148',
    cost: { food: 1.3e7, timber: 1.3e7, metal: 9.5e6, wealth: 7.5e6, knowledge: 6.5e6, oil: 1.0e5 },
  },
  {
    name: 'Modern Age',
    blurb: 'Grids, assembly lines, and a century that moves faster than its laws.',
    tint: '#3f5a6b',
    cost: { food: 6.8e7, timber: 6.8e7, metal: 5.2e7, wealth: 4.4e7, knowledge: 3.6e7, oil: 1.6e6 },
  },
  {
    name: 'Information Age',
    blurb: 'The last age on the ladder. Everything your nation knows, at once.',
    tint: '#3a5f52',
    cost: {},
  },
];

export const MAX_AGE = AGES.length - 1;

// ----------------------------------------------------------- library tracks

export interface TrackDef {
  id: TrackId;
  name: string;
  icon: string;
  blurb: string;
  /** Human-readable summary of what one more level buys you. */
  perLevel: string;
  /** Secondary resource spent alongside Knowledge. */
  with: ResourceId;
}

export const TRACKS: TrackDef[] = [
  {
    id: 'civic',
    name: 'Civic',
    icon: 'civic',
    blurb: 'Law, census and citizenship. How many people your nation can hold.',
    perLevel: '+14 population cap, +4% citizen output, +1 city you may found',
    with: 'food',
  },
  {
    id: 'commerce',
    name: 'Commerce',
    icon: 'commerce',
    blurb: 'Weights, coinage and roads. How much you can hold and what it fetches.',
    perLevel: 'storage x1.6 on every resource, +8% Wealth, +1 trade route every other level',
    with: 'wealth',
  },
  {
    id: 'science',
    name: 'Science',
    icon: 'science',
    blurb: 'Writing, method and instruments. Research feeding on itself.',
    perLevel: '+12% Knowledge, research costs -7%, age advance costs -4%',
    with: 'metal',
  },
  {
    id: 'craft',
    name: 'Craft',
    icon: 'craft',
    blurb: 'Kilns, mills and machine tools. Every building does more with less.',
    perLevel: '+11% output from every building, construction costs -5%',
    with: 'timber',
  },
];

export const MAX_TRACK_LEVEL = AGES.length;

/** Knowledge price of taking a track from `level` to `level + 1`. */
export function techCost(level: number): { knowledge: number; secondary: number } {
  return {
    knowledge: Math.round(60 * Math.pow(4.6, level)),
    secondary: Math.round(120 * Math.pow(5.1, level)),
  };
}

// --------------------------------------------------------------- buildings

export interface Production {
  res: ResourceId;
  /** Output per second from the building itself, before multipliers. */
  base: number;
  /** Extra output per second for each citizen working here. */
  perCitizen: number;
  /** Citizen jobs opened per copy. */
  slots: number;
}

export interface BuildingEffects {
  popCap?: number;
  buildCap?: number;
  cityCap?: number;
  /** Flat storage added per copy. */
  caps?: Partial<Record<ResourceId, number>>;
  /**
   * Storage multiplier applied once per copy (0.3 means x1.3 each). Age costs
   * climb geometrically, so at least one source of storage has to as well or
   * the larder stops being able to hold the price of the next age.
   */
  capScale?: Partial<Record<ResourceId, number>>;
  /** Additive share added to the global output multiplier per copy. */
  outputMult?: number;
  /** Additive share added to citizen growth per copy. */
  growthMult?: number;
  /** Additive research discount per copy (0.05 = 5% cheaper). */
  researchDiscount?: number;
  /** Trade route slots per copy. */
  routes?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  icon: string;
  age: number;
  blurb: string;
  cost: Partial<Record<ResourceId, number>>;
  /** Each copy multiplies the next copy's price by this. */
  growth: number;
  produces?: Production;
  effects?: BuildingEffects;
  /** Cities are capped by Civic rather than by the building cap. */
  cityLimited?: boolean;
  /** Cities and wonders do not consume ordinary building slots. */
  freeOfBuildCap?: boolean;
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'city',
    name: 'City',
    icon: 'city',
    age: 0,
    blurb: 'A new settlement. Room for more people, more building, more everything.',
    // Deliberately priced in Food and Timber only. Expansion is the escape hatch
    // when your build slots are full, so it must never depend on a resource you
    // might have no room left to produce.
    cost: { food: 340, timber: 340 },
    growth: 2.1,
    effects: { popCap: 16, buildCap: 12, caps: { food: 400, timber: 400, metal: 250, wealth: 250, knowledge: 200 } },
    cityLimited: true,
    freeOfBuildCap: true,
  },
  {
    id: 'farm',
    name: 'Farm',
    icon: 'farm',
    age: 0,
    blurb: 'Turned earth and a barn. The first thing every nation builds.',
    cost: { timber: 16 },
    growth: 1.14,
    produces: { res: 'food', base: 0.2, perCitizen: 0.3, slots: 2 },
  },
  {
    id: 'camp',
    name: "Woodcutter's Camp",
    icon: 'camp',
    age: 0,
    blurb: 'An axe, a stump, and a standing order to keep going.',
    cost: { food: 16 },
    growth: 1.14,
    produces: { res: 'timber', base: 0.18, perCitizen: 0.27, slots: 2 },
  },
  {
    id: 'mine',
    name: 'Mine',
    icon: 'mine',
    age: 0,
    blurb: 'A cut in the hillside that pays for itself slowly and then all at once.',
    cost: { timber: 45, food: 25 },
    growth: 1.17,
    produces: { res: 'metal', base: 0.11, perCitizen: 0.2, slots: 2 },
  },
  {
    id: 'market',
    name: 'Market',
    icon: 'market',
    age: 0,
    blurb: 'Where surplus becomes coin. Also where foreign goods first show up.',
    cost: { timber: 90, metal: 30 },
    growth: 1.21,
    produces: { res: 'wealth', base: 0.09, perCitizen: 0.17, slots: 2 },
    effects: { routes: 0.5 },
  },
  {
    id: 'library',
    name: 'Library',
    icon: 'library',
    age: 0,
    blurb: 'Copied scrolls in a dry room. Everything upstream of an age flows through here.',
    cost: { timber: 140, metal: 60 },
    growth: 1.24,
    produces: { res: 'knowledge', base: 0.05, perCitizen: 0.11, slots: 2 },
  },
  {
    id: 'granary',
    name: 'Granary',
    icon: 'granary',
    age: 0,
    blurb: 'Nothing rots and nothing spills. Raises what Food and Timber can stack to.',
    cost: { timber: 70, food: 40 },
    growth: 1.55,
    effects: { caps: { food: 400, timber: 400 }, capScale: { food: 0.3, timber: 0.3 } },
  },
  {
    id: 'temple',
    name: 'Temple',
    icon: 'temple',
    age: 0,
    blurb: 'A reason to stay. Draws people in faster than food alone ever does.',
    cost: { timber: 170, metal: 70, wealth: 40 },
    growth: 1.34,
    effects: { popCap: 7, growthMult: 0.16 },
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    icon: 'warehouse',
    age: 1,
    blurb: 'Crates, ledgers and a lock. Metal, Wealth and Knowledge stop overflowing.',
    cost: { timber: 260, metal: 130 },
    growth: 1.55,
    effects: {
      caps: { metal: 400, wealth: 400, knowledge: 250 },
      capScale: { metal: 0.3, wealth: 0.3, knowledge: 0.25 },
    },
  },
  {
    id: 'workshop',
    name: 'Workshop',
    icon: 'workshop',
    age: 1,
    blurb: 'Better tools for everyone else. Lifts the output of every building you own.',
    cost: { timber: 400, metal: 220, wealth: 90 },
    growth: 1.42,
    effects: { outputMult: 0.07 },
  },
  {
    id: 'university',
    name: 'University',
    icon: 'university',
    age: 2,
    blurb: 'Argument as an institution. Research gets cheaper and Knowledge pours in.',
    cost: { timber: 1400, metal: 900, wealth: 700 },
    growth: 1.4,
    produces: { res: 'knowledge', base: 0.6, perCitizen: 0.55, slots: 3 },
    effects: { researchDiscount: 0.04 },
  },
  {
    id: 'well',
    name: 'Oil Well',
    icon: 'well',
    age: 5,
    blurb: 'A derrick over a black seam. The age runs on what comes up.',
    cost: { timber: 9e4, metal: 1.4e5, wealth: 8e4 },
    growth: 1.28,
    produces: { res: 'oil', base: 1.4, perCitizen: 1.1, slots: 3 },
  },
];

export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));

// ----------------------------------------------------------------- wonders

export interface WonderDef {
  id: string;
  name: string;
  icon: string;
  age: number;
  blurb: string;
  /** One line describing the permanent bonus, shown on the card. */
  effectText: string;
  cost: Partial<Record<ResourceId, number>>;
  effects: {
    outputMult?: number;
    resMult?: Partial<Record<ResourceId, number>>;
    capMult?: number;
    popMult?: number;
    growthMult?: number;
    researchDiscount?: number;
  };
}

export const WONDERS: WonderDef[] = [
  {
    id: 'pyramid', name: 'The Pyramids', icon: 'pyramid', age: 0,
    blurb: 'A mountain built on purpose, by people who had to be fed every day of it.',
    effectText: '+30% Food and +30% Timber, forever',
    cost: { food: 900, timber: 900, metal: 400 },
    effects: { resMult: { food: 0.3, timber: 0.3 } },
  },
  {
    id: 'colossus', name: 'The Colossus', icon: 'colossus', age: 0,
    blurb: 'Bronze tall enough that ships trade here just to say they saw it.',
    effectText: '+40% Wealth, forever',
    cost: { metal: 700, timber: 500, wealth: 300 },
    effects: { resMult: { wealth: 0.4 } },
  },
  {
    id: 'gardens', name: 'The Hanging Gardens', icon: 'gardens', age: 1,
    blurb: 'Terraces watered by machine, built to make one homesick queen stay.',
    effectText: '+25% population cap and +40% citizen growth',
    cost: { food: 5000, timber: 4000, wealth: 2000 },
    effects: { popMult: 0.25, growthMult: 0.4 },
  },
  {
    id: 'colosseum', name: 'The Colosseum', icon: 'colosseum', age: 1,
    blurb: 'Fifty thousand seats. A nation watching itself be a nation.',
    effectText: '+18% output from every building',
    cost: { metal: 5000, timber: 5000, wealth: 3500 },
    effects: { outputMult: 0.18 },
  },
  {
    id: 'greatwall', name: 'The Great Wall', icon: 'greatwall', age: 2,
    blurb: 'Less a wall than a supply line with battlements on top.',
    effectText: '+80% storage on every resource',
    cost: { timber: 30000, metal: 26000, food: 20000 },
    effects: { capMult: 0.8 },
  },
  {
    id: 'cathedral', name: 'The Grand Cathedral', icon: 'cathedral', age: 2,
    blurb: 'Three generations of masons, and a library nobody was allowed to burn.',
    effectText: 'Research costs 25% less',
    cost: { timber: 26000, metal: 22000, wealth: 20000, knowledge: 9000 },
    effects: { researchDiscount: 0.25 },
  },
  {
    id: 'pagoda', name: 'The Porcelain Tower', icon: 'pagoda', age: 3,
    blurb: 'Glazed brick that catches light for miles. Scholars come for the view and stay.',
    effectText: '+50% Knowledge',
    cost: { timber: 2.0e5, metal: 1.6e5, wealth: 1.4e5, knowledge: 6e4 },
    effects: { resMult: { knowledge: 0.5 } },
  },
  {
    id: 'observatory', name: 'The Royal Observatory', icon: 'observatory', age: 4,
    blurb: 'A brass tube, a clock, and the first place a nation agreed what time it was.',
    effectText: '+40% Knowledge and research costs 15% less',
    cost: { metal: 1.2e6, wealth: 1.0e6, knowledge: 5e5 },
    effects: { resMult: { knowledge: 0.4 }, researchDiscount: 0.15 },
  },
  {
    id: 'tower', name: 'The Iron Tower', icon: 'tower', age: 5,
    blurb: 'Put up as a temporary exhibit. Nobody could think of a reason to take it down.',
    effectText: '+30% output from every building',
    cost: { metal: 9e6, timber: 5e6, wealth: 7e6, oil: 60000 },
    effects: { outputMult: 0.3 },
  },
  {
    id: 'collider', name: 'The Supercollider', icon: 'collider', age: 6,
    blurb: 'Twenty-seven kilometres of vacuum, dug to answer a question with no application.',
    effectText: '+80% Knowledge and +20% output from every building',
    cost: { metal: 6e7, wealth: 5e7, knowledge: 3e7, oil: 1.5e6 },
    effects: { resMult: { knowledge: 0.8 }, outputMult: 0.2 },
  },
];

// ----------------------------------------------------------------- rares

export interface RareDef {
  id: string;
  name: string;
  icon: string;
  effectText: string;
  effects: {
    resMult?: Partial<Record<ResourceId, number>>;
    outputMult?: number;
    capMult?: number;
    growthMult?: number;
    buildDiscount?: number;
  };
}

/**
 * Rare goods reached through trade routes. Markets open route slots; you choose
 * which goods to run, and you can re-route them at any time for free.
 */
export const RARES: RareDef[] = [
  { id: 'wine', name: 'Wine', icon: 'wine', effectText: '+14% Food', effects: { resMult: { food: 0.14 } } },
  { id: 'furs', name: 'Furs', icon: 'furs', effectText: '+14% Timber', effects: { resMult: { timber: 0.14 } } },
  { id: 'gems', name: 'Gems', icon: 'gems', effectText: '+14% Metal', effects: { resMult: { metal: 0.14 } } },
  { id: 'silk', name: 'Silk', icon: 'silk', effectText: '+16% Wealth', effects: { resMult: { wealth: 0.16 } } },
  { id: 'spice', name: 'Spice', icon: 'spice', effectText: '+14% Knowledge', effects: { resMult: { knowledge: 0.14 } } },
  { id: 'marble', name: 'Marble', icon: 'marble', effectText: 'Buildings cost 12% less', effects: { buildDiscount: 0.12 } },
  { id: 'horses', name: 'Horses', icon: 'horses', effectText: '+35% citizen growth', effects: { growthMult: 0.35 } },
  { id: 'salt', name: 'Salt', icon: 'salt', effectText: '+30% storage on every resource', effects: { capMult: 0.3 } },
  { id: 'dyes', name: 'Dyes', icon: 'dyes', effectText: '+8% output from every building', effects: { outputMult: 0.08 } },
  { id: 'cotton', name: 'Cotton', icon: 'cotton', effectText: '+8% output from every building', effects: { outputMult: 0.08 } },
];

export const RARE_BY_ID = new Map(RARES.map((r) => [r.id, r]));

// ------------------------------------------------------------ base numbers

export const BASE = {
  /** Citizens at the very start of a run. */
  citizens: 3,
  startResources: { food: 120, timber: 120 } as Partial<Record<ResourceId, number>>,
  popCap: 12,
  buildCap: 16,
  cityCap: 1,
  /** Food eaten per citizen per second. */
  upkeep: 0.03,
  /** Citizens added per second at an empty nation with a full larder. */
  growth: 0.075,
  /** Citizens lost per second per missing unit of food. */
  starvation: 0.5,
  routes: 1,
};
