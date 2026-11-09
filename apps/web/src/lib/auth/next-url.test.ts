import { describe, expect, it } from 'vitest';
import { safeNext, withNext } from './next-url';

describe('safeNext', () => {
  it('garde les chemins internes', () => {
    expect(safeNext('/games/crystal-clash?x=1')).toBe('/games/crystal-clash?x=1');
    expect(safeNext('/studio/signup')).toBe('/studio/signup');
  });

  it('refuse les redirections externes ou malformées', () => {
    for (const bad of ['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '', null, undefined, 42, '/a\nb']) {
      expect(safeNext(bad)).toBe('/');
    }
  });

  it('ne renvoie pas vers les pages de connexion', () => {
    expect(safeNext('/login?next=/x')).toBe('/');
    expect(safeNext('/signup', '/studio')).toBe('/studio');
  });
});

describe('withNext', () => {
  it('ajoute ?next= encodé sauf pour la racine', () => {
    expect(withNext('/login', '/games/a?b=1')).toBe('/login?next=%2Fgames%2Fa%3Fb%3D1');
    expect(withNext('/login', '/')).toBe('/login');
    expect(withNext('/login', undefined)).toBe('/login');
  });
});
