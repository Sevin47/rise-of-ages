## Terrain generation, ported from src/map.ts.
##
## Same value noise, same thresholds, same guaranteed clearing, so a given seed
## produces the same world in both ports. The only thing that changes on this
## side is how it is drawn: the TypeScript build paints tiles into a canvas,
## while here the terrain grid feeds a TileMapLayer with an isometric tile
## shape, and Godot does the projection.
class_name WorldMap

const MAP_W := 64
const MAP_H := 44

enum { WATER, GRASS, FOREST, HILLS, DESERT }

var seed_value: int
var terrain: PackedByteArray
var placements: Array[Dictionary] = []
var _next_placement := 1


## Terrain each building must stand on. Anything else is an illegal placement.
const NEEDS := {
	"camp": FOREST,
	"mine": HILLS,
	"well": DESERT,
	"farm": GRASS,
}


static func footprint(def: String) -> int:
	return 3 if def == "city" else 2


func _init(world_seed: int = -1) -> void:
	seed_value = world_seed if world_seed >= 0 else randi() % 2147483647
	terrain = _generate(seed_value)
	_clearing(MAP_W / 2, MAP_H / 2, 5)

	# Guarantee the two terrains the opening buildings need are within reach of
	# that clearing, so a Camp and a Mine are always placeable from turn one.
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value ^ 0x9e3779b9
	_ring(rng, FOREST, 3, 6, 9)
	_ring(rng, HILLS, 2, 7, 10)


func at(tx: int, ty: int) -> int:
	if tx < 0 or ty < 0 or tx >= MAP_W or ty >= MAP_H:
		return WATER
	return terrain[ty * MAP_W + tx]


## Water is the only terrain nobody can cross; buildings block everything else.
func walkable(tx: int, ty: int) -> bool:
	if tx < 0 or ty < 0 or tx >= MAP_W or ty >= MAP_H:
		return false
	if terrain[ty * MAP_W + tx] == WATER:
		return false
	return occupant(tx, ty) == 0


func occupant(tx: int, ty: int) -> int:
	for p in placements:
		var n := footprint(p["def"])
		if tx >= p["tx"] and tx < p["tx"] + n and ty >= p["ty"] and ty < p["ty"] + n:
			return p["id"]
	return 0


# --------------------------------------------------------------- generation

## Value noise: one coarse grid of random values, smoothly interpolated. Cheap,
## deterministic, and it gives blobs that read as terrain rather than the
## salt-and-pepper of per-tile randomness.
func _noise(rng: RandomNumberGenerator, cols: int, rows: int) -> Callable:
	var grid := PackedFloat32Array()
	grid.resize((cols + 1) * (rows + 1))
	for i in grid.size():
		grid[i] = rng.randf()

	return func(x: float, y: float) -> float:
		var gx := (x / float(MAP_W)) * cols
		var gy := (y / float(MAP_H)) * rows
		var x0 := int(gx)
		var y0 := int(gy)
		var fx := gx - x0
		var fy := gy - y0
		fx = fx * fx * (3.0 - 2.0 * fx)
		fy = fy * fy * (3.0 - 2.0 * fy)
		var at_grid := func(cx: int, cy: int) -> float:
			return grid[mini(rows, cy) * (cols + 1) + mini(cols, cx)]
		var top: float = at_grid.call(x0, y0) * (1.0 - fx) + at_grid.call(x0 + 1, y0) * fx
		var bot: float = at_grid.call(x0, y0 + 1) * (1.0 - fx) + at_grid.call(x0 + 1, y0 + 1) * fx
		return top * (1.0 - fy) + bot * fy


func _generate(s: int) -> PackedByteArray:
	var rng := RandomNumberGenerator.new()
	rng.seed = s
	var water := _noise(rng, 5, 4)
	var wood := _noise(rng, 7, 5)
	var rock := _noise(rng, 9, 6)
	var dry := _noise(rng, 4, 3)

	var out := PackedByteArray()
	out.resize(MAP_W * MAP_H)
	for ty in MAP_H:
		for tx in MAP_W:
			var t := GRASS
			if water.call(tx, ty) < 0.3:
				t = WATER
			elif rock.call(tx, ty) > 0.72:
				t = HILLS
			elif wood.call(tx, ty) > 0.62:
				t = FOREST
			elif dry.call(tx, ty) > 0.74:
				t = DESERT
			out[ty * MAP_W + tx] = t
	return out


## Flatten a landing site so the opening move is never blocked by the terrain
## roll. The first city has to have somewhere to stand.
func _clearing(cx: int, cy: int, r: int) -> void:
	for ty in range(cy - r, cy + r + 1):
		for tx in range(cx - r, cx + r + 1):
			if tx < 0 or ty < 0 or tx >= MAP_W or ty >= MAP_H:
				continue
			if Vector2(tx - cx, ty - cy).length() > r:
				continue
			terrain[ty * MAP_W + tx] = GRASS


func _ring(rng: RandomNumberGenerator, t: int, count: int, lo: float, hi: float) -> void:
	var cx := MAP_W / 2
	var cy := MAP_H / 2
	for n in count:
		var a := rng.randf() * TAU
		var d := lo + rng.randf() * (hi - lo)
		var tx := int(round(cx + cos(a) * d))
		var ty := int(round(cy + sin(a) * d))
		for dy in range(-1, 2):
			for dx in range(-1, 2):
				var x := tx + dx
				var y := ty + dy
				if x < 1 or y < 1 or x >= MAP_W - 1 or y >= MAP_H - 1:
					continue
				terrain[y * MAP_W + x] = t


# --------------------------------------------------------------- placement

func placement_error(def: String, tx: int, ty: int) -> String:
	var n := footprint(def)
	for y in range(ty, ty + n):
		for x in range(tx, tx + n):
			if x < 0 or y < 0 or x >= MAP_W or y >= MAP_H:
				return "edge"
			if occupant(x, y) != 0:
				return "taken"
			var t := at(x, y)
			if t == WATER:
				return "ground"
			if NEEDS.has(def):
				if t != NEEDS[def]:
					return "ground"
			elif t != GRASS and t != DESERT:
				return "ground"
	return ""


func place(def: String, tx: int, ty: int) -> int:
	if placement_error(def, tx, ty) != "":
		return 0
	var id := _next_placement
	_next_placement += 1
	placements.append({"id": id, "def": def, "tx": tx, "ty": ty})
	return id


## Placement ids have to survive a save, because citizens refer to buildings by
## id: restore the counter too low and the next building reuses an id someone is
## already posted to.
func next_placement() -> int:
	return _next_placement


func set_next_placement(v: int) -> void:
	_next_placement = maxi(v, 1)
	for p in placements:
		_next_placement = maxi(_next_placement, p["id"] + 1)


## First legal spot for a building, searched outward from the clearing. Used by
## the spike to populate a world without a player.
func find_spot(def: String) -> Vector2i:
	var cx := MAP_W / 2
	var cy := MAP_H / 2
	for r in range(2, 22):
		for dy in range(-r, r + 1):
			for dx in range(-r, r + 1):
				if absi(dx) != r and absi(dy) != r:
					continue
				if placement_error(def, cx + dx, cy + dy) == "":
					return Vector2i(cx + dx, cy + dy)
	return Vector2i(-1, -1)
