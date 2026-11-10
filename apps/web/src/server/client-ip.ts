import { isIP } from 'node:net';

/*
 * IP du client — utilitaire UNIQUE pour tous les limiteurs (API /api/v1, formulaires de connexion et d'inscription,
 * liaison de compte). Revue de sécurité 2026-11 (F3 / A-05).
 *
 * `X-Forwarded-For` est une liste « client, proxy1, proxy2… » à laquelle chaque proxy AJOUTE l'adresse qu'il voit.
 * Les valeurs de gauche sont fournies par le client et ne prouvent rien : seule la valeur ajoutée par le proxy de
 * confiance le plus éloigné est fiable. Avec `TRUSTED_PROXY_HOPS = n` (n proxys de confiance devant l'application),
 * l'IP du client est donc la n-ième valeur EN PARTANT DE LA DROITE.
 *
 * - `TRUSTED_PROXY_HOPS` absent : 1 (un proxy : Vercel, qui réécrit l'en-tête, ou un nginx / ALB unique).
 * - `TRUSTED_PROXY_HOPS = 0` : application exposée sans proxy — les en-têtes sont ignorés (« unknown » : limite commune).
 * - Sans `X-Forwarded-For` mais avec un proxy : `X-Real-IP` (posé par le proxy).
 * Une valeur qui n'est pas une adresse IP donne « unknown ».
 */

export const UNKNOWN_IP = 'unknown';
const MAX_HOPS = 10;

/** Nombre de proxys de confiance (variable `TRUSTED_PROXY_HOPS`, entier de 0 à 10, défaut 1). */
export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_HOPS) {
    throw new Error(`TRUSTED_PROXY_HOPS invalide : « ${raw} » (entier de 0 à ${MAX_HOPS} attendu)`);
  }
  return n;
}

/** Normalise une adresse (« [::1]:443 », « 1.2.3.4:5678 », zone IPv6) ; null si ce n'est pas une IP. */
function normalize(value: string | undefined): string | null {
  let v = value?.trim() ?? '';
  if (!v) return null;
  const bracket = v.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) v = bracket[1]!;
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(':'));
  v = v.split('%')[0]!.toLowerCase();
  return isIP(v) ? v : null;
}

/** IP du client selon les proxys de confiance, ou « unknown ». */
export function clientIp(headers?: Headers | null, hops: number = trustedProxyHops()): string {
  if (!headers || hops <= 0) return UNKNOWN_IP;
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const list = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length) {
      // Moins de valeurs que de proxys : la plus à gauche est la plus lointaine connue.
      const pick = list[Math.max(0, list.length - hops)];
      return normalize(pick) ?? UNKNOWN_IP;
    }
  }
  return normalize(headers.get('x-real-ip') ?? undefined) ?? UNKNOWN_IP;
}
