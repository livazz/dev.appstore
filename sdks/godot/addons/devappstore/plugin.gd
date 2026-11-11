@tool
extends EditorPlugin
## Enregistre l'autoload « Dev AppStore » et ses réglages de projet quand le plugin est activé
## (Projet > Paramètres du projet > Plugins).

const AUTOLOAD_NAME := "DevAppStore"
const AUTOLOAD_PATH := "res://addons/devappstore/devappstore.gd"

## clé -> [valeur par défaut, type, hint, hint_string]
const SETTINGS := {
	"devappstore/api/base_url": ["https://devappstore.example", TYPE_STRING, PROPERTY_HINT_NONE, ""],
	# Clé PUBLIQUE du jeu (das_pub_…). Jamais la clé secrète. (L’ancien réglage devappstore/api/api_key reste lu si celui-ci est vide.)
	"devappstore/api/publishable_key": ["", TYPE_STRING, PROPERTY_HINT_NONE, ""],
	"devappstore/delivery/poll_interval_sec": [30.0, TYPE_FLOAT, PROPERTY_HINT_RANGE, "0,3600,1,suffix:s"],
	"devappstore/delivery/poll_on_focus": [true, TYPE_BOOL, PROPERTY_HINT_NONE, ""],
	# Acquitter tout seul après les signaux item_granted / item_revoked (intégration glisser-déposer).
	"devappstore/delivery/auto_ack": [true, TYPE_BOOL, PROPERTY_HINT_NONE, ""],
	# Jeu sans comptes : créer un identifiant de joueur pour cet appareil. Sinon, appelez DevAppStore.set_player_id().
	"devappstore/player/use_device_id": [true, TYPE_BOOL, PROPERTY_HINT_NONE, ""],
}


func _enter_tree() -> void:
	# À chaque ouverture de l'éditeur : sans cela, les réglages laissés à leur valeur par défaut (non enregistrés dans
	# project.godot) disparaissent de la fenêtre Paramètres du projet après un redémarrage.
	_register_settings()


func _enable_plugin() -> void:
	add_autoload_singleton(AUTOLOAD_NAME, AUTOLOAD_PATH)
	_register_settings()
	ProjectSettings.save()


func _register_settings() -> void:
	for key: String in SETTINGS:
		var spec: Array = SETTINGS[key]
		if not ProjectSettings.has_setting(key):
			ProjectSettings.set_setting(key, spec[0])
		ProjectSettings.set_initial_value(key, spec[0])
		# Réglages de base : visibles sans activer « Paramètres avancés ».
		ProjectSettings.set_as_basic(key, true)
		ProjectSettings.add_property_info({
			"name": key,
			"type": spec[1],
			"hint": spec[2],
			"hint_string": spec[3],
		})


func _disable_plugin() -> void:
	remove_autoload_singleton(AUTOLOAD_NAME)
