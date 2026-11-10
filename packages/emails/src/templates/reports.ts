/**
 * Signalements de contenus hors charte (mécanisme inspiré de l'article 16 du règlement (UE) 2022/2065, « DSA ») :
 * accusé de réception envoyé au signalant (art. 16, § 4) puis information sur la décision et son motif (art. 16, § 5).
 * Marque Dev AppStore. Le studio n'est jamais destinataire de ces e-mails.
 */
import { appLink, resolveContext, type EmailContext } from '../context';
import { formatDateTime, isoTimestamp, type DateInput } from '../format';
import { DEV_APPSTORE_BRAND, details, heading, notice, para, renderEmail, type DetailRow, type EmailContent } from '../layout';

export interface ReportReceivedData {
  /** Référence du signalement, à citer dans tout échange. */
  reportId: string;
  gameName: string;
  /** Article visé, le cas échéant. */
  itemTitle?: string | null;
  /** Libellé de la catégorie choisie. */
  categoryLabel: string;
  explanation: string;
  receivedAt: DateInput;
  /** Libellé exact de la déclaration de bonne foi cochée. */
  goodFaithLabel: string;
  /** Page publique « Contenus interdits et signalement ». */
  policyPath?: string;
}

export function reportReceivedEmail(data: ReportReceivedData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  const tz = ctx.timeZone;
  const target = data.itemTitle ? `${data.itemTitle} (${data.gameName})` : data.gameName;
  const rows: DetailRow[] = [
    ['Référence', data.reportId],
    ['Jeu', data.gameName],
    ...(data.itemTitle ? ([['Article visé', data.itemTitle]] as DetailRow[]) : []),
    ['Catégorie', data.categoryLabel],
    ['Reçu le', formatDateTime(data.receivedAt, tz)],
  ];
  return renderEmail({
    ctx,
    brand: DEV_APPSTORE_BRAND,
    subject: `Accusé de réception de votre signalement : ${target}`,
    preheader: `Signalement ${data.reportId} reçu le ${formatDateTime(data.receivedAt, tz)}. Nous vous informerons de la décision.`,
    reason: `Vous recevez cet e-mail car un signalement a été envoyé avec cette adresse sur ${DEV_APPSTORE_BRAND.name}.`,
    blocks: [
      heading('Nous avons bien reçu votre signalement'),
      para('Bonjour,'),
      para([
        'Merci d’avoir signalé un contenu concernant ',
        { b: target },
        '. Une personne de l’équipe Dev AppStore va l’examiner de façon objective et diligente, puis vous informera par e-mail de la décision prise et de son motif.',
      ]),
      details(rows),
      para([{ b: 'Votre explication' }]),
      para(data.explanation),
      notice('Accusé de réception', [
        [`Horodatage : ${isoTimestamp(data.receivedAt)} (UTC) — référence ${data.reportId}.`],
        [`Déclaration cochée : « ${data.goodFaithLabel} »`],
        [
          'Ce que nous interdisons et comment nous traitons les signalements : ',
          { a: 'contenus interdits et signalement', href: appLink(ctx, data.policyPath ?? '/legal/cgu-studios#contenus-interdits') },
          '.',
        ],
      ]),
      para(
        [
          'Vous n’êtes pas à l’origine de ce signalement ? Ignorez cet e-mail ou ',
          { a: 'contactez le support', href: ctx.supportUrl },
          ` en citant la référence ${data.reportId}.`,
        ],
        { muted: true },
      ),
    ],
  });
}

export type ReportDecision = 'dismissed' | 'actioned';

export interface ReportDecisionData {
  reportId: string;
  gameName: string;
  itemTitle?: string | null;
  categoryLabel: string;
  reportedAt: DateInput;
  decision: ReportDecision;
  /** Motif de la décision, communiqué tel quel. */
  reason: string;
  /** Fondement de la suspension (libellé), le cas échéant. */
  groundLabel?: string | null;
  decidedAt: DateInput;
}

export function reportDecisionEmail(data: ReportDecisionData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  const tz = ctx.timeZone;
  const target = data.itemTitle ? `${data.itemTitle} (${data.gameName})` : data.gameName;
  const actioned = data.decision === 'actioned';
  const decisionLabel = actioned ? 'Jeu suspendu' : 'Classé sans suite';
  const rows: DetailRow[] = [
    ['Référence', data.reportId],
    ['Contenu signalé', target],
    ['Catégorie', data.categoryLabel],
    ['Signalé le', formatDateTime(data.reportedAt, tz)],
    ['Décision', decisionLabel],
    ...(actioned && data.groundLabel ? ([['Fondement', data.groundLabel]] as DetailRow[]) : []),
    ['Décidé le', formatDateTime(data.decidedAt, tz)],
  ];
  return renderEmail({
    ctx,
    brand: DEV_APPSTORE_BRAND,
    subject: `Décision sur votre signalement : ${target} — ${decisionLabel.toLowerCase()}`,
    preheader: `Signalement ${data.reportId} : ${decisionLabel.toLowerCase()}.`,
    reason: `Vous recevez cet e-mail car vous avez signalé un contenu sur ${DEV_APPSTORE_BRAND.name}.`,
    blocks: [
      heading(actioned ? 'Le jeu signalé a été suspendu' : 'Votre signalement a été classé sans suite'),
      para('Bonjour,'),
      para(
        actioned
          ? [
              'Après examen de votre signalement concernant ',
              { b: target },
              ', l’équipe Dev AppStore a suspendu la boutique de ce jeu : elle n’est plus visible et aucun achat n’y est possible.',
            ]
          : [
              'Après examen de votre signalement concernant ',
              { b: target },
              ', l’équipe Dev AppStore n’a pas retenu de manquement justifiant une mesure à ce stade.',
            ],
      ),
      details(rows),
      para([{ b: 'Motif de la décision' }]),
      para(data.reason),
      para(
        [
          'Vous pouvez contester cette décision ou apporter des éléments nouveaux en ',
          { a: 'contactant le support', href: ctx.supportUrl },
          ` (ou à ${ctx.supportEmail}) en citant la référence ${data.reportId}. Votre réclamation sera examinée par une personne de l’équipe.`,
        ],
        { muted: true },
      ),
    ],
  });
}
