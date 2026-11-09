# SDK Wolleen pour Godot 4

Remet automatiquement au jeu les achats faits sur la place de marché Wolleen.
GDScript pur, aucune dépendance. **Godot 4.2 ou plus récent.**

## Installation

1. Copiez `addons/wolleen/` dans le dossier `addons/` de votre projet.
2. *Projet > Paramètres du projet > Plugins* : activez **Wolleen**. Le plugin enregistre l'autoload `Wolleen`
   et ajoute les réglages suivants (*Paramètres du projet*, cochez « Paramètres avancés ») :

| Réglage | Défaut | Rôle |
|---|---|---|
| `wolleen/api/base_url` | `https://wolleen.example` | URL de Wolleen (en dev : `http://localhost:3000`) |
| `wolleen/api/api_key` | — | Clé API du jeu (`wk_…`, page *Intégration* de l'espace studio) |
| `wolleen/delivery/poll_interval_sec` | `60` | Intervalle de polling (0 = désactivé) |
| `wolleen/delivery/poll_on_focus` | `true` | Interroger au retour au premier plan |

Vous pouvez aussi tout régler à l'exécution : `Wolleen.configure(api_key, base_url, poll_interval_sec)`.

## Fonctionnement

- Le SDK interroge `GET /api/v1/deliveries?player_id=…` au lancement (dès que `player_id` est connu), toutes les
  `poll_interval_sec` secondes, et à `NOTIFICATION_APPLICATION_FOCUS_IN` / `NOTIFICATION_APPLICATION_RESUMED` (mobile).
- Chaque livraison est émise **une seule fois par `delivery_id`** via `purchase_received` (ou `refund_received`).
- Vous créditez le joueur, **sauvegardez**, puis appelez `Wolleen.ack(delivery_id)` → `POST /api/v1/deliveries/{id}/ack`.
- Une livraison non acquittée est renvoyée par le serveur : si le jeu plante avant d'avoir crédité, l'achat revient
  au prochain lancement (livraison « au moins une fois »).
- L'accusé de réception est persisté dans `user://wolleen_sdk.cfg` : si l'envoi échoue (hors ligne), il est
  renvoyé au polling suivant **sans réémettre** le signal.

## Exemple

```gdscript
extends Node

func _ready() -> void:
	Wolleen.purchase_received.connect(_on_purchase)
	Wolleen.refund_received.connect(_on_refund)
	Wolleen.request_failed.connect(func(endpoint, status, code, msg):
		push_warning("Wolleen %s : %d %s %s" % [endpoint, status, code, msg]))
	# Après la connexion du joueur dans VOTRE jeu :
	Wolleen.set_player_id(Save.player_id)  # déclenche un polling immédiat


func _on_purchase(p: Dictionary) -> void:
	# Idempotence côté jeu : ne jamais créditer deux fois la même livraison,
	# même si le jeu a planté entre la sauvegarde et l'ack.
	if Save.delivered_ids.has(p.delivery_id):
		Wolleen.ack(p.delivery_id)
		return
	match p.product_id:
		"gems_500":
			Save.gems += 500 * p.quantity
		"no_ads":
			Save.no_ads = true
		_:
			push_warning("Produit inconnu : %s" % p.product_id)
			return  # pas d'ack : l'achat sera re-proposé après mise à jour du jeu
	Save.delivered_ids.append(p.delivery_id)
	Save.write()                  # 1. crédit persisté
	Wolleen.ack(p.delivery_id)    # 2. puis seulement l'accusé de réception


func _on_refund(p: Dictionary) -> void:
	if p.product_id == "gems_500":
		Save.gems = max(0, Save.gems - 500 * p.quantity)
		Save.write()
	Wolleen.ack(p.delivery_id)
```

### Liaison par code

```gdscript
func _on_link_button_pressed() -> void:
	var r := await Wolleen.request_link_code(Save.player_name)
	if r.is_empty():
		$CodeLabel.text = "Impossible d'obtenir un code, réessayez."
		return
	$CodeLabel.text = "Saisissez %s sur wolleen (expire %s)" % [r.code, r.expires_at]
```

Le signal `link_code_received(code, expires_at)` est aussi émis.

## Référence

| Membre | Description |
|---|---|
| `signal purchase_received(purchase: Dictionary)` | Achat (`event == "purchase.completed"`) |
| `signal refund_received(purchase: Dictionary)` | Remboursement (`event == "purchase.refunded"`) |
| `signal ack_completed(delivery_id: String)` | Ack confirmé par le serveur |
| `signal link_code_received(code: String, expires_at: String)` | Code de liaison obtenu |
| `signal request_failed(endpoint, status, code, message)` | Erreur réseau (`status == 0`) ou API |
| `set_player_id(id)` | Joueur courant (ID dans votre jeu) ; lance un polling |
| `poll()` | Polling manuel (ignoré si < 5 s depuis le précédent) |
| `ack(delivery_id)` | Accusé de réception, après crédit |
| `await request_link_code(player_name := "") -> Dictionary` | `{ code, expires_at }` ou `{}` |
| `configure(api_key, base_url := "", poll_interval_sec := -1)` | Configuration à l'exécution |

Le dictionnaire `purchase` reprend `PurchaseEvent` : `event`, `delivery_id`, `order_id`, `game_id`, `player_id`,
`product_id`, `item_type`, `quantity` (int), `amount_cents` (int, centimes), `currency`, `created_at`.

## Sécurité

La clé API embarquée dans un client peut être extraite. Pour des objets de valeur ou un jeu en ligne, préférez
la livraison par **webhook signé** vers votre serveur (voir ARCHITECTURE.md) et gardez ce SDK pour les jeux
hors ligne ou en complément.
