using System;
using System.Globalization;
using UnityEngine;
using UnityEngine.Events;

namespace DevAppStore
{
    /// <summary>Événement Unity (identifiant produit, quantité) : glissez-y votre objet d'inventaire dans l'inspecteur.</summary>
    [Serializable]
    public class DevAppStoreItemEvent : UnityEvent<string, int> { }

    /// <summary>Événement Unity portant un texte (code de liaison).</summary>
    [Serializable]
    public class DevAppStoreTextEvent : UnityEvent<string> { }

    /// <summary>
    /// Intégration « glisser-déposer » : posez le prefab <c>Dev AppStore</c> dans votre première scène, collez la clé
    /// publique du jeu, puis glissez votre objet d'inventaire sur <see cref="onItemGranted"/>. Rien d'autre à coder.
    ///
    /// Ce composant s'occupe de tout le reste : identifiant du joueur (créé et mémorisé sur l'appareil si le jeu n'a pas
    /// de comptes), bouton « Boutique web » et écran du code de liaison, réception des achats au lancement, au retour
    /// dans le jeu et toutes les 30 secondes, accusé de réception, remboursements.
    ///
    /// Un achat n'est acquitté que si votre méthode s'est exécutée sans exception : sinon il reste en attente sur
    /// Dev AppStore et sera reproposé. Si rien n'est branché sur <see cref="onItemGranted"/>, l'achat reste en attente.
    /// </summary>
    [AddComponentMenu("Dev AppStore/Dev AppStore (glisser-déposer)")]
    [RequireComponent(typeof(DevAppStoreClient))]
    [DisallowMultipleComponent]
    public class DevAppStoreDropIn : MonoBehaviour
    {
        public enum PlayerSource
        {
            /// <summary>Identifiant créé au premier lancement et mémorisé sur l'appareil (jeu sans comptes).</summary>
            ThisDevice,
            /// <summary>Le jeu appelle <see cref="SetPlayer"/> quand le joueur est connecté (jeu avec comptes).</summary>
            SetByGame,
        }

        public enum Corner { TopLeft, TopRight, BottomLeft, BottomRight }

        /// <summary>Textes affichés au joueur : modifiables dans l'inspecteur (traduction).</summary>
        [Serializable]
        public class Labels
        {
            public string button = "Boutique web";
            public string title = "Boutique web";
            public string steps = "1. Ouvrez la boutique\n2. Connectez-vous\n3. Saisissez ce code";
            public string loading = "Un instant…";
            public string linked = "Compte lié. Vos achats faits sur la boutique arrivent tout seuls dans le jeu.";
            public string openStore = "Ouvrir la boutique";
            public string newCode = "Nouveau code";
            public string unlink = "Délier ce compte";
            public string close = "Fermer";
            public string expired = "Code expiré.";
            public string error = "Connexion impossible. Réessayez dans un instant.";
            public string purchaseToast = "Achat reçu !";
            public string linkedToast = "Compte lié !";
        }

        private const string DeviceIdKey = "devappstore.device_player_id";
        private const string StoreUrlKey = "devappstore.store_url";

        [Header("Joueur")]
        [Tooltip("This Device : le SDK crée un identifiant et le mémorise sur l'appareil (jeu sans comptes).\nSet By Game : votre jeu appelle SetPlayer(id) quand le joueur est connecté.")]
        [SerializeField] private PlayerSource player = PlayerSource.ThisDevice;

        [Tooltip("Nom montré au joueur sur la boutique pour confirmer la liaison (facultatif).")]
        [SerializeField] private string playerName = "";

        [Header("Achats reçus")]
        [Tooltip("Appelé pour chaque achat reçu : (identifiant produit, quantité). Glissez ici votre objet d'inventaire et choisissez la méthode qui crédite le joueur.")]
        public DevAppStoreItemEvent onItemGranted = new DevAppStoreItemEvent();

        [Tooltip("Appelé quand un achat est remboursé : (identifiant produit, quantité). Retirez l'objet.")]
        public DevAppStoreItemEvent onItemRevoked = new DevAppStoreItemEvent();

        [Header("Écran de liaison intégré")]
        [Tooltip("Affiche le bouton « Boutique web ». Décochez pour ouvrir l'écran depuis votre propre menu avec OpenLinkPanel().")]
        [SerializeField] private bool showButton = true;

        [SerializeField] private Corner buttonCorner = Corner.TopRight;

        [Tooltip("Petit message à l'écran quand un achat arrive ou que le compte est lié.")]
        [SerializeField] private bool showToasts = true;

        [SerializeField] private Labels labels = new Labels();

        [Header("Pour une interface sur mesure (facultatif)")]
        [Tooltip("Le code de liaison à afficher, si vous dessinez votre propre écran.")]
        public DevAppStoreTextEvent onLinkCode = new DevAppStoreTextEvent();
        public UnityEvent onLinked = new UnityEvent();
        public UnityEvent onUnlinked = new UnityEvent();

        /// <summary>Le client HTTP sous-jacent (événements C#, CheckNow, Unlink…).</summary>
        public DevAppStoreClient Client { get; private set; }

        /// <summary>Vrai si le compte du joueur est lié sur cet appareil.</summary>
        public bool IsLinked => Client != null && Client.IsLinked;

        /// <summary>Dernier code de liaison obtenu (null si aucun, ou après la liaison).</summary>
        public string LinkCode { get; private set; }

        private bool _panelOpen;
        private bool _busy;
        private string _error;
        private DateTime _expiresUtc;
        private string _storeUrl;
        private string _toast;
        private float _toastUntil;
        private int _codeListeners;

        // ------------------------------------------------------------------ Cycle de vie

        private void Awake()
        {
            Client = GetComponent<DevAppStoreClient>();
            _storeUrl = PlayerPrefs.GetString(StoreUrlKey, "");
        }

        private void OnEnable()
        {
            Client.OnPurchase += HandlePurchase;
            Client.OnLinked += HandleLinked;
            Client.OnUnlinked += HandleUnlinked;
        }

        private void OnDisable()
        {
            if (Client == null) return;
            Client.OnPurchase -= HandlePurchase;
            Client.OnLinked -= HandleLinked;
            Client.OnUnlinked -= HandleUnlinked;
        }

        private void Start()
        {
            if (string.IsNullOrEmpty(Client.PublishableKey))
            {
                Debug.LogError("[Dev AppStore] Collez la clé publique du jeu (das_pub_…) dans le champ « Publishable Key » du prefab Dev AppStore.", this);
            }
            if (player == PlayerSource.ThisDevice) Client.SetPlayer(DevicePlayerId());
        }

        private void OnDestroy()
        {
            DestroyStyles();
        }

        // ------------------------------------------------------------------ API

        /// <summary>Jeu avec comptes : indiquez le joueur connecté (identifiant de VOTRE système de comptes).</summary>
        public void SetPlayer(string playerId)
        {
            Client.SetPlayer(playerId);
        }

        /// <summary>Jeu avec comptes : identifiant et nom affiché sur la boutique.</summary>
        public void SetPlayer(string playerId, string displayName)
        {
            playerName = displayName;
            Client.SetPlayer(playerId);
        }

        /// <summary>
        /// Branche vos méthodes par code plutôt que dans l'inspecteur. Lever une exception dans <paramref name="onGranted"/>
        /// laisse l'achat en attente : il sera reproposé.
        /// </summary>
        public void Listen(UnityAction<string, int> onGranted, UnityAction<string, int> onRevoked = null)
        {
            if (onGranted != null) { onItemGranted.AddListener(onGranted); _codeListeners++; }
            if (onRevoked != null) onItemRevoked.AddListener(onRevoked);
        }

        /// <summary>Ouvre l'écran intégré (code de liaison, ou état « compte lié »). À relier à un bouton de votre menu.</summary>
        public void OpenLinkPanel()
        {
            _panelOpen = true;
            if (!IsLinked && string.IsNullOrEmpty(LinkCode)) RequestLinkCode();
        }

        public void CloseLinkPanel()
        {
            _panelOpen = false;
        }

        /// <summary>Demande un code de liaison (déclenche <see cref="onLinkCode"/>). L'écran intégré l'appelle tout seul.</summary>
        public void RequestLinkCode()
        {
            if (_busy) return;
            if (string.IsNullOrEmpty(Client.PlayerId))
            {
                _error = labels.error;
                Debug.LogWarning("[Dev AppStore] Joueur inconnu : en mode « Set By Game », appelez SetPlayer(id) avant d'ouvrir l'écran de liaison.", this);
                return;
            }
            _busy = true;
            _error = null;
            LinkCode = null;
            Client.RequestLinkCode(playerName,
                link =>
                {
                    _busy = false;
                    if (link == null || string.IsNullOrEmpty(link.code)) { _error = labels.error; return; }
                    LinkCode = link.code;
                    if (!DateTime.TryParse(link.expires_at, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out _expiresUtc))
                    {
                        _expiresUtc = DateTime.UtcNow.AddMinutes(10);
                    }
                    RememberStoreUrl(link.store_url, link.link_url);
                    onLinkCode.Invoke(link.code);
                },
                err =>
                {
                    _busy = false;
                    _error = labels.error;
                });
        }

        /// <summary>Ouvre la boutique du jeu dans le navigateur (page de saisie du code tant que le compte n'est pas lié).</summary>
        public void OpenStore()
        {
            string url = !IsLinked && !string.IsNullOrEmpty(_linkUrl) ? _linkUrl : (string.IsNullOrEmpty(_storeUrl) ? Client.BaseUrl : _storeUrl);
            Application.OpenURL(url);
        }

        /// <summary>Délie cet appareil (le joueur pourra relier son compte avec un nouveau code).</summary>
        public void Unlink()
        {
            Client.Unlink();
        }

        // ------------------------------------------------------------------ Événements du client

        private string _linkUrl;

        private void RememberStoreUrl(string storeUrl, string linkUrl)
        {
            _linkUrl = linkUrl;
            if (string.IsNullOrEmpty(storeUrl) || storeUrl == _storeUrl) return;
            _storeUrl = storeUrl;
            PlayerPrefs.SetString(StoreUrlKey, storeUrl);
            PlayerPrefs.Save();
        }

        private static string DevicePlayerId()
        {
            string id = PlayerPrefs.GetString(DeviceIdKey, "");
            if (!string.IsNullOrEmpty(id)) return id;
            id = "dev_" + Guid.NewGuid().ToString("N");
            PlayerPrefs.SetString(DeviceIdKey, id);
            PlayerPrefs.Save();
            return id;
        }

        private static bool HasInspectorListener(UnityEventBase e)
        {
            for (int i = 0; i < e.GetPersistentEventCount(); i++)
            {
                if (e.GetPersistentTarget(i) != null && !string.IsNullOrEmpty(e.GetPersistentMethodName(i))) return true;
            }
            return false;
        }

        private void HandlePurchase(PurchaseEvent e)
        {
            if (e.IsRefund)
            {
                onItemRevoked.Invoke(e.product_id, e.quantity);
                return;
            }
            // Rien de branché (ni inspecteur, ni Listen, ni abonné C# à Client.OnPurchase) : on refuse l'accusé de réception,
            // l'achat reste en attente sur Dev AppStore au lieu d'être perdu.
            if (!HasInspectorListener(onItemGranted) && _codeListeners == 0 && Client.PurchaseHandlerCount <= 1)
            {
                throw new InvalidOperationException(
                    "Achat « " + e.product_id + " » reçu, mais rien n'est branché sur « On Item Granted » du prefab Dev AppStore. " +
                    "Il reste en attente et sera reproposé : glissez votre objet d'inventaire sur l'événement dans l'inspecteur.");
            }
            onItemGranted.Invoke(e.product_id, e.quantity); // une exception ici laisse l'achat en attente (pas d'accusé)
            if (showToasts) Toast(labels.purchaseToast);
        }

        private void HandleLinked(string playerId)
        {
            LinkCode = null;
            _error = null;
            if (showToasts) Toast(labels.linkedToast);
            onLinked.Invoke();
        }

        private void HandleUnlinked()
        {
            LinkCode = null;
            onUnlinked.Invoke();
        }

        private void Toast(string text)
        {
            _toast = text;
            _toastUntil = Time.realtimeSinceStartup + 4f;
        }

        // ------------------------------------------------------------------ Interface intégrée (IMGUI, sans dépendance)

        private GUIStyle _panelStyle, _titleStyle, _textStyle, _codeStyle, _primaryStyle, _secondaryStyle, _toastStyle;
        private Texture2D _texPanel, _texBrand, _texBrandDown, _texGhost, _texGhostDown, _texDim;

        private static Texture2D Fill(Color c)
        {
            var t = new Texture2D(1, 1, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave };
            t.SetPixel(0, 0, c);
            t.Apply();
            return t;
        }

        private void EnsureStyles()
        {
            if (_panelStyle != null && _texPanel != null) return;
            DestroyStyles();
            var ink = new Color32(0x14, 0x15, 0x1f, 0xff);
            var brand = new Color32(0xff, 0xd4, 0x3b, 0xff);
            _texPanel = Fill(new Color32(0x14, 0x15, 0x1f, 0xf5));
            _texBrand = Fill(brand);
            _texBrandDown = Fill(new Color32(0xe6, 0xbd, 0x2a, 0xff));
            _texGhost = Fill(new Color32(0xff, 0xff, 0xff, 0x24));
            _texGhostDown = Fill(new Color32(0xff, 0xff, 0xff, 0x40));
            _texDim = Fill(new Color(0f, 0f, 0f, 0.55f));

            _panelStyle = new GUIStyle { padding = new RectOffset(18, 18, 16, 16) };
            _panelStyle.normal.background = _texPanel;
            _titleStyle = new GUIStyle(GUI.skin.label) { fontSize = 18, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleLeft, wordWrap = true };
            _titleStyle.normal.textColor = Color.white;
            _textStyle = new GUIStyle(GUI.skin.label) { fontSize = 14, wordWrap = true, richText = false };
            _textStyle.normal.textColor = new Color(1f, 1f, 1f, 0.82f);
            _codeStyle = new GUIStyle(GUI.skin.label) { fontSize = 34, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
            _codeStyle.normal.textColor = brand;
            _codeStyle.normal.background = _texGhost;
            _primaryStyle = Button(_texBrand, _texBrandDown, ink, 15);
            _secondaryStyle = Button(_texGhost, _texGhostDown, Color.white, 14);
            _toastStyle = new GUIStyle(GUI.skin.label) { fontSize = 15, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter, padding = new RectOffset(16, 16, 8, 8) };
            _toastStyle.normal.textColor = ink;
            _toastStyle.normal.background = _texBrand;
        }

        private static GUIStyle Button(Texture2D up, Texture2D down, Color text, int size)
        {
            var s = new GUIStyle { fontSize = size, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter, padding = new RectOffset(12, 12, 8, 8), margin = new RectOffset(0, 0, 6, 0) };
            s.normal.background = up; s.hover.background = up; s.focused.background = up; s.active.background = down;
            s.normal.textColor = text; s.hover.textColor = text; s.focused.textColor = text; s.active.textColor = text;
            return s;
        }

        private void DestroyStyles()
        {
            foreach (var t in new[] { _texPanel, _texBrand, _texBrandDown, _texGhost, _texGhostDown, _texDim })
            {
                if (t != null) Destroy(t);
            }
            _texPanel = _texBrand = _texBrandDown = _texGhost = _texGhostDown = _texDim = null;
            _panelStyle = null;
        }

        private void OnGUI()
        {
            bool toast = _toast != null && Time.realtimeSinceStartup < _toastUntil;
            if (!showButton && !_panelOpen && !toast) return;
            EnsureStyles();

            // Mise à l'échelle : 420 points sur le petit côté de l'écran, quel que soit l'appareil.
            float scale = Mathf.Max(1f, Mathf.Min(Screen.width, Screen.height) / 420f);
            Matrix4x4 previous = GUI.matrix;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
            float w = Screen.width / scale, h = Screen.height / scale;
            Rect safe = Screen.safeArea;
            float left = safe.xMin / scale, right = (Screen.width - safe.xMax) / scale;
            float top = (Screen.height - safe.yMax) / scale, bottom = safe.yMin / scale;
            const float margin = 12f;

            if (showButton && !_panelOpen)
            {
                const float bw = 132f, bh = 38f;
                bool onRight = buttonCorner == Corner.TopRight || buttonCorner == Corner.BottomRight;
                bool onTop = buttonCorner == Corner.TopLeft || buttonCorner == Corner.TopRight;
                var r = new Rect(onRight ? w - right - margin - bw : left + margin, onTop ? top + margin : h - bottom - margin - bh, bw, bh);
                if (GUI.Button(r, labels.button, _primaryStyle)) OpenLinkPanel();
            }

            if (toast)
            {
                Vector2 size = _toastStyle.CalcSize(new GUIContent(_toast));
                GUI.Label(new Rect((w - size.x) / 2f, top + margin, size.x, size.y), _toast, _toastStyle);
            }

            if (_panelOpen)
            {
                GUI.DrawTexture(new Rect(0, 0, w, h), _texDim);
                float pw = Mathf.Min(340f, w - left - right - 2 * margin);
                float ph = Mathf.Min(IsLinked ? 250f : 330f, h - top - bottom - 2 * margin);
                GUILayout.BeginArea(new Rect((w - pw) / 2f, (h - ph) / 2f, pw, ph), _panelStyle);
                GUILayout.Label(labels.title, _titleStyle);
                GUILayout.Space(6);
                if (IsLinked)
                {
                    GUILayout.Label(labels.linked, _textStyle);
                    GUILayout.FlexibleSpace();
                    if (GUILayout.Button(labels.openStore, _primaryStyle, GUILayout.Height(40))) OpenStore();
                    if (GUILayout.Button(labels.unlink, _secondaryStyle, GUILayout.Height(36))) Unlink();
                }
                else
                {
                    GUILayout.Label(labels.steps, _textStyle);
                    GUILayout.Space(8);
                    bool expired = !string.IsNullOrEmpty(LinkCode) && DateTime.UtcNow >= _expiresUtc;
                    if (_busy) GUILayout.Label(labels.loading, _textStyle);
                    else if (!string.IsNullOrEmpty(_error)) GUILayout.Label(_error, _textStyle);
                    else if (expired) GUILayout.Label(labels.expired, _textStyle);
                    else if (!string.IsNullOrEmpty(LinkCode)) GUILayout.Label(LinkCode, _codeStyle, GUILayout.Height(58));
                    GUILayout.FlexibleSpace();
                    if (!_busy && (expired || !string.IsNullOrEmpty(_error) || string.IsNullOrEmpty(LinkCode)))
                    {
                        if (GUILayout.Button(labels.newCode, _primaryStyle, GUILayout.Height(40))) RequestLinkCode();
                    }
                    else if (GUILayout.Button(labels.openStore, _primaryStyle, GUILayout.Height(40))) OpenStore();
                }
                if (GUILayout.Button(labels.close, _secondaryStyle, GUILayout.Height(36))) CloseLinkPanel();
                GUILayout.EndArea();
            }

            GUI.matrix = previous;
        }
    }
}
