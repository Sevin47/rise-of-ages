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
const LAND := {
	WorldMap.WATER: "res://assets/land/066.png",
	WorldMap.GRASS: "res://assets/land/022.png",
	WorldMap.FOREST: "res://assets/land/022.png",  # plain grass; trees go on top
	WorldMap.HILLS: "res://assets/land/073.png",   # bare earth; rock goes on top
	WorldMap.DESERT: "res://assets/land/059.png",
}

## Every tile in the landscape pack shares one base footprint: a 2:1 diamond,
## 132 by 66, whose bottom vertex sits on the last row of the image. What
## differs is only how tall the block above it is, which is why the images vary
## from 83 to 131 pixels high.
##
## Hence anchoring by image height rather than a constant. A fixed offset
## assumes a uniform block height, and the taller tiles then float clear of
## their neighbours, gapping the ground.
static func ground_anchor(tex: Texture2D, p: Vector2) -> Vector2:
	return Vector2(p.x - Iso.TILE_W / 2.0, p.y - (tex.get_size().y - Iso.TILE_H / 2.0))


# ---------------------------------------------------------------- props --

const FOREST_SHEET := "res://assets/pixx/forest.png"
const VILLAGE_SHEET := "res://assets/pixx/village.png"

const TREE_CELLS := [Vector2i(2, 0), Vector2i(3, 0)]
const ROCK_CELLS := [Vector2i(4, 4), Vector2i(3, 1), Vector2i(4, 1)]

# ------------------------------------------------------------ buildings --

## The village tileset has no whole buildings in it: it is masonry, walls,
## doors, roofs and a chimney meant to be stacked.
##
## The geometry, measured off the sheet rather than guessed: every 128x128 cell
## is drawn around a ground diamond whose centre sits at y=96 in the cell, a
## stone base rises 60px above that ground, and a wall 64. So a layer's lift is
## the sum of what is underneath it.
const PIXX_CELL := 128.0
const PIXX_GROUND_Y := 96.0
const BASE_H := 60.0
const WALL_H := 64.0

## A roof cell fills its cell, while the walls beneath it are a corner piece
## that reads narrower, so at equal scale a roof overhangs what it caps.
const ROOF_K := 0.82

const C_STONE := Vector2i(0, 0)
const C_WALL := Vector2i(1, 2)
const C_GABLE := Vector2i(2, 5)
const C_GABLE_B := Vector2i(1, 6)
const C_FLATROOF := Vector2i(4, 6)
const C_CHIMNEY := Vector2i(2, 6)
const C_DOOR := Vector2i(5, 3)

## Each building is a stack of [cell, lift, scale] layers, bottom first.
const RECIPES := {
	"farm": [[C_STONE, 0.0, 1.0], [C_GABLE_B, BASE_H, ROOF_K]],
	"camp": [[C_STONE, 0.0, 1.0], [C_FLATROOF, BASE_H, ROOF_K]],
	"mine": [[C_STONE, 0.0, 1.0], [C_FLATROOF, BASE_H, ROOF_K]],
	"well": [[C_STONE, 0.0, 1.0], [C_CHIMNEY, BASE_H, 0.9]],
	"market": [[C_STONE, 0.0, 1.0], [C_WALL, BASE_H, 1.0], [C_GABLE, BASE_H + WALL_H, ROOF_K]],
	"library": [[C_STONE, 0.0, 1.0], [C_WALL, BASE_H, 1.0], [C_GABLE_B, BASE_H + WALL_H, ROOF_K]],
	"granary": [[C_STONE, 0.0, 1.0], [C_FLATROOF, BASE_H, ROOF_K]],
	"warehouse": [[C_STONE, 0.0, 1.0], [C_WALL, BASE_H, 1.0], [C_FLATROOF, BASE_H + WALL_H, ROOF_K]],
	"workshop": [
		[C_STONE, 0.0, 1.0], [C_WALL, BASE_H, 1.0],
		[C_GABLE, BASE_H + WALL_H, ROOF_K], [C_CHIMNEY, BASE_H + WALL_H + 30.0, 0.7],
	],
	"university": [
		[C_STONE, 0.0, 1.0], [C_WALL, BASE_H, 1.0], [C_DOOR, BASE_H, 1.0],
		[C_GABLE_B, BASE_H + WALL_H, ROOF_K],
	],
	"temple": [
		[C_STONE, 0.0, 1.0], [C_WALL, BASE_H, 1.0],
		[C_GABLE, BASE_H + WALL_H, ROOF_K], [C_CHIMNEY, BASE_H + WALL_H + 30.0, 0.7],
	],
	"city": [
		[C_STONE, 0.0, 1.0], [C_WALL, BASE_H, 1.0], [C_DOOR, BASE_H, 1.0],
		[C_GABLE, BASE_H + WALL_H, ROOF_K],
	],
}


## How much to scale a building for its footprint. A building should roughly
## fill the ground it stands on rather than perch on one tile of it.
static func building_scale(n: int) -> float:
	return (Iso.TILE_W / PIXX_CELL) * (1.3 if n <= 2 else 1.75)


## Build one building as a single node, with its layers as children.
##
## Every layer has to sort as one object. Left to itself Godot sorts each
## sprite by its own Y, and a roof sits higher up the screen than the walls
## under it, so it would sort behind them and vanish.
static func make_building(def: String, tx: int, ty: int) -> Node2D:
	var sheet: Texture2D = load(VILLAGE_SHEET)
	var n := WorldMap.footprint(def)
	var mid := Iso.to_screen(tx + (n - 1) / 2.0, ty + (n - 1) / 2.0)
	var k := building_scale(n)

	var group := Node2D.new()
	group.position = Vector2(0.0, mid.y)

	for layer in RECIPES.get(def, RECIPES["farm"]):
		var cell: Vector2i = layer[0]
		var lift: float = layer[1]
		var ks: float = k * float(layer[2])
		var s := Sprite2D.new()
		s.texture = sheet
		s.region_enabled = true
		s.region_rect = Rect2(cell.x * PIXX_CELL, cell.y * PIXX_CELL, PIXX_CELL, PIXX_CELL)
		s.centered = false
		s.scale = Vector2(ks, ks)
		# The lift stays in the unshrunk scale: shrinking a roof must not also
		# drop it into the walls it is sitting on.
		s.position = Vector2(mid.x - (PIXX_CELL / 2.0) * ks, -PIXX_GROUND_Y * ks - lift * k)
		group.add_child(s)

	return group


# --------------------------------------------------------------- people --

const CITIZEN_SHEET := "res://assets/pixx/warrior_walk.png"
const CITIZEN_FRAME := Vector2(128, 160)
const CITIZEN_COLS := 4  ## animation frames
const CITIZEN_ROWS := 4  ## facings
const CITIZEN_K := 0.24  ## small enough that a house still reads as a house


static func citizen_region(facing: int, frame: int) -> Rect2:
	return Rect2(
		(frame % CITIZEN_COLS) * CITIZEN_FRAME.x,
		(facing % CITIZEN_ROWS) * CITIZEN_FRAME.y,
		CITIZEN_FRAME.x, CITIZEN_FRAME.y
	)


## Where a citizen's sprite goes, given its tile position. Anchored by the feet.
static func citizen_anchor(p: Vector2) -> Vector2:
	return Vector2(
		p.x - CITIZEN_FRAME.x * CITIZEN_K / 2.0,
		p.y - CITIZEN_FRAME.y * CITIZEN_K + Iso.TILE_H * 0.3
	)
