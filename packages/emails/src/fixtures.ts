/** Données d'exemple (démo Nova Games) pour la prévisualisation et les tests. */
import type { EmailContext } from './context';
import type { DeliveryFailedData, PlayerWelcomeData, PurchaseDeliveredData, PurchaseReceiptData } from './templates/player';
import type { AuthLinkData } from './templates/auth';
import type { WithdrawalAcknowledgementData } from './templates/withdrawal';
import type { StudioDeliveryAlertData, StudioWeeklyReportData, StudioWelcomeData } from './templates/studio';

export const sampleContext: Partial<EmailContext> = {
  appUrl: 'http://localhost:3000',
  supportEmail: 'support@devappstore.com',
  companyName: 'Dev AppStore SAS',
  companyAddress: '[adresse du siège]',
  mediator: { name: '[Médiateur de la consommation]', url: 'https://www.economie.gouv.fr/mediation-conso' },
};

const paidAt = '2026-11-09T13:32:05.000Z';

export const sampleReceipt: PurchaseReceiptData = {
  playerName: 'Léa',
  orderId: 'ord_7Hq2kD9x',
  paidAt,
  item: { name: '500 gemmes', description: 'Pack de gemmes pour Crystal Clash' },
  amountCents: 499,
  currency: 'EUR',
  gameName: 'Crystal Clash',
  gameAccount: { playerId: 'PLR-48213', playerName: 'LeaDragon' },
  seller: { name: 'Nova Games SAS', address: '12 rue du Jeu, 75011 Paris', registration: 'RCS Paris 900 000 000', vatNumber: 'FR00900000000' },
  consent: { acceptedAt: '2026-11-09T13:31:58.412Z', cgvVersion: '2026-11-09', cgvUrl: 'http://localhost:3000/legal/cgv/2026-11-09.pdf' },
  paymentMethod: 'Visa •••• 4242',
};

export const sampleDelivered: PurchaseDeliveredData = {
  playerName: 'Léa',
  orderId: sampleReceipt.orderId,
  item: sampleReceipt.item,
  gameName: 'Crystal Clash',
  gameAccount: sampleReceipt.gameAccount,
  deliveredAt: '2026-11-09T13:32:09.000Z',
};

export const sampleDeliveryFailed: DeliveryFailedData = {
  playerName: 'Léa',
  orderId: sampleReceipt.orderId,
  item: sampleReceipt.item,
  gameName: 'Crystal Clash',
  gameAccount: sampleReceipt.gameAccount,
  amountCents: 499,
  currency: 'EUR',
  paidAt,
};

export const samplePlayerWelcome: PlayerWelcomeData = { name: 'Léa' };

export const sampleVerify: AuthLinkData = {
  name: 'Léa',
  url: 'http://localhost:3000/api/auth/verify-email?token=exemple',
  expiresInMinutes: 1440,
};

export const sampleReset: AuthLinkData = {
  name: 'Léa',
  url: 'http://localhost:3000/reset-password?token=exemple',
  expiresInMinutes: 60,
};

export const sampleStudioWelcome: StudioWelcomeData = {
  userName: 'Camille',
  studioName: 'Nova Games',
};

export const sampleDeliveryAlert: StudioDeliveryAlertData = {
  studioName: 'Nova Games',
  gameName: 'Crystal Clash',
  integrationUrl: 'http://localhost:3000/studio/games/gam_crystal/integration',
  webhookUrl: 'http://localhost:4100/devappstore/webhook',
  totalFailed: 14,
  failures: [
    { deliveryId: 'dlv_1', orderId: 'ord_7Hq2kD9x', itemName: '500 gemmes', playerId: 'PLR-48213', attempts: 5, lastAttemptAt: '2026-11-09T14:05:00Z', lastError: 'HTTP 502 Bad Gateway' },
    { deliveryId: 'dlv_2', orderId: 'ord_P1m0aZ3c', itemName: 'Skin Dragon doré', playerId: 'PLR-11007', attempts: 4, lastAttemptAt: '2026-11-09T14:03:12Z', lastError: 'connect ECONNREFUSED 127.0.0.1:4100' },
    { deliveryId: 'dlv_3', orderId: 'ord_Q8s2nB4e', itemName: 'Pass saison', playerId: 'PLR-90311', attempts: 3, lastAttemptAt: '2026-11-09T13:58:40Z', lastError: 'Délai dépassé (10 s)' },
  ],
};

export const sampleWeeklyReport: StudioWeeklyReportData = {
  studioName: 'Nova Games',
  periodStart: '2026-11-02T00:00:00+01:00',
  periodEnd: '2026-11-08T23:59:59+01:00',
  currency: 'EUR',
  games: [
    { name: 'Crystal Clash', revenueCents: 1_284_700, orders: 2_113, previousRevenueCents: 1_120_000 },
    { name: 'Happy Farm', revenueCents: 312_450, orders: 640, previousRevenueCents: 330_000 },
  ],
  topItem: { name: '500 gemmes', gameName: 'Crystal Clash', orders: 1_204 },
};

export const sampleWithdrawal: WithdrawalAcknowledgementData = {
  playerName: 'Léa',
  orderId: sampleReceipt.orderId,
  item: sampleReceipt.item,
  gameName: 'Crystal Clash',
  gameAccount: sampleReceipt.gameAccount,
  sellerName: 'Nova Games SAS',
  refundedCents: 499,
  currency: 'EUR',
  paidAt,
  requestedAt: '2026-11-09T15:10:42.120Z',
  refundDays: 14,
};
