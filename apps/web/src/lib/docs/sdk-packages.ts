/**
 * Paquets « glisser-déposer » servis depuis /sdk (apps/web/public/sdk), fabriqués par `npm run sdk:pack`.
 * sdk-packages.test.ts vérifie que les versions et le contenu des archives correspondent aux sources (sdks/).
 */
export const SDK_PACKAGES = {
  unity: { version: '0.3.0', href: '/sdk/devappstore-unity-0.3.0.unitypackage', minEngine: 'Unity 2021.3' },
  godot: { version: '0.3.0', href: '/sdk/devappstore-godot-0.3.0.zip', minEngine: 'Godot 4.2' },
} as const;
