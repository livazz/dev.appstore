# SDK Wolleen pour Unreal Engine 5

Remet automatiquement au jeu les achats faits sur la place de marché Wolleen.
Plugin C++ runtime, modules moteur uniquement (HTTP, Json, Slate, DeveloperSettings). **UE 5.1 ou plus récent.**

## Installation

1. Copiez `Wolleen/` dans le dossier `Plugins/` de votre projet (`MonJeu/Plugins/Wolleen/Wolleen.uplugin`).
2. Régénérez les fichiers projet puis compilez (le plugin est activé par défaut ; sinon *Edit > Plugins > Wolleen*).
3. *Paramètres du projet > Plugins > Wolleen* (enregistré dans `Config/DefaultGame.ini`) :

| Réglage | Défaut | Rôle |
|---|---|---|
| `BaseUrl` | `https://wolleen.example` | URL de Wolleen (en dev : `http://localhost:3000`) |
| `ApiKey` | — | Clé API du jeu (`wk_…`, page *Intégration* de l'espace studio) |
| `PollIntervalSeconds` | `60` | Intervalle de polling (0 = désactivé) |
| `bPollOnFocus` | `true` | Interroger au retour au premier plan |

```ini
[/Script/Wolleen.WolleenSettings]
BaseUrl=http://localhost:3000
ApiKey=wk_dev_xxx
PollIntervalSeconds=60
bPollOnFocus=True
```

Pour utiliser le SDK depuis votre module C++, ajoutez `"Wolleen"` à `PublicDependencyModuleNames` de votre `.Build.cs`.

## Fonctionnement

- `UWolleenSubsystem` (`UGameInstanceSubsystem`) vit aussi longtemps que la `GameInstance`.
- Polling de `GET /api/v1/deliveries?player_id=…` dès `SetPlayerId` (lancement), toutes les `PollIntervalSeconds`
  (timer de la GameInstance), et au retour au premier plan (`FCoreDelegates::ApplicationHasEnteredForegroundDelegate`
  sur mobile, activation de la fenêtre Slate sur bureau).
- `OnPurchase` / `OnRefund` sont diffusés **une seule fois par `DeliveryId`**.
- Vous créditez le joueur, **sauvegardez**, puis appelez `Ack(DeliveryId)` → `POST /api/v1/deliveries/{id}/ack`.
- Une livraison non acquittée est renvoyée par le serveur (livraison « au moins une fois ») : si le jeu plante avant
  d'avoir crédité, l'achat revient au lancement suivant.
- L'ack est persisté dans le slot de sauvegarde `WolleenSDK` : en cas d'échec réseau il est renvoyé au polling
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
	void HandleWolleenPurchase(const FWolleenPurchase& Purchase);
	UFUNCTION()
	void HandleWolleenRefund(const FWolleenPurchase& Purchase);
};

// MonGameInstance.cpp
#include "WolleenSubsystem.h"

void UMonGameInstance::Init()
{
	Super::Init();
	UWolleenSubsystem* Wolleen = GetSubsystem<UWolleenSubsystem>();
	Wolleen->OnPurchase.AddDynamic(this, &UMonGameInstance::HandleWolleenPurchase);
	Wolleen->OnRefund.AddDynamic(this, &UMonGameInstance::HandleWolleenRefund);
	// Après la connexion du joueur dans VOTRE jeu :
	Wolleen->SetPlayerId(MaSauvegarde->PlayerId); // déclenche un polling immédiat
}

void UMonGameInstance::HandleWolleenPurchase(const FWolleenPurchase& Purchase)
{
	UWolleenSubsystem* Wolleen = GetSubsystem<UWolleenSubsystem>();

	// Idempotence côté jeu : jamais deux fois le même DeliveryId,
	// même si le jeu a planté entre la sauvegarde et l'ack.
	if (MaSauvegarde->DeliveredIds.Contains(Purchase.DeliveryId))
	{
		Wolleen->Ack(Purchase.DeliveryId);
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
	Wolleen->Ack(Purchase.DeliveryId);                               // 2. puis seulement l'ack
}

void UMonGameInstance::HandleWolleenRefund(const FWolleenPurchase& Purchase)
{
	if (Purchase.ProductId == TEXT("gems_500"))
	{
		MaSauvegarde->Gems = FMath::Max(0, MaSauvegarde->Gems - 500 * Purchase.Quantity);
		UGameplayStatics::SaveGameToSlot(MaSauvegarde, TEXT("Main"), 0);
	}
	GetSubsystem<UWolleenSubsystem>()->Ack(Purchase.DeliveryId);
}
```

### Liaison par code

```cpp
Wolleen->OnLinkCode.AddDynamic(this, &UMonWidget::HandleLinkCode); // (const FString& Code, const FString& ExpiresAt)
Wolleen->RequestLinkCode(TEXT("Pseudo du joueur"));
```

Le joueur saisit le code sur la page du jeu sur Wolleen (`/games/<slug>/link`).

## Blueprints

1. Nœud **Get Wolleen Subsystem** (catégorie Game Instance).
2. **Bind Event to On Purchase** → l'événement reçoit une structure `Wolleen Purchase`
   (*Break Wolleen Purchase* : `DeliveryId`, `ProductId`, `Quantity`, `AmountCents`…).
3. Créditez, sauvegardez (*Save Game to Slot*), puis appelez **Ack** avec le `DeliveryId`.
4. Après la connexion du joueur : **Set Player Id**.
5. Liaison : **Bind Event to On Link Code**, puis **Request Link Code**.
6. Erreurs : **On Request Failed** (`Endpoint`, `Status` — 0 si réseau —, `Code`, `Message`).

## Référence

| Membre | Description |
|---|---|
| `OnPurchase(FWolleenPurchase)` | Achat (`Event == "purchase.completed"`) |
| `OnRefund(FWolleenPurchase)` | Remboursement (`Event == "purchase.refunded"`) |
| `OnAckCompleted(DeliveryId)` | Ack confirmé par le serveur |
| `OnLinkCode(Code, ExpiresAt)` | Code de liaison obtenu |
| `OnRequestFailed(Endpoint, Status, Code, Message)` | Erreur réseau ou API (`{ error: { code, message } }`) |
| `SetPlayerId(Id)` | Joueur courant (ID dans votre jeu) ; lance un polling |
| `Poll()` | Polling manuel (ignoré si < 5 s depuis le précédent) |
| `Ack(DeliveryId)` | Accusé de réception, après crédit |
| `RequestLinkCode(PlayerName)` | `POST /api/v1/link-codes` |
| `Configure(ApiKey, BaseUrl, PollIntervalSeconds)` | Configuration à l'exécution |
| `GetPendingAckCount()` | Acks en attente d'envoi (débogage) |

`FWolleenPurchase` reprend `PurchaseEvent` : `Event`, `DeliveryId`, `OrderId`, `GameId`, `PlayerId`, `ProductId`,
`ItemType`, `Quantity` (int32), `AmountCents` (int64, centimes), `Currency`, `CreatedAt`.

## Sécurité

La clé API embarquée dans un client (et dans `DefaultGame.ini`) peut être extraite. Pour des objets de valeur ou un
jeu en ligne, préférez la livraison par **webhook signé** vers votre serveur dédié (voir ARCHITECTURE.md) et gardez
ce SDK pour les jeux hors ligne ou en complément.
