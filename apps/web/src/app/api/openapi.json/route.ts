import { env } from '@/env';
import { openApiResponse } from '@/lib/openapi/serve';

export const runtime = 'nodejs';

/**
 * GET /api/openapi.json — spécification OpenAPI 3.1 de l'API publique /api/v1 (et des webhooks sortants).
 * Cache public, lisible depuis n'importe quelle origine (Swagger UI, Postman, générateurs de clients).
 * Serveur annoncé : APP_URL, sinon l'origine de la requête (développement).
 */
export function GET(req: Request) {
  return openApiResponse(env.APP_URL || new URL(req.url).origin);
}
