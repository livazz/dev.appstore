/* Helpers purs (client + serveur) pour les ventes et l'historique d'achats. */
import type { Currency, DeliveryStatus, OrderStatus } from '@devappstore/core';

/**
 * Identique à formatMoney de @devappstore/core, mais utilisable dans un composant client
 * (l'index de core embarque node:crypto).
 */
export function formatCents(cents: number, currency: Currency = 'EUR') {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

export const SALES_PERIODS = [7, 30, 90] as const;
export type SalesPeriod = (typeof SALES_PERIODS)[number];

/** Lit `?days=` ; 30 jours par défaut. */
export function parseSalesPeriod(v: string | string[] | undefined | null): SalesPeriod {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (SALES_PERIODS as readonly number[]).includes(n) ? (n as SalesPeriod) : 30;
}

export type DeliveryTone = 'progress' | 'ok' | 'done' | 'error' | 'muted';

/**
 * Statut lisible côté joueur. `delivery` vaut null tant que la livraison n'a pas été créée
 * (commande payée, en file) : on l'affiche comme « en cours ».
 */
export function playerDeliveryLabel(orderStatus: OrderStatus, delivery: DeliveryStatus | null): { label: string; tone: DeliveryTone } {
  if (orderStatus === 'refunded') return { label: 'Remboursé', tone: 'muted' };
  if (orderStatus === 'failed') return { label: 'Paiement refusé', tone: 'error' };
  if (orderStatus === 'pending') return { label: 'Paiement en attente', tone: 'muted' };
  switch (delivery) {
    case 'delivered':
      return { label: 'Livré', tone: 'ok' };
    case 'acknowledged':
      return { label: 'Confirmé dans le jeu', tone: 'done' };
    case 'failed':
      return { label: 'Échec — contactez le support', tone: 'error' };
    default:
      return { label: 'En cours de livraison', tone: 'progress' };
  }
}

/** Statut de livraison côté studio (plus technique). */
export function studioDeliveryLabel(orderStatus: OrderStatus, delivery: DeliveryStatus | null): { label: string; tone: DeliveryTone } {
  if (orderStatus === 'refunded') return { label: 'Remboursé', tone: 'muted' };
  switch (delivery) {
    case 'delivered':
      return { label: 'Livré (non confirmé)', tone: 'ok' };
    case 'acknowledged':
      return { label: 'Confirmé par le jeu', tone: 'done' };
    case 'failed':
      return { label: 'Échec de livraison', tone: 'error' };
    case 'pending':
      return { label: 'En attente', tone: 'progress' };
    default:
      return { label: 'Non mise en file', tone: 'progress' };
  }
}

export const TONE_CLASSES: Record<DeliveryTone, string> = {
  progress: 'bg-warn/10 text-warn',
  ok: 'bg-primary/10 text-primary',
  done: 'bg-ok/10 text-ok',
  error: 'bg-danger/10 text-danger',
  muted: 'bg-ink-3/15 text-ink-2',
};

/** « 2026-11-09 » → « 9 nov. » (jour calendaire, sans décalage de fuseau). */
export function formatDayShort(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function formatDateTime(date: Date, timeZone = 'Europe/Paris') {
  return date.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone });
}
