import { processStripeEvent } from '@/server/payments';
import { verifyStripeEvent, webhookSecrets } from '@/server/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Les événements Stripe font quelques Ko : au-delà, refus sans traitement. */
const MAX_BODY_BYTES = 1024 * 1024;

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * POST /api/stripe/webhook — événements Stripe signés (`Stripe-Signature`, secret STRIPE_WEBHOOK_SECRET).
 * La signature est vérifiée sur le corps BRUT (`req.text()`, jamais re-sérialisé) avec une tolérance d'horodatage
 * de 300 s ; chaque event.id n'est traité qu'une fois (table stripe_events).
 * checkout.session.completed / async_payment_succeeded → contrôle montant/devise puis markOrderPaid (idempotent) ;
 * checkout.session.expired / async_payment_failed → commande failed ; charge.refunded / charge.dispute.created →
 * commande refunded (+ enqueueRefund) ; account.updated → stripeChargesEnabled.
 * 400 si la signature est absente, invalide ou trop ancienne ; 500 si le traitement échoue (Stripe réessaiera).
 */
export async function POST(req: Request) {
  const secrets = webhookSecrets();
  if (secrets.length === 0) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET non défini.');
    return error(500, 'webhook_not_configured', 'Webhook Stripe non configuré.');
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return error(413, 'payload_too_large', 'Corps trop volumineux.');
  const payload = await req.text();
  if (payload.length > MAX_BODY_BYTES) return error(413, 'payload_too_large', 'Corps trop volumineux.');
  const event = verifyStripeEvent(payload, req.headers.get('stripe-signature'), secrets);
  if (!event) return error(400, 'invalid_signature', 'Signature Stripe absente ou invalide.');

  try {
    const result = await processStripeEvent(event);
    if (!result.handled) console.info(`[stripe-webhook] ${event.type} ${event.id} : ${result.detail}`);
    return Response.json({ received: true, handled: result.handled, ...(result.duplicate ? { duplicate: true } : {}) });
  } catch (e) {
    console.error(`[stripe-webhook] Échec du traitement de ${event.type} ${event.id}`, e instanceof Error ? e.message : 'erreur inconnue');
    return error(500, 'processing_failed', 'Traitement de l’événement impossible.');
  }
}
