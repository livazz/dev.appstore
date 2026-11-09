import type { FetchLike } from './types';

/**
 * Erreur HTTP d'un store. Le message (affiché au studio) ne contient JAMAIS le corps brut de la réponse
 * (revue 2026-11, C-01) : seulement le code HTTP et, pour une réponse JSON d'erreur des stores, leur libellé
 * (`errors[0].title/detail`, `error_description`), tronqué. Le corps tronqué reste dans `body` (côté serveur).
 */
export class StoreApiError extends Error {
  constructor(
    readonly service: 'app_store_connect' | 'google_oauth' | 'google_play',
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    const detail = storeErrorDetail(body);
    super(`${service} : HTTP ${status} sur ${redact(url)}${detail ? ` — ${detail}` : ''}`);
    this.name = 'StoreApiError';
  }
}

function redact(url: string) {
  return url.replace(/([?&](?:access_token|key)=)[^&]+/g, '$1***');
}

/** Libellé d'erreur structuré d'App Store Connect / Google (JSON), ou chaîne vide. Jamais le corps brut. */
export function storeErrorDetail(body: string): string {
  try {
    const j = JSON.parse(body) as {
      errors?: { title?: unknown; detail?: unknown }[];
      error?: unknown;
      error_description?: unknown;
    };
    const parts: unknown[] = [];
    const first = Array.isArray(j?.errors) ? j.errors[0] : undefined;
    if (first) parts.push(first.title, first.detail);
    if (j && typeof j.error === 'object' && j.error && 'message' in j.error) parts.push((j.error as { message?: unknown }).message);
    else parts.push(j?.error);
    parts.push(j?.error_description);
    return parts
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .join(' : ')
      .replace(/[\u0000-\u001f]+/g, ' ')
      .slice(0, 200);
  } catch {
    return '';
  }
}

export interface HttpOptions {
  fetch?: FetchLike;
  /** Nouvelles tentatives sur 429 / 5xx (défaut 2). */
  retries?: number;
  /** Attente injectable (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Délai maximal par requête, en ms (défaut 15 s). */
  timeoutMs?: number;
  /** Taille maximale d'une réponse, en octets (défaut 5 Mio). */
  maxResponseBytes?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function resolveFetch(f?: FetchLike): FetchLike {
  const impl = f ?? (globalThis.fetch as FetchLike | undefined);
  if (!impl) throw new Error('Aucune implémentation de fetch disponible : passez `fetch` en option.');
  return impl;
}

/** Erreur de transport (délai, redirection refusée, réponse trop lourde ou illisible) : message générique. */
export class StoreTransportError extends Error {
  constructor(
    readonly service: StoreApiError['service'],
    message: string,
  ) {
    super(`${service} : ${message}`);
    this.name = 'StoreTransportError';
  }
}

/** Lit le corps en texte en s'arrêtant au-delà de `max` octets (Content-Length absent ou mensonger). */
async function readTextCapped(res: Response, max: number, service: StoreApiError['service']): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > max) throw new StoreTransportError(service, 'réponse trop volumineuse');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new StoreTransportError(service, 'réponse trop volumineuse');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Requête JSON avec relances exponentielles sur 429 / 5xx (respecte Retry-After en secondes).
 * Durcissement anti-SSRF (C-01) : aucune redirection suivie, délai borné, taille de réponse bornée,
 * aucun extrait du corps distant dans les messages d'erreur.
 */
export async function requestJson<T>(
  service: StoreApiError['service'],
  url: string,
  init: RequestInit,
  opts: HttpOptions = {},
): Promise<T> {
  const fetchImpl = resolveFetch(opts.fetch);
  const retries = opts.retries ?? 2;
  const sleep = opts.sleep ?? defaultSleep;
  const max = opts.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) });
    } catch (e) {
      const name = (e as Error)?.name;
      throw new StoreTransportError(service, name === 'TimeoutError' || name === 'AbortError' ? 'délai dépassé' : 'connexion impossible');
    }
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      throw new StoreTransportError(service, `redirection refusée (HTTP ${res.status})`);
    }
    const text = await readTextCapped(res, max, service).catch((e) => {
      if (e instanceof StoreTransportError) throw e;
      throw new StoreTransportError(service, 'réponse illisible');
    });
    if (res.ok) {
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new StoreTransportError(service, 'réponse non JSON');
      }
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) throw new StoreApiError(service, res.status, url, text.slice(0, 2000));
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 500 * 2 ** attempt);
  }
}

/** Exécute `fn` sur chaque élément avec au plus `limit` appels simultanés (respect des quotas des stores). */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Choisit la localisation la plus proche de `preferred` (exacte, même langue, en-US, première). */
export function pickLocale<T>(items: readonly T[], getLocale: (item: T) => string | undefined, preferred: string): T | undefined {
  if (items.length === 0) return undefined;
  const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace('_', '-');
  const want = norm(preferred);
  const lang = want.split('-')[0];
  return (
    items.find((i) => norm(getLocale(i)) === want) ??
    items.find((i) => norm(getLocale(i)).split('-')[0] === lang) ??
    items.find((i) => norm(getLocale(i)) === 'en-us') ??
    items.find((i) => norm(getLocale(i)).startsWith('en')) ??
    items[0]
  );
}
