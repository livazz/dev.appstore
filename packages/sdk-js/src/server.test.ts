import { signPayload, type PurchaseEvent as CorePurchaseEvent, type PlayerLookupResponse as CoreLookup } from '@devappstore/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { constructWebhookEvent, signWebhookPayload, verifyWebhookSignature, WebhookSignatureError } from './server';
import type { PlayerLookupResponse, PurchaseEvent } from './types';

const body = JSON.stringify({ event: 'purchase.completed', delivery_id: 'dlv_1' });

describe('verifyWebhookSignature', () => {
  it('accepte une signature produite par Dev AppStore (@devappstore/core signPayload)', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyWebhookSignature(body, signPayload(body, 'whsec'), 'whsec')).toBe(true);
    expect(verifyWebhookSignature(new TextEncoder().encode(body), signPayload(body, 'whsec', now), 'whsec')).toBe(true);
  });

  it('refuse corps modifié, mauvais secret, en-tête absent ou malformé', () => {
    const h = signWebhookPayload(body, 'whsec');
    expect(verifyWebhookSignature(body + ' ', h, 'whsec')).toBe(false);
    expect(verifyWebhookSignature(body, h, 'autre')).toBe(false);
    expect(verifyWebhookSignature(body, null, 'whsec')).toBe(false);
    expect(verifyWebhookSignature(body, 'n/importe/quoi', 'whsec')).toBe(false);
    expect(verifyWebhookSignature(body, 't=abc,v1=00', 'whsec')).toBe(false);
  });

  it('refuse une signature trop ancienne (rejeu)', () => {
    const h = signWebhookPayload(body, 'whsec', 1000);
    expect(verifyWebhookSignature(body, h, 'whsec', { now: 1200 })).toBe(true);
    expect(verifyWebhookSignature(body, h, 'whsec', { now: 1301 })).toBe(false);
    expect(verifyWebhookSignature(body, h, 'whsec', { now: 1301, toleranceSec: 600 })).toBe(true);
  });

  it('accepte plusieurs v1 (rotation de secret)', () => {
    const t = 5000;
    const good = signWebhookPayload(body, 'nouveau', t).split('v1=')[1];
    expect(verifyWebhookSignature(body, `t=${t},v1=deadbeef,v1=${good}`, 'nouveau', { now: t })).toBe(true);
  });

  it('constructWebhookEvent renvoie l’événement ou lève une erreur', () => {
    expect(constructWebhookEvent(body, signWebhookPayload(body, 's'), 's')).toMatchObject({ delivery_id: 'dlv_1' });
    expect(() => constructWebhookEvent(body, 't=1,v1=00', 's')).toThrow(WebhookSignatureError);
  });
});

describe('types', () => {
  it('restent identiques à ceux de @devappstore/core', () => {
    expectTypeOf<PurchaseEvent>().toEqualTypeOf<CorePurchaseEvent>();
    expectTypeOf<PlayerLookupResponse>().toEqualTypeOf<CoreLookup>();
  });
});

describe('verifyLookupSignature (revue 2026-11, F5)', () => {
  it('accepte la signature d’un lookup Dev AppStore (@devappstore/core signLookup) et refuse un autre joueur', async () => {
    const { signLookup, signPayloadMulti, lookupSignedString } = await import('@devappstore/core');
    const { verifyLookupSignature, signLookupRequest } = await import('./server');
    const header = signLookup('player_42', 'whsec');
    expect(verifyLookupSignature('player_42', header, 'whsec')).toBe(true);
    expect(verifyLookupSignature('player_43', header, 'whsec')).toBe(false);
    expect(signLookupRequest('player_42', 'whsec', 1700000000)).toBe(signLookup('player_42', 'whsec', 1700000000));
    // Rotation : deux v1, l'ancien secret vérifie aussi.
    const both = signPayloadMulti(lookupSignedString('p'), ['nouveau', 'ancien']);
    expect(verifyLookupSignature('p', both, 'ancien')).toBe(true);
  });
  it('une signature de lookup ne vaut jamais signature de webhook (et inversement)', async () => {
    const { verifyLookupSignature } = await import('./server');
    const header = signPayload('player_42', 'whsec');
    expect(verifyLookupSignature('player_42', header, 'whsec')).toBe(false);
  });
});
