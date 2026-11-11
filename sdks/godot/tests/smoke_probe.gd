extends Control
## Essai de bout en bout du plugin dans le moteur (voir e2e/tests/sdk-godot.spec.ts).
## La scène contient le bouton glissé depuis res://addons/devappstore/link_button.tscn ; ce script joue le jeu du
## studio (il connecte item_granted à son « inventaire ») et le joueur (il appuie sur le bouton).
## L'état du SDK est lu par l'autoload avant cette scène : pour un appareil neuf, le test change config/name (dossier
## user:// propre à chaque essai).
## Écrit dans le dossier passé après « -- » : code.txt, linked.txt, granted.txt, result.txt, errors.txt,
## et, avec « shots » en second argument, bouton.png et code.png.

var out_dir := ""
var shots := false
var errors := PackedStringArray()
var granted := PackedStringArray()


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	out_dir = args[0] if args.size() > 0 else "user://smoke"
	shots = args.size() > 1 and args[1] == "shots"
	DirAccess.make_dir_recursive_absolute(out_dir)

	DevAppStore.item_granted.connect(_on_item_granted)
	DevAppStore.link_code_received.connect(func(code: String, _exp: String) -> void: _write("code.txt", code))
	DevAppStore.linked.connect(func(_pid: String) -> void: _write("linked.txt", "1"))
	DevAppStore.ack_completed.connect(_on_ack)
	DevAppStore.request_failed.connect(_on_failed)

	await get_tree().create_timer(1.0).timeout
	if shots:
		await _shot("bouton.png")
	$DevAppStoreLinkButton.pressed.emit()  # le joueur appuie sur « Boutique web »
	if shots:
		await get_tree().create_timer(3.0).timeout
		await _shot("code.png")
		_write("result.txt", "SHOTS")
		get_tree().quit()
		return
	await get_tree().create_timer(240.0).timeout
	_write("result.txt", "TIMEOUT")
	get_tree().quit(3)


func _on_item_granted(product_id: String, quantity: int) -> void:
	granted.append("%s %d" % [product_id, quantity])
	_write("granted.txt", "\n".join(granted))


func _on_ack(_delivery_id: String) -> void:
	_write("result.txt", "OK" if errors.is_empty() else "ERRORS")
	get_tree().quit(0 if errors.is_empty() else 2)


func _on_failed(endpoint: String, status: int, code: String, message: String) -> void:
	errors.append("%s %d %s %s" % [endpoint, status, code, message])
	_write("errors.txt", "\n".join(errors))


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	# La fenêtre du code est une sous-fenêtre intégrée : elle fait partie de l'image de la fenêtre principale.
	get_viewport().get_texture().get_image().save_png(out_dir.path_join(name))


func _write(name: String, text: String) -> void:
	var f := FileAccess.open(out_dir.path_join(name), FileAccess.WRITE)
	if f == null:
		push_error("écriture impossible : %s" % out_dir.path_join(name))
		return
	f.store_string(text)
	f.close()
