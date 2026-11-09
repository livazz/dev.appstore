/*
 * Appels à l'API publique /api/v1 « comme le ferait le jeu » (Authorization: Bearer <clé API du jeu>).
 */
import { expect, type APIRequestContext } from '@playwright/test';
import { BASE_URL, DEMO_GAME_URL } from './env';
import { demoKeys, type DemoGameKey } from './demo-data';

/** Événement d'achat tel que reçu par le jeu (PurchaseEvent de @devappstore/core, champs utiles aux tests). */
export interface PurchaseEvent {
  event: string;
  delivery_id: string;
  order_id: string;
  game_id: string;
  player_id: string;
  product_id: string;
  quantity: number;
}

const auth = (game: DemoGameKey) => ({ authorization: `Bearer ${demoKeys()[game].apiKey}` });

export class ApiJeu {
  constructor(
    private readonly request: APIRequestContext,
    private readonly game: DemoGameKey,
  ) {}

  /** POST /api/v1/link-codes → code de liaison à saisir sur /games/[slug]/link. */
  async creerCodeLiaison(playerId: string, playerName?: string): Promise<{ code: string; expires_at: string }> {
    const res = await this.request.post(`${BASE_URL}/api/v1/link-codes`, {
      headers: auth(this.game),
      data: { player_id: playerId, ...(playerName ? { player_name: playerName } : {}) },
    });
    expect(res.status(), `POST /api/v1/link-codes : ${await res.text()}`).toBe(200);
    const body = (await res.json()) as { code: string; expires_at: string };
    expect(body.code).toBeTruthy();
    return body;
  }

  /** GET /api/v1/deliveries?player_id=… → livraisons en attente (pending + delivered non acquittées). */
  async livraisons(playerId: string): Promise<PurchaseEvent[]> {
    const res = await this.request.get(`${BASE_URL}/api/v1/deliveries`, {
      headers: auth(this.game),
      params: { player_id: playerId },
    });
    expect(res.status(), `GET /api/v1/deliveries : ${await res.text()}`).toBe(200);
    return ((await res.json()) as { data: PurchaseEvent[] }).data;
  }

  /** Attend (sans recharger quoi que ce soit) qu'une livraison du produit arrive pour ce joueur. */
  async attendreLivraison(playerId: string, productId: string, timeout = 30_000): Promise<PurchaseEvent> {
    let found: PurchaseEvent | undefined;
    await expect
      .poll(
        async () => {
          found = (await this.livraisons(playerId)).find((e) => e.product_id === productId);
          return Boolean(found);
        },
        { message: `livraison ${productId} pour ${playerId}`, timeout, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    return found!;
  }

  /** POST /api/v1/deliveries/{id}/ack — le jeu confirme avoir crédité le joueur. */
  async acquitter(deliveryId: string): Promise<void> {
    const res = await this.request.post(`${BASE_URL}/api/v1/deliveries/${encodeURIComponent(deliveryId)}/ack`, { headers: auth(this.game) });
    expect(res.status(), `ack ${deliveryId} : ${await res.text()}`).toBe(200);
  }
}

/** Inventaire du joueur côté serveur du jeu de démo (GET /api/state de apps/demo-game). */
export async function inventaireJeuDemo(
  request: APIRequestContext,
  game: DemoGameKey,
  playerId: string,
): Promise<Record<string, number>> {
  const res = await request.get(`${DEMO_GAME_URL}/api/state`, { params: { game, player: playerId } });
  expect(res.ok(), `GET ${DEMO_GAME_URL}/api/state`).toBe(true);
  return ((await res.json()) as { inventory: Record<string, number> }).inventory;
}
