## The economy, ported from src/sim.ts.
##
## Line-for-line where it matters. The ordering of every accumulation is kept
## identical to the TypeScript, because floating-point addition is not
## associative and reordering it would produce a small drift that grows over a
## two-hour run and makes the two ports impossible to compare.
##
## Everything is a pure function of the game state, recomputed from scratch:
## no cached derived values, so there is no cache to go stale.
class_name Sim

## How much output and storage grow per age. Age prices climb roughly six-fold
## a rung; these two, the tracks, wonders and population are what meets that.
const AGE_OUTPUT_STEP := 3.2
const AGE_STORAGE_STEP := 3.2


static func zeroed() -> Dictionary:
	var d := {}
	for id in Content.RESOURCE_IDS:
		d[id] = 0.0
	return d


static func ones() -> Dictionary:
	var d := {}
	for id in Content.RESOURCE_IDS:
		d[id] = 1.0
	return d


## A fresh nation.
static func new_game(legacy: int = 0, dynasties: int = 0) -> Dictionary:
	var res := zeroed()
	for id in Content.BASE["start_resources"]:
		res[id] = Content.BASE["start_resources"][id]
	var jobs := {}
	for id in Content.RESOURCE_IDS:
		jobs[id] = 0
	var tracks := {}
	for id in Content.TRACK_IDS:
		tracks[id] = 0
	return {
		"age": 0,
		"res": res,
		"buildings": {"city": 1},
		"jobs": jobs,
		"citizens": Content.BASE["citizens"],
		"tracks": tracks,
		"wonders": [],
		"routes": [],
		"legacy": legacy,
		"dynasties": dynasties,
	}


## Everything the UI and the tick need, as a pure function of the save.
static func derive(state: Dictionary) -> Dictionary:
	var t: Dictionary = state["tracks"]

	# --- additive modifiers from buildings, wonders and routes ---
	var output_mult := 0.0
	var cap_mult := 0.0
	var pop_mult := 0.0
	var growth_mult := 0.0
	var build_discount := 0.0
	var research_factor := 1.0
	var pop_cap_flat: float = Content.BASE["pop_cap"]
	var build_cap: float = Content.BASE["build_cap"]
	var route_cap_raw: float = Content.BASE["routes"]
	var caps_flat := zeroed()
	var caps_scale := ones()
	var res_out := ones()
	for id in Content.RESOURCE_IDS:
		caps_flat[id] = Content.RESOURCES[id]["base_cap"]

	for def in Content.BUILDINGS:
		var n: float = state["buildings"].get(def["id"], 0)
		if n == 0 or not def.has("effects"):
			continue
		var e: Dictionary = def["effects"]
		if e.has("pop_cap"):
			pop_cap_flat += e["pop_cap"] * n
		if e.has("build_cap"):
			build_cap += e["build_cap"] * n
		if e.has("output_mult"):
			output_mult += e["output_mult"] * n
		if e.has("growth_mult"):
			growth_mult += e["growth_mult"] * n
		if e.has("routes"):
			route_cap_raw += e["routes"] * n
		if e.has("research_discount"):
			research_factor *= pow(1.0 - e["research_discount"], n)
		if e.has("caps"):
			for r in e["caps"]:
				caps_flat[r] += e["caps"][r] * n
		if e.has("cap_scale"):
			for r in e["cap_scale"]:
				caps_scale[r] *= pow(1.0 + e["cap_scale"][r], n)

	for id in state["wonders"]:
		var w := {}
		for x in Content.WONDERS:
			if x["id"] == id:
				w = x
				break
		if w.is_empty():
			continue
		var we: Dictionary = w["effects"]
		if we.has("output_mult"):
			output_mult += we["output_mult"]
		if we.has("cap_mult"):
			cap_mult += we["cap_mult"]
		if we.has("pop_mult"):
			pop_mult += we["pop_mult"]
		if we.has("growth_mult"):
			growth_mult += we["growth_mult"]
		if we.has("research_discount"):
			research_factor *= 1.0 - we["research_discount"]
		if we.has("res_mult"):
			for r in we["res_mult"]:
				res_out[r] += we["res_mult"][r]

	for id in state["routes"]:
		var rare := Content.rare(id)
		if rare.is_empty():
			continue
		var re: Dictionary = rare["effects"]
		if re.has("output_mult"):
			output_mult += re["output_mult"]
		if re.has("cap_mult"):
			cap_mult += re["cap_mult"]
		if re.has("growth_mult"):
			growth_mult += re["growth_mult"]
		if re.has("build_discount"):
			build_discount += re["build_discount"]
		if re.has("res_mult"):
			for r in re["res_mult"]:
				res_out[r] += re["res_mult"][r]

	# --- library tracks, age and prestige ---
	var age_output := pow(AGE_OUTPUT_STEP, state["age"])
	var age_storage := pow(AGE_STORAGE_STEP, state["age"])

	var global_out: float = 1.0 + output_mult + t["craft"] * 0.11 + state["legacy"] * 0.03
	res_out["wealth"] += t["commerce"] * 0.08
	res_out["knowledge"] += t["science"] * 0.12

	var citizen_bonus: float = 1.0 + t["civic"] * 0.04
	var pop_cap := floorf((pop_cap_flat + t["civic"] * 14.0) * (1.0 + pop_mult))
	var city_cap: int = Content.BASE["city_cap"] + t["civic"]
	var route_cap := int(floorf(route_cap_raw)) + int(floorf(t["commerce"] / 2.0))
	var research_mult: float = research_factor * pow(0.93, t["science"])
	var build_mult: float = pow(0.95, t["craft"]) * (1.0 - minf(0.5, build_discount))
	var age_mult: float = pow(0.96, t["science"])

	var caps := zeroed()
	for id in Content.RESOURCE_IDS:
		caps[id] = floorf(caps_flat[id] * caps_scale[id] * (1.0 + cap_mult) * pow(1.6, t["commerce"]) * age_storage)

	# --- citizens fill the best-paying job on their line first ---
	var slots := zeroed()
	var gross := zeroed()
	for def in Content.BUILDINGS:
		var n: float = state["buildings"].get(def["id"], 0)
		if n == 0 or not def.has("produces"):
			continue
		var p: Dictionary = def["produces"]
		slots[p["res"]] += n * p["slots"]
		gross[p["res"]] += n * p["base"]

	for id in Content.RESOURCE_IDS:
		var remaining: float = minf(state["jobs"][id], slots[id])
		var producers := []
		for b in Content.BUILDINGS:
			if b.has("produces") and b["produces"]["res"] == id and state["buildings"].get(b["id"], 0) > 0:
				producers.append(b)
		producers.sort_custom(func(a, b): return a["produces"]["per_citizen"] > b["produces"]["per_citizen"])
		for def in producers:
			if remaining <= 0:
				break
			var capacity: float = float(state["buildings"].get(def["id"], 0)) * def["produces"]["slots"]
			var worked: float = minf(remaining, capacity)
			gross[id] += worked * def["produces"]["per_citizen"] * citizen_bonus
			remaining -= worked
		gross[id] *= global_out * res_out[id] * age_output

	var upkeep: float = state["citizens"] * Content.BASE["upkeep"]
	var net := gross.duplicate()
	net["food"] -= upkeep

	var build_used := 0.0
	for id in state["buildings"]:
		var def := Content.building(id)
		if not def.is_empty() and not def.get("free_of_build_cap", false):
			build_used += state["buildings"][id]

	var posted := 0.0
	for id in Content.RESOURCE_IDS:
		posted += minf(state["jobs"][id], slots[id])

	var starving: bool = state["res"]["food"] <= 0 and net["food"] < 0
	var growth_per_sec := 0.0
	if not starving:
		growth_per_sec = (Content.BASE["growth"] * (1.0 + growth_mult) * pop_cap
			* maxf(0.0, 1.0 - state["citizens"] / pop_cap)) / 10.0

	return {
		"global_out": global_out,
		"res_out": res_out,
		"gross": gross,
		"net": net,
		"caps": caps,
		"slots": slots,
		"pop_cap": pop_cap,
		"idle": maxf(0.0, floorf(state["citizens"]) - posted),
		"build_cap": build_cap,
		"build_used": build_used,
		"city_cap": city_cap,
		"route_cap": route_cap,
		"growth_per_sec": growth_per_sec,
		"upkeep": upkeep,
		"citizen_bonus": citizen_bonus,
		"age_output": age_output,
		"research_mult": research_mult,
		"build_mult": build_mult,
		"age_mult": age_mult,
		"starving": starving,
	}


## Advance the simulation by `dt` seconds.
static func tick(state: Dictionary, dt: float) -> void:
	var d := derive(state)

	for id in Content.RESOURCE_IDS:
		var next: float = state["res"][id] + d["net"][id] * dt
		state["res"][id] = maxf(0.0, minf(next, d["caps"][id]))

	if d["starving"]:
		var deficit: float = -d["net"]["food"]
		state["citizens"] = maxf(1.0, state["citizens"] - deficit * Content.BASE["starvation"] * dt)
	else:
		state["citizens"] = minf(d["pop_cap"], state["citizens"] + d["growth_per_sec"] * dt)

	clamp_jobs(state, d)


## Trim postings that outgrew their slots.
static func clamp_jobs(state: Dictionary, d: Dictionary) -> void:
	var budget := floorf(state["citizens"])
	for id in Content.RESOURCE_IDS:
		var allowed: float = minf(minf(state["jobs"][id], d["slots"][id]), budget)
		state["jobs"][id] = maxf(0.0, allowed)
		budget -= state["jobs"][id]


## Credit time spent away: eight hours at most, at half rate, in one-minute
## steps. Stepping rather than one huge tick matters, because the economy is not
## linear in dt: caps clamp, stores run dry and citizens starve, and a single
## eight-hour tick would skip straight past all of it.
##
## Returns the seconds credited, so the caller can say what happened.
static func offline_catch_up(state: Dictionary, elapsed_ms: float) -> float:
	var seconds: float = minf(elapsed_ms / 1000.0, 8.0 * 3600.0)
	if seconds < 30.0:
		return 0.0
	var remaining := seconds * 0.5
	while remaining > 0.0:
		var step: float = minf(60.0, remaining)
		tick(state, step)
		remaining -= step
	return seconds


# ------------------------------------------------------------------- costs

static func building_cost(state: Dictionary, id: String, d: Dictionary) -> Dictionary:
	var def := Content.building(id)
	if def.is_empty():
		return {}
	var n: float = state["buildings"].get(id, 0)
	var scale: float = pow(def["growth"], n) * d["build_mult"]
	var out := {}
	for r in def["cost"]:
		out[r] = maxf(1.0, ceilf(def["cost"][r] * scale))
	return out


static func track_cost(state: Dictionary, id: String, d: Dictionary) -> Dictionary:
	var level: int = state["tracks"][id]
	var raw := Content.tech_cost(level)
	var out := {"knowledge": ceilf(raw["knowledge"] * d["research_mult"])}
	var secondary: String = Content.TRACKS[id]["with"]
	# Science pairs with Metal, but a track could in principle pair with
	# Knowledge; adding rather than overwriting keeps that case correct.
	out[secondary] = out.get(secondary, 0.0) + ceilf(raw["secondary"] * d["research_mult"])
	return out


static func age_cost(state: Dictionary, d: Dictionary) -> Dictionary:
	var out := {}
	for r in Content.AGES[state["age"]]["cost"]:
		out[r] = ceilf(Content.AGES[state["age"]]["cost"][r] * d["age_mult"])
	return out


static func can_afford(state: Dictionary, cost: Dictionary) -> bool:
	for r in cost:
		if state["res"][r] < cost[r]:
			return false
	return true


static func pay(state: Dictionary, cost: Dictionary) -> void:
	for r in cost:
		state["res"][r] -= cost[r]


# ----------------------------------------------------------------- actions

static func build(state: Dictionary, id: String) -> bool:
	var def := Content.building(id)
	if def.is_empty() or def["age"] > state["age"]:
		return false
	var d := derive(state)
	var owned: int = state["buildings"].get(id, 0)
	if def.get("city_limited", false) and owned >= d["city_cap"]:
		return false
	if not def.get("free_of_build_cap", false) and d["build_used"] >= d["build_cap"]:
		return false

	var cost := building_cost(state, id, d)
	if not can_afford(state, cost):
		return false
	pay(state, cost)
	state["buildings"][id] = owned + 1
	return true


## Charge for a building without raising it.
##
## The map owns `state["buildings"]`: it is recomputed from the placements every
## frame, so incrementing it here would be overwritten immediately. This sits
## alongside `build` rather than replacing it, because `build` still works with
## no map at all, which is what lets balance.gd probe the economy on its own.
static func build_pay(state: Dictionary, id: String) -> bool:
	var def := Content.building(id)
	if def.is_empty() or def["age"] > state["age"]:
		return false
	var d := derive(state)
	var owned: int = state["buildings"].get(id, 0)
	if def.get("city_limited", false) and owned >= d["city_cap"]:
		return false
	if not def.get("free_of_build_cap", false) and d["build_used"] >= d["build_cap"]:
		return false
	var cost := building_cost(state, id, d)
	if not can_afford(state, cost):
		return false
	pay(state, cost)
	return true


static func research(state: Dictionary, id: String) -> bool:
	var level: int = state["tracks"][id]
	if level >= Content.MAX_TRACK_LEVEL or level > state["age"]:
		return false
	var d := derive(state)
	var cost := track_cost(state, id, d)
	if not can_afford(state, cost):
		return false
	pay(state, cost)
	state["tracks"][id] = level + 1
	return true


static func tracks_ready(state: Dictionary) -> bool:
	var n := 0
	for id in Content.TRACK_IDS:
		if state["tracks"][id] >= state["age"] + 1:
			n += 1
	return n >= Content.TRACKS_NEEDED_TO_ADVANCE


static func advance_age(state: Dictionary) -> bool:
	if state["age"] >= Content.MAX_AGE or not tracks_ready(state):
		return false
	var d := derive(state)
	var cost := age_cost(state, d)
	if not can_afford(state, cost):
		return false
	pay(state, cost)
	state["age"] += 1
	return true


static func build_wonder(state: Dictionary, id: String) -> bool:
	var w := {}
	for x in Content.WONDERS:
		if x["id"] == id:
			w = x
			break
	if w.is_empty() or w["age"] > state["age"] or state["wonders"].has(id):
		return false
	if not can_afford(state, w["cost"]):
		return false
	pay(state, w["cost"])
	state["wonders"].append(id)
	return true


static func toggle_route(state: Dictionary, id: String) -> bool:
	var at: int = state["routes"].find(id)
	if at >= 0:
		state["routes"].remove_at(at)
		return true
	var d := derive(state)
	if state["routes"].size() >= d["route_cap"]:
		return false
	state["routes"].append(id)
	return true


## Spread every citizen over the lines that still have open jobs.
static func auto_assign(state: Dictionary) -> void:
	var d := derive(state)
	for id in Content.RESOURCE_IDS:
		state["jobs"][id] = 0
	var budget := floorf(state["citizens"])
	var lines := []
	for id in Content.RESOURCE_IDS:
		if d["slots"][id] > 0:
			lines.append(id)
	var progress := true
	while budget > 0 and progress:
		progress = false
		for id in lines:
			if budget <= 0:
				break
			if state["jobs"][id] >= d["slots"][id]:
				continue
			state["jobs"][id] += 1
			budget -= 1
			progress = true
