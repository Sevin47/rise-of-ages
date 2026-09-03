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
	WorldMap.HILLS: ["res://assets/land/095.png"],   # bare stone plateau
	WorldMap.DESERT: ["res://assets/land/059.png"],  # sand
}

## The buildings pack is modular: a storey and a roof, stacked. One of each
## makes a whole building, which is why these come in pairs.
const BUILDING_ART := {
	"city": ["res://assets/build/041.png", "res://assets/build/090.png"],
	"farm": ["res://assets/build/023.png", "res://assets/build/069.png"],
	"camp": ["res://assets/build/045.png", "res://assets/build/083.png"],
	"mine": ["res://assets/build/035.png", "res://assets/build/080.png"],
	"market": ["res://assets/build/026.png", "res://assets/build/070.png"],
	"library": ["res://assets/build/052.png", "res://assets/build/091.png"],
	"temple": ["res://assets/build/049.png", "res://assets/build/082.png"],
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

## A tree lifted out of the same pack's village tileset, for woodland.
const VILLAGE_SHEET := "res://assets/pixx/village.png"
const TREE_CELL := Vector2i(6, 1)   # column, row in the 7x7 grid of 128px cells

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
	_draw_trees(root2d)
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


func _draw_buildings(parent: Node2D, built: Array[Dictionary]) -> void:
	for p in built:
		var pair: Array = BUILDING_ART.get(p["def"], BUILDING_ART["farm"])
		var n := WorldMap.footprint(p["def"])
		# Sit it on the centre of its footprint. The sum of the coordinates is
		# the sort key, so a building drawn at its centre correctly overlaps the
		# ground behind it and is overlapped by whatever is in front.
		var mid := to_screen(p["tx"] + (n - 1) / 2.0, p["ty"] + (n - 1) / 2.0)

		var storey: Texture2D = load(pair[0])
		var floor_sprite := Sprite2D.new()
		floor_sprite.texture = storey
		floor_sprite.centered = false
		floor_sprite.position = ground_anchor(storey, mid)
		parent.add_child(floor_sprite)

		# The roof stacks on top of the storey, one wall height up.
		var roof: Texture2D = load(pair[1])
		var roof_sprite := Sprite2D.new()
		roof_sprite.texture = roof
		roof_sprite.centered = false
		roof_sprite.position = ground_anchor(roof, mid) - Vector2(0.0, WALL_HEIGHT)
		parent.add_child(roof_sprite)


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


## Scatter woodland across forest tiles, so a wood reads as trees rather than
## as a green mound.
func _draw_trees(parent: Node2D) -> void:
	var sheet: Texture2D = load(VILLAGE_SHEET)
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for ty in WorldMap.MAP_H:
		for tx in WorldMap.MAP_W:
			if world.at(tx, ty) != WorldMap.FOREST:
				continue
			var s := Sprite2D.new()
			s.texture = sheet
			s.region_enabled = true
			s.region_rect = Rect2(TREE_CELL.x * 128, TREE_CELL.y * 128, 128, 128)
			s.centered = false
			var q := to_screen(tx + rng.randf_range(-0.2, 0.2), ty + rng.randf_range(-0.2, 0.2))
			s.scale = Vector2(0.8, 0.8)
			s.position = Vector2(q.x - 128 * 0.8 / 2.0, q.y - 128 * 0.8 + TILE_H * 0.5)
			parent.add_child(s)
