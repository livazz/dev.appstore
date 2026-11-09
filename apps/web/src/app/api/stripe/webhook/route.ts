import { handleStripeEvent } from '@/server/payments';
import { verifyStripeEvent, webhookSecrets } from '@/server/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * POST /api/stripe/webhook — événements Stripe signés (`Stripe-Signature`, secret STRIPE_WEBHOOK_SECRET).
 * checkout.session.completed / async_payment_succeeded → markOrderPaid (idempotent) ;
 * checkout.session.expired / async_payment_failed → commande failed ; account.updated → stripeChargesEnabled.
 * 400 si la signature est absente ou invalide ; 500 si le traitement échoue (Stripe réessaiera).
 */
export async function POST(req: Request) {
  const secrets = webhookSecrets();
  if (secrets.length === 0) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET non défini.');
    return error(500, 'webhook_not_configured', 'Webhook Stripe non configuré.');
  }
  const payload = await req.text();
  const event = verifyStripeEvent(payload, req.headers.get('stripe-signature'), secrets);
  if (!event) return error(400, 'invalid_signature', 'Signature Stripe absente ou invalide.');

  try {
    const result = await handleStripeEvent(event);
    if (!result.handled) console.info(`[stripe-webhook] ${event.type} ${event.id} : ${result.detail}`);
    return Response.json({ received: true, handled: result.handled });
  } catch (e) {
    console.error(`[stripe-webhook] Échec du traitement de ${event.type} ${event.id}`, e);
    return error(500, 'processing_failed', 'Traitement de l’événement impossible.');
  }
}
