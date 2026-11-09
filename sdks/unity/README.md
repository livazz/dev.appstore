# Wolleen SDK pour Unity (`com.wolleen.sdk`)

Les achats faits par vos joueurs sur la boutique web Wolleen arrivent **automatiquement** dans le jeu.
Unity 2021.3 ou plus récent, toutes plateformes (UnityWebRequest + JsonUtility, aucune dépendance).

## Quelle clé ?

Ce SDK est pour un jeu **sans serveur** : il utilise la clé **publique** du jeu (`wk_pub_…`, page *Intégration* de
l'espace studio), qui n'est pas secrète. Seule, elle permet uniquement de demander un code de liaison ; quand le joueur
a saisi le code sur Wolleen, le SDK reçoit un **jeton joueur** (mémorisé dans `PlayerPrefs`) qui donne accès aux achats
de **ce joueur**, et à rien d'autre.

**N'embarquez jamais la clé secrète** (`wk_secret_…`) dans un build : elle peut être extraite et donne accès aux achats
de tous les joueurs. Si votre jeu a un serveur, recevez les achats par **webhook signé** sur ce serveur (voir
`@wolleen/sdk/server`) et faites demander les codes de liaison par votre serveur, avec la clé secrète.

## Installation (UPM)

*Window → Package Manager → + → Add package from git URL…*

```
https://github.com/<organisation>/wolleen.git?path=/sdks/unity
```

ou, en local, *Add package from disk…* et choisissez `sdks/unity/package.json`.

## Intégration en 4 étapes

```csharp
using UnityEngine;
using Wolleen;

public class Shop : MonoBehaviour
{
    WolleenClient wolleen;

    void Start()
    {
        // 1. Client avec la clé PUBLIQUE (ou composant WolleenClient dans une scène, renseigné dans l'inspecteur).
        wolleen = WolleenClient.Create("wk_pub_…", "https://wolleen.com", pollIntervalSeconds: 30);

        // 2. Appliquer achats et remboursements. Lever une exception = pas d'ack, l'événement sera reproposé.
        wolleen.OnPurchase += e =>
        {
            if (e.IsRefund) Inventory.RevokeOrder(e.order_id);              // seulement si cet order_id avait été crédité
            else Inventory.Grant(e.order_id, e.product_id, e.quantity);
            SaveGame(); // persistez AVANT de rendre la main : l'ack part juste après
        };
        wolleen.OnLinked += playerId => linkLabel.text = "Compte web lié ✓";
        wolleen.OnUnlinked += () => linkLabel.text = "Compte web non lié";
        wolleen.OnError += err => Debug.LogWarning(err);

        // 3. Le joueur est connecté : s'il est déjà lié, rattrapage immédiat, puis toutes les 30 s et au retour au premier plan.
        wolleen.SetPlayer(PlayerAccount.Id);
    }

    // 4. Paramètres → « Lier mon compte web » : afficher le code que le joueur saisit sur Wolleen.
    //    Le client attend la saisie, reçoit le jeton joueur (OnLinked) et commence à recevoir les achats.
    public void OnLinkButton()
    {
        wolleen.RequestLinkCode(PlayerAccount.Name,
            code => linkLabel.text = $"{code.code}\nSaisissez ce code sur wolleen.com",
            err => linkLabel.text = "Réessayez plus tard");
    }

    public void OnUnlinkButton() => wolleen.Unlink(); // révoque le jeton de cet appareil
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

- Toutes les requêtes envoient `Authorization: Bearer <clé publique>` et, après la liaison, `Wolleen-Player-Token: <jeton>`.
  La clé et le jeton ne sont jamais placés dans une URL.
- Jeton révoqué (par `Unlink`, par le studio ou par son serveur) : le SDK l'oublie et déclenche `OnUnlinked` ; proposez
  de nouveau « Lier mon compte web ».
- **Jamais de double crédit** : chaque `delivery_id` n'est passé qu'une fois à `OnPurchase` ; les 200 derniers sont mémorisés
  dans `PlayerPrefs` (`wolleen.processed.<playerId>`), sauvegardés avant l'ack. Si l'ack s'est perdu, l'achat renvoyé est
  seulement ré-acquitté.
- `PurchaseEvent` : `event` (`purchase.completed` | `purchase.refunded`), `delivery_id`, `order_id`, `game_id`, `player_id`,
  `product_id`, `item_type`, `quantity`, `amount_cents` (centimes), `currency`, `created_at`.
- **Remboursements** (`IsRefund`) : même `order_id`, `product_id` et `quantity` que l'achat, `delivery_id` propre. Retirez
  l'objet si cette commande avait été créditée, sinon ignorez l'événement ; il est acquitté dans les deux cas. Un achat
  remboursé avant d'avoir été reçu n'est plus livré.
- Erreurs : `WolleenError { Status, Code, Message }` (`Status = 0` pour le réseau) — notamment `player_token_required`,
  `link_expired`, `link_already_claimed`.

> Le temps réel (flux SSE) est disponible dans le SDK JavaScript ; en Unity, l'interrogation au premier plan suffit
> (le joueur revient de son navigateur), avec `CheckNow()` pour forcer une vérification.

## Migration depuis 0.1

Le champ `apiKey` devient `publishableKey` (la valeur de l'inspecteur est reprise automatiquement) : remplacez-la par la
**clé publique** du jeu. Une clé qui ne commence pas par `wk_pub_` est signalée au démarrage. Après la mise à jour,
chaque joueur doit lier son compte une fois depuis le jeu.
