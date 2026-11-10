import 'server-only';
import { authenticateApi, type ApiAuth } from './api-key';
import { clientIp } from './auth-rate-limit';
import { corsError, unauthorized } from './delivery-http';
import { getRateLimitStore, getStreamSlots, type ConcurrencyLimiter, type RateLimitStore, type RateRule } from './rate-limit';

/*
 * Garde commune des routes /api/v1 : limitation de débit par IP (avant authentification : les clés invalides
 * comptent aussi, ce qui freine l'essai de clés) puis par clé de jeu (après authentification), avec des limites
 * propres aux routes sensibles (link-codes : création de codes ; link-requests : interrogation par le SDK).
 * Les flux SSE sont en plus plafonnés en connexions simultanées par joueur et par clé, et en durée.
 *
 * L'IP vient de X-Forwarded-For / X-Real-IP (`clientIp`) : à déployer derrière un proxy qui réécrit ces en-têtes.
 */

export type ApiRoute = 'link-codes' | 'link-requests' | 'deliveries' | 'stream' | 'ack' | 'player-tokens';

const MINUTE = 60_000;

export const API_RATE_LIMITS = {
  /** Toutes routes v1 confondues, par IP (requêtes non authentifiées comprises). */
  perIp: { max: 600, windowMs: MINUTE },
  /** Par clé secrète (serveur du studio : un seul émetteur, tous les joueurs du jeu). */
  perSecretKey: { max: 3000, windowMs: MINUTE },
  /** Par clé publique (partagée par tous les clients du jeu). */
  perPublishableKey: { max: 6000, windowMs: MINUTE },
  /** Limites propres à certaines routes, par IP et par clé. */
  routes: {
    'link-codes': { perIp: { max: 20, windowMs: MINUTE }, perKey: { max: 600, windowMs: MINUTE } },
    'link-requests': { perIp: { max: 120, windowMs: MINUTE }, perKey: { max: 3000, windowMs: MINUTE } },
    stream: { perIp: { max: 60, windowMs: MINUTE }, perKey: { max: 3000, windowMs: MINUTE } },
  } as Partial<Record<ApiRoute, { perIp: RateRule; perKey: RateRule }>>,
};

export const STREAM_LIMITS = {
  /** Flux simultanés par joueur (jeu, player_id) et par origine (clé secrète, ou compte du jeton) : un client légitime n'en ouvre qu'un. */
  perPlayer: 3,
  /** Flux simultanés par clé. */
  perSecretKey: 500,
  perPublishableKey: 10_000,
  /** Durée maximale d'un flux : le serveur le ferme, le SDK se reconnecte (et rattrape l'arriéré). */
  maxDurationMs: 30 * MINUTE,
};

export interface GuardDeps {
  store?: RateLimitStore;
  now?: number;
  authenticate?: (req: Request) => Promise<ApiAuth | null>;
}

export function rateLimitedResponse(retryAfterS: number, message = 'Trop de requêtes, réessayez dans un instant.') {
  const res = corsError(429, 'rate_limited', message);
  res.headers.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterS))));
  return res;
}

async function check(store: RateLimitStore, rules: [string, RateRule][], now: number | undefined): Promise<number> {
  for (const [key, rule] of rules) {
    const d = await store.hit(key, rule, now);
    if (!d.allowed) return d.retryAfterS;
  }
  return 0;
}

const keyId = (auth: ApiAuth) => `${auth.kind}:${auth.game.id}`;

/**
 * Limite par IP, authentifie, puis limite par clé. Renvoie l'authentification ou la réponse d'erreur (401 / 429,
 * avec CORS et Retry-After).
 */
export async function guardApi(
  req: Request,
  route: ApiRoute,
  deps: GuardDeps = {},
): Promise<{ ok: true; auth: ApiAuth } | { ok: false; res: Response }> {
  const store = deps.store ?? getRateLimitStore();
  const ip = clientIp(req.headers);
  const routeRules = API_RATE_LIMITS.routes[route];

  const ipRules: [string, RateRule][] = [[`v1:ip:${ip}`, API_RATE_LIMITS.perIp]];
  if (routeRules) ipRules.push([`v1:${route}:ip:${ip}`, routeRules.perIp]);
  const ipRetry = await check(store, ipRules, deps.now);
  if (ipRetry) return { ok: false, res: rateLimitedResponse(ipRetry) };

  const auth = await (deps.authenticate ?? authenticateApi)(req);
  if (!auth) return { ok: false, res: unauthorized() };

  const k = keyId(auth);
  const keyRules: [string, RateRule][] = [
    [`v1:key:${k}`, auth.kind === 'secret' ? API_RATE_LIMITS.perSecretKey : API_RATE_LIMITS.perPublishableKey],
  ];
  if (routeRules) keyRules.push([`v1:${route}:key:${k}`, routeRules.perKey]);
  const keyRetry = await check(store, keyRules, deps.now);
  if (keyRetry) return { ok: false, res: rateLimitedResponse(keyRetry, 'Trop de requêtes pour cette clé, réessayez dans un instant.') };

  return { ok: true, auth };
}

/**
 * Réserve une place de flux SSE pour (jeu, joueur) et pour la clé. Plafonds PAR INSTANCE (un flux vit dans un
 * processus ; un compteur partagé exigerait des baux renouvelés) : avec N instances, au plus N × STREAM_LIMITS.
 * Le débit d'ouverture des flux, lui, est partagé quand RATE_LIMIT_STORE=postgres (limite `stream` de guardApi). Renvoie la libération (idempotente) ou une
 * réponse 429 `too_many_streams`.
 */
export function acquireStreamSlot(
  auth: ApiAuth,
  playerId: string,
  slots: ConcurrencyLimiter = getStreamSlots(),
): { ok: true; release: () => void } | { ok: false; res: Response } {
  // Place par joueur ET par origine (revue 2026-11, F2) : n'importe qui peut obtenir un jeton pour n'importe quel
  // player_id (code demandé avec la clé publique, saisi avec son propre compte) ; ses flux ne doivent pas consommer
  // les places du compte acheteur légitime ni celles du serveur du studio (clé secrète).
  const owner = auth.kind === 'secret' ? 'secret' : `user:${auth.player?.userId ?? 'anonyme'}`;
  const release = slots.acquire([
    { key: `stream:player:${auth.game.id}:${owner}:${playerId}`, max: STREAM_LIMITS.perPlayer },
    { key: `stream:key:${keyId(auth)}`, max: auth.kind === 'secret' ? STREAM_LIMITS.perSecretKey : STREAM_LIMITS.perPublishableKey },
  ]);
  if (!release) {
    const res = corsError(429, 'too_many_streams', 'Trop de flux ouverts simultanément pour ce joueur ou cette clé. Fermez les flux inutilisés.');
    res.headers.set('Retry-After', '30');
    return { ok: false, res };
  }
  return { ok: true, release };
}
