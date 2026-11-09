using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Wolleen
{
    /// <summary>
    /// Client Wolleen pour Unity. Ajoutez-le à un GameObject persistant (ou utilisez <see cref="Create"/>),
    /// abonnez-vous à <see cref="OnPurchase"/>, puis appelez <see cref="SetPlayer"/> une fois le joueur connecté.
    ///
    /// Les achats en attente sont récupérés au lancement, toutes les <see cref="pollIntervalSeconds"/> secondes et
    /// à chaque retour au premier plan (OnApplicationFocus / OnApplicationPause). Chaque livraison n'est passée
    /// qu'une fois à <see cref="OnPurchase"/> (dédoublonnage par delivery_id, mémorisé dans PlayerPrefs), puis
    /// acquittée automatiquement si aucun abonné n'a levé d'exception.
    /// </summary>
    [DisallowMultipleComponent]
    public class WolleenClient : MonoBehaviour
    {
        public const string Version = "0.1.0";

        [Tooltip("Clé API du jeu (wk_…), page Intégration de l'espace studio Wolleen.")]
        [SerializeField] private string apiKey = "";

        [Tooltip("URL de Wolleen, ex. https://wolleen.com (http://localhost:3000 en développement).")]
        [SerializeField] private string baseUrl = "https://wolleen.com";

        [Tooltip("Intervalle d'interrogation des achats en attente, en secondes (minimum 5).")]
        [SerializeField] private float pollIntervalSeconds = 30f;

        [Tooltip("Accuser réception automatiquement après OnPurchase.")]
        [SerializeField] private bool autoAck = true;

        [Tooltip("Conserver ce client entre les scènes.")]
        [SerializeField] private bool dontDestroyOnLoad = true;

        [Tooltip("Délai max d'une requête HTTP, en secondes.")]
        [SerializeField] private int timeoutSeconds = 15;

        private const int ProcessedKeep = 200;

        /// <summary>Achat à créditer. Lever une exception empêche l'ack : l'achat sera proposé de nouveau.</summary>
        public event Action<PurchaseEvent> OnPurchase;

        /// <summary>Erreurs non fatales (réseau, clé refusée, ack échoué…).</summary>
        public event Action<WolleenError> OnError;

        public string PlayerId { get; private set; }
        public string ApiKey => apiKey;
        public string BaseUrl => baseUrl.TrimEnd('/');

        private readonly HashSet<string> _processed = new HashSet<string>();
        private readonly List<string> _processedOrder = new List<string>();
        private readonly HashSet<string> _acked = new HashSet<string>();
        private bool _fetching;
        private bool _checkAgain;
        private Coroutine _pollLoop;

        /// <summary>Crée un GameObject « Wolleen » avec un client configuré par code.</summary>
        public static WolleenClient Create(string apiKey, string baseUrl = "https://wolleen.com", float pollIntervalSeconds = 30f)
        {
            var go = new GameObject("Wolleen");
            go.SetActive(false); // configurer avant Awake/OnEnable
            var client = go.AddComponent<WolleenClient>();
            client.apiKey = apiKey;
            client.baseUrl = baseUrl;
            client.pollIntervalSeconds = pollIntervalSeconds;
            go.SetActive(true);
            return client;
        }

        private void Awake()
        {
            if (dontDestroyOnLoad) DontDestroyOnLoad(gameObject);
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
            _fetching = false;
            _checkAgain = false;
        }

        /// <summary>Définit le joueur courant (ID du compte de jeu) et lance immédiatement un rattrapage.</summary>
        public void SetPlayer(string playerId)
        {
            if (PlayerId == playerId) { CheckNow(); return; }
            PlayerId = playerId;
            LoadProcessed();
            CheckNow();
        }

        /// <summary>Interroge Wolleen tout de suite (ex. après un retour de la boutique web).</summary>
        public void CheckNow()
        {
            if (string.IsNullOrEmpty(PlayerId) || !isActiveAndEnabled) return;
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

        // ------------------------------------------------------------------ API

        /// <summary>Demande un code de liaison à afficher dans le jeu ; le joueur le saisit sur Wolleen.</summary>
        public void RequestLinkCode(string playerName, Action<LinkCode> onSuccess, Action<WolleenError> onError = null)
        {
            if (string.IsNullOrEmpty(PlayerId))
            {
                onError?.Invoke(new WolleenError { Status = 0, Code = "no_player", Message = "Appelez SetPlayer avant RequestLinkCode." });
                return;
            }
            RequestLinkCode(PlayerId, playerName, onSuccess, onError);
        }

        /// <summary>Demande un code de liaison pour un joueur donné.</summary>
        public void RequestLinkCode(string playerId, string playerName, Action<LinkCode> onSuccess, Action<WolleenError> onError = null)
        {
            string body = string.IsNullOrEmpty(playerName)
                ? JsonUtility.ToJson(new LinkCodeRequestIdOnly { player_id = playerId })
                : JsonUtility.ToJson(new LinkCodeRequest { player_id = playerId, player_name = playerName });
            StartCoroutine(Send("POST", "/api/v1/link-codes", body,
                text => onSuccess?.Invoke(JsonUtility.FromJson<LinkCode>(text)),
                err => { onError?.Invoke(err); RaiseError(err); }));
        }

        /// <summary>Confirme que la livraison a été créditée (statut « acknowledged »).</summary>
        public void Ack(string deliveryId, Action onSuccess = null, Action<WolleenError> onError = null)
        {
            StartCoroutine(Send("POST", "/api/v1/deliveries/" + Uri.EscapeDataString(deliveryId) + "/ack", "{}",
                _ => { _acked.Add(deliveryId); onSuccess?.Invoke(); },
                err => { onError?.Invoke(err); RaiseError(err); }));
        }

        private IEnumerator FetchPending()
        {
            _fetching = true;
            string player = PlayerId;
            PurchaseEvent[] events = null;
            yield return Send("GET", "/api/v1/deliveries?player_id=" + Uri.EscapeDataString(player), null,
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
                RaiseError(new WolleenError { Status = 0, Code = "handler_failed", Message = ex.Message });
                return; // pas d'ack : l'achat sera proposé de nouveau
            }
            MarkProcessed(e.delivery_id);
            if (autoAck) Ack(e.delivery_id);
        }

        // ---------------------------------------------------------------- HTTP

        private IEnumerator Send(string method, string path, string jsonBody, Action<string> onSuccess, Action<WolleenError> onError)
        {
            using (var req = new UnityWebRequest(BaseUrl + path, method))
            {
                req.downloadHandler = new DownloadHandlerBuffer();
                if (jsonBody != null)
                {
                    req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
                    req.SetRequestHeader("Content-Type", "application/json");
                }
                req.SetRequestHeader("Authorization", "Bearer " + apiKey);
                req.SetRequestHeader("Accept", "application/json");
                req.timeout = timeoutSeconds;
                yield return req.SendWebRequest();

                string text = req.downloadHandler != null ? req.downloadHandler.text : null;
                if (req.result == UnityWebRequest.Result.Success)
                {
                    onSuccess?.Invoke(text);
                    yield break;
                }

                var err = new WolleenError { Status = req.responseCode, Code = "http_error", Message = req.error };
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
                onError?.Invoke(err);
            }
        }

        private void RaiseError(WolleenError err)
        {
            try { OnError?.Invoke(err); }
            catch (Exception ex) { Debug.LogException(ex); }
            if (OnError == null) Debug.LogWarning(err.ToString());
        }

        // ------------------------------------------------- Dédoublonnage persistant

        private string PrefsKey => "wolleen.processed." + PlayerId;

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
