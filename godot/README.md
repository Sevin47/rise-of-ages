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
