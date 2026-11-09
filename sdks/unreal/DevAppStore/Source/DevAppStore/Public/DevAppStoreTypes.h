#pragma once

#include "CoreMinimal.h"
#include "DevAppStoreTypes.generated.h"

/**
 * Livraison d'un achat Dev AppStore (miroir de PurchaseEvent, packages/core/src/types.ts).
 * Les montants sont toujours en centimes.
 */
USTRUCT(BlueprintType)
struct DEVAPPSTORE_API FDevAppStorePurchase
{
	GENERATED_BODY()

	/** "purchase.completed" ou "purchase.refunded". */
	UPROPERTY(BlueprintReadOnly, Category = "DevAppStore")
	FString Event;

	/** Clé d'idempotence : ne créditez jamais deux fois le même DeliveryId. */
	UPROPERTY(BlueprintReadOnly, Category = "DevAppStore")
	FString DeliveryId;

	UPROPERTY(BlueprintReadOnly, Category = "DevAppStore")
	FString OrderId;

	UPROPERTY(BlueprintReadOnly, Category = "DevAppStore")
	FString GameId;

	/** Identifiant du joueur dans votre jeu. */
	UPROPERTY(BlueprintReadOnly, Category = "DevAppStore")
	FString PlayerId;

	/** Identifiant produit défini dans l'espace studio (ex. "gems_500"). */
	UPROPERTY(BlueprintReadOnly, Category = "DevAppStore")
	FString ProductId;

	/** consumable | non_consumable | auto_renewable | non_renewing */
	UPROPERTY(BlueprintReadOnly, Category = "DevAppStore")
	FString ItemType;

	UPROPERTY(BlueprintReadOnly, Category = "DevAppStore")
	int32 Quantity = 1;

	/** Montant payé, en centimes. */
	UPROPERTY(BlueprintReadOnly, Category = "DevAppStore")
	int64 AmountCents = 0;

	/** EUR | USD | GBP */
	UPROPERTY(BlueprintReadOnly, Category = "DevAppStore")
	FString Currency;

	/** Horodatage ISO 8601. */
	UPROPERTY(BlueprintReadOnly, Category = "DevAppStore")
	FString CreatedAt;

	bool IsRefund() const { return Event == TEXT("purchase.refunded"); }
};
