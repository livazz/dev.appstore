/*
 * Limitation de débit des formulaires de connexion / inscription (CHK-AUTH-04, T-AUTH-03).
 *
 * Les Server Actions appellent `auth.api.signInEmail(...)` directement : la limitation intégrée à Better Auth ne
 * s'applique qu'aux requêtes HTTP passant par /api/auth/*, pas à ces appels. On ajoute donc un compteur à fenêtre
 * glissante, en mémoire du processus (une instance) : suffisant contre la force brute depuis une source ; en
 * multi-instance, chaque instance applique sa propre limite (N instances → au plus N × la limite). Ce limiteur reste
 * volontairement synchrone et local (API vérification puis enregistrement, appelée par auth-flows.ts) ; le limiteur
 * partagé entre instances est celui de l'API (`rate-limit.ts`, RATE_LIMIT_STORE=postgres). Voir docs/deploy.md,
 * « Plusieurs instances ».
 *
 * Les vérifications et l'enregistrement sont synchrones (aucun `await` entre lecture et écriture) : des requêtes
 * concurrentes ne peuvent pas toutes passer la même vérification.
 */

export interface RateRule {
  max: number;
  windowMs: number;
}

export const AUTH_RATE_LIMITS = {
  /**
   * Échecs de connexion par couple e-mail + IP : blocage dur d'une source qui s'acharne sur un compte. Un tiers ne peut
   * donc plus bloquer la connexion de la titulaire depuis une autre IP (revue de sécurité A-09).
   */
  signInFailuresPerEmailIp: { max: 8, windowMs: 15 * 60_000 },
  /** Échecs par adresse e-mail toutes IP confondues : plafond haut contre le bourrage d'identifiants distribué. */
  signInFailuresPerEmail: { max: 50, windowMs: 15 * 60_000 },
  /** Échecs de connexion par IP (tous comptes confondus). */
  signInFailuresPerIp: { max: 40, windowMs: 15 * 60_000 },
  /** Inscriptions (réussies ou non) par IP : limite la création de comptes en masse et l'énumération d'e-mails. */
  signUpPerIp: { max: 10, windowMs: 60 * 60_000 },
} satisfies Record<string, RateRule>;

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly maxKeys = 50_000) {}

  private recent(key: string, rule: RateRule, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => t > now - rule.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Secondes avant de pouvoir réessayer (0 si la clé n'est pas bloquée). */
  retryAfter(key: string, rule: RateRule, now = Date.now()): number {
    const list = this.recent(key, rule, now);
    if (list.length < rule.max) return 0;
    return Math.max(1, Math.ceil((list[list.length - rule.max]! + rule.windowMs - now) / 1000));
  }

  record(key: string, rule: RateRule, now = Date.now()): void {
    const list = this.recent(key, rule, now);
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > this.maxKeys) {
      // Mémoire bornée : on oublie les clés les plus anciennes (ordre d'insertion de la Map).
      const excess = this.hits.size - this.maxKeys;
      let i = 0;
      for (const k of this.hits.keys()) {
        if (i++ >= excess) break;
        this.hits.delete(k);
      }
    }
  }

  reset(): void {
    this.hits.clear();
  }
}

/** Clés des compteurs de connexion (e-mail normalisé). */
function signInKeys(email: string, ip: string) {
  const e = email.trim().toLowerCase();
  return [
    [`signin:emailip:${e}|${ip}`, AUTH_RATE_LIMITS.signInFailuresPerEmailIp],
    [`signin:email:${e}`, AUTH_RATE_LIMITS.signInFailuresPerEmail],
    [`signin:ip:${ip}`, AUTH_RATE_LIMITS.signInFailuresPerIp],
  ] as const;
}

/**
 * Secondes d'attente avant une nouvelle tentative de connexion (0 si autorisée). Même réponse que le compte existe ou
 * non. Utilisé par le formulaire (auth-flows.ts) ET par la route HTTP Better Auth `/api/auth/sign-in/email` (auth.ts).
 */
export function signInRetryAfter(limiter: SlidingWindowLimiter, email: string, ip: string, now = Date.now()): number {
  return Math.max(0, ...signInKeys(email, ip).map(([k, rule]) => limiter.retryAfter(k, rule, now)));
}

/** Enregistre un échec de connexion pour l'e-mail, le couple e-mail + IP et l'IP. */
export function recordSignInFailure(limiter: SlidingWindowLimiter, email: string, ip: string, now = Date.now()): void {
  for (const [k, rule] of signInKeys(email, ip)) limiter.record(k, rule, now);
}

/** Instance partagée par les Server Actions d'authentification et la route HTTP Better Auth. */
export const authLimiter = new SlidingWindowLimiter();

/**
 * IP du client : utilitaire unique partagé avec l'API v1 et la liaison (proxys de confiance `TRUSTED_PROXY_HOPS`,
 * valeur prise en partant de la droite de X-Forwarded-For). Voir `./client-ip`.
 */
export { clientIp } from './client-ip';
