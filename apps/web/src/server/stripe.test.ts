import { afterEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import {
  acceptsTestModeEvents,
  appOrigin,
  automaticTaxEnabled,
  chargeModel,
  getStripe,
  isSimulationAllowed,
  paymentsConfigProblem,
  verifyStripeEvent,
} from './stripe';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('configuration des paiements (CHK-PAY-10)', () => {
  it('hors production : simulation possible sans clé', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect(paymentsConfigProblem()).toBeNull();
    expect(isSimulationAllowed()).toBe(true);
  });

  it('production sans clé : simulation impossible, paiements indisponibles', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect(isSimulationAllowed()).toBe(false);
    expect(paymentsConfigProblem()).toBe('missing_key');
  });

  it('production avec clé de test : refusée sauf WOLLEEN_ALLOW_TEST_PAYMENTS=1', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const key of ['sk_test_123', 'rk_test_123']) {
      vi.stubEnv('STRIPE_SECRET_KEY', key);
      vi.stubEnv('WOLLEEN_ALLOW_TEST_PAYMENTS', '');
      expect(paymentsConfigProblem()).toBe('test_key_in_production');
      expect(() => getStripe()).toThrow(/test/i);
      expect(acceptsTestModeEvents()).toBe(false);
      vi.stubEnv('WOLLEEN_ALLOW_TEST_PAYMENTS', '1');
      expect(paymentsConfigProblem()).toBeNull();
      expect(acceptsTestModeEvents()).toBe(true);
    }
    vi.stubEnv('WOLLEEN_ALLOW_TEST_PAYMENTS', 'true'); // seule la valeur « 1 » compte
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    expect(paymentsConfigProblem()).toBe('test_key_in_production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_123');
    expect(paymentsConfigProblem()).toBeNull();
  });
});

describe('modèle de charge et TVA', () => {
  it('CHARGE_MODEL : destination par défaut, direct sur demande', () => {
    expect(chargeModel(undefined)).toBe('destination');
    expect(chargeModel('')).toBe('destination');
    expect(chargeModel('DIRECT')).toBe('direct');
    expect(chargeModel('n_importe_quoi')).toBe('destination');
  });

  it('Stripe Tax désactivé par défaut', () => {
    expect(automaticTaxEnabled(undefined)).toBe(false);
    expect(automaticTaxEnabled('true')).toBe(false);
    expect(automaticTaxEnabled('1')).toBe(true);
  });
});

describe('vérification des webhooks Stripe (CHK-PAY-06)', () => {
  const secret = 'whsec_unit';
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'ping', data: { object: {} } });

  it('accepte une signature récente sur le corps brut', () => {
    const sig = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(verifyStripeEvent(payload, sig, [secret])?.id).toBe('evt_1');
  });

  it('refuse une signature hors tolérance, absente, ou un autre secret', () => {
    const old = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) - 301 });
    expect(verifyStripeEvent(payload, old, [secret])).toBeNull();
    expect(verifyStripeEvent(payload, null, [secret])).toBeNull();
    expect(verifyStripeEvent(payload, Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_autre' }), [secret])).toBeNull();
    expect(verifyStripeEvent(payload, Stripe.webhooks.generateTestHeaderString({ payload, secret }), [])).toBeNull();
  });
});

describe('origine des URL de retour (CHK-PAY-05)', () => {
  it('APP_URL prioritaire ; obligatoire en production (jamais l’en-tête Host)', async () => {
    const req = new Request('https://attaquant.tld/api/checkout');
    vi.stubEnv('APP_URL', 'https://wolleen.example/');
    expect(await appOrigin(req)).toBe('https://wolleen.example');
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(appOrigin(req)).rejects.toThrow(/APP_URL/);
    vi.stubEnv('NODE_ENV', 'development');
    expect(await appOrigin(req)).toBe('https://attaquant.tld');
  });
});
