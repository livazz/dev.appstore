/** Types de domaine partagés par le web, l'API, la base et les SDK. Montants toujours en centimes. */

export type Currency = 'EUR' | 'USD' | 'GBP';
export type ItemType = 'consumable' | 'non_consumable' | 'auto_renewable' | 'non_renewing';
export type Period = 'week' | 'month' | 'year';
export type LayoutId = 1 | 2 | 3 | 4 | 5 | 6;
export type BgType = 'solid' | 'linear' | 'radial';
/** Thème visuel de la boutique (cartes, onglets, boutons). `classic` = rendu historique entièrement paramétrable. */
export type StoreSkin = 'arcade' | 'premium' | 'casual' | 'clean' | 'classic';

/** Méthodes de liaison d'un compte joueur à un compte de jeu. */
export type LinkMethod = 'code' | 'id_confirm' | 'oauth';

export type GameStatus = 'draft' | 'review' | 'live' | 'suspended';
export type StudioRole = 'owner' | 'admin' | 'developer' | 'finance';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded';
/** pending → delivered (webhook 2xx ou SDK a récupéré) → acknowledged (le jeu a confirmé le crédit). */
export type DeliveryStatus = 'pending' | 'delivered' | 'acknowledged' | 'failed';

export interface ItemStyle {
  bgType: BgType;
  bg1: string;
  bg2: string;
  titleColor: string;
  titleBg: string;
  titleOutline: boolean;
  titleShadow: boolean;
  subtitleColor: string;
  priceColor: string;
  priceBg: string;
  priceOutline: boolean;
  priceShadow: boolean;
  borderWidth: number;
  borderColor: string;
  rounded: boolean;
  shadow: boolean;
}

export interface ItemModel {
  imageUrl?: string;
  label: string;
}

export interface GameTheme {
  /** Absent sur les jeux créés avant les thèmes : rendu `classic`. */
  skin?: StoreSkin;
  gradient: { enabled: boolean; c1: string; c2: string; style: 'linear' | 'radial' };
  grid: { width: number; height: number; margin: number };
}

/** Événement envoyé au serveur du studio (webhook) et au SDK. */
export interface PurchaseEvent {
  event: 'purchase.completed' | 'purchase.refunded';
  delivery_id: string;
  order_id: string;
  game_id: string;
  player_id: string;
  product_id: string;
  item_type: ItemType;
  quantity: number;
  amount_cents: number;
  currency: Currency;
  created_at: string;
}

/** Réponse attendue de l'endpoint « player lookup » du studio (méthode id_confirm). */
export interface PlayerLookupResponse {
  player_id: string;
  display_name: string;
  level?: number;
  avatar_url?: string;
}
