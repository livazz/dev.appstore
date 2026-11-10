import { describe, expect, it } from 'vitest';
import { demoRoleOf, isRoleSwitcherEnabled } from './demo-roles';

describe('bascule de rôle de démo', () => {
  it('n’est jamais active en production, même demandée', () => {
    expect(isRoleSwitcherEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isRoleSwitcherEnabled({ NODE_ENV: 'production', DEVAPPSTORE_ROLE_SWITCHER: '1' })).toBe(false);
  });
  it('est active en développement, désactivable par DEVAPPSTORE_ROLE_SWITCHER=0', () => {
    expect(isRoleSwitcherEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isRoleSwitcherEnabled({ NODE_ENV: 'development', DEVAPPSTORE_ROLE_SWITCHER: '0' })).toBe(false);
  });
  it('reconnaît les comptes de démo (casse ignorée) et seulement eux', () => {
    expect(demoRoleOf('ADMIN@devappstore.test')).toBe('admin');
    expect(demoRoleOf('dev@devappstore.test')).toBe('studio');
    expect(demoRoleOf('quelquun@exemple.fr')).toBeNull();
    expect(demoRoleOf(null)).toBeNull();
  });
});
