import type { Currency, GameStatus, GameTheme, ItemModel, ItemStyle, ItemType, LayoutId, Period } from '@devappstore/core';

/*
 * Vues sérialisables envoyées à l'éditeur studio (composants client).
 * Ne contiennent jamais de secret (webhookSecret, empreinte de clé API…).
 */

export interface EditorGame {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  publisherName: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  /** Présentation longue de la page boutique (paragraphes séparés par une ligne vide). */
  storeDescription: string;
  /** Captures d'écran (URL d'images, ordre d'affichage). */
  screenshots: string[];
  theme: GameTheme;
  currency: Currency;
  status: GameStatus;
  webhookConfigured: boolean;
}

export interface EditorItem {
  id: string;
  productId: string;
  type: ItemType;
  period: Period;
  title: string;
  subtitle: string;
  keywords: string[];
  priceCents: number;
  oldPriceCents: number | null;
  quantity: number;
  models: ItemModel[];
  layout: LayoutId;
  style: ItemStyle;
  /** Description affichée dans le détail de l'article avant achat. */
  description: string;
  /** Promotion programmée (ISO 8601) : null = sans limite. */
  promoStartsAt: string | null;
  promoEndsAt: string | null;
}

type ItemLike = Omit<EditorItem, 'promoStartsAt' | 'promoEndsAt'> & {
  promoStartsAt: Date | string | null;
  promoEndsAt: Date | string | null;
};

const iso = (d: Date | string | null) => (d == null ? null : typeof d === 'string' ? d : d.toISOString());

type GameLike = Omit<EditorGame, 'webhookConfigured'> & { webhookUrl: string | null };

export function toEditorGame(g: GameLike): EditorGame {
  return {
    id: g.id,
    slug: g.slug,
    name: g.name,
    subtitle: g.subtitle,
    publisherName: g.publisherName,
    iconUrl: g.iconUrl,
    bannerUrl: g.bannerUrl,
    storeDescription: g.storeDescription,
    screenshots: g.screenshots,
    theme: g.theme,
    currency: g.currency,
    status: g.status,
    webhookConfigured: !!g.webhookUrl,
  };
}

export function toEditorItem(i: ItemLike): EditorItem {
  return {
    id: i.id,
    productId: i.productId,
    type: i.type,
    period: i.period,
    title: i.title,
    subtitle: i.subtitle,
    keywords: i.keywords,
    priceCents: i.priceCents,
    oldPriceCents: i.oldPriceCents,
    quantity: i.quantity,
    models: i.models,
    layout: i.layout,
    style: i.style,
    description: i.description,
    promoStartsAt: iso(i.promoStartsAt),
    promoEndsAt: iso(i.promoEndsAt),
  };
}

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  draft: 'Brouillon',
  review: 'En revue',
  live: 'En ligne',
  suspended: 'Suspendu',
};
