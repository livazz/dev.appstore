/*
 * Paramètres d'URL de la boutique publique (/games/[slug]) :
 * - `?item=<itemId>` : détail d'article ouvert (partage de lien, retour de connexion) ;
 * - `?buy=<itemId>` : même chose, mais on arrive pour acheter (retour de /games/[slug]/link, voir
 *   linkReturnPath dans server/linking.ts) : le détail s'ouvre avec le focus sur l'achat.
 * Pur (sans dépendance Next/React) : importable côté serveur et client, testé dans store-query.test.ts.
 */

export type StoreSearchParams = { item?: string | string[]; buy?: string | string[] };

export interface InitialStoreItem {
  itemId: string | null;
  /** Vrai si l'article vient de `?buy=` : on place le focus sur l'achat. */
  buy: boolean;
}

const first = (v: string | string[] | undefined) => {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
};

/** `?buy=` l'emporte sur `?item=` (intention d'achat explicite). */
export function initialStoreItem(sp: StoreSearchParams): InitialStoreItem {
  const buy = first(sp.buy);
  if (buy) return { itemId: buy, buy: true };
  return { itemId: first(sp.item), buy: false };
}

/** URL de la boutique avec le détail `itemId` ouvert (ou fermé si null) ; `?buy=` est consommé. */
export function storeUrlWithItem(href: string, itemId: string | null): string {
  const url = new URL(href);
  url.searchParams.delete('buy');
  if (itemId) url.searchParams.set('item', itemId);
  else url.searchParams.delete('item');
  return url.toString();
}
