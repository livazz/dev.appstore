/** E-mails côté studio : bienvenue, alerte « livraisons en échec », rapport hebdomadaire. */
import { DEFAULT_PLATFORM_FEE_BPS, STORE_FEE_BPS, feeCents, savingsVsStores, type Currency } from '@devappstore/core';
import { appLink, resolveContext, type EmailContext } from '../context';
import { formatDate, formatDateTime, money, percent, plural, type DateInput } from '../format';
import { bullets, button, dataTable, divider, heading, notice, para, renderEmail, stats, subheading, type EmailContent, type Rich } from '../layout';
import { truncate } from '../escape';

// ---------------------------------------------------------------------------------------------------------
// 1. Bienvenue studio
// ---------------------------------------------------------------------------------------------------------

export interface StudioWelcomeData {
  userName?: string;
  studioName: string;
  /** Par défaut `${appUrl}/studio`. */
  dashboardUrl?: string;
  /** Par défaut `${appUrl}/studio/payouts`. */
  payoutsUrl?: string;
  /** Documentation d'intégration (SDK, webhook). Facultatif. */
  docsUrl?: string;
  platformFeeBps?: number;
}

export function studioWelcomeEmail(data: StudioWelcomeData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  const dashboardUrl = data.dashboardUrl ?? appLink(ctx, '/studio');
  const payoutsUrl = data.payoutsUrl ?? appLink(ctx, '/studio/payouts');
  const fee = data.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS;
  const keep = percent(1 - fee / 10_000).replace('+', '');
  return renderEmail({
    ctx,
    subject: `Bienvenue sur Dev AppStore, ${data.studioName}`,
    preheader: `Votre espace studio est prêt : configurez votre boutique et gardez ${keep} de vos revenus.`,
    reason: `Vous recevez cet e-mail car vous avez créé l’espace studio « ${data.studioName} » sur Dev AppStore.`,
    blocks: [
      heading(`Bienvenue, ${data.studioName} !`),
      para(data.userName ? `Bonjour ${data.userName},` : 'Bonjour,'),
      para([
        'Votre espace studio est prêt. Vendez vos objets in-app sur le web et gardez ',
        { b: keep },
        ` de chaque vente, au lieu de ${percent(1 - STORE_FEE_BPS / 10_000).replace('+', '')} via les stores.`,
      ]),
      subheading('Vos premières étapes'),
      bullets([
        [{ b: '1. Créez votre jeu' }, ' et sa boutique : bannière, icône, articles et prix.'],
        [{ b: '2. Branchez la livraison' }, ' : webhook signé ou SDK (Unity, JavaScript), puis testez un achat simulé.'],
        [{ b: '3. Choisissez la liaison des comptes' }, ' : code affiché dans le jeu ou confirmation de l’ID joueur.'],
        [{ b: '4. Activez les versements' }, ' : ', { a: 'onboarding Stripe Connect', href: payoutsUrl }, ' (vérification d’identité du studio).'],
      ]),
      button('Ouvrir mon espace studio', dashboardUrl),
      ...(data.docsUrl ? [para(['Documentation d’intégration : ', { a: data.docsUrl, href: data.docsUrl }], { muted: true })] : []),
      para(
        'Sécurité : vos clés API et secrets de webhook ne sont affichés que dans l’espace studio. Dev AppStore ne vous les demandera jamais par e-mail.',
        { muted: true },
      ),
    ],
  });
}

// ---------------------------------------------------------------------------------------------------------
// 2. Alerte « livraisons en échec »
// ---------------------------------------------------------------------------------------------------------

export interface FailedDelivery {
  deliveryId: string;
  orderId: string;
  itemName: string;
  playerId: string;
  attempts: number;
  lastAttemptAt: DateInput;
  /** Dernière erreur (statut HTTP, extrait de réponse du serveur du jeu…). Échappée et tronquée. */
  lastError?: string;
}

export interface StudioDeliveryAlertData {
  studioName: string;
  gameName: string;
  /** Livraisons concernées (les 10 premières sont détaillées). */
  failures: FailedDelivery[];
  /** Total réel si `failures` est un extrait. */
  totalFailed?: number;
  /** Page intégration du jeu (journal des livraisons). Ex. `${appUrl}/studio/games/<id>/integration`. */
  integrationUrl: string;
  webhookUrl?: string;
}

const MAX_LISTED = 10;

export function studioDeliveryAlertEmail(data: StudioDeliveryAlertData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  const total = Math.max(data.totalFailed ?? 0, data.failures.length);
  const listed = data.failures.slice(0, MAX_LISTED);
  const rows: Rich[][] = listed.map((f) => [
    [{ b: f.itemName }, ` · commande ${f.orderId}`],
    f.playerId,
    String(f.attempts),
    [formatDateTime(f.lastAttemptAt, ctx.timeZone), f.lastError ? ` — ${truncate(f.lastError, 160)}` : ''],
  ]);
  return renderEmail({
    ctx,
    subject: `Alerte : ${plural(total, 'livraison en échec', 'livraisons en échec')} — ${data.gameName}`,
    preheader: `Des joueurs ont payé mais n’ont pas encore reçu leurs objets dans ${data.gameName}.`,
    reason: `Vous recevez cette alerte en tant que membre du studio « ${data.studioName} » sur Dev AppStore.`,
    blocks: [
      heading('Des livraisons échouent'),
      para([
        { b: plural(total, 'achat payé', 'achats payés') },
        total >= 2 ? ' n’ont pas pu être livrés dans ' : ' n’a pas pu être livré dans ',
        { b: data.gameName },
        ' malgré les nouvelles tentatives automatiques. Les joueurs concernés attendent leurs objets.',
      ]),
      notice(
        'Pourquoi c’est urgent',
        [
          'Tant que l’objet n’est pas livré, le joueur peut se rétracter et être remboursé intégralement ; au-delà d’un délai raisonnable, il peut aussi résoudre la vente (garantie légale de conformité, à la charge du studio vendeur).',
        ],
        'danger',
      ),
      dataTable(['Article', 'Joueur', 'Essais', 'Dernière tentative'], rows, { alignRight: [2] }),
      ...(total > listed.length ? [para(`… et ${plural(total - listed.length, 'autre livraison', 'autres livraisons')} dans le journal.`, { muted: true })] : []),
      subheading('Vérifications rapides'),
      bullets([
        data.webhookUrl
          ? ['Votre webhook ', { b: data.webhookUrl }, ' répond-il en 2xx ? (certificat TLS, pare-feu, délai < 10 s)']
          : 'Votre webhook répond-il en 2xx ? (certificat TLS, pare-feu, délai < 10 s)',
        'La signature DevAppStore-Signature est-elle vérifiée avec le bon secret ?',
        'Avec le SDK : le jeu appelle-t-il bien ack() après avoir crédité l’objet ?',
      ]),
      button('Ouvrir le journal des livraisons', data.integrationUrl),
    ],
  });
}

// ---------------------------------------------------------------------------------------------------------
// 3. Rapport hebdomadaire studio
// ---------------------------------------------------------------------------------------------------------

export interface WeeklyGameStats {
  name: string;
  /** Chiffre d'affaires TTC encaissé sur la période, en centimes. */
  revenueCents: number;
  orders: number;
  /** Commission Dev AppStore appliquée au jeu. Par défaut `DEFAULT_PLATFORM_FEE_BPS`. */
  platformFeeBps?: number;
  previousRevenueCents?: number;
}

export interface StudioWeeklyReportData {
  studioName: string;
  periodStart: DateInput;
  periodEnd: DateInput;
  currency: Currency;
  games: WeeklyGameStats[];
  /** Article le plus vendu, facultatif. */
  topItem?: { name: string; gameName: string; orders: number };
  /** Par défaut `${appUrl}/studio`. */
  salesUrl?: string;
}

export interface WeeklyTotals {
  revenueCents: number;
  orders: number;
  platformFeeCents: number;
  netCents: number;
  /** Ce que le studio aurait touché via les stores (commission `STORE_FEE_BPS`). */
  storeNetCents: number;
  savingsCents: number;
  previousRevenueCents?: number;
}

/** Totaux du rapport (exportés pour les tests et l'affichage web). */
export function computeWeeklyTotals(games: WeeklyGameStats[]): WeeklyTotals {
  let revenueCents = 0;
  let orders = 0;
  let platformFeeCents = 0;
  let storeFeeCents = 0;
  let savingsCents = 0;
  let previous = 0;
  let hasPrevious = false;
  for (const g of games) {
    const bps = g.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS;
    revenueCents += g.revenueCents;
    orders += g.orders;
    platformFeeCents += feeCents(g.revenueCents, bps);
    storeFeeCents += feeCents(g.revenueCents, STORE_FEE_BPS);
    savingsCents += savingsVsStores(g.revenueCents, bps);
    if (g.previousRevenueCents !== undefined) {
      hasPrevious = true;
      previous += g.previousRevenueCents;
    }
  }
  return {
    revenueCents,
    orders,
    platformFeeCents,
    netCents: revenueCents - platformFeeCents,
    storeNetCents: revenueCents - storeFeeCents,
    savingsCents,
    previousRevenueCents: hasPrevious ? previous : undefined,
  };
}

function trend(current: number, previous?: number): string | undefined {
  if (previous === undefined) return undefined;
  if (previous === 0) return current > 0 ? 'nouveau' : undefined;
  return `${percent((current - previous) / previous)} vs semaine préc.`;
}

export function studioWeeklyReportEmail(data: StudioWeeklyReportData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  const cur = data.currency;
  const t = computeWeeklyTotals(data.games);
  const period = `du ${formatDate(data.periodStart, ctx.timeZone)} au ${formatDate(data.periodEnd, ctx.timeZone)}`;
  const salesUrl = data.salesUrl ?? appLink(ctx, '/studio');
  const games = [...data.games].sort((a, b) => b.revenueCents - a.revenueCents);

  return renderEmail({
    ctx,
    subject: `Votre semaine sur Dev AppStore : ${money(t.revenueCents, cur)} de ventes (${data.studioName})`,
    preheader: `${money(t.savingsCents, cur)} gagnés en plus par rapport aux stores, ${period}.`,
    reason: `Vous recevez ce rapport hebdomadaire en tant que membre du studio « ${data.studioName} » sur Dev AppStore.`,
    blocks: [
      heading('Votre rapport de la semaine'),
      para([`${data.studioName}, voici vos ventes `, { b: period }, '.']),
      stats([
        { label: 'Ventes TTC', value: money(t.revenueCents, cur), hint: trend(t.revenueCents, t.previousRevenueCents) },
        { label: 'Commandes', value: new Intl.NumberFormat('fr-FR').format(t.orders) },
        { label: 'Votre revenu', value: money(t.netCents, cur), hint: 'après commission Dev AppStore' },
      ]),
      notice('Économie par rapport aux stores', [
        [
          'Via l’App Store ou Google Play (commission de ',
          percent(STORE_FEE_BPS / 10_000).replace('+', ''),
          `), ces ventes vous auraient rapporté ${money(t.storeNetCents, cur)}. Avec Dev AppStore, vous gagnez `,
          { b: `${money(t.savingsCents, cur)} de plus` },
          ' cette semaine.',
        ],
      ]),
      ...(games.length
        ? [
            subheading('Par jeu'),
            dataTable(
              ['Jeu', 'Commandes', 'Ventes TTC', 'Économie'],
              games.map((g) => [
                g.name,
                new Intl.NumberFormat('fr-FR').format(g.orders),
                money(g.revenueCents, cur),
                money(savingsVsStores(g.revenueCents, g.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS), cur),
              ]),
              { alignRight: [1, 2, 3] },
            ),
          ]
        : [para('Aucune vente cette semaine. Pensez à mettre en avant votre boutique web dans le jeu et sur vos réseaux.')]),
      ...(data.topItem
        ? [para(['Article star : ', { b: data.topItem.name }, ` (${data.topItem.gameName}) — ${plural(data.topItem.orders, 'commande', 'commandes')}.`])]
        : []),
      button('Voir les ventes et tendances', salesUrl),
      divider(),
      para(
        `Montants indicatifs, hors frais de paiement, remboursements et rétrofacturations ; commission Dev AppStore : ${money(t.platformFeeCents, cur)}. Le relevé définitif figure dans votre espace Versements.`,
        { muted: true },
      ),
    ],
  });
}
