extends Node
## SDK Wolleen pour Godot 4.2+ (autoload « Wolleen ») — jeu SANS serveur.
##
## Récupère les achats faits sur la place de marché Wolleen et les remet au jeu :
## - liaison du compte : [method request_link_code] affiche un code que le joueur saisit sur Wolleen ; le SDK reçoit
##   alors un jeton joueur (mémorisé) qui donne accès aux achats de CE joueur seulement ([signal linked]) ;
## - interrogation (polling) au lancement, à intervalle régulier et au retour au premier plan, une fois lié ;
## - signal [signal purchase_received] (et [signal refund_received]) une seule fois par delivery_id ;
## - [method ack] à appeler UNIQUEMENT après que le jeu a crédité (et sauvegardé) l'objet.
##
## Clé PUBLIQUE uniquement (wk_pub_…, non secrète). N'embarquez jamais la clé secrète (wk_secret_…) dans le jeu.
##
## Contrat d'API (Authorization: Bearer <clé publique> ; après liaison, Wolleen-Player-Token: <jeton joueur>) :
##   POST   /api/v1/link-codes               -> { "code", "expires_at", "link_request_id" }
##   GET    /api/v1/link-requests/{id}       -> { "status": "pending"|"linked"|"expired"|"claimed", "player_token"? }
##   GET    /api/v1/deliveries?player_id=…   -> { "data": PurchaseEvent[] }            (jeton requis)
##   POST   /api/v1/deliveries/{id}/ack      -> { "ok": true }                         (jeton requis)
##   DELETE /api/v1/player-tokens            -> { "ok": true, "revoked": 1 }           (jeton requis)

## Émis une seule fois par delivery_id pour un achat (event == "purchase.completed").
## Créditez le joueur, sauvegardez, puis appelez [code]Wolleen.ack(purchase.delivery_id)[/code].
signal purchase_received(purchase: Dictionary)
## Émis pour un remboursement (event == "purchase.refunded") : retirez l'objet SI cet order_id avait été crédité
## (sinon ignorez), puis ack. Mêmes product_id / quantity que l'achat ; delivery_id propre.
signal refund_received(purchase: Dictionary)
## Émis quand le serveur Wolleen a confirmé l'accusé de réception.
signal ack_completed(delivery_id: String)
## Émis quand un code de liaison a été obtenu.
signal link_code_received(code: String, expires_at: String)
## Le joueur a saisi le code sur Wolleen : jeton joueur reçu, les achats commencent à arriver.
signal linked(player_id: String)
## Le jeton joueur a été révoqué ou oublié (unlink, révocation par le studio) : proposez de relier le compte.
signal unlinked()
## Émis pour toute erreur réseau ou API. [param status] vaut 0 si la requête n'a pas abouti.
signal request_failed(endpoint: String, status: int, code: String, message: String)

const SDK_VERSION := "0.2.0"
const STATE_PATH := "user://wolleen_sdk.cfg"
const PLAYER_TOKEN_HEADER := "Wolleen-Player-Token"
const MIN_POLL_GAP_MSEC := 5000
const MAX_REMEMBERED_ACKS := 500
const LINK_POLL_SEC := 3.0

## URL de base de Wolleen (sans / final). Réglage : wolleen/api/base_url.
var base_url: String = ""
## Clé PUBLIQUE du jeu (wk_pub_…). Réglage : wolleen/api/publishable_key.
var publishable_key: String = ""
## Intervalle de polling en secondes (0 = désactivé). Réglage : wolleen/delivery/poll_interval_sec.
var poll_interval_sec: float = 60.0
## Interroger au retour au premier plan. Réglage : wolleen/delivery/poll_on_focus.
var poll_on_focus: bool = true
## Identifiant du joueur dans VOTRE jeu (celui qui est lié sur Wolleen).
var player_id: String = ""

var _timer: Timer
var _polling := false
var _poll_queued := false
var _last_poll_msec := -MIN_POLL_GAP_MSEC
## delivery_id -> événement émis au jeu, en attente de crédit + ack (mémoire de session).
var _emitted: Dictionary = {}
## delivery_id -> true : crédité par le jeu, ack pas encore confirmé (persisté sur disque).
var _pending_ack: Dictionary = {}
## delivery_id déjà acquittés (persistés, bornés) pour ignorer une liste encore périmée.
var _acked: Array[String] = []
var _acks_in_flight: Dictionary = {}
## player_id -> jeton joueur (persisté sur disque).
var _tokens: Dictionary = {}
## Incrémenté pour annuler l'attente de liaison en cours.
var _link_wait_id := 0


func _ready() -> void:
	base_url = str(ProjectSettings.get_setting("wolleen/api/base_url", "https://wolleen.example"))
	publishable_key = str(ProjectSettings.get_setting("wolleen/api/publishable_key", ""))
	if publishable_key.is_empty():
		publishable_key = str(ProjectSettings.get_setting("wolleen/api/api_key", ""))  # réglage de la 0.1 (déprécié)
	poll_interval_sec = float(ProjectSettings.get_setting("wolleen/delivery/poll_interval_sec", 60.0))
	poll_on_focus = bool(ProjectSettings.get_setting("wolleen/delivery/poll_on_focus", true))
	_check_key()
	_load_state()

	_timer = Timer.new()
	_timer.one_shot = false
	_timer.timeout.connect(poll)
	add_child(_timer)
	_apply_interval()

	# Polling au lancement (si le joueur est déjà connu et lié) + renvoi des acks restés en attente.
	if not player_id.is_empty():
		poll.call_deferred()


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_FOCUS_IN, NOTIFICATION_APPLICATION_RESUMED:
			if poll_on_focus:
				poll()


# ---------------------------------------------------------------------------
# API publique
# ---------------------------------------------------------------------------

## Change la configuration à l'exécution (par ex. clé différente selon l'environnement).
func configure(new_publishable_key: String, new_base_url: String = "", new_poll_interval_sec: float = -1.0) -> void:
	publishable_key = new_publishable_key
	if not new_base_url.is_empty():
		base_url = new_base_url
	if new_poll_interval_sec >= 0.0:
		poll_interval_sec = new_poll_interval_sec
	_check_key()
	_apply_interval()


## Définit le joueur courant (après connexion dans votre jeu) et interroge immédiatement s'il est lié.
func set_player_id(id: String) -> void:
	if id == player_id:
		return
	player_id = id
	_emitted.clear()
	cancel_link_wait()
	if not player_id.is_empty():
		_last_poll_msec = -MIN_POLL_GAP_MSEC
		poll()


## Vrai si cet appareil a un jeton joueur pour le joueur courant (les achats sont accessibles).
func is_linked() -> bool:
	return not _token_for(player_id).is_empty()


## Interroge Wolleen pour les livraisons en attente du joueur courant (sans liaison : ne fait rien).
## Les appels rapprochés (< 5 s) sont ignorés ; un appel pendant un polling en cours est remis à la suite.
func poll() -> void:
	if publishable_key.is_empty() or player_id.is_empty() or not is_linked():
		return
	if _polling:
		_poll_queued = true
		return
	var now := Time.get_ticks_msec()
	if now - _last_poll_msec < MIN_POLL_GAP_MSEC:
		return
	_last_poll_msec = now
	_polling = true

	_flush_pending_acks()

	var requested_for := player_id
	var res := await _send(HTTPClient.METHOD_GET, "/api/v1/deliveries?player_id=" + requested_for.uri_encode(), null, true)
	_polling = false

	if res.ok and requested_for == player_id and res.json is Dictionary and res.json.get("data") is Array:
		for raw in res.json["data"]:
			if raw is Dictionary:
				_handle_event(_normalize(raw))
	elif not res.ok:
		_report_failure("deliveries", res)

	if _poll_queued:
		_poll_queued = false
		_last_poll_msec = -MIN_POLL_GAP_MSEC
		poll()


## Accuse réception d'une livraison. À appeler APRÈS avoir crédité et sauvegardé l'objet.
## L'accusé est persisté : s'il échoue (réseau), il est renvoyé au prochain polling,
## sans jamais réémettre [signal purchase_received] pour ce delivery_id.
func ack(delivery_id: String) -> void:
	if delivery_id.is_empty() or _acked.has(delivery_id):
		return
	_emitted.erase(delivery_id)
	if not _pending_ack.has(delivery_id):
		_pending_ack[delivery_id] = true
		_save_state()
	_send_ack(delivery_id)


## Demande un code de liaison à afficher au joueur (il le saisit sur la page du jeu sur Wolleen), puis attend la
## saisie en arrière-plan : [signal linked] est émis quand le jeton joueur est reçu.
## Utilisable avec await : [code]var r := await Wolleen.request_link_code()[/code].
## Renvoie { "code", "expires_at", "link_request_id" } ou un dictionnaire vide en cas d'erreur.
func request_link_code(player_name: String = "") -> Dictionary:
	if player_id.is_empty():
		request_failed.emit("link-codes", 0, "no_player", "player_id n'est pas défini (appelez set_player_id).")
		return {}
	var body := {"player_id": player_id}
	if not player_name.is_empty():
		body["player_name"] = player_name
	var res := await _send(HTTPClient.METHOD_POST, "/api/v1/link-codes", body)
	if res.ok and res.json is Dictionary and res.json.has("code"):
		var code := str(res.json["code"])
		var expires_at := str(res.json.get("expires_at", ""))
		var link_request_id := str(res.json.get("link_request_id", ""))
		link_code_received.emit(code, expires_at)
		if not link_request_id.is_empty():
			_wait_for_link(link_request_id, expires_at, player_id)
		return {"code": code, "expires_at": expires_at, "link_request_id": link_request_id}
	_report_failure("link-codes", res)
	return {}


## Arrête l'attente de la saisie du code (ex. le joueur ferme l'écran de liaison).
func cancel_link_wait() -> void:
	_link_wait_id += 1


## Délie cet appareil : révoque le jeton joueur côté Wolleen puis l'oublie ([signal unlinked]).
func unlink() -> void:
	if not is_linked():
		return
	var pid := player_id
	var res := await _send(HTTPClient.METHOD_DELETE, "/api/v1/player-tokens", null, true)
	if not res.ok:
		_report_failure("player-tokens", res)
	_clear_token(pid)


## Nombre d'accusés de réception en attente d'envoi (utile pour le débogage).
func pending_ack_count() -> int:
	return _pending_ack.size()


# ---------------------------------------------------------------------------
# Interne
# ---------------------------------------------------------------------------

func _check_key() -> void:
	if not publishable_key.is_empty() and not publishable_key.begins_with("wk_pub_"):
		push_error("[Wolleen] La clé configurée n'est pas une clé publique (wk_pub_…). Une clé secrète embarquée dans le jeu " +
			"peut être extraite et donne accès aux achats de tous les joueurs : utilisez la clé publique.")


func _token_for(pid: String) -> String:
	return str(_tokens.get(pid, ""))


func _clear_token(pid: String) -> void:
	if not _tokens.has(pid):
		return
	_tokens.erase(pid)
	_save_state()
	if pid == player_id:
		unlinked.emit()


func _wait_for_link(link_request_id: String, expires_at: String, for_player: String) -> void:
	_link_wait_id += 1
	var my_id := _link_wait_id
	var deadline := Time.get_unix_time_from_system() + 660.0
	if expires_at.length() >= 19:
		deadline = Time.get_unix_time_from_datetime_string(expires_at.substr(0, 19)) + 30.0
	while Time.get_unix_time_from_system() < deadline:
		await get_tree().create_timer(LINK_POLL_SEC).timeout
		if my_id != _link_wait_id:
			return
		var res := await _send(HTTPClient.METHOD_GET, "/api/v1/link-requests/" + link_request_id.uri_encode())
		if my_id != _link_wait_id:
			return
		if not res.ok:
			if int(res.status) == 401 or int(res.status) == 404:
				_report_failure("link-requests", res)
				return
			continue  # réseau : on réessaie
		var json: Variant = res.json
		if not (json is Dictionary):
			continue
		var status := str(json.get("status", ""))
		if status == "pending":
			continue
		if status == "linked" and not str(json.get("player_token", "")).is_empty():
			var pid := str(json.get("player_id", for_player))
			_tokens[pid] = str(json["player_token"])
			_save_state()
			linked.emit(pid)
			if pid == player_id:
				_last_poll_msec = -MIN_POLL_GAP_MSEC
				poll()
			return
		var code := "link_expired" if status == "expired" else "link_already_claimed"
		request_failed.emit("link-requests", 0, code, "Code expiré ou déjà utilisé : demandez un nouveau code.")
		return


func _handle_event(ev: Dictionary) -> void:
	var id: String = ev.get("delivery_id", "")
	if id.is_empty() or str(ev.get("player_id", "")) != player_id:
		return
	if _acked.has(id) or _emitted.has(id):
		return  # déjà acquitté, ou déjà remis au jeu dans cette session
	if _pending_ack.has(id):
		_send_ack(id)  # le jeu a déjà crédité : on renvoie seulement l'ack
		return
	_emitted[id] = ev
	if ev.get("event") == "purchase.refunded":
		refund_received.emit(ev)
	else:
		purchase_received.emit(ev)


func _send_ack(delivery_id: String) -> void:
	if _acks_in_flight.has(delivery_id) or not is_linked():
		return
	_acks_in_flight[delivery_id] = true
	var res := await _send(HTTPClient.METHOD_POST, "/api/v1/deliveries/%s/ack" % delivery_id.uri_encode(), null, true)
	_acks_in_flight.erase(delivery_id)
	# 404/409 : livraison inconnue ou déjà acquittée côté serveur -> inutile de réessayer.
	if res.ok or res.status == 404 or res.status == 409:
		_pending_ack.erase(delivery_id)
		_acked.append(delivery_id)
		while _acked.size() > MAX_REMEMBERED_ACKS:
			_acked.remove_at(0)
		_save_state()
		if res.ok:
			ack_completed.emit(delivery_id)
	else:
		_report_failure("ack", res)


func _flush_pending_acks() -> void:
	for id: String in _pending_ack.keys():
		_send_ack(id)


func _normalize(raw: Dictionary) -> Dictionary:
	# JSON.parse_string renvoie les nombres en float : on les ramène en int (montants en centimes).
	var ev := raw.duplicate()
	for key in ["delivery_id", "order_id", "game_id", "player_id", "product_id", "item_type", "currency", "created_at", "event"]:
		ev[key] = str(raw.get(key, ""))
	ev["quantity"] = int(raw.get("quantity", 1))
	ev["amount_cents"] = int(raw.get("amount_cents", 0))
	return ev


func _apply_interval() -> void:
	if _timer == null:
		return
	if poll_interval_sec > 0.0:
		_timer.wait_time = poll_interval_sec
		_timer.start()
	else:
		_timer.stop()


## Envoie une requête et renvoie { ok, status, json, error } (à utiliser avec await).
## La clé et le jeton voyagent en en-têtes, jamais dans l'URL. [param with_token] : jeton joueur requis.
func _send(method: HTTPClient.Method, path: String, body: Variant = null, with_token: bool = false) -> Dictionary:
	var for_player := player_id
	var token := _token_for(for_player)
	if with_token and token.is_empty():
		return {
			"ok": false, "status": 401, "error": "",
			"json": {"error": {"code": "player_token_required", "message": "Compte joueur non lié : appelez request_link_code()."}},
		}
	var http := HTTPRequest.new()
	http.timeout = 15.0
	add_child(http)
	var headers := PackedStringArray([
		"Authorization: Bearer " + publishable_key,
		"Accept: application/json",
		"User-Agent: wolleen-godot/" + SDK_VERSION,
	])
	if with_token:
		headers.append(PLAYER_TOKEN_HEADER + ": " + token)
	var data := ""
	if body != null:
		headers.append("Content-Type: application/json")
		data = JSON.stringify(body)
	var err := http.request(base_url.rstrip("/") + path, headers, method, data)
	if err != OK:
		http.queue_free()
		return {"ok": false, "status": 0, "json": null, "error": error_string(err)}
	var completed: Array = await http.request_completed
	http.queue_free()
	var result: int = completed[0]
	var status: int = completed[1]
	var raw: PackedByteArray = completed[3]
	var json: Variant = null
	if raw.size() > 0:
		json = JSON.parse_string(raw.get_string_from_utf8())
	# Jeton révoqué ou invalide : on l'oublie (signal unlinked), le jeu doit proposer de relier le compte.
	if with_token and status == 401 and json is Dictionary and json.get("error") is Dictionary:
		if str(json["error"].get("code", "")) == "player_token_required" and _token_for(for_player) == token:
			_clear_token(for_player)
	return {
		"ok": result == HTTPRequest.RESULT_SUCCESS and status >= 200 and status < 300,
		"status": status if result == HTTPRequest.RESULT_SUCCESS else 0,
		"json": json,
		"error": "" if result == HTTPRequest.RESULT_SUCCESS else "http_result_%d" % result,
	}


func _report_failure(endpoint: String, res: Dictionary) -> void:
	var code := "network_error"
	var message: String = res.get("error", "")
	var json: Variant = res.get("json")
	if json is Dictionary and json.get("error") is Dictionary:
		code = str(json["error"].get("code", "api_error"))
		message = str(json["error"].get("message", ""))
	elif int(res.get("status", 0)) > 0:
		code = "http_%d" % int(res["status"])
	request_failed.emit(endpoint, int(res.get("status", 0)), code, message)
	if int(res.get("status", 0)) == 401 and code == "unauthorized":
		push_warning("[Wolleen] Clé refusée (401) : vérifiez wolleen/api/publishable_key.")


func _load_state() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(STATE_PATH) != OK:
		return
	for id in cfg.get_value("acks", "pending", []):
		_pending_ack[str(id)] = true
	for id in cfg.get_value("acks", "done", []):
		_acked.append(str(id))
	var tokens: Variant = cfg.get_value("tokens", "by_player", {})
	if tokens is Dictionary:
		for pid in tokens:
			_tokens[str(pid)] = str(tokens[pid])


func _save_state() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("acks", "pending", _pending_ack.keys())
	cfg.set_value("acks", "done", _acked)
	cfg.set_value("tokens", "by_player", _tokens)
	var err := cfg.save(STATE_PATH)
	if err != OK:
		push_warning("[Wolleen] Impossible d'enregistrer %s : %s" % [STATE_PATH, error_string(err)])
