/*
 * Bibliothèque d'illustrations fournie par la plateforme (apps/web/public/art, WebP optimisés par
 * scripts/optimize-art.mjs). Les studios peuvent les choisir dans l'éditeur sans rien téléverser.
 * Module pur (aucune dépendance serveur) : utilisable côté client comme côté serveur.
 */

/** Chemin d'une illustration de la bibliothèque : fichier statique du site, motif strict (pas de requête arbitraire). */
export const ART_LIBRARY_RE = /^\/art\/(?:items|icons|site|games\/[a-z0-9-]+)\/[a-z0-9-]+\.webp$/;

export function isLibraryArt(url: unknown): boolean {
  return typeof url === 'string' && url.length <= 200 && ART_LIBRARY_RE.test(url);
}

export const art = (name: string) => `/art/items/${name}.webp`;

export type ArtEntry = { url: string; label: string };
export type ArtCategory = { title: string; items: ArtEntry[] };

const e = (name: string, label: string): ArtEntry => ({ url: art(name), label });

/** Objets de boutique, rangés par famille, du plus petit au plus gros palier. */
export const ART_LIBRARY: ArtCategory[] = [
  { title: 'Gemmes', items: [e('gems-1', 'Poignée de gemmes'), e('gems-2', 'Sac de gemmes'), e('gems-3', 'Coffre de gemmes'), e('gems-4', 'Montagne de gemmes')] },
  { title: 'Cristaux', items: [e('crystals-1', 'Quelques cristaux'), e('crystals-2', 'Bourse de cristaux'), e('crystals-3', 'Caisse de cristaux'), e('crystals-4', 'Montagne de cristaux')] },
  { title: 'Or et monnaies', items: [e('gold-1', 'Quelques pièces'), e('gold-2', 'Piles de pièces'), e('gold-3', "Sac d'or"), e('gold-4', "Coffre d'or"), e('silver', "Pièces d'argent"), e('tokens', 'Jetons'), e('stars', 'Étoiles'), e('elixir', 'Élixir')] },
  { title: 'Coffres', items: [e('chest-common', 'Coffre commun'), e('chest-rare', 'Coffre rare'), e('chest-epic', 'Coffre épique'), e('chest-legendary', 'Coffre légendaire'), e('chest-mystery', 'Coffre mystère'), e('chest-open', 'Coffre ouvert')] },
  { title: 'Packs et cadeaux', items: [e('starter-pack', 'Pack débutant'), e('bundle', 'Lot'), e('mega-bundle', 'Méga pack'), e('gift-small', 'Petit cadeau'), e('gift-big', 'Gros cadeau'), e('daily-gift', 'Cadeau quotidien'), e('card-pack', 'Paquet de cartes')] },
  { title: 'Abonnements et prestige', items: [e('pass', 'Pass royal'), e('season-pass', 'Pass de saison'), e('subscription-scroll', 'Abonnement'), e('vip', 'Badge VIP'), e('crown-silver', 'Couronne argent'), e('ticket', 'Ticket'), e('trophy', 'Trophée')] },
  { title: 'Boosts et ressources', items: [e('energy', 'Énergie'), e('lives', 'Vies'), e('booster-x2', 'Boost ×2'), e('xp-boost', "Boost d'expérience"), e('speed-up', 'Accélérateur'), e('shield', 'Bouclier'), e('key', 'Clé'), e('remove-ads', 'Sans pub')] },
  { title: 'Cosmétiques', items: [e('skin', 'Skin'), e('emote', 'Emote')] },
  { title: 'Ferme (style doux)', items: [e('farm-seeds', 'Graines'), e('farm-coins', 'Bourse de pièces'), e('farm-fertilizer', 'Engrais'), e('farm-tractor', 'Tracteur')] },
];
