"""Render the building sprites, from geometry defined here rather than a .blend.

Run it headless:

    blender --background --python art/blender/render_buildings.py

The point of this pipeline is consistency. Assembling buildings from a tileset
means every one is a separate judgement about which pieces line up, and they
drift: a roof overhangs by three pixels on one and none on the next, walls catch
the light from different directions, palettes wander. Rendering them all through
one camera under one set of lights makes matching the default rather than
something to check for.

The camera, the lights and the primitives come from isolib, shared with the
ground tiles, the props and the people so that all four agree. See its docstring
for why the camera stands where it does and why every asset is modelled around
the world origin.

Each building is modelled at its true size. WorldMap.footprint says two tiles
for everything and three for the city, so that is how many Blender units across
they are built, and the canvas grows to suit. Authoring small and scaling up in
Godot would only magnify the same pixels.

Geometry lives in Python instead of a binary .blend so it diffs, reviews and
re-renders like the rest of the project.
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import isolib
from isolib import box, cylinder, gable_roof, pyramid

OUT_DIR = os.path.join("godot", "assets", "rendered")


# ---------------------------------------------------------------- buildings

## Whether buildings render the plate they stand on.
##
## True for the isometric build, where the plate seats a building against the
## terrain and stops it looking pasted on. False for the web build, which draws
## buildings over a terrain tile that is already the ground: there the plate is
## just a grey tray under every structure.
WITH_GROUND = True


def ground(m, size, colour="soil", z=0.0, thickness=0.03):
    """The plate a building stands on."""
    if not WITH_GROUND:
        return None
    return box("ground", (size, size, thickness), (0.0, 0.0, z), m[colour])


def build_city(m):
    """Three tiles, and the only one of them. A keep inside a walled yard."""
    ground(m, 2.85, "stone_dark", thickness=0.04)
    box("yard", (2.55, 2.55, 0.02), (0.0, 0.0, 0.04), m["grass"])

    # Curtain wall, four runs with a gap left at the front for a gate.
    box("wall_n", (2.7, 0.16, 0.34), (0.0, 1.27, 0.04), m["stone"])
    box("wall_e", (0.16, 2.7, 0.34), (1.27, 0.0, 0.04), m["stone"])
    box("wall_w", (0.16, 2.7, 0.34), (-1.27, 0.0, 0.04), m["stone"])
    box("wall_s1", (0.95, 0.16, 0.34), (-0.87, -1.27, 0.04), m["stone"])
    box("wall_s2", (0.95, 0.16, 0.34), (0.87, -1.27, 0.04), m["stone"])
    for i, (x, y) in enumerate([(-1.27, -1.27), (1.27, -1.27), (-1.27, 1.27), (1.27, 1.27)]):
        cylinder("tower%d" % i, 0.24, 0.52, (x, y, 0.04), m["stone"])
        cylinder("turret%d" % i, 0.28, 0.16, (x, y, 0.56), m["slate"], top_radius=0.02)

    # The keep.
    box("keep", (0.95, 0.85, 0.85), (0.0, 0.25, 0.06), m["stone"])
    box("keep_band", (1.0, 0.9, 0.07), (0.0, 0.25, 0.86), m["stone_dark"])
    pyramid("keep_roof", (1.05, 0.95), (0.0, 0.25, 0.93), 0.45, m["roof"], peak=0.06)
    box("gate", (0.42, 0.1, 0.30), (0.0, -1.27, 0.04), m["timber"])
    box("banner", (0.02, 0.16, 0.20), (0.0, -0.20, 0.70), m["cloth_red"])

    # Houses in the yard, so the walls enclose a town rather than a lawn.
    for i, (x, y, r) in enumerate([(-0.85, -0.55, 0.0), (0.85, -0.5, 0.0), (-0.9, 0.75, 0.0)]):
        box("house%d" % i, (0.5, 0.42, 0.28), (x, y, 0.05), m["plaster"])
        gable_roof("house%d_roof" % i, (0.58, 0.5), (x, y, 0.33), 0.18, m["roof_dark"])


def build_farm(m):
    """Worked soil, a barn and a silo."""
    ground(m, 1.9, "soil")
    for i in range(7):
        y = -0.75 + i * 0.25
        box("furrow%d" % i, (1.7, 0.09, 0.045), (0.0, y, 0.03), m["crop"])

    box("barn", (0.78, 0.60, 0.46), (-0.36, 0.32, 0.03), m["plaster_warm"])
    gable_roof("barn_roof", (0.9, 0.70), (-0.36, 0.32, 0.49), 0.30, m["roof"])
    box("barn_door", (0.24, 0.03, 0.28), (-0.36, 0.01, 0.03), m["timber"])
    box("barn_beam1", (0.04, 0.04, 0.46), (-0.72, 0.02, 0.03), m["timber"])
    box("barn_beam2", (0.04, 0.04, 0.46), (0.00, 0.02, 0.03), m["timber"])

    cylinder("silo", 0.22, 0.66, (0.52, 0.46, 0.03), m["stone"])
    cylinder("silo_cap", 0.25, 0.20, (0.52, 0.46, 0.69), m["slate"], top_radius=0.03)

    box("cart", (0.30, 0.20, 0.12), (0.55, -0.42, 0.03), m["timber_light"])
    cylinder("wheel", 0.10, 0.04, (0.42, -0.53, 0.03), m["timber"], segments=10)


def build_camp(m):
    """A lumber camp: felled timber, a chopping block and an open shelter."""
    ground(m, 1.9, "soil")
    box("clearing", (1.6, 1.6, 0.02), (0.0, 0.0, 0.03), m["grass"])

    # Open-sided shelter.
    for i, (x, y) in enumerate([(-0.75, -0.15), (-0.15, -0.15), (-0.75, 0.45), (-0.15, 0.45)]):
        box("post%d" % i, (0.07, 0.07, 0.42), (x, y, 0.04), m["timber"])
    gable_roof("shelter_roof", (0.78, 0.78), (-0.45, 0.15, 0.46), 0.24, m["thatch"], along="x")

    # Felled timber, stacked the way a woodpile actually stacks: three lying
    # side by side, two nested in the hollows above, one on top.
    r, length = 0.085, 0.9
    rows = [(-0.26, 0.0, 3), (-0.175, 0.145, 2), (-0.085, 0.29, 1)]
    for row, (y0, z, count) in enumerate(rows):
        for i in range(count):
            shade = "timber_light" if (row + i) % 2 == 0 else "timber"
            cylinder("log_%d_%d" % (row, i), r, length,
                     (0.05, y0 + i * 0.175 - 0.42, 0.04 + z), m[shade],
                     segments=10, axis="x")

    cylinder("stump", 0.17, 0.22, (-0.15, -0.68, 0.04), m["timber_light"], segments=12)
    box("axe_helve", (0.03, 0.03, 0.34), (-0.15, -0.68, 0.26), m["timber"])
    box("axe_head", (0.13, 0.04, 0.09), (-0.09, -0.68, 0.52), m["iron"])


def build_mine(m):
    """A cut into rising ground, timbered, with spoil and a cart."""
    ground(m, 1.9, "stone_dark")

    # The rock the adit goes into. Dark and blocky: the first attempt used
    # pale stone and a tall smooth cone, and it read as a heap of snow.
    pyramid("rock", (1.55, 0.95), (0.05, 0.52, 0.02), 0.46, m["rock"], peak=0.55)
    pyramid("rock_hi", (0.75, 0.5), (-0.42, 0.62, 0.44), 0.22, m["rock_light"], peak=0.4)
    pyramid("rock_lo", (0.6, 0.45), (0.62, 0.28, 0.02), 0.30, m["rock_dark"], peak=0.35)
    box("seam", (0.5, 0.06, 0.05), (-0.1, 0.14, 0.30), m["ore"])

    # The mouth, and the frame that holds it open.
    box("adit", (0.36, 0.22, 0.34), (0.05, -0.18, 0.03), m["shadow"])
    box("frame_l", (0.07, 0.07, 0.40), (-0.17, -0.28, 0.03), m["timber"])
    box("frame_r", (0.07, 0.07, 0.40), (0.27, -0.28, 0.03), m["timber"])
    box("lintel", (0.55, 0.08, 0.08), (0.05, -0.28, 0.43), m["timber"])

    # Spoil heap and ore.
    pyramid("spoil", (0.55, 0.45), (-0.62, -0.55, 0.02), 0.22, m["ore"], peak=0.08)
    box("cart", (0.30, 0.22, 0.16), (0.55, -0.60, 0.03), m["iron"])
    box("cart_ore", (0.24, 0.17, 0.07), (0.55, -0.60, 0.19), m["ore"])
    for i, x in enumerate((0.44, 0.66)):
        cylinder("cart_wheel%d" % i, 0.07, 0.03, (x, -0.72, 0.03), m["timber"], segments=10)


def build_market(m):
    """Stalls under awnings around a swept square."""
    ground(m, 1.9, "stone")
    box("square", (1.6, 1.6, 0.02), (0.0, 0.0, 0.03), m["plaster_warm"])

    def stall(name, x, y, cloth):
        for i, (dx, dy) in enumerate([(-0.28, -0.2), (0.28, -0.2), (-0.28, 0.2), (0.28, 0.2)]):
            box("%s_post%d" % (name, i), (0.05, 0.05, 0.40), (x + dx, y + dy, 0.04), m["timber"])
        gable_roof("%s_awn" % name, (0.68, 0.52), (x, y, 0.44), 0.16, m[cloth], along="x")
        box("%s_bench" % name, (0.56, 0.22, 0.20), (x, y - 0.06, 0.04), m["timber_light"])

    stall("stall_a", -0.45, 0.42, "cloth_red")
    stall("stall_b", 0.48, 0.30, "cloth_blue")
    stall("stall_c", -0.30, -0.52, "cloth_red")

    for i, (x, y) in enumerate([(0.55, -0.45), (0.72, -0.62), (0.55, -0.45)]):
        box("crate%d" % i, (0.20, 0.20, 0.18), (x, y, 0.03 + i * 0.18), m["timber_light"])
    cylinder("barrel", 0.13, 0.26, (0.30, -0.68, 0.03), m["timber"], segments=12)


def build_library(m):
    """A colonnaded hall. Plain, because the university has to outrank it."""
    ground(m, 1.9, "stone")
    box("stylobate", (1.55, 1.25, 0.12), (0.0, 0.0, 0.03), m["marble"])
    box("cella", (1.05, 0.85, 0.60), (0.0, 0.08, 0.15), m["plaster"])
    gable_roof("roof", (1.30, 1.05), (0.0, 0.08, 0.75), 0.30, m["roof"])

    for i in range(4):
        x = -0.54 + i * 0.36
        cylinder("col%d" % i, 0.075, 0.58, (x, -0.44, 0.15), m["marble"], segments=12)
    box("portico", (1.30, 0.28, 0.10), (0.0, -0.44, 0.73), m["marble"])
    box("door", (0.26, 0.03, 0.36), (0.0, -0.34, 0.15), m["timber"])
    # A scroll rack, so it reads as a library rather than a temple.
    box("rack", (0.22, 0.16, 0.26), (0.60, -0.52, 0.15), m["timber_light"])


def build_granary(m):
    """Raised store and two silos. Grain has to stay off the ground."""
    ground(m, 1.9, "soil")
    box("yard", (1.62, 1.62, 0.02), (0.0, 0.0, 0.03), m["grass"])

    # Staddle stones, which is why the floor sits above the earth.
    for i, (x, y) in enumerate([(-0.62, -0.22), (-0.06, -0.22), (-0.62, 0.34), (-0.06, 0.34)]):
        cylinder("staddle%d" % i, 0.08, 0.16, (x, y, 0.04), m["stone"], segments=10)
    box("floor", (0.80, 0.76, 0.07), (-0.34, 0.06, 0.20), m["timber"])
    box("store", (0.72, 0.68, 0.44), (-0.34, 0.06, 0.27), m["plaster_warm"])
    gable_roof("store_roof", (0.86, 0.80), (-0.34, 0.06, 0.71), 0.26, m["thatch"])
    box("ladder", (0.16, 0.04, 0.24), (-0.34, -0.32, 0.03), m["timber"])

    for i, (x, y) in enumerate([(0.58, 0.42), (0.58, -0.28)]):
        cylinder("silo%d" % i, 0.24, 0.56, (x, y, 0.03), m["stone"])
        cylinder("silo%d_cap" % i, 0.27, 0.18, (x, y, 0.59), m["thatch"], top_radius=0.03)

    box("sacks", (0.26, 0.20, 0.14), (0.05, -0.62, 0.03), m["thatch"])


def build_temple(m):
    """A stepped platform and a shrine, the only gold in the set."""
    ground(m, 1.9, "stone")
    box("step1", (1.60, 1.40, 0.10), (0.0, 0.0, 0.03), m["marble"])
    box("step2", (1.38, 1.20, 0.10), (0.0, 0.0, 0.13), m["marble"])
    box("step3", (1.16, 1.00, 0.10), (0.0, 0.0, 0.23), m["marble"])

    box("cella", (0.72, 0.62, 0.62), (0.0, 0.10, 0.33), m["marble"])
    for i in range(3):
        x = -0.34 + i * 0.34
        cylinder("col%d" % i, 0.075, 0.62, (x, -0.32, 0.33), m["marble"], segments=12)
    pyramid("roof", (1.05, 0.95), (0.0, 0.0, 0.95), 0.34, m["roof"], peak=0.08)
    box("altar", (0.24, 0.20, 0.16), (0.0, -0.62, 0.33), m["stone_dark"])
    pyramid("flame", (0.13, 0.13), (0.0, -0.62, 0.49), 0.17, m["gold"], peak=0.01)
    box("finial", (0.07, 0.07, 0.16), (0.0, 0.0, 1.29), m["gold"])


def build_warehouse(m):
    """Long, low, and busy with crates. Storage, not architecture."""
    ground(m, 1.9, "stone_dark")
    box("apron", (1.66, 1.66, 0.02), (0.0, 0.0, 0.03), m["stone"])

    box("shed", (1.35, 0.80, 0.52), (-0.10, 0.30, 0.03), m["timber_light"])
    box("shed_band", (1.40, 0.85, 0.06), (-0.10, 0.30, 0.40), m["timber"])
    gable_roof("shed_roof", (1.50, 0.92), (-0.10, 0.30, 0.55), 0.26, m["slate"], along="x")
    for i, x in enumerate((-0.55, -0.10, 0.35)):
        box("door%d" % i, (0.26, 0.03, 0.34), (x, -0.11, 0.03), m["timber"])

    # Loading dock and cargo.
    box("dock", (1.30, 0.30, 0.14), (-0.10, -0.28, 0.03), m["timber"])
    stack = [(-0.52, -0.62, 0), (-0.30, -0.66, 0), (-0.52, -0.62, 1), (0.20, -0.60, 0)]
    for i, (x, y, h) in enumerate(stack):
        box("crate%d" % i, (0.21, 0.21, 0.19), (x, y, 0.03 + h * 0.19), m["timber_light"])
    for i, (x, y) in enumerate([(0.52, -0.58), (0.72, -0.44)]):
        cylinder("barrel%d" % i, 0.13, 0.26, (x, y, 0.03), m["timber"], segments=12)


def build_workshop(m):
    """A forge. The chimney and the glow are the whole silhouette."""
    ground(m, 1.9, "stone_dark")
    box("yard", (1.62, 1.62, 0.02), (0.0, 0.0, 0.03), m["soil"])

    box("shop", (0.95, 0.80, 0.52), (-0.18, 0.20, 0.03), m["plaster_warm"])
    box("shop_beam1", (0.05, 0.05, 0.52), (-0.63, -0.18, 0.03), m["timber"])
    box("shop_beam2", (0.05, 0.05, 0.52), (0.27, -0.18, 0.03), m["timber"])
    gable_roof("shop_roof", (1.10, 0.94), (-0.18, 0.20, 0.55), 0.28, m["slate"])
    box("door", (0.28, 0.03, 0.34), (-0.18, -0.19, 0.03), m["timber"])

    box("chimney", (0.24, 0.24, 1.00), (0.42, 0.52, 0.03), m["stone"])
    box("chimney_cap", (0.30, 0.30, 0.08), (0.42, 0.52, 1.03), m["stone_dark"])

    # Forge, anvil and a stack of billets, out front where they read.
    box("forge", (0.30, 0.26, 0.22), (0.42, -0.20, 0.03), m["stone"])
    box("coals", (0.20, 0.16, 0.05), (0.42, -0.20, 0.25), m["gold"])
    box("anvil_base", (0.13, 0.13, 0.16), (0.02, -0.60, 0.03), m["timber"])
    box("anvil", (0.24, 0.11, 0.09), (0.02, -0.60, 0.19), m["iron"])
    for i in range(3):
        box("billet%d" % i, (0.30, 0.06, 0.05), (-0.50, -0.62, 0.03 + i * 0.05), m["iron"])


def build_university(m):
    """The library's big brother: a hall, a dome and a clock tower."""
    ground(m, 1.9, "stone")
    box("terrace", (1.70, 1.45, 0.10), (0.0, 0.0, 0.03), m["marble"])

    box("hall", (1.25, 0.85, 0.72), (0.0, 0.16, 0.13), m["plaster"])
    box("cornice", (1.32, 0.92, 0.07), (0.0, 0.16, 0.85), m["marble"])
    gable_roof("hall_roof", (1.32, 0.92), (0.0, 0.16, 0.92), 0.24, m["slate"], along="x")

    # Dome over the crossing.
    cylinder("drum", 0.30, 0.22, (0.0, 0.16, 1.16), m["marble"])
    cylinder("dome", 0.30, 0.30, (0.0, 0.16, 1.38), m["roof"], top_radius=0.08)
    box("dome_finial", (0.06, 0.06, 0.14), (0.0, 0.16, 1.68), m["gold"])

    # Entrance colonnade.
    for i in range(5):
        x = -0.52 + i * 0.26
        cylinder("col%d" % i, 0.065, 0.66, (x, -0.34, 0.13), m["marble"], segments=12)
    box("portico", (1.30, 0.26, 0.10), (0.0, -0.34, 0.79), m["marble"])
    box("steps", (0.60, 0.18, 0.08), (0.0, -0.52, 0.05), m["marble"])

    # Tower, so it outranks the library from across the map.
    box("tower", (0.34, 0.34, 1.30), (-0.62, 0.52, 0.13), m["stone"])
    box("clock", (0.20, 0.03, 0.20), (-0.62, 0.34, 1.15), m["marble"])
    pyramid("tower_roof", (0.42, 0.42), (-0.62, 0.52, 1.43), 0.34, m["slate"], peak=0.04)


def build_well(m):
    """A stone well under a shingled canopy, with troughs."""
    ground(m, 1.9, "grass")
    box("paving", (1.10, 1.10, 0.03), (0.0, 0.0, 0.03), m["stone"])

    cylinder("kerb", 0.34, 0.30, (0.0, 0.0, 0.05), m["stone"], segments=16)
    cylinder("shaft", 0.26, 0.02, (0.0, 0.0, 0.33), m["shadow"], segments=16)
    for i, x in enumerate((-0.30, 0.30)):
        box("post%d" % i, (0.07, 0.07, 0.62), (x, 0.0, 0.35), m["timber"])
    box("winch", (0.68, 0.09, 0.09), (0.0, 0.0, 0.92), m["timber_light"])
    box("rope", (0.02, 0.02, 0.26), (0.10, 0.0, 0.66), m["timber_light"])
    box("bucket", (0.14, 0.14, 0.13), (0.10, 0.0, 0.53), m["timber"])
    gable_roof("canopy", (0.86, 0.60), (0.0, 0.0, 1.01), 0.24, m["roof"])

    cylinder("trough", 0.17, 0.14, (0.60, -0.48, 0.03), m["stone_dark"], segments=12)
    cylinder("trough_water", 0.14, 0.02, (0.60, -0.48, 0.16), m["water"], segments=12)
    cylinder("pot", 0.11, 0.18, (-0.58, -0.52, 0.03), m["plaster_warm"], segments=12)


BUILDINGS = {
    "city": (3, build_city),
    "farm": (2, build_farm),
    "camp": (2, build_camp),
    "mine": (2, build_mine),
    "market": (2, build_market),
    "library": (2, build_library),
    "granary": (2, build_granary),
    "temple": (2, build_temple),
    "warehouse": (2, build_warehouse),
    "workshop": (2, build_workshop),
    "university": (2, build_university),
    "well": (2, build_well),
}

# ------------------------------------------------------------------- render

def render_one(name, tiles, builder, out_dir, engine):
    px = isolib.render_px(tiles)
    isolib.begin(engine, px)
    builder(isolib.materials())
    return isolib.render_to(os.path.join(out_dir, name + ".png")), px


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = OUT_DIR
    engine = "BLENDER_EEVEE_NEXT"  # resolved against the build in isolib
    only = None
    check = False
    for i, a in enumerate(argv):
        if a == "--out" and i + 1 < len(argv):
            out_dir = argv[i + 1]
        elif a == "--engine" and i + 1 < len(argv):
            engine = argv[i + 1]
        elif a == "--only" and i + 1 < len(argv):
            only = argv[i + 1]
        elif a == "--check":
            check = True

    os.makedirs(out_dir, exist_ok=True)
    if check:
        sys.exit(1 if isolib.check_alignment(out_dir, engine) else 0)

    names = [only] if only else sorted(BUILDINGS)
    print("camera     elevation %.3f deg" % __import__("math").degrees(isolib.ELEVATION))
    for name in names:
        tiles, builder = BUILDINGS[name]
        path, px = render_one(name, tiles, builder, out_dir, engine)
        print("wrote      %-12s %d tiles, %dpx  %s" % (name, tiles, px, path))


if __name__ == "__main__":
    main()
