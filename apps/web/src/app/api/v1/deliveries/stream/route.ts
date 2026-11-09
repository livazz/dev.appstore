import type { PurchaseEvent } from '@wolleen/core';
import { authenticateGame } from '@/server/api-key';
import { ensureDevRetryLoop, markFetchedBySdk, takeOpenDeliveries } from '@/server/delivery';
import { CORS_HEADERS, corsPreflight, missingPlayerId, readPlayerId, unauthorized } from '@/server/delivery-http';
import { subscribe } from '@/server/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 15_000;

/**
 * GET /api/v1/deliveries/stream?player_id=… — Server-Sent Events.
 * Envoie d'abord l'arriéré (pending + delivered non acquittées), puis chaque nouvel achat en direct
 * (`event: purchase`, `id: <delivery_id>`, `data: <PurchaseEvent>`), et un commentaire `: ping` toutes les 15 s.
 */
export async function GET(req: Request) {
  ensureDevRetryLoop();
  const game = await authenticateGame(req);
  if (!game) return unauthorized();
  const playerId = readPlayerId(req);
  if (!playerId) return missingPlayerId();

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
      const unsubscribe = subscribe(game.id, playerId, (e) => {
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
        for (const e of await takeOpenDeliveries(game, playerId)) sendPurchase(e);
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
