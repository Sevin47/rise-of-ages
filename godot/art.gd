## What everything looks like, and the geometry needed to draw it.
##
## Shared by the playable scene and the still-render probe so the two cannot
## drift apart. Nothing here knows about game rules; it maps a terrain or a
## building id to sprites and offsets, and that is all.
class_name IsoArt

# --------------------------------------------------------------- ground --

## Chosen off the packs' contact sheets at size, after two wrong guesses: many
## tiles carry a road, a kerb or a corner of beach that is invisible on a sheet
## and obvious once tiled across a whole map.
const WORLD_DIR := "res://assets/rendered/world/"

## Several variants per terrain. One tile repeated over a map shows its own
## lattice however good the tile is, because every feature lands on the same
## grid; picking between variants by position is what breaks that up.
const LAND := {
	WorldMap.WATER: ["water_0", "water_1"],
	WorldMap.GRASS: ["grass_0", "grass_1", "grass_2"],
	WorldMap.FOREST: ["grass_0", "grass_1", "grass_2"],  # trees go on top
	WorldMap.HILLS: ["earth_0", "earth_1", "earth_2"],   # rock goes on top
	WorldMap.DESERT: ["sand_0", "sand_1", "sand_2"],
}


## Which variant a tile uses. Deterministic in the coordinates rather than
## random, so the ground looks the same every time a session is reloaded
## instead of reshuffling itself under the player.
static func ground_texture(terrain: int, tx: int, ty: int) -> Texture2D:
	var set_: Array = LAND[terrain]
	var h := (tx * 73856093) ^ (ty * 19349663)
	return load(WORLD_DIR + set_[absi(h) % set_.size()] + ".png")

## Props, by the terrain they decorate.
const TREES := ["tree_broad", "tree_tall", "tree_scrub"]
const ROCKS := ["rock_boulder", "rock_cluster", "rock_outcrop"]


static func prop_texture(name: String) -> Texture2D:
	return load(WORLD_DIR + name + ".png")


# ---------------------------------------------------------------- props --

# ------------------------------------------------------------ buildings --

## Buildings rendered by art/blender/render_buildings.py.
const RENDERED_DIR := "res://assets/rendered/"


## A rendered building needs no assembly.
##
## This replaced a tileset path that stacked masonry, walls and roof pieces and
## lifted each by a hand-measured amount, which had to be re-tuned whenever a
## piece changed and still let roofs overhang what they capped. The sprite is
## taken through the same camera the game draws with, with the footprint centred
## on the world origin, so the image centre *is* the tile centre: drawing it
## centred is the whole placement.
static func make_building(def: String, tx: int, ty: int) -> Node2D:
	var n := WorldMap.footprint(def)
	var mid := Iso.to_screen(tx + (n - 1) / 2.0, ty + (n - 1) / 2.0)

	var group := Node2D.new()
	# Y carries the sort order, as with every other entity.
	group.position = Vector2(0.0, mid.y)

	var s := Sprite2D.new()
	s.texture = load(RENDERED_DIR + def + ".png")
	s.centered = true
	# No scaling. Each building is modelled at its real footprint and rendered
	# on a canvas sized to suit, so scaling here would only magnify pixels that
	# were already the right size.
	s.position = Vector2(mid.x, 0.0)
	group.add_child(s)
	return group


# --------------------------------------------------------------- people --

const CITIZEN_DIR := "res://assets/rendered/people/"
const CITIZEN_FACINGS := 4
const CITIZEN_FRAMES := 4


## One rendered frame of the walk cycle.
##
## Sixteen small textures rather than one sheet with regions. The citizen is
## modelled standing on the world origin, so like every other asset here the
## image centre is where its feet are, and Godot draws it centred with no
## anchor arithmetic and no scale: the figure is 0.42 tiles tall because that
## is how tall it was built, which is what keeps it in proportion to a house.
static func citizen_texture(facing: int, frame: int) -> Texture2D:
	return load(CITIZEN_DIR + "citizen_%d_%d.png" % [
		facing % CITIZEN_FACINGS, frame % CITIZEN_FRAMES
	])
