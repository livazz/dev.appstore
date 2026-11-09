#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "TimerManager.h"
#include "DevAppStoreTypes.h"
#include "DevAppStoreSubsystem.generated.h"

class FJsonObject;
class UDevAppStoreSaveGame;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FDevAppStorePurchaseDelegate, const FDevAppStorePurchase&, Purchase);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FDevAppStoreAckDelegate, const FString&, DeliveryId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FDevAppStoreLinkCodeDelegate, const FString&, Code, const FString&, ExpiresAt);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FDevAppStoreLinkedDelegate, const FString&, LinkedPlayerId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FDevAppStoreUnlinkedDelegate);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_FourParams(FDevAppStoreErrorDelegate, const FString&, Endpoint, int32, Status, const FString&, Code, const FString&, Message);

/** Résultat interne d'un appel HTTP (non exposé aux Blueprints). */
struct FDevAppStoreHttpResult
{
	bool bOk = false;
	/** Code HTTP, 0 si la requête n'a pas abouti. */
	int32 Status = 0;
	TSharedPtr<FJsonObject> Json;
	FString Error;
};

/**
 * SDK Dev AppStore (jeu SANS serveur) : remet au jeu les achats faits sur la place de marché Dev AppStore.
 *
 * - Clé PUBLIQUE uniquement (das_pub_…, Paramètres du projet > Plugins > Dev AppStore). Jamais la clé secrète.
 * - Liaison : RequestLinkCode() affiche un code que le joueur saisit sur Dev AppStore ; le SDK interroge la demande de
 *   liaison, reçoit un jeton joueur (sauvegardé) et diffuse OnLinked. Le jeton donne accès aux achats de CE joueur.
 * - Une fois lié : polling de GET /api/v1/deliveries?player_id= au lancement, à intervalle régulier et au retour au
 *   premier plan (en-têtes Authorization + DevAppStore-Player-Token, jamais dans l'URL).
 * - OnPurchase / OnRefund diffusés une seule fois par DeliveryId.
 * - Ack(DeliveryId) à appeler UNIQUEMENT après que le jeu a crédité et sauvegardé l'objet (ou appliqué le remboursement).
 * - Jeton révoqué (Unlink, studio) : oublié, OnUnlinked diffusé.
 *
 * Accès : GetGameInstance()->GetSubsystem<UDevAppStoreSubsystem>() ou nœud Blueprint « Get Dev AppStore Subsystem ».
 */
UCLASS()
class DEVAPPSTORE_API UDevAppStoreSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	// USubsystem
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Achat reçu (Event == "purchase.completed"). Créditez, sauvegardez, puis appelez Ack. */
	UPROPERTY(BlueprintAssignable, Category = "DevAppStore")
	FDevAppStorePurchaseDelegate OnPurchase;

	/**
	 * Remboursement reçu (Event == "purchase.refunded") : même OrderId que l'achat. Retirez l'objet SI cette commande
	 * avait été créditée (sinon ignorez), puis Ack dans tous les cas.
	 */
	UPROPERTY(BlueprintAssignable, Category = "DevAppStore")
	FDevAppStorePurchaseDelegate OnRefund;

	/** Le serveur a confirmé l'accusé de réception. */
	UPROPERTY(BlueprintAssignable, Category = "DevAppStore")
	FDevAppStoreAckDelegate OnAckCompleted;

	/** Code de liaison obtenu après RequestLinkCode. */
	UPROPERTY(BlueprintAssignable, Category = "DevAppStore")
	FDevAppStoreLinkCodeDelegate OnLinkCode;

	/** Le joueur a saisi le code sur Dev AppStore : jeton joueur reçu, les achats commencent à arriver. */
	UPROPERTY(BlueprintAssignable, Category = "DevAppStore")
	FDevAppStoreLinkedDelegate OnLinked;

	/** Le jeton joueur a été révoqué ou oublié : proposez de relier le compte. */
	UPROPERTY(BlueprintAssignable, Category = "DevAppStore")
	FDevAppStoreUnlinkedDelegate OnUnlinked;

	/** Erreur réseau (Status == 0) ou API (Code issu de { error: { code, message } }). */
	UPROPERTY(BlueprintAssignable, Category = "DevAppStore")
	FDevAppStoreErrorDelegate OnRequestFailed;

	/** Configuration à l'exécution (remplace les Paramètres du projet). PollIntervalSeconds < 0 : inchangé. */
	UFUNCTION(BlueprintCallable, Category = "DevAppStore")
	void Configure(const FString& InPublishableKey, const FString& InBaseUrl, float InPollIntervalSeconds = -1.f);

	/** Joueur courant (identifiant dans VOTRE jeu, celui lié sur Dev AppStore). Lance un polling immédiat s'il est lié. */
	UFUNCTION(BlueprintCallable, Category = "DevAppStore")
	void SetPlayerId(const FString& InPlayerId);

	UFUNCTION(BlueprintPure, Category = "DevAppStore")
	FString GetPlayerId() const { return PlayerId; }

	/** Vrai si cet appareil a un jeton joueur pour le joueur courant (les achats sont accessibles). */
	UFUNCTION(BlueprintPure, Category = "DevAppStore")
	bool IsLinked() const;

	/** Polling manuel (ignoré si moins de 5 s depuis le précédent, ou sans liaison ; mis en file si un polling est en cours). */
	UFUNCTION(BlueprintCallable, Category = "DevAppStore")
	void Poll();

	/**
	 * Accuse réception d'une livraison, APRÈS l'avoir créditée et sauvegardée.
	 * L'ack est persisté : en cas d'échec réseau il est renvoyé au prochain polling,
	 * sans rediffuser OnPurchase pour ce DeliveryId.
	 */
	UFUNCTION(BlueprintCallable, Category = "DevAppStore")
	void Ack(const FString& DeliveryId);

	/**
	 * Demande un code de liaison à afficher au joueur (résultat via OnLinkCode ou OnRequestFailed), puis attend la saisie
	 * en arrière-plan : OnLinked est diffusé quand le jeton joueur est reçu.
	 */
	UFUNCTION(BlueprintCallable, Category = "DevAppStore")
	void RequestLinkCode(const FString& PlayerName);

	/** Arrête l'attente de la saisie du code (ex. le joueur ferme l'écran de liaison). */
	UFUNCTION(BlueprintCallable, Category = "DevAppStore")
	void CancelLinkWait();

	/** Délie cet appareil : révoque le jeton joueur côté Dev AppStore puis l'oublie (OnUnlinked). */
	UFUNCTION(BlueprintCallable, Category = "DevAppStore")
	void Unlink();

	UFUNCTION(BlueprintPure, Category = "DevAppStore")
	int32 GetPendingAckCount() const;

private:
	/** bWithToken : envoie DevAppStore-Player-Token (requis pour livraisons, ack, révocation). */
	void SendRequest(const FString& Verb, const FString& Path, const FString& Body, bool bWithToken, TFunction<void(const FDevAppStoreHttpResult&)>&& OnDone);
	void HandleDeliveries(const FString& RequestedFor, const FDevAppStoreHttpResult& Result);
	void HandleEvent(const FDevAppStorePurchase& Purchase);
	void SendAck(const FString& DeliveryId);
	void FlushPendingAcks();
	void ReportFailure(const FString& Endpoint, const FDevAppStoreHttpResult& Result);
	void ApplyPollInterval();
	void ForcePoll();

	void PollLinkRequest();
	void StopLinkPoll();
	FString GetPlayerTokenFor(const FString& ForPlayer) const;
	void ClearToken(const FString& ForPlayer);

	void HandleAppReactivated();
	void HandleActivationStateChanged(bool bIsActive);

	void LoadState();
	void SaveState();

	FString BaseUrl;
	FString PublishableKey;
	float PollIntervalSeconds = 60.f;
	bool bPollOnFocus = true;
	FString PlayerId;

	bool bPolling = false;
	bool bPollQueued = false;
	double LastPollTime = -1000.0;

	/** Demande de liaison en cours d'attente (vide = aucune). */
	FString LinkRequestId;
	FString LinkForPlayer;
	double LinkDeadline = 0.0;
	bool bLinkPollInFlight = false;

	/** Livraisons diffusées au jeu dans cette session, en attente de crédit + Ack. */
	TSet<FString> Emitted;
	TSet<FString> AcksInFlight;

	UPROPERTY()
	TObjectPtr<UDevAppStoreSaveGame> State;

	FTimerHandle PollTimer;
	FTimerHandle LinkTimer;
	FDelegateHandle ReactivatedHandle;
	FDelegateHandle ActivationHandle;
};
