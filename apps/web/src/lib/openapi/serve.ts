import { buildOpenApiSpec } from './spec';

/** Cache public : document identique pour tous, sans aucun secret. */
export const OPENAPI_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

/** Chemin public de la spécification (lien de téléchargement de /docs/api). */
export const OPENAPI_PATH = '/api/openapi.json';

/** Réponse HTTP de GET /api/openapi.json. */
export function openApiResponse(serverUrl: string) {
  return new Response(JSON.stringify(buildOpenApiSpec({ serverUrl }), null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': OPENAPI_CACHE_CONTROL,
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  });
}
