@tool
extends EditorPlugin
## Outil de test (voir e2e/tests/sdk-godot.spec.ts) : dans l'éditeur lancé sans interface, active le plugin DevAppStore
## comme le ferait un clic dans Projet > Paramètres du projet > Plugins, note ce que l'éditeur voit dans
## res://editor-report.txt, puis ferme l'éditeur.

const TARGET := "devappstore"
const KEYS := [
	"devappstore/api/base_url", "devappstore/api/publishable_key", "devappstore/delivery/poll_interval_sec",
	"devappstore/delivery/poll_on_focus", "devappstore/delivery/auto_ack", "devappstore/player/use_device_id",
]


func _enter_tree() -> void:
	_run.call_deferred()


func _run() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	var was_enabled := EditorInterface.is_plugin_enabled(TARGET)
	if not was_enabled:
		EditorInterface.set_plugin_enabled(TARGET, true)
		await get_tree().create_timer(1.0).timeout
		ProjectSettings.save()  # l'éditeur enregistre la liste des plugins en différé : on n'attend pas
	var lines := PackedStringArray()
	lines.append("was_enabled=%s" % was_enabled)
	lines.append("enabled=%s" % EditorInterface.is_plugin_enabled(TARGET))
	lines.append("autoload=%s" % ProjectSettings.get_setting("autoload/DevAppStore", ""))
	# Réglages visibles dans la fenêtre Paramètres du projet : ceux dont l'éditeur connaît le type.
	var listed := {}
	for info: Dictionary in ProjectSettings.get_property_list():
		listed[info["name"]] = true
	for key: String in KEYS:
		lines.append("%s has=%s listed=%s" % [key, ProjectSettings.has_setting(key), listed.has(key)])
	var f := FileAccess.open("res://editor-report.txt", FileAccess.WRITE)
	f.store_string("\n".join(lines) + "\n")
	f.close()
	get_tree().quit()
