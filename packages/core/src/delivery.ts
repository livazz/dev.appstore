import type { DeliveryStatus } from './types';
import { WEBHOOK_RETRY_SCHEDULE_MS } from './constants';

const transitions: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ['delivered', 'acknowledged', 'failed'],
  delivered: ['acknowledged'],
  acknowledged: [],
  failed: ['pending'], // relance manuelle
};

export function canTransition(from: DeliveryStatus, to: DeliveryStatus) {
  return transitions[from].includes(to);
}

/** Date de la prochaine tentative, ou null si on abandonne (statut failed). */
export function nextAttemptAt(attempts: number, now = Date.now()) {
  const delay = WEBHOOK_RETRY_SCHEDULE_MS[attempts - 1];
  return delay === undefined ? null : new Date(now + delay);
}
