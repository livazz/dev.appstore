/**
 * Versions datées des documents légaux publics (pages `/legal/*`).
 *
 * Chaque version est une date ISO `AAAA-MM-JJ` : c'est la valeur à enregistrer avec une commande
 * (preuve d'acceptation des CGV, art. L221-7 C. conso) et à rappeler dans l'e-mail de confirmation.
 * Toute modification de fond d'un document impose de changer sa constante.
 *
 * Module sans dépendance serveur : importable depuis les pages, les composants client et le checkout.
 */

/** Conditions générales de vente et d'utilisation joueurs (`/legal/cgv`). */
export const CGV_VERSION = '2026-11-09';
/** Conditions studio — contrat de distribution (`/legal/cgu-studios`). */
export const CGU_STUDIOS_VERSION = '2026-11-09';
/** Politique de confidentialité (`/legal/confidentialite`). */
export const PRIVACY_VERSION = '2026-11-09';
/** Mentions légales (`/legal/mentions-legales`). */
export const LEGAL_NOTICE_VERSION = '2026-11-09';
/** Politique cookies et traceurs (`/legal/cookies`). */
export const COOKIES_VERSION = '2026-11-09';
/** Information sur le droit de rétractation et formulaire type (`/legal/retractation`). */
export const WITHDRAWAL_VERSION = '2026-11-09';

/** Chemin public des CGV joueurs (valeur par défaut de la variable d'environnement `CGV_URL`). */
export const CGV_URL = '/legal/cgv';

/** Statut éditorial commun : tant qu'il vaut `draft`, les pages affichent le bandeau « Projet ». */
export const LEGAL_STATUS: 'draft' | 'published' = 'draft';

export type LegalAudience = 'joueurs' | 'studios' | 'tous';

export interface LegalDocumentMeta {
  slug: LegalSlug;
  href: `/legal/${string}`;
  /** Titre complet (h1, balise title). */
  title: string;
  /** Libellé court pour la navigation et les pieds de page. */
  shortTitle: string;
  audience: LegalAudience;
  version: string;
  description: string;
}

export const LEGAL_SLUGS = ['cgv', 'cgu-studios', 'confidentialite', 'mentions-legales', 'cookies', 'retractation'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const LEGAL_DOCUMENTS: readonly LegalDocumentMeta[] = [
  {
    slug: 'cgv',
    href: CGV_URL,
    title: 'Conditions générales de vente et d’utilisation joueurs',
    shortTitle: 'CGV joueurs',
    audience: 'joueurs',
    version: CGV_VERSION,
    description: 'Compte, liaison du compte de jeu, achat, livraison, rétractation, remboursements et médiation.',
  },
  {
    slug: 'cgu-studios',
    href: '/legal/cgu-studios',
    title: 'Conditions studio — contrat de distribution',
    shortTitle: 'Conditions studios',
    audience: 'studios',
    version: CGU_STUDIOS_VERSION,
    description: 'Boutique, livraison des objets, commission, reversements, suspension et plaintes (règlement P2B).',
  },
  {
    slug: 'confidentialite',
    href: '/legal/confidentialite',
    title: 'Politique de confidentialité',
    shortTitle: 'Confidentialité',
    audience: 'tous',
    version: PRIVACY_VERSION,
    description: 'Données traitées, finalités, bases légales, destinataires, durées de conservation et vos droits.',
  },
  {
    slug: 'mentions-legales',
    href: '/legal/mentions-legales',
    title: 'Mentions légales',
    shortTitle: 'Mentions légales',
    audience: 'tous',
    version: LEGAL_NOTICE_VERSION,
    description: 'Éditeur du site, hébergeur, contact, signalement de contenus et propriété intellectuelle.',
  },
  {
    slug: 'cookies',
    href: '/legal/cookies',
    title: 'Cookies et traceurs',
    shortTitle: 'Cookies',
    audience: 'tous',
    version: COOKIES_VERSION,
    description: 'Les cookies déposés par le site, leur finalité, leur durée et comment les gérer.',
  },
  {
    slug: 'retractation',
    href: '/legal/retractation',
    title: 'Droit de rétractation',
    shortTitle: 'Rétractation',
    audience: 'joueurs',
    version: WITHDRAWAL_VERSION,
    description: 'Quand vous pouvez vous rétracter, le bouton « Me rétracter » et le formulaire type.',
  },
];

const BY_SLUG = new Map(LEGAL_DOCUMENTS.map((d) => [d.slug, d]));

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

/** Métadonnées d'un document (lève une erreur pour un identifiant inconnu : erreur de programmation). */
export function getLegalDocument(slug: LegalSlug): LegalDocumentMeta {
  const doc = BY_SLUG.get(slug);
  if (!doc) throw new Error(`Document légal inconnu : ${slug}`);
  return doc;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Vrai si `value` est une date ISO `AAAA-MM-JJ` existante (ex. refuse 2026-02-30). */
export function isLegalVersion(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-11-09 » → « 9 novembre 2026 » (indépendant du fuseau horaire ; 1er pour le premier du mois). */
export function formatLegalDate(version: string): string {
  if (!isLegalVersion(version)) throw new Error(`Version de document légal invalide : ${version}`);
  const [y, mo, d] = version.split('-').map(Number);
  return `${d === 1 ? '1er' : d} ${MONTHS[mo - 1]} ${y}`;
}

/** Libellé affiché sous le titre d'un document : « Version du 9 novembre 2026 ». */
export function legalVersionLabel(slug: LegalSlug): string {
  return `Version du ${formatLegalDate(getLegalDocument(slug).version)}`;
}

export interface LegalAcceptance {
  document: LegalSlug;
  version: string;
  url: string;
  acceptedAt: string;
}

/**
 * Enregistrement d'acceptation d'un document (à stocker avec la commande au checkout) :
 * identifiant, version datée, URL et horodatage ISO.
 */
export function legalAcceptance(slug: LegalSlug, at: Date = new Date(), baseUrl?: string): LegalAcceptance {
  const doc = getLegalDocument(slug);
  const url = baseUrl ? new URL(doc.href, baseUrl).toString() : doc.href;
  return { document: slug, version: doc.version, url, acceptedAt: at.toISOString() };
}
