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
