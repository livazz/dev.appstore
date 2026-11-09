/*
 * Liens du menu compte (UserMenu), partagés entre la barre en ligne (bureau) et le menu déroulant (mobile).
 * Pur : testé dans account-menu.test.ts.
 */

export type UserMenuVariant = 'player' | 'studio';

export interface AccountMenuLink {
  href: string;
  label: string;
}

/**
 * - joueur : « Espace studio » (membre d'un studio), « Mes points » (programme de fidélité) ;
 * - studio : « Retour au site » (l'espace studio est déjà ouvert, et les points concernent le joueur).
 * « Mon compte » et « Se déconnecter » sont rendus à part (avatar, formulaire).
 */
export function accountMenuLinks({ variant, isStudioMember }: { variant: UserMenuVariant; isStudioMember: boolean }): AccountMenuLink[] {
  if (variant === 'studio') return [{ href: '/', label: 'Retour au site' }];
  const links: AccountMenuLink[] = [];
  if (isStudioMember) links.push({ href: '/studio', label: 'Espace studio' });
  links.push({ href: '/account/points', label: 'Mes points' });
  return links;
}
