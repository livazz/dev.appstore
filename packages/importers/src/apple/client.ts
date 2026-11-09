import type { KeyObject } from 'node:crypto';
import { loadPrivateKey, signJwt } from '../jwt';
import { requestJson, type HttpOptions } from '../http';

export const APP_STORE_CONNECT_BASE_URL = 'https://api.appstoreconnect.apple.com';
export const APP_STORE_CONNECT_AUDIENCE = 'appstoreconnect-v1';
/** Apple refuse les jetons dont la durée de vie (exp − iat) dépasse 20 minutes. */
export const APP_STORE_CONNECT_MAX_TTL_S = 20 * 60;

/** Clé d'API d'équipe App Store Connect (Utilisateurs et accès → Intégrations → App Store Connect API). */
export interface AppStoreConnectCredentials {
  /** Issuer ID (UUID affiché en haut de la page des clés). */
  issuerId: string;
  /** Key ID (10 caractères, ex. `2X9R4HXF34`). */
  keyId: string;
  /** Contenu du fichier `AuthKey_<keyId>.p8` (PEM PKCS#8, courbe P-256). */
  privateKey: string | KeyObject;
}

/**
 * Crée un jeton JWT ES256 pour l'App Store Connect API.
 * En-tête `{ alg: ES256, kid, typ: JWT }`, charge `{ iss, iat, exp, aud: appstoreconnect-v1 }`.
 */
export function createAppStoreConnectToken(
  creds: AppStoreConnectCredentials,
  opts: { now?: number; ttlSeconds?: number; scope?: string[] } = {},
): string {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const ttl = Math.min(opts.ttlSeconds ?? APP_STORE_CONNECT_MAX_TTL_S, APP_STORE_CONNECT_MAX_TTL_S);
  const payload: Record<string, unknown> = { iss: creds.issuerId, iat, exp: iat + ttl, aud: APP_STORE_CONNECT_AUDIENCE };
  if (opts.scope?.length) payload.scope = opts.scope;
  return signJwt('ES256', { kid: creds.keyId, typ: 'JWT' }, payload, creds.privateKey);
}

/* ---------- Types JSON:API (sous-ensemble utilisé) ---------- */

export interface JsonApiResource<A = Record<string, unknown>> {
  type: string;
  id: string;
  attributes?: A;
  relationships?: Record<string, { data?: { type: string; id: string } | { type: string; id: string }[] | null }>;
}

export interface JsonApiDocument<A = Record<string, unknown>> {
  data: JsonApiResource<A>[] | JsonApiResource<A>;
  included?: JsonApiResource[];
  links?: { self?: string; next?: string };
}

export interface AppStoreConnectClientOptions extends HttpOptions {
  baseUrl?: string;
  /** Horloge injectable (tests). */
  now?: () => number;
}

/** Client minimal App Store Connect : authentification, renouvellement du jeton, pagination `links.next`. */
export class AppStoreConnectClient {
  private token: { value: string; exp: number } | null = null;
  private readonly baseUrl: string;
  private readonly now: () => number;
  private readonly creds: AppStoreConnectCredentials;

  constructor(creds: AppStoreConnectCredentials, private readonly opts: AppStoreConnectClientOptions = {}) {
    // Valide la clé dès la construction (erreur claire si le .p8 est mal collé).
    this.creds = { ...creds, privateKey: loadPrivateKey(creds.privateKey) };
    this.baseUrl = (opts.baseUrl ?? APP_STORE_CONNECT_BASE_URL).replace(/\/$/, '');
    this.now = opts.now ?? Date.now;
  }

  private bearer(): string {
    const nowS = Math.floor(this.now() / 1000);
    if (!this.token || this.token.exp - 60 <= nowS) {
      this.token = {
        value: createAppStoreConnectToken(this.creds, { now: nowS * 1000 }),
        exp: nowS + APP_STORE_CONNECT_MAX_TTL_S,
      };
    }
    return this.token.value;
  }

  url(path: string, query: Record<string, string | number | undefined> = {}): string {
    const u = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path}`);
    // `links.next` vient de la réponse : il doit rester sur l'origine de l'API (le jeton n'est envoyé qu'à Apple).
    if (u.origin !== new URL(this.baseUrl).origin) {
      throw new Error(`URL hors App Store Connect refusée : ${u.origin}`);
    }
    for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, String(v));
    return u.toString();
  }

  async get<A = Record<string, unknown>>(pathOrUrl: string, query?: Record<string, string | number | undefined>): Promise<JsonApiDocument<A>> {
    return requestJson<JsonApiDocument<A>>(
      'app_store_connect',
      this.url(pathOrUrl, query),
      { headers: { Authorization: `Bearer ${this.bearer()}`, Accept: 'application/json' } },
      this.opts,
    );
  }

  /** Parcourt toutes les pages d'une collection ; concatène `data` et `included`. */
  async getAll<A = Record<string, unknown>>(
    path: string,
    query?: Record<string, string | number | undefined>,
    maxPages = 50,
  ): Promise<{ data: JsonApiResource<A>[]; included: JsonApiResource[] }> {
    const data: JsonApiResource<A>[] = [];
    const included: JsonApiResource[] = [];
    let doc = await this.get<A>(path, query);
    for (let page = 1; ; page++) {
      data.push(...(Array.isArray(doc.data) ? doc.data : [doc.data]));
      included.push(...(doc.included ?? []));
      if (!doc.links?.next || page >= maxPages) break;
      doc = await this.get<A>(doc.links.next);
    }
    return { data, included };
  }
}

/** Index `type:id` → ressource des `included`. */
export function indexIncluded(included: readonly JsonApiResource[]): Map<string, JsonApiResource> {
  return new Map(included.map((r) => [`${r.type}:${r.id}`, r]));
}

export function relIds(res: JsonApiResource<unknown>, name: string): { type: string; id: string }[] {
  const d = res.relationships?.[name]?.data;
  if (!d) return [];
  return Array.isArray(d) ? d : [d];
}
