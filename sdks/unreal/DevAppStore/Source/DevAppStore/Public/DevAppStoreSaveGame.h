#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "DevAppStoreSaveGame.generated.h"

/** État persistant du SDK : jetons joueur, accusés de réception en attente d'envoi et derniers acks confirmés. */
UCLASS()
class DEVAPPSTORE_API UDevAppStoreSaveGame : public USaveGame
{
	GENERATED_BODY()

public:
	/** Livraisons créditées par le jeu dont l'ack n'a pas encore été confirmé par le serveur. */
	UPROPERTY()
	TArray<FString> PendingAckIds;

	/** Derniers DeliveryId acquittés (bornés), pour ignorer une liste serveur encore périmée. */
	UPROPERTY()
	TArray<FString> AckedIds;

	/** Jeton joueur (das_pt_…) de cet appareil, par PlayerId, obtenu après la saisie du code de liaison. */
	UPROPERTY()
	TMap<FString, FString> PlayerTokens;
};
