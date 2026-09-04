"""The camera, the lights and the primitives every render shares.

Buildings, ground tiles, props and people all have to look like they belong to
one world, and the only reliable way to get that is for them to go through
literally the same camera and the same lights. So that setup lives here rather
than being copied, where the copies would drift.

**The camera is derived from the game's own tile size.** Iso.TILE_W and TILE_H
are 132x66, a 2:1 diamond, so the camera elevation is asin(66/132) = 30 degrees.
It is worth being careful here: the figure usually quoted for 2:1 isometric,
26.57 degrees, is atan(1/2) and describes the slope of the tile edges *on
screen*, not where the camera stands.

**Everything is modelled around the world origin, and the camera looks at it.**
The origin therefore lands exactly at the centre of the image, so Godot draws
every sprite centred and it is right, with no per-asset offset to measure. For
buildings and props the origin is the centre of the footprint at ground level;
for a ground tile it is the centre of the tile's top face.
"""

import math
import os

import bpy
from mathutils import Vector

# Straight from the game. `iso.gd` is the authority; if the tiles change, the
# camera follows rather than having to be re-derived by hand.
TILE_W = 132.0
TILE_H = 66.0

ELEVATION = math.asin(TILE_H / TILE_W)
YAW = math.radians(45.0)

# One tile is one Blender unit. A unit square yawed 45 degrees is sqrt(2) wide
# on screen, and that width has to come out as TILE_W pixels.
PX_PER_UNIT = TILE_W / math.sqrt(2.0)


def render_px(tiles):
    """Canvas for an asset of this many tiles across. Square, so Blender's
    ortho_scale is unambiguous."""
    return int(256 * tiles)


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
        bsdf.inputs["Specular IOR Level"].default_value = 0.1
    return mat


def mesh_from(name, verts, faces, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    # Flat shading. Smooth normals on low-poly geometry only blur the edges that
    # give the silhouette its read at this size.
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------- primitives

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


def gable_roof(name, size, centre, height, material, along="y"):
    """A ridged roof. The ridge runs along Y unless told otherwise."""
    sx, sy = size[0] / 2.0, size[1] / 2.0
    cx, cy, cz = centre
    if along == "y":
        v = [(cx - sx, cy - sy, cz), (cx + sx, cy - sy, cz),
             (cx + sx, cy + sy, cz), (cx - sx, cy + sy, cz),
             (cx, cy - sy, cz + height), (cx, cy + sy, cz + height)]
        f = [(0, 1, 2, 3), (0, 4, 5, 3), (1, 2, 5, 4), (0, 1, 4), (3, 5, 2)]
    else:
        v = [(cx - sx, cy - sy, cz), (cx + sx, cy - sy, cz),
             (cx + sx, cy + sy, cz), (cx - sx, cy + sy, cz),
             (cx - sx, cy, cz + height), (cx + sx, cy, cz + height)]
        f = [(0, 1, 2, 3), (0, 1, 5, 4), (3, 2, 5, 4), (0, 4, 3), (1, 2, 5)]
    return mesh_from(name, v, f, material)


def pyramid(name, size, centre, height, material, peak=0.0):
    """A rectangular base rising to a point, or to a flat top if `peak` is set."""
    sx, sy = size[0] / 2.0, size[1] / 2.0
    cx, cy, cz = centre
    tz = cz + height
    px = peak / 2.0
    v = [(cx - sx, cy - sy, cz), (cx + sx, cy - sy, cz),
         (cx + sx, cy + sy, cz), (cx - sx, cy + sy, cz),
         (cx - px, cy - px, tz), (cx + px, cy - px, tz),
         (cx + px, cy + px, tz), (cx - px, cy + px, tz)]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2),
         (2, 6, 7, 3), (3, 7, 4, 0)]
    return mesh_from(name, v, f, material)


def cylinder(name, radius, height, centre, material, segments=14, top_radius=None,
             axis="z"):
    """A prism round enough to read as a cylinder. Also does cones, via
    `top_radius`, and lies down via `axis`, which is what felled timber wants.

    The axis rotations are proper rotations rather than coordinate swaps. A swap
    is a reflection, and it would turn every face inside out.
    """
    tr = radius if top_radius is None else top_radius
    cx, cy, cz = centre

    def place(x, y, z):
        if axis == "x":
            x, y, z = z, y, -x       # local +Z becomes world +X
        elif axis == "y":
            x, y, z = x, z, -y       # local +Z becomes world +Y
        return (cx + x, cy + y, cz + z)

    v = []
    for i in range(segments):
        a = 2.0 * math.pi * i / segments
        v.append(place(radius * math.cos(a), radius * math.sin(a), 0.0))
    for i in range(segments):
        a = 2.0 * math.pi * i / segments
        v.append(place(tr * math.cos(a), tr * math.sin(a), height))
    f = [tuple(range(segments)), tuple(reversed(range(segments, 2 * segments)))]
    for i in range(segments):
        j = (i + 1) % segments
        f.append((i, j, segments + j, segments + i))
    return mesh_from(name, v, f, material)


def diamond(name, size, centre, material, thickness=0.0):
    """A tile: a square in the XY plane, which the camera sees as a 2:1 diamond.

    `centre` is the middle of the *top* face and the body hangs below it, so the
    world origin stays on the ground plane where the game's tile centre is.
    """
    s = size / 2.0
    cx, cy, cz = centre
    if thickness <= 0.0:
        v = [(cx - s, cy - s, cz), (cx + s, cy - s, cz),
             (cx + s, cy + s, cz), (cx - s, cy + s, cz)]
        return mesh_from(name, v, [(0, 1, 2, 3)], material)
    return box(name, (size, size, thickness), (cx, cy, cz - thickness), material)


# ------------------------------------------------------------------- camera

def setup_camera(px, elevation=None, yaw=None, units=None):
    """The shared camera.

    Defaults to the isometric one the Godot build draws with. The web build is
    a different projection entirely — a square grid seen from above rather than
    a 2:1 diamond — so it passes its own angles and its own framing. The models
    do not change; only where the camera stands does, which is the point of
    keeping geometry in code.

    `units` is how many Blender units the frame spans. Left out, it is derived
    so that one tile comes out TILE_W pixels wide, which is what the isometric
    build needs.
    """
    elevation = ELEVATION if elevation is None else elevation
    yaw = YAW if yaw is None else yaw

    cam_data = bpy.data.cameras.new("IsoCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = (px / PX_PER_UNIT) if units is None else units

    cam = bpy.data.objects.new("IsoCam", cam_data)
    bpy.context.collection.objects.link(cam)

    # Blender cameras look down their local -Z. With no rotation that is
    # straight down, so the tilt from vertical is 90 degrees minus the
    # elevation above the horizon.
    cam.rotation_euler = (math.pi / 2.0 - elevation, 0.0, yaw)

    # Orthographic, so the distance changes nothing but clipping. Far enough
    # out that nothing crosses the near plane.
    back = cam.rotation_euler.to_matrix() @ Vector((0.0, 0.0, 1.0))
    cam.location = back * 40.0
    cam_data.clip_start = 0.1
    cam_data.clip_end = 200.0

    bpy.context.scene.camera = cam
    return cam


def setup_lights():
    # One key sun for form, one weak fill so the shadowed faces still read, and
    # a little ambient from the world. Fixed for everything: this is the whole
    # reason the set stays consistent.
    #
    # Exposure matters more than it looks. A sun lamp puts out roughly
    # albedo * energy / pi, so at energy 4 anything above about 0.7 albedo
    # clips to white under the Standard view transform: an early pass turned
    # marble, city walls and a mid-grey rock face into the same paper white.
    key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", type="SUN"))
    key.data.energy = 2.5
    key.data.angle = math.radians(8.0)
    key.rotation_euler = (math.radians(50.0), 0.0, math.radians(35.0))
    bpy.context.collection.objects.link(key)

    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", type="SUN"))
    fill.data.energy = 0.55
    fill.rotation_euler = (math.radians(62.0), 0.0, math.radians(215.0))
    bpy.context.collection.objects.link(fill)

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.45, 0.52, 0.60, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.22
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


def setup_render(engine, px):
    scene = bpy.context.scene
    scene.render.resolution_x = px
    scene.render.resolution_y = px
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
    if scene.render.engine == "CYCLES":
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


def begin(engine, px, elevation=None, yaw=None, units=None):
    """A fresh scene with the shared camera and lights, ready to build into."""
    clear_scene()
    setup_render(engine, px)
    setup_camera(px, elevation, yaw, units)
    setup_lights()


def render_to(path):
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


# --------------------------------------------------------------- palette

# Warmer and more saturated than a neutral render would be, to sit alongside
# the game's terrain rather than looking like untextured geometry.
PALETTE = {
    "plaster": (0.80, 0.71, 0.54),
    "plaster_warm": (0.80, 0.66, 0.46),
    "timber": (0.36, 0.23, 0.14),
    "timber_light": (0.60, 0.42, 0.24),
    "roof": (0.68, 0.24, 0.16),
    "roof_dark": (0.45, 0.16, 0.12),
    "slate": (0.34, 0.34, 0.40),
    "stone": (0.58, 0.56, 0.51),
    "stone_dark": (0.44, 0.42, 0.39),
    "marble": (0.80, 0.78, 0.70),
    "thatch": (0.76, 0.60, 0.28),
    "crop": (0.78, 0.68, 0.24),
    "soil": (0.34, 0.25, 0.17),
    "grass": (0.35, 0.52, 0.24),
    "gold": (0.85, 0.68, 0.24),
    "iron": (0.40, 0.42, 0.46),
    "cloth_red": (0.70, 0.28, 0.24),
    "cloth_blue": (0.28, 0.38, 0.62),
    "water": (0.30, 0.50, 0.62),
    "ore": (0.62, 0.47, 0.24),
    "rock": (0.46, 0.44, 0.44),
    "rock_light": (0.56, 0.54, 0.53),
    "rock_dark": (0.33, 0.32, 0.33),
    "shadow": (0.20, 0.18, 0.16),

    # Ground, props and people.
    "turf": (0.40, 0.58, 0.26),
    "turf_dark": (0.31, 0.47, 0.21),
    "turf_light": (0.49, 0.66, 0.30),
    "earth": (0.44, 0.33, 0.22),
    "earth_dark": (0.34, 0.25, 0.17),
    "sand": (0.78, 0.70, 0.48),
    "sand_dark": (0.66, 0.58, 0.39),
    "sea": (0.24, 0.45, 0.58),
    "sea_light": (0.34, 0.58, 0.68),
    "bark": (0.38, 0.27, 0.18),
    "leaf": (0.28, 0.47, 0.22),
    "leaf_light": (0.36, 0.57, 0.26),
    "leaf_dark": (0.21, 0.36, 0.18),
    # A citizen is about forty pixels tall on screen, so the parts have to
    # separate by hue, not by shade. A first pass made tunic, skin and boots all
    # browns and the figure read as one blob.
    "skin": (0.92, 0.74, 0.56),
    "tunic": (0.32, 0.45, 0.66),
    "tunic_alt": (0.66, 0.34, 0.28),
    "hair": (0.24, 0.16, 0.11),
    "trousers": (0.42, 0.33, 0.24),
    "boot": (0.30, 0.22, 0.16),
}


def materials():
    return {k: make_material(k, v) for k, v in PALETTE.items()}


# --------------------------------------------------------------- calibration

def check_alignment(out_dir, engine):
    """Render a bare one-tile plate and measure it.

    The camera maths is only right if a 1x1 tile comes out exactly TILE_W by
    TILE_H pixels. Measuring beats trusting the derivation, and it catches the
    whole class of mistakes at once: a wrong elevation, a wrong ortho_scale, a
    Blender version changing what ortho_scale applies to.
    """
    import numpy as np

    px = render_px(1)
    begin(engine, px)
    mat = make_material("plate", (1.0, 1.0, 1.0))
    diamond("plate", 1.0, (0.0, 0.0, 0.0), mat)

    path = render_to(os.path.join(out_dir, "_calibration.png"))
    img = bpy.data.images.load(path)
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    alpha = buf.reshape(h, w, 4)[:, :, 3]

    def extent(threshold):
        ys, xs = np.nonzero(alpha > threshold)
        return int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)

    solid_w, solid_h = extent(0.5)
    touched_w, touched_h = extent(0.0)

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
    print("")
    print("calibration")

    fails = 0
    ok = abs(area - want_area) / want_area < 0.01
    fails += 0 if ok else 1
    print("  %s %-14s %.0f px2, %+.2f%% off %.0f" % (
        "ok  " if ok else "FAIL", "tile area", area,
        100.0 * (area - want_area) / want_area, want_area))

    ratio = touched_w / float(touched_h)
    ok = abs(ratio - TILE_W / TILE_H) < 0.06
    fails += 0 if ok else 1
    print("  %s %-14s %.3f (want %.3f)" % (
        "ok  " if ok else "FAIL", "aspect", ratio, TILE_W / TILE_H))

    for label, got in (("centre x", cx), ("centre y", cy)):
        ok = abs(got - px / 2.0) <= 0.5
        fails += 0 if ok else 1
        print("  %s %-14s %.2f px (want %.1f)" % (
            "ok  " if ok else "FAIL", label, got, px / 2.0))

    os.remove(path)
    print("")
    print("%d failure(s)" % fails)
    return fails
