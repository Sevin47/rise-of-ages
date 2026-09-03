/**
 * The whole icon set, hand-authored as inline SVG.
 *
 * Everything here is original work drawn to one shared grammar so the set reads
 * as a single hand: a 64x64 field, flat shapes, a dark ink outline, and a gold
 * accent somewhere in every piece. Nothing is traced from or derived from any
 * commercial game's art, so the project carries no license baggage.
 */

const INK = '#2b2118';
const GOLD = '#c9a227';

/** Wrap icon guts in the shared 64x64 field. */
function icon(inner: string): string {
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" class="icon" aria-hidden="true">${inner}</svg>`;
}

// ---------------------------------------------------------------- resources

const FOOD = icon(`
  <g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round">
    <path d="M32 58V26"/>
    <path d="M21 56c0-12 1-19 4-24"/>
    <path d="M43 56c0-12-1-19-4-24"/>
  </g>
  <g fill="#d9a441" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
    <path d="M32 6c6 5 8 12 6 17-2 5-10 5-12 0-2-5 0-12 6-17z"/>
    <path d="M20 15c6 3 9 10 8 15-2 5-9 6-12 2-3-5-1-13 4-17z"/>
    <path d="M44 15c-6 3-9 10-8 15 2 5 9 6 12 2 3-5 1-13-4-17z"/>
  </g>
  <path d="M22 45h20" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/>
  <path d="M22 45h20" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
`);

const TIMBER = icon(`
  <g stroke="${INK}" stroke-width="2.5">
    <rect x="8" y="34" width="30" height="14" rx="7" fill="#8a5a33"/>
    <rect x="26" y="34" width="30" height="14" rx="7" fill="#9c6a3d"/>
    <rect x="17" y="18" width="30" height="14" rx="7" fill="#b07c4a"/>
  </g>
  <g fill="none" stroke="${INK}" stroke-width="2">
    <circle cx="47" cy="25" r="4"/><circle cx="38" cy="41" r="4"/><circle cx="15" cy="41" r="4"/>
  </g>
  <circle cx="47" cy="25" r="1.6" fill="${GOLD}"/>
`);

const METAL = icon(`
  <g stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M12 46h26l-5-9H17z" fill="#7d8794"/>
    <path d="M30 46h22l-4-9H26z" fill="#98a2ae"/>
    <path d="M20 35h24l-4-9H24z" fill="#b3bcc6"/>
  </g>
  <path d="M27 29h9" stroke="#e6ecf2" stroke-width="2.5" stroke-linecap="round"/>
`);

const WEALTH = icon(`
  <g stroke="${INK}" stroke-width="2.5">
    <ellipse cx="24" cy="45" rx="14" ry="6" fill="#b8860b"/>
    <ellipse cx="40" cy="38" rx="14" ry="6" fill="#d4a017"/>
    <ellipse cx="30" cy="29" rx="14" ry="6" fill="${GOLD}"/>
  </g>
  <ellipse cx="30" cy="29" rx="6" ry="2.4" fill="none" stroke="#f2dd97" stroke-width="2"/>
`);

const KNOWLEDGE = icon(`
  <path d="M14 18c0-3 3-5 6-5h30c-3 2-4 4-4 7v29c0 3-2 5-5 5H18c-3 0-4-2-4-5z"
        fill="#e8d7b0" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M46 13c3 0 4 2 4 5v29" fill="none" stroke="${INK}" stroke-width="2.5"/>
  <g fill="none" stroke="#6b5433" stroke-width="2.6" stroke-linecap="round">
    <path d="M22 24h18M22 32h18M22 40h11"/>
  </g>
  <path d="M14 46h32" fill="none" stroke="${GOLD}" stroke-width="2.5"/>
`);

const OIL = icon(`
  <path d="M20 16h24c2 6 2 26 0 32H20c-2-6-2-26 0-32z" fill="#3b3a44" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <g fill="none" stroke="${GOLD}" stroke-width="2.5"><path d="M19 26h26M19 38h26"/></g>
  <path d="M32 8c3 5 5 8 5 11a5 5 0 0 1-10 0c0-3 2-6 5-11z" fill="#1c1b22" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
`);

// ---------------------------------------------------------------- buildings

const CITY = icon(`
  <path d="M8 52V26l6-4 6 4v26z" fill="#9a8f7d" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M44 52V26l6-4 6 4v26z" fill="#9a8f7d" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M20 52V32h24v20z" fill="#b5a892" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M26 52V42a6 6 0 0 1 12 0v10z" fill="#4a3a28" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M14 14v8M14 14l8 3-8 3" fill="${GOLD}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M50 14v8M50 14l8 3-8 3" fill="${GOLD}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
`);

const FARM = icon(`
  <path d="M6 52c8-4 14-4 20 0 6-4 12-4 20 0M6 44c8-4 14-4 20 0 6-4 12-4 20 0"
        fill="none" stroke="#7fa050" stroke-width="3" stroke-linecap="round"/>
  <path d="M34 40V22l12-8 12 8v18z" fill="#a8492f" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M42 40V30h8v10z" fill="#e8d7b0" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M34 22l12-8 12 8" fill="none" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
`);

const CAMP = icon(`
  <rect x="6" y="38" width="44" height="18" rx="9" fill="#8a5a33" stroke="${INK}" stroke-width="2.5"/>
  <ellipse cx="50" cy="47" rx="8" ry="9" fill="#b07c4a" stroke="${INK}" stroke-width="2.5"/>
  <ellipse cx="50" cy="47" rx="3.5" ry="4" fill="none" stroke="${INK}" stroke-width="1.8"/>
  <path d="M24 44 44 14" fill="none" stroke="#6b4a2e" stroke-width="5" stroke-linecap="round"/>
  <path d="M36 20 44 6q14 5 11 20-9 4-19-6z" fill="#b3bcc6" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M50 9q6 8 4 17" fill="none" stroke="#e6ecf2" stroke-width="2.2" stroke-linecap="round"/>
`);

const MINE = icon(`
  <g fill="#6b6257" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round">
    <path d="M4 56q3-13 12-13t12 13z"/>
    <path d="M26 56q4-18 17-18t17 18z"/>
  </g>
  <circle cx="43" cy="47" r="3.4" fill="${GOLD}" stroke="${INK}" stroke-width="1.8"/>
  <circle cx="14" cy="50" r="2.4" fill="${GOLD}" stroke="${INK}" stroke-width="1.6"/>
  <path d="M18 46 44 16" fill="none" stroke="#8a5a33" stroke-width="5" stroke-linecap="round"/>
  <path d="M36 14q16-8 22 5-10 7-21-1z" fill="#b3bcc6" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/>
  <path d="M36 14q-9-5-18 2 8 7 17 2z" fill="#98a2ae" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/>
`);

const MARKET = icon(`
  <path d="M10 30h44l-4-12H14z" fill="#c25a4a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M22 18l-3 12M32 18v12M42 18l3 12" fill="none" stroke="#e8d7b0" stroke-width="2.5"/>
  <path d="M14 30v24M50 30v24" fill="none" stroke="#8a5a33" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="20" y="38" width="24" height="14" rx="2" fill="#b07c4a" stroke="${INK}" stroke-width="2.5"/>
  <circle cx="32" cy="45" r="3.5" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>
`);

const LIBRARY = icon(`
  <rect x="10" y="18" width="12" height="34" rx="2" fill="#7a4a52" stroke="${INK}" stroke-width="2.5"/>
  <rect x="24" y="24" width="12" height="28" rx="2" fill="#4a6a72" stroke="${INK}" stroke-width="2.5"/>
  <rect x="38" y="14" width="12" height="38" rx="2" fill="#6a5a8a" stroke="${INK}" stroke-width="2.5"/>
  <g fill="none" stroke="${GOLD}" stroke-width="2.4">
    <path d="M12 26h8M26 32h8M40 22h8M12 44h8M26 44h8M40 44h8"/>
  </g>
`);

const GRANARY = icon(`
  <path d="M16 54V26a16 16 0 0 1 32 0v28z" fill="#c9b184" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M16 26a16 16 0 0 1 32 0" fill="#a8927a" stroke="${INK}" stroke-width="2.5"/>
  <g fill="none" stroke="${INK}" stroke-width="2"><path d="M16 36h32M16 45h32"/></g>
  <rect x="27" y="44" width="10" height="10" fill="#4a3a28" stroke="${INK}" stroke-width="2.4"/>
  <circle cx="32" cy="18" r="3" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>
`);

const WAREHOUSE = icon(`
  <rect x="8" y="30" width="24" height="22" rx="2" fill="#a8794a" stroke="${INK}" stroke-width="2.5"/>
  <rect x="32" y="36" width="24" height="16" rx="2" fill="#8a5a33" stroke="${INK}" stroke-width="2.5"/>
  <path d="M8 30h24M20 30v22M32 44h24M44 36v16" fill="none" stroke="${INK}" stroke-width="2"/>
  <path d="M12 22h16l-2-8H14z" fill="${GOLD}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
`);

const TEMPLE = icon(`
  <path d="M6 24 32 8l26 16z" fill="#d8cdb4" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <g fill="#e8dfc8" stroke="${INK}" stroke-width="2.4">
    <rect x="12" y="28" width="7" height="20"/><rect x="24" y="28" width="7" height="20"/>
    <rect x="36" y="28" width="7" height="20"/><rect x="47" y="28" width="7" height="20"/>
  </g>
  <rect x="6" y="48" width="52" height="7" rx="1.5" fill="#b5a892" stroke="${INK}" stroke-width="2.5"/>
  <circle cx="32" cy="18" r="3" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>
`);

const WORKSHOP = icon(`
  <path d="M32 10a22 22 0 0 1 8 1.6l2 7 6 3 7-2.5a22 22 0 0 1 4.4 7.6l-5 5.4v6.6l5 5.4a22 22 0 0 1-4.4 7.6l-7-2.5-6 3-2 7a22 22 0 0 1-16 0l-2-7-6-3-7 2.5a22 22 0 0 1-4.4-7.6l5-5.4v-6.6l-5-5.4a22 22 0 0 1 4.4-7.6l7 2.5 6-3 2-7A22 22 0 0 1 32 10z"
        fill="#8d97a3" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="32" cy="32" r="8" fill="#e8d7b0" stroke="${INK}" stroke-width="2.5"/>
  <circle cx="32" cy="32" r="3" fill="${GOLD}"/>
`);

const UNIVERSITY = icon(`
  <path d="M12 30a20 20 0 0 1 40 0z" fill="#4a6a72" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <g fill="#e8dfc8" stroke="${INK}" stroke-width="2.4">
    <rect x="14" y="34" width="7" height="16"/><rect x="26" y="34" width="7" height="16"/>
    <rect x="38" y="34" width="7" height="16"/><rect x="48" y="34" width="6" height="16"/>
  </g>
  <rect x="8" y="50" width="48" height="6" rx="1.5" fill="#b5a892" stroke="${INK}" stroke-width="2.5"/>
  <path d="M32 6v6" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="32" cy="12" r="3" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>
`);

const WELL = icon(`
  <path d="M12 52 24 24h10l12 28" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
  <g fill="none" stroke="#6b6257" stroke-width="2.5" stroke-linecap="round">
    <path d="M17 40h24M20.5 32h17"/>
    <path d="M17 40 37.5 32M41 40 20.5 32"/>
  </g>
  <rect x="8" y="50" width="42" height="7" rx="2" fill="#6b6257" stroke="${INK}" stroke-width="2.4"/>
  <path d="M29 24C29 12 42 6 52 12" fill="none" stroke="#1c1b22" stroke-width="6" stroke-linecap="round"/>
  <circle cx="55" cy="9" r="4" fill="#1c1b22" stroke="${INK}" stroke-width="1.8"/>
  <circle cx="45" cy="5" r="2.6" fill="#1c1b22"/>
`);

// ------------------------------------------------------------- tech tracks

const CIVIC = icon(`
  <rect x="16" y="14" width="32" height="6" rx="1.5" fill="#d8cdb4" stroke="${INK}" stroke-width="2.5"/>
  <path d="M22 20h20v28H22z" fill="#e8dfc8" stroke="${INK}" stroke-width="2.5"/>
  <g fill="none" stroke="#a8927a" stroke-width="2"><path d="M28 22v24M36 22v24"/></g>
  <rect x="14" y="48" width="36" height="7" rx="1.5" fill="#b5a892" stroke="${INK}" stroke-width="2.5"/>
  <path d="M20 14h24" stroke="${GOLD}" stroke-width="2.5" stroke-linecap="round"/>
`);

const COMMERCE = icon(`
  <path d="M32 10v40M18 50h28" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  <path d="M12 20h40" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  <path d="M12 20 5 34h14z" fill="${GOLD}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M52 20 45 34h14z" fill="${GOLD}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="32" cy="14" r="4" fill="#d4a017" stroke="${INK}" stroke-width="2.4"/>
`);

const SCIENCE = icon(`
  <circle cx="32" cy="32" r="21" fill="none" stroke="${INK}" stroke-width="2.8"/>
  <ellipse cx="32" cy="32" rx="21" ry="8" fill="none" stroke="${INK}" stroke-width="2.4"/>
  <ellipse cx="32" cy="32" rx="8" ry="21" fill="none" stroke="${INK}" stroke-width="2.4"/>
  <path d="M11 32h42" fill="none" stroke="${GOLD}" stroke-width="2.4"/>
  <circle cx="32" cy="32" r="4" fill="${GOLD}" stroke="${INK}" stroke-width="2.2"/>
`);

const CRAFT = icon(`
  <path d="M10 40c6-10 16-14 30-14h14v8l-8 4c-4 8-14 10-24 10H14z"
        fill="#6b6257" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M18 48h22v6H18z" fill="#4a453d" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M40 22 24 8" fill="none" stroke="#8a5a33" stroke-width="4" stroke-linecap="round"/>
  <rect x="36" y="10" width="16" height="10" rx="2" transform="rotate(40 44 15)" fill="${GOLD}" stroke="${INK}" stroke-width="2.4"/>
`);

// ------------------------------------------------------------------- misc

const CITIZEN = icon(`
  <circle cx="32" cy="20" r="9" fill="#e0b48c" stroke="${INK}" stroke-width="2.5"/>
  <path d="M14 54c0-11 8-18 18-18s18 7 18 18z" fill="#7a6a52" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M32 36v18" fill="none" stroke="${INK}" stroke-width="2.2"/>
  <path d="M24 44c5-3 11-3 16 0" fill="none" stroke="${GOLD}" stroke-width="2.4" stroke-linecap="round"/>
`);

const LEGACY = icon(`
  <path d="M32 6 39 24l19 1-15 12 5 19-16-11-16 11 5-19-15-12 19-1z"
        fill="${GOLD}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="32" cy="34" r="5" fill="#f2dd97" stroke="${INK}" stroke-width="2"/>
`);

// ---------------------------------------------------------------- wonders

const PYRAMID = icon(`
  <path d="M32 8 58 54H6z" fill="#d3b273" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <g fill="none" stroke="#a8853f" stroke-width="2.2">
    <path d="M15 42h34M20 33h24M25 24h14"/>
  </g>
  <path d="M32 8 40 22H24z" fill="${GOLD}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
`);

const COLOSSUS = icon(`
  <rect x="10" y="48" width="44" height="8" rx="2" fill="#8a7f6d" stroke="${INK}" stroke-width="2.5"/>
  <path d="M26 48V26h12v22z" fill="#b98b3c" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="32" cy="18" r="8" fill="#d4a017" stroke="${INK}" stroke-width="2.5"/>
  <path d="M26 30 12 22M38 30l14-8" fill="none" stroke="#b98b3c" stroke-width="4" stroke-linecap="round"/>
  <path d="M32 4v4M26 8l2 4M38 8l-2 4" stroke="${GOLD}" stroke-width="2.4" stroke-linecap="round"/>
`);

const GARDENS = icon(`
  <g stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
    <rect x="12" y="44" width="40" height="10" fill="#a8927a"/>
    <rect x="18" y="30" width="30" height="10" fill="#b5a892"/>
    <rect x="24" y="16" width="20" height="10" fill="#c9b184"/>
  </g>
  <g fill="#6f9c46" stroke="${INK}" stroke-width="2">
    <path d="M16 44c2-6 8-6 10 0zM38 44c2-6 8-6 10 0zM22 30c2-6 8-6 10 0zM30 16c2-6 8-6 10 0z"/>
  </g>
  <path d="M12 54h40" stroke="${GOLD}" stroke-width="2.5" stroke-linecap="round"/>
`);

const COLOSSEUM = icon(`
  <path d="M7 50V28a25 17 0 0 1 50 0v22z" fill="#d8cdb4" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <g fill="#7d7160" stroke="${INK}" stroke-width="1.8">
    <path d="M12 34v-5a4 4 0 0 1 8 0v5zM24 32v-6a4 4 0 0 1 8 0v6zM36 32v-6a4 4 0 0 1 8 0v6zM48 35v-5a4 4 0 0 1 7 0v5z"/>
    <path d="M12 48v-6a4 4 0 0 1 8 0v6zM24 48v-6a4 4 0 0 1 8 0v6zM36 48v-6a4 4 0 0 1 8 0v6zM48 48v-6a4 4 0 0 1 7 0v6z"/>
  </g>
  <rect x="4" y="49" width="56" height="7" rx="2" fill="#b5a892" stroke="${INK}" stroke-width="2.5"/>
  <path d="M9 38h46" fill="none" stroke="${GOLD}" stroke-width="2.2"/>
`);

const GREATWALL = icon(`
  <path d="M4 46c10-10 18-10 28-2s20 6 28-4" fill="none" stroke="#6f9c46" stroke-width="3"/>
  <path d="M6 40V26h6v-5h6v5h6v-5h6v5h6v-5h6v5h6v-5h6v5h6v14z"
        fill="#9a8f7d" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M24 40V20h16v20z" fill="#b5a892" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M28 40V32h8v8z" fill="#4a3a28" stroke="${INK}" stroke-width="2.2"/>
  <path d="M6 40h52" stroke="${GOLD}" stroke-width="2.5"/>
`);

const CATHEDRAL = icon(`
  <path d="M32 4 40 20v34H24V20z" fill="#d8cdb4" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M14 22 20 32v22h-8z" fill="#c2b79e" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M50 22 44 32v22h8z" fill="#c2b79e" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="32" cy="30" r="6" fill="#4a6a72" stroke="${INK}" stroke-width="2.4"/>
  <path d="M28 54V44a4 4 0 0 1 8 0v10z" fill="#4a3a28" stroke="${INK}" stroke-width="2.2"/>
  <path d="M32 4v6" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>
`);

const PAGODA = icon(`
  <g stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" fill="#b8483c">
    <path d="M32 6 50 18H14z"/><path d="M32 22 54 34H10z"/><path d="M32 38 58 50H6z"/>
  </g>
  <g fill="#e8dfc8" stroke="${INK}" stroke-width="2.2">
    <rect x="26" y="18" width="12" height="4"/><rect x="26" y="34" width="12" height="4"/>
  </g>
  <path d="M26 50v6h12v-6" fill="#4a3a28" stroke="${INK}" stroke-width="2.2"/>
  <path d="M32 2v4" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>
`);

const TOWER = icon(`
  <path d="M6 52Q22 38 28 14M58 52Q42 38 36 14" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M28 14 32 5l4 9" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M14 40q18-14 36 0" fill="none" stroke="#8d97a3" stroke-width="3.4" stroke-linecap="round"/>
  <g fill="none" stroke="#8d97a3" stroke-width="2.6" stroke-linecap="round">
    <path d="M15.5 38h33M23 24h18"/>
    <path d="M23 24 41 14.5M41 24 23 14.5"/>
  </g>
  <rect x="6" y="50" width="52" height="6" rx="2" fill="#6b6257" stroke="${INK}" stroke-width="2.4"/>
  <circle cx="32" cy="4" r="3.2" fill="${GOLD}" stroke="${INK}" stroke-width="1.8"/>
`);

const OBSERVATORY = icon(`
  <path d="M10 40a22 22 0 0 1 44 0z" fill="#d8cdb4" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="8" y="40" width="48" height="12" rx="2" fill="#b5a892" stroke="${INK}" stroke-width="2.5"/>
  <path d="M28 34 50 14" fill="none" stroke="#4a453d" stroke-width="6" stroke-linecap="round"/>
  <circle cx="52" cy="12" r="5" fill="${GOLD}" stroke="${INK}" stroke-width="2.4"/>
  <path d="M18 46h28" stroke="${INK}" stroke-width="2"/>
`);

const COLLIDER = icon(`
  <circle cx="32" cy="32" r="22" fill="none" stroke="#4a453d" stroke-width="7"/>
  <circle cx="32" cy="32" r="22" fill="none" stroke="${INK}" stroke-width="2.5"/>
  <circle cx="32" cy="32" r="15" fill="none" stroke="${INK}" stroke-width="2"/>
  <circle cx="32" cy="10" r="5" fill="${GOLD}" stroke="${INK}" stroke-width="2.4"/>
  <circle cx="49" cy="44" r="4" fill="#4a6a72" stroke="${INK}" stroke-width="2.2"/>
  <circle cx="15" cy="44" r="4" fill="#c25a4a" stroke="${INK}" stroke-width="2.2"/>
`);

// ------------------------------------------------------------------ rares

const rare = (body: string) => icon(`
  <path d="M32 5 55 17v30L32 59 9 47V17z" fill="#f0e4c6" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M32 5 55 17v30L32 59 9 47V17z" fill="none" stroke="${GOLD}" stroke-width="1.6" transform="scale(0.88) translate(4.4 4.4)"/>
  ${body}
`);

const WINE = rare(`
  <path d="M24 20h16l-2 10a6 6 0 0 1-12 0z" fill="#7a2b3a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M32 36v8M26 44h12" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
`);
const SILK = rare(`
  <path d="M18 24c8-6 20-6 28 0-4 8-4 14 0 20-8 4-20 4-28 0 4-6 4-12 0-20z"
        fill="#c47ab0" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M25 26v18M32 25v20M39 26v18" fill="none" stroke="#8e4d7d" stroke-width="1.8"/>
`);
const MARBLE = rare(`
  <g fill="#e9e9ef" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
    <rect x="16" y="32" width="32" height="12" rx="1.5"/>
    <rect x="21" y="21" width="22" height="11" rx="1.5"/>
  </g>
  <g fill="none" stroke="#a3a3b2" stroke-width="1.9" stroke-linecap="round">
    <path d="M20 39c5-4 8 1 13-2s7 2 11-1"/><path d="M25 27c4-3 7 1 11-1"/>
  </g>
`);
const HORSES = rare(`
  <path d="M32 16a15 15 0 0 1 15 15v14h-8V31a7 7 0 0 0-14 0v14h-8V31a15 15 0 0 1 15-15z"
        fill="#8d97a3" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
  <g fill="${INK}">
    <circle cx="21" cy="41" r="1.5"/><circle cx="43" cy="41" r="1.5"/>
    <circle cx="20" cy="33" r="1.5"/><circle cx="44" cy="33" r="1.5"/>
  </g>
`);
const SALT = rare(`
  <g fill="#f2f4f8" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
    <path d="M32 18 42 30 32 42 22 30z"/><path d="M20 34 27 42 20 48 14 42z"/><path d="M44 34l7 8-7 6-6-6z"/>
  </g>
`);
const GEMS = rare(`
  <path d="M22 22h20l6 10-16 16-16-16z" fill="#4aa3c4" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M22 22l10 10 10-10M16 32h32M32 32v16" fill="none" stroke="#e6f4fa" stroke-width="1.8"/>
`);
const SPICE = rare(`
  <path d="M14 34h36c0 8-8 14-18 14s-18-6-18-14z" fill="#b5793a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M22 34c2-8 6-12 10-12s8 4 10 12z" fill="#d4922f" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
`);
const FURS = rare(`
  <path d="M32 16c8 0 12 6 10 12l4 12c-4 6-24 6-28 0l4-12c-2-6 2-12 10-12z"
        fill="#8a6a4a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M26 28c4 4 8 4 12 0" fill="none" stroke="#5d4632" stroke-width="2"/>
`);
const DYES = rare(`
  <path d="M20 28h24v12a12 12 0 0 1-24 0z" fill="#6a4f9e" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
  <ellipse cx="32" cy="28" rx="12" ry="4" fill="#8e6fc4" stroke="${INK}" stroke-width="2.2"/>
  <path d="M32 16v8" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
`);
const COTTON = rare(`
  <g fill="#f7f4ec" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
    <circle cx="25" cy="26" r="7"/><circle cx="39" cy="26" r="7"/><circle cx="32" cy="34" r="7.5"/>
  </g>
  <path d="M32 40v8" fill="none" stroke="#6f9c46" stroke-width="2.8" stroke-linecap="round"/>
  <g fill="#6f9c46" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round">
    <path d="M32 42c-4-3-9-2-10 1 3 3 8 3 10-1zM32 45c4-3 9-2 10 1-3 3-8 3-10-1z"/>
  </g>
`);

export const ICONS: Record<string, string> = {
  food: FOOD, timber: TIMBER, metal: METAL, wealth: WEALTH, knowledge: KNOWLEDGE, oil: OIL,
  city: CITY, farm: FARM, camp: CAMP, mine: MINE, market: MARKET, library: LIBRARY,
  granary: GRANARY, warehouse: WAREHOUSE, temple: TEMPLE, workshop: WORKSHOP,
  university: UNIVERSITY, well: WELL,
  civic: CIVIC, commerce: COMMERCE, science: SCIENCE, craft: CRAFT,
  citizen: CITIZEN, legacy: LEGACY,
  pyramid: PYRAMID, colossus: COLOSSUS, gardens: GARDENS, colosseum: COLOSSEUM,
  greatwall: GREATWALL, cathedral: CATHEDRAL, pagoda: PAGODA, tower: TOWER,
  observatory: OBSERVATORY, collider: COLLIDER,
  wine: WINE, silk: SILK, marble: MARBLE, horses: HORSES, salt: SALT,
  gems: GEMS, spice: SPICE, furs: FURS, dyes: DYES, cotton: COTTON,
};

/** Look up an icon, falling back to a blank field rather than throwing. */
export function art(id: string): string {
  return ICONS[id] ?? icon('');
}
