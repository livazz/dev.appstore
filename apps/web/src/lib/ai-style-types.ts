import type { ItemStyle, LayoutId } from '@devappstore/core/client';

/*
 * Types partagés serveur / client de la génération de style par IA (sans dépendance d'exécution :
 * importables depuis un composant client).
 */

export interface AiStyleWarning {
  code: string;
  field: string;
  /** Message en français à afficher dans l'éditeur. */
  message: string;
}

/** Résultat renvoyé à l'éditeur : directement fusionnable dans le brouillon d'article. */
export interface AiStyleResult {
  layout: LayoutId;
  style: ItemStyle;
  /** Titre lu sur la capture (absent si illisible). */
  title?: string;
  /** Sous-titre lu sur la capture (absent si illisible). */
  subtitle?: string;
  warnings: AiStyleWarning[];
  /** Générations restantes pour le studio sur les dernières 24 h. */
  remaining: number;
}

export type AiStyleErrorCode =
  | 'forbidden'
  | 'not_configured'
  | 'invalid_input'
  | 'image_too_large'
  | 'invalid_image'
  | 'rate_limited'
  | 'service_busy'
  | 'refusal'
  | 'failed';

export type AiStyleActionResult = { ok: true; data: AiStyleResult } | { ok: false; code: AiStyleErrorCode; error: string };

/** Limites partagées (le composant client réduit l'image avant l'envoi pour rester sous la limite des Server Actions). */
export const AI_STYLE_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Côté long maximal envoyé au modèle (au-delà, l'API réduit l'image elle-même : coût inutile). */
export const AI_STYLE_MAX_SIDE_PX = 1568;
/** Taille visée pour l'envoi depuis le navigateur (limite par défaut des Server Actions : 1 Mo). */
export const AI_STYLE_CLIENT_TARGET_BYTES = 900 * 1024;
/**
 * Limite des corps de Server Actions (`experimental.serverActions.bodySizeLimit` de next.config.ts) : 1 Mo, valeur
 * par défaut de Next.js (revue 2026-11, C-09 : 9 Mo auparavant pour TOUTES les actions, à cause de cette seule capture).
 */
export const SERVER_ACTION_BODY_LIMIT = '1mb';
export const SERVER_ACTION_BODY_LIMIT_BYTES = 1024 * 1024;
/** Le fichier (après réduction côté navigateur) tient-il dans le corps d'une Server Action, enveloppe multipart comprise ? */
export function fitsServerActionBody(bytes: number): boolean {
  return bytes <= SERVER_ACTION_BODY_LIMIT_BYTES - 16 * 1024;
}
export const AI_STYLE_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
