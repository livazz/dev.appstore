import { afterEach, describe, expect, it, vi } from 'vitest';
import { env, EnvValidationError, parseEnv, readEnv, validateEnv } from './env';

/** Configuration de production complète et valide (valeurs factices). */
const PROD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://devappstore:pw@ep-test.eu-central-1.aws.neon.tech/devappstore?sslmode=require',
  AUTH_SECRET: 'a'.repeat(64),
  APP_URL: 'https://devappstore.example',
  STRIPE_SECRET_KEY: 'sk_live_51Fake000000000000000000',
  STRIPE_WEBHOOK_SECRET: 'whsec_fake0000000000',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_fake',
  PLATFORM_FEE_BPS: '500',
  CRON_SECRET: 'c'.repeat(32),
  RESEND_API_KEY: 're_fake0000000000',
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
    expect(env.DEVAPPSTORE_STORAGE).toBe('local');
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

  it('accepte sk_test_ en préproduction avec DEVAPPSTORE_ALLOW_TEST_PAYMENTS=1', () => {
    const env = parseEnv({
      ...PROD,
      STRIPE_SECRET_KEY: 'sk_test_abc',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_x',
      DEVAPPSTORE_ALLOW_TEST_PAYMENTS: '1',
    });
    expect(env.paymentsMode).toBe('test');
  });

  it('interdit le mode simulation en production, même avec DEVAPPSTORE_ALLOW_TEST_PAYMENTS=1', () => {
    const issues = issuesOf({ ...PROD, STRIPE_SECRET_KEY: '', DEVAPPSTORE_ALLOW_TEST_PAYMENTS: '1' });
    expect(issues.STRIPE_SECRET_KEY).toMatch(/simulation/);
  });

  it('exige le secret du webhook Stripe et une APP_URL en https', () => {
    const issues = issuesOf({ ...PROD, STRIPE_WEBHOOK_SECRET: '', APP_URL: 'http://devappstore.example' });
    expect(issues).toHaveProperty('STRIPE_WEBHOOK_SECRET');
    expect(issues.APP_URL).toMatch(/https/);
  });

  it('exige la configuration S3/R2 quand DEVAPPSTORE_STORAGE=s3', () => {
    expect(issuesOf({ ...PROD, DEVAPPSTORE_STORAGE: 's3' })).toHaveProperty('S3_BUCKET');
    const s3 = {
      ...PROD, DEVAPPSTORE_STORAGE: 's3', S3_ENDPOINT: 'https://acc.eu.r2.cloudflarestorage.com', S3_BUCKET: 'b',
      S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's', S3_PUBLIC_URL: 'https://cdn.devappstore.example',
    };
    // Copie publique obligatoire (rendu client des images, safeImageUrl) et identique à S3_PUBLIC_URL.
    expect(issuesOf(s3)).toHaveProperty('NEXT_PUBLIC_S3_PUBLIC_URL');
    expect(issuesOf({ ...s3, NEXT_PUBLIC_S3_PUBLIC_URL: 'https://autre.example' })).toHaveProperty('NEXT_PUBLIC_S3_PUBLIC_URL');
    expect(() => parseEnv({ ...s3, NEXT_PUBLIC_S3_PUBLIC_URL: 'https://cdn.devappstore.example/' })).not.toThrow();
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

describe('validateEnv — démarrage (instrumentation.ts)', () => {
  it('stricte au démarrage, sautée pendant next build', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(EnvValidationError);
    expect(validateEnv({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' }).isProduction).toBe(true);
    expect(validateEnv(PROD).paymentsMode).toBe('live');
  });

  it('applique au secret de session les règles de Better Auth (BETTER_AUTH_SECRET prioritaire)', () => {
    expect(parseEnv({ ...PROD, AUTH_SECRET: '', BETTER_AUTH_SECRET: 'b'.repeat(40) }).isProduction).toBe(true);
    expect(issuesOf({ ...PROD, AUTH_SECRET: '', BETTER_AUTH_SECRET: 'court' })).toHaveProperty('BETTER_AUTH_SECRET');
    expect(issuesOf({ ...PROD, AUTH_SECRET: 'devappstore-dev-secret-ne-pas-utiliser-en-production-0123456789' }).AUTH_SECRET).toMatch(/exemple/);
  });
});

describe('revue de sécurité : NODE_ENV, SKIP_ENV_VALIDATION, transport des e-mails', () => {
  it('C-11 : refuse un NODE_ENV inconnu au démarrage, et le traite comme la production à la lecture', () => {
    for (const v of ['prod', 'staging', 'Production']) {
      expect(issuesOf({ ...PROD, NODE_ENV: v }).NODE_ENV).toMatch(/valeur inconnue/);
      expect(() => validateEnv({ ...PROD, NODE_ENV: v, SKIP_ENV_VALIDATION: '1' })).toThrow(EnvValidationError);
      const e = readEnv({ NODE_ENV: v });
      expect(e.NODE_ENV).toBe('production');
      expect(e.isProduction).toBe(true);
    }
  });

  it('A-10 : SKIP_ENV_VALIDATION=1 est ignorée en production, acceptée en développement et en test', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', SKIP_ENV_VALIDATION: '1' })).toThrow(EnvValidationError);
    expect(validateEnv({ NODE_ENV: 'development', SKIP_ENV_VALIDATION: '1', STRIPE_SECRET_KEY: 'oops' }).paymentsMode).toBe('simulation');
    expect(validateEnv({ NODE_ENV: 'test', SKIP_ENV_VALIDATION: '1' }).NODE_ENV).toBe('test');
    // La compilation (next build) reste possible sans secrets.
    expect(validateEnv({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build', SKIP_ENV_VALIDATION: '1' }).isProduction).toBe(true);
  });

  it('C-02 : refuse le transport console en production (explicite ou par défaut, sans RESEND_API_KEY)', () => {
    expect(issuesOf({ ...PROD, MAIL_TRANSPORT: 'console' }).MAIL_TRANSPORT).toMatch(/console interdit/);
    expect(issuesOf({ ...PROD, MAIL_TRANSPORT: 'Console' }).MAIL_TRANSPORT).toMatch(/console interdit/);
    expect(issuesOf({ ...PROD, RESEND_API_KEY: '' })).toHaveProperty('RESEND_API_KEY');
    expect(issuesOf({ ...PROD, RESEND_API_KEY: '', MAIL_TRANSPORT: 'resend' })).toHaveProperty('RESEND_API_KEY');
    expect(parseEnv({ ...PROD, MAIL_TRANSPORT: 'resend' }).MAIL_TRANSPORT).toBe('resend');
    expect(issuesOf({ NODE_ENV: 'development', MAIL_TRANSPORT: 'smtp' })).toHaveProperty('MAIL_TRANSPORT');
    expect(parseEnv({ NODE_ENV: 'development', MAIL_TRANSPORT: 'console' }).MAIL_TRANSPORT).toBe('console');
  });
});

describe('env — lecture à l’exécution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('readEnv ne lève jamais : règles de production ignorées, format invalide = non définie', () => {
    const e = readEnv({ NODE_ENV: 'production', STRIPE_SECRET_KEY: 'pk_test_oops', PLATFORM_FEE_BPS: '250' });
    expect(e.isProduction).toBe(true);
    expect(e.STRIPE_SECRET_KEY).toBeUndefined();
    expect(e.paymentsMode).toBe('simulation');
    expect(e.PLATFORM_FEE_BPS).toBe(250);
  });

  it('`env` suit process.env (vi.stubEnv) et expose les valeurs typées', () => {
    vi.stubEnv('PLATFORM_FEE_BPS', '700');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_abc');
    expect(env.PLATFORM_FEE_BPS).toBe(700);
    expect(env.paymentsMode).toBe('test');
    vi.stubEnv('PLATFORM_FEE_BPS', '');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect(env.PLATFORM_FEE_BPS).toBe(500);
    expect(env.paymentsMode).toBe('simulation');
    expect({ ...env }.PLATFORM_FEE_BPS).toBe(500);
  });
});
