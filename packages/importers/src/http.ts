import type { FetchLike } from './types';

/** Erreur HTTP d'un store (le corps est tronqué ; il ne contient jamais nos secrets). */
export class StoreApiError extends Error {
  constructor(
    readonly service: 'app_store_connect' | 'google_oauth' | 'google_play',
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`${service} : HTTP ${status} sur ${redact(url)} — ${body.slice(0, 300)}`);
    this.name = 'StoreApiError';
  }
}

function redact(url: string) {
  return url.replace(/([?&](?:access_token|key)=)[^&]+/g, '$1***');
}

export interface HttpOptions {
  fetch?: FetchLike;
  /** Nouvelles tentatives sur 429 / 5xx (défaut 2). */
  retries?: number;
  /** Attente injectable (tests). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function resolveFetch(f?: FetchLike): FetchLike {
  const impl = f ?? (globalThis.fetch as FetchLike | undefined);
  if (!impl) throw new Error('Aucune implémentation de fetch disponible : passez `fetch` en option.');
  return impl;
}

/** Requête JSON avec relances exponentielles sur 429 / 5xx (respecte Retry-After en secondes). */
export async function requestJson<T>(
  service: StoreApiError['service'],
  url: string,
  init: RequestInit,
  opts: HttpOptions = {},
): Promise<T> {
  const fetchImpl = resolveFetch(opts.fetch);
  const retries = opts.retries ?? 2;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, init);
    if (res.ok) return (await res.json()) as T;
    const body = await res.text().catch(() => '');
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) throw new StoreApiError(service, res.status, url, body);
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
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
