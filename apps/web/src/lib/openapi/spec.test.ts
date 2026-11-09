import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SIGNATURE_HEADER, signPayload, type PurchaseEvent } from '@devappstore/core';
import { OPENAPI_CACHE_CONTROL, openApiResponse } from './serve';
import { ERROR_CODES, buildOpenApiSpec } from './spec';
import { deref, resolvePointer, validateSchema, type Schema } from './validate';

const spec = buildOpenApiSpec({ serverUrl: 'https://exemple.test/' });
const v1Dir = resolve(import.meta.dirname, '../../app/api/v1');

function walk(node: unknown, visit: (n: Record<string, unknown>, path: string) => void, path = '#') {
  if (!node || typeof node !== 'object') return;
  visit(node as Record<string, unknown>, path);
  for (const [k, v] of Object.entries(node)) walk(v, visit, `${path}/${k}`);
}

describe('document OpenAPI 3.1', () => {
  it('en-tête, serveur sans « / » final, sécurité', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers).toEqual([{ url: 'https://exemple.test', description: 'Dev AppStore' }]);
    expect(Object.keys(spec.components.securitySchemes).sort()).toEqual(['playerToken', 'publishableKey', 'secretKey']);
    expect(spec.components.securitySchemes.playerToken.name).toBe('DevAppStore-Player-Token');
  });

  it('tous les $ref se résolvent ; le document est du JSON pur', () => {
    const refs: string[] = [];
    walk(spec, (n) => {
      if (typeof n.$ref === 'string') refs.push(n.$ref);
    });
    expect(refs.length).toBeGreaterThan(20);
    for (const r of refs) expect(() => resolvePointer(spec, r), r).not.toThrow();
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
  });

  it('operationId uniques, chaque opération a un 2xx et chaque erreur 4xx suit le format { error }', () => {
    const ids = new Set<string>();
    const ops = [
      ...Object.values(spec.paths).flatMap((item) => Object.values(item)),
      ...Object.values(spec.webhooks).flatMap((item) => Object.values(item)),
    ] as { operationId: string; responses: Record<string, unknown> }[];
    for (const op of ops) {
      expect(ids.has(op.operationId), op.operationId).toBe(false);
      ids.add(op.operationId);
      expect(Object.keys(op.responses).some((s) => s.startsWith('2')), op.operationId).toBe(true);
      for (const [status, r] of Object.entries(op.responses)) {
        if (!status.startsWith('4')) continue;
        const res = deref<{ content: Record<string, { schema: Schema }>; headers: Record<string, unknown> }>(spec, r);
        expect(res.content['application/json']!.schema).toEqual({ $ref: '#/components/schemas/Error' });
        expect(res.headers['Access-Control-Allow-Origin'], `${op.operationId} ${status}`).toBeDefined();
        if (status === '429') expect(res.headers['Retry-After'], op.operationId).toBeDefined();
      }
    }
  });

  it('chaque route.ts de /api/v1 et chaque méthode exportée figurent dans la spec (et réciproquement)', () => {
    const files: string[] = [];
    const scan = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) scan(join(dir, e.name));
        else if (e.name === 'route.ts') files.push(join(dir, e.name));
      }
    };
    scan(v1Dir);
    const fromCode = new Set<string>();
    for (const f of files) {
      const path = '/api/v1' + f.slice(v1Dir.length, -'/route.ts'.length).replace(/\[(\w+)\]/g, '{$1}');
      for (const [, m] of readFileSync(f, 'utf8').matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE|OPTIONS)\b/g)) {
        fromCode.add(`${m!.toLowerCase()} ${path}`);
      }
    }
    const fromSpec = new Set(Object.entries(spec.paths).flatMap(([p, item]) => Object.keys(item).map((m) => `${m} ${p}`)));
    expect([...fromSpec].sort()).toEqual([...fromCode].sort());
  });

  it('les codes d’erreur émis par les routes v1 et leurs aides sont tous documentés', () => {
    const sources = [
      ...['link-codes', 'link-requests/[id]', 'deliveries', 'deliveries/stream', 'deliveries/[id]/ack', 'player-tokens'].map((r) => join(v1Dir, r, 'route.ts')),
      resolve(import.meta.dirname, '../../server/delivery-http.ts'),
      resolve(import.meta.dirname, '../../server/api-rate-limit.ts'),
    ];
    const used = new Set<string>();
    for (const f of sources) for (const [, c] of readFileSync(f, 'utf8').matchAll(/corsError\(\d{3}, '([a-z_]+)'/g)) used.add(c!);
    // createLinkCode (linking.ts) : seules erreurs renvoyées telles quelles par POST /link-codes.
    used.add('method_disabled');
    used.add('rate_limited');
    expect(used.size).toBeGreaterThan(8);
    for (const c of used) expect(ERROR_CODES, c).toContain(c);
    // Pas de code documenté qui ne serait jamais émis.
    for (const c of ERROR_CODES) expect(used, c).toContain(c);
  });

  it('webhooks sortants : purchase.completed et purchase.refunded, en-tête de signature réel', () => {
    expect(Object.keys(spec.webhooks).sort()).toEqual(['purchase.completed', 'purchase.refunded']);
    const op = spec.webhooks['purchase.refunded'].post;
    const sig = op.parameters.find((p) => p.name === SIGNATURE_HEADER)!;
    expect(sig.required).toBe(true);
    expect(new RegExp(sig.schema.pattern as string).test(signPayload('{}', 'whsec_x'))).toBe(true);
    const event: PurchaseEvent = {
      event: 'purchase.refunded', delivery_id: 'rfd_1', order_id: 'ord_1', game_id: 'gam_1', player_id: 'p', product_id: 'gems',
      item_type: 'consumable', quantity: 1, amount_cents: 199, currency: 'EUR', created_at: new Date().toISOString(),
    };
    const schema = op.requestBody.content['application/json'].schema as Schema;
    expect(validateSchema(event, schema, spec)).toEqual([]);
    expect(validateSchema({ ...event, event: 'purchase.completed' }, schema, spec)).not.toEqual([]);
  });

  it('l’exemple de PurchaseEvent est conforme', () => {
    const s = spec.components.schemas.PurchaseEvent;
    expect(validateSchema(s.example, { $ref: '#/components/schemas/PurchaseEvent' }, spec)).toEqual([]);
  });
});

describe('validateur léger', () => {
  const root = { components: { schemas: { N: { type: 'integer', minimum: 1 } } } };
  it('types, required, additionalProperties, enum, const, pattern, date-time, $ref, oneOf', () => {
    const s: Schema = {
      type: 'object',
      required: ['a', 'n'],
      additionalProperties: false,
      properties: {
        a: { type: 'string', pattern: '^x', minLength: 2 },
        n: { $ref: '#/components/schemas/N' },
        d: { type: 'string', format: 'date-time' },
        e: { enum: ['u', 'v'] },
        c: { const: true },
        o: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
        l: { type: ['array', 'null'], items: { type: 'string' }, maxItems: 2 },
      },
    };
    expect(validateSchema({ a: 'xy', n: 2, d: '2026-11-09T10:00:00.000Z', e: 'u', c: true, o: 3, l: null }, s, root)).toEqual([]);
    const errs = validateSchema({ a: 'y', n: 0, d: '09/11/2026', e: 'w', c: false, o: 1.5, l: ['a', 'b', 3], z: 1 }, s, root);
    expect(errs.join('\n')).toMatch(/ne respecte pas/);
    for (const frag of ['longueur < 2', '0 < 1', 'date-time invalide', 'énumération', '≠ true', 'oneOf', 'plus de 2', '$.l[2]', 'inattendue « z »']) {
      expect(errs.join('\n')).toContain(frag);
    }
    expect(validateSchema({}, s, root)).toEqual(expect.arrayContaining([expect.stringContaining('« a » absente')]));
  });

  it('refuse un mot-clé de validation inconnu plutôt que de l’ignorer', () => {
    expect(validateSchema('x', { type: 'string', multipleOf: 2 }, root)[0]).toContain('non pris en charge « multipleOf »');
  });
});

describe('GET /api/openapi.json', () => {
  it('sert la spec avec un cache public, CORS ouvert, serveur = APP_URL sinon origine', async () => {
    const res = openApiResponse('http://localhost:3064');
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe(OPENAPI_CACHE_CONTROL);
    expect(res.headers.get('cache-control')).toMatch(/^public/);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = (await res.json()) as { openapi: string; servers: { url: string }[] };
    expect(body.openapi).toBe('3.1.0');
    expect(body.servers[0]!.url).toBe('http://localhost:3064');

    vi.resetModules();
    vi.doMock('@/env', () => ({ env: { APP_URL: undefined } }));
    const route = await import('@/app/api/openapi.json/route');
    const fromOrigin = (await (await route.GET(new Request('http://127.0.0.1:3064/api/openapi.json'))).json()) as typeof body;
    expect(fromOrigin.servers[0]!.url).toBe('http://127.0.0.1:3064');
    vi.doUnmock('@/env');
  });
});
