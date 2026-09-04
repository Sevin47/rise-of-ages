## Reading and writing a save.
##
## Three things have to survive: the economy, the world, and the people. The
## economy is already a plain Dictionary. The world is a seed plus the terrain
## it generated, and the terrain has to be stored rather than re-derived,
## because generation edits it afterwards to guarantee a landing site and the
## woodland and hills around it. The people are positions and postings.
##
## Written with `store_var`, which handles Godot's own types, so worker
## positions stay Vector2 and terrain stays a PackedByteArray instead of being
## flattened into text and parsed back.
class_name SaveGame

const PATH := "user://rise-of-ages.save"
const VERSION := 1


## Everything needed to rebuild a session, and when it was written.
static func write(state: Dictionary, world: WorldMap, units: Units, path: String = PATH) -> bool:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		push_warning("could not open %s for writing" % path)
		return false

	# Only what cannot be recomputed. Phase, path and target are all rebuilt on
	# load: a citizen who was mid-journey simply picks the journey up again.
	var people := []
	for w in units.workers:
		people.append({"pos": w["pos"], "post": w["post"]})

	f.store_var({
		"version": VERSION,
		"saved_at": Time.get_unix_time_from_system(),
		"state": state,
		"seed": world.seed_value,
		"terrain": world.terrain,
		"placements": world.placements,
		"next_placement": world.next_placement(),
		"people": people,
	}, true)
	f.close()
	return true


## Returns a dictionary of {state, world, people, saved_at}, or an empty one if
## there is no save or it cannot be read.
static func read(path: String = PATH) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var raw = f.get_var(true)
	f.close()

	if typeof(raw) != TYPE_DICTIONARY or raw.get("version", 0) != VERSION:
		push_warning("save is missing or from another version; starting fresh")
		return {}

	var world := WorldMap.new(raw["seed"])
	# Overwrite the freshly generated terrain with the stored one. Regenerating
	# from the seed alone would lose the clearing and the guaranteed woodland,
	# which are applied after generation.
	if raw["terrain"] is PackedByteArray and raw["terrain"].size() == world.terrain.size():
		world.terrain = raw["terrain"]
	world.placements.clear()
	for p in raw["placements"]:
		world.placements.append(p.duplicate())
	world.set_next_placement(raw["next_placement"])

	return {
		"state": raw["state"],
		"world": world,
		"people": raw["people"],
		"saved_at": float(raw.get("saved_at", 0.0)),
	}


## A short description of a save without rebuilding it.
##
## `read` constructs a WorldMap, which regenerates terrain from the seed before
## the stored terrain overwrites it. That is wasted work for a menu that only
## wants to say "Ancient Age, 12 citizens", so this reads the raw record and
## touches nothing else.
static func peek(path: String = PATH) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var raw = f.get_var(true)
	f.close()
	if typeof(raw) != TYPE_DICTIONARY or raw.get("version", 0) != VERSION:
		return {}

	return {
		"age": raw["state"]["age"],
		"citizens": int(raw["state"]["citizens"]),
		"buildings": raw["placements"].size(),
		"saved_at": float(raw.get("saved_at", 0.0)),
	}


static func has_save(path: String = PATH) -> bool:
	return FileAccess.file_exists(path)


static func erase(path: String = PATH) -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
