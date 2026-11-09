/** E-mails transactionnels côté joueur : reçu, livraison, échec de livraison, bienvenue. */
import type { Currency } from '@devappstore/core';
import { appLink, resolveContext, type EmailContext } from '../context';
import { formatDateTime, isoTimestamp, money, type DateInput } from '../format';
import { bullets, button, details, divider, heading, notice, para, renderEmail, subheading, type DetailRow, type EmailContent } from '../layout';
import { truncate } from '../escape';

/**
 * Texte exact de la case à cocher (non pré-cochée, obligatoire) affichée avant le bouton « Payer ».
 * Le checkout DOIT afficher ce même texte (ou stocker la variante affichée et la passer à `waiverText`).
 * Source : docs/legal/consumer.md §2.3, docs/legal/cgv-draft.md art. 9.2.
 */
export const WITHDRAWAL_WAIVER_TEXT =
  'Je demande la livraison immédiate de mon achat dans le jeu et je reconnais perdre mon droit de rétractation dès que la livraison a commencé.';

export interface PurchaseItem {
  name: string;
  /** Quantité affichée (ex. 500 pour « 500 gemmes »). Facultatif. */
  quantity?: number;
  description?: string;
}

export interface Seller {
  /** Dénomination du studio vendeur. */
  name: string;
  address?: string;
  /** Immatriculation (RCS / SIREN…). */
  registration?: string;
  vatNumber?: string;
  email?: string;
}

export interface GameAccount {
  playerId: string;
  playerName?: string;
}

function itemLabel(item: PurchaseItem) {
  return item.quantity && !item.name.includes(String(item.quantity)) ? `${item.name} × ${item.quantity}` : item.name;
}

function accountLabel(a: GameAccount) {
  return a.playerName ? `${a.playerName} (ID ${a.playerId})` : `ID ${a.playerId}`;
}

function greeting(name?: string) {
  return name ? `Bonjour ${name},` : 'Bonjour,';
}

// ---------------------------------------------------------------------------------------------------------
// 1. Reçu d'achat + confirmation de la renonciation (art. L221-28 13° et L221-13 C. conso)
// ---------------------------------------------------------------------------------------------------------

export interface PurchaseReceiptData {
  playerName?: string;
  orderId: string;
  /** Date de paiement. */
  paidAt: DateInput;
  item: PurchaseItem;
  /** Prix TTC payé, en centimes. */
  amountCents: number;
  currency: Currency;
  gameName: string;
  gameAccount: GameAccount;
  seller: Seller;
  /** Preuve de la demande de livraison immédiate et de la renonciation (case cochée au checkout). */
  consent: {
    /** Horodatage du clic sur la case / de la validation de la commande. */
    acceptedAt: DateInput;
    /** Version des CGV acceptées (ex. « 2026-11-09 »). */
    cgvVersion: string;
    /** Lien vers les CGV en vigueur, idéalement la version figée (PDF). */
    cgvUrl: string;
    /** Texte exact affiché à côté de la case, si différent de `WITHDRAWAL_WAIVER_TEXT`. */
    waiverText?: string;
  };
  /** Moyen de paiement affiché (ex. « Visa •••• 4242 »). */
  paymentMethod?: string;
  /** Lien vers « Mes achats ». Par défaut `${appUrl}/account/purchases`. */
  purchasesUrl?: string;
}

export function purchaseReceiptEmail(data: PurchaseReceiptData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  const tz = ctx.timeZone;
  const price = money(data.amountCents, data.currency);
  const purchasesUrl = data.purchasesUrl ?? appLink(ctx, '/account/purchases');
  const waiverText = data.consent.waiverText ?? WITHDRAWAL_WAIVER_TEXT;
  const acceptedAt = formatDateTime(data.consent.acceptedAt, tz);

  const rows: DetailRow[] = [
    ['Article', itemLabel(data.item)],
    ...(data.item.description ? ([['Description', data.item.description]] as DetailRow[]) : []),
    ['Jeu', data.gameName],
    ['Compte de jeu destinataire', accountLabel(data.gameAccount)],
    ['Vendeur', data.seller.name],
    ['Date du paiement', formatDateTime(data.paidAt, tz)],
    ['N° de commande', data.orderId],
    ...(data.paymentMethod ? ([['Moyen de paiement', data.paymentMethod]] as DetailRow[]) : []),
  ];

  const sellerLines = [
    data.seller.name,
    data.seller.address,
    data.seller.registration && `Immatriculation : ${data.seller.registration}`,
    data.seller.vatNumber && `TVA : ${data.seller.vatNumber}`,
    data.seller.email && `Contact : ${data.seller.email}`,
  ].filter((l): l is string => Boolean(l));

  return renderEmail({
    ctx,
    subject: `Votre reçu Dev AppStore : ${itemLabel(data.item)} (${data.gameName})`,
    preheader: `${price} payés — commande ${data.orderId}. Votre achat est en route vers le jeu.`,
    reason: 'Vous recevez cet e-mail car vous avez effectué un achat sur Dev AppStore. Conservez-le : il vaut reçu et confirmation sur support durable.',
    blocks: [
      heading('Merci pour votre achat !'),
      para(greeting(data.playerName)),
      para([
        'Votre paiement est confirmé. Votre achat est transmis automatiquement au jeu ',
        { b: data.gameName },
        ' : il est en principe crédité en quelques secondes, ou à la prochaine ouverture du jeu.',
      ]),
      details(rows, { totalLabel: 'Total payé (TTC)', total: price }),
      button('Suivre la livraison', purchasesUrl),
      notice('Confirmation de votre demande de livraison immédiate et de votre renonciation au droit de rétractation', [
        ['Le ', { b: acceptedAt }, ', avant de payer, vous avez coché la case suivante :'],
        { b: `« ${waiverText} »` },
        [
          "Conformément à l'article L221-28 13° du Code de la consommation, vous avez ainsi ",
          { b: 'expressément demandé la livraison immédiate' },
          ' de votre achat et ',
          { b: 'reconnu perdre votre droit de rétractation' },
          " dès que la livraison dans le jeu a commencé. Le présent e-mail vous confirme cet accord et cette renonciation sur support durable (article L221-13).",
        ],
        [
          'Tant que votre achat n’a pas été livré dans le jeu (statut « en attente »), vous pouvez encore vous rétracter depuis ',
          { a: 'Mes achats', href: purchasesUrl },
          ' (bouton « Me rétracter ») : vous serez remboursé sous 14 jours par le même moyen de paiement.',
        ],
        [
          'Conditions générales applicables : ',
          { a: `CGV version ${data.consent.cgvVersion}`, href: data.consent.cgvUrl },
          `, acceptées le ${acceptedAt}.`,
        ],
        [`Horodatage de votre accord : ${isoTimestamp(data.consent.acceptedAt)} (UTC) — commande ${data.orderId}.`],
      ]),
      subheading('Qui fait quoi ?'),
      bullets([
        [
          'Le contrat de vente est conclu avec le ',
          { b: 'vendeur' },
          ` : ${sellerLines.join(' — ')}. Il livre l’objet dans le jeu et répond de sa conformité (garantie légale de conformité des contenus numériques, art. L224-25-1 et s. du Code de la consommation).`,
        ],
        [
          'Dev AppStore est la place de marché : elle encaisse le paiement pour le compte du vendeur, transmet la commande au jeu et relaie vos demandes de support.',
        ],
        [
          'Objet non reçu ? Lancez le jeu ; s’il n’est toujours pas crédité, ',
          { a: 'contactez le support', href: ctx.supportUrl },
          ` en indiquant la commande ${data.orderId}.`,
        ],
      ]),
    ],
  });
}

// ---------------------------------------------------------------------------------------------------------
// 2. « Votre achat est arrivé dans le jeu »
// ---------------------------------------------------------------------------------------------------------

export interface PurchaseDeliveredData {
  playerName?: string;
  orderId: string;
  item: PurchaseItem;
  gameName: string;
  gameAccount: GameAccount;
  deliveredAt: DateInput;
  purchasesUrl?: string;
}

export function purchaseDeliveredEmail(data: PurchaseDeliveredData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  const purchasesUrl = data.purchasesUrl ?? appLink(ctx, '/account/purchases');
  return renderEmail({
    ctx,
    subject: `C’est arrivé ! ${itemLabel(data.item)} est dans ${data.gameName}`,
    preheader: `Votre achat a été crédité sur le compte ${accountLabel(data.gameAccount)}.`,
    reason: 'Vous recevez cet e-mail car un achat effectué sur Dev AppStore vient d’être livré dans votre jeu.',
    blocks: [
      heading('Votre achat est arrivé dans le jeu'),
      para(greeting(data.playerName)),
      para([
        { b: itemLabel(data.item) },
        ' a bien été crédité dans ',
        { b: data.gameName },
        ` sur le compte ${accountLabel(data.gameAccount)}. Bon jeu !`,
      ]),
      details([
        ['Livré le', formatDateTime(data.deliveredAt, ctx.timeZone)],
        ['N° de commande', data.orderId],
      ]),
      button('Voir mes achats', purchasesUrl),
      para(
        [
          'Conformément à votre demande de livraison immédiate, la livraison ayant eu lieu, le droit de rétractation ne s’applique plus à cet achat. ',
          'Vous ne le voyez pas dans le jeu ? Relancez-le, puis ',
          { a: 'contactez le support', href: ctx.supportUrl },
          '.',
        ],
        { muted: true },
      ),
    ],
  });
}

// ---------------------------------------------------------------------------------------------------------
// 3. Échec de livraison (joueur → support)
// ---------------------------------------------------------------------------------------------------------

export interface DeliveryFailedData {
  playerName?: string;
  orderId: string;
  item: PurchaseItem;
  gameName: string;
  gameAccount: GameAccount;
  amountCents: number;
  currency: Currency;
  paidAt: DateInput;
  /** Explication lisible, facultative (jamais la réponse brute du serveur de jeu). */
  reason?: string;
  /** Lien direct vers un formulaire de support pré-rempli. Par défaut le centre d'aide. */
  supportUrl?: string;
  purchasesUrl?: string;
}

export function deliveryFailedEmail(data: DeliveryFailedData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  const purchasesUrl = data.purchasesUrl ?? appLink(ctx, '/account/purchases');
  const supportUrl = data.supportUrl ?? ctx.supportUrl;
  return renderEmail({
    ctx,
    subject: `Livraison retardée : ${itemLabel(data.item)} (${data.gameName})`,
    preheader: `Nous n’arrivons pas à livrer votre achat dans le jeu. Voici vos options.`,
    reason: 'Vous recevez cet e-mail car la livraison d’un achat effectué sur Dev AppStore rencontre un problème.',
    blocks: [
      heading('Votre achat n’a pas encore pu être livré'),
      para(greeting(data.playerName)),
      para([
        'Nous n’arrivons pas à transmettre ',
        { b: itemLabel(data.item) },
        ' au jeu ',
        { b: data.gameName },
        ` (compte ${accountLabel(data.gameAccount)}). `,
        data.reason ? `Motif : ${truncate(data.reason, 300)}. ` : '',
        'Nous continuons automatiquement les tentatives et le studio a été prévenu.',
      ]),
      details([
        ['Article', itemLabel(data.item)],
        ['Montant payé (TTC)', money(data.amountCents, data.currency)],
        ['Date du paiement', formatDateTime(data.paidAt, ctx.timeZone)],
        ['N° de commande', data.orderId],
      ]),
      subheading('Ce que vous pouvez faire'),
      bullets([
        'Lancez (ou relancez) le jeu avec le bon compte : la livraison est souvent débloquée à l’ouverture.',
        [
          'Vérifiez que le compte de jeu lié est bien le vôtre, depuis ',
          { a: 'Mes achats', href: purchasesUrl },
          '.',
        ],
        [
          { b: 'Vous préférez être remboursé ?' },
          ' Tant que l’achat n’est pas livré, vous pouvez vous rétracter depuis Mes achats (bouton « Me rétracter ») : remboursement intégral sous 14 jours.',
        ],
      ]),
      button('Contacter le support', supportUrl),
      para(
        [
          'Vos droits : le vendeur doit fournir l’objet sans retard injustifié (art. L224-25-10 du Code de la consommation). ',
          'À défaut de livraison dans un délai raisonnable après votre demande, vous pouvez résoudre le contrat et être intégralement remboursé.',
        ],
        { muted: true },
      ),
    ],
  });
}

// ---------------------------------------------------------------------------------------------------------
// 4. Bienvenue joueur
// ---------------------------------------------------------------------------------------------------------

export interface PlayerWelcomeData {
  name?: string;
  catalogUrl?: string;
}

export function playerWelcomeEmail(data: PlayerWelcomeData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  const catalogUrl = data.catalogUrl ?? appLink(ctx, '/');
  return renderEmail({
    ctx,
    subject: 'Bienvenue sur Dev AppStore',
    preheader: 'Trouvez votre jeu, liez votre compte, et vos achats arrivent directement dans le jeu.',
    reason: 'Vous recevez cet e-mail car vous venez de créer un compte Dev AppStore.',
    blocks: [
      heading(data.name ? `Bienvenue, ${data.name} !` : 'Bienvenue sur Dev AppStore !'),
      para('Votre compte est prêt. Acheter vos objets de jeu sur Dev AppStore, c’est simple :'),
      bullets([
        [{ b: '1. Cherchez votre jeu' }, ' dans le catalogue.'],
        [{ b: '2. Liez votre compte de jeu' }, ' une seule fois (code affiché dans le jeu ou ID joueur).'],
        [{ b: '3. Achetez' }, ' : l’objet arrive automatiquement dans le jeu, en quelques secondes.'],
      ]),
      button('Découvrir les jeux', catalogUrl),
      divider(),
      para(
        'Les prix sont toujours affichés en euros TTC, sans monnaie intermédiaire cachée. Ne communiquez jamais votre mot de passe : Dev AppStore ne vous le demandera jamais par e-mail.',
        { muted: true },
      ),
    ],
  });
}
