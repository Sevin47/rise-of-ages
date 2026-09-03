## The playable scene: the ported economy, running on a map you can build on.
##
## The seam is the same one the TypeScript build uses and it is worth restating,
## because it is the reason any of this was portable. `Sim` reads exactly two
## things out of the game state: how many of each building exist, and how many
## citizens are posted per resource. Every frame `Units.sync_to_state` writes
## those two numbers from what is actually on the ground, then `Sim.tick` runs.
## The simulation has never heard of a map, a tile or a sprite.
extends Node2D

const START_ZOOM := 0.62
const PAN_SPEED := 900.0

var world: WorldMap
var units: Units
var state: Dictionary

## Building the player has armed for placement, or "" for none.
var ghost_def := ""
var ghost_tile := Vector2i(-1, -1)
var ghost_ok := false

var _ground: Node2D
var _entities: Node2D
var _ghost_node: Node2D
var _camera: Camera2D
var _hud: Control
var _res_labels := {}
var _pop_label: Label
var _hint: Label
var _building_nodes := {}   ## placement id -> Node2D
var _citizen_nodes := {}    ## worker id -> Sprite2D
var _citizen_sheet: Texture2D
var _dragging := false


func _ready() -> void:
	randomize()
	world = WorldMap.new()
	state = Sim.new_game()
	units = Units.new(world)
	_citizen_sheet = load(IsoArt.CITIZEN_SHEET)

	_ground = Node2D.new()
	add_child(_ground)
	_entities = Node2D.new()
	# Godot sorts children of a y-sorted node by their Y before drawing, which
	# is exactly the painter's order isometric needs.
	_entities.y_sort_enabled = true
	add_child(_entities)

	_paint_ground()
	_paint_clutter()

	# The opening city, in the middle of the clearing the generator guarantees.
	var c := Vector2i(WorldMap.MAP_W / 2 - 1, WorldMap.MAP_H / 2 - 1)
	if world.place("city", c.x, c.y) != 0:
		_on_placed(world.placements[-1])

	_camera = Camera2D.new()
	_camera.position = Iso.to_screen(WorldMap.MAP_W / 2.0, WorldMap.MAP_H / 2.0)
	_camera.zoom = Vector2(START_ZOOM, START_ZOOM)
	add_child(_camera)
	_camera.make_current()

	_build_hud()
	units.sync_workers(state)
	units.sync_to_state(state)


# ------------------------------------------------------------------ loop

func _process(delta: float) -> void:
	_pan_from_keys(delta)

	# Order matters: the map decides what exists and who is working, then the
	# economy runs on those numbers.
	units.sync_workers(state)
	units.update(delta)
	units.sync_to_state(state)
	Sim.tick(state, delta)

	_sync_citizen_nodes()
	_update_hud()


func _pan_from_keys(delta: float) -> void:
	var dir := Vector2(
		Input.get_axis("ui_left", "ui_right"),
		Input.get_axis("ui_up", "ui_down")
	)
	if dir != Vector2.ZERO:
		_camera.position += dir * (PAN_SPEED * delta / _camera.zoom.x)


# ----------------------------------------------------------- static art

func _paint_ground() -> void:
	for ty in WorldMap.MAP_H:
		for tx in WorldMap.MAP_W:
			var tex: Texture2D = load(IsoArt.LAND[world.at(tx, ty)])
			var s := Sprite2D.new()
			s.texture = tex
			s.centered = false
			s.position = IsoArt.ground_anchor(tex, Iso.to_screen(tx, ty))
			# Ground is always behind everything, so it is deliberately not in
			# the y-sorted layer: sorting three thousand static tiles every
			# frame would cost real time and buy nothing.
			_ground.add_child(s)


## Trees on woodland, rock on high ground.
##
## Terrain painted as a tile shows its grid however good the tile is, because
## every feature lands on the same lattice. Props at positions that ignore tile
## edges are what break it up, and here they also tell hills from sand, since
## every grey tile in the landscape pack turned out to carry a road.
func _paint_clutter() -> void:
	var sheet: Texture2D = load(IsoArt.FOREST_SHEET)
	for ty in WorldMap.MAP_H:
		for tx in WorldMap.MAP_W:
			var t := world.at(tx, ty)
			var cells: Array
			var k := 0.8
			if t == WorldMap.FOREST:
				cells = IsoArt.TREE_CELLS
			elif t == WorldMap.HILLS:
				cells = IsoArt.ROCK_CELLS
				k = 0.62
			else:
				continue
			# Skip the odd tile so a wood thins at its edges rather than ending
			# on a hard line.
			if randf() < 0.18:
				continue

			var cell: Vector2i = cells[randi() % cells.size()]
			var s := Sprite2D.new()
			s.texture = sheet
			s.region_enabled = true
			s.region_rect = Rect2(
				cell.x * IsoArt.PIXX_CELL, cell.y * IsoArt.PIXX_CELL,
				IsoArt.PIXX_CELL, IsoArt.PIXX_CELL
			)
			s.centered = false
			s.scale = Vector2(k, k)
			var q := Iso.to_screen(tx + randf_range(-0.22, 0.22), ty + randf_range(-0.22, 0.22))
			s.position = Vector2(q.x - IsoArt.PIXX_CELL * k / 2.0, q.y - IsoArt.PIXX_GROUND_Y * k)
			_entities.add_child(s)


func _on_placed(p: Dictionary) -> void:
	var node := IsoArt.make_building(p["def"], p["tx"], p["ty"])
	_entities.add_child(node)
	_building_nodes[p["id"]] = node
	# A new building blocks the tiles it stands on, so routes have to change.
	units.refresh_solid()


# -------------------------------------------------------------- citizens

func _sync_citizen_nodes() -> void:
	var seen := {}
	for w in units.workers:
		seen[w["id"]] = true
		var s: Sprite2D = _citizen_nodes.get(w["id"])
		if s == null:
			s = Sprite2D.new()
			s.texture = _citizen_sheet
			s.region_enabled = true
			s.centered = false
			s.scale = Vector2(IsoArt.CITIZEN_K, IsoArt.CITIZEN_K)
			_entities.add_child(s)
			_citizen_nodes[w["id"]] = s
		# Walking citizens cycle their frames; standing ones hold one.
		var frame := int(w["anim"] * 6.0) if w["phase"] != "idle" else 0
		s.region_rect = IsoArt.citizen_region(w["facing"], frame)
		s.position = IsoArt.citizen_anchor(Iso.to_screen(w["pos"].x, w["pos"].y))

	for id in _citizen_nodes.keys():
		if not seen.has(id):
			_citizen_nodes[id].queue_free()
			_citizen_nodes.erase(id)


# ----------------------------------------------------------------- input

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			_camera.zoom *= 1.1
			_camera.zoom = _camera.zoom.clamp(Vector2(0.25, 0.25), Vector2(2.0, 2.0))
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			_camera.zoom *= 0.9
			_camera.zoom = _camera.zoom.clamp(Vector2(0.25, 0.25), Vector2(2.0, 2.0))
		elif event.button_index == MOUSE_BUTTON_RIGHT and event.pressed:
			_set_ghost("")
		elif event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				_dragging = true
			else:
				_dragging = false
				if ghost_def != "":
					_try_place()
				else:
					_select_at_mouse()

	elif event is InputEventMouseMotion:
		if _dragging and event.relative.length() > 1.0:
			_camera.position -= event.relative / _camera.zoom.x
		_update_ghost()


func _mouse_tile() -> Vector2i:
	var t := Iso.to_tile(get_global_mouse_position())
	return Vector2i(int(floorf(t.x)), int(floorf(t.y)))


func _set_ghost(def: String) -> void:
	ghost_def = "" if def == ghost_def else def
	if _ghost_node:
		_ghost_node.queue_free()
		_ghost_node = null
	if ghost_def != "":
		_update_ghost()


func _update_ghost() -> void:
	if ghost_def == "":
		return
	var t := _mouse_tile()
	var n := WorldMap.footprint(ghost_def)
	# Offset so the footprint sits under the cursor rather than beside it.
	t -= Vector2i(n >> 1, n >> 1)
	if t == ghost_tile and _ghost_node:
		return
	ghost_tile = t
	ghost_ok = world.placement_error(ghost_def, t.x, t.y) == ""

	if _ghost_node:
		_ghost_node.queue_free()
	_ghost_node = IsoArt.make_building(ghost_def, t.x, t.y)
	_ghost_node.modulate = (
		Color(0.55, 1.0, 0.55, 0.65) if ghost_ok else Color(1.0, 0.45, 0.4, 0.6)
	)
	_entities.add_child(_ghost_node)


## Pay for a building and raise it. Placement is checked first, so an illegal
## spot never costs anything.
func _try_place() -> void:
	var t := ghost_tile
	var err := world.placement_error(ghost_def, t.x, t.y)
	if err != "":
		_say("A %s cannot stand there (%s)." % [ghost_def, err])
		return
	if not Sim.build_pay(state, ghost_def):
		_say("Not enough in store for a %s yet." % ghost_def)
		return
	if world.place(ghost_def, t.x, t.y) == 0:
		return

	var p: Dictionary = world.placements[-1]
	_on_placed(p)
	units.sync_to_state(state)
	# Staffing a new site immediately is what you want nine times in ten.
	units.fill(p)
	_say("%s built." % ghost_def.capitalize())
	if not Input.is_key_pressed(KEY_SHIFT):
		_set_ghost("")


func _select_at_mouse() -> void:
	var t := _mouse_tile()
	var id := world.occupant(t.x, t.y)
	if id == 0:
		return
	for p in world.placements:
		if p["id"] == id:
			var posted := units.posted_at(id)
			var slots := units.slots_of(p["def"])
			if slots > 0 and posted < slots:
				units.fill(p)
				_say("%s: %d of %d posts filled." % [p["def"].capitalize(), units.posted_at(id), slots])
			elif slots > 0:
				units.empty_building(id)
				_say("%s emptied." % p["def"].capitalize())
			else:
				_say("%s takes no citizens." % p["def"].capitalize())
			return


# ------------------------------------------------------------------- hud

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	_hud = Control.new()
	_hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	_hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(_hud)

	# Resources, top left.
	var res_panel := PanelContainer.new()
	res_panel.position = Vector2(8, 8)
	res_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud.add_child(res_panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 1)
	res_panel.add_child(col)
	for id in Content.RESOURCE_IDS:
		var l := Label.new()
		l.add_theme_font_size_override("font_size", 13)
		col.add_child(l)
		_res_labels[id] = l

	# Population, top right.
	_pop_label = Label.new()
	# Anchored to the right edge and grown leftwards. Anchoring it to the
	# corner and letting it run right just pushed the text off screen.
	_pop_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_pop_label.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_pop_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_pop_label.position = Vector2(-360, 10)
	_pop_label.custom_minimum_size = Vector2(350, 0)
	_pop_label.add_theme_font_size_override("font_size", 14)
	_hud.add_child(_pop_label)

	# Build bar along the bottom.
	var bar := HBoxContainer.new()
	bar.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	bar.position = Vector2(8, -44)
	bar.add_theme_constant_override("separation", 4)
	_hud.add_child(bar)
	for b in Content.BUILDINGS:
		if b["id"] == "city":
			continue
		var btn := Button.new()
		btn.text = b["id"].capitalize()
		btn.add_theme_font_size_override("font_size", 12)
		btn.pressed.connect(_set_ghost.bind(b["id"]))
		bar.add_child(btn)

	_hint = Label.new()
	_hint.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_hint.position = Vector2(8, -66)
	_hint.add_theme_font_size_override("font_size", 12)
	_hud.add_child(_hint)
	_say("Pick a building, then click the ground. Drag to pan, wheel to zoom.")


func _say(msg: String) -> void:
	if _hint:
		_hint.text = msg


func _update_hud() -> void:
	var d := Sim.derive(state)
	for id in Content.RESOURCE_IDS:
		var net: float = d["net"][id]
		_res_labels[id].text = "%-10s %8.0f /%-8.0f %+.2f/s" % [
			Content.RESOURCES[id]["name"], state["res"][id], d["caps"][id], net
		]
		_res_labels[id].modulate = Color(1, 0.7, 0.6) if net < 0.0 else Color(1, 1, 1)

	_pop_label.text = "%d / %d citizens   %d idle   %d walking" % [
		int(state["citizens"]), int(d["pop_cap"]), int(d["idle"]), units.walking_count()
	]
