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
const AUTOSAVE_EVERY := 10.0

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
var _age_label: Label
var _advance_btn: Button
var _library_panel: PanelContainer
var _track_rows := {}      ## track id -> {level, cost, button}
var _build_buttons := {}   ## building id -> Button
var _building_nodes := {}   ## placement id -> Node2D
var _citizen_nodes := {}    ## worker id -> Sprite2D
var _citizen_sheet: Texture2D
var _dragging := false
var _since_save := 0.0


func _ready() -> void:
	randomize()
	# Godot does not send a close request unless asked, and without it a
	# window closed with the mouse would lose everything since the last
	# autosave.
	get_tree().set_auto_accept_quit(false)

	var saved := SaveGame.read()
	var restored := not saved.is_empty()
	if restored:
		world = saved["world"]
		state = saved["state"]
		units = Units.new(world)
	else:
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

	if restored:
		# The world came back with its buildings already in it, so they only
		# need drawing.
		for p in world.placements:
			_on_placed(p)
		units.restore(saved["people"])
	else:
		# The opening city, in the middle of the clearing the generator
		# guarantees.
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

	if restored:
		var away := Sim.offline_catch_up(
			state, (Time.get_unix_time_from_system() - saved["saved_at"]) * 1000.0
		)
		if away > 60.0:
			_say("Welcome back. Your nation worked for %s at half pace." % _duration(away))
		else:
			_say("Nation restored. %d citizens, %s." % [
				int(state["citizens"]), Content.AGES[state["age"]]["name"]
			])


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

	_since_save += delta
	if _since_save >= AUTOSAVE_EVERY:
		_since_save = 0.0
		SaveGame.write(state, world, units)


## Closing the window is the commonest way to stop playing, so it saves.
func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		SaveGame.write(state, world, units)
		get_tree().quit()


func _duration(seconds: float) -> String:
	var h := int(seconds / 3600.0)
	var m := int(fmod(seconds, 3600.0) / 60.0)
	return ("%dh %02dm" % [h, m]) if h > 0 else ("%dm" % m)


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

	# Population sits with the resources rather than in the opposite corner.
	# Top-centre and top-right collided, because the advance button's label
	# grows to explain itself and pushed straight into the readout.
	col.add_child(HSeparator.new())
	_pop_label = Label.new()
	_pop_label.add_theme_font_size_override("font_size", 13)
	col.add_child(_pop_label)

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
		_build_buttons[b["id"]] = btn

	_hint = Label.new()
	_hint.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_hint.position = Vector2(8, -66)
	_hint.add_theme_font_size_override("font_size", 12)
	_hud.add_child(_hint)
	_say("Pick a building, then click the ground. Drag to pan, wheel to zoom.")

	_build_age_banner()
	_build_library()


## The age, and the button out of it, centred above the map.
func _build_age_banner() -> void:
	var box := HBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER_TOP)
	box.position = Vector2(-190, 8)
	box.custom_minimum_size = Vector2(380, 0)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 10)
	_hud.add_child(box)

	_age_label = Label.new()
	_age_label.add_theme_font_size_override("font_size", 16)
	box.add_child(_age_label)

	_advance_btn = Button.new()
	_advance_btn.text = "Advance the age"
	_advance_btn.add_theme_font_size_override("font_size", 12)
	_advance_btn.pressed.connect(_on_advance)
	box.add_child(_advance_btn)

	var lib_btn := Button.new()
	lib_btn.text = "Library"
	lib_btn.add_theme_font_size_override("font_size", 12)
	lib_btn.pressed.connect(func(): _library_panel.visible = not _library_panel.visible)
	box.add_child(lib_btn)


## Four tracks, one level per age. Leaving an age needs three of the four
## standing at the level that matches it, which is what stops a player rushing
## one track and skipping the tree.
func _build_library() -> void:
	_library_panel = PanelContainer.new()
	_library_panel.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_library_panel.position = Vector2(-210, 44)
	_library_panel.custom_minimum_size = Vector2(420, 0)
	_library_panel.visible = false
	_hud.add_child(_library_panel)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 3)
	_library_panel.add_child(col)

	var head := Label.new()
	head.text = "The Library: three of four tracks must match the age you are leaving."
	head.add_theme_font_size_override("font_size", 11)
	col.add_child(head)

	for id in Content.TRACK_IDS:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		col.add_child(row)

		var name_label := Label.new()
		name_label.custom_minimum_size = Vector2(150, 0)
		name_label.add_theme_font_size_override("font_size", 12)
		row.add_child(name_label)

		var cost_label := Label.new()
		cost_label.custom_minimum_size = Vector2(180, 0)
		cost_label.add_theme_font_size_override("font_size", 11)
		row.add_child(cost_label)

		var btn := Button.new()
		btn.text = "Research"
		btn.add_theme_font_size_override("font_size", 11)
		btn.pressed.connect(_on_research.bind(id))
		row.add_child(btn)

		_track_rows[id] = {"name": name_label, "cost": cost_label, "button": btn}


func _on_research(id: String) -> void:
	if Sim.research(state, id):
		_say("%s reaches level %d." % [Content.TRACKS[id]["name"], state["tracks"][id]])
	else:
		_say("Cannot research %s yet." % Content.TRACKS[id]["name"])


## Advancing multiplies every building's output and every store by 3.2. That
## step is what meets age prices climbing roughly six-fold a rung.
func _on_advance() -> void:
	var was: int = state["age"]
	if Sim.advance_age(state):
		_say("Your nation enters the %s. Output and storage x%.1f." % [
			Content.AGES[state["age"]]["name"], Sim.AGE_OUTPUT_STEP
		])
	elif not Sim.tracks_ready(state):
		_say("The library is not ready: %d of 4 tracks at level %d." % [
			_tracks_at_level(was + 1), was + 1
		])
	else:
		_say("Not enough in store to advance the age.")


func _tracks_at_level(level: int) -> int:
	var n := 0
	for id in Content.TRACK_IDS:
		if state["tracks"][id] >= level:
			n += 1
	return n


## A cost as "400 food, 150 metal", short enough for a button label.
func _cost_text(cost: Dictionary) -> String:
	var parts := []
	for r in cost:
		parts.append("%s %s" % [_short(cost[r]), r])
	return ", ".join(parts)


## Compact numbers, because by the Industrial Age these run to eight digits.
func _short(v: float) -> String:
	if v >= 1e6:
		return "%.1fM" % (v / 1e6)
	if v >= 1e3:
		return "%.1fK" % (v / 1e3)
	return "%.0f" % v


func _say(msg: String) -> void:
	if _hint:
		_hint.text = msg


func _update_hud() -> void:
	var d := Sim.derive(state)
	for id in Content.RESOURCE_IDS:
		var net: float = d["net"][id]
		_res_labels[id].text = "%-10s %8s /%-8s %+.2f/s" % [
			Content.RESOURCES[id]["name"], _short(state["res"][id]), _short(d["caps"][id]), net
		]
		_res_labels[id].modulate = Color(1, 0.7, 0.6) if net < 0.0 else Color(1, 1, 1)

	_pop_label.text = "%d / %d citizens  %d idle  %d walking" % [
		int(state["citizens"]), int(d["pop_cap"]), int(d["idle"]), units.walking_count()
	]

	_update_age(d)
	_update_library(d)
	_update_build_bar(d)


func _update_age(d: Dictionary) -> void:
	var age: int = state["age"]
	_age_label.text = "%s   (%d/%d build slots)" % [
		Content.AGES[age]["name"], int(d["build_used"]), int(d["build_cap"])
	]

	if age >= Content.MAX_AGE:
		_advance_btn.text = "Final age"
		_advance_btn.disabled = true
		return

	var ready := Sim.tracks_ready(state)
	var cost := Sim.age_cost(state, d)
	var afford := Sim.can_afford(state, cost)
	_advance_btn.disabled = not (ready and afford)
	if not ready:
		_advance_btn.text = "Library not ready (%d/%d)" % [
			_tracks_at_level(age + 1), Content.TRACKS_NEEDED_TO_ADVANCE
		]
		_advance_btn.tooltip_text = "Needs %d of 4 tracks at level %d." % [
			Content.TRACKS_NEEDED_TO_ADVANCE, age + 1
		]
	else:
		_advance_btn.text = "Advance: %s" % _cost_text(cost)


func _update_library(d: Dictionary) -> void:
	if not _library_panel.visible:
		return
	for id in Content.TRACK_IDS:
		var row: Dictionary = _track_rows[id]
		var level: int = state["tracks"][id]
		row["name"].text = "%s  level %d" % [Content.TRACKS[id]["name"], level]

		# A track can only ever run one level ahead of nothing: level N needs
		# age N-1, so the four cannot be rushed apart.
		if level >= Content.MAX_TRACK_LEVEL:
			row["cost"].text = "complete"
			row["button"].disabled = true
			continue
		if level > state["age"]:
			row["cost"].text = "needs the next age"
			row["button"].disabled = true
			continue

		var cost := Sim.track_cost(state, id, d)
		row["cost"].text = _cost_text(cost)
		row["button"].disabled = not Sim.can_afford(state, cost)


## Grey out what cannot be built, and say why in the tooltip rather than
## leaving a dead button with no explanation.
func _update_build_bar(d: Dictionary) -> void:
	for id in _build_buttons:
		var def := Content.building(id)
		var btn: Button = _build_buttons[id]
		if def["age"] > state["age"]:
			btn.disabled = true
			btn.tooltip_text = "Unlocks in the %s" % Content.AGES[def["age"]]["name"]
			continue
		var cost := Sim.building_cost(state, id, d)
		var afford := Sim.can_afford(state, cost)
		var room: bool = def.get("free_of_build_cap", false) or d["build_used"] < d["build_cap"]
		btn.disabled = not (afford and room)
		if not room:
			btn.tooltip_text = "No build slots left. Found another city."
		else:
			btn.tooltip_text = "%s
%s" % [_cost_text(cost), "" if afford else "Not enough in store"]
