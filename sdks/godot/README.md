# SDK Dev AppStore pour Godot 4

Remet automatiquement au jeu les achats faits sur la place de marché Dev AppStore.
GDScript pur, aucune dépendance. **Godot 4.2 ou plus récent.**

## Le plus simple : glisser-déposer

1. Décompressez `devappstore-godot-<version>.zip` à la racine du projet (dossier `addons/devappstore`), puis activez le
   plugin **DevAppStore** dans *Projet > Paramètres du projet > Plugins*.
2. Collez la **clé publique** du jeu (`das_pub_…`) dans le réglage `devappstore/api/publishable_key`, et l'adresse de
   Dev AppStore dans `devappstore/api/base_url`.
3. Glissez `res://addons/devappstore/link_button.tscn` dans votre menu : c'est le bouton **Boutique web**, avec sa
   fenêtre de code de liaison.
4. Connectez le signal `item_granted` à votre inventaire :

```gdscript
func _ready() -> void:
	DevAppStore.item_granted.connect(_on_item_granted)
	DevAppStore.item_revoked.connect(_on_item_revoked)  # remboursements

func _on_item_granted(product_id: String, quantity: int) -> void:
	Inventory.add(product_id, quantity)
	Save.write()  # sauvegardez avant de rendre la main : l'accusé de réception part juste après
```

Rien d'autre : un identifiant de joueur est créé pour l'appareil (`devappstore/player/use_device_id`), les achats sont
récupérés au lancement, au retour dans le jeu et à intervalle régulier, puis acquittés tout seuls
(`devappstore/delivery/auto_ack`). Si votre jeu a des comptes, appelez `DevAppStore.set_player_id(id)` à la connexion.

> Cette partie glisser-déposer (0.3) n'a pas encore été essayée dans l'éditeur Godot : relisez-la avant de livrer.

## Quelle clé ?

Ce SDK est pour un jeu **sans serveur** : il utilise la clé **publique** du jeu (`das_pub_…`, page *Intégration* de
l'espace studio), qui n'est pas secrète. Seule, elle permet uniquement de demander un code de liaison ; quand le joueur
a saisi le code sur Dev AppStore, le SDK reçoit un **jeton joueur** (mémorisé dans `user://devappstore_sdk.cfg`) qui donne accès
aux achats de **ce joueur**, et à rien d'autre.

**N'embarquez jamais la clé secrète** (`das_secret_…`) dans un export : elle peut être extraite et donne accès aux
achats de tous les joueurs. Si votre jeu a un serveur, recevez les achats par **webhook signé** sur ce serveur et faites
demander les codes de liaison par votre serveur, avec la clé secrète.

## Installation

1. Copiez `addons/devappstore/` dans le dossier `addons/` de votre projet.
2. *Projet > Paramètres du projet > Plugins* : activez **Dev AppStore**. Le plugin enregistre l'autoload `Dev AppStore`
   et ajoute les réglages suivants (*Paramètres du projet*, cochez « Paramètres avancés ») :

| Réglage | Défaut | Rôle |
|---|---|---|
| `devappstore/api/base_url` | `https://devappstore.example` | URL de Dev AppStore (en dev : `http://localhost:3000`) |
| `devappstore/api/publishable_key` | — | Clé **publique** du jeu (`das_pub_…`, page *Intégration*). L'ancien réglage `devappstore/api/api_key` est lu s'il est vide. |
| `devappstore/delivery/poll_interval_sec` | `60` | Intervalle de polling (0 = désactivé) |
| `devappstore/delivery/poll_on_focus` | `true` | Interroger au retour au premier plan |

Vous pouvez aussi tout régler à l'exécution : `DevAppStore.configure(publishable_key, base_url, poll_interval_sec)`.

## Fonctionnement

- **Liaison** (une fois par appareil) : `request_link_code()` → `POST /api/v1/link-codes` renvoie le code et un
  `link_request_id` ; le SDK interroge `GET /api/v1/link-requests/{id}` toutes les 3 s jusqu'à la saisie du code, reçoit
  le jeton joueur et émet `linked(player_id)`. Sans jeton, aucun achat n'est récupéré (`is_linked()` vaut `false`).
- Toutes les requêtes envoient `Authorization: Bearer <clé publique>` et, après la liaison, `DevAppStore-Player-Token: <jeton>`
  (jamais dans l'URL). Un jeton révoqué (`unlink()`, studio, serveur du jeu) est oublié et `unlinked` est émis.
- Une fois lié, le SDK interroge `GET /api/v1/deliveries?player_id=…` au lancement (dès que `player_id` est connu), toutes les
  `poll_interval_sec` secondes, et à `NOTIFICATION_APPLICATION_FOCUS_IN` / `NOTIFICATION_APPLICATION_RESUMED` (mobile).
- Chaque livraison est émise **une seule fois par `delivery_id`** via `purchase_received` (ou `refund_received`).
- Vous créditez le joueur, **sauvegardez**, puis appelez `DevAppStore.ack(delivery_id)` → `POST /api/v1/deliveries/{id}/ack`.
- Une livraison non acquittée est renvoyée par le serveur : si le jeu plante avant d'avoir crédité, l'achat revient
  au prochain lancement (livraison « au moins une fois »).
- L'accusé de réception est persisté dans `user://devappstore_sdk.cfg` : si l'envoi échoue (hors ligne), il est
  renvoyé au polling suivant **sans réémettre** le signal.

## Exemple

```gdscript
extends Node

func _ready() -> void:
	DevAppStore.purchase_received.connect(_on_purchase)
	DevAppStore.refund_received.connect(_on_refund)
	DevAppStore.request_failed.connect(func(endpoint, status, code, msg):
		push_warning("Dev AppStore %s : %d %s %s" % [endpoint, status, code, msg]))
	# Après la connexion du joueur dans VOTRE jeu :
	DevAppStore.set_player_id(Save.player_id)  # déclenche un polling immédiat


func _on_purchase(p: Dictionary) -> void:
	# Idempotence côté jeu : ne jamais créditer deux fois la même livraison,
	# même si le jeu a planté entre la sauvegarde et l'ack.
	if Save.delivered_ids.has(p.delivery_id):
		DevAppStore.ack(p.delivery_id)
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
	DevAppStore.ack(p.delivery_id)    # 2. puis seulement l'accusé de réception


func _on_refund(p: Dictionary) -> void:
	# Remboursement : même order_id que l'achat. Ne retirer que si cette commande avait été créditée.
	if Save.credited_orders.has(p.order_id) and p.product_id == "gems_500":
		Save.gems = max(0, Save.gems - 500 * p.quantity)
		Save.credited_orders.erase(p.order_id)
		Save.write()
	DevAppStore.ack(p.delivery_id)  # acquitter dans tous les cas
```

(Dans `_on_purchase`, ajoutez `Save.credited_orders[p.order_id] = true` au moment du crédit.)

### Liaison par code

```gdscript
func _ready() -> void:
	DevAppStore.linked.connect(func(_pid): $CodeLabel.text = "Compte web lié ✓")
	DevAppStore.unlinked.connect(func(): $CodeLabel.text = "Compte web non lié")


func _on_link_button_pressed() -> void:
	var r := await DevAppStore.request_link_code(Save.player_name)
	if r.is_empty():
		$CodeLabel.text = "Impossible d'obtenir un code, réessayez."
		return
	# Le SDK attend la saisie en arrière-plan, puis émet `linked` et récupère les achats.
	$CodeLabel.text = "Saisissez %s sur devappstore (expire %s)" % [r.code, r.expires_at]


func _on_unlink_button_pressed() -> void:
	await DevAppStore.unlink()  # révoque le jeton de cet appareil
```

Le signal `link_code_received(code, expires_at)` est aussi émis.

## Référence

| Membre | Description |
|---|---|
| `signal purchase_received(purchase: Dictionary)` | Achat (`event == "purchase.completed"`) |
| `signal refund_received(purchase: Dictionary)` | Remboursement (`event == "purchase.refunded"`) |
| `signal ack_completed(delivery_id: String)` | Ack confirmé par le serveur |
| `signal link_code_received(code: String, expires_at: String)` | Code de liaison obtenu |
| `signal linked(player_id: String)` | Jeton joueur reçu après la saisie du code |
| `signal unlinked()` | Jeton révoqué ou oublié : proposer de relier le compte |
| `signal request_failed(endpoint, status, code, message)` | Erreur réseau (`status == 0`) ou API |
| `set_player_id(id)` | Joueur courant (ID dans votre jeu) ; lance un polling s'il est lié |
| `is_linked() -> bool` | Jeton joueur présent pour le joueur courant |
| `poll()` | Polling manuel (ignoré si < 5 s depuis le précédent, ou sans liaison) |
| `ack(delivery_id)` | Accusé de réception, après crédit |
| `await request_link_code(player_name := "") -> Dictionary` | `{ code, expires_at, link_request_id }` ou `{}` ; attend ensuite la saisie |
| `cancel_link_wait()` | Arrête l'attente de la saisie du code |
| `await unlink()` | Révoque le jeton de cet appareil |
| `configure(publishable_key, base_url := "", poll_interval_sec := -1)` | Configuration à l'exécution |

Le dictionnaire `purchase` reprend `PurchaseEvent` : `event`, `delivery_id`, `order_id`, `game_id`, `player_id`,
`product_id`, `item_type`, `quantity` (int), `amount_cents` (int, centimes), `currency`, `created_at`.

**Remboursements** (`refund_received`, `event == "purchase.refunded"`) : même `order_id`, `product_id` et `quantity` que
l'achat, `delivery_id` propre. Retirez l'objet si cette commande avait été créditée, sinon ignorez l'événement ;
acquittez-le dans les deux cas. Un achat remboursé avant d'avoir été reçu n'est plus livré.

## Sécurité

Tout ce qui est embarqué dans un client peut être extrait : c'est pourquoi le SDK n'utilise que la clé **publique**, et
le jeton joueur ne donne accès qu'aux achats du joueur lié (faits par le compte Dev AppStore qui a saisi le code). Le crédit
reste néanmoins décidé par le client : pour des objets de valeur ou un jeu en ligne, préférez la livraison par
**webhook signé** vers votre serveur (voir ARCHITECTURE.md).

Migration depuis la 0.1 : renseignez `devappstore/api/publishable_key` (clé publique) à la place de `devappstore/api/api_key` ;
après la mise à jour, chaque joueur doit lier son compte une fois depuis le jeu.
