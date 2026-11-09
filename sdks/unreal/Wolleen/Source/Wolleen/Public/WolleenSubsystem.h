#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "TimerManager.h"
#include "WolleenTypes.h"
#include "WolleenSubsystem.generated.h"

class FJsonObject;
class UWolleenSaveGame;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FWolleenPurchaseDelegate, const FWolleenPurchase&, Purchase);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FWolleenAckDelegate, const FString&, DeliveryId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FWolleenLinkCodeDelegate, const FString&, Code, const FString&, ExpiresAt);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_FourParams(FWolleenErrorDelegate, const FString&, Endpoint, int32, Status, const FString&, Code, const FString&, Message);

/** Résultat interne d'un appel HTTP (non exposé aux Blueprints). */
struct FWolleenHttpResult
{
	bool bOk = false;
	/** Code HTTP, 0 si la requête n'a pas abouti. */
	int32 Status = 0;
	TSharedPtr<FJsonObject> Json;
	FString Error;
};

/**
 * SDK Wolleen : remet au jeu les achats faits sur la place de marché Wolleen.
 *
 * - Polling de GET /api/v1/deliveries?player_id= au lancement (dès que le joueur est connu),
 *   à intervalle régulier et au retour au premier plan.
 * - OnPurchase / OnRefund diffusés une seule fois par DeliveryId.
 * - Ack(DeliveryId) à appeler UNIQUEMENT après que le jeu a crédité et sauvegardé l'objet.
 * - RequestLinkCode() pour la liaison du compte de jeu par code.
 *
 * Accès : GetGameInstance()->GetSubsystem<UWolleenSubsystem>() ou nœud Blueprint « Get Wolleen Subsystem ».
 */
UCLASS()
class WOLLEEN_API UWolleenSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	// USubsystem
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Achat reçu (Event == "purchase.completed"). Créditez, sauvegardez, puis appelez Ack. */
	UPROPERTY(BlueprintAssignable, Category = "Wolleen")
	FWolleenPurchaseDelegate OnPurchase;

	/** Remboursement reçu (Event == "purchase.refunded"). Retirez l'objet si pertinent, puis Ack. */
	UPROPERTY(BlueprintAssignable, Category = "Wolleen")
	FWolleenPurchaseDelegate OnRefund;

	/** Le serveur a confirmé l'accusé de réception. */
	UPROPERTY(BlueprintAssignable, Category = "Wolleen")
	FWolleenAckDelegate OnAckCompleted;

	/** Code de liaison obtenu après RequestLinkCode. */
	UPROPERTY(BlueprintAssignable, Category = "Wolleen")
	FWolleenLinkCodeDelegate OnLinkCode;

	/** Erreur réseau (Status == 0) ou API (Code issu de { error: { code, message } }). */
	UPROPERTY(BlueprintAssignable, Category = "Wolleen")
	FWolleenErrorDelegate OnRequestFailed;

	/** Configuration à l'exécution (remplace les Paramètres du projet). PollIntervalSeconds < 0 : inchangé. */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void Configure(const FString& InApiKey, const FString& InBaseUrl, float InPollIntervalSeconds = -1.f);

	/** Joueur courant (identifiant dans VOTRE jeu, celui lié sur Wolleen). Lance un polling immédiat. */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void SetPlayerId(const FString& InPlayerId);

	UFUNCTION(BlueprintPure, Category = "Wolleen")
	FString GetPlayerId() const { return PlayerId; }

	/** Polling manuel (ignoré si moins de 5 s depuis le précédent ; mis en file si un polling est en cours). */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void Poll();

	/**
	 * Accuse réception d'une livraison, APRÈS l'avoir créditée et sauvegardée.
	 * L'ack est persisté : en cas d'échec réseau il est renvoyé au prochain polling,
	 * sans rediffuser OnPurchase pour ce DeliveryId.
	 */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void Ack(const FString& DeliveryId);

	/** Demande un code de liaison à afficher au joueur. Résultat via OnLinkCode (ou OnRequestFailed). */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void RequestLinkCode(const FString& PlayerName);

	UFUNCTION(BlueprintPure, Category = "Wolleen")
	int32 GetPendingAckCount() const;

private:
	void SendRequest(const FString& Verb, const FString& Path, const FString& Body, TFunction<void(const FWolleenHttpResult&)>&& OnDone);
	void HandleDeliveries(const FString& RequestedFor, const FWolleenHttpResult& Result);
	void HandleEvent(const FWolleenPurchase& Purchase);
	void SendAck(const FString& DeliveryId);
	void FlushPendingAcks();
	void ReportFailure(const FString& Endpoint, const FWolleenHttpResult& Result);
	void ApplyPollInterval();
	void ForcePoll();

	void HandleAppReactivated();
	void HandleActivationStateChanged(bool bIsActive);

	void LoadState();
	void SaveState();

	FString BaseUrl;
	FString ApiKey;
	float PollIntervalSeconds = 60.f;
	bool bPollOnFocus = true;
	FString PlayerId;

	bool bPolling = false;
	bool bPollQueued = false;
	double LastPollTime = -1000.0;

	/** Livraisons diffusées au jeu dans cette session, en attente de crédit + Ack. */
	TSet<FString> Emitted;
	TSet<FString> AcksInFlight;

	UPROPERTY()
	TObjectPtr<UWolleenSaveGame> State;

	FTimerHandle PollTimer;
	FDelegateHandle ReactivatedHandle;
	FDelegateHandle ActivationHandle;
};
