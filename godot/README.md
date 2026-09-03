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
- **There is no isometric character art in Kenney's catalogue.** The
  "Isometric Miniature Library" is a room full of bookcases, not figures. The
  citizens here are the old top-down sprites and read as specks. This is the
  one asset problem the CC0 catalogue does not solve.

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
