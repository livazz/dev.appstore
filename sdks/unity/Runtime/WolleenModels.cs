using System;

namespace Wolleen
{
    /// <summary>
    /// Achat livré au jeu. Mêmes champs (snake_case) que le JSON de l'API Wolleen, pour JsonUtility.
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

        public bool IsRefund => @event == "purchase.refunded";
    }

    /// <summary>Code de liaison à afficher au joueur (valable quelques minutes, usage unique).</summary>
    [Serializable]
    public class LinkCode
    {
        public string code;
        /// <summary>Date d'expiration ISO 8601.</summary>
        public string expires_at;
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
    public class WolleenError
    {
        public long Status;
        public string Code;
        public string Message;

        public override string ToString() => $"Wolleen {Status} {Code} : {Message}";
    }
}
