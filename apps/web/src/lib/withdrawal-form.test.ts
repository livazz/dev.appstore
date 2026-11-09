import { describe, expect, it } from 'vitest';
import {
  FIELD_MAX_LENGTH,
  WITHDRAWAL_RECIPIENT_PLACEHOLDER,
  buildWithdrawalMailto,
  buildWithdrawalText,
  cleanField,
} from './withdrawal-form';

describe('formulaire type de rétractation', () => {
  it('reprend les mentions du modèle légal, avec des pointillés pour les champs vides', () => {
    const text = buildWithdrawalText({});
    expect(text).toContain('Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.');
    expect(text).toContain(`À l’attention de ${WITHDRAWAL_RECIPIENT_PLACEHOLDER} :`);
    expect(text).toContain('Je vous notifie par la présente ma rétractation du contrat');
    expect(text).toContain('N° de commande : …');
    expect(text).toContain('Signature du consommateur (uniquement en cas de notification du présent formulaire sur papier)');
    expect(text).not.toMatch(/wolleen/i);
  });

  it('insère les champs saisis, nettoyés', () => {
    const text = buildWithdrawalText(
      { orderId: '  ord_123 ', name: 'Alex\nMartin', email: 'alex@example.com', date: '10/11/2026' },
      'Dev AppStore SAS, 1 rue X, support@example.com',
    );
    expect(text).toContain('N° de commande : ord_123');
    expect(text).toContain('Nom du consommateur : Alex Martin');
    expect(text).toContain('Adresse e-mail du compte : alex@example.com');
    expect(text).toContain('Date : 10/11/2026');
    expect(text).toContain('À l’attention de Dev AppStore SAS, 1 rue X, support@example.com :');
  });

  it('limite la longueur et supprime les caractères de contrôle', () => {
    expect(cleanField('a\u0000b\tc')).toBe('a b c');
    expect(cleanField(undefined)).toBe('');
    const long = cleanField('x'.repeat(500));
    expect(long).toHaveLength(FIELD_MAX_LENGTH);
    expect(long.endsWith('…')).toBe(true);
  });

  it('prépare un lien mailto encodé', () => {
    const href = buildWithdrawalMailto({ orderId: 'ord_1' }, 'support@example.com');
    expect(href.startsWith('mailto:support%40example.com?subject=')).toBe(true);
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('subject')).toBe('Rétractation — commande ord_1');
    expect(params.get('body')).toContain('N° de commande : ord_1');
  });
});
