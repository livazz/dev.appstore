@tool
extends EditorPlugin
## Enregistre l'autoload « Wolleen » et ses réglages de projet quand le plugin est activé
## (Projet > Paramètres du projet > Plugins).

const AUTOLOAD_NAME := "Wolleen"
const AUTOLOAD_PATH := "res://addons/wolleen/wolleen.gd"

## clé -> [valeur par défaut, type, hint, hint_string]
const SETTINGS := {
	"wolleen/api/base_url": ["https://wolleen.example", TYPE_STRING, PROPERTY_HINT_NONE, ""],
	# Clé PUBLIQUE du jeu (wk_pub_…). Jamais la clé secrète. (L’ancien réglage wolleen/api/api_key reste lu si celui-ci est vide.)
	"wolleen/api/publishable_key": ["", TYPE_STRING, PROPERTY_HINT_NONE, ""],
	"wolleen/delivery/poll_interval_sec": [60.0, TYPE_FLOAT, PROPERTY_HINT_RANGE, "0,3600,1,suffix:s"],
	"wolleen/delivery/poll_on_focus": [true, TYPE_BOOL, PROPERTY_HINT_NONE, ""],
}


func _enable_plugin() -> void:
	add_autoload_singleton(AUTOLOAD_NAME, AUTOLOAD_PATH)
	for key: String in SETTINGS:
		var spec: Array = SETTINGS[key]
		if not ProjectSettings.has_setting(key):
			ProjectSettings.set_setting(key, spec[0])
		ProjectSettings.set_initial_value(key, spec[0])
		ProjectSettings.add_property_info({
			"name": key,
			"type": spec[1],
			"hint": spec[2],
			"hint_string": spec[3],
		})
	ProjectSettings.save()


func _disable_plugin() -> void:
	remove_autoload_singleton(AUTOLOAD_NAME)
