# Dev AppStore SDK pour Unity (`com.devappstore.sdk`)

Les achats faits par vos joueurs sur la boutique web Dev AppStore arrivent **automatiquement** dans le jeu.
Unity 2021.3 ou plus récent, toutes plateformes (UnityWebRequest + JsonUtility, aucune dépendance).

## Le plus simple : le prefab glisser-déposer

1. Glissez `devappstore-unity-<version>.unitypackage` dans la fenêtre **Project** (ou installez le paquet par UPM, voir
   plus bas), puis glissez le prefab **DevAppStore** (dossier `Prefabs`) dans votre première scène.
2. Dans l'inspecteur, collez la **clé publique** du jeu (`das_pub_…`) dans **Publishable Key**.
3. Sous **On Item Granted (String, Int32)**, cliquez sur **+**, glissez l'objet qui gère votre inventaire et choisissez,
   dans « Dynamic Parameters », la méthode qui crédite le joueur :

```csharp
public void Grant(string productId, int quantity) { /* créditer, puis sauvegarder */ }
```

C'est tout. Le prefab affiche un bouton **Boutique web** : le joueur y trouve le code à saisir sur la boutique, une seule
fois. Ensuite ses achats arrivent au lancement du jeu, à chaque retour dans le jeu et toutes les 30 secondes, et sont
acquittés une fois votre méthode exécutée. **On Item Revoked** reçoit les remboursements.

- **Joueur** : par défaut (`This Device`), le prefab crée un identifiant et le garde sur l'appareil. Si votre jeu a des
  comptes, choisissez `Set By Game` et appelez `GetComponent<DevAppStoreDropIn>().SetPlayer(id, nom)` à la connexion.
- **Votre propre menu** : décochez **Show Button** et reliez votre bouton à `OpenLinkPanel()`. Pour un écran entièrement
  sur mesure, utilisez les événements **On Link Code**, **On Linked** et **On Unlinked**.
- **Sécurité des achats** : si rien n'est branché sur **On Item Granted**, ou si votre méthode lève une exception, l'achat
  n'est pas acquitté ; il reste en attente sur Dev AppStore et sera reproposé.
- **En local** (`http://localhost:3000`) : *Project Settings → Player → Allow downloads over HTTP* → *Always allowed*.
- Les textes affichés au joueur se traduisent dans **Labels**. L'écran intégré utilise IMGUI : aucune dépendance.

Vérifié dans Unity 6 par `e2e/tests/sdk-unity.spec.ts` (code de liaison, achat, objet reçu, accusé de réception).

## Quelle clé ?

Ce SDK est pour un jeu **sans serveur** : il utilise la clé **publique** du jeu (`das_pub_…`, page *Intégration* de
l'espace studio), qui n'est pas secrète. Seule, elle permet uniquement de demander un code de liaison ; quand le joueur
a saisi le code sur Dev AppStore, le SDK reçoit un **jeton joueur** (mémorisé dans `PlayerPrefs`) qui donne accès aux achats
de **ce joueur**, et à rien d'autre.

**N'embarquez jamais la clé secrète** (`das_secret_…`) dans un build : elle peut être extraite et donne accès aux achats
de tous les joueurs. Si votre jeu a un serveur, recevez les achats par **webhook signé** sur ce serveur (voir
`@devappstore/sdk/server`) et faites demander les codes de liaison par votre serveur, avec la clé secrète.

## Installation (UPM)

*Window → Package Manager → + → Add package from git URL…*

```
https://github.com/<organisation>/devappstore.git?path=/sdks/unity
```

ou, en local, *Add package from disk…* et choisissez `sdks/unity/package.json`.

## Intégration en 4 étapes

```csharp
using UnityEngine;
using DevAppStore;

public class Shop : MonoBehaviour
{
    DevAppStoreClient devappstore;

    void Start()
    {
        // 1. Client avec la clé PUBLIQUE (ou composant DevAppStoreClient dans une scène, renseigné dans l'inspecteur).
        devappstore = DevAppStoreClient.Create("das_pub_…", "https://devappstore.com", pollIntervalSeconds: 30);

        // 2. Appliquer achats et remboursements. Lever une exception = pas d'ack, l'événement sera reproposé.
        devappstore.OnPurchase += e =>
        {
            if (e.IsRefund) Inventory.RevokeOrder(e.order_id);              // seulement si cet order_id avait été crédité
            else Inventory.Grant(e.order_id, e.product_id, e.quantity);
            SaveGame(); // persistez AVANT de rendre la main : l'ack part juste après
        };
        devappstore.OnLinked += playerId => linkLabel.text = "Compte web lié ✓";
        devappstore.OnUnlinked += () => linkLabel.text = "Compte web non lié";
        devappstore.OnError += err => Debug.LogWarning(err);

        // 3. Le joueur est connecté : s'il est déjà lié, rattrapage immédiat, puis toutes les 30 s et au retour au premier plan.
        devappstore.SetPlayer(PlayerAccount.Id);
    }

    // 4. Paramètres → « Lier mon compte web » : afficher le code que le joueur saisit sur Dev AppStore.
    //    Le client attend la saisie, reçoit le jeton joueur (OnLinked) et commence à recevoir les achats.
    public void OnLinkButton()
    {
        devappstore.RequestLinkCode(PlayerAccount.Name,
            code => linkLabel.text = $"{code.code}\nSaisissez ce code sur devappstore.com",
            err => linkLabel.text = "Réessayez plus tard");
    }

    public void OnUnlinkButton() => devappstore.Unlink(); // révoque le jeton de cet appareil
}
```

## Comportement

| Quand | Quoi |
|---|---|
| `RequestLinkCode(name, ok, err)` | `POST /api/v1/link-codes` → `LinkCode { code, expires_at, link_request_id }`, puis `GET /api/v1/link-requests/{id}` toutes les 3 s jusqu'à la saisie → jeton joueur (`OnLinked`) |
| `SetPlayer`, lancement (`OnEnable`) — si lié | `GET /api/v1/deliveries?player_id=…` |
| Toutes les `pollIntervalSeconds` (≥ 5 s, temps réel) — si lié | idem |
| `OnApplicationFocus(true)` / `OnApplicationPause(false)` — si lié | idem (le joueur revient de la boutique web) |
| `CheckNow()` | idem, à la demande |
| Après `OnPurchase` sans exception | `POST /api/v1/deliveries/{id}/ack` (`autoAck`, activé par défaut) |
| `Unlink()` | `DELETE /api/v1/player-tokens` puis oubli du jeton (`OnUnlinked`) |

- Toutes les requêtes envoient `Authorization: Bearer <clé publique>` et, après la liaison, `DevAppStore-Player-Token: <jeton>`.
  La clé et le jeton ne sont jamais placés dans une URL.
- Jeton révoqué (par `Unlink`, par le studio ou par son serveur) : le SDK l'oublie et déclenche `OnUnlinked` ; proposez
  de nouveau « Lier mon compte web ».
- **Jamais de double crédit** : chaque `delivery_id` n'est passé qu'une fois à `OnPurchase` ; les 200 derniers sont mémorisés
  dans `PlayerPrefs` (`devappstore.processed.<playerId>`), sauvegardés avant l'ack. Si l'ack s'est perdu, l'achat renvoyé est
  seulement ré-acquitté.
- `PurchaseEvent` : `event` (`purchase.completed` | `purchase.refunded`), `delivery_id`, `order_id`, `game_id`, `player_id`,
  `product_id`, `item_type`, `quantity`, `amount_cents` (centimes), `currency`, `created_at`.
- **Remboursements** (`IsRefund`) : même `order_id`, `product_id` et `quantity` que l'achat, `delivery_id` propre. Retirez
  l'objet si cette commande avait été créditée, sinon ignorez l'événement ; il est acquitté dans les deux cas. Un achat
  remboursé avant d'avoir été reçu n'est plus livré.
- Erreurs : `DevAppStoreError { Status, Code, Message }` (`Status = 0` pour le réseau) — notamment `player_token_required`,
  `link_expired`, `link_already_claimed`.

> Le temps réel (flux SSE) est disponible dans le SDK JavaScript ; en Unity, l'interrogation au premier plan suffit
> (le joueur revient de son navigateur), avec `CheckNow()` pour forcer une vérification.

## Nouveautés de la 0.3

Prefab glisser-déposer (`DevAppStoreDropIn`), `link_url`, `store_url` et `web_discount_percent` dans `LinkCode` (l'écran fourni rappelle au joueur la réduction réelle de la boutique web), `PurchaseHandlerCount`. Aucun
changement incompatible : le code écrit pour la 0.2 fonctionne tel quel.

## Migration depuis 0.1

Le champ `apiKey` devient `publishableKey` (la valeur de l'inspecteur est reprise automatiquement) : remplacez-la par la
**clé publique** du jeu. Une clé qui ne commence pas par `das_pub_` est signalée au démarrage. Après la mise à jour,
chaque joueur doit lier son compte une fois depuis le jeu.
