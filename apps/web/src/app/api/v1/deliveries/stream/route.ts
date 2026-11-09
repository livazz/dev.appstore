import type { PurchaseEvent } from '@devappstore/core';
import { STREAM_LIMITS, acquireStreamSlot, guardApi } from '@/server/api-rate-limit';
import { ensureDevRetryLoop, markFetchedBySdk, takeOpenDeliveries } from '@/server/delivery';
import { CORS_HEADERS, corsPreflight, resolvePlayerScope } from '@/server/delivery-http';
import { subscribe } from '@/server/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 15_000;
/** Rattrapage périodique en base (notification inter-instances perdue). */
const STREAM_RESYNC_MS = 5 * 60_000;

/**
 * GET /api/v1/deliveries/stream — Server-Sent Events.
 * Clé secrète : `?player_id=` obligatoire. Clé publique : jeton joueur obligatoire (`DevAppStore-Player-Token`),
 * le flux ne porte que les achats du joueur du jeton faits par son compte Dev AppStore.
 * Multi-instance : les achats confirmés sur une autre instance arrivent par LISTEN/NOTIFY (`@/server/events`) ; le flux
 * refait un rattrapage en base à chaque reconnexion de l'écoute et toutes les 5 min.
 * Envoie d'abord l'arriéré (pending + delivered non acquittées), puis chaque nouvel événement en direct
 * (`event: purchase`, `id: <delivery_id>`, `data: <PurchaseEvent>` — achat ou remboursement), et `: ping` toutes les 15 s.
 * La clé n'est jamais acceptée dans l'URL (EventSource natif : utiliser le SDK, qui lit le flux via fetch).
 * Limites : débit par IP et par clé (guardApi), flux simultanés par joueur et par clé (429 `too_many_streams`),
 * durée maximale STREAM_LIMITS.maxDurationMs (le flux est fermé, le client se reconnecte et rattrape l'arriéré).
 */
export async function GET(req: Request) {
  ensureDevRetryLoop();
  const guard = await guardApi(req, 'stream');
  if (!guard.ok) return guard.res;
  const auth = guard.auth;
  const target = resolvePlayerScope(auth, req, { requirePlayerId: true });
  if (!target.ok) return target.res;
  const playerId = target.playerId!;
  const buyer = target.scope?.userId;
  const game = auth.game;

  const slot = acquireStreamSlot(auth, playerId);
  if (!slot.ok) return slot.res;
  const encoder = new TextEncoder();
  // Libère la place même si le flux se termine avant que `start` ait posé le nettoyage complet.
  let cleanup = slot.release;

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

      // Rattrapage en base (arriéré : pending + delivered non acquittées). Coalescent : une demande pendant une
      // lecture en cours relance une lecture à la fin (les doublons sont filtrés par `sent`).
      let catchingUp: Promise<void> | null = null;
      let again = false;
      const catchUp = (): Promise<void> => {
        if (catchingUp) {
          again = true;
          return catchingUp;
        }
        catchingUp = (async () => {
          do {
            again = false;
            try {
              for (const e of await takeOpenDeliveries(game, playerId, 100, { userId: buyer })) sendPurchase(e);
            } catch (e) {
              console.error('[deliveries/stream] arriéré', e);
            }
          } while (again && !closed);
        })().finally(() => {
          catchingUp = null;
        });
        return catchingUp;
      };

      // Abonnement AVANT la lecture de l'arriéré : aucun achat ne peut passer entre les deux. Les événements
      // d'une autre instance arrivent par le même abonnement (bus multi-instance, LISTEN/NOTIFY) ; quand l'écoute
      // inter-instances est rétablie après une coupure, `onResync` relance un rattrapage en base.
      let backlogSent = false;
      const queued: PurchaseEvent[] = [];
      const unsubscribe = subscribe(
        game.id,
        playerId,
        (e, meta) => {
          if (buyer !== undefined && meta.userId !== buyer) return; // jeton joueur : seulement les achats de son compte
          if (!backlogSent) {
            queued.push(e);
            return;
          }
          sendPurchase(e);
          markFetchedBySdk(game, [e.delivery_id]).catch(() => {});
        },
        { onResync: () => void catchUp() },
      );
      const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
      // Filet de sécurité multi-instance : un NOTIFY perdu (émetteur coupé) est rattrapé au plus tard ici.
      const resync = setInterval(() => void catchUp(), STREAM_RESYNC_MS);
      const maxDuration = setTimeout(() => cleanup(), STREAM_LIMITS.maxDurationMs);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearInterval(resync);
        clearTimeout(maxDuration);
        slot.release();
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      };
      req.signal.addEventListener('abort', cleanup);

      send('retry: 5000\n\n');
      await catchUp();
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
