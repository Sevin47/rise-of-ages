## The landing menu, and the thing that owns the game scene.
##
## The invariant worth stating, because it is the one that bites: **no game
## exists while this menu is up**. The TypeScript build learned this the hard
## way. If the menu keeps a game running behind it so the backdrop moves, that
## game's autosave fires every ten seconds and overwrites the very save the
## Continue button is offering. Here it is structural rather than remembered:
## there is nothing to autosave because nothing has been instantiated.
extends Node

const GAME := preload("res://game.tscn")

var _panel: PanelContainer
var _continue_btn: Button
var _summary: Label
var _confirm: ConfirmationDialog
var _game: Node2D


func _ready() -> void:
	_build_menu()
	show_menu()


func _build_menu() -> void:
	var layer := CanvasLayer.new()
	layer.name = "MenuLayer"
	add_child(layer)

	var root_ctrl := Control.new()
	root_ctrl.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(root_ctrl)

	# A plain ground behind the menu. The TypeScript build drifts a live map
	# back there, which is prettier, but doing that here would mean running a
	# world while the menu is open, and that is exactly what must not happen.
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.09, 0.13, 0.09)
	root_ctrl.add_child(bg)

	# A CenterContainer rather than a centre anchor with an offset: the panel is
	# as tall as its contents, so any hand-written offset is only correct until
	# a line of text changes length.
	var centre := CenterContainer.new()
	centre.set_anchors_preset(Control.PRESET_FULL_RECT)
	root_ctrl.add_child(centre)

	_panel = PanelContainer.new()
	_panel.custom_minimum_size = Vector2(420, 0)
	centre.add_child(_panel)

	var pad := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		pad.add_theme_constant_override("margin_" + side, 28)
	_panel.add_child(pad)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	pad.add_child(col)

	var title := Label.new()
	title.text = "Rise of Ages"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 28)
	col.add_child(title)

	var sub := Label.new()
	sub.text = "Carry one nation from the Ancient world to the Information Age.\nWhere you build matters as much as what."
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 12)
	col.add_child(sub)

	col.add_child(HSeparator.new())

	_continue_btn = Button.new()
	_continue_btn.text = "Continue"
	_continue_btn.pressed.connect(_on_continue)
	col.add_child(_continue_btn)

	_summary = Label.new()
	_summary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_summary.add_theme_font_size_override("font_size", 11)
	col.add_child(_summary)

	var new_btn := Button.new()
	new_btn.text = "New Nation"
	new_btn.pressed.connect(_on_new_pressed)
	col.add_child(new_btn)

	var quit_btn := Button.new()
	quit_btn.text = "Quit"
	quit_btn.pressed.connect(func(): get_tree().quit())
	col.add_child(quit_btn)

	var keys := Label.new()
	keys.text = "Drag to pan, wheel to zoom, arrows to scroll. Esc returns here."
	keys.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	keys.add_theme_font_size_override("font_size", 10)
	col.add_child(keys)

	# Starting fresh destroys the only copy of a nation, so it asks first.
	_confirm = ConfirmationDialog.new()
	_confirm.title = "Start a new nation?"
	_confirm.dialog_text = (
		"The nation saved on this machine is replaced, and it is the only copy.\n"
		+ "There is no undo."
	)
	_confirm.ok_button_text = "Start a new nation"
	_confirm.confirmed.connect(_start.bind(true))
	root_ctrl.add_child(_confirm)


## Show the menu and refresh what it says about the save.
func show_menu() -> void:
	var layer := get_node_or_null("MenuLayer")
	if layer:
		layer.visible = true
	_game = null

	var save := SaveGame.peek()
	if save.is_empty():
		_continue_btn.disabled = true
		_summary.text = "No nation saved yet."
	else:
		_continue_btn.disabled = false
		_summary.text = "%s  ·  %d citizens  ·  %d buildings\nsaved %s" % [
			Content.AGES[save["age"]]["name"], save["citizens"], save["buildings"],
			_ago(Time.get_unix_time_from_system() - save["saved_at"]),
		]


func _ago(seconds: float) -> String:
	if seconds < 90.0:
		return "just now"
	var m := int(seconds / 60.0)
	if m < 60:
		return "%d minute%s ago" % [m, "" if m == 1 else "s"]
	var h := int(m / 60.0)
	if h < 24:
		return "%d hour%s ago" % [h, "" if h == 1 else "s"]
	var d := int(h / 24.0)
	return "%d day%s ago" % [d, "" if d == 1 else "s"]


func _on_continue() -> void:
	_start(false)


func _on_new_pressed() -> void:
	if SaveGame.has_save():
		_confirm.popup_centered()
	else:
		_start(true)


func _start(fresh: bool) -> void:
	var layer := get_node_or_null("MenuLayer")
	if layer:
		layer.visible = false
	_game = GAME.instantiate()
	# Set before the scene enters the tree, so _ready sees it.
	_game.start_new = fresh
	add_child(_game)
