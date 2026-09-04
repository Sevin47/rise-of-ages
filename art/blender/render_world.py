"""Render the ground tiles and the props that stand on them.

    blender --background --python art/blender/render_world.py

Same camera and lights as the buildings, from isolib, which is the only reason
a tree looks like it belongs on the same ground as a temple.

Two things are worth saying about the tiles.

**A tile's origin is the centre of its top face, not of its bounding box.** The
block of earth hangs *below* z=0, so the world origin stays on the ground plane
where the game's tile centre is. Godot then draws the sprite centred, exactly as
it does a building, and the whole class of per-asset anchor offsets stays gone.

**Every terrain gets several variants.** One tile repeated over a map shows its
own lattice however good it is, because every blade of grass lands on the same
grid. Scattering the surface detail differently in each variant and picking
between them by position is what breaks that up.
"""

import math
import os
import random
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import bpy

import isolib
from isolib import box, cylinder, diamond, pyramid

OUT_DIR = os.path.join("godot", "assets", "rendered", "world")

# Detail is kept inside this radius of the tile centre. The tile is a unit
# square, so anything past 0.5 crosses the edge, and the ground layer is drawn
# in row order rather than sorted: an overhang would be painted over by the
# neighbour that comes after it.
DETAIL_R = 0.40


def scatter(rng, n, radius=DETAIL_R):
    """Points inside the tile, at no particular grid."""
    out = []
    for _ in range(n):
        # sqrt keeps them evenly spread rather than crowding the middle.
        r = radius * math.sqrt(rng.random())
        a = rng.uniform(0.0, 2.0 * math.pi)
        out.append((r * math.cos(a), r * math.sin(a)))
    return out


# ------------------------------------------------------------------- tiles

TILE_THICK = 0.22


def tile_grass(m, rng, size=1.0):
    diamond("top", size, (0.0, 0.0, 0.0), m["turf"], thickness=TILE_THICK)
    diamond("skirt", size, (0.0, 0.0, -0.06), m["earth_dark"], thickness=TILE_THICK - 0.06)
    # Tufts, and a few patches of a second green so the surface is not one flat
    # colour under a flat light.
    for i, (x, y) in enumerate(scatter(rng, 5, DETAIL_R * size)):
        shade = "turf_light" if i % 2 == 0 else "turf_dark"
        # Round, not square. A square plate reads as a diamond under the
        # isometric camera and gets away with it, but the web build looks
        # straight down and it becomes an obvious square stain.
        cylinder("patch%d" % i, rng.uniform(0.07, 0.11), 0.004, (x, y, 0.0),
                 m[shade], segments=12)
    for i, (x, y) in enumerate(scatter(rng, 7, DETAIL_R * size)):
        h = rng.uniform(0.03, 0.06)
        pyramid("tuft%d" % i, (0.035, 0.035), (x, y, 0.0), h,
                m["turf_light" if i % 3 else "leaf"], peak=0.004)


def tile_earth(m, rng, size=1.0):
    diamond("top", size, (0.0, 0.0, 0.0), m["earth"], thickness=TILE_THICK)
    diamond("skirt", size, (0.0, 0.0, -0.06), m["earth_dark"], thickness=TILE_THICK - 0.06)
    for i, (x, y) in enumerate(scatter(rng, 4, DETAIL_R * size)):
        cylinder("patch%d" % i, rng.uniform(0.06, 0.12), 0.004, (x, y, 0.0),
                 m["earth_dark"], segments=12)
    for i, (x, y) in enumerate(scatter(rng, 5, DETAIL_R * size)):
        s = rng.uniform(0.04, 0.08)
        pyramid("pebble%d" % i, (s, s), (x, y, 0.0), s * 0.5,
                m["rock" if i % 2 else "rock_dark"], peak=s * 0.4)


def tile_sand(m, rng, size=1.0):
    diamond("top", size, (0.0, 0.0, 0.0), m["sand"], thickness=TILE_THICK)
    diamond("skirt", size, (0.0, 0.0, -0.06), m["sand_dark"], thickness=TILE_THICK - 0.06)
    # Wind ripples rather than scattered dots: sand reads by its lines.
    for i in range(4):
        y = -0.28 + i * 0.19 + rng.uniform(-0.03, 0.03)
        box("ripple%d" % i, (rng.uniform(0.4, 0.7), 0.05, 0.012),
            (rng.uniform(-0.1, 0.1), y, 0.0), m["sand_dark"])
    for i, (x, y) in enumerate(scatter(rng, 3, DETAIL_R * size)):
        s = rng.uniform(0.03, 0.055)
        pyramid("pebble%d" % i, (s, s), (x, y, 0.0), s * 0.4, m["rock_light"], peak=s * 0.4)


def tile_water(m, rng, size=1.0):
    # The surface sits below the land's, so a shoreline reads as a drop rather
    # than as two tiles meeting flush.
    diamond("bed", size, (0.0, 0.0, -0.05), m["sea"], thickness=TILE_THICK - 0.05)
    diamond("surface", size, (0.0, 0.0, -0.05), m["sea"])
    for i, (x, y) in enumerate(scatter(rng, 4, 0.34 * size)):
        box("ripple%d" % i, (rng.uniform(0.14, 0.26), 0.035, 0.006),
            (x, y, -0.05), m["sea_light"])


# ------------------------------------------------------------------- props

def tree_broad(m, rng):
    cylinder("trunk", 0.045, 0.30, (0.0, 0.0, 0.0), m["bark"], segments=8)
    cylinder("canopy0", 0.30, 0.30, (0.0, 0.0, 0.24), m["leaf"], segments=10, top_radius=0.20)
    cylinder("canopy1", 0.24, 0.26, (0.0, 0.0, 0.48), m["leaf_light"], segments=10, top_radius=0.10)
    cylinder("canopy2", 0.13, 0.18, (0.0, 0.0, 0.70), m["leaf_dark"], segments=8, top_radius=0.02)


def tree_tall(m, rng):
    cylinder("trunk", 0.04, 0.44, (0.0, 0.0, 0.0), m["bark"], segments=8)
    cylinder("canopy0", 0.22, 0.34, (0.0, 0.0, 0.36), m["leaf_dark"], segments=10, top_radius=0.16)
    cylinder("canopy1", 0.18, 0.30, (0.0, 0.0, 0.64), m["leaf"], segments=10, top_radius=0.10)
    cylinder("canopy2", 0.11, 0.26, (0.0, 0.0, 0.88), m["leaf_light"], segments=8, top_radius=0.01)


def tree_scrub(m, rng):
    cylinder("trunk", 0.035, 0.16, (0.0, 0.0, 0.0), m["bark"], segments=8)
    cylinder("canopy0", 0.26, 0.22, (0.0, 0.0, 0.12), m["leaf_light"], segments=10, top_radius=0.18)
    cylinder("canopy1", 0.19, 0.18, (0.0, 0.0, 0.30), m["leaf"], segments=8, top_radius=0.06)


def rock_boulder(m, rng):
    pyramid("mass", (0.44, 0.38), (0.0, 0.0, 0.0), 0.30, m["rock"], peak=0.22)
    pyramid("cap", (0.24, 0.20), (0.04, 0.03, 0.28), 0.12, m["rock_light"], peak=0.10)
    pyramid("side", (0.20, 0.18), (-0.20, -0.10, 0.0), 0.14, m["rock_dark"], peak=0.10)


def rock_cluster(m, rng):
    pyramid("a", (0.30, 0.26), (-0.10, 0.06, 0.0), 0.22, m["rock"], peak=0.14)
    pyramid("b", (0.22, 0.20), (0.16, -0.06, 0.0), 0.16, m["rock_dark"], peak=0.10)
    pyramid("c", (0.16, 0.14), (0.04, 0.20, 0.0), 0.11, m["rock_light"], peak=0.07)


def rock_outcrop(m, rng):
    pyramid("slab", (0.50, 0.30), (0.0, 0.0, 0.0), 0.16, m["rock_dark"], peak=0.34)
    pyramid("spur", (0.20, 0.18), (0.14, 0.08, 0.14), 0.20, m["rock"], peak=0.06)
    pyramid("chip", (0.14, 0.12), (-0.22, -0.10, 0.0), 0.09, m["rock_light"], peak=0.06)


# ------------------------------------------------------------------ people

PEOPLE_DIR = os.path.join("godot", "assets", "rendered", "people")

# A citizen is 0.42 tiles tall. That is a real proportion against the buildings
# rather than a sprite scale chosen to look right: rendered through the same
# camera at the same pixels-per-unit, a person standing beside a house is as
# tall next to it as the model says.
BODY_H = 0.42
LEG_L = 0.16
TORSO_H = 0.17
HEAD_R = 0.048

# Tile-space directions, in the row order units.gd's _face assigns.
FACINGS = [90.0, 180.0, 270.0, 0.0]
FRAMES = 4


def limb(name, width, length, pivot, material, swing):
    """A limb hanging from its pivot, swung about it.

    Built from the origin downwards so the object's own origin lands on the
    joint. Rotating the object then rotates about the hip or shoulder, which is
    what a leg does, rather than about the middle of the thigh.
    """
    obj = box(name, (width, width, length), (0.0, 0.0, -length), material)
    obj.location = pivot
    obj.rotation_euler = (0.0, math.radians(swing), 0.0)
    return obj


def citizen(m, facing_deg, frame, tunic="tunic"):
    """One frame of the walk cycle, facing one way.

    Modelled facing +X and turned as a whole, so the cycle is written once and
    the four facings cannot drift out of step with each other.
    """
    phase = 2.0 * math.pi * frame / FRAMES
    swing = math.sin(phase) * 26.0
    # Arms counter the legs, which is what makes a walk read as a walk.
    arm = -math.sin(phase) * 20.0
    # The body rises as the legs pass each other, twice per cycle.
    bob = abs(math.cos(phase)) * 0.012

    parts = []
    hip = LEG_L
    parts.append(limb("leg_l", 0.055, LEG_L, (0.0, 0.045, hip), m["trousers"], swing))
    parts.append(limb("leg_r", 0.055, LEG_L, (0.0, -0.045, hip), m["trousers"], -swing))

    torso = box("torso", (0.10, 0.15, TORSO_H), (0.0, 0.0, hip), m[tunic])
    parts.append(torso)
    parts.append(box("belt", (0.105, 0.155, 0.022), (0.0, 0.0, hip + 0.02), m["timber"]))

    shoulder = hip + TORSO_H - 0.02
    parts.append(limb("arm_l", 0.042, 0.145, (0.0, 0.088, shoulder), m[tunic], arm))
    parts.append(limb("arm_r", 0.042, 0.145, (0.0, -0.088, shoulder), m[tunic], -arm))

    neck = hip + TORSO_H
    parts.append(box("head", (0.085, 0.085, HEAD_R * 2.0), (0.0, 0.0, neck), m["skin"]))
    parts.append(box("hair", (0.09, 0.09, 0.03), (0.0, 0.0, neck + HEAD_R * 2.0 - 0.012),
                     m["hair"]))
    # A nose, purely so the facing is readable at this size.
    parts.append(box("brow", (0.02, 0.05, 0.02), (0.045, 0.0, neck + 0.05), m["skin"]))

    # Turn the whole figure at once. Parenting before rotating means the parts
    # keep the local transforms they were built with.
    pivot = bpy.data.objects.new("citizen", None)
    bpy.context.collection.objects.link(pivot)
    for part in parts:
        part.parent = pivot
    pivot.rotation_euler = (0.0, 0.0, math.radians(facing_deg))
    pivot.location = (0.0, 0.0, bob)


# Name, tiles across, builder, how many variants.
TILES = [
    ("grass", tile_grass, 3),
    ("earth", tile_earth, 3),
    ("sand", tile_sand, 3),
    ("water", tile_water, 2),
]

PROPS = [
    ("tree_broad", tree_broad),
    ("tree_tall", tree_tall),
    ("tree_scrub", tree_scrub),
    ("rock_boulder", rock_boulder),
    ("rock_cluster", rock_cluster),
    ("rock_outcrop", rock_outcrop),
]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = OUT_DIR
    engine = "BLENDER_EEVEE_NEXT"
    for i, a in enumerate(argv):
        if a == "--out" and i + 1 < len(argv):
            out_dir = argv[i + 1]
        elif a == "--engine" and i + 1 < len(argv):
            engine = argv[i + 1]

    os.makedirs(out_dir, exist_ok=True)
    px = isolib.render_px(1)

    for name, builder, variants in TILES:
        for v in range(variants):
            isolib.begin(engine, px)
            # Seeded per variant, so a re-render reproduces the same ground
            # rather than quietly reshuffling the whole map's texture.
            builder(isolib.materials(), random.Random(hash((name, v)) & 0xffff))
            path = isolib.render_to(os.path.join(out_dir, "%s_%d.png" % (name, v)))
            print("wrote      %s_%d" % (name, v))

    for name, builder in PROPS:
        isolib.begin(engine, px)
        builder(isolib.materials(), random.Random(hash(name) & 0xffff))
        isolib.render_to(os.path.join(out_dir, "%s.png" % name))
        print("wrote      %s" % name)

    # People get their own smaller canvas. They are small enough that a
    # tile-sized frame would be mostly empty, and there are sixteen of them.
    for facing, deg in enumerate(FACINGS):
        for frame in range(FRAMES):
            isolib.begin(engine, 128)
            citizen(isolib.materials(), deg, frame)
            isolib.render_to(os.path.join(
                PEOPLE_DIR, "citizen_%d_%d.png" % (facing, frame)))
        print("wrote      citizen facing %d" % facing)


if __name__ == "__main__":
    main()
