#include "WolleenSubsystem.h"

#include "WolleenSaveGame.h"
#include "WolleenSettings.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Engine/GameInstance.h"
#include "Framework/Application/SlateApplication.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CoreDelegates.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

DEFINE_LOG_CATEGORY_STATIC(LogWolleen, Log, All);

namespace WolleenSDK
{
	static const TCHAR* Version = TEXT("0.1.0");
	static const TCHAR* SaveSlot = TEXT("WolleenSDK");
	static constexpr int32 SaveUserIndex = 0;
	static constexpr double MinPollGapSeconds = 5.0;
	static constexpr int32 MaxRememberedAcks = 500;
	static constexpr float RequestTimeoutSeconds = 15.f;

	static FWolleenPurchase ParsePurchase(const TSharedPtr<FJsonObject>& Obj)
	{
		FWolleenPurchase P;
		Obj->TryGetStringField(TEXT("event"), P.Event);
		Obj->TryGetStringField(TEXT("delivery_id"), P.DeliveryId);
		Obj->TryGetStringField(TEXT("order_id"), P.OrderId);
		Obj->TryGetStringField(TEXT("game_id"), P.GameId);
		Obj->TryGetStringField(TEXT("player_id"), P.PlayerId);
		Obj->TryGetStringField(TEXT("product_id"), P.ProductId);
		Obj->TryGetStringField(TEXT("item_type"), P.ItemType);
		Obj->TryGetNumberField(TEXT("quantity"), P.Quantity);
		Obj->TryGetNumberField(TEXT("amount_cents"), P.AmountCents);
		Obj->TryGetStringField(TEXT("currency"), P.Currency);
		Obj->TryGetStringField(TEXT("created_at"), P.CreatedAt);
		return P;
	}
}

// ---------------------------------------------------------------------------
// Cycle de vie
// ---------------------------------------------------------------------------

void UWolleenSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const UWolleenSettings* Settings = GetDefault<UWolleenSettings>();
	BaseUrl = Settings->BaseUrl;
	ApiKey = Settings->ApiKey;
	PollIntervalSeconds = Settings->PollIntervalSeconds;
	bPollOnFocus = Settings->bPollOnFocus;

	LoadState();
	ApplyPollInterval();

	// Retour au premier plan : mobile (FCoreDelegates) et bureau (activation de la fenêtre Slate).
	ReactivatedHandle = FCoreDelegates::ApplicationHasEnteredForegroundDelegate.AddUObject(this, &UWolleenSubsystem::HandleAppReactivated);
	if (FSlateApplication::IsInitialized())
	{
		ActivationHandle = FSlateApplication::Get().OnApplicationActivationStateChanged().AddUObject(this, &UWolleenSubsystem::HandleActivationStateChanged);
	}
}

void UWolleenSubsystem::Deinitialize()
{
	FCoreDelegates::ApplicationHasEnteredForegroundDelegate.Remove(ReactivatedHandle);
	if (FSlateApplication::IsInitialized())
	{
		FSlateApplication::Get().OnApplicationActivationStateChanged().Remove(ActivationHandle);
	}
	if (UGameInstance* GI = GetGameInstance())
	{
		GI->GetTimerManager().ClearTimer(PollTimer);
	}
	Super::Deinitialize();
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

void UWolleenSubsystem::Configure(const FString& InApiKey, const FString& InBaseUrl, float InPollIntervalSeconds)
{
	ApiKey = InApiKey;
	if (!InBaseUrl.IsEmpty())
	{
		BaseUrl = InBaseUrl;
	}
	if (InPollIntervalSeconds >= 0.f)
	{
		PollIntervalSeconds = InPollIntervalSeconds;
	}
	ApplyPollInterval();
}

void UWolleenSubsystem::SetPlayerId(const FString& InPlayerId)
{
	if (InPlayerId == PlayerId)
	{
		return;
	}
	PlayerId = InPlayerId;
	Emitted.Reset();
	if (!PlayerId.IsEmpty())
	{
		ForcePoll(); // polling « au lancement » : dès que le joueur est connu
	}
}

void UWolleenSubsystem::Poll()
{
	if (ApiKey.IsEmpty() || PlayerId.IsEmpty())
	{
		return;
	}
	if (bPolling)
	{
		bPollQueued = true;
		return;
	}
	const double Now = FPlatformTime::Seconds();
	if (Now - LastPollTime < WolleenSDK::MinPollGapSeconds)
	{
		return;
	}
	LastPollTime = Now;
	bPolling = true;

	FlushPendingAcks();

	const FString RequestedFor = PlayerId;
	SendRequest(TEXT("GET"),
		FString::Printf(TEXT("/api/v1/deliveries?player_id=%s"), *FGenericPlatformHttp::UrlEncode(RequestedFor)),
		FString(),
		[this, RequestedFor](const FWolleenHttpResult& Result)
		{
			bPolling = false;
			HandleDeliveries(RequestedFor, Result);
			if (bPollQueued)
			{
				bPollQueued = false;
				ForcePoll();
			}
		});
}

void UWolleenSubsystem::Ack(const FString& DeliveryId)
{
	if (DeliveryId.IsEmpty() || State->AckedIds.Contains(DeliveryId))
	{
		return;
	}
	Emitted.Remove(DeliveryId);
	if (!State->PendingAckIds.Contains(DeliveryId))
	{
		State->PendingAckIds.Add(DeliveryId);
		SaveState(); // persisté avant l'envoi : survit à un crash ou à une perte réseau
	}
	SendAck(DeliveryId);
}

void UWolleenSubsystem::RequestLinkCode(const FString& PlayerName)
{
	if (PlayerId.IsEmpty())
	{
		OnRequestFailed.Broadcast(TEXT("link-codes"), 0, TEXT("no_player"), TEXT("PlayerId n'est pas défini (appelez SetPlayerId)."));
		return;
	}

	TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("player_id"), PlayerId);
	if (!PlayerName.IsEmpty())
	{
		Body->SetStringField(TEXT("player_name"), PlayerName);
	}
	FString BodyString;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyString);
	FJsonSerializer::Serialize(Body, Writer);

	SendRequest(TEXT("POST"), TEXT("/api/v1/link-codes"), BodyString,
		[this](const FWolleenHttpResult& Result)
		{
			FString Code;
			FString ExpiresAt;
			if (Result.bOk && Result.Json.IsValid() && Result.Json->TryGetStringField(TEXT("code"), Code))
			{
				Result.Json->TryGetStringField(TEXT("expires_at"), ExpiresAt);
				OnLinkCode.Broadcast(Code, ExpiresAt);
			}
			else
			{
				ReportFailure(TEXT("link-codes"), Result);
			}
		});
}

int32 UWolleenSubsystem::GetPendingAckCount() const
{
	return State ? State->PendingAckIds.Num() : 0;
}

// ---------------------------------------------------------------------------
// Livraisons
// ---------------------------------------------------------------------------

void UWolleenSubsystem::HandleDeliveries(const FString& RequestedFor, const FWolleenHttpResult& Result)
{
	if (!Result.bOk)
	{
		ReportFailure(TEXT("deliveries"), Result);
		return;
	}
	if (RequestedFor != PlayerId || !Result.Json.IsValid())
	{
		return; // le joueur a changé pendant la requête
	}
	const TArray<TSharedPtr<FJsonValue>>* Data = nullptr;
	if (!Result.Json->TryGetArrayField(TEXT("data"), Data) || Data == nullptr)
	{
		return;
	}
	for (const TSharedPtr<FJsonValue>& Value : *Data)
	{
		const TSharedPtr<FJsonObject>* Obj = nullptr;
		if (Value.IsValid() && Value->TryGetObject(Obj) && Obj != nullptr && Obj->IsValid())
		{
			HandleEvent(WolleenSDK::ParsePurchase(*Obj));
		}
	}
}

void UWolleenSubsystem::HandleEvent(const FWolleenPurchase& Purchase)
{
	const FString& Id = Purchase.DeliveryId;
	if (Id.IsEmpty() || Purchase.PlayerId != PlayerId)
	{
		return;
	}
	if (State->AckedIds.Contains(Id) || Emitted.Contains(Id))
	{
		return; // déjà acquitté, ou déjà remis au jeu dans cette session
	}
	if (State->PendingAckIds.Contains(Id))
	{
		SendAck(Id); // déjà crédité par le jeu : on renvoie seulement l'ack
		return;
	}
	Emitted.Add(Id);
	if (Purchase.IsRefund())
	{
		OnRefund.Broadcast(Purchase);
	}
	else
	{
		OnPurchase.Broadcast(Purchase);
	}
}

void UWolleenSubsystem::SendAck(const FString& DeliveryId)
{
	if (AcksInFlight.Contains(DeliveryId))
	{
		return;
	}
	AcksInFlight.Add(DeliveryId);

	SendRequest(TEXT("POST"),
		FString::Printf(TEXT("/api/v1/deliveries/%s/ack"), *FGenericPlatformHttp::UrlEncode(DeliveryId)),
		FString(),
		[this, DeliveryId](const FWolleenHttpResult& Result)
		{
			AcksInFlight.Remove(DeliveryId);
			// 404/409 : livraison inconnue ou déjà acquittée côté serveur -> inutile de réessayer.
			if (Result.bOk || Result.Status == 404 || Result.Status == 409)
			{
				State->PendingAckIds.Remove(DeliveryId);
				State->AckedIds.Add(DeliveryId);
				if (State->AckedIds.Num() > WolleenSDK::MaxRememberedAcks)
				{
					State->AckedIds.RemoveAt(0, State->AckedIds.Num() - WolleenSDK::MaxRememberedAcks);
				}
				SaveState();
				if (Result.bOk)
				{
					OnAckCompleted.Broadcast(DeliveryId);
				}
			}
			else
			{
				ReportFailure(TEXT("ack"), Result); // reste en attente, renvoyé au prochain polling
			}
		});
}

void UWolleenSubsystem::FlushPendingAcks()
{
	const TArray<FString> Pending = State->PendingAckIds; // copie : SendAck peut modifier la liste
	for (const FString& Id : Pending)
	{
		SendAck(Id);
	}
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

void UWolleenSubsystem::SendRequest(const FString& Verb, const FString& Path, const FString& Body, TFunction<void(const FWolleenHttpResult&)>&& OnDone)
{
	FString Url = BaseUrl;
	Url.RemoveFromEnd(TEXT("/"));
	Url += Path;

	const TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(Url);
	Request->SetVerb(Verb);
	Request->SetTimeout(WolleenSDK::RequestTimeoutSeconds);
	Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *ApiKey));
	Request->SetHeader(TEXT("Accept"), TEXT("application/json"));
	Request->SetHeader(TEXT("User-Agent"), FString::Printf(TEXT("wolleen-unreal/%s"), WolleenSDK::Version));
	if (!Body.IsEmpty())
	{
		Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
		Request->SetContentAsString(Body);
	}

	// BindWeakLambda : le rappel est ignoré si le sous-système a été détruit entre-temps.
	// Les rappels HTTP sont exécutés sur le game thread.
	Request->OnProcessRequestComplete().BindWeakLambda(this,
		[Callback = MoveTemp(OnDone)](FHttpRequestPtr /*Req*/, FHttpResponsePtr Response, bool bConnectedSuccessfully)
		{
			FWolleenHttpResult Result;
			if (bConnectedSuccessfully && Response.IsValid())
			{
				Result.Status = Response->GetResponseCode();
				Result.bOk = EHttpResponseCodes::IsOk(Result.Status);
				const FString Content = Response->GetContentAsString();
				if (!Content.IsEmpty())
				{
					TSharedPtr<FJsonObject> Json;
					const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Content);
					if (FJsonSerializer::Deserialize(Reader, Json))
					{
						Result.Json = Json;
					}
				}
			}
			else
			{
				Result.Error = TEXT("Requête HTTP impossible (réseau, DNS ou délai dépassé).");
			}
			Callback(Result);
		});

	Request->ProcessRequest();
}

void UWolleenSubsystem::ReportFailure(const FString& Endpoint, const FWolleenHttpResult& Result)
{
	FString Code = Result.Status > 0 ? FString::Printf(TEXT("http_%d"), Result.Status) : TEXT("network_error");
	FString Message = Result.Error;

	const TSharedPtr<FJsonObject>* Error = nullptr;
	if (Result.Json.IsValid() && Result.Json->TryGetObjectField(TEXT("error"), Error) && Error != nullptr && Error->IsValid())
	{
		(*Error)->TryGetStringField(TEXT("code"), Code);
		(*Error)->TryGetStringField(TEXT("message"), Message);
	}
	if (Result.Status == 401)
	{
		UE_LOG(LogWolleen, Warning, TEXT("Clé API refusée (401) : vérifiez Paramètres du projet > Plugins > Wolleen."));
	}
	UE_LOG(LogWolleen, Verbose, TEXT("%s : %d %s %s"), *Endpoint, Result.Status, *Code, *Message);
	OnRequestFailed.Broadcast(Endpoint, Result.Status, Code, Message);
}

// ---------------------------------------------------------------------------
// Polling et premier plan
// ---------------------------------------------------------------------------

void UWolleenSubsystem::ApplyPollInterval()
{
	UGameInstance* GI = GetGameInstance();
	if (!GI)
	{
		return;
	}
	FTimerManager& Timers = GI->GetTimerManager();
	Timers.ClearTimer(PollTimer);
	if (PollIntervalSeconds > 0.f)
	{
		Timers.SetTimer(PollTimer, this, &UWolleenSubsystem::Poll, PollIntervalSeconds, /*bLoop*/ true);
	}
}

void UWolleenSubsystem::ForcePoll()
{
	LastPollTime = -1000.0;
	Poll();
}

void UWolleenSubsystem::HandleAppReactivated()
{
	if (bPollOnFocus)
	{
		Poll();
	}
}

void UWolleenSubsystem::HandleActivationStateChanged(bool bIsActive)
{
	if (bIsActive && bPollOnFocus)
	{
		Poll();
	}
}

// ---------------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------------

void UWolleenSubsystem::LoadState()
{
	if (UGameplayStatics::DoesSaveGameExist(WolleenSDK::SaveSlot, WolleenSDK::SaveUserIndex))
	{
		State = Cast<UWolleenSaveGame>(UGameplayStatics::LoadGameFromSlot(WolleenSDK::SaveSlot, WolleenSDK::SaveUserIndex));
	}
	if (!State)
	{
		State = Cast<UWolleenSaveGame>(UGameplayStatics::CreateSaveGameObject(UWolleenSaveGame::StaticClass()));
	}
}

void UWolleenSubsystem::SaveState()
{
	if (State && !UGameplayStatics::SaveGameToSlot(State, WolleenSDK::SaveSlot, WolleenSDK::SaveUserIndex))
	{
		UE_LOG(LogWolleen, Warning, TEXT("Impossible d'enregistrer l'état du SDK (slot %s)."), WolleenSDK::SaveSlot);
	}
}
