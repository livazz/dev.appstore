# Wolleen SDK pour Unity (`com.wolleen.sdk`)

Les achats faits par vos joueurs sur la boutique web Wolleen arrivent **automatiquement** dans le jeu.
Unity 2021.3 ou plus récent, toutes plateformes (UnityWebRequest + JsonUtility, aucune dépendance).

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
        // 1. Client (ou ajoutez le composant WolleenClient dans une scène et renseignez l'inspecteur).
        wolleen = WolleenClient.Create("wk_live_…", "https://wolleen.com", pollIntervalSeconds: 30);

        // 2. Créditer l'achat. Lever une exception = pas d'ack, l'achat sera reproposé.
        wolleen.OnPurchase += e =>
        {
            if (e.IsRefund) Inventory.Remove(e.product_id, e.quantity);
            else Inventory.Add(e.product_id, e.quantity);
            SaveGame(); // persistez AVANT de rendre la main : l'ack part juste après
        };
        wolleen.OnError += err => Debug.LogWarning(err);

        // 3. Le joueur est connecté : rattrapage immédiat, puis toutes les 30 s et au retour au premier plan.
        wolleen.SetPlayer(PlayerAccount.Id);
    }

    // 4. Paramètres → « Lier mon compte web » : afficher le code que le joueur saisit sur Wolleen.
    public void OnLinkButton()
    {
        wolleen.RequestLinkCode(PlayerAccount.Name,
            code => linkLabel.text = $"{code.code}\nSaisissez ce code sur wolleen.com",
            err => linkLabel.text = "Réessayez plus tard");
    }
}
```

## Comportement

| Quand | Quoi |
|---|---|
| `SetPlayer`, lancement (`OnEnable`) | `GET /api/v1/deliveries?player_id=…` |
| Toutes les `pollIntervalSeconds` (≥ 5 s, temps réel) | idem |
| `OnApplicationFocus(true)` / `OnApplicationPause(false)` | idem (le joueur revient de la boutique web) |
| `CheckNow()` | idem, à la demande |
| Après `OnPurchase` sans exception | `POST /api/v1/deliveries/{id}/ack` (`autoAck`, activé par défaut) |
| `RequestLinkCode(name, ok, err)` | `POST /api/v1/link-codes` → `LinkCode { code, expires_at }` |

- **Jamais de double crédit** : chaque `delivery_id` n'est passé qu'une fois à `OnPurchase` ; les 200 derniers sont mémorisés
  dans `PlayerPrefs` (`wolleen.processed.<playerId>`), sauvegardés avant l'ack. Si l'ack s'est perdu, l'achat renvoyé est
  seulement ré-acquitté. Si votre sauvegarde est côté serveur, utilisez aussi `delivery_id` comme clé d'idempotence.
- `PurchaseEvent` : `event` (`purchase.completed` | `purchase.refunded`), `delivery_id`, `order_id`, `game_id`, `player_id`,
  `product_id`, `item_type`, `quantity`, `amount_cents` (centimes), `currency`, `created_at`.
- Erreurs : `WolleenError { Status, Code, Message }` (`Status = 0` pour le réseau).

## Jeu avec serveur

Si votre jeu a un serveur, préférez le **webhook** (`Wolleen-Signature`, voir `@wolleen/sdk/server`) et gardez la clé API côté
serveur ; le client Unity n'a alors besoin que d'afficher le code de liaison (obtenu via votre serveur).

> Le temps réel (flux SSE) est disponible dans le SDK JavaScript ; en Unity, l'interrogation au premier plan suffit
> (le joueur revient de son navigateur), avec `CheckNow()` pour forcer une vérification.
