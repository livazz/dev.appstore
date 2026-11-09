#pragma once

#include "CoreMinimal.h"
#include "WolleenTypes.generated.h"

/**
 * Livraison d'un achat Wolleen (miroir de PurchaseEvent, packages/core/src/types.ts).
 * Les montants sont toujours en centimes.
 */
USTRUCT(BlueprintType)
struct WOLLEEN_API FWolleenPurchase
{
	GENERATED_BODY()

	/** "purchase.completed" ou "purchase.refunded". */
	UPROPERTY(BlueprintReadOnly, Category = "Wolleen")
	FString Event;

	/** Clé d'idempotence : ne créditez jamais deux fois le même DeliveryId. */
	UPROPERTY(BlueprintReadOnly, Category = "Wolleen")
	FString DeliveryId;

	UPROPERTY(BlueprintReadOnly, Category = "Wolleen")
	FString OrderId;

	UPROPERTY(BlueprintReadOnly, Category = "Wolleen")
	FString GameId;

	/** Identifiant du joueur dans votre jeu. */
	UPROPERTY(BlueprintReadOnly, Category = "Wolleen")
	FString PlayerId;

	/** Identifiant produit défini dans l'espace studio (ex. "gems_500"). */
	UPROPERTY(BlueprintReadOnly, Category = "Wolleen")
	FString ProductId;

	/** consumable | non_consumable | auto_renewable | non_renewing */
	UPROPERTY(BlueprintReadOnly, Category = "Wolleen")
	FString ItemType;

	UPROPERTY(BlueprintReadOnly, Category = "Wolleen")
	int32 Quantity = 1;

	/** Montant payé, en centimes. */
	UPROPERTY(BlueprintReadOnly, Category = "Wolleen")
	int64 AmountCents = 0;

	/** EUR | USD | GBP */
	UPROPERTY(BlueprintReadOnly, Category = "Wolleen")
	FString Currency;

	/** Horodatage ISO 8601. */
	UPROPERTY(BlueprintReadOnly, Category = "Wolleen")
	FString CreatedAt;

	bool IsRefund() const { return Event == TEXT("purchase.refunded"); }
};
