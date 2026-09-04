## Puts one of every building on the map and photographs it.
##
## The contact sheet says the set is consistent with itself. This says whether
## it is consistent with the ground it stands on, which is a different question
## and the one that actually matters.
##
##   godot --path godot --script showcase.gd
extends SceneTree

var game: Node2D


func _init() -> void:
	SaveGame.erase()
	game = load("res://game.tscn").instantiate()
	game.start_new = true
	root.add_child(game)
	await process_frame
	await process_frame

	# Pay for everything, so placement is about ground rather than economy.
	for id in Content.RESOURCE_IDS:
		game.state["res"][id] = 1.0e7

	var placed := 0
	for b in Content.BUILDINGS:
		var def: String = b["id"]
		if def == "city":
			continue
		# Age gates most of these, and the point is to see them all.
		if Content.building(def)["age"] > game.state["age"]:
			game.state["age"] = Content.building(def)["age"]
		var spot: Vector2i = game.world.find_spot(def)
		if spot.x < 0:
			print("no room    %s" % def)
			continue
		game.ghost_def = def
		game.ghost_tile = spot
		game._try_place()
		placed += 1
		print("placed     %-11s at %s" % [def, spot])

	print("")
	print("%d buildings standing" % placed)

	# Let the citizens walk out to them before the picture.
	var elapsed := 0.0
	while elapsed < 12.0:
		await process_frame
		elapsed += game.get_process_delta_time()

	if DisplayServer.get_name() == "headless":
		print("headless, so no screenshot")
		quit()
		return

	# The viewport texture lags the state by a frame or two.
	for i in 4:
		await process_frame
		await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://showcase.png")
	print("wrote showcase.png")
	quit()
