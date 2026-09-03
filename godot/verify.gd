## Drives the playable scene without a person at the keyboard, so the whole
## chain can be checked: world, placement, citizens walking to a job, and the
## economy ticking on what they produce.
##
##   godot --path godot --script verify.gd
extends SceneTree

var game: Node2D


func _init() -> void:
	game = load("res://main.tscn").instantiate()
	root.add_child(game)
	await process_frame
	await process_frame

	print("world      %d placements, %d citizens" % [
		game.world.placements.size(), game.units.workers.size()
	])

	# Let the population grow a little before building anything.
	await _run(20.0)
	var before_food: float = game.state["res"]["food"]
	var citizens_before: float = game.state["citizens"]

	# Place a farm on open ground near the city, through the same path a click
	# takes: check the ground, charge for it, raise it, staff it.
	var spot: Vector2i = game.world.find_spot("farm")
	game.ghost_def = "farm"
	game.ghost_tile = spot
	game._try_place()

	var farms := 0
	for p in game.world.placements:
		if p["def"] == "farm":
			farms += 1
	print("placement  farm at %s -> %d farm(s) standing" % [spot, farms])

	# Long enough for the crew to walk there and start producing.
	await _run(30.0)

	var d := Sim.derive(game.state)
	var posted := 0
	var walking := 0
	var working := 0
	for w in game.units.workers:
		if w["post"] != 0:
			posted += 1
			if w["phase"] == "walk":
				walking += 1
			elif w["phase"] == "work":
				working += 1

	print("citizens   %d total, %d posted (%d walking, %d working)" % [
		game.units.workers.size(), posted, walking, working
	])
	print("jobs       %s" % JSON.stringify(game.state["jobs"]))
	print("economy    food %.1f -> %.1f  (%+.2f/s)  citizens %.1f -> %.1f" % [
		before_food, game.state["res"]["food"], d["net"]["food"],
		citizens_before, game.state["citizens"]
	])
	print("buildings  %s" % JSON.stringify(game.state["buildings"]))

	# Did anyone actually move? Compare a posted citizen's tile to its building.
	var moved := 0
	for w in game.units.workers:
		if w["phase"] == "work" and w["post"] != 0:
			moved += 1
	print("at work    %d citizens standing at a site" % moved)

	# --- progression -----------------------------------------------------
	# Stock the stores directly. This is a harness, not play: the point is to
	# exercise research and the age gate, not to sit through earning it.
	for id in Content.RESOURCE_IDS:
		game.state["res"][id] = 1.0e6

	print("")
	print("age gate   tracks_ready=%s at age %d" % [
		Sim.tracks_ready(game.state), game.state["age"]
	])
	var blocked := Sim.advance_age(game.state)
	print("           advancing with no research: %s (expected false)" % blocked)

	var researched := 0
	for id in Content.TRACK_IDS:
		if Sim.research(game.state, id):
			researched += 1
	print("research   %d tracks taken to level 1 %s" % [researched, game.state["tracks"]])

	var gross_before: float = Sim.derive(game.state)["gross"]["food"]
	var age_before: int = game.state["age"]
	var advanced := Sim.advance_age(game.state)
	var after := Sim.derive(game.state)
	var gross_after: float = after["gross"]["food"]

	print("advance    %s -> %s (%s)" % [
		Content.AGES[age_before]["name"], Content.AGES[game.state["age"]]["name"], advanced
	])
	print("output     food gross %.3f -> %.3f  = x%.2f (expected x%.1f)" % [
		gross_before, gross_after,
		gross_after / maxf(gross_before, 0.0001), Sim.AGE_OUTPUT_STEP
	])
	print("unlocks    warehouse now buildable: %s" % (
		Content.building("warehouse")["age"] <= game.state["age"]
	))

	# Let the scene draw the new state before the screenshot.
	await _run(1.0)
	print("")
	print("hud check  age label %s  at %s  visible=%s" % [
		JSON.stringify(game._age_label.text),
		game._age_label.global_position, game._age_label.visible
	])
	print("           advance btn %s" % JSON.stringify(game._advance_btn.text))
	print("           state age=%d food=%.0f  root children=%d" % [
		game.state["age"], game.state["res"]["food"], root.get_child_count()
	])
	# The viewport texture lags a frame or two behind the state, so a capture
	# taken immediately shows the HUD as it was before the last change.
	for i in 4:
		await process_frame
		await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://play.png")
	print("wrote play.png")
	quit()


## Run until a number of *simulated* seconds have passed, not frames.
##
## Frame counting is useless here: unthrottled, the scene renders fast enough
## that four hundred frames is a fraction of a second of game time, which made
## it look as though citizens never finished walking.
func _run(seconds: float) -> void:
	var elapsed := 0.0
	while elapsed < seconds:
		await process_frame
		elapsed += game.get_process_delta_time()
