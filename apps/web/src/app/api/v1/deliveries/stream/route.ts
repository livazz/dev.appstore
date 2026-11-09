import type { PurchaseEvent } from '@wolleen/core';
import { authenticateApi } from '@/server/api-key';
import { ensureDevRetryLoop, markFetchedBySdk, takeOpenDeliveries } from '@/server/delivery';
import { CORS_HEADERS, corsPreflight, resolvePlayerScope, unauthorized } from '@/server/delivery-http';
import { subscribe } from '@/server/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 15_000;

/**
 * GET /api/v1/deliveries/stream — Server-Sent Events.
 * Clé secrète : `?player_id=` obligatoire. Clé publique : jeton joueur obligatoire (`Wolleen-Player-Token`),
 * le flux ne porte que les achats du joueur du jeton faits par son compte Wolleen.
 * Envoie d'abord l'arriéré (pending + delivered non acquittées), puis chaque nouvel événement en direct
 * (`event: purchase`, `id: <delivery_id>`, `data: <PurchaseEvent>` — achat ou remboursement), et `: ping` toutes les 15 s.
 * La clé n'est jamais acceptée dans l'URL (EventSource natif : utiliser le SDK, qui lit le flux via fetch).
 */
export async function GET(req: Request) {
  ensureDevRetryLoop();
  const auth = await authenticateApi(req);
  if (!auth) return unauthorized();
  const target = resolvePlayerScope(auth, req, { requirePlayerId: true });
  if (!target.ok) return target.res;
  const playerId = target.playerId!;
  const buyer = target.scope?.userId;
  const game = auth.game;

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const sent = new Set<string>();
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const sendPurchase = (e: PurchaseEvent) => {
        if (sent.has(e.delivery_id)) return;
        sent.add(e.delivery_id);
        send(`event: purchase\nid: ${e.delivery_id}\ndata: ${JSON.stringify(e)}\n\n`);
      };

      // Abonnement AVANT la lecture de l'arriéré : aucun achat ne peut passer entre les deux.
      let backlogSent = false;
      const queued: PurchaseEvent[] = [];
      const unsubscribe = subscribe(game.id, playerId, (e, meta) => {
        if (buyer !== undefined && meta.userId !== buyer) return; // jeton joueur : seulement les achats de son compte
        if (!backlogSent) {
          queued.push(e);
          return;
        }
        sendPurchase(e);
        markFetchedBySdk(game, [e.delivery_id]).catch(() => {});
      });
      const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      };
      req.signal.addEventListener('abort', cleanup);

      send('retry: 5000\n\n');
      try {
        for (const e of await takeOpenDeliveries(game, playerId, 100, { userId: buyer })) sendPurchase(e);
      } catch (e) {
        console.error('[deliveries/stream] arriéré', e);
      }
      backlogSent = true;
      for (const e of queued) sendPurchase(e);
      if (queued.length) await markFetchedBySdk(game, queued.map((e) => e.delivery_id)).catch(() => {});
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

export function OPTIONS() {
  return corsPreflight();
}
