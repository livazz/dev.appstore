/**
 * Nettoie le paramètre `?next=` pour éviter les redirections ouvertes :
 * seuls les chemins relatifs internes (`/…`, pas `//…` ni `/\…`) sont acceptés.
 */
export function safeNext(next: unknown, fallback = '/'): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > 2048) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  // Défense en profondeur : une fois résolu par un analyseur d'URL (comme le navigateur), le chemin doit rester
  // sur la même origine (couvre les variantes d'encodage et de normalisation non prévues ci-dessus).
  try {
    const base = 'http://devappstore.invalid';
    const u = new URL(next, base);
    if (u.origin !== base || u.username || u.password) return fallback;
    if (u.pathname.startsWith('//')) return fallback;
    // Variante encodée (`/%2F%2Fevil.tld`, `/%5Cevil.tld`) : refusée au cas où un maillon (proxy, client) la décoderait.
    const decoded = decodeURIComponent(u.pathname);
    if (decoded.startsWith('//') || decoded.includes('\\')) return fallback;
  } catch {
    return fallback;
  }
  // Les pages d'authentification ne sont pas des destinations utiles après connexion.
  if (/^\/(login|signup)(\/|\?|#|$)/.test(next)) return fallback;
  return next;
}

/** Construit un lien vers une page d'auth en conservant `next`. */
export function withNext(path: string, next: string | undefined) {
  return next && next !== '/' ? `${path}?next=${encodeURIComponent(next)}` : path;
}
