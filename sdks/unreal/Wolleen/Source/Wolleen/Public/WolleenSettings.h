#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "WolleenSettings.generated.h"

/** Réglages du SDK : Paramètres du projet > Plugins > Wolleen (enregistrés dans DefaultGame.ini). */
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "Wolleen"))
class WOLLEEN_API UWolleenSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	/** URL de Wolleen, sans / final (en dev : http://localhost:3000). */
	UPROPERTY(Config, EditAnywhere, Category = "API")
	FString BaseUrl = TEXT("https://wolleen.example");

	/** Clé API du jeu (wk_…), page Intégration de l'espace studio. */
	UPROPERTY(Config, EditAnywhere, Category = "API")
	FString ApiKey;

	/** Intervalle de polling en secondes (0 = désactivé). */
	UPROPERTY(Config, EditAnywhere, Category = "Delivery", meta = (ClampMin = "0", UIMin = "0", Units = "s"))
	float PollIntervalSeconds = 60.f;

	/** Interroger quand l'application revient au premier plan. */
	UPROPERTY(Config, EditAnywhere, Category = "Delivery")
	bool bPollOnFocus = true;

	virtual FName GetCategoryName() const override { return TEXT("Plugins"); }
};
