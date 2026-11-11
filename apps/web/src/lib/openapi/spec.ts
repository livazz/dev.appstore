import { ITEM_TYPES, SIGNATURE_HEADER, SIGNATURE_TOLERANCE_S, WEBHOOK_RETRY_SCHEDULE_MS } from '@devappstore/core';
import { DOCS_FACTS, formatDelay } from '@/lib/docs/facts';

/*
 * Spécification OpenAPI 3.1 de l'API publique /api/v1 de Dev AppStore, servie sur GET /api/openapi.json.
 *
 * Source de vérité : les routes `src/app/api/v1/**` et `server/{api-key,delivery-http,api-rate-limit}.ts`. Le test de
 * contrat (`app/api/v1/openapi-contract.test.ts`) appelle les vrais handlers et valide leurs réponses contre ce
 * document ; il vérifie aussi que chaque route et chaque méthode exportée y figure. Toute évolution de l'API doit
 * passer par ce fichier.
 *
 * Données pures (aucun accès base ni secret) : importable côté serveur comme dans les tests.
 */

export const OPENAPI_VERSION = '3.1.0';
/** Version du contrat de l'API v1 (pas celle des SDK). */
export const API_VERSION = '1.0.0';

export const ERROR_CODES = [
  'unauthorized',
  'player_token_required',
  'player_mismatch',
  'invalid_player_id',
  'invalid_json',
  'invalid_request',
  'method_disabled',
  'delivery_not_found',
  'link_request_not_found',
  'rate_limited',
  'too_many_streams',
] as const;
export type ApiErrorCode = (typeof ERROR_CODES)[number];

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const resp = (name: string) => ({ $ref: `#/components/responses/${name}` });

const CORS_RESPONSE_HEADERS = {
  'Access-Control-Allow-Origin': { $ref: '#/components/headers/AccessControlAllowOrigin' },
};

const json = (schema: object, extra: object = {}) => ({ 'application/json': { schema, ...extra } });

/** Réponse d'erreur JSON `{ error: { code, message } }` avec les en-têtes CORS. */
function errorResponse(description: string, codes: ApiErrorCode[], extraHeaders: object = {}) {
  const examples = Object.fromEntries(codes.map((code) => [code, { value: { error: { code, message: '…' } } }]));
  return {
    description: `${description} Codes possibles : ${codes.map((c) => `\`${c}\``).join(', ')}.`,
    headers: { ...CORS_RESPONSE_HEADERS, ...extraHeaders },
    content: json(ref('Error'), { examples }),
  };
}

const SECRET_OR_PUBLISHABLE = [{ secretKey: [] }, { publishableKey: [] }];
const SECRET_OR_PLAYER = [{ secretKey: [] }, { publishableKey: [], playerToken: [] }];

const playerIdQuery = (required: string) => ({
  name: 'player_id',
  in: 'query',
  required: false,
  description: `Identifiant du joueur dans votre jeu (1 à 200 caractères). ${required}`,
  schema: { type: 'string', minLength: 1, maxLength: 200 },
});

const preflight = (methods: string, operationId: string) => ({
  operationId,
  summary: 'Préflight CORS',
  description: `Réponse CORS sans authentification. Méthode(s) de cette route : ${methods}.`,
  tags: ['CORS'],
  security: [],
  responses: { '204': resp('Preflight') },
});

const retryList = WEBHOOK_RETRY_SCHEDULE_MS.map(formatDelay).join(', ');

export interface OpenApiOptions {
  /** Origine publique de Dev AppStore (APP_URL), sans « / » final. */
  serverUrl?: string;
}

export function buildOpenApiSpec({ serverUrl = 'https://devappstore.com' }: OpenApiOptions = {}) {
  const base = serverUrl.replace(/\/+$/, '');
  return {
    openapi: OPENAPI_VERSION,
    jsonSchemaDialect: 'https://spec.openapis.org/oas/3.1/dialect/base',
    info: {
      title: 'API Dev AppStore',
      version: API_VERSION,
      summary: 'Livraison automatique des achats in-app faits sur Dev AppStore.',
      description: [
        "API publique utilisée par les jeux (via le SDK, clé publique + jeton joueur) et par les serveurs des studios",
        '(clé secrète) : codes de liaison, livraisons en attente, flux temps réel (SSE), accusés de réception, révocation',
        "des jetons joueur. Les achats sont aussi poussés au serveur du studio par webhook signé (section `webhooks`).",
        '',
        '**Montants en centimes.** Toutes les réponses JSON sont en UTF-8, dates ISO 8601 (UTC).',
        '',
        '**Erreurs** : statut 4xx et corps `{ "error": { "code", "message" } }`. Fiez-vous à `code` (stable) ; `message`',
        'est un texte en français susceptible d’évoluer.',
        '',
        '**Limitation de débit** : par IP avant authentification puis par clé ; dépassement → 429 `rate_limited` avec',
        "l'en-tête `Retry-After` (secondes). Les flux SSE sont aussi plafonnés en connexions simultanées (429",
        '`too_many_streams`) et en durée (30 min, puis reconnexion).',
        '',
        "**CORS** : `Access-Control-Allow-Origin: *` sur toutes les routes (préflight compris), jamais",
        '`Access-Control-Allow-Credentials` : aucun cookie n’authentifie l’API. Aucune clé ni aucun jeton dans l’URL.',
        '',
        `Documentation : ${base}/docs/api — SDK JavaScript : \`npm i @devappstore/sdk\`.`,
      ].join('\n'),
      contact: { name: 'Dev AppStore', url: `${base}/docs` },
      termsOfService: `${base}/legal/cgu-studios`,
    },
    servers: [{ url: base, description: 'Dev AppStore' }],
    externalDocs: { description: 'Documentation développeur', url: `${base}/docs/api` },
    tags: [
      { name: 'Liaison', description: 'Lier le compte de jeu d’un joueur à son compte Dev AppStore.' },
      { name: 'Livraisons', description: 'Recevoir et acquitter les achats (et remboursements).' },
      { name: 'Jetons joueur', description: 'Révoquer les jetons joueur (appareils liés via la clé publique).' },
      { name: 'CORS', description: 'Préflights CORS.' },
    ],
    security: SECRET_OR_PUBLISHABLE,
    paths: {
      '/api/v1/link-codes': {
        post: {
          operationId: 'createLinkCode',
          tags: ['Liaison'],
          summary: 'Émettre un code de liaison',
          description: [
            `Émet un code (valable ${DOCS_FACTS.linkCodeTtlMin} min, usage unique) que le joueur saisit sur \`/games/{slug}/link\`.`,
            'Invalide le code encore actif du même joueur.',
            '',
            '- Clé **secrète** : la liaison créée est **vérifiée**.',
            "- Clé **publique** : la liaison est déclarative (« non vérifiée ») ; le SDK interroge ensuite",
            '  `GET /api/v1/link-requests/{link_request_id}` pour obtenir le jeton joueur.',
          ].join('\n'),
          security: SECRET_OR_PUBLISHABLE,
          requestBody: {
            required: true,
            content: json(ref('LinkCodeRequest'), { example: { player_id: 'player_42', player_name: 'NovaKnight' } }),
          },
          responses: {
            '200': {
              description: 'Code émis.',
              headers: { ...CORS_RESPONSE_HEADERS, 'Cache-Control': { $ref: '#/components/headers/NoStore' } },
              content: json(ref('LinkCode')),
            },
            '400': errorResponse('Corps invalide.', ['invalid_json', 'invalid_request']),
            '401': resp('Unauthorized'),
            '403': errorResponse('Liaison par code désactivée pour ce jeu (onglet Intégration).', ['method_disabled']),
            '429': resp('RateLimited'),
          },
        },
        options: preflight('POST', 'preflightLinkCodes'),
      },
      '/api/v1/link-requests/{id}': {
        get: {
          operationId: 'getLinkRequest',
          tags: ['Liaison'],
          summary: 'État d’une demande de liaison',
          description: [
            'Interrogée toutes les 2 à 5 s par le SDK après `POST /api/v1/link-codes`.',
            '',
            '- Clé **publique** : au premier appel après la saisie du code, `player_token` (`das_pt_…`) est délivré **une seule',
            "  fois** (`status: linked`) ; les appels suivants renvoient `claimed`. À conserver par le jeu et à envoyer dans",
            '  `DevAppStore-Player-Token`. Seules les demandes créées avec la clé publique sont visibles.',
            '- Clé **secrète** : statut seulement, jamais de jeton.',
          ].join('\n'),
          security: SECRET_OR_PUBLISHABLE,
          parameters: [
            { name: 'id', in: 'path', required: true, description: '`link_request_id` renvoyé par `POST /api/v1/link-codes`.', schema: { type: 'string', minLength: 1, maxLength: 64 } },
          ],
          responses: {
            '200': {
              description: 'État de la demande.',
              headers: { ...CORS_RESPONSE_HEADERS, 'Cache-Control': { $ref: '#/components/headers/NoStore' } },
              content: json(ref('LinkRequestStatus')),
            },
            '401': resp('Unauthorized'),
            '404': errorResponse('Demande inconnue pour ce jeu (ou créée avec la clé secrète, vue avec la clé publique).', ['link_request_not_found']),
            '429': resp('RateLimited'),
          },
        },
        options: preflight('GET', 'preflightLinkRequest'),
      },
      '/api/v1/deliveries': {
        get: {
          operationId: 'listDeliveries',
          tags: ['Livraisons'],
          summary: 'Livraisons ouvertes d’un joueur',
          description: [
            `Livraisons \`pending\` et \`delivered\` non acquittées (achats et remboursements), les plus anciennes d’abord, ${DOCS_FACTS.deliveriesPageSize} au maximum.`,
            'Pour un jeu sans webhook, lire une livraison `pending` la fait passer à `delivered` ; elle reste listée jusqu’à l’ack.',
            '',
            '- Clé **secrète** : `player_id` obligatoire.',
            '- Clé **publique** : jeton joueur obligatoire ; seulement les achats du joueur du jeton faits par le compte',
            '  Dev AppStore qui a lié l’appareil (`player_id` facultatif, et s’il est fourni il doit être celui du jeton).',
          ].join('\n'),
          security: SECRET_OR_PLAYER,
          parameters: [playerIdQuery('Obligatoire avec la clé secrète.')],
          responses: {
            '200': {
              description: 'Livraisons ouvertes.',
              headers: { ...CORS_RESPONSE_HEADERS, 'Cache-Control': { $ref: '#/components/headers/NoStore' } },
              content: json(ref('DeliveryList')),
            },
            '400': resp('InvalidPlayerId'),
            '401': resp('UnauthorizedOrPlayerToken'),
            '403': resp('PlayerMismatch'),
            '429': resp('RateLimited'),
          },
        },
        options: preflight('GET', 'preflightDeliveries'),
      },
      '/api/v1/deliveries/stream': {
        get: {
          operationId: 'streamDeliveries',
          tags: ['Livraisons'],
          summary: 'Flux temps réel des livraisons (SSE)',
          description: [
            'Server-Sent Events. Envoie `retry: 5000`, puis l’arriéré (comme `GET /api/v1/deliveries`), puis chaque nouvel',
            'événement en direct :',
            '',
            '```',
            'event: purchase',
            'id: <delivery_id>',
            'data: <PurchaseEvent en JSON sur une ligne>',
            '```',
            '',
            `et un commentaire \`: ping\` toutes les ${DOCS_FACTS.sseHeartbeatS} s. Le flux est fermé au bout de 30 min : reconnectez-vous`,
            '(l’arriéré est renvoyé, dédoublonnez par `delivery_id`). L’`EventSource` natif ne permet pas d’envoyer les en-têtes',
            'd’authentification : lisez le flux avec `fetch` (c’est ce que fait le SDK). Mêmes règles d’accès que',
            '`GET /api/v1/deliveries` ; les erreurs sont renvoyées en JSON avant l’ouverture du flux.',
          ].join('\n'),
          security: SECRET_OR_PLAYER,
          parameters: [
            playerIdQuery('Obligatoire avec la clé secrète.'),
            { name: 'Last-Event-ID', in: 'header', required: false, description: 'Accepté (CORS) ; l’arriéré complet est renvoyé à chaque connexion.', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Flux SSE ouvert.',
              headers: {
                ...CORS_RESPONSE_HEADERS,
                'Cache-Control': { description: '`no-cache, no-transform`.', schema: { type: 'string' } },
              },
              content: {
                'text/event-stream': {
                  schema: { type: 'string', description: 'Flux SSE ; chaque `data:` d’un événement `purchase` est un `PurchaseEvent`.' },
                  'x-sse-events': { purchase: ref('PurchaseEvent') },
                  example: `retry: 5000\n\nevent: purchase\nid: dlv_8Qw2nT0pXk3m\ndata: {"event":"purchase.completed","delivery_id":"dlv_8Qw2nT0pXk3m",…}\n\n: ping\n\n`,
                },
              },
            },
            '400': resp('InvalidPlayerId'),
            '401': resp('UnauthorizedOrPlayerToken'),
            '403': resp('PlayerMismatch'),
            '429': errorResponse('Trop de requêtes, ou trop de flux simultanés pour ce joueur ou cette clé.', ['rate_limited', 'too_many_streams'], {
              'Retry-After': { $ref: '#/components/headers/RetryAfter' },
            }),
          },
        },
        options: preflight('GET', 'preflightDeliveriesStream'),
      },
      '/api/v1/deliveries/{id}/ack': {
        post: {
          operationId: 'acknowledgeDelivery',
          tags: ['Livraisons'],
          summary: 'Acquitter une livraison',
          description: [
            'Confirme que le joueur a été crédité (ou que le remboursement a été traité) : la livraison passe à `acknowledged`',
            'et n’est plus proposée ni relancée. Aucun corps. **Idempotent.**',
            '',
            '- Clé **secrète** : toute livraison du jeu.',
            '- Clé **publique** : jeton joueur obligatoire ; seulement les livraisons du joueur du jeton achetées par son compte.',
          ].join('\n'),
          security: SECRET_OR_PLAYER,
          parameters: [
            { name: 'id', in: 'path', required: true, description: '`delivery_id` de l’événement.', schema: { type: 'string', minLength: 1, maxLength: 64 } },
            playerIdQuery('Facultatif ; avec la clé publique, doit être celui du jeton.'),
          ],
          responses: {
            '200': { description: 'Acquittée (ou déjà acquittée).', headers: CORS_RESPONSE_HEADERS, content: json(ref('Ok')) },
            '401': resp('UnauthorizedOrPlayerToken'),
            '403': resp('PlayerMismatch'),
            '404': errorResponse('Livraison inconnue pour ce jeu (ou pour ce joueur et ce compte, avec la clé publique).', ['delivery_not_found']),
            '429': resp('RateLimited'),
          },
        },
        options: preflight('POST', 'preflightAck'),
      },
      '/api/v1/player-tokens': {
        delete: {
          operationId: 'revokePlayerTokens',
          tags: ['Jetons joueur'],
          summary: 'Révoquer des jetons joueur',
          description: [
            '- Clé **publique** + `DevAppStore-Player-Token` : révoque ce jeton (« délier cet appareil ») → `revoked: 1`',
            '  (0 s’il l’était déjà).',
            '- Clé **secrète** + `player_id` : révoque tous les jetons actifs de ce joueur → `revoked: n`.',
          ].join('\n'),
          security: SECRET_OR_PLAYER,
          parameters: [playerIdQuery('Obligatoire avec la clé secrète, ignoré avec la clé publique.')],
          responses: {
            '200': { description: 'Jetons révoqués.', headers: CORS_RESPONSE_HEADERS, content: json(ref('RevokeResult')) },
            '400': resp('InvalidPlayerId'),
            '401': resp('UnauthorizedOrPlayerToken'),
            '429': resp('RateLimited'),
          },
        },
        options: preflight('DELETE', 'preflightPlayerTokens'),
      },
    },
    webhooks: {
      'purchase.completed': webhook('purchase.completed', 'Un achat est payé : créditez le joueur.'),
      'purchase.refunded': webhook(
        'purchase.refunded',
        "La commande `order_id` a été remboursée (remboursement, litige ou rétractation) : retirez l'objet **si cet `order_id` avait été crédité**, sinon ignorez l'événement. Acquittez (2xx) dans les deux cas.",
      ),
    },
    components: {
      securitySchemes: {
        secretKey: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'das_secret_…',
          description:
            'Clé **secrète** du jeu (`das_secret_…` ; anciennes `das_live_…` / `das_test_…` acceptées), serveur du studio uniquement, jamais dans le client. Accès à tout le jeu.',
        },
        publishableKey: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'das_pub_…',
          description:
            'Clé **publique** du jeu (`das_pub_…`, non secrète, embarquée dans le jeu). Seule : codes de liaison et échange d’une demande de liaison contre un jeton joueur. Avec `playerToken` : livraisons, flux, ack et révocation pour ce joueur uniquement.',
        },
        playerToken: {
          type: 'apiKey',
          in: 'header',
          name: 'DevAppStore-Player-Token',
          description: 'Jeton joueur `das_pt_…` délivré une fois par `GET /api/v1/link-requests/{id}` (clé publique). Révocable.',
        },
      },
      headers: {
        AccessControlAllowOrigin: { description: 'Toujours `*` (aucun cookie, jamais de credentials).', required: true, schema: { type: 'string', const: '*' } },
        RetryAfter: { description: 'Secondes à attendre avant de réessayer.', required: true, schema: { type: 'string', pattern: '^[1-9][0-9]*$' } },
        NoStore: { description: '`no-store`.', schema: { type: 'string' } },
      },
      responses: {
        Preflight: {
          description: 'Préflight CORS accepté.',
          headers: {
            'Access-Control-Allow-Origin': { $ref: '#/components/headers/AccessControlAllowOrigin' },
            'Access-Control-Allow-Methods': { required: true, schema: { type: 'string' }, example: 'GET, POST, DELETE, OPTIONS' },
            'Access-Control-Allow-Headers': { required: true, schema: { type: 'string' }, example: 'Authorization, Content-Type, Last-Event-ID, DevAppStore-Player-Token' },
            'Access-Control-Expose-Headers': { schema: { type: 'string' }, example: 'Retry-After' },
            'Access-Control-Max-Age': { schema: { type: 'string' }, example: '86400' },
          },
        },
        Unauthorized: errorResponse('Clé absente, inconnue, placée dans l’URL, ou jeu suspendu.', ['unauthorized']),
        UnauthorizedOrPlayerToken: errorResponse(
          'Clé absente ou invalide (`unauthorized`), ou clé publique sans jeton joueur valide (`player_token_required` : jeton absent ou révoqué, refaire la liaison).',
          ['unauthorized', 'player_token_required'],
        ),
        InvalidPlayerId: errorResponse('`player_id` absent, vide ou de plus de 200 caractères.', ['invalid_player_id']),
        PlayerMismatch: errorResponse('Avec la clé publique, `player_id` différent de celui du jeton joueur.', ['player_mismatch']),
        RateLimited: errorResponse('Trop de requêtes (par IP, par clé ou par route). Respectez `Retry-After`.', ['rate_limited'], {
          'Retry-After': { $ref: '#/components/headers/RetryAfter' },
        }),
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          additionalProperties: false,
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              additionalProperties: false,
              properties: {
                code: { type: 'string', enum: [...ERROR_CODES], description: 'Code stable, à utiliser dans votre code.' },
                message: { type: 'string', description: 'Explication en français (susceptible d’évoluer).' },
              },
            },
          },
        },
        LinkCodeRequest: {
          type: 'object',
          required: ['player_id'],
          properties: {
            player_id: { type: 'string', minLength: 1, maxLength: 128, description: 'Identifiant du joueur dans votre jeu (espaces de début et de fin retirés, caractères invisibles refusés).' },
            player_name: { type: ['string', 'null'], maxLength: 256, description: 'Pseudo affiché au joueur pour confirmer la liaison (nettoyé puis 64 caractères max).' },
          },
        },
        LinkCode: {
          type: 'object',
          required: ['code', 'expires_at', 'link_request_id', 'link_url', 'store_url', 'web_discount_percent'],
          additionalProperties: false,
          properties: {
            code: { type: 'string', pattern: '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$', example: 'K7QF-M2XA', description: 'Code à afficher dans le jeu.' },
            expires_at: { type: 'string', format: 'date-time' },
            link_request_id: { type: 'string', example: 'lnc_3f9Q…', description: 'À interroger sur `GET /api/v1/link-requests/{id}`.' },
            link_url: { type: 'string', format: 'uri', example: 'https://devappstore.com/games/crystal-clash/link', description: 'Page où le joueur saisit le code, à ouvrir dans son navigateur.' },
            store_url: { type: 'string', format: 'uri', example: 'https://devappstore.com/games/crystal-clash', description: 'Boutique web du jeu.' },
            web_discount_percent: { type: 'integer', minimum: 0, maximum: 99, example: 30, description: 'Plus forte réduction de la boutique web par rapport aux prix en jeu (prix barrés des articles actifs), en %. 0 si aucune. À afficher au joueur à côté du bouton de la boutique.' },
          },
        },
        LinkRequestStatus: {
          oneOf: [
            {
              title: 'pending',
              type: 'object',
              required: ['status', 'player_id', 'expires_at'],
              additionalProperties: false,
              properties: { status: { const: 'pending' }, player_id: { type: 'string' }, expires_at: { type: 'string', format: 'date-time' } },
            },
            {
              title: 'linked',
              type: 'object',
              required: ['status', 'player_id'],
              additionalProperties: false,
              properties: {
                status: { const: 'linked' },
                player_id: { type: 'string' },
                player_token: { type: 'string', pattern: '^das_pt_', description: 'Clé publique seulement, délivré une seule fois.' },
              },
            },
            {
              title: 'claimed',
              type: 'object',
              required: ['status', 'player_id'],
              additionalProperties: false,
              properties: { status: { const: 'claimed' }, player_id: { type: 'string' } },
              description: 'Jeton déjà délivré à un précédent appel (clé publique).',
            },
            {
              title: 'expired',
              type: 'object',
              required: ['status'],
              additionalProperties: false,
              properties: { status: { const: 'expired' } },
            },
          ],
        },
        PurchaseEvent: {
          type: 'object',
          description: 'Événement d’achat ou de remboursement. `delivery_id` sert de clé d’idempotence (identique sur tous les canaux).',
          required: ['event', 'delivery_id', 'order_id', 'game_id', 'player_id', 'product_id', 'item_type', 'quantity', 'amount_cents', 'currency', 'created_at'],
          additionalProperties: false,
          properties: {
            event: { type: 'string', enum: ['purchase.completed', 'purchase.refunded'] },
            delivery_id: { type: 'string', description: 'Identifiant de la livraison (propre au remboursement pour `purchase.refunded`).' },
            order_id: { type: 'string', description: 'Commande ; identique entre l’achat et son remboursement.' },
            game_id: { type: 'string' },
            player_id: { type: 'string' },
            product_id: { type: 'string', description: 'Identifiant produit de l’article (celui de votre catalogue).' },
            item_type: { type: 'string', enum: ITEM_TYPES.map((t) => t.value) },
            quantity: { type: 'integer', minimum: 1 },
            amount_cents: { type: 'integer', minimum: 0, description: 'Montant payé, en centimes.' },
            currency: { type: 'string', enum: ['EUR', 'USD', 'GBP'] },
            created_at: { type: 'string', format: 'date-time' },
          },
          example: {
            event: 'purchase.completed',
            delivery_id: 'dlv_8Qw2nT0pXk3m',
            order_id: 'ord_Jm4hV9cQ2s1d',
            game_id: 'gam_farm',
            player_id: 'player_42',
            product_id: 'gems_500',
            item_type: 'consumable',
            quantity: 1,
            amount_cents: 499,
            currency: 'EUR',
            created_at: '2026-11-09T10:15:00.000Z',
          },
        },
        DeliveryList: {
          type: 'object',
          required: ['data'],
          additionalProperties: false,
          properties: { data: { type: 'array', maxItems: DOCS_FACTS.deliveriesPageSize, items: ref('PurchaseEvent') } },
        },
        Ok: { type: 'object', required: ['ok'], additionalProperties: false, properties: { ok: { const: true } } },
        RevokeResult: {
          type: 'object',
          required: ['ok', 'revoked'],
          additionalProperties: false,
          properties: { ok: { const: true }, revoked: { type: 'integer', minimum: 0 } },
        },
      },
    },
  };
}

function webhook(event: string, summary: string) {
  return {
    post: {
      operationId: `webhook_${event.replace('.', '_')}`,
      summary: `Webhook ${event}`,
      description: [
        summary,
        '',
        'Envoyé en `POST` JSON à l’URL de webhook du jeu (onglet Intégration ; `https://` obligatoire en production, aucune',
        'redirection suivie). Vérifiez la signature sur le corps **brut** avant tout `JSON.parse` :',
        '',
        `\`${SIGNATURE_HEADER}: t=<unix>,v1=<hex>\` où \`v1 = HMAC-SHA256(secret du webhook, "<t>.<corps>")\` en hexadécimal.`,
        `Refusez une signature de plus de ${SIGNATURE_TOLERANCE_S / 60} min. Plusieurs \`v1\` peuvent être présents (rotation du secret) :`,
        'un seul doit correspondre. SDK : `verifyWebhookSignature` de `@devappstore/sdk/server`.',
        '',
        `Une réponse 2xx (sous ${DOCS_FACTS.webhookTimeoutS} s) marque la livraison \`delivered\`. Sinon, relances après ${retryList},`,
        'puis échec. Idempotence obligatoire sur `delivery_id` : un même événement peut être reçu plusieurs fois (et aussi',
        'par le SDK). L’ack via l’API est facultatif pour un jeu à webhook.',
      ].join('\n'),
      parameters: [
        { name: SIGNATURE_HEADER, in: 'header', required: true, schema: { type: 'string', pattern: '^t=\\d+(,v1=[0-9a-f]{64})+$' }, example: 't=1762683300,v1=5f2b…' },
        { name: DOCS_FACTS.deliveryHeader, in: 'header', required: false, description: 'Identifiant de la livraison (absent pour un événement de test).', schema: { type: 'string' } },
        { name: DOCS_FACTS.testHeader, in: 'header', required: false, description: '`1` pour l’événement de test envoyé depuis l’onglet Intégration (rien n’est enregistré).', schema: { type: 'string', const: '1' } },
        { name: 'User-Agent', in: 'header', required: false, schema: { type: 'string' }, example: 'DevAppStore-Webhooks/1.0' },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              allOf: [{ $ref: '#/components/schemas/PurchaseEvent' }, { type: 'object', properties: { event: { const: event } } }],
            },
          },
        },
      },
      security: [],
      responses: {
        '200': { description: 'Événement reçu (tout code 2xx convient) : livraison `delivered`.' },
        default: { description: 'Toute autre réponse, une redirection ou un délai dépassé : nouvelle tentative plus tard.' },
      },
    },
  };
}

export type OpenApiSpec = ReturnType<typeof buildOpenApiSpec>;
