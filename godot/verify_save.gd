## Round-trips a save and compares the two sides field by field.
##
## A save that loads without error is not a save that works: the failure mode
## worth catching is the quiet one, where a session comes back subtly different
## and nobody notices until a nation is missing a building or half its people.
##
##   godot --path godot --script verify_save.gd
extends SceneTree

const TEST_PATH := "user://verify-roundtrip.save"

var game: Node2D
var failures := 0


func check(name: String, ok: bool, detail: String = "") -> void:
	if not ok:
		failures += 1
	print("  %s %-26s %s" % ["ok  " if ok else "FAIL", name, detail])


func _init() -> void:
	SaveGame.erase(TEST_PATH)
	SaveGame.erase()

	game = load("res://game.tscn").instantiate()
	root.add_child(game)
	await _run(1.0)

	# Build a session worth saving: a few buildings, some research, an age.
	for id in Content.RESOURCE_IDS:
		game.state["res"][id] = 5.0e5
	for def in ["farm", "camp", "mine", "market"]:
		var spot: Vector2i = game.world.find_spot(def)
		if spot.x >= 0:
			game.ghost_def = def
			game.ghost_tile = spot
			game._try_place()
	for id in Content.TRACK_IDS:
		Sim.research(game.state, id)
	Sim.advance_age(game.state)
	await _run(12.0)

	var before := {
		"age": game.state["age"],
		"citizens": game.state["citizens"],
		"food": game.state["res"]["food"],
		"knowledge": game.state["res"]["knowledge"],
		"tracks": game.state["tracks"].duplicate(),
		"placements": game.world.placements.size(),
		"workers": game.units.workers.size(),
		"posted": game.units.workers.filter(func(w): return w["post"] != 0).size(),
		"terrain_sum": _terrain_sum(game.world),
		"next_id": game.world.next_placement(),
	}
	var first_pos: Vector2 = game.units.workers[0]["pos"]

	print("saving     age %d, %d citizens, %d buildings, %d posted" % [
		before["age"], int(before["citizens"]), before["placements"], before["posted"]
	])
	check("write", SaveGame.write(game.state, game.world, game.units, TEST_PATH))

	# Read it back into fresh objects, the way a restart would.
	var loaded := SaveGame.read(TEST_PATH)
	check("read", not loaded.is_empty())
	if loaded.is_empty():
		_finish()
		return

	var w2: WorldMap = loaded["world"]
	var s2: Dictionary = loaded["state"]
	var u2 := Units.new(w2)
	u2.restore(loaded["people"])

	print("comparing")
	check("age", s2["age"] == before["age"], "%d" % s2["age"])
	check("citizens", is_equal_approx(s2["citizens"], before["citizens"]), "%.4f" % s2["citizens"])
	check("food", is_equal_approx(s2["res"]["food"], before["food"]), "%.2f" % s2["res"]["food"])
	check("knowledge", is_equal_approx(s2["res"]["knowledge"], before["knowledge"]))
	check("tracks", s2["tracks"] == before["tracks"], JSON.stringify(s2["tracks"]))
	check("placements", w2.placements.size() == before["placements"], "%d" % w2.placements.size())
	check("next placement id", w2.next_placement() == before["next_id"], "%d" % w2.next_placement())
	check("terrain", _terrain_sum(w2) == before["terrain_sum"], "checksum matches")
	check("worker count", u2.workers.size() == before["workers"], "%d" % u2.workers.size())
	check("postings kept",
		u2.workers.filter(func(w): return w["post"] != 0).size() == before["posted"],
		"%d posted" % u2.workers.filter(func(w): return w["post"] != 0).size())
	check("worker position", u2.workers[0]["pos"].is_equal_approx(first_pos),
		"%.3f, %.3f" % [u2.workers[0]["pos"].x, u2.workers[0]["pos"].y])

	# The economy has to agree, not merely the stored numbers.
	var d1 := Sim.derive(game.state)
	var d2 := Sim.derive(s2)
	check("derived food/s", is_equal_approx(d1["net"]["food"], d2["net"]["food"]),
		"%.4f vs %.4f" % [d1["net"]["food"], d2["net"]["food"]])
	check("derived caps", is_equal_approx(d1["caps"]["food"], d2["caps"]["food"]))
	check("build slots used", is_equal_approx(d1["build_used"], d2["build_used"]))

	# And time away should be credited, at half rate.
	#
	# Drain the larder first. Left full it sits at the cap, and catch-up has
	# nowhere to put the food, so a rising-stores assertion fails for a reason
	# that has nothing to do with catch-up working.
	print("offline")
	s2["res"]["food"] = 100.0
	var food_before: float = s2["res"]["food"]
	var credited := Sim.offline_catch_up(s2, 30.0 * 60.0 * 1000.0)
	check("30 min credited", is_equal_approx(credited, 1800.0), "%.0fs" % credited)
	check("stores moved", s2["res"]["food"] > food_before,
		"food %.0f -> %.0f" % [food_before, s2["res"]["food"]])
	check("short absence ignored", is_equal_approx(Sim.offline_catch_up(s2, 5000.0), 0.0))

	_finish()


func _terrain_sum(w: WorldMap) -> int:
	var total := 0
	for i in w.terrain.size():
		total += w.terrain[i] * (i % 7 + 1)
	return total


func _finish() -> void:
	SaveGame.erase(TEST_PATH)
	print("")
	print("%d failure(s)" % failures)
	quit(1 if failures > 0 else 0)


func _run(seconds: float) -> void:
	var elapsed := 0.0
	while elapsed < seconds:
		await process_frame
		elapsed += game.get_process_delta_time()
