/*
 * Validateur léger (maison, sans dépendance) du sous-ensemble de JSON Schema 2020-12 utilisé par `spec.ts`, et
 * vérification d'une réponse HTTP contre une opération OpenAPI 3.1. Sert au test de contrat de l'API v1.
 *
 * Mots-clés pris en charge : $ref (locaux, `#/…`), type (chaîne ou liste), const, enum, properties, required,
 * additionalProperties (booléen ou schéma), items, minItems, maxItems, oneOf, anyOf, allOf, minLength, maxLength,
 * pattern, minimum, maximum, format (date-time). Tout autre mot-clé de validation fait échouer (pour ne jamais croire
 * valider ce qu'on ignore) ; les mots-clés d'annotation (description, example, title…) sont ignorés.
 */

export type Schema = Record<string, unknown>;

const ANNOTATIONS = new Set(['description', 'example', 'examples', 'title', 'default', 'deprecated', 'readOnly', 'writeOnly', 'externalDocs', '$comment']);
const SUPPORTED = new Set([
  '$ref', 'type', 'const', 'enum', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems',
  'oneOf', 'anyOf', 'allOf', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'format',
]);

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

const matchesType = (v: unknown, t: string) => {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
};

/** Résout un pointeur JSON local (`#/components/schemas/X`). */
export function resolvePointer(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith('#/')) throw new Error(`$ref non local non pris en charge : ${pointer}`);
  let cur: unknown = root;
  for (const raw of pointer.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur === null || typeof cur !== 'object' || !(key in (cur as object))) throw new Error(`$ref introuvable : ${pointer}`);
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Suit les `$ref` successifs d'un objet (schéma, réponse, en-tête…). */
export function deref<T = Record<string, unknown>>(root: unknown, node: unknown): T {
  let cur = node as Record<string, unknown>;
  for (let i = 0; cur && typeof cur.$ref === 'string'; i++) {
    if (i > 20) throw new Error('Boucle de $ref');
    cur = resolvePointer(root, cur.$ref) as Record<string, unknown>;
  }
  return cur as T;
}

/** Valide `value` contre `schema`. Renvoie la liste des erreurs (vide si valide). */
export function validateSchema(value: unknown, schema: Schema, root: unknown, path = '$'): string[] {
  const errors: string[] = [];
  for (const k of Object.keys(schema)) {
    if (!SUPPORTED.has(k) && !ANNOTATIONS.has(k) && !k.startsWith('x-')) errors.push(`${path} : mot-clé de schéma non pris en charge « ${k} »`);
  }
  if (errors.length) return errors;

  if (typeof schema.$ref === 'string') {
    errors.push(...validateSchema(value, resolvePointer(root, schema.$ref) as Schema, root, path));
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((t) => matchesType(value, t))) return [...errors, `${path} : type ${typeOf(value)}, attendu ${types.join(' | ')}`];
  }
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${path} : ${JSON.stringify(value)} ≠ ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push(`${path} : ${JSON.stringify(value)} hors de l'énumération ${JSON.stringify(schema.enum)}`);
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && [...value].length < schema.minLength) errors.push(`${path} : longueur < ${schema.minLength}`);
    if (typeof schema.maxLength === 'number' && [...value].length > schema.maxLength) errors.push(`${path} : longueur > ${schema.maxLength}`);
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path} : ${JSON.stringify(value)} ne respecte pas ${schema.pattern}`);
    if (schema.format === 'date-time' && (!DATE_TIME.test(value) || Number.isNaN(Date.parse(value)))) errors.push(`${path} : date-time invalide ${JSON.stringify(value)}`);
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path} : ${value} < ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path} : ${value} > ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${path} : moins de ${schema.minItems} éléments`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path} : plus de ${schema.maxItems} éléments`);
    if (schema.items && typeof schema.items === 'object') value.forEach((v, i) => errors.push(...validateSchema(v, schema.items as Schema, root, `${path}[${i}]`)));
  }
  if (typeOf(value) === 'object') {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    for (const r of (schema.required ?? []) as string[]) if (!(r in obj)) errors.push(`${path} : propriété requise « ${r} » absente`);
    for (const [k, v] of Object.entries(obj)) {
      if (props[k]) errors.push(...validateSchema(v, props[k], root, `${path}.${k}`));
      else if (schema.additionalProperties === false) errors.push(`${path} : propriété inattendue « ${k} »`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        errors.push(...validateSchema(v, schema.additionalProperties as Schema, root, `${path}.${k}`));
      }
    }
  }

  if (Array.isArray(schema.allOf)) for (const s of schema.allOf as Schema[]) errors.push(...validateSchema(value, s, root, path));
  if (Array.isArray(schema.anyOf)) {
    const results = (schema.anyOf as Schema[]).map((s) => validateSchema(value, s, root, path));
    if (!results.some((r) => r.length === 0)) errors.push(`${path} : aucune branche anyOf ne correspond (${results.map((r) => r[0]).join(' ; ')})`);
  }
  if (Array.isArray(schema.oneOf)) {
    const results = (schema.oneOf as Schema[]).map((s) => validateSchema(value, s, root, path));
    const ok = results.filter((r) => r.length === 0).length;
    if (ok !== 1) errors.push(`${path} : ${ok} branche(s) oneOf correspondent au lieu d'une (${results.map((r) => r[0] ?? 'ok').join(' ; ')})`);
  }
  return errors;
}

type Operation = { responses: Record<string, unknown> };

/** Opération `method` du chemin OpenAPI `path` (ex. '/api/v1/deliveries/{id}/ack'). */
export function findOperation(spec: { paths: Record<string, unknown> }, path: string, method: string): Operation {
  const item = spec.paths[path] as Record<string, Operation> | undefined;
  const op = item?.[method.toLowerCase()];
  if (!op) throw new Error(`Opération absente de la spec : ${method.toUpperCase()} ${path}`);
  return op;
}

export interface ResponseCheck {
  errors: string[];
  /** Corps JSON lu (si la réponse est JSON). */
  body?: unknown;
}

/**
 * Vérifie une réponse contre l'opération : statut documenté (ou `default`), en-têtes `required`, type de contenu et
 * corps JSON conforme au schéma. Le corps n'est pas lu pour `text/event-stream` (voir `validateSseEvent`).
 */
export async function validateResponse(spec: { paths: Record<string, unknown> }, path: string, method: string, res: Response): Promise<ResponseCheck> {
  const op = findOperation(spec, path, method);
  const where = `${method.toUpperCase()} ${path} → ${res.status}`;
  const raw = op.responses[String(res.status)] ?? op.responses.default;
  if (!raw) return { errors: [`${where} : statut non documenté`] };
  const response = deref<{ headers?: Record<string, unknown>; content?: Record<string, { schema?: Schema }> }>(spec, raw);
  const errors: string[] = [];

  for (const [name, h] of Object.entries(response.headers ?? {})) {
    const header = deref<{ required?: boolean; schema?: Schema }>(spec, h);
    const got = res.headers.get(name);
    if (got === null) {
      if (header.required) errors.push(`${where} : en-tête requis « ${name} » absent`);
      continue;
    }
    if (header.schema) errors.push(...validateSchema(got, header.schema, spec, `${where} en-tête ${name}`));
  }

  const content = response.content;
  if (!content) {
    const text = await res.text();
    if (text) errors.push(`${where} : corps inattendu`);
    return { errors };
  }
  const contentType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
  const media = content[contentType];
  if (!media) return { errors: [...errors, `${where} : type de contenu « ${contentType} » non documenté (${Object.keys(content).join(', ')})`] };
  if (contentType !== 'application/json') return { errors };
  const body = await res.json();
  if (media.schema) errors.push(...validateSchema(body, media.schema, spec, where));
  return { errors, body };
}

/** Valide la charge `data:` d'un événement SSE contre le schéma déclaré dans `x-sse-events` de l'opération. */
export function validateSseEvent(spec: { paths: Record<string, unknown> }, path: string, event: string, data: unknown): string[] {
  const op = findOperation(spec, path, 'get');
  const media = deref<{ content?: Record<string, Record<string, unknown>> }>(spec, op.responses['200']).content?.['text/event-stream'];
  const schema = (media?.['x-sse-events'] as Record<string, Schema> | undefined)?.[event];
  if (!schema) return [`événement SSE « ${event} » non documenté`];
  return validateSchema(data, schema, spec, `SSE ${event}`);
}
