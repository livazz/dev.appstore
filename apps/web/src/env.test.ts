import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env';

/** Configuration de production complète et valide (valeurs factices). */
const PROD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://wolleen:pw@ep-test.eu-central-1.aws.neon.tech/wolleen?sslmode=require',
  AUTH_SECRET: 'a'.repeat(64),
  APP_URL: 'https://wolleen.example',
  STRIPE_SECRET_KEY: 'sk_live_51Fake000000000000000000',
  STRIPE_WEBHOOK_SECRET: 'whsec_fake0000000000',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_fake',
  PLATFORM_FEE_BPS: '500',
  CRON_SECRET: 'c'.repeat(32),
} satisfies Record<string, string>;

function issuesOf(source: Record<string, string | undefined>): Record<string, string> {
  try {
    parseEnv(source);
  } catch (e) {
    expect(e).toBeInstanceOf(EnvValidationError);
    return Object.fromEntries((e as EnvValidationError).issues.map((i) => [i.variable, i.message]));
  }
  throw new Error('parseEnv aurait dû lever une erreur');
}

describe('parseEnv — développement', () => {
  it('accepte un environnement vide (PGlite, mode simulation, commission par défaut)', () => {
    const env = parseEnv({ NODE_ENV: 'development' });
    expect(env.isProduction).toBe(false);
    expect(env.paymentsMode).toBe('simulation');
    expect(env.PLATFORM_FEE_BPS).toBe(500);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.WOLLEEN_STORAGE).toBe('local');
  });

  it('accepte le .env.example tel quel (valeurs vides, AUTH_SECRET=change-me)', () => {
    const env = parseEnv({
      DATABASE_URL: '',
      AUTH_SECRET: 'change-me',
      APP_URL: 'http://localhost:3000',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '',
      PLATFORM_FEE_BPS: '500',
      STRIPE_CONNECT_WEBHOOK_SECRET: '',
      CRON_SECRET: '',
    });
    expect(env.NODE_ENV).toBe('development');
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.paymentsMode).toBe('simulation');
  });

  it('accepte une clé sk_test_ en dev', () => {
    expect(parseEnv({ NODE_ENV: 'development', STRIPE_SECRET_KEY: 'sk_test_abc' }).paymentsMode).toBe('test');
  });

  it('valide PLATFORM_FEE_BPS entre 0 et 3000 même en dev', () => {
    expect(parseEnv({ PLATFORM_FEE_BPS: '0' }).PLATFORM_FEE_BPS).toBe(0);
    expect(parseEnv({ PLATFORM_FEE_BPS: '3000' }).PLATFORM_FEE_BPS).toBe(3000);
    expect(issuesOf({ PLATFORM_FEE_BPS: '3001' })).toHaveProperty('PLATFORM_FEE_BPS');
    expect(issuesOf({ PLATFORM_FEE_BPS: '-1' })).toHaveProperty('PLATFORM_FEE_BPS');
    expect(issuesOf({ PLATFORM_FEE_BPS: '5.5' })).toHaveProperty('PLATFORM_FEE_BPS');
  });

  it('refuse les formats manifestement faux même en dev', () => {
    const issues = issuesOf({ DATABASE_URL: 'mysql://x', STRIPE_SECRET_KEY: 'pk_test_oops' });
    expect(issues).toHaveProperty('DATABASE_URL');
    expect(issues).toHaveProperty('STRIPE_SECRET_KEY');
  });
});

describe('parseEnv — production', () => {
  it('accepte une configuration de production complète', () => {
    const env = parseEnv(PROD);
    expect(env.isProduction).toBe(true);
    expect(env.paymentsMode).toBe('live');
  });

  it('refuse de démarrer sans secret', () => {
    const issues = issuesOf({ NODE_ENV: 'production' });
    for (const k of ['AUTH_SECRET', 'DATABASE_URL', 'APP_URL', 'STRIPE_SECRET_KEY', 'CRON_SECRET']) {
      expect(issues).toHaveProperty(k);
    }
  });

  it('refuse un AUTH_SECRET trop court ou d’exemple', () => {
    expect(issuesOf({ ...PROD, AUTH_SECRET: 'x'.repeat(31) }).AUTH_SECRET).toMatch(/trop court/);
    expect(issuesOf({ ...PROD, AUTH_SECRET: 'change-me' }).AUTH_SECRET).toMatch(/exemple/);
  });

  it('refuse une clé sk_test_ en production', () => {
    const issues = issuesOf({ ...PROD, STRIPE_SECRET_KEY: 'sk_test_abc', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_x' });
    expect(Object.keys(issues)).toEqual(['STRIPE_SECRET_KEY']);
    expect(issues.STRIPE_SECRET_KEY).toMatch(/sk_live_/);
  });

  it('accepte sk_test_ en préproduction avec WOLLEEN_ALLOW_TEST_PAYMENTS=1', () => {
    const env = parseEnv({
      ...PROD,
      STRIPE_SECRET_KEY: 'sk_test_abc',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_x',
      WOLLEEN_ALLOW_TEST_PAYMENTS: '1',
    });
    expect(env.paymentsMode).toBe('test');
  });

  it('interdit le mode simulation en production, même avec WOLLEEN_ALLOW_TEST_PAYMENTS=1', () => {
    const issues = issuesOf({ ...PROD, STRIPE_SECRET_KEY: '', WOLLEEN_ALLOW_TEST_PAYMENTS: '1' });
    expect(issues.STRIPE_SECRET_KEY).toMatch(/simulation/);
  });

  it('exige le secret du webhook Stripe et une APP_URL en https', () => {
    const issues = issuesOf({ ...PROD, STRIPE_WEBHOOK_SECRET: '', APP_URL: 'http://wolleen.example' });
    expect(issues).toHaveProperty('STRIPE_WEBHOOK_SECRET');
    expect(issues.APP_URL).toMatch(/https/);
  });

  it('exige la configuration S3/R2 quand WOLLEEN_STORAGE=s3', () => {
    expect(issuesOf({ ...PROD, WOLLEEN_STORAGE: 's3' })).toHaveProperty('S3_BUCKET');
  });

  it('produit un message clair qui ne divulgue aucune valeur secrète', () => {
    const secret = 'sk_test_SUPER_SECRET_VALUE';
    try {
      parseEnv({ ...PROD, STRIPE_SECRET_KEY: secret, AUTH_SECRET: 'tooshort' });
      throw new Error('aurait dû échouer');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/Configuration invalide \(NODE_ENV=production\)/);
      expect(msg).toMatch(/• STRIPE_SECRET_KEY/);
      expect(msg).toMatch(/• AUTH_SECRET/);
      expect(msg).not.toContain(secret);
      expect(msg).not.toContain('tooshort');
    }
  });
});
