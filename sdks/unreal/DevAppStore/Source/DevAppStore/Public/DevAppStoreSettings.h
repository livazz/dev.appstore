#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "DevAppStoreSettings.generated.h"

/** Réglages du SDK : Paramètres du projet > Plugins > Dev AppStore (enregistrés dans DefaultGame.ini). */
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "DevAppStore"))
class DEVAPPSTORE_API UDevAppStoreSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	/** URL de Dev AppStore, sans / final (en dev : http://localhost:3000). */
	UPROPERTY(Config, EditAnywhere, Category = "API")
	FString BaseUrl = TEXT("https://devappstore.example");

	/**
	 * Clé PUBLIQUE du jeu (das_pub_…), page Intégration de l'espace studio. Elle n'est pas secrète : seule, elle permet
	 * de demander un code de liaison ; le jeton joueur obtenu après la saisie du code donne accès aux achats de ce joueur.
	 * N'utilisez JAMAIS la clé secrète (das_secret_…) dans le jeu.
	 */
	UPROPERTY(Config, EditAnywhere, Category = "API")
	FString PublishableKey;

	/** Déprécié (SDK 0.1) : lu seulement si PublishableKey est vide. Remplacez-le par la clé publique. */
	UPROPERTY(Config, EditAnywhere, Category = "API", meta = (DisplayName = "Api Key (déprécié)"))
	FString ApiKey;

	/** Intervalle de polling en secondes (0 = désactivé). */
	UPROPERTY(Config, EditAnywhere, Category = "Delivery", meta = (ClampMin = "0", UIMin = "0", Units = "s"))
	float PollIntervalSeconds = 60.f;

	/** Interroger quand l'application revient au premier plan. */
	UPROPERTY(Config, EditAnywhere, Category = "Delivery")
	bool bPollOnFocus = true;

	virtual FName GetCategoryName() const override { return TEXT("Plugins"); }
};
