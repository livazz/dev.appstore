# SDK Dev AppStore pour Unreal Engine 5

Remet automatiquement au jeu les achats faits sur la place de marché Dev AppStore.
Plugin C++ runtime, modules moteur uniquement (HTTP, Json, Slate, DeveloperSettings). **UE 5.1 ou plus récent.**

## Quelle clé ?

Ce SDK est pour un jeu **sans serveur** : il utilise la clé **publique** du jeu (`das_pub_…`, page *Intégration* de
l'espace studio), qui n'est pas secrète. Seule, elle permet uniquement de demander un code de liaison ; quand le joueur
a saisi le code sur Dev AppStore, le SDK reçoit un **jeton joueur** (sauvegardé dans le slot `DevAppStoreSDK`) qui donne accès
aux achats de **ce joueur**, et à rien d'autre.

**N'embarquez jamais la clé secrète** (`das_secret_…`) dans un build ni dans `DefaultGame.ini` : elle peut être extraite
et donne accès aux achats de tous les joueurs. Si votre jeu a un serveur dédié, recevez les achats par **webhook signé**
sur ce serveur et faites demander les codes de liaison par votre serveur, avec la clé secrète.

## Installation

1. Copiez `Dev AppStore/` dans le dossier `Plugins/` de votre projet (`MonJeu/Plugins/Dev AppStore/DevAppStore.uplugin`).
2. Régénérez les fichiers projet puis compilez (le plugin est activé par défaut ; sinon *Edit > Plugins > Dev AppStore*).
3. *Paramètres du projet > Plugins > Dev AppStore* (enregistré dans `Config/DefaultGame.ini`) :

| Réglage | Défaut | Rôle |
|---|---|---|
| `BaseUrl` | `https://devappstore.example` | URL de Dev AppStore (en dev : `http://localhost:3000`) |
| `PublishableKey` | — | Clé **publique** du jeu (`das_pub_…`, page *Intégration*) |
| `ApiKey` | — | Déprécié (0.1) : lu seulement si `PublishableKey` est vide |
| `PollIntervalSeconds` | `60` | Intervalle de polling (0 = désactivé) |
| `bPollOnFocus` | `true` | Interroger au retour au premier plan |

```ini
[/Script/DevAppStore.DevAppStoreSettings]
BaseUrl=http://localhost:3000
PublishableKey=das_pub_demo_xxx
PollIntervalSeconds=60
bPollOnFocus=True
```

Pour utiliser le SDK depuis votre module C++, ajoutez `"DevAppStore"` à `PublicDependencyModuleNames` de votre `.Build.cs`.

## Fonctionnement

- `UDevAppStoreSubsystem` (`UGameInstanceSubsystem`) vit aussi longtemps que la `GameInstance`.
- **Liaison** (une fois par appareil) : `RequestLinkCode` → `POST /api/v1/link-codes` (code + `link_request_id`), puis
  `GET /api/v1/link-requests/{id}` toutes les 3 s jusqu'à la saisie du code → jeton joueur sauvegardé, `OnLinked`.
  Sans jeton (`IsLinked() == false`), aucun achat n'est récupéré.
- Toutes les requêtes envoient `Authorization: Bearer <clé publique>` et, après la liaison,
  `DevAppStore-Player-Token: <jeton>` (jamais dans l'URL). Un jeton révoqué (`Unlink`, studio, serveur du jeu) est oublié et
  `OnUnlinked` est diffusé : proposez de relier le compte.
- Une fois lié : polling de `GET /api/v1/deliveries?player_id=…` dès `SetPlayerId` (lancement), toutes les `PollIntervalSeconds`
  (timer de la GameInstance), et au retour au premier plan (`FCoreDelegates::ApplicationHasEnteredForegroundDelegate`
  sur mobile, activation de la fenêtre Slate sur bureau).
- `OnPurchase` / `OnRefund` sont diffusés **une seule fois par `DeliveryId`**.
- Vous créditez le joueur, **sauvegardez**, puis appelez `Ack(DeliveryId)` → `POST /api/v1/deliveries/{id}/ack`.
- Une livraison non acquittée est renvoyée par le serveur (livraison « au moins une fois ») : si le jeu plante avant
  d'avoir crédité, l'achat revient au lancement suivant.
- L'ack est persisté dans le slot de sauvegarde `DevAppStoreSDK` : en cas d'échec réseau il est renvoyé au polling
  suivant **sans rediffuser** `OnPurchase`.

## Exemple C++

```cpp
// MonGameInstance.h
UCLASS()
class UMonGameInstance : public UGameInstance
{
	GENERATED_BODY()
public:
	virtual void Init() override;

	UFUNCTION()
	void HandleDevAppStorePurchase(const FDevAppStorePurchase& Purchase);
	UFUNCTION()
	void HandleDevAppStoreRefund(const FDevAppStorePurchase& Purchase);
};

// MonGameInstance.cpp
#include "DevAppStoreSubsystem.h"

void UMonGameInstance::Init()
{
	Super::Init();
	UDevAppStoreSubsystem* DevAppStore = GetSubsystem<UDevAppStoreSubsystem>();
	Dev AppStore->OnPurchase.AddDynamic(this, &UMonGameInstance::HandleDevAppStorePurchase);
	Dev AppStore->OnRefund.AddDynamic(this, &UMonGameInstance::HandleDevAppStoreRefund);
	// Après la connexion du joueur dans VOTRE jeu :
	Dev AppStore->SetPlayerId(MaSauvegarde->PlayerId); // déclenche un polling immédiat
}

void UMonGameInstance::HandleDevAppStorePurchase(const FDevAppStorePurchase& Purchase)
{
	UDevAppStoreSubsystem* DevAppStore = GetSubsystem<UDevAppStoreSubsystem>();

	// Idempotence côté jeu : jamais deux fois le même DeliveryId,
	// même si le jeu a planté entre la sauvegarde et l'ack.
	if (MaSauvegarde->DeliveredIds.Contains(Purchase.DeliveryId))
	{
		Dev AppStore->Ack(Purchase.DeliveryId);
		return;
	}

	if (Purchase.ProductId == TEXT("gems_500"))
	{
		MaSauvegarde->Gems += 500 * Purchase.Quantity;
	}
	else if (Purchase.ProductId == TEXT("no_ads"))
	{
		MaSauvegarde->bNoAds = true;
	}
	else
	{
		return; // produit inconnu : pas d'ack, l'achat sera re-proposé après mise à jour du jeu
	}

	MaSauvegarde->DeliveredIds.Add(Purchase.DeliveryId);
	UGameplayStatics::SaveGameToSlot(MaSauvegarde, TEXT("Main"), 0); // 1. crédit persisté
	Dev AppStore->Ack(Purchase.DeliveryId);                               // 2. puis seulement l'ack
}

void UMonGameInstance::HandleDevAppStoreRefund(const FDevAppStorePurchase& Purchase)
{
	// Remboursement : même OrderId que l'achat. Ne retirer que si cette commande avait été créditée
	// (ajoutez MaSauvegarde->CreditedOrders.Add(Purchase.OrderId) au moment du crédit).
	if (MaSauvegarde->CreditedOrders.Remove(Purchase.OrderId) > 0 && Purchase.ProductId == TEXT("gems_500"))
	{
		MaSauvegarde->Gems = FMath::Max(0, MaSauvegarde->Gems - 500 * Purchase.Quantity);
		UGameplayStatics::SaveGameToSlot(MaSauvegarde, TEXT("Main"), 0);
	}
	GetSubsystem<UDevAppStoreSubsystem>()->Ack(Purchase.DeliveryId); // acquitter dans tous les cas
}
```

### Liaison par code

```cpp
Dev AppStore->OnLinkCode.AddDynamic(this, &UMonWidget::HandleLinkCode); // (const FString& Code, const FString& ExpiresAt)
Dev AppStore->OnLinked.AddDynamic(this, &UMonWidget::HandleLinked);     // (const FString& LinkedPlayerId) : jeton reçu
Dev AppStore->OnUnlinked.AddDynamic(this, &UMonWidget::HandleUnlinked); // jeton révoqué : proposer de relier le compte
Dev AppStore->RequestLinkCode(TEXT("Pseudo du joueur"));
// …
Dev AppStore->Unlink(); // « Délier cet appareil »
```

Le joueur saisit le code sur la page du jeu sur Dev AppStore (`/games/<slug>/link`) ; le SDK attend la saisie, reçoit le jeton
joueur et commence à récupérer les achats.

## Blueprints

1. Nœud **Get Dev AppStore Subsystem** (catégorie Game Instance).
2. **Bind Event to On Purchase** → l'événement reçoit une structure `Dev AppStore Purchase`
   (*Break Dev AppStore Purchase* : `DeliveryId`, `ProductId`, `Quantity`, `AmountCents`…).
3. Créditez, sauvegardez (*Save Game to Slot*), puis appelez **Ack** avec le `DeliveryId`.
4. Après la connexion du joueur : **Set Player Id**.
5. Liaison : **Bind Event to On Link Code** et **On Linked**, puis **Request Link Code** ; **Is Linked** indique si
   l'appareil est lié, **Unlink** le délie.
6. Erreurs : **On Request Failed** (`Endpoint`, `Status` — 0 si réseau —, `Code`, `Message`).

## Référence

| Membre | Description |
|---|---|
| `OnPurchase(FDevAppStorePurchase)` | Achat (`Event == "purchase.completed"`) |
| `OnRefund(FDevAppStorePurchase)` | Remboursement (`Event == "purchase.refunded"`) |
| `OnAckCompleted(DeliveryId)` | Ack confirmé par le serveur |
| `OnLinkCode(Code, ExpiresAt)` | Code de liaison obtenu |
| `OnLinked(LinkedPlayerId)` | Jeton joueur reçu après la saisie du code |
| `OnUnlinked()` | Jeton révoqué ou oublié |
| `OnRequestFailed(Endpoint, Status, Code, Message)` | Erreur réseau ou API (`{ error: { code, message } }`) |
| `SetPlayerId(Id)` | Joueur courant (ID dans votre jeu) ; lance un polling s'il est lié |
| `IsLinked()` | Jeton joueur présent pour le joueur courant |
| `Poll()` | Polling manuel (ignoré si < 5 s depuis le précédent, ou sans liaison) |
| `Ack(DeliveryId)` | Accusé de réception, après crédit |
| `RequestLinkCode(PlayerName)` | `POST /api/v1/link-codes`, puis attente de la saisie |
| `CancelLinkWait()` | Arrête l'attente de la saisie du code |
| `Unlink()` | `DELETE /api/v1/player-tokens`, puis oubli du jeton |
| `Configure(PublishableKey, BaseUrl, PollIntervalSeconds)` | Configuration à l'exécution |
| `GetPendingAckCount()` | Acks en attente d'envoi (débogage) |

`FDevAppStorePurchase` reprend `PurchaseEvent` : `Event`, `DeliveryId`, `OrderId`, `GameId`, `PlayerId`, `ProductId`,
`ItemType`, `Quantity` (int32), `AmountCents` (int64, centimes), `Currency`, `CreatedAt`.

**Remboursements** (`OnRefund`, `Event == "purchase.refunded"`) : même `OrderId`, `ProductId` et `Quantity` que l'achat,
`DeliveryId` propre. Retirez l'objet si cette commande avait été créditée, sinon ignorez l'événement ; acquittez-le dans
les deux cas. Un achat remboursé avant d'avoir été reçu n'est plus livré.

## Sécurité

Tout ce qui est embarqué dans un client (dont `DefaultGame.ini`) peut être extrait : c'est pourquoi le SDK n'utilise que
la clé **publique**, et le jeton joueur ne donne accès qu'aux achats du joueur lié (faits par le compte Dev AppStore qui a
saisi le code). Le crédit reste décidé par le client : pour des objets de valeur ou un jeu en ligne, préférez la
livraison par **webhook signé** vers votre serveur dédié (voir ARCHITECTURE.md).

Migration depuis la 0.1 : renseignez `PublishableKey` (clé publique) à la place d'`ApiKey` ; après la mise à jour,
chaque joueur doit lier son compte une fois depuis le jeu.
