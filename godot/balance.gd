## Headless balance probe, ported from balance.ts.
##
## The whole point of the spike: run the identical autoplayer against the
## GDScript economy and compare its timeline to the TypeScript one. If the two
## agree, the port is faithful and the tuning survived the move to Godot.
##
##   godot --headless --script godot/balance.gd
extends SceneTree

const DT := 1.0
const LIMIT := 200 * 3600  # two hundred hours of simulated play

var state: Dictionary
var marks: Array[String] = []
var t := 0.0


func hhmm(seconds: float) -> String:
	var h := int(seconds / 3600.0)
	var m := int(fmod(seconds, 3600.0) / 60.0)
	return "%4dh %02dm" % [h, m]


## One decision, made every five simulated seconds.
func decide() -> void:
	var d := Sim.derive(state)
	Sim.auto_assign(state)

	# Trade routes cost nothing, so always run as many as exist.
	if state["routes"].size() < d["route_cap"]:
		for r in Content.RARES:
			if not state["routes"].has(r["id"]):
				Sim.toggle_route(state, r["id"])
				break

	if Sim.tracks_ready(state) and Sim.can_afford(state, Sim.age_cost(state, d)):
		var before: int = state["age"]
		if Sim.advance_age(state):
			marks.append("%s  %s" % [hhmm(t), Content.AGES[before + 1]["name"]])
			return

	# Research the shallowest legal track first so the four stay level, which
	# is what the age gate rewards.
	var legal := []
	for id in Content.TRACK_IDS:
		if state["tracks"][id] < Content.MAX_TRACK_LEVEL and state["tracks"][id] <= state["age"]:
			legal.append(id)
	legal.sort_custom(func(a, b): return state["tracks"][a] < state["tracks"][b])
	if legal.size() > 0 and Sim.research(state, legal[0]):
		return

	for w in Content.WONDERS:
		if w["age"] <= state["age"] and not state["wonders"].has(w["id"]) and Sim.can_afford(state, w["cost"]):
			if Sim.build_wonder(state, w["id"]):
				return
			break

	# Keep headroom: found a city before the last slots are gone.
	if d["build_cap"] - d["build_used"] <= 2 and state["buildings"].get("city", 0) < d["city_cap"]:
		if Sim.build(state, "city"):
			return

	var unlocked := []
	for b in Content.BUILDINGS:
		if b["age"] <= state["age"] and b["id"] != "city":
			unlocked.append(b)

	var affordable := func(id: String) -> bool:
		return Sim.can_afford(state, Sim.building_cost(state, id, d))

	# A first copy of every producer beats a tenth copy of any of them.
	for b in unlocked:
		if b.has("produces") and state["buildings"].get(b["id"], 0) == 0:
			if affordable.call(b["id"]):
				Sim.build(state, b["id"])
			return  # otherwise save up for it rather than spending elsewhere

	# Relieve whatever is actually pinching.
	var at_cap := []
	for id in Content.RESOURCE_IDS:
		if state["res"][id] >= d["caps"][id] * 0.98:
			at_cap.append(id)
	if at_cap.size() > 0:
		for store in ["granary", "warehouse"]:
			var def := Content.building(store)
			var helps := false
			for id in at_cap:
				if def.get("effects", {}).get("caps", {}).has(id):
					helps = true
					break
			if def["age"] <= state["age"] and helps and affordable.call(store) and Sim.build(state, store):
				return

	if state["citizens"] >= d["pop_cap"] * 0.98 and affordable.call("temple") and Sim.build(state, "temple"):
		return
	if state["buildings"].get("workshop", 0) < 6 and affordable.call("workshop") and Sim.build(state, "workshop"):
		return

	# Otherwise widen the narrowest producer line, keeping a few slots spare so
	# there is always room to answer a storage or population pinch.
	if d["build_cap"] - d["build_used"] <= 4:
		return
	var producers := []
	for b in unlocked:
		if b.has("produces") and affordable.call(b["id"]):
			producers.append(b)
	producers.sort_custom(func(a, b):
		return state["buildings"].get(a["id"], 0) < state["buildings"].get(b["id"], 0))
	if producers.size() > 0:
		Sim.build(state, producers[0]["id"])


func _init() -> void:
	state = Sim.new_game()

	var step := 0
	while t < LIMIT and state["age"] < Content.MAX_AGE:
		Sim.tick(state, DT)
		t += DT
		step += 1
		if step % 5 == 0:
			decide()

	var d := Sim.derive(state)
	print("\n".join(marks))
	print("")
	print("stopped at %s in the %s" % [hhmm(t), Content.AGES[state["age"]]["name"]])
	print("citizens %d/%d  slots %d/%d  cities %d" % [
		int(state["citizens"]), int(d["pop_cap"]),
		int(d["build_used"]), int(d["build_cap"]),
		state["buildings"].get("city", 0),
	])
	var tr := []
	for id in Content.TRACK_IDS:
		tr.append("%s%d" % [Content.TRACKS[id]["name"].substr(0, 2), state["tracks"][id]])
	print("tracks %s  wonders %d  routes %d/%d" % [
		" ".join(tr), state["wonders"].size(), state["routes"].size(), d["route_cap"],
	])
	print("output x%.2f  food/s %.1f  knowledge/s %.2f" % [
		d["global_out"], d["net"]["food"], d["net"]["knowledge"],
	])
	print("buildings %s" % JSON.stringify(state["buildings"]))
	quit()
