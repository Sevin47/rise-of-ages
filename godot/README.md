# GDScript spike

A port of the economy to GDScript, to answer one question before any Godot work
is committed to: **does the tuned economy survive the move?**

It does. `balance.gd` is the same autoplayer as `../balance.ts`, run against the
ported simulation, and it prints the same timeline to the last decimal.

```
                    TypeScript          GDScript
Classical               0h 20m            0h 20m
Medieval                0h 31m            0h 31m
Gunpowder               0h 46m            0h 46m
Enlightenment           1h 04m            1h 04m
Industrial              1h 31m            1h 31m
Modern                  1h 51m            1h 51m
Information             2h 24m            2h 24m

citizens             515/516           515/516
output                 x2.83             x2.83
food/s              162635.0          162635.0
knowledge/s        946867.82         946867.82
```

Every printed line matches, and so do all 120 buildings across 12 kinds.

## Second spike: isometric

`iso_probe.gd` builds a world with the ported generator, draws it
isometrically with Kenney's CC0 landscape blocks, drops buildings and citizens
on it, renders one frame and writes `iso_probe.png`. The result is
`iso-spike.png` in this folder.

    godot --path godot --script iso_probe.gd

Not `--headless`: that has no renderer and would save a blank image.

### What it proves

Isometric works, and Godot does most of it. The projection is two lines
(`to_screen`), and depth sorting is a single property: `y_sort_enabled` on the
parent makes Godot draw children in Y order, which is exactly the painter's
order isometric needs. No manual depth sort, no z-index juggling.

### The one thing worth knowing

Every tile in the landscape pack shares one base footprint, a 2:1 diamond 132
by 66, but the images vary from 83 to 131 pixels tall because the block above
that diamond varies in height. Anchoring every sprite a fixed distance above
its projected point therefore only works if all the blocks are the same height;
the taller ones float clear of their neighbours and the ground gaps open up.
`ground_anchor` derives the offset from each texture's height instead, which is
what made the ground tessellate.

### Still rough

- **Hills read as roads.** Several tiles in the pack carry a kerb or a road
  stripe that is invisible on a contact sheet and obvious once tiled across a
  map. The stone plateau picked here still has kerbed edges.
- **Building roofs sit wrong.** The buildings pack is modular, a storey plus a
  roof, and the stacking offset here is a guess rather than measured.
- **The buildings are modern.** That pack is a city set. It is a placeholder;
  a medieval isometric set would have to come from elsewhere.
- Buildings are still one column of cells rather than walls arranged around a
  whole footprint, so they read a little narrow for the ground they occupy.
- The citizens are fantasy warriors, sword and all. Fine at this size, but they
  are not villagers.

### Terrain: why nothing is painted as a "hills tile"

Every grey tile in Kenney's landscape pack carries a kerb or a road stripe.
Neither shows on a contact sheet; both are unmistakable once tiled across a
map, and the first attempt at hills came out looking like a motorway junction.

So high ground is bare earth with rock scattered over it, and woodland is plain
grass with trees scattered over it. This is the same conclusion the top-down
build reached: terrain painted as a tile shows its grid however good the tile
is, because every feature lands on the same lattice. Props at positions that
ignore tile edges are what break it up, and here they are also what tells one
terrain from another.

### Roofs

A roof cell is drawn to fill its cell, while the walls beneath it are a corner
piece that reads narrower, so at equal scale the roof overhangs the building it
caps. Layers therefore carry their own scale, and roofs use `ROOF_K`. The lift
stays in the unshrunk scale: shrinking a roof must not also drop it into the
walls it is sitting on.

### Assembling the buildings

The village tileset has no whole buildings in it: it is masonry, walls, doors,
roofs and a chimney, meant to be stacked. `RECIPES` in `iso_probe.gd` is that
stacking, a list of layers per building.

The geometry it relies on was measured off the sheet rather than guessed, and
it is simple once known: every 128x128 cell is drawn around a ground diamond
whose centre sits at y=96 in the cell, a stone base rises 60 pixels above that
ground, and a wall 64. A layer's lift is the sum of what is under it.

One thing that is easy to get wrong: every layer of a building has to sort as a
single object. Left to itself, Godot sorts each sprite by its own Y, and a roof
sits higher up the screen than the walls under it, so it sorts *behind* them
and disappears. Each building is therefore one node positioned at its ground
point, with the layers as children.

### Where the characters came from

Kenney has no isometric figures at all, so the citizens are 2DPIXX's free
isometric pack: four facings, with idle, walk and attack animations. That fixed
the problem, at the cost of the project's first licence with a condition
attached.

**Everything else here is CC0 and asks for nothing. The 2DPIXX sprites are
CC-BY 4.0 and require attribution in anything that ships them.** See
`assets/CREDITS.txt`. Worth knowing before that art spreads through the
codebase: dropping it later is easy now and annoying once the game is built
around it.

## Third spike: playable

`main.tscn` is the game. Pick a building from the bar, click the ground, and
citizens walk out and work it while the economy ticks on what they produce.

    godot --path godot

Drag to pan, wheel to zoom, arrows to scroll. Right-click cancels a placement,
Shift keeps the palette armed. Clicking a building staffs it; clicking a full
one empties it.

`verify.gd` drives the whole thing without a person at the keyboard and reports
what happened, which is how the chain below was checked rather than eyeballed:

    godot --path godot --script verify.gd

    world      1 placements, 3 citizens
    placement  farm at (34, 20) -> 1 farm(s) standing
    citizens   10 total, 2 posted (0 walking, 2 working)
    jobs       {"food":2.0, ...}
    economy    food 117.1 -> 132.9  (+0.47/s)  citizens 6.5 -> 10.8

That +0.47/s is the number to look at. A farm produces 0.2 standing plus 0.3
per citizen at work, so two citizens make 0.8 gross, and eleven citizens eat
0.33. The economy is behaving exactly as it does headless, driven by people who
had to walk there first.

### What Godot took over

- **Pathfinding.** `AStarGrid2D`, so the hand-rolled A* and its binary heap
  are gone.
- **Depth sorting.** `y_sort_enabled` on one node, and the painter's order
  isometric needs falls out of it.
- **UI.** Control nodes, so no rebuilding a DOM four times a second and no
  scroll positions to restore.

The ground layer is deliberately *not* y-sorted: it is always behind
everything, and sorting three thousand static tiles every frame would cost real
time and buy nothing.

### Progression

The library and the ages are wired in, so there is an arc rather than a
sandbox. Four tracks, one level per age; leaving an age needs three of the four
standing at the level that matches it, which is what stops a player rushing one
track and skipping the tree. Advancing multiplies every building's output and
every store by 3.2, and that step is what meets age prices climbing roughly
six-fold a rung.

`verify.gd` checks this rather than assuming it:

    age gate   tracks_ready=false at age 0
               advancing with no research: false (expected false)
    research   4 tracks taken to level 1
    advance    Ancient Age -> Classical Age (true)
    output     food gross 0.915 -> 2.927  = x3.20 (expected x3.2)
    unlocks    warehouse now buildable: true

The gate refuses first, then the multiplier lands exactly on 3.2, and a
building gated to the new age becomes available. The build bar greys out what
is locked or unaffordable and says why in the tooltip.

### Saving

The session persists. It autosaves every ten seconds and on closing the window,
loads on start, and credits time away at half rate for up to eight hours.

Three things have to survive: the economy, the world and the people. The
economy is already a plain Dictionary. The world is a seed *plus its terrain*,
and the terrain is stored rather than re-derived, because generation edits it
afterwards to guarantee a landing site with woodland and hills in reach.
Regenerating from the seed alone would quietly move the ground under buildings
that were already standing on it. The people are positions and postings;
phase, path and target are rebuilt, so anyone posted comes back already at work
and anyone mid-journey starts the journey again.

`verify_save.gd` round-trips a session and compares the two sides field by
field, because a save that loads without error is not a save that works. The
failure worth catching is the quiet one, where a nation comes back subtly
different. It checks the age, stores, tracks, placements, the next placement id,
a terrain checksum, worker count, postings and positions, and then that
`derive` agrees on both sides rather than only the stored numbers matching.

    godot --path godot --script verify_save.gd

Time away is stepped a minute at a time rather than applied as one huge tick,
because the economy is not linear in dt: caps clamp, stores run dry and
citizens starve, and one eight-hour tick would skip straight past all of it.

### Not there yet

No wonders, no trade routes, no menu, and no way to start a second nation
without deleting the save. All exist in the TypeScript build.

## Running it

Needs a Godot 4 binary. The project has to be imported once so that
`class_name` declarations register, otherwise the script cannot see `Content`
or `Sim`:

    godot --headless --path godot --import
    godot --headless --path godot --script balance.gd

## What is here

| file | |
| --- | --- |
| `content.gd` | the static tables, ported from `src/content.ts` |
| `sim.gd` | `derive`, `tick`, costs and actions, from `src/sim.ts` |
| `balance.gd` | the autoplayer, from `balance.ts` |

## Notes for whoever takes this further

The tables are plain dictionaries rather than Resources. A Resource per
building would be more idiomatic, but it would also make any mismatch between
the two ports harder to spot, and proving they match was the whole job. That
conversion is cheap to do now that there is a reference to check against.

Accumulation order is kept identical to the TypeScript throughout. Floating
point addition is not associative, so reordering a sum introduces a drift that
compounds over a two hour run. If you refactor `derive`, re-run this probe.

Nothing here draws anything. There is no scene, no TileMap and no UI: this is
the half that was worth proving first, because it is the half that took the
tuning.
