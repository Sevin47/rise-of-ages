## All static game data, ported from src/content.ts.
##
## This is a spike: the point is to prove the tuned economy survives a move to
## Godot before any UI work is done. Every number here is copied across
## unchanged, and godot/balance.gd re-runs the TypeScript autoplayer against it
## so the two timelines can be compared directly.
##
## Kept as plain dictionaries rather than Resources on purpose. A Resource per
## building would be more idiomatic Godot, but it would also make a mismatch
## between the two ports harder to spot, and proving they match is the whole
## job. That conversion is cheap to do afterwards.
class_name Content

const RESOURCE_IDS := ["food", "timber", "metal", "wealth", "knowledge", "oil"]
const TRACK_IDS := ["civic", "commerce", "science", "craft"]

const RESOURCES := {
	"food": {"name": "Food", "age": 0, "base_cap": 500.0},
	"timber": {"name": "Timber", "age": 0, "base_cap": 500.0},
	"metal": {"name": "Metal", "age": 0, "base_cap": 300.0},
	"wealth": {"name": "Wealth", "age": 0, "base_cap": 300.0},
	"knowledge": {"name": "Knowledge", "age": 0, "base_cap": 250.0},
	"oil": {"name": "Oil", "age": 5, "base_cap": 400.0},
}

## At least this many of the four tracks must match the age you are leaving.
const TRACKS_NEEDED_TO_ADVANCE := 3

const AGES := [
	{"name": "Ancient Age", "cost": {"food": 400.0, "timber": 400.0, "metal": 150.0, "knowledge": 150.0}},
	{"name": "Classical Age", "cost": {"food": 13000.0, "timber": 13000.0, "metal": 6600.0, "wealth": 4200.0, "knowledge": 5400.0}},
	{"name": "Medieval Age", "cost": {"food": 72000.0, "timber": 72000.0, "metal": 42000.0, "wealth": 30000.0, "knowledge": 33000.0}},
	{"name": "Gunpowder Age", "cost": {"food": 4.2e5, "timber": 4.2e5, "metal": 2.7e5, "wealth": 2.0e5, "knowledge": 2.0e5}},
	{"name": "Enlightenment Age", "cost": {"food": 2.5e6, "timber": 2.5e6, "metal": 1.7e6, "wealth": 1.4e6, "knowledge": 1.3e6}},
	{"name": "Industrial Age", "cost": {"food": 1.3e7, "timber": 1.3e7, "metal": 9.5e6, "wealth": 7.5e6, "knowledge": 6.5e6, "oil": 1.0e5}},
	{"name": "Modern Age", "cost": {"food": 6.8e7, "timber": 6.8e7, "metal": 5.2e7, "wealth": 4.4e7, "knowledge": 3.6e7, "oil": 1.6e6}},
	{"name": "Information Age", "cost": {}},
]

const MAX_AGE := 7  # AGES.size() - 1

const TRACKS := {
	"civic": {"name": "Civic", "with": "food"},
	"commerce": {"name": "Commerce", "with": "wealth"},
	"science": {"name": "Science", "with": "metal"},
	"craft": {"name": "Craft", "with": "timber"},
}

const MAX_TRACK_LEVEL := 8  # AGES.size()

## Knowledge price of taking a track from `level` to `level + 1`.
static func tech_cost(level: int) -> Dictionary:
	return {
		"knowledge": roundf(60.0 * pow(4.6, level)),
		"secondary": roundf(120.0 * pow(5.1, level)),
	}

# ---------------------------------------------------------------- buildings

## `produces` is {res, base, per_citizen, slots}; `effects` mirrors the
## TypeScript BuildingEffects. Absent keys mean the building has none.
const BUILDINGS := [
	{
		"id": "city", "age": 0, "growth": 2.1,
		"cost": {"food": 340.0, "timber": 340.0},
		"effects": {
			"pop_cap": 16.0, "build_cap": 12.0,
			"caps": {"food": 400.0, "timber": 400.0, "metal": 250.0, "wealth": 250.0, "knowledge": 200.0},
		},
		"city_limited": true, "free_of_build_cap": true,
	},
	{
		"id": "farm", "age": 0, "growth": 1.14,
		"cost": {"timber": 16.0},
		"produces": {"res": "food", "base": 0.2, "per_citizen": 0.3, "slots": 2},
	},
	{
		"id": "camp", "age": 0, "growth": 1.14,
		"cost": {"food": 16.0},
		"produces": {"res": "timber", "base": 0.18, "per_citizen": 0.27, "slots": 2},
	},
	{
		"id": "mine", "age": 0, "growth": 1.17,
		"cost": {"timber": 45.0, "food": 25.0},
		"produces": {"res": "metal", "base": 0.11, "per_citizen": 0.2, "slots": 2},
	},
	{
		"id": "market", "age": 0, "growth": 1.21,
		"cost": {"timber": 90.0, "metal": 30.0},
		"produces": {"res": "wealth", "base": 0.09, "per_citizen": 0.17, "slots": 2},
		"effects": {"routes": 0.5},
	},
	{
		"id": "library", "age": 0, "growth": 1.24,
		"cost": {"timber": 140.0, "metal": 60.0},
		"produces": {"res": "knowledge", "base": 0.05, "per_citizen": 0.11, "slots": 2},
	},
	{
		"id": "granary", "age": 0, "growth": 1.55,
		"cost": {"timber": 70.0, "food": 40.0},
		"effects": {
			"caps": {"food": 400.0, "timber": 400.0},
			"cap_scale": {"food": 0.3, "timber": 0.3},
		},
	},
	{
		"id": "temple", "age": 0, "growth": 1.34,
		"cost": {"timber": 170.0, "metal": 70.0, "wealth": 40.0},
		"effects": {"pop_cap": 7.0, "growth_mult": 0.16},
	},
	{
		"id": "warehouse", "age": 1, "growth": 1.55,
		"cost": {"timber": 260.0, "metal": 130.0},
		"effects": {
			"caps": {"metal": 400.0, "wealth": 400.0, "knowledge": 250.0},
			"cap_scale": {"metal": 0.3, "wealth": 0.3, "knowledge": 0.25},
		},
	},
	{
		"id": "workshop", "age": 1, "growth": 1.42,
		"cost": {"timber": 400.0, "metal": 220.0, "wealth": 90.0},
		"effects": {"output_mult": 0.07},
	},
	{
		"id": "university", "age": 2, "growth": 1.4,
		"cost": {"timber": 1400.0, "metal": 900.0, "wealth": 700.0},
		"produces": {"res": "knowledge", "base": 0.6, "per_citizen": 0.55, "slots": 3},
		"effects": {"research_discount": 0.04},
	},
	{
		"id": "well", "age": 5, "growth": 1.28,
		"cost": {"timber": 9e4, "metal": 1.4e5, "wealth": 8e4},
		"produces": {"res": "oil", "base": 1.4, "per_citizen": 1.1, "slots": 3},
	},
]

static func building(id: String) -> Dictionary:
	for b in BUILDINGS:
		if b["id"] == id:
			return b
	return {}

# ------------------------------------------------------------------ wonders

const WONDERS := [
	{"id": "pyramid", "name": "The Pyramids", "age": 0,
	 "cost": {"food": 900.0, "timber": 900.0, "metal": 400.0},
	 "effects": {"res_mult": {"food": 0.3, "timber": 0.3}}},
	{"id": "colossus", "name": "The Colossus", "age": 0,
	 "cost": {"metal": 700.0, "timber": 500.0, "wealth": 300.0},
	 "effects": {"res_mult": {"wealth": 0.4}}},
	{"id": "gardens", "name": "The Hanging Gardens", "age": 1,
	 "cost": {"food": 5000.0, "timber": 4000.0, "wealth": 2000.0},
	 "effects": {"pop_mult": 0.25, "growth_mult": 0.4}},
	{"id": "colosseum", "name": "The Colosseum", "age": 1,
	 "cost": {"metal": 5000.0, "timber": 5000.0, "wealth": 3500.0},
	 "effects": {"output_mult": 0.18}},
	{"id": "greatwall", "name": "The Great Wall", "age": 2,
	 "cost": {"timber": 30000.0, "metal": 26000.0, "food": 20000.0},
	 "effects": {"cap_mult": 0.8}},
	{"id": "cathedral", "name": "The Grand Cathedral", "age": 2,
	 "cost": {"timber": 26000.0, "metal": 22000.0, "wealth": 20000.0, "knowledge": 9000.0},
	 "effects": {"research_discount": 0.25}},
	{"id": "pagoda", "name": "The Porcelain Tower", "age": 3,
	 "cost": {"timber": 2.0e5, "metal": 1.6e5, "wealth": 1.4e5, "knowledge": 6e4},
	 "effects": {"res_mult": {"knowledge": 0.5}}},
	{"id": "observatory", "name": "The Royal Observatory", "age": 4,
	 "cost": {"metal": 1.2e6, "wealth": 1.0e6, "knowledge": 5e5},
	 "effects": {"res_mult": {"knowledge": 0.4}, "research_discount": 0.15}},
	{"id": "tower", "name": "The Iron Tower", "age": 5,
	 "cost": {"metal": 9e6, "timber": 5e6, "wealth": 7e6, "oil": 60000.0},
	 "effects": {"output_mult": 0.3}},
	{"id": "collider", "name": "The Supercollider", "age": 6,
	 "cost": {"metal": 6e7, "wealth": 5e7, "knowledge": 3e7, "oil": 1.5e6},
	 "effects": {"res_mult": {"knowledge": 0.8}, "output_mult": 0.2}},
]

# -------------------------------------------------------------------- rares

const RARES := [
	{"id": "wine", "effects": {"res_mult": {"food": 0.14}}},
	{"id": "furs", "effects": {"res_mult": {"timber": 0.14}}},
	{"id": "gems", "effects": {"res_mult": {"metal": 0.14}}},
	{"id": "silk", "effects": {"res_mult": {"wealth": 0.16}}},
	{"id": "spice", "effects": {"res_mult": {"knowledge": 0.14}}},
	{"id": "marble", "effects": {"build_discount": 0.12}},
	{"id": "horses", "effects": {"growth_mult": 0.35}},
	{"id": "salt", "effects": {"cap_mult": 0.3}},
	{"id": "dyes", "effects": {"output_mult": 0.08}},
	{"id": "cotton", "effects": {"output_mult": 0.08}},
]

static func rare(id: String) -> Dictionary:
	for r in RARES:
		if r["id"] == id:
			return r
	return {}

# ------------------------------------------------------------- base numbers

const BASE := {
	"citizens": 3.0,
	"start_resources": {"food": 120.0, "timber": 120.0},
	"pop_cap": 12.0,
	"build_cap": 16.0,
	"city_cap": 1,
	"upkeep": 0.03,
	"growth": 0.075,
	"starvation": 0.5,
	"routes": 1.0,
}
