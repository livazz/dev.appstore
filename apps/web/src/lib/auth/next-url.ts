/**
 * Nettoie le paramètre `?next=` pour éviter les redirections ouvertes :
 * seuls les chemins relatifs internes (`/…`, pas `//…` ni `/\…`) sont acceptés.
 */
export function safeNext(next: unknown, fallback = '/'): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > 2048) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  // Les pages d'authentification ne sont pas des destinations utiles après connexion.
  if (/^\/(login|signup)(\/|\?|#|$)/.test(next)) return fallback;
  return next;
}

/** Construit un lien vers une page d'auth en conservant `next`. */
export function withNext(path: string, next: string | undefined) {
  return next && next !== '/' ? `${path}?next=${encodeURIComponent(next)}` : path;
}
