import { LINK_CODE_TTL_MS, SIGNATURE_HEADER, SIGNATURE_TOLERANCE_S, WEBHOOK_RETRY_SCHEDULE_MS } from '@devappstore/core';

/** Délai lisible : 10 s, 1 min, 2 h, 1 j 6 h… */
export function formatDelay(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const restMin = min % 60;
  if (h < 48) return restMin ? `${h} h ${restMin} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const restH = h % 24;
  return restH ? `${d} j ${restH} h` : `${d} j`;
}

/**
 * Valeurs techniques citées par la documentation, lues depuis @devappstore/core (une seule source de vérité)
 * ou recopiées du code des routes quand elles n'y sont pas exportées (testées dans examples.test.ts).
 */
export const DOCS_FACTS = {
  signatureHeader: SIGNATURE_HEADER,
  deliveryHeader: 'DevAppStore-Delivery',
  testHeader: 'DevAppStore-Test',
  toleranceS: SIGNATURE_TOLERANCE_S,
  linkCodeTtlMin: LINK_CODE_TTL_MS / 60_000,
  retrySchedule: WEBHOOK_RETRY_SCHEDULE_MS.map(formatDelay),
  /** delivery.ts : WEBHOOK_TIMEOUT_MS. */
  webhookTimeoutS: 10,
  /** linking.ts : LINK_LIMITS.codesPerGame. */
  linkCodesPerMinute: 120,
  /** linking.ts : LINK_LIMITS.lookupTimeoutMs / lookupMaxBytes / lookupsPerUser. */
  lookupTimeoutS: 5,
  lookupMaxKb: 16,
  lookupsPerUser: 10,
  lookupsWindowMin: 10,
  /** stream/route.ts : HEARTBEAT_MS. */
  sseHeartbeatS: 15,
  /** delivery.ts : takeOpenDeliveries(limit = 100). */
  deliveriesPageSize: 100,
} as const;

export const RETRY_SCHEDULE_TEXT = DOCS_FACTS.retrySchedule.join(', ');
