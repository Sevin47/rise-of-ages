"""Render the web build's sprites from the same models as the Godot build's.

    blender --background --python art/blender/render_web.py

The two builds do not share a projection. Godot draws a 2:1 isometric diamond;
the web build draws a square grid from above. What they can share is the
geometry, and that is the whole reason for defining buildings in code rather
than in a .blend: the farm here is `render_buildings.build_farm`, the same
function, photographed from somewhere else.

Three cameras, because three jobs.

**Tiles are shot straight down.** A square tile has to come out a square sprite
or it will not tile, so elevation is 90 degrees and nothing is foreshortened.
The plate is rendered slightly larger than the frame as well: exactly filling it
leaves half-covered pixels along the edge, and a row of those between every pair
of tiles reads as a grid of seams.

**Buildings, props and people are shot from 52 degrees.** Straight down, a
building is a roof and nothing else, and the whole set becomes unreadable at
thirty pixels. A raised camera keeps the silhouette that tells a temple from a
warehouse, which is what Kenney's own RTS art does and why it worked here.

**Icons are shot from lower still**, because an icon is a picture of a thing
rather than a thing on a map.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import isolib
from isolib import box, cylinder, pyramid
import render_buildings as rb
import render_world as rw

OUT = os.path.join("public", "art")

PX = 256

# Straight down for ground, a raised three-quarter for everything that stands
# on it, and a lower angle for icons.
TOP_DOWN = math.radians(90.0)
OBJECT_ELEV = math.radians(52.0)
ICON_ELEV = math.radians(38.0)
ICON_YAW = math.radians(28.0)

# Overfill, so no half-covered pixels are left along a tile's edge.
TILE_BLEED = 1.14


# -------------------------------------------------------------------- icons

def icon_food(m):
    """A sheaf of wheat, tied at the waist.

    The stalks are built centred on the origin and fanned by rotating each one
    about it, so they splay from a single point the way a bound sheaf does.
    """
    for i in range(5):
        stalk = box("stalk%d" % i, (0.035, 0.035, 0.62), (0.0, 0.0, -0.31), m["crop"])
        stalk.rotation_euler = (math.radians(-26 + i * 13), 0.0, 0.0)
    for i in range(5):
        ear = box("ear%d" % i, (0.055, 0.055, 0.16), (0.0, 0.0, 0.16), m["thatch"])
        ear.rotation_euler = (math.radians(-26 + i * 13), 0.0, 0.0)
    box("tie", (0.13, 0.30, 0.06), (0.0, 0.0, -0.09), m["timber"])


def icon_timber(m):
    """Three cut logs, ends to camera."""
    for i, (x, z) in enumerate([(-0.13, -0.20), (0.13, -0.20), (0.0, 0.0)]):
        cylinder("log%d" % i, 0.125, 0.42, (x, -0.21, z), m["timber_light"],
                 segments=12, axis="y")
        cylinder("end%d" % i, 0.09, 0.01, (x, 0.21, z), m["thatch"],
                 segments=12, axis="y")


def icon_metal(m):
    """An ingot, tapered so it reads as cast rather than as a brick."""
    pyramid("ingot", (0.46, 0.30), (0.0, 0.0, -0.10), 0.16, m["iron"], peak=0.30)
    pyramid("ingot2", (0.34, 0.22), (0.0, 0.0, 0.06), 0.12, m["stone"], peak=0.22)


def icon_wealth(m):
    """A stack of coins."""
    for i in range(4):
        cylinder("coin%d" % i, 0.20 - i * 0.012, 0.055, (0.0, 0.0, -0.20 + i * 0.06),
                 m["gold"], segments=16)


def icon_knowledge(m):
    """A closed book, spine to the left."""
    box("cover", (0.44, 0.34, 0.09), (0.0, 0.0, -0.10), m["cloth_red"])
    box("pages", (0.40, 0.30, 0.05), (0.02, 0.0, -0.02), m["marble"])
    box("spine", (0.05, 0.34, 0.11), (-0.20, 0.0, -0.11), m["roof_dark"])
    box("clasp", (0.05, 0.10, 0.02), (0.19, 0.0, 0.02), m["gold"])


def icon_oil(m):
    """A barrel with a dark band, the only black in the set."""
    cylinder("barrel", 0.20, 0.44, (0.0, 0.0, -0.22), m["timber"], segments=14)
    cylinder("band0", 0.21, 0.05, (0.0, 0.0, -0.14), m["iron"], segments=14)
    cylinder("band1", 0.21, 0.05, (0.0, 0.0, 0.10), m["iron"], segments=14)
    cylinder("slick", 0.17, 0.02, (0.0, 0.0, 0.22), m["shadow"], segments=14)


ICONS = {
    "food": icon_food,
    "timber": icon_timber,
    "metal": icon_metal,
    "wealth": icon_wealth,
    "knowledge": icon_knowledge,
    "oil": icon_oil,
}

# The three states the web build colours citizens by. Idle is pale so a crowd
# of unemployed recedes; the other two have to carry against green.
UNITS = {
    "idle": "marble",
    "walk": "tunic",
    "work": "thatch",
}

TILES = {
    "grass": (rw.tile_grass, 2),
    "water": (rw.tile_water, 2),
    "hills": (rw.tile_earth, 2),
    "desert": (rw.tile_sand, 2),
}

# Decor, by the terrain it scatters over, matching src/sprites.ts.
DECOR = {
    "forest": [rw.tree_broad, rw.tree_tall, rw.tree_scrub, rw.tree_broad],
    "hills": [rw.rock_boulder, rw.rock_cluster, rw.rock_outcrop, rw.rock_boulder],
    "grass": [rw.tree_scrub, rw.rock_cluster],
    "desert": [rw.rock_cluster],
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    engine = "BLENDER_EEVEE_NEXT"
    for i, a in enumerate(argv):
        if a == "--engine" and i + 1 < len(argv):
            engine = argv[i + 1]

    import random

    # --- ground -------------------------------------------------------
    for name, (builder, variants) in TILES.items():
        for v in range(variants):
            isolib.begin(engine, PX, elevation=TOP_DOWN, yaw=0.0, units=1.0)
            builder(isolib.materials(), random.Random(hash((name, v)) & 0xffff),
                    size=TILE_BLEED)
            isolib.render_to(os.path.join(OUT, "tile", "%s_%d.png" % (name, v)))
        print("wrote      tile/%s x%d" % (name, variants))

    # --- things standing on it ----------------------------------------
    for terrain, builders in DECOR.items():
        for i, builder in enumerate(builders):
            isolib.begin(engine, PX, elevation=OBJECT_ELEV, yaw=0.0, units=1.5)
            builder(isolib.materials(), random.Random(hash((terrain, i)) & 0xffff))
            isolib.render_to(os.path.join(OUT, "env", "%s_%d.png" % (terrain, i)))
        print("wrote      env/%s x%d" % (terrain, len(builders)))

    # No plate: the terrain tile beneath already is the ground here.
    rb.WITH_GROUND = False
    for name, (tiles, builder) in rb.BUILDINGS.items():
        # Framed to the footprint, so a three-tile city is not shrunk to the
        # same sprite size as a well and lost.
        isolib.begin(engine, PX, elevation=OBJECT_ELEV, yaw=0.0,
                     units=tiles * 1.25)
        builder(isolib.materials())
        isolib.render_to(os.path.join(OUT, "structure", "%s.png" % name))
    print("wrote      structure x%d" % len(rb.BUILDINGS))

    for name, tunic in UNITS.items():
        isolib.begin(engine, PX, elevation=OBJECT_ELEV, yaw=0.0, units=0.62)
        # Facing the camera, mid-stride, which is the pose that reads as a
        # person at twenty pixels.
        rw.citizen(isolib.materials(), 270.0, 1, tunic=tunic)
        isolib.render_to(os.path.join(OUT, "unit", "%s.png" % name))
    print("wrote      unit x%d" % len(UNITS))

    # --- icons --------------------------------------------------------
    for name, builder in ICONS.items():
        isolib.begin(engine, PX, elevation=ICON_ELEV, yaw=ICON_YAW, units=0.85)
        builder(isolib.materials())
        isolib.render_to(os.path.join(OUT, "icon", "%s.png" % name))
    print("wrote      icon x%d" % len(ICONS))


if __name__ == "__main__":
    main()
