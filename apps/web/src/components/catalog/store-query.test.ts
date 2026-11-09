import { describe, expect, it } from 'vitest';
import { initialStoreItem, storeUrlWithItem } from './store-query';

describe('initialStoreItem', () => {
  it('ouvre le détail depuis ?item=', () => {
    expect(initialStoreItem({ item: 'itm_1' })).toEqual({ itemId: 'itm_1', buy: false });
  });

  it('ouvre le détail et l’achat depuis ?buy= (retour de liaison)', () => {
    expect(initialStoreItem({ buy: 'itm_2' })).toEqual({ itemId: 'itm_2', buy: true });
  });

  it('?buy= prime sur ?item=', () => {
    expect(initialStoreItem({ item: 'itm_1', buy: 'itm_2' })).toEqual({ itemId: 'itm_2', buy: true });
  });

  it('prend la première valeur répétée et ignore les valeurs vides', () => {
    expect(initialStoreItem({ buy: ['itm_3', 'itm_4'] })).toEqual({ itemId: 'itm_3', buy: true });
    expect(initialStoreItem({ buy: '  ', item: 'itm_1' })).toEqual({ itemId: 'itm_1', buy: false });
    expect(initialStoreItem({})).toEqual({ itemId: null, buy: false });
  });
});

describe('storeUrlWithItem', () => {
  it('remplace ?buy= par ?item= en gardant les autres paramètres', () => {
    expect(storeUrlWithItem('http://x.test/games/crystal?buy=itm_2&utm=a', 'itm_2')).toBe('http://x.test/games/crystal?utm=a&item=itm_2');
  });

  it('retire item et buy à la fermeture', () => {
    expect(storeUrlWithItem('http://x.test/games/crystal?item=itm_1&buy=itm_1', null)).toBe('http://x.test/games/crystal');
  });
});
