# Rise of Ages

A real-time strategy game about carrying one nation from the Ancient world to
the Information Age. You settle a generated map, put buildings on the ground
that will actually support them, and send citizens out to work them. Six
resources, four library tracks, ten wonders, and eight ages that each multiply
everything you own.

There is no combat and no enemy nation. The whole game is the economy: what to
build, where to put it, and who to send.

Play: `npm install && npm run dev`

The game opens on a menu rather than dropping you straight onto a map:
**Continue** (with a summary of the nation waiting for you), **New Nation**,
**Import a save**, **Settings**, or **About**. A drifting view of a generated world plays
behind it. You can get back to it any time from the Nation panel.

## Controls

| | |
| --- | --- |
| Pan | drag the map, or `WASD` / arrow keys |
| Zoom | mouse wheel |
| Build | click a building in the palette, then click the ground |
| Place several | hold `Shift` while placing to keep the palette armed |
| Cancel / deselect | right-click, or `Esc` |
| Inspect a building | click it — the panel shows its real output and its crew |
| Back to the menu | the Nation panel — it saves on the way out |
| Sound and music | Settings, from the menu or the Nation panel |

## The loop

**Resources.** Food, Timber, Metal, Wealth, Knowledge, and Oil from the
Industrial Age on. Each has a storage cap, and the cap matters — the price of the
next age is usually larger than your larder can hold until you have built for it.

**Citizens.** They arrive on their own toward a population cap and eat Food while
they do. Every one of them is a unit on the map, and they behave like it: a
woodcutter's crew works its way between the camp and the surrounding trees, a
mine's crew between the shaft and the rock, and the unemployed drift around the
nearest city rather than standing in a heap. Buildings open *posts*, and a
citizen produces only once they have walked to one and stopped — a crew crossing
the valley is costing you food and earning nothing on the way. Gathering itself
is continuous, the way Rise of Nations does it: they stand at the site and the
resource flows, with no hauling trips back to a drop-off.

**Buildings.** Where they go is half the decision. A Woodcutter's Camp only
stands in woodland, a Mine only in hills, an Oil Well only on sand; everything
else wants open ground. The ghost under your cursor turns red when the ground
will not take it. Placement is also capped by build slots rather than by money —
slots come from Cities, and Cities come from the Civic track — so every slot is a
choice between another Farm and the Granary that lets you hold what the next age
costs. Anything can be razed for half its price, so no build-out is
unrecoverable.

**The Library.** Four tracks — Civic, Commerce, Science, Craft — one level per
age. To leave an age at least three of the four must stand at the level matching
it, so no single track carries you forward alone.

**Ages.** Advancing costs stores *and* library levels, and pays out immediately:
every building's output and every store's capacity is multiplied. An Industrial
farm is not an Ancient farm with a bigger number on it.

**Wonders** are built once and kept forever. **Trade routes** run rare goods
through your Markets and can be re-routed for free whenever your bottleneck
moves. **A new dynasty** ends the run, banks legacy from how far you got, and
starts again with a permanent output bonus.

Saves live in `localStorage`, write every ten seconds, and credit up to eight
hours of time away at half rate — time spent sitting on the menu counts as being
away, and is credited when you press Continue. Nothing is ever written while the
menu is open: if it ran the loop over a throwaway nation, the autosave would
destroy the very save Continue is offering. The whole map — terrain, every building, and
every citizen — travels with the save, which runs about 36 KB at full late-game
scale. Export and import are in the Nation panel.

## The art

The map, the buildings, the citizens and the resource icons are Kenney's
**Medieval RTS** and **Board Game Icons** packs, both released under
[CC0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain, free
for any use, commercial included. Credit is not required by the licence; it is
given here and in `public/kenney/CREDITS.txt` because it is deserved.

- [Medieval RTS](https://kenney.nl/assets/medieval-rts) — terrain tiles,
  structures and units
- [Board Game Icons](https://kenney.nl/assets/board-game-icons) — the six
  resource icons

Ground is deliberately not drawn as "forest tiles". Printing trees onto a tile
put every trunk on a 32-pixel lattice, and the eye read the grid instead of the
wood. Forest is now plain grass with trees scattered *over* it at positions that
ignore tile edges and are allowed to overhang them, and the ground layer is
blurred before the scatter goes on top — which turns stair-stepped coastlines
into shorelines. `bakeTerrain` in `src/render.ts` does this in three passes and
the order is the whole trick.

Only the sprites the game actually uses are checked in, around 250 KB total.
`src/sprites.ts` holds the whole mapping from game concept to sprite file, and
it is the one place to edit when swapping art. Two notes on choices made there,
because they are not obvious:

- The citizen sprites are picked for **contrast at about 22 pixels**, not for
  their medieval roles. Kenney's green villagers vanish into the grass, and
  several tan ones are indistinguishable at map scale. Even so the sprite alone
  could not carry what a citizen is *doing*, so the renderer draws a coloured
  ring at their feet — gold for working, blue for walking, none for idle.
- Grass uses only the pack's two bare tiles. Its sparse-bush tile reads as
  woodland, and grass has to be unmistakable, because terrain is what decides
  where a Farm may stand.

The wonder, trade-good and library-track icons, and every panel texture, are
still original work: inline SVG and CSS, no binary assets. They live in
`src/art.ts` and share one grammar — a 64×64 field, flat shapes, a dark ink
outline, and a gold accent in every piece. They stayed because the Kenney packs
have no pyramid, no colossus and no silk route, and a generic glyph would say
less than a drawing of the thing.

Because Kenney's board-game icons are white glyphs meant for a dark UI, they are
inked with a CSS filter to survive on parchment. The building and citizen
sprites are full colour and deliberately excluded from that.

Run `npm run sheet` to regenerate `icons.html`, a contact sheet of the original
SVG set at inspection size. It is generated, so it is not checked in.

## Sound

Two toggles, in Settings on the menu or in the Nation panel. They are stored
under their own key rather than inside the save, so they survive starting a new
nation, importing someone else's, and erasing everything — a preference belongs
to the person at the keyboard, not to the nation.

**Sound effects** are Kenney's CC0 Interface Sounds: a click on buttons, a
different note for placing a building, being refused, razing, and a bell when an
age turns. **Music** is generated at runtime in WebAudio — a slow four-chord turn
in A minor with pentatonic plucks over it, written to be ignorable. Kenney
publishes jingles but no looping score, and generating it beat taking on a track
under a different licence: it stays original work under this project's own MIT
licence and adds nothing to download. It defaults to off, being the more
intrusive of the two.

No AudioContext exists until the first click. Browsers refuse to start audio
outside a user gesture, and a page nobody clicks never touches the audio
hardware at all.

## Layout

| file | what it holds |
| --- | --- |
| `src/content.ts` | every static table: resources, ages, tracks, buildings, wonders, rares |
| `src/state.ts` | the save shape, a new game, and reconciling an old save onto it |
| `src/sim.ts` | `derive()` (all multipliers, recomputed each frame), `tick()`, and every action |
| `src/map.ts` | terrain generation, what may stand where, and map persistence |
| `src/units.ts` | pathfinding, citizen movement, and the bridge back into the sim |
| `src/render.ts` | the canvas: baked terrain, buildings, citizens, camera |
| `src/sprites.ts` | which Kenney sprite stands for what, and the image loader |
| `src/ui.ts` | the overlay panels, as one string |
| `src/art.ts` | the original SVG icons still used for wonders, trade goods and tracks |
| `src/audio.ts` | sound effects, and the generated score behind the Music toggle |
| `src/settings.ts` | player preferences, stored apart from the save |
| `src/main.ts` | screen state machine (menu / playing), game loop, input, autosave |
| `balance.ts` | dev-only (`npm run balance`): runs an autoplayer over the real sim and prints when each age falls |
| `sheet.ts` | dev-only (`npm run sheet`): writes `icons.html`, a contact sheet of the icon set |

## How the map and the economy meet

The seam is deliberately narrow. `sim.ts` reads exactly two things out of the
game state — how many of each building exist, and how many citizens are posted
per resource — and it has no idea a map exists. Each frame `units.syncToState`
recomputes those two numbers from what is actually on the ground, and `derive()`
then runs exactly as it did before there was a map.

That is what let the tuned economy survive the move to an RTS whole. It also
means the one real economic change is travel: only citizens who have *arrived*
are counted, so distance is a genuine cost rather than a cosmetic one.

## Balance

`npm run balance` is how the numbers were set. A greedy autoplayer runs the real
simulation with no map at all, so its timeline is a clean upper bound on the
economy — an actual run is somewhat slower, because citizens spend real time
walking. The shipped tuning reaches the Information Age in about 2h24m of
perfect play, with each age taking longer than the last:

```
 0h20m Classical · 0h31m Medieval · 0h46m Gunpowder · 1h04m Enlightenment
 1h31m Industrial · 1h51m Modern   · 2h24m Information
```

Two structural constraints came out of that probe and are worth keeping in mind
before retuning anything:

- Age prices climb roughly six-fold a rung. Build slots cap how *many* buildings
  you can own, so the growth to meet that has to come from multipliers —
  `AGE_OUTPUT_STEP` and `AGE_STORAGE_STEP` in `src/sim.ts` are what actually
  carry it. Lower them and the late ages stall outright.
- Cities are priced in Food and Timber only, on purpose. Founding one is the
  escape hatch when your build slots are full, so it must never depend on a
  resource you have no room left to produce.
- Every generated map is guaranteed a cleared landing site with woodland and
  hills within reach of it. Without that, a bad terrain roll could leave the
  opening Camp or Mine with nowhere legal to stand, and there is no way to
  recover from that.

## Licence

The code is [MIT](LICENSE) — use it, change it, ship it, commercially or not.

The sprites under `public/kenney/` are Kenney's and are CC0, which is public
domain rather than MIT; they carry no conditions at all. Every other piece of
artwork here is original and falls under the MIT licence with the rest. See
[NOTICE](NOTICE) for the breakdown.
