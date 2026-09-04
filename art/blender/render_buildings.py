"""Render the building sprites, from geometry defined here rather than a .blend.

Run it headless:

    blender --background --python art/blender/render_buildings.py

The point of this pipeline is consistency. Assembling buildings from a tileset
means every one is a separate judgement about which pieces line up, and they
drift: a roof overhangs by three pixels on one and none on the next, walls catch
the light from different directions, palettes wander. Rendering them all through
one camera under one set of lights makes matching the default rather than
something to check for.

Two properties are worth stating because everything else follows from them.

**The camera is derived from the game's own tile size.** Iso.TILE_W and TILE_H
are 132x66, a 2:1 diamond, so the camera elevation is asin(66/132) = 30 degrees.
It is worth being careful here: the figure usually quoted for 2:1 isometric,
26.57 degrees, is atan(1/2) and describes the slope of the tile edges *on
screen*, not where the camera stands. Using it would render buildings that do
not sit on the ground the game draws.

**The anchor problem disappears.** Each building is modelled with the centre of
its footprint at the world origin, standing on z=0, and the camera looks at that
origin. The origin therefore lands exactly at the centre of the image, so Godot
can draw the sprite centred on the tile centre and be right, with no per-building
offset to measure and no lift to tune.

Geometry lives in Python instead of a binary .blend so it diffs, reviews and
re-renders like the rest of the project.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

# --------------------------------------------------------------------- setup

# Straight from the game. `iso.gd` is the authority; if the tiles change, the
# camera follows rather than having to be re-derived by hand.
TILE_W = 132.0
TILE_H = 66.0

# Where the camera stands. See the note above about 26.57 vs 30 degrees.
ELEVATION = math.asin(TILE_H / TILE_W)
YAW = math.radians(45.0)

# One tile is one Blender unit. A unit square yawed 45 degrees is sqrt(2) wide
# on screen, and that width has to come out as TILE_W pixels.
PX_PER_UNIT = TILE_W / math.sqrt(2.0)

# Generous enough for a tall building on a one-tile footprint. Square keeps
# Blender's ortho_scale unambiguous, since it applies to the larger side.
RENDER_PX = 384

OUT_DIR = os.path.join("godot", "assets", "rendered")


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, rgb, roughness=0.85):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    # Game art, not product photography: a specular highlight rolling across a
    # roof reads as a rendering artefact at this size.
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.15
    return mat


def mesh_from(name, verts, faces, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    # Flat shading. Smooth normals on a low-poly box only blur the edges that
    # give the silhouette its read at 132 pixels.
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


def box(name, size, centre, material):
    """An axis-aligned box, `centre` being the middle of its base."""
    sx, sy, sz = size[0] / 2.0, size[1] / 2.0, size[2]
    cx, cy, cz = centre
    v = [
        (cx - sx, cy - sy, cz), (cx + sx, cy - sy, cz),
        (cx + sx, cy + sy, cz), (cx - sx, cy + sy, cz),
        (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
        (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz),
    ]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2),
         (2, 6, 7, 3), (3, 7, 4, 0)]
    return mesh_from(name, v, f, material)


def gable_roof(name, size, centre, height, material):
    """A ridged roof. The ridge runs along Y."""
    sx, sy = size[0] / 2.0, size[1] / 2.0
    cx, cy, cz = centre
    v = [
        (cx - sx, cy - sy, cz), (cx + sx, cy - sy, cz),
        (cx + sx, cy + sy, cz), (cx - sx, cy + sy, cz),
        (cx, cy - sy, cz + height), (cx, cy + sy, cz + height),
    ]
    f = [(0, 1, 2, 3), (0, 4, 5, 3), (1, 2, 5, 4), (0, 1, 4), (3, 5, 2)]
    return mesh_from(name, v, f, material)


# ------------------------------------------------------------------- camera

def setup_camera():
    cam_data = bpy.data.cameras.new("IsoCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = RENDER_PX / PX_PER_UNIT

    cam = bpy.data.objects.new("IsoCam", cam_data)
    bpy.context.collection.objects.link(cam)

    # Blender cameras look down their local -Z. With no rotation that is
    # straight down, so the tilt from vertical is 90 degrees minus the
    # elevation above the horizon.
    cam.rotation_euler = (math.pi / 2.0 - ELEVATION, 0.0, YAW)

    # Orthographic, so the distance changes nothing but clipping. Far enough
    # out that nothing crosses the near plane.
    back = cam.rotation_euler.to_matrix() @ Vector((0.0, 0.0, 1.0))
    cam.location = back * 20.0
    cam_data.clip_start = 0.1
    cam_data.clip_end = 100.0

    bpy.context.scene.camera = cam
    return cam


def setup_lights():
    # One key sun for form, one weak fill so the shadowed faces still read, and
    # a little ambient from the world. Fixed for every building: this is the
    # whole reason the set stays consistent.
    key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", type="SUN"))
    key.data.energy = 3.2
    key.data.angle = math.radians(12.0)
    key.rotation_euler = (math.radians(52.0), 0.0, math.radians(35.0))
    bpy.context.collection.objects.link(key)

    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", type="SUN"))
    fill.data.energy = 1.0
    fill.rotation_euler = (math.radians(60.0), 0.0, math.radians(215.0))
    bpy.context.collection.objects.link(fill)

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.47, 0.55, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.55
    bpy.context.scene.world = world


def resolve_engine(preferred):
    """Blender has renamed EEVEE more than once (BLENDER_EEVEE,
    BLENDER_EEVEE_NEXT, and back again in 5.0), so ask the build what it has
    rather than hardcoding a name that expires."""
    available = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    if preferred in available:
        return preferred
    for name in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        if name in available:
            return name
    return available[0]


def setup_render(engine):
    scene = bpy.context.scene
    scene.render.resolution_x = RENDER_PX
    scene.render.resolution_y = RENDER_PX
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    # Blender reconstructs with a 1.5px filter by default, which softens every
    # silhouette. Game sprites want the edge tight; 1.0 still antialiases.
    scene.render.filter_size = 1.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    # Filmic and AgX are built for photographic latitude and desaturate flat
    # colour badly. Game art wants the colours as authored.
    try:
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass

    scene.render.engine = resolve_engine(engine)
    engine = scene.render.engine
    if engine == "CYCLES":
        scene.cycles.samples = 64
        scene.cycles.use_denoising = True
        scene.cycles.device = "CPU"
    else:
        # EEVEE's own name for its sample count has moved around between
        # versions, so set whichever this build exposes.
        eevee = scene.eevee
        for attr in ("taa_render_samples", "samples"):
            if hasattr(eevee, attr):
                setattr(eevee, attr, 64)
                break


# ---------------------------------------------------------------- buildings

PALETTE = {
    "wall": (0.78, 0.68, 0.52),
    "wall_dark": (0.55, 0.45, 0.34),
    "timber": (0.35, 0.24, 0.16),
    "roof": (0.62, 0.24, 0.18),
    "roof_dark": (0.34, 0.30, 0.29),
    "stone": (0.55, 0.55, 0.52),
    "thatch": (0.72, 0.60, 0.30),
    "crop": (0.72, 0.66, 0.24),
    "soil": (0.36, 0.27, 0.19),
}


def build_farm(mats):
    """A barn with a lean-to, standing in worked soil."""
    box("soil", (0.98, 0.98, 0.02), (0.0, 0.0, 0.0), mats["soil"])

    # Furrows, so the plot does not read as a flat brown square.
    for i in range(5):
        y = -0.36 + i * 0.18
        box("furrow%d" % i, (0.86, 0.06, 0.035), (0.0, y, 0.02), mats["crop"])

    box("barn", (0.46, 0.34, 0.30), (-0.16, 0.06, 0.02), mats["wall"])
    gable_roof("barn_roof", (0.52, 0.40), (-0.16, 0.06, 0.32), 0.18, mats["roof"])
    box("door", (0.13, 0.02, 0.17), (-0.16, -0.12, 0.02), mats["timber"])

    box("lean", (0.20, 0.22, 0.19), (0.22, 0.10, 0.02), mats["timber"])
    gable_roof("lean_roof", (0.26, 0.28), (0.22, 0.10, 0.21), 0.09, mats["roof_dark"])


def build_house(mats):
    """The plain dwelling, and the shape everything else is judged against."""
    box("walls", (0.52, 0.44, 0.34), (0.0, 0.0, 0.0), mats["wall"])
    box("plinth", (0.56, 0.48, 0.05), (0.0, 0.0, 0.0), mats["stone"])
    gable_roof("roof", (0.60, 0.52), (0.0, 0.0, 0.34), 0.22, mats["roof"])
    box("door", (0.14, 0.02, 0.20), (0.0, -0.22, 0.05), mats["timber"])
    box("beam_l", (0.03, 0.03, 0.34), (-0.24, -0.21, 0.0), mats["timber"])
    box("beam_r", (0.03, 0.03, 0.34), (0.24, -0.21, 0.0), mats["timber"])


BUILDINGS = {
    "farm": build_farm,
    "house": build_house,
}


# ------------------------------------------------------------------- render

def render_one(name, builder, out_dir, engine):
    clear_scene()
    setup_render(engine)
    setup_camera()
    setup_lights()

    mats = {k: make_material(k, v) for k, v in PALETTE.items()}
    builder(mats)

    path = os.path.abspath(os.path.join(out_dir, name + ".png"))
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


# --------------------------------------------------------------- calibration

def check_alignment(out_dir, engine):
    """Render a bare one-tile plate and measure it.

    The camera maths is only right if a 1x1 tile comes out exactly TILE_W by
    TILE_H pixels. Measuring it beats trusting the derivation, and it catches
    the whole class of mistakes at once: a wrong elevation, a wrong ortho_scale,
    a Blender version changing what ortho_scale applies to.
    """
    import numpy as np

    clear_scene()
    setup_render(engine)
    setup_camera()
    setup_lights()
    mat = make_material("plate", (1.0, 1.0, 1.0))
    # Exactly one tile, flat on the ground.
    box("plate", (1.0, 1.0, 0.0), (0.0, 0.0, 0.0), mat)

    path = os.path.abspath(os.path.join(out_dir, "_calibration.png"))
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

    img = bpy.data.images.load(path)
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    alpha = buf.reshape(h, w, 4)[:, :, 3]

    # Threshold matters here. A diamond's left and right extremes are single
    # points, so the pixels there are barely covered and a half-alpha cut clips
    # them, reporting a tile two pixels narrow that is nothing to do with the
    # camera. Any coverage at all is the shape's true extent.
    def extent(threshold):
        ys, xs = np.nonzero(alpha > threshold)
        return (int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1),
                (xs.max() + xs.min() + 1) / 2.0, (ys.max() + ys.min() + 1) / 2.0)

    solid_w, solid_h, _, _ = extent(0.5)
    touched_w, touched_h, _, _ = extent(0.0)

    # Extent is the wrong measure under a reconstruction filter: it bleeds
    # outwards at zero alpha and eats the thin tips at half. Total coverage is
    # not fooled, because a symmetric filter moves energy around without
    # creating or destroying it. For a TILE_W x TILE_H diamond that area is
    # half the bounding box. The centroid is invariant for the same reason.
    area = float(alpha.sum())
    want_area = TILE_W * TILE_H / 2.0
    total = max(area, 1e-6)
    cx = float((alpha.sum(axis=0) * np.arange(w)).sum() / total) + 0.5
    cy = float((alpha.sum(axis=1) * np.arange(h)).sum() / total) + 0.5

    print("")
    print("measured   area %.0f px2 (want %.0f), extent %dx%d touched, %dx%d solid"
          % (area, want_area, touched_w, touched_h, solid_w, solid_h))

    # The centre of the plate is the world origin, and a sprite drawn centred on
    # a tile centre is only correct if that lands in the middle of the image.

    print("")
    print("calibration")
    fails = 0
    ok = abs(area - want_area) / want_area < 0.01
    fails += 0 if ok else 1
    print("  %s %-14s %.0f px2, %+.2f%% off %.0f" % (
        "ok  " if ok else "FAIL", "tile area", area,
        100.0 * (area - want_area) / want_area, want_area))

    # A diamond twice as wide as it is tall, which is what makes the sprite sit
    # on the game's ground rather than merely being the right size.
    ratio = touched_w / float(touched_h)
    ok = abs(ratio - TILE_W / TILE_H) < 0.06
    fails += 0 if ok else 1
    print("  %s %-14s %.3f (want %.3f)" % (
        "ok  " if ok else "FAIL", "aspect", ratio, TILE_W / TILE_H))

    for label, got in (("centre x", cx), ("centre y", cy)):
        ok = abs(got - RENDER_PX / 2.0) <= 0.5
        fails += 0 if ok else 1
        print("  %s %-14s %.2f px (want %.1f)" % (
            "ok  " if ok else "FAIL", label, got, RENDER_PX / 2.0))

    os.remove(path)
    print("")
    print("%d failure(s)" % fails)
    return fails


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = OUT_DIR
    engine = "BLENDER_EEVEE_NEXT"  # resolved against the build below
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
    names = [only] if only else sorted(BUILDINGS)

    if check:
        sys.exit(1 if check_alignment(out_dir, engine) else 0)

    print("camera     elevation %.3f deg, yaw %.0f deg" % (math.degrees(ELEVATION), math.degrees(YAW)))
    print("scale      %.3f px per unit, %d px render, ortho_scale %.4f"
          % (PX_PER_UNIT, RENDER_PX, RENDER_PX / PX_PER_UNIT))
    for name in names:
        path = render_one(name, BUILDINGS[name], out_dir, engine)
        print("wrote      %s" % path)


if __name__ == "__main__":
    main()
