/**
 * Accusé de réception de la rétractation, sur support durable (directive (UE) 2023/2673, art. L221-21 C. conso ;
 * docs/legal/consumer.md § 2.4). Envoyé dès que la rétractation faite depuis « Mes achats » est enregistrée.
 */
import type { Currency } from '@wolleen/core';
import { appLink, resolveContext, type EmailContext } from '../context';
import { formatDate, formatDateTime, isoTimestamp, money, toDate, type DateInput } from '../format';
import { DEV_APPSTORE_BRAND, details, heading, notice, para, renderEmail, button, type DetailRow, type EmailContent } from '../layout';
import type { GameAccount, PurchaseItem } from './player';

/** Délai légal maximal de remboursement après la demande de rétractation (art. L221-24). */
export const WITHDRAWAL_REFUND_MAX_DAYS = 14;

export interface WithdrawalAcknowledgementData {
  playerName?: string;
  orderId: string;
  item: PurchaseItem;
  gameName: string;
  gameAccount?: GameAccount;
  /** Vendeur (studio). */
  sellerName?: string;
  /** Montant remboursé TTC, en centimes (intégralité du prix payé). */
  refundedCents: number;
  currency: Currency;
  /** Date de paiement de la commande. */
  paidAt?: DateInput;
  /** Date (horodatage) de la demande de rétractation. */
  requestedAt: DateInput;
  /** Délai de remboursement annoncé, en jours à compter de la demande (14 au plus). */
  refundDays?: number;
  /** Remboursement simulé (aucun mouvement d'argent, environnement de démonstration). */
  simulated?: boolean;
  purchasesUrl?: string;
}

function itemLabel(item: PurchaseItem) {
  return item.quantity && !item.name.includes(String(item.quantity)) ? `${item.name} × ${item.quantity}` : item.name;
}

export function withdrawalAcknowledgementEmail(data: WithdrawalAcknowledgementData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  const tz = ctx.timeZone;
  const brand = DEV_APPSTORE_BRAND.name;
  const amount = money(data.refundedCents, data.currency);
  const days = Math.min(Math.max(1, Math.round(data.refundDays ?? WITHDRAWAL_REFUND_MAX_DAYS)), WITHDRAWAL_REFUND_MAX_DAYS);
  const deadline = new Date(toDate(data.requestedAt).getTime() + days * 24 * 3600_000);
  const purchasesUrl = data.purchasesUrl ?? appLink(ctx, '/account/purchases');
  const label = itemLabel(data.item);

  const rows: DetailRow[] = [
    ['N° de commande', data.orderId],
    ['Article', label],
    ['Jeu', data.gameName],
    ...(data.gameAccount
      ? ([['Compte de jeu', data.gameAccount.playerName ? `${data.gameAccount.playerName} (ID ${data.gameAccount.playerId})` : `ID ${data.gameAccount.playerId}`]] as DetailRow[])
      : []),
    ...(data.sellerName ? ([['Vendeur', data.sellerName]] as DetailRow[]) : []),
    ...(data.paidAt !== undefined ? ([['Date du paiement', formatDateTime(data.paidAt, tz)]] as DetailRow[]) : []),
    ['Date de la demande', formatDateTime(data.requestedAt, tz)],
    ['Remboursement', `au plus tard le ${formatDate(deadline, tz)} (sous ${days} jours), par le moyen de paiement utilisé`],
  ];

  return renderEmail({
    ctx,
    brand: DEV_APPSTORE_BRAND,
    subject: `Accusé de réception de votre rétractation : ${label} (${data.gameName})`,
    preheader: `Rétractation enregistrée le ${formatDate(data.requestedAt, tz)} — ${amount} remboursés sous ${days} jours. Commande ${data.orderId}.`,
    reason: `Vous recevez cet e-mail car vous vous êtes rétracté d’un achat sur ${brand}. Conservez-le : il vaut accusé de réception sur support durable.`,
    blocks: [
      heading('Votre rétractation est enregistrée'),
      para(data.playerName ? `Bonjour ${data.playerName},` : 'Bonjour,'),
      para([
        'Nous avons bien reçu votre demande de rétractation pour ',
        { b: label },
        ' (',
        data.gameName,
        '). La livraison dans le jeu est arrêtée : l’objet ne sera pas crédité.',
      ]),
      details(rows, { totalLabel: 'Montant remboursé (TTC)', total: amount }),
      para(
        data.simulated
          ? 'Environnement de démonstration : le remboursement est simulé, aucun mouvement d’argent n’a lieu.'
          : [
              'Le remboursement intégral est lancé. Selon votre banque, il apparaît sur votre relevé sous quelques jours ouvrés, et au plus tard le ',
              { b: formatDate(deadline, tz) },
              '.',
            ],
      ),
      button('Voir mes achats', purchasesUrl),
      notice('Accusé de réception sur support durable', [
        [
          'Le présent e-mail accuse réception de votre rétractation, exercée en ligne au moyen de la fonction « Me rétracter » ',
          '(article L221-21 du Code de la consommation, directive (UE) 2023/2673).',
        ],
        [
          `Le remboursement de toutes les sommes versées intervient sans frais, par le même moyen de paiement, dans un délai de ${days} jours au plus à compter de votre demande (article L221-24).`,
        ],
        [`Horodatage de votre demande : ${isoTimestamp(data.requestedAt)} (UTC) — commande ${data.orderId}.`],
      ]),
      para(
        [
          'Vous n’êtes pas à l’origine de cette demande ? ',
          { a: 'Contactez le support', href: ctx.supportUrl },
          ` en indiquant la commande ${data.orderId}.`,
        ],
        { muted: true },
      ),
    ],
  });
}
