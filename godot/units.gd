## Citizens: getting them to a job, moving them there, and telling the
## simulation what they add up to. Ported from src/units.ts.
##
## The contract with sim.gd is the same narrow one the TypeScript build uses.
## Once a frame, `sync_to_state` writes two things into the game state: how many
## of each building exist, and how many citizens are actually standing at a
## producing building, per resource. `Sim.derive` then runs exactly as it does
## headless. Nothing in here knows a rate.
##
## The one thing that is not a port is pathfinding. The TypeScript build hand
## rolls A* with its own binary heap, about a hundred lines. Godot ships
## AStarGrid2D, so that is all deleted.
class_name Units

## Tiles per second. Expressed in tiles rather than pixels so the numbers stay
## meaningful whatever the tile art is: a citizen crosses about two tiles a
## second on the way to a job and potters about at a third of that.
const SPEED := 1.9
const WORK_SPEED := 0.8
const IDLE_SPEED := 0.55

## Terrain a building's crew goes out to work on.
const WORKS_ON := {
	"camp": WorldMap.FOREST,
	"mine": WorldMap.HILLS,
	"farm": WorldMap.GRASS,
	"well": WorldMap.DESERT,
}

var world: WorldMap
var workers: Array[Dictionary] = []
var _grid := AStarGrid2D.new()
var _next_id := 1


func _init(w: WorldMap) -> void:
	world = w
	_grid.region = Rect2i(0, 0, WorldMap.MAP_W, WorldMap.MAP_H)
	_grid.cell_size = Vector2(1, 1)
	# Citizens walk the four cardinals, matching the TypeScript build so a
	# journey costs the same number of tiles in both.
	_grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_NEVER
	_grid.update()
	refresh_solid()


## Mark water and occupied tiles as impassable. Called once at startup and again
## whenever a building goes up or comes down.
func refresh_solid() -> void:
	for ty in WorldMap.MAP_H:
		for tx in WorldMap.MAP_W:
			_grid.set_point_solid(Vector2i(tx, ty), not world.walkable(tx, ty))


func tile_of(w: Dictionary) -> Vector2i:
	return Vector2i(
		clampi(int(w["pos"].x), 0, WorldMap.MAP_W - 1),
		clampi(int(w["pos"].y), 0, WorldMap.MAP_H - 1),
	)


## Walkable tiles bordering a building, which is as close as anyone can get.
func approach_tiles(p: Dictionary) -> Array[Vector2i]:
	var n := WorldMap.footprint(p["def"])
	var out: Array[Vector2i] = []
	for d in range(-1, n + 1):
		for c in [
			Vector2i(p["tx"] + d, p["ty"] - 1), Vector2i(p["tx"] + d, p["ty"] + n),
			Vector2i(p["tx"] - 1, p["ty"] + d), Vector2i(p["tx"] + n, p["ty"] + d),
		]:
			if world.walkable(c.x, c.y):
				out.append(c)
	return out


## Send one citizen to a building. Fails if it is full or unreachable, rather
## than leaving someone walking into a lake.
func post(w: Dictionary, target: Dictionary) -> bool:
	if posted_at(target["id"], w["id"]) >= slots_of(target["def"]):
		return false
	var from := tile_of(w)
	if _grid.is_point_solid(from):
		from = _nearest_open(from)

	var best: PackedVector2Array = PackedVector2Array()
	for goal in approach_tiles(target):
		var path := _grid.get_id_path(from, goal)
		if path.size() > 0 and (best.size() == 0 or path.size() < best.size()):
			var conv := PackedVector2Array()
			for step in path:
				conv.append(Vector2(step.x, step.y))
			best = conv
	if best.size() == 0:
		return false

	w["post"] = target["id"]
	w["phase"] = "walk"
	w["path"] = best
	return true


func _nearest_open(from: Vector2i) -> Vector2i:
	for r in range(1, 8):
		for dy in range(-r, r + 1):
			for dx in range(-r, r + 1):
				if absi(dx) != r and absi(dy) != r:
					continue
				if world.walkable(from.x + dx, from.y + dy):
					return Vector2i(from.x + dx, from.y + dy)
	return from


func unpost(w: Dictionary) -> void:
	w["post"] = 0
	w["phase"] = "idle"
	w["path"] = PackedVector2Array()
	w["tgt"] = Vector2.ZERO
	w["has_tgt"] = false


func posted_at(id: int, except_worker: int = -1) -> int:
	var n := 0
	for w in workers:
		if w["post"] == id and w["id"] != except_worker:
			n += 1
	return n


## Citizens actually standing at a building. This is what produces; the ones
## still walking are posted but earning nothing.
func working_at(id: int) -> int:
	var n := 0
	for w in workers:
		if w["post"] == id and w["phase"] == "work":
			n += 1
	return n


func slots_of(def: String) -> int:
	var b := Content.building(def)
	return b.get("produces", {}).get("slots", 0) if not b.is_empty() else 0


func idle_workers() -> Array:
	return workers.filter(func(w): return w["post"] == 0)


## Fill a building to its slot count from the nearest idle citizens.
func fill(target: Dictionary) -> int:
	var room := slots_of(target["def"]) - posted_at(target["id"])
	if room <= 0:
		return 0
	var c := Iso.tile_centre(target["tx"], target["ty"], WorldMap.footprint(target["def"]))
	var free := idle_workers()
	free.sort_custom(func(a, b): return a["pos"].distance_to(c) < b["pos"].distance_to(c))
	var sent := 0
	for w in free:
		if sent >= room:
			break
		if post(w, target):
			sent += 1
	return sent


func empty_building(id: int) -> void:
	for w in workers:
		if w["post"] == id:
			unpost(w)


## Spread every idle citizen over whatever posts are open.
func auto_post() -> int:
	var sent := 0
	for p in world.placements:
		if slots_of(p["def"]) > posted_at(p["id"]):
			sent += fill(p)
	return sent


func recall_all() -> void:
	for w in workers:
		unpost(w)


# --------------------------------------------------------------- movement

## Keep the number of citizens equal to the population the simulation grew.
func sync_workers(state: Dictionary) -> void:
	var want := maxi(0, int(floorf(state["citizens"])))

	while workers.size() > want:
		var idx := -1
		for i in workers.size():
			if workers[i]["post"] == 0:
				idx = i
				break
		workers.remove_at(idx if idx >= 0 else workers.size() - 1)

	if workers.size() < want:
		var home := {}
		for p in world.placements:
			if p["def"] == "city":
				home = p
				break
		var c: Vector2 = (
			Iso.tile_centre(home["tx"], home["ty"], WorldMap.footprint(home["def"]))
			if not home.is_empty()
			else Vector2(WorldMap.MAP_W / 2.0, WorldMap.MAP_H / 2.0)
		)
		while workers.size() < want:
			# Outside the walls, not inside them: a city covers three tiles.
			var a := randf() * TAU
			var d := 2.0 + randf() * 2.5
			workers.append({
				"id": _next_id,
				"pos": c + Vector2(cos(a), sin(a)) * d,
				"post": 0,
				"phase": "idle",
				"path": PackedVector2Array(),
				"tgt": Vector2.ZERO,
				"has_tgt": false,
				"wait": randf() * 3.0,
				"facing": randi() % 4,
				"anim": randf() * 4.0,
			})
			_next_id += 1


func update(delta: float) -> void:
	var cities: Array[Vector2] = []
	for p in world.placements:
		if p["def"] == "city":
			cities.append(Iso.tile_centre(p["tx"], p["ty"], WorldMap.footprint(p["def"])))

	for w in workers:
		w["anim"] += delta

		if w["post"] == 0:
			w["phase"] = "idle"
			_idle_about(w, cities, delta)
			continue

		var target := {}
		for p in world.placements:
			if p["id"] == w["post"]:
				target = p
				break
		if target.is_empty():
			unpost(w)
			continue

		if w["path"].size() > 0:
			_commute(w, delta)
			continue

		w["phase"] = "work"
		if _escape_if_stuck(w, delta):
			continue
		if w["wait"] > 0.0:
			w["wait"] -= delta
			continue
		if not w["has_tgt"]:
			w["tgt"] = _work_target(target)
			w["has_tgt"] = true
		if _step_toward(w, w["tgt"], WORK_SPEED, delta):
			w["has_tgt"] = false
			w["wait"] = 0.7 + randf() * 1.9


func _commute(w: Dictionary, delta: float) -> void:
	var budget := SPEED * delta
	while budget > 0.0 and w["path"].size() > 0:
		var step: Vector2 = w["path"][0] + Vector2(0.5, 0.5)
		var to: Vector2 = step - w["pos"]
		var d: float = to.length()
		if d <= budget:
			w["pos"] = step
			budget -= d
			var rest: PackedVector2Array = w["path"].duplicate()
			rest.remove_at(0)
			w["path"] = rest
		else:
			_face(w, to)
			w["pos"] += to.normalized() * budget
			budget = 0.0
	if w["path"].size() == 0:
		w["phase"] = "work"
		w["has_tgt"] = false
		w["wait"] = 0.0


## Somewhere for a working citizen to go next: a patch of the ground their
## building lives off, or a spot beside the building itself. Alternating
## between the two is what makes a site look worked rather than occupied.
func _work_target(p: Dictionary) -> Vector2:
	var n := WorldMap.footprint(p["def"])
	if WORKS_ON.has(p["def"]) and randf() < 0.62:
		var wants: int = WORKS_ON[p["def"]]
		for r in range(1, 5):
			var found: Array[Vector2i] = []
			for dy in range(-r, r + n + 1):
				for dx in range(-r, r + n + 1):
					var tx: int = p["tx"] + dx
					var ty: int = p["ty"] + dy
					if world.walkable(tx, ty) and world.at(tx, ty) == wants:
						found.append(Vector2i(tx, ty))
			if found.size() > 0:
				var c: Vector2i = found[randi() % found.size()]
				return Vector2(c.x + 0.2 + randf() * 0.6, c.y + 0.2 + randf() * 0.6)

	var mid := Iso.tile_centre(p["tx"], p["ty"], n)
	var a := randf() * TAU
	return mid + Vector2(cos(a), sin(a)) * (n / 2.0 + 0.3 + randf() * 0.5)


func _idle_about(w: Dictionary, cities: Array[Vector2], delta: float) -> void:
	if _escape_if_stuck(w, delta):
		return
	if w["wait"] > 0.0:
		w["wait"] -= delta
		return
	if not w["has_tgt"]:
		var home: Vector2 = w["pos"]
		var best := INF
		for c in cities:
			var d: float = c.distance_to(w["pos"])
			if d < best:
				best = d
				home = c
		for attempt in 8:
			var a := randf() * TAU
			var d := 0.6 + randf() * 4.0
			var q := home + Vector2(cos(a), sin(a)) * d
			if world.walkable(int(q.x), int(q.y)):
				w["tgt"] = q
				w["has_tgt"] = true
				break
		if not w["has_tgt"]:
			w["wait"] = 1.0
			return
	if _step_toward(w, w["tgt"], IDLE_SPEED, delta):
		w["has_tgt"] = false
		w["wait"] = 0.8 + randf() * 3.5


## Walk anyone standing on blocked ground out to the nearest open tile. People
## end up inside buildings legitimately, and a strict destination check would
## wall them in forever: the first step out of a building is still inside it.
func _escape_if_stuck(w: Dictionary, delta: float) -> bool:
	var here := tile_of(w)
	if world.walkable(here.x, here.y):
		return false
	var open := _nearest_open(here)
	var to: Vector2 = Vector2(open.x + 0.5, open.y + 0.5) - w["pos"]
	if to.length() > 0.001:
		w["pos"] += to.normalized() * (WORK_SPEED * delta)
	w["has_tgt"] = false
	w["wait"] = 0.0
	return true


## Step toward a point, refusing to walk onto blocked ground. These are short
## local hops, so they are straight lines rather than pathfound.
func _step_toward(w: Dictionary, tgt: Vector2, speed: float, delta: float) -> bool:
	var to: Vector2 = tgt - w["pos"]
	var d: float = to.length()
	if d < 0.05:
		return true
	var stride: float = minf(d, speed * delta)
	var next: Vector2 = w["pos"] + to.normalized() * stride
	if not world.walkable(int(next.x), int(next.y)):
		return true
	_face(w, to)
	w["pos"] = next
	return false


## Which of the four sprite facings best matches a heading. The sheet's rows run
## in the order the artist drew them, which is what the offsets here encode.
func _face(w: Dictionary, dir: Vector2) -> void:
	if absf(dir.x) > absf(dir.y):
		w["facing"] = 3 if dir.x > 0.0 else 1
	else:
		w["facing"] = 0 if dir.y > 0.0 else 2


# ------------------------------------------------------------- sim bridge

## Fold the map back into the shape sim.gd reads. Only citizens who have
## arrived count toward output; the ones still walking are paid nothing, which
## is the whole point of having a map.
func sync_to_state(state: Dictionary) -> void:
	var buildings := {}
	for p in world.placements:
		buildings[p["def"]] = buildings.get(p["def"], 0) + 1
	state["buildings"] = buildings

	for id in Content.RESOURCE_IDS:
		state["jobs"][id] = 0
	for w in workers:
		if w["phase"] != "work" or w["post"] == 0:
			continue
		for p in world.placements:
			if p["id"] == w["post"]:
				var def := Content.building(p["def"])
				if def.has("produces"):
					state["jobs"][def["produces"]["res"]] += 1
				break


func walking_count() -> int:
	var n := 0
	for w in workers:
		if w["phase"] == "walk":
			n += 1
	return n
