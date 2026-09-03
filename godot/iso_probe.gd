## Isometric rendering spike.
##
## Builds a world from the ported generator, draws it isometrically with the
## Kenney landscape blocks, drops buildings and citizens on it, renders one
## frame and writes it to a PNG so the result can actually be looked at.
##
##   godot --path godot --script iso_probe.gd
##
## Not headless: --headless has no renderer, so it would save a blank image.
extends SceneTree

## Every tile in the pack shares one base footprint: a 2:1 diamond, 132 wide by
## 66 tall, whose bottom vertex sits on the last row of the image. What differs
## between tiles is only how tall the block above it is, which is why the images
## vary from 83 to 131 pixels high.
##
## That is the whole reason to anchor by image height rather than a constant.
## Anchoring every sprite the same distance above its projected point assumes a
## uniform block height, and the taller tiles then float clear of their
## neighbours, which is exactly the gapping the first render showed.
const TILE_W := 132.0
const TILE_H := 66.0

## Which landscape tile stands for each terrain. Picked by eye from the pack's
## contact sheet: flat green for grass, a green mound for woodland, flat grey
## stone for hills, flat blue for water, tan for sand.
## Chosen off the pack's contact sheet at size, after two wrong guesses: many
## of these tiles carry a road, a kerb or a corner of beach that only shows up
## once it is tiled across a whole map.
const LAND := {
	WorldMap.WATER: ["res://assets/land/066.png"],   # plain water, no beach corner
	WorldMap.GRASS: ["res://assets/land/022.png"],   # plain green top
	WorldMap.FOREST: ["res://assets/land/022.png"],  # plain grass; trees are drawn on top
	# Not one of the pack's grey tiles: every one of those carries a kerb or a
	# road stripe, invisible on a contact sheet and unmistakable once tiled.
	# Bare earth, with rock scattered on top, reads as high ground instead.
	WorldMap.HILLS: ["res://assets/land/073.png"],
	WorldMap.DESERT: ["res://assets/land/059.png"],  # sand
}

## Buildings are assembled out of the 2DPIXX village tileset rather than taken
## whole, because that pack has no whole buildings: it is masonry, walls, doors
## and roofs meant to be stacked.
##
## The geometry that makes stacking work, measured off the sheet rather than
## guessed: every 128x128 cell is drawn around a ground diamond whose centre
## sits at y=96 in the cell. A stone base rises 60px above that ground, and a
## wall 64px. So a layer's lift is just the sum of what is underneath it.
const PIXX_CELL := 128.0
const PIXX_GROUND_Y := 96.0
const BASE_H := 60.0
const WALL_H := 64.0

## Cells in the 7x7 village sheet, as (column, row).
const C_STONE := Vector2i(0, 0)   # paved stone cube, the foundation
const C_WALL := Vector2i(1, 2)    # two walls meeting at a post
const C_GABLE := Vector2i(2, 5)   # pitched red roof
const C_GABLE_B := Vector2i(1, 6) # pitched red roof, facing the other way
const C_FLATROOF := Vector2i(4, 6) # red roof over a low wall
const C_CHIMNEY := Vector2i(2, 6)
const C_DOOR := Vector2i(5, 3)

## Each building is a stack of [cell, lift, scale] layers, bottom first. The
## scale is there for roofs: a roof cell is drawn to fill its cell, while the
## walls under it are a corner piece that reads narrower, so at equal scale the
## roof overhangs the building it is supposed to cap.
const ROOF_K := 0.82
const RECIPES := {
	# Squat huts: a foundation with a roof straight on top.
	"farm": [[C_STONE, 0.0, 1.0], [C_GABLE_B, BASE_H, ROOF_K]],
	"camp": [[C_STONE, 0.0, 1.0], [C_FLATROOF, BASE_H, ROOF_K]],
	"mine": [[C_STONE, 0.0, 1.0], [C_FLATROOF, BASE_H, ROOF_K]],
	# Walled buildings: foundation, walls, then the roof over them.
	"market": [[C_STONE, 0.0, 1.0], [C_WALL, BASE_H, 1.0], [C_GABLE, BASE_H + WALL_H, ROOF_K]],
	"library": [[C_STONE, 0.0, 1.0], [C_WALL, BASE_H, 1.0], [C_GABLE_B, BASE_H + WALL_H, ROOF_K]],
	"temple": [
		[C_STONE, 0.0, 1.0], [C_WALL, BASE_H, 1.0],
		[C_GABLE, BASE_H + WALL_H, ROOF_K], [C_CHIMNEY, BASE_H + WALL_H + 30.0, 0.7],
	],
	# The city is the landmark, but two storeys on a foundation made a tower
	# rather than a keep. One storey, and let the larger footprint carry it.
	"city": [
		[C_STONE, 0.0, 1.0], [C_WALL, BASE_H, 1.0], [C_DOOR, BASE_H, 1.0],
		[C_GABLE, BASE_H + WALL_H, ROOF_K],
	],
}

## How far a storey lifts the roof above the ground plane.
const WALL_HEIGHT := 33.0

## Citizens come from 2DPIXX's free isometric pack (CC-BY 4.0, Jana Ochse).
## Kenney has no isometric figures at all, and the old top-down sprites read as
## specks once the camera is isometric. These are proper isometric characters
## with four facings, so a citizen can face the way it is walking.
const CITIZEN_SHEET := "res://assets/pixx/warrior_walk.png"
const CITIZEN_FRAME := Vector2(128, 160)
const CITIZEN_COLS := 4   # animation frames
const CITIZEN_ROWS := 4   # facings

const VILLAGE_SHEET := "res://assets/pixx/village.png"

## The forest sheet carries the natural clutter: trees, boulders, scrub.
const FOREST_SHEET := "res://assets/pixx/forest.png"
const TREE_CELLS := [Vector2i(2, 0), Vector2i(3, 0)]
const ROCK_CELLS := [Vector2i(4, 4), Vector2i(3, 1), Vector2i(4, 1)]

var world: WorldMap


## Grid to screen. The whole isometric illusion is these two lines: x depends on
## the difference of the coordinates, y on their sum.
func to_screen(tx: float, ty: float) -> Vector2:
	return Vector2((tx - ty) * (TILE_W / 2.0), (tx + ty) * (TILE_H / 2.0))


func _init() -> void:
	world = WorldMap.new(4242)

	# Populate it, so the render shows a working settlement rather than bare
	# ground. Placement goes through the same rules as the real game.
	var built: Array[Dictionary] = []
	for def in ["city", "farm", "camp", "mine", "farm", "market", "library"]:
		var spot := world.find_spot(def)
		if spot.x >= 0 and world.place(def, spot.x, spot.y) != 0:
			built.append(world.placements[-1])

	var root2d := Node2D.new()
	# Godot sorts children of a y-sorted node by their Y before drawing, which
	# is exactly the painter's order isometric needs. No manual depth sorting.
	root2d.y_sort_enabled = true
	root.add_child(root2d)

	_draw_ground(root2d)
	_draw_clutter(root2d)
	_draw_buildings(root2d, built)
	_draw_citizens(root2d, built)

	# Frame the settlement.
	var cam := Camera2D.new()
	cam.position = to_screen(WorldMap.MAP_W / 2.0, WorldMap.MAP_H / 2.0)
	cam.zoom = Vector2(0.72, 0.72)
	root2d.add_child(cam)
	cam.make_current()

	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw

	var img := root.get_texture().get_image()
	img.save_png("res://iso_probe.png")
	print("wrote iso_probe.png  %dx%d" % [img.get_width(), img.get_height()])
	print("terrain counts %s" % _counts())
	quit()


func _counts() -> Dictionary:
	var c := {"water": 0, "grass": 0, "forest": 0, "hills": 0, "desert": 0}
	var names := ["water", "grass", "forest", "hills", "desert"]
	for ty in WorldMap.MAP_H:
		for tx in WorldMap.MAP_W:
			c[names[world.at(tx, ty)]] += 1
	return c


## Place a sprite so its base diamond sits on the projected point, whatever the
## block above that diamond happens to be.
func ground_anchor(tex: Texture2D, p: Vector2) -> Vector2:
	return Vector2(p.x - TILE_W / 2.0, p.y - (tex.get_size().y - TILE_H / 2.0))


func _draw_ground(parent: Node2D) -> void:
	for ty in WorldMap.MAP_H:
		for tx in WorldMap.MAP_W:
			var t := world.at(tx, ty)
			var options: Array = LAND[t]
			# Deterministic pick, so the same map always looks the same.
			var art: String = options[(tx * 7 + ty * 13) % options.size()]
			var s := Sprite2D.new()
			s.texture = load(art)
			s.centered = false
			var p := to_screen(tx, ty)
			# The sprite's top-face diamond is centred on the projected point,
			# and the block's depth hangs below it.
			s.position = Vector2(p.x - TILE_W / 2.0, p.y - TILE_H / 2.0)
			parent.add_child(s)


## Draw one cell of the village sheet with its ground diamond on `at`.
func _pixx_layer(parent: Node2D, sheet: Texture2D, cell: Vector2i, at: Vector2,
		lift: float, k: float, shrink: float = 1.0) -> void:
	var s := Sprite2D.new()
	s.texture = sheet
	s.region_enabled = true
	s.region_rect = Rect2(cell.x * PIXX_CELL, cell.y * PIXX_CELL, PIXX_CELL, PIXX_CELL)
	s.centered = false
	var ks := k * shrink
	s.scale = Vector2(ks, ks)
	# Lift stays in the full-size scale: shrinking a roof must not also drop it
	# down into the walls it is sitting on.
	s.position = Vector2(
		at.x - (PIXX_CELL / 2.0) * ks,
		at.y - PIXX_GROUND_Y * ks - lift * k
	)
	# Every layer of one building sorts as a single object. Without this the
	# roof sorts below the walls, because its own Y is higher up the screen.
	s.y_sort_enabled = false
	parent.add_child(s)


func _draw_buildings(parent: Node2D, built: Array[Dictionary]) -> void:
	var sheet: Texture2D = load(VILLAGE_SHEET)
	for p in built:
		var n := WorldMap.footprint(p["def"])
		var mid := to_screen(p["tx"] + (n - 1) / 2.0, p["ty"] + (n - 1) / 2.0)

		# A cell is 128 wide against the landscape's 132, and a building should
		# roughly fill the ground it stands on rather than perch on one tile of
		# it, so the footprint scales it too.
		var k := (TILE_W / PIXX_CELL) * (1.3 if n <= 2 else 1.75)

		# One parent per building, so the whole stack sorts together against
		# the ground and against other buildings.
		var group := Node2D.new()
		group.position = Vector2(0.0, mid.y)
		parent.add_child(group)

		for layer in RECIPES.get(p["def"], RECIPES["farm"]):
			_pixx_layer(group, sheet, layer[0], Vector2(mid.x, 0.0), layer[1], k, layer[2])


func _draw_citizens(parent: Node2D, built: Array[Dictionary]) -> void:
	var sheet: Texture2D = load(CITIZEN_SHEET)
	var rng := RandomNumberGenerator.new()
	rng.seed = 99
	for p in built:
		var n := WorldMap.footprint(p["def"])
		for i in 4:
			var s := Sprite2D.new()
			s.texture = sheet
			s.region_enabled = true
			# One frame out of the sheet: column is the animation step, row is
			# the facing. Picking both at random gives a crowd that is not all
			# mid-stride in the same direction.
			var col := rng.randi() % CITIZEN_COLS
			var row := rng.randi() % CITIZEN_ROWS
			s.region_rect = Rect2(
				col * CITIZEN_FRAME.x, row * CITIZEN_FRAME.y,
				CITIZEN_FRAME.x, CITIZEN_FRAME.y
			)
			s.centered = false
			var off := Vector2(rng.randf_range(-1.4, 1.4), rng.randf_range(-1.4, 1.4))
			var q := to_screen(p["tx"] + n / 2.0 + off.x, p["ty"] + n / 2.0 + off.y)
			# Feet on the ground: the sprite is anchored by its bottom edge.
			# A citizen has to be small enough that a house still reads as a
			# house. At the pack's native size they tower over the buildings.
			var k := 0.24
			s.scale = Vector2(k, k)
			s.position = Vector2(
				q.x - CITIZEN_FRAME.x * k / 2.0,
				q.y - CITIZEN_FRAME.y * k + TILE_H * 0.3
			)
			parent.add_child(s)


## Scatter clutter across the ground: trees on woodland, rock on high ground.
##
## Same trick the top-down build ended up using. Terrain painted as a tile shows
## its grid however good the tile is, because every feature lands on the same
## lattice. Scattering props at positions that ignore tile edges is what breaks
## it up, and it is also what tells hills apart from sand once the grey road
## tiles are off the table.
func _draw_clutter(parent: Node2D) -> void:
	var forest_sheet: Texture2D = load(FOREST_SHEET)
	var rng := RandomNumberGenerator.new()
	rng.seed = 7

	for ty in WorldMap.MAP_H:
		for tx in WorldMap.MAP_W:
			var t := world.at(tx, ty)
			var cells: Array
			var k := 0.8
			if t == WorldMap.FOREST:
				cells = TREE_CELLS
			elif t == WorldMap.HILLS:
				cells = ROCK_CELLS
				k = 0.62
			else:
				continue

			# Skip the odd tile so a wood or an outcrop thins at its edges
			# instead of ending on a hard line.
			if rng.randf() < 0.18:
				continue

			var cell: Vector2i = cells[rng.randi() % cells.size()]
			var s := Sprite2D.new()
			s.texture = forest_sheet
			s.region_enabled = true
			s.region_rect = Rect2(cell.x * PIXX_CELL, cell.y * PIXX_CELL, PIXX_CELL, PIXX_CELL)
			s.centered = false
			s.scale = Vector2(k, k)
			var q := to_screen(tx + rng.randf_range(-0.22, 0.22), ty + rng.randf_range(-0.22, 0.22))
			s.position = Vector2(
				q.x - PIXX_CELL * k / 2.0,
				q.y - PIXX_GROUND_Y * k
			)
			parent.add_child(s)
