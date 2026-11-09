import type { Currency, GameStatus, GameTheme, ItemModel, ItemStyle, ItemType, LayoutId, Period } from '@wolleen/core';

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
}

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
    theme: g.theme,
    currency: g.currency,
    status: g.status,
    webhookConfigured: !!g.webhookUrl,
  };
}

export function toEditorItem(i: EditorItem): EditorItem {
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
  };
}

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  draft: 'Brouillon',
  review: 'En revue',
  live: 'En ligne',
  suspended: 'Suspendu',
};
