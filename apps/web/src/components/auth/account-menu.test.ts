import { describe, expect, it } from 'vitest';
import { accountMenuLinks } from './account-menu';

const hrefs = (...args: Parameters<typeof accountMenuLinks>) => accountMenuLinks(...args).map((l) => l.href);

describe('accountMenuLinks', () => {
  it('joueur : lien « Mes points » vers /account/points', () => {
    expect(accountMenuLinks({ variant: 'player', isStudioMember: false })).toEqual([{ href: '/account/points', label: 'Mes points' }]);
  });

  it('joueur membre d’un studio : Espace studio puis Mes points', () => {
    expect(hrefs({ variant: 'player', isStudioMember: true })).toEqual(['/studio', '/account/points']);
  });

  it('espace studio : seulement « Retour au site », pas de points', () => {
    expect(hrefs({ variant: 'studio', isStudioMember: true })).toEqual(['/']);
    expect(hrefs({ variant: 'studio', isStudioMember: false })).not.toContain('/account/points');
  });
});
