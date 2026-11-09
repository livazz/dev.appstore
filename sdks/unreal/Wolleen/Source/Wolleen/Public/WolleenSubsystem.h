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
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FWolleenLinkedDelegate, const FString&, LinkedPlayerId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FWolleenUnlinkedDelegate);
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
 * SDK Wolleen (jeu SANS serveur) : remet au jeu les achats faits sur la place de marché Wolleen.
 *
 * - Clé PUBLIQUE uniquement (wk_pub_…, Paramètres du projet > Plugins > Wolleen). Jamais la clé secrète.
 * - Liaison : RequestLinkCode() affiche un code que le joueur saisit sur Wolleen ; le SDK interroge la demande de
 *   liaison, reçoit un jeton joueur (sauvegardé) et diffuse OnLinked. Le jeton donne accès aux achats de CE joueur.
 * - Une fois lié : polling de GET /api/v1/deliveries?player_id= au lancement, à intervalle régulier et au retour au
 *   premier plan (en-têtes Authorization + Wolleen-Player-Token, jamais dans l'URL).
 * - OnPurchase / OnRefund diffusés une seule fois par DeliveryId.
 * - Ack(DeliveryId) à appeler UNIQUEMENT après que le jeu a crédité et sauvegardé l'objet (ou appliqué le remboursement).
 * - Jeton révoqué (Unlink, studio) : oublié, OnUnlinked diffusé.
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

	/**
	 * Remboursement reçu (Event == "purchase.refunded") : même OrderId que l'achat. Retirez l'objet SI cette commande
	 * avait été créditée (sinon ignorez), puis Ack dans tous les cas.
	 */
	UPROPERTY(BlueprintAssignable, Category = "Wolleen")
	FWolleenPurchaseDelegate OnRefund;

	/** Le serveur a confirmé l'accusé de réception. */
	UPROPERTY(BlueprintAssignable, Category = "Wolleen")
	FWolleenAckDelegate OnAckCompleted;

	/** Code de liaison obtenu après RequestLinkCode. */
	UPROPERTY(BlueprintAssignable, Category = "Wolleen")
	FWolleenLinkCodeDelegate OnLinkCode;

	/** Le joueur a saisi le code sur Wolleen : jeton joueur reçu, les achats commencent à arriver. */
	UPROPERTY(BlueprintAssignable, Category = "Wolleen")
	FWolleenLinkedDelegate OnLinked;

	/** Le jeton joueur a été révoqué ou oublié : proposez de relier le compte. */
	UPROPERTY(BlueprintAssignable, Category = "Wolleen")
	FWolleenUnlinkedDelegate OnUnlinked;

	/** Erreur réseau (Status == 0) ou API (Code issu de { error: { code, message } }). */
	UPROPERTY(BlueprintAssignable, Category = "Wolleen")
	FWolleenErrorDelegate OnRequestFailed;

	/** Configuration à l'exécution (remplace les Paramètres du projet). PollIntervalSeconds < 0 : inchangé. */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void Configure(const FString& InPublishableKey, const FString& InBaseUrl, float InPollIntervalSeconds = -1.f);

	/** Joueur courant (identifiant dans VOTRE jeu, celui lié sur Wolleen). Lance un polling immédiat s'il est lié. */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void SetPlayerId(const FString& InPlayerId);

	UFUNCTION(BlueprintPure, Category = "Wolleen")
	FString GetPlayerId() const { return PlayerId; }

	/** Vrai si cet appareil a un jeton joueur pour le joueur courant (les achats sont accessibles). */
	UFUNCTION(BlueprintPure, Category = "Wolleen")
	bool IsLinked() const;

	/** Polling manuel (ignoré si moins de 5 s depuis le précédent, ou sans liaison ; mis en file si un polling est en cours). */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void Poll();

	/**
	 * Accuse réception d'une livraison, APRÈS l'avoir créditée et sauvegardée.
	 * L'ack est persisté : en cas d'échec réseau il est renvoyé au prochain polling,
	 * sans rediffuser OnPurchase pour ce DeliveryId.
	 */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void Ack(const FString& DeliveryId);

	/**
	 * Demande un code de liaison à afficher au joueur (résultat via OnLinkCode ou OnRequestFailed), puis attend la saisie
	 * en arrière-plan : OnLinked est diffusé quand le jeton joueur est reçu.
	 */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void RequestLinkCode(const FString& PlayerName);

	/** Arrête l'attente de la saisie du code (ex. le joueur ferme l'écran de liaison). */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void CancelLinkWait();

	/** Délie cet appareil : révoque le jeton joueur côté Wolleen puis l'oublie (OnUnlinked). */
	UFUNCTION(BlueprintCallable, Category = "Wolleen")
	void Unlink();

	UFUNCTION(BlueprintPure, Category = "Wolleen")
	int32 GetPendingAckCount() const;

private:
	/** bWithToken : envoie Wolleen-Player-Token (requis pour livraisons, ack, révocation). */
	void SendRequest(const FString& Verb, const FString& Path, const FString& Body, bool bWithToken, TFunction<void(const FWolleenHttpResult&)>&& OnDone);
	void HandleDeliveries(const FString& RequestedFor, const FWolleenHttpResult& Result);
	void HandleEvent(const FWolleenPurchase& Purchase);
	void SendAck(const FString& DeliveryId);
	void FlushPendingAcks();
	void ReportFailure(const FString& Endpoint, const FWolleenHttpResult& Result);
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
	TObjectPtr<UWolleenSaveGame> State;

	FTimerHandle PollTimer;
	FTimerHandle LinkTimer;
	FDelegateHandle ReactivatedHandle;
	FDelegateHandle ActivationHandle;
};
