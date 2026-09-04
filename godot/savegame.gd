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
##
## Where it goes depends on the platform, and the browser is the awkward one.
## Godot mounts `user://` as an IndexedDB filesystem there and does not write
## through: after a file is closed it waits several seconds of *running main
## loop* before flushing. A player who closes the tab, switches away, or simply
## finishes a session in that window loses the write, and a browser gives no
## warning that it happened. So on the web the record goes to localStorage
## instead, which stores it there and then. Everywhere else it is a file, which
## already behaves.
class_name SaveGame

const PATH := "user://rise-of-ages.save"
const WEB_KEY := "rise-of-ages.save"
const VERSION := 1


static func _on_web() -> bool:
	return OS.has_feature("web")


## localStorage, or null when it cannot be reached. Private browsing and
## disabled site data both take it away, so every caller checks.
static func _web_store():
	if not _on_web():
		return null
	return JavaScriptBridge.get_interface("localStorage")


# ------------------------------------------------------------------- writing

## Everything needed to rebuild a session, and when it was written.
static func write(state: Dictionary, world: WorldMap, units: Units, path: String = PATH) -> bool:
	var record := build_record(state, world, units)

	var store = _web_store()
	if store != null:
		# variant_to_base64 encodes exactly what store_var would, so the two
		# paths preserve the same types and the record is identical either way.
		store.setItem(_key_for(path), Marshalls.variant_to_base64(record, true))
		return true

	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		push_warning("could not open %s for writing" % path)
		return false
	f.store_var(record, true)
	f.close()
	return true


## The record itself, independent of where it ends up.
static func build_record(state: Dictionary, world: WorldMap, units: Units) -> Dictionary:
	# Only what cannot be recomputed. Phase, path and target are all rebuilt on
	# load: a citizen who was mid-journey simply picks the journey up again.
	var people := []
	for w in units.workers:
		people.append({"pos": w["pos"], "post": w["post"]})

	return {
		"version": VERSION,
		"saved_at": Time.get_unix_time_from_system(),
		"state": state,
		"seed": world.seed_value,
		"terrain": world.terrain,
		"placements": world.placements,
		"next_placement": world.next_placement(),
		"people": people,
	}


## Tests pass their own path; keep them apart in localStorage too.
static func _key_for(path: String) -> String:
	return WEB_KEY if path == PATH else "rise-of-ages.test." + path.get_file()


# ------------------------------------------------------------------- reading

## The stored record, or an empty Dictionary if there is none or it is unusable.
static func _raw(path: String) -> Dictionary:
	var raw = null

	var store = _web_store()
	if store != null:
		var text = store.getItem(_key_for(path))
		if text != null and String(text) != "":
			raw = Marshalls.base64_to_variant(String(text), true)
	elif FileAccess.file_exists(path):
		var f := FileAccess.open(path, FileAccess.READ)
		if f != null:
			raw = f.get_var(true)
			f.close()

	if typeof(raw) != TYPE_DICTIONARY or raw.get("version", 0) != VERSION:
		return {}
	return raw


## Returns a dictionary of {state, world, people, saved_at}, or an empty one if
## there is no save or it cannot be read.
static func read(path: String = PATH) -> Dictionary:
	var raw := _raw(path)
	if raw.is_empty():
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
	var raw := _raw(path)
	if raw.is_empty():
		return {}
	return {
		"age": raw["state"]["age"],
		"citizens": int(raw["state"]["citizens"]),
		"buildings": raw["placements"].size(),
		"saved_at": float(raw.get("saved_at", 0.0)),
	}


static func has_save(path: String = PATH) -> bool:
	var store = _web_store()
	if store != null:
		var text = store.getItem(_key_for(path))
		return text != null and String(text) != ""
	return FileAccess.file_exists(path)


static func erase(path: String = PATH) -> void:
	var store = _web_store()
	if store != null:
		store.removeItem(_key_for(path))
		return
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
