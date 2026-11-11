extends Button
## Bouton « Boutique web » prêt à poser : glissez res://addons/devappstore/link_button.tscn dans votre menu.
##
## Un appui ouvre une fenêtre avec le code de liaison que le joueur saisit sur la boutique web ; une fois le compte
## lié, la même fenêtre propose d'ouvrir la boutique ou de délier le compte. Les textes sont modifiables dans
## l'inspecteur (traduction). Nécessite le plugin DevAppStore activé (autoload « DevAppStore »).

@export var player_name: String = ""
## Rappel de la réduction du web par rapport aux achats en jeu. {0} = le pourcentage réel de votre boutique.
@export var discount_text: String = "Jusqu'à −{0} % par rapport aux achats en jeu"
@export_multiline var steps_text: String = "1. Ouvrez la boutique\n2. Connectez-vous\n3. Saisissez ce code"
@export_multiline var linked_text: String = "Compte lié. Vos achats faits sur la boutique arrivent tout seuls dans le jeu."
@export var open_store_text: String = "Ouvrir la boutique"
@export var new_code_text: String = "Nouveau code"
@export var unlink_text: String = "Délier ce compte"
@export var close_text: String = "Fermer"
@export var loading_text: String = "Un instant…"
@export var error_text: String = "Connexion impossible. Réessayez dans un instant."

var _popup: PopupPanel
var _message: Label
var _deal: Label
var _code: Label
var _action: Button
var _unlink: Button
var _busy: bool = false


func _ready() -> void:
	if text.is_empty():
		text = "Boutique web"
	pressed.connect(open_panel)
	_build()
	var sdk: Node = _sdk()
	if sdk != null:
		sdk.connect("link_code_received", _on_code)
		sdk.connect("linked", _on_linked)
		sdk.connect("unlinked", _refresh)


## Ouvre la fenêtre (à appeler aussi depuis votre propre menu).
func open_panel() -> void:
	var sdk: Node = _sdk()
	if sdk == null:
		push_error("[Dev AppStore] Activez le plugin DevAppStore (Projet > Paramètres du projet > Plugins).")
		return
	_refresh()
	_popup.popup_centered()
	if not _is_linked() and _code.text.is_empty():
		_request_code()


func _sdk() -> Node:
	return get_node_or_null("/root/DevAppStore")


func _is_linked() -> bool:
	var sdk: Node = _sdk()
	return sdk != null and bool(sdk.call("is_linked"))


func _build() -> void:
	_popup = PopupPanel.new()
	add_child(_popup)
	var margin := MarginContainer.new()
	for side: String in ["margin_left", "margin_top", "margin_right", "margin_bottom"]:
		margin.add_theme_constant_override(side, 16)
	_popup.add_child(margin)
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(320, 0)
	box.add_theme_constant_override("separation", 12)
	margin.add_child(box)

	var title := Label.new()
	title.text = text
	title.add_theme_font_size_override("font_size", 20)
	box.add_child(title)

	_deal = Label.new()
	_deal.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_deal.add_theme_color_override("font_color", Color("ffd43b"))
	box.add_child(_deal)

	_message = Label.new()
	_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(_message)

	_code = Label.new()
	_code.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_code.add_theme_font_size_override("font_size", 40)
	box.add_child(_code)

	_action = Button.new()
	_action.pressed.connect(_on_action)
	box.add_child(_action)

	_unlink = Button.new()
	_unlink.text = unlink_text
	_unlink.pressed.connect(_on_unlink)
	box.add_child(_unlink)

	var close := Button.new()
	close.text = close_text
	close.pressed.connect(_popup.hide)
	box.add_child(close)


func _refresh() -> void:
	var linked_now: bool = _is_linked()
	_unlink.visible = linked_now
	var sdk: Node = _sdk()
	var pct: int = int(sdk.get("web_discount_percent")) if sdk != null else 0
	_deal.visible = pct > 0 and not discount_text.is_empty()
	_deal.text = discount_text.replace("{0}", str(pct))
	_code.visible = not linked_now
	if linked_now:
		_code.text = ""
		_message.text = linked_text
		_action.text = open_store_text
	else:
		_message.text = steps_text
		_action.text = new_code_text if _code.text.is_empty() else open_store_text


func _request_code() -> void:
	if _busy:
		return
	_busy = true
	_code.text = ""
	_message.text = loading_text
	_action.disabled = true
	var result: Variant = await _sdk().call("request_link_code", player_name)
	_busy = false
	_action.disabled = false
	if result is Dictionary and not (result as Dictionary).is_empty():
		_refresh()
	else:
		_message.text = error_text
		_action.text = new_code_text


func _on_code(code: String, _expires_at: String) -> void:
	_code.text = code


func _on_linked(_player_id: String) -> void:
	_refresh()


func _on_action() -> void:
	if not _is_linked() and _code.text.is_empty():
		_request_code()
	else:
		_sdk().call("open_store")


func _on_unlink() -> void:
	_sdk().call("unlink")
