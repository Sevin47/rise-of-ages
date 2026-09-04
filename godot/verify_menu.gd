## Checks the menu, and above all the invariant it exists to protect: while the
## menu is up nothing must be able to write over the save that Continue is
## offering.
##
##   godot --path godot --script verify_menu.gd
extends SceneTree

var main: Node
var failures := 0


func check(name: String, ok: bool, detail: String = "") -> void:
	if not ok:
		failures += 1
	print("  %s %-28s %s" % ["ok  " if ok else "FAIL", name, detail])


func _init() -> void:
	SaveGame.erase()

	main = load("res://main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	await process_frame

	print("cold start")
	check("no save on disk", not SaveGame.has_save())
	check("continue disabled", main._continue_btn.disabled)
	check("says so", main._summary.text.contains("No nation"), main._summary.text)
	check("no game running", _game_children() == 0, "%d game node(s)" % _game_children())

	# --- new nation ------------------------------------------------------
	print("new nation")
	main._on_new_pressed()          # no save yet, so it starts without asking
	await process_frame
	check("game started", _game_children() == 1)
	var game: Node2D = main._game
	check("started fresh", game.start_new)

	for id in Content.RESOURCE_IDS:
		game.state["res"][id] = 5.0e5
	for def in ["farm", "camp"]:
		var spot: Vector2i = game.world.find_spot(def)
		if spot.x >= 0:
			game.ghost_def = def
			game.ghost_tile = spot
			game._try_place()
	await _run(game, 8.0)

	var citizens: float = game.state["citizens"]
	var buildings: int = game.world.placements.size()
	print("           %d citizens, %d buildings" % [int(citizens), buildings])

	# --- back to the menu ------------------------------------------------
	print("leaving")
	game.leave_to_menu()
	await process_frame
	await process_frame
	check("game gone", _game_children() == 0, "%d game node(s)" % _game_children())
	check("saved on the way out", SaveGame.has_save())
	check("continue enabled", not main._continue_btn.disabled)
	check("summary reads back",
		main._summary.text.contains("%d citizens" % int(citizens)), main._summary.text)

	# The invariant. Sit on the menu for longer than the ten-second autosave
	# interval and the save must be untouched, because there is nothing running
	# to touch it.
	var stamp: float = SaveGame.peek()["saved_at"]
	var idle := 0.0
	while idle < 14.0:
		await process_frame
		idle += 0.05
		if _game_children() != 0:
			break
	check("nothing ran while idle", _game_children() == 0)
	check("save untouched by menu",
		is_equal_approx(SaveGame.peek()["saved_at"], stamp), "timestamp unchanged")

	# --- continue --------------------------------------------------------
	print("continue")
	main._on_continue()
	await process_frame
	await process_frame
	var game2: Node2D = main._game
	check("game restored", game2 != null and is_instance_valid(game2))
	check("not fresh", not game2.start_new)
	# Within a frame's growth, not exactly equal: the scene has already ticked
	# twice by the time this reads it. Exact field-by-field equality across a
	# save is verify_save.gd's job; the claim here is only that Continue came
	# back to the same nation rather than a new one.
	check("citizens carried", absf(game2.state["citizens"] - citizens) < 0.1,
		"%.2f vs %.2f saved" % [game2.state["citizens"], citizens])
	check("buildings carried", game2.world.placements.size() == buildings,
		"%d" % game2.world.placements.size())
	check("people carried", game2.units.workers.size() > 0,
		"%d citizens on the map" % game2.units.workers.size())

	# --- new over an existing nation --------------------------------------
	# This is the destructive one, so it must ask, and then it must really
	# replace what was there rather than quietly resuming it.
	print("replacing")
	game2.leave_to_menu()
	await process_frame
	await process_frame
	main._on_new_pressed()
	check("asks before replacing", main._confirm.visible)
	check("nothing started yet", _game_children() == 0)
	main._confirm.hide()
	main._start(true)
	await process_frame
	await process_frame
	var game3: Node2D = main._game
	# On disk too, immediately, not at the first autosave.
	var on_disk := SaveGame.peek()
	check("disk replaced at once", on_disk["citizens"] < int(citizens),
		"%d citizens saved, was %d" % [on_disk["citizens"], int(citizens)])
	check("nation replaced", game3.world.placements.size() < buildings,
		"%d buildings, was %d" % [game3.world.placements.size(), buildings])
	check("population reset", game3.state["citizens"] < citizens,
		"%.2f citizens, was %.2f" % [game3.state["citizens"], citizens])
	game2 = game3

	# --- Escape ----------------------------------------------------------
	# With a building armed Escape cancels it; with nothing armed it leaves.
	print("escape")
	game2._set_ghost("farm")
	game2._unhandled_input(_esc())
	check("cancels the ghost first", game2.ghost_def == "")
	check("still playing", _game_children() == 1)
	game2._unhandled_input(_esc())
	await process_frame
	await process_frame
	check("second press leaves", _game_children() == 0)

	SaveGame.erase()
	print("")
	print("%d failure(s)" % failures)
	quit(1 if failures > 0 else 0)


func _esc() -> InputEventKey:
	var e := InputEventKey.new()
	e.keycode = KEY_ESCAPE
	e.pressed = true
	return e


## Game scenes are the only Node2D children Main ever adds.
func _game_children() -> int:
	var n := 0
	for c in main.get_children():
		if c is Node2D:
			n += 1
	return n


func _run(game: Node, seconds: float) -> void:
	var elapsed := 0.0
	while elapsed < seconds:
		await process_frame
		elapsed += game.get_process_delta_time()
