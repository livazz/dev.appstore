using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.Serialization;

namespace DevAppStore
{
    /// <summary>
    /// Client Dev AppStore pour Unity (jeu SANS serveur). Ajoutez-le à un GameObject persistant (ou utilisez <see cref="Create"/>),
    /// abonnez-vous à <see cref="OnPurchase"/>, puis appelez <see cref="SetPlayer"/> une fois le joueur connecté.
    ///
    /// Clé PUBLIQUE uniquement (<c>das_pub_…</c>, page Intégration) : elle n'est pas secrète. Les achats du joueur ne sont
    /// accessibles qu'après la liaison : <see cref="RequestLinkCode(string, Action{LinkCode}, Action{DevAppStoreError})"/> affiche
    /// un code que le joueur saisit sur Dev AppStore ; le client reçoit alors un jeton joueur (mémorisé dans PlayerPrefs) qui
    /// donne accès aux achats de CE joueur seulement. N'embarquez jamais la clé secrète (<c>das_secret_…</c>) dans le jeu.
    ///
    /// Les achats en attente sont récupérés au lancement, toutes les <see cref="pollIntervalSeconds"/> secondes et
    /// à chaque retour au premier plan (OnApplicationFocus / OnApplicationPause). Chaque livraison n'est passée
    /// qu'une fois à <see cref="OnPurchase"/> (dédoublonnage par delivery_id, mémorisé dans PlayerPrefs), puis
    /// acquittée automatiquement si aucun abonné n'a levé d'exception.
    /// </summary>
    [DisallowMultipleComponent]
    public class DevAppStoreClient : MonoBehaviour
    {
        public const string Version = "0.3.0";
        public const string PlayerTokenHeader = "DevAppStore-Player-Token";

        [Tooltip("Clé PUBLIQUE du jeu (das_pub_…), page Intégration de l'espace studio. Jamais la clé secrète.")]
        [FormerlySerializedAs("apiKey")]
        [SerializeField] private string publishableKey = "";

        [Tooltip("URL de Dev AppStore, ex. https://devappstore.com (http://localhost:3000 en développement).")]
        [SerializeField] private string baseUrl = "https://devappstore.com";

        [Tooltip("Intervalle d'interrogation des achats en attente, en secondes (minimum 5).")]
        [SerializeField] private float pollIntervalSeconds = 30f;

        [Tooltip("Intervalle d'interrogation de la demande de liaison après l'affichage du code, en secondes (minimum 1).")]
        [SerializeField] private float linkPollSeconds = 3f;

        [Tooltip("Accuser réception automatiquement après OnPurchase.")]
        [SerializeField] private bool autoAck = true;

        [Tooltip("Conserver ce client entre les scènes.")]
        [SerializeField] private bool dontDestroyOnLoad = true;

        [Tooltip("Délai max d'une requête HTTP, en secondes.")]
        [SerializeField] private int timeoutSeconds = 15;

        private const int ProcessedKeep = 200;

        /// <summary>
        /// Achat (<c>purchase.completed</c>) ou remboursement (<c>purchase.refunded</c>, <see cref="PurchaseEvent.IsRefund"/>)
        /// à appliquer. Remboursement : retirez l'objet si cet <c>order_id</c> avait été crédité, sinon ignorez-le.
        /// Lever une exception empêche l'ack : l'événement sera proposé de nouveau.
        /// </summary>
        public event Action<PurchaseEvent> OnPurchase;

        /// <summary>Le joueur a saisi le code sur Dev AppStore : jeton joueur reçu (paramètre : player_id).</summary>
        public event Action<string> OnLinked;

        /// <summary>Le jeton joueur a été révoqué ou oublié (Unlink, révocation par le studio) : proposez de relier le compte.</summary>
        public event Action OnUnlinked;

        /// <summary>Erreurs non fatales (réseau, clé refusée, code expiré, ack échoué…).</summary>
        public event Action<DevAppStoreError> OnError;

        public string PlayerId { get; private set; }
        public string PublishableKey => publishableKey;
        [Obsolete("Utilisez PublishableKey.")] public string ApiKey => publishableKey;
        public string BaseUrl => baseUrl.TrimEnd('/');
        /// <summary>Jeton joueur de l'appareil pour le joueur courant (null si non lié).</summary>
        public string PlayerToken { get; private set; }
        /// <summary>Vrai si les achats du joueur courant sont accessibles (jeton joueur présent).</summary>
        public bool IsLinked => !string.IsNullOrEmpty(PlayerToken);

        /// <summary>Nombre d'abonnés à <see cref="OnPurchase"/> (utilisé par le prefab glisser-déposer pour ne jamais acquitter un achat que personne n'a reçu).</summary>
        public int PurchaseHandlerCount => OnPurchase == null ? 0 : OnPurchase.GetInvocationList().Length;

        private readonly HashSet<string> _processed = new HashSet<string>();
        private readonly List<string> _processedOrder = new List<string>();
        private readonly HashSet<string> _acked = new HashSet<string>();
        private bool _fetching;
        private bool _checkAgain;
        private Coroutine _pollLoop;
        private Coroutine _linkWait;

        /// <summary>Crée un GameObject « Dev AppStore » avec un client configuré par code (clé publique das_pub_…).</summary>
        public static DevAppStoreClient Create(string publishableKey, string baseUrl = "https://devappstore.com", float pollIntervalSeconds = 30f)
        {
            var go = new GameObject("DevAppStore");
            go.SetActive(false); // configurer avant Awake/OnEnable
            var client = go.AddComponent<DevAppStoreClient>();
            client.publishableKey = publishableKey;
            client.baseUrl = baseUrl;
            client.pollIntervalSeconds = pollIntervalSeconds;
            go.SetActive(true);
            return client;
        }

        private void Awake()
        {
            if (dontDestroyOnLoad) DontDestroyOnLoad(gameObject);
            if (!string.IsNullOrEmpty(publishableKey) && !publishableKey.StartsWith("das_pub_", StringComparison.Ordinal))
            {
                Debug.LogError("[Dev AppStore] La clé configurée n'est pas une clé publique (das_pub_…). Une clé secrète embarquée dans le jeu " +
                               "peut être extraite et donne accès aux achats de tous les joueurs : remplacez-la par la clé publique.");
            }
        }

        private void OnEnable()
        {
            _pollLoop = StartCoroutine(PollLoop());
        }

        private void OnDisable()
        {
            // Arrête l'interrogation et les requêtes en cours ; les acks perdus seront renvoyés au prochain rattrapage.
            StopAllCoroutines();
            _pollLoop = null;
            _linkWait = null;
            _fetching = false;
            _checkAgain = false;
        }

        /// <summary>Définit le joueur courant (ID du compte de jeu) et lance immédiatement un rattrapage s'il est lié.</summary>
        public void SetPlayer(string playerId)
        {
            if (PlayerId == playerId) { CheckNow(); return; }
            PlayerId = playerId;
            LoadProcessed();
            PlayerToken = string.IsNullOrEmpty(playerId) ? null : NullIfEmpty(PlayerPrefs.GetString(TokenKey, ""));
            CheckNow();
        }

        /// <summary>Interroge Dev AppStore tout de suite (ex. après un retour de la boutique web). Sans liaison, ne fait rien.</summary>
        public void CheckNow()
        {
            if (string.IsNullOrEmpty(PlayerId) || !IsLinked || !isActiveAndEnabled) return;
            if (_fetching) { _checkAgain = true; return; }
            StartCoroutine(FetchPending());
        }

        private void OnApplicationFocus(bool hasFocus)
        {
            if (hasFocus) CheckNow();
        }

        private void OnApplicationPause(bool paused)
        {
            if (!paused) CheckNow();
        }

        private IEnumerator PollLoop()
        {
            // Au lancement, puis toutes les N secondes (temps réel : non affecté par Time.timeScale).
            while (true)
            {
                CheckNow();
                yield return new WaitForSecondsRealtime(Mathf.Max(5f, pollIntervalSeconds));
            }
        }

        // ------------------------------------------------------------------ Liaison

        /// <summary>
        /// Demande un code de liaison pour le joueur courant, à afficher dans le jeu ; le joueur le saisit sur Dev AppStore.
        /// Le client attend ensuite la saisie (<see cref="OnLinked"/>) et commence à recevoir les achats.
        /// </summary>
        public void RequestLinkCode(string playerName, Action<LinkCode> onSuccess, Action<DevAppStoreError> onError = null)
        {
            if (string.IsNullOrEmpty(PlayerId))
            {
                onError?.Invoke(new DevAppStoreError { Status = 0, Code = "no_player", Message = "Appelez SetPlayer avant RequestLinkCode." });
                return;
            }
            RequestLinkCode(PlayerId, playerName, onSuccess, onError);
        }

        /// <summary>Demande un code de liaison pour un joueur donné (qui devient le joueur courant).</summary>
        public void RequestLinkCode(string playerId, string playerName, Action<LinkCode> onSuccess, Action<DevAppStoreError> onError = null)
        {
            if (PlayerId != playerId) SetPlayer(playerId);
            string body = string.IsNullOrEmpty(playerName)
                ? JsonUtility.ToJson(new LinkCodeRequestIdOnly { player_id = playerId })
                : JsonUtility.ToJson(new LinkCodeRequest { player_id = playerId, player_name = playerName });
            StartCoroutine(Send("POST", "/api/v1/link-codes", body, false,
                text =>
                {
                    var link = JsonUtility.FromJson<LinkCode>(text);
                    onSuccess?.Invoke(link);
                    if (link != null && !string.IsNullOrEmpty(link.link_request_id))
                    {
                        if (_linkWait != null) StopCoroutine(_linkWait);
                        _linkWait = StartCoroutine(WaitForLink(link, playerId));
                    }
                },
                err => { onError?.Invoke(err); RaiseError(err); }));
        }

        /// <summary>Arrête l'attente de la saisie du code (ex. le joueur ferme l'écran de liaison).</summary>
        public void CancelLinkWait()
        {
            if (_linkWait != null) StopCoroutine(_linkWait);
            _linkWait = null;
        }

        private IEnumerator WaitForLink(LinkCode link, string playerId)
        {
            float remaining = 11 * 60f;
            if (DateTime.TryParse(link.expires_at, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var exp))
            {
                remaining = Mathf.Max(0f, (float)(exp - DateTime.UtcNow).TotalSeconds) + 30f;
            }
            float deadline = Time.realtimeSinceStartup + remaining;
            float interval = Mathf.Max(1f, linkPollSeconds);
            while (Time.realtimeSinceStartup < deadline)
            {
                yield return new WaitForSecondsRealtime(interval);
                LinkRequestStatus status = null;
                DevAppStoreError failure = null;
                yield return Send("GET", "/api/v1/link-requests/" + Uri.EscapeDataString(link.link_request_id), null, false,
                    text => status = JsonUtility.FromJson<LinkRequestStatus>(text),
                    err => failure = err);
                if (failure != null)
                {
                    if (failure.Status == 404 || failure.Status == 401) { RaiseError(failure); break; }
                    continue; // réseau : on réessaie
                }
                if (status == null || status.status == "pending") continue;
                if (status.status == "linked" && !string.IsNullOrEmpty(status.player_token))
                {
                    StoreToken(string.IsNullOrEmpty(status.player_id) ? playerId : status.player_id, status.player_token);
                    _linkWait = null;
                    try { OnLinked?.Invoke(playerId); }
                    catch (Exception ex) { Debug.LogException(ex); }
                    CheckNow();
                    yield break;
                }
                string code = status.status == "expired" ? "link_expired" : "link_already_claimed";
                string message = status.status == "expired" ? "Code expiré : demandez-en un nouveau." : "Jeton déjà délivré pour ce code : demandez un nouveau code.";
                RaiseError(new DevAppStoreError { Status = 0, Code = code, Message = message });
                break;
            }
            _linkWait = null;
        }

        /// <summary>Délie cet appareil : révoque le jeton joueur côté Dev AppStore puis l'oublie.</summary>
        public void Unlink(Action onDone = null)
        {
            if (!IsLinked) { onDone?.Invoke(); return; }
            StartCoroutine(Send("DELETE", "/api/v1/player-tokens", null, true,
                _ => { ClearToken(); onDone?.Invoke(); },
                err => { ClearToken(); RaiseError(err); onDone?.Invoke(); }));
        }

        // ------------------------------------------------------------------ Livraisons

        /// <summary>Confirme que la livraison a été créditée, ou le remboursement appliqué (statut « acknowledged »).</summary>
        public void Ack(string deliveryId, Action onSuccess = null, Action<DevAppStoreError> onError = null)
        {
            StartCoroutine(Send("POST", "/api/v1/deliveries/" + Uri.EscapeDataString(deliveryId) + "/ack", "{}", true,
                _ => { _acked.Add(deliveryId); onSuccess?.Invoke(); },
                err => { onError?.Invoke(err); RaiseError(err); }));
        }

        private IEnumerator FetchPending()
        {
            _fetching = true;
            string player = PlayerId;
            PurchaseEvent[] events = null;
            yield return Send("GET", "/api/v1/deliveries?player_id=" + Uri.EscapeDataString(player), null, true,
                text =>
                {
                    var res = JsonUtility.FromJson<DeliveriesResponse>(text);
                    events = res?.data;
                },
                RaiseError);
            _fetching = false;

            if (events != null && player == PlayerId)
            {
                foreach (var e in events) Process(e);
            }

            if (_checkAgain)
            {
                _checkAgain = false;
                CheckNow();
            }
        }

        private void Process(PurchaseEvent e)
        {
            if (e == null || string.IsNullOrEmpty(e.delivery_id)) return;
            if (_processed.Contains(e.delivery_id))
            {
                // Déjà crédité mais renvoyé : l'ack précédent s'est perdu, on le renvoie sans recréditer.
                if (autoAck && !_acked.Contains(e.delivery_id)) Ack(e.delivery_id);
                return;
            }
            try
            {
                OnPurchase?.Invoke(e);
            }
            catch (Exception ex)
            {
                Debug.LogException(ex);
                RaiseError(new DevAppStoreError { Status = 0, Code = "handler_failed", Message = ex.Message });
                return; // pas d'ack : l'achat sera proposé de nouveau
            }
            MarkProcessed(e.delivery_id);
            if (autoAck) Ack(e.delivery_id);
        }

        // ---------------------------------------------------------------- HTTP

        /// <summary>Requête vers l'API. La clé et le jeton voyagent en en-têtes, jamais dans l'URL.</summary>
        private IEnumerator Send(string method, string path, string jsonBody, bool withToken, Action<string> onSuccess, Action<DevAppStoreError> onError)
        {
            string token = PlayerToken;
            if (withToken && string.IsNullOrEmpty(token))
            {
                onError?.Invoke(new DevAppStoreError { Status = 401, Code = "player_token_required", Message = "Compte joueur non lié sur cet appareil : appelez RequestLinkCode." });
                yield break;
            }
            using (var req = new UnityWebRequest(BaseUrl + path, method))
            {
                req.downloadHandler = new DownloadHandlerBuffer();
                if (jsonBody != null)
                {
                    req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
                    req.SetRequestHeader("Content-Type", "application/json");
                }
                req.SetRequestHeader("Authorization", "Bearer " + publishableKey);
                if (withToken) req.SetRequestHeader(PlayerTokenHeader, token);
                req.SetRequestHeader("Accept", "application/json");
                req.timeout = timeoutSeconds;
                yield return req.SendWebRequest();

                string text = req.downloadHandler != null ? req.downloadHandler.text : null;
                if (req.result == UnityWebRequest.Result.Success)
                {
                    onSuccess?.Invoke(text);
                    yield break;
                }

                var err = new DevAppStoreError { Status = req.responseCode, Code = "http_error", Message = req.error };
                if (req.result == UnityWebRequest.Result.ConnectionError) err.Code = "network_error";
                if (!string.IsNullOrEmpty(text))
                {
                    try
                    {
                        var parsed = JsonUtility.FromJson<ApiErrorResponse>(text);
                        if (parsed?.error != null && !string.IsNullOrEmpty(parsed.error.code))
                        {
                            err.Code = parsed.error.code;
                            err.Message = parsed.error.message;
                        }
                    }
                    catch (ArgumentException) { /* corps non JSON */ }
                }
                // Jeton révoqué ou invalide : on l'oublie, le jeu doit proposer de relier le compte.
                if (withToken && err.Code == "player_token_required" && token == PlayerToken) ClearToken();
                onError?.Invoke(err);
            }
        }

        private void RaiseError(DevAppStoreError err)
        {
            try { OnError?.Invoke(err); }
            catch (Exception ex) { Debug.LogException(ex); }
            if (OnError == null) Debug.LogWarning(err.ToString());
        }

        // ------------------------------------------------- Jeton joueur et dédoublonnage persistants

        private string TokenKey => "devappstore.token." + PlayerId;
        private string PrefsKey => "devappstore.processed." + PlayerId;

        private static string NullIfEmpty(string s) => string.IsNullOrEmpty(s) ? null : s;

        private void StoreToken(string playerId, string token)
        {
            PlayerPrefs.SetString("devappstore.token." + playerId, token);
            PlayerPrefs.Save();
            if (playerId == PlayerId) PlayerToken = token;
        }

        private void ClearToken()
        {
            if (string.IsNullOrEmpty(PlayerId)) return;
            bool wasLinked = IsLinked;
            PlayerPrefs.DeleteKey(TokenKey);
            PlayerPrefs.Save();
            PlayerToken = null;
            if (!wasLinked) return;
            try { OnUnlinked?.Invoke(); }
            catch (Exception ex) { Debug.LogException(ex); }
        }

        private void LoadProcessed()
        {
            _processed.Clear();
            _processedOrder.Clear();
            _acked.Clear();
            string raw = PlayerPrefs.GetString(PrefsKey, "");
            if (string.IsNullOrEmpty(raw)) return;
            foreach (var id in raw.Split(','))
            {
                if (id.Length > 0 && _processed.Add(id)) _processedOrder.Add(id);
            }
        }

        private void MarkProcessed(string deliveryId)
        {
            if (!_processed.Add(deliveryId)) return;
            _processedOrder.Add(deliveryId);
            while (_processedOrder.Count > ProcessedKeep)
            {
                _processed.Remove(_processedOrder[0]);
                _processedOrder.RemoveAt(0);
            }
            PlayerPrefs.SetString(PrefsKey, string.Join(",", _processedOrder));
            PlayerPrefs.Save(); // avant l'ack : un crash entre les deux ne recrédite pas
        }
    }
}
