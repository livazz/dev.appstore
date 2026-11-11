using System;

namespace DevAppStore
{
    /// <summary>
    /// Achat livré au jeu. Mêmes champs (snake_case) que le JSON de l'API Dev AppStore, pour JsonUtility.
    /// Montants en centimes. <c>delivery_id</c> est la clé d'idempotence : ne jamais créditer deux fois le même.
    /// </summary>
    [Serializable]
    public class PurchaseEvent
    {
        /// <summary>« purchase.completed » ou « purchase.refunded ».</summary>
        public string @event;
        public string delivery_id;
        public string order_id;
        public string game_id;
        public string player_id;
        /// <summary>Identifiant produit configuré dans l'espace studio (ex. « gems_1200 »).</summary>
        public string product_id;
        /// <summary>consumable, non_consumable, auto_renewable, non_renewing.</summary>
        public string item_type;
        public int quantity;
        public int amount_cents;
        public string currency;
        public string created_at;

        /// <summary>
        /// Remboursement de la commande <c>order_id</c> : retirez l'objet si cette commande avait été créditée, sinon ignorez-le.
        /// Mêmes product_id / quantity que l'achat ; delivery_id propre (à acquitter aussi).
        /// </summary>
        public bool IsRefund => @event == "purchase.refunded";
    }

    /// <summary>Code de liaison à afficher au joueur (valable quelques minutes, usage unique).</summary>
    [Serializable]
    public class LinkCode
    {
        public string code;
        /// <summary>Date d'expiration ISO 8601.</summary>
        public string expires_at;
        /// <summary>Demande de liaison interrogée par le client pour obtenir le jeton joueur après la saisie du code.</summary>
        public string link_request_id;
        /// <summary>Page de la boutique où le joueur saisit le code (à ouvrir dans le navigateur).</summary>
        public string link_url;
        /// <summary>Boutique web du jeu.</summary>
        public string store_url;
        /// <summary>Plus forte réduction de la boutique web par rapport aux prix en jeu, en % (0 si aucune).</summary>
        public int web_discount_percent;
    }

    /// <summary>Réponse de GET /api/v1/link-requests/{id}.</summary>
    [Serializable]
    public class LinkRequestStatus
    {
        /// <summary>« pending », « linked », « expired » ou « claimed ».</summary>
        public string status;
        public string player_id;
        public string expires_at;
        /// <summary>Jeton joueur (das_pt_…), présent une seule fois, au premier appel après la saisie du code.</summary>
        public string player_token;
    }

    [Serializable]
    internal class DeliveriesResponse
    {
        public PurchaseEvent[] data;
    }

    [Serializable]
    internal class LinkCodeRequest
    {
        public string player_id;
        public string player_name;
    }

    [Serializable]
    internal class LinkCodeRequestIdOnly
    {
        public string player_id;
    }

    [Serializable]
    internal class ApiErrorBody
    {
        public string code;
        public string message;
    }

    [Serializable]
    internal class ApiErrorResponse
    {
        public ApiErrorBody error;
    }

    /// <summary>Erreur renvoyée par l'API ou le réseau (status 0 = réseau).</summary>
    public class DevAppStoreError
    {
        public long Status;
        public string Code;
        public string Message;

        public override string ToString() => $"Dev AppStore {Status} {Code} : {Message}";
    }
}
