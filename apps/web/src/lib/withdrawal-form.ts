/**
 * Formulaire type de rétractation (annexe de l'article R221-1 du Code de la consommation),
 * adapté à la fourniture d'un contenu numérique. Logique pure, partagée par la page
 * `/legal/retractation` (aperçu, copie, impression) et testée.
 */

export interface WithdrawalFields {
  orderId?: string;
  orderedAt?: string;
  item?: string;
  name?: string;
  address?: string;
  email?: string;
  date?: string;
}

export const WITHDRAWAL_FIELD_LABELS: Record<keyof WithdrawalFields, string> = {
  item: 'Objet commandé (jeu, article)',
  orderId: 'N° de commande',
  orderedAt: 'Commandé le',
  name: 'Nom du consommateur',
  address: 'Adresse du consommateur',
  email: 'Adresse e-mail du compte',
  date: 'Date',
};

/** Destinataire tant que l'identité de l'éditeur n'est pas arrêtée. */
export const WITHDRAWAL_RECIPIENT_PLACEHOLDER =
  '[à compléter : raison sociale, adresse géographique et adresse e-mail de l’éditeur de Dev AppStore]';

export const FIELD_MAX_LENGTH = 200;
const EMPTY = '…';

/** Nettoie une saisie : supprime les caractères de contrôle, replie les espaces, limite la longueur. */
export function cleanField(value: string | undefined): string {
  if (!value) return '';
  const flat = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > FIELD_MAX_LENGTH ? `${flat.slice(0, FIELD_MAX_LENGTH - 1)}…` : flat;
}

/** Texte complet du formulaire, prêt à copier dans un e-mail ou à imprimer. */
export function buildWithdrawalText(fields: WithdrawalFields, recipient: string = WITHDRAWAL_RECIPIENT_PLACEHOLDER): string {
  const v = (k: keyof WithdrawalFields) => cleanField(fields[k]) || EMPTY;
  return [
    'Formulaire de rétractation',
    '(Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.)',
    '',
    `À l’attention de ${cleanField(recipient) || EMPTY} :`,
    '',
    'Je vous notifie par la présente ma rétractation du contrat portant sur la fourniture du contenu numérique ci-dessous :',
    `${WITHDRAWAL_FIELD_LABELS.item} : ${v('item')}`,
    `${WITHDRAWAL_FIELD_LABELS.orderId} : ${v('orderId')}`,
    `${WITHDRAWAL_FIELD_LABELS.orderedAt} : ${v('orderedAt')}`,
    `${WITHDRAWAL_FIELD_LABELS.name} : ${v('name')}`,
    `${WITHDRAWAL_FIELD_LABELS.address} : ${v('address')}`,
    `${WITHDRAWAL_FIELD_LABELS.email} : ${v('email')}`,
    'Signature du consommateur (uniquement en cas de notification du présent formulaire sur papier) :',
    `${WITHDRAWAL_FIELD_LABELS.date} : ${v('date')}`,
  ].join('\n');
}

/** Lien `mailto:` pré-rempli (le destinataire est laissé vide tant que l'adresse n'est pas connue). */
export function buildWithdrawalMailto(fields: WithdrawalFields, to = ''): string {
  const subject = `Rétractation — commande ${cleanField(fields.orderId) || EMPTY}`;
  const body = buildWithdrawalText(fields);
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
