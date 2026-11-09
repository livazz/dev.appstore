#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "WolleenSaveGame.generated.h"

/** État persistant du SDK : accusés de réception en attente d'envoi et derniers acks confirmés. */
UCLASS()
class WOLLEEN_API UWolleenSaveGame : public USaveGame
{
	GENERATED_BODY()

public:
	/** Livraisons créditées par le jeu dont l'ack n'a pas encore été confirmé par le serveur. */
	UPROPERTY()
	TArray<FString> PendingAckIds;

	/** Derniers DeliveryId acquittés (bornés), pour ignorer une liste serveur encore périmée. */
	UPROPERTY()
	TArray<FString> AckedIds;
};
