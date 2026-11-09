import 'server-only';
import { z } from 'zod';

/*
 * Variables d'environnement côté serveur — lecture validée unique (CHK-CFG-02, CHK-PAY-10, CHK-CFG-01).
 *
 * Usage :  import { env } from '@/env';   env.PLATFORM_FEE_BPS, env.paymentsMode…
 *
 * INTÉGRATION (après fusion, voir docs/deploy.md § « Brancher env.ts ») :
 *  1. créer apps/web/src/instrumentation.ts :
 *       export async function register() {
 *         if (process.env.NEXT_RUNTIME === 'nodejs') await import('./env');
 *       }
 *     → le serveur Next.js refuse de démarrer si la configuration est invalide (échec au boot, pas à la 1re requête) ;
 *  2. remplacer progressivement les lectures `process.env.X` de src/server/* (stripe.ts, payments.ts,
 *     delivery-http.ts, storage.ts) et la config Better Auth par `env.X`.
 *
 * Ne JAMAIS importer ce module dans un composant client : il contient des secrets.
 */

/** Une chaîne vide (`KEY=` dans un .env) vaut « non définie ». */
const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v),
  z.string().optional(),
);

const STRIPE_SECRET_RE = /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/;
const PLACEHOLDER_SECRETS = new Set(['change-me', 'changeme', 'secret', 'dev-secret']);

const schema = z
  .object({
    NODE_ENV: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined),
      z.enum(['development', 'test', 'production']).default('development'),
    ),

    // Base de données : vide → PGlite embarqué (dev uniquement).
    DATABASE_URL: optionalString.refine((v) => v === undefined || /^postgres(ql)?:\/\//.test(v), {
      message: 'doit être une URL postgres:// ou postgresql://',
    }),

    // Sessions (Better Auth).
    AUTH_SECRET: optionalString,
    APP_URL: optionalString.refine((v) => v === undefined || z.string().url().safeParse(v).success, {
      message: 'doit être une URL absolue (ex. https://wolleen.com)',
    }),

    // Paiements.
    STRIPE_SECRET_KEY: optionalString.refine((v) => v === undefined || STRIPE_SECRET_RE.test(v), {
      message: 'format inattendu (attendu sk_live_…, sk_test_…, rk_live_… ou rk_test_…)',
    }),
    STRIPE_WEBHOOK_SECRET: optionalString.refine((v) => v === undefined || v.startsWith('whsec_'), {
      message: 'doit commencer par whsec_',
    }),
    STRIPE_CONNECT_WEBHOOK_SECRET: optionalString.refine((v) => v === undefined || v.startsWith('whsec_'), {
      message: 'doit commencer par whsec_',
    }),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString.refine((v) => v === undefined || /^pk_(test|live)_/.test(v), {
      message: 'doit commencer par pk_live_ ou pk_test_',
    }),
    WOLLEEN_ALLOW_TEST_PAYMENTS: optionalString.refine((v) => v === undefined || v === '0' || v === '1', {
      message: 'doit valoir 0 ou 1',
    }),
    PLATFORM_FEE_BPS: z.preprocess(
      (v) => (v === undefined || (typeof v === 'string' && v.trim() === '') ? '500' : v),
      z
        .string()
        .regex(/^\d+$/, 'doit être un entier (points de base, 500 = 5 %)')
        .transform(Number)
        .pipe(z.number().int().min(0, 'doit être ≥ 0').max(3000, 'doit être ≤ 3000 (30 %)')),
    ),

    // Tâches planifiées, e-mails, IA.
    CRON_SECRET: optionalString,
    RESEND_API_KEY: optionalString.refine((v) => v === undefined || v.startsWith('re_'), {
      message: 'doit commencer par re_',
    }),
    ANTHROPIC_API_KEY: optionalString.refine((v) => v === undefined || v.startsWith('sk-ant-'), {
      message: 'doit commencer par sk-ant-',
    }),

    // Stockage des fichiers (uploads).
    WOLLEEN_STORAGE: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined),
      z.enum(['local', 's3']).default('local'),
    ),
    WOLLEEN_DATA_DIR: optionalString,
    S3_ENDPOINT: optionalString,
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_PUBLIC_URL: optionalString,
  })
  .superRefine((e, ctx) => {
    const prod = e.NODE_ENV === 'production';
    const fail = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    // AUTH_SECRET : en production, obligatoire, ≥ 32 caractères, pas une valeur d'exemple.
    if (e.AUTH_SECRET !== undefined && PLACEHOLDER_SECRETS.has(e.AUTH_SECRET.toLowerCase()) && prod) {
      fail('AUTH_SECRET', 'valeur d’exemple interdite en production (générez-en une : openssl rand -hex 32)');
    } else if (prod && e.AUTH_SECRET === undefined) {
      fail('AUTH_SECRET', 'obligatoire en production (openssl rand -hex 32)');
    } else if (prod && e.AUTH_SECRET !== undefined && e.AUTH_SECRET.length < 32) {
      fail('AUTH_SECRET', `trop court (${e.AUTH_SECRET.length} caractères, minimum 32 en production)`);
    }

    if (!prod) return;

    // Pas de repli PGlite en production (CHK-CFG-01).
    if (!e.DATABASE_URL) fail('DATABASE_URL', 'obligatoire en production (PGlite embarqué réservé au développement)');

    // URL publique en HTTPS (retours Stripe, liens e-mail, cookies sécurisés).
    if (!e.APP_URL) fail('APP_URL', 'obligatoire en production (ex. https://wolleen.com)');
    else if (!e.APP_URL.startsWith('https://')) fail('APP_URL', 'doit être en https:// en production');

    // Paiements : mode simulation interdit, clé live exigée (CHK-PAY-10).
    const allowTest = e.WOLLEEN_ALLOW_TEST_PAYMENTS === '1';
    if (!e.STRIPE_SECRET_KEY) {
      fail('STRIPE_SECRET_KEY', 'obligatoire en production : le mode simulation (/checkout/mock) y est interdit');
    } else if (!/^(sk|rk)_live_/.test(e.STRIPE_SECRET_KEY) && !allowTest) {
      fail(
        'STRIPE_SECRET_KEY',
        'clé de test en production : utilisez sk_live_… (ou WOLLEEN_ALLOW_TEST_PAYMENTS=1 pour une préproduction)',
      );
    }
    if (e.STRIPE_SECRET_KEY && !e.STRIPE_WEBHOOK_SECRET) {
      fail('STRIPE_WEBHOOK_SECRET', 'obligatoire quand STRIPE_SECRET_KEY est défini (sinon aucun paiement ne serait confirmé)');
    }
    if (
      e.STRIPE_SECRET_KEY?.includes('_live_') &&
      e.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
      !e.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith('pk_live_')
    ) {
      fail('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'doit être une clé pk_live_ quand STRIPE_SECRET_KEY est live');
    }

    // Le cron de relance des livraisons ne doit pas être public.
    if (!e.CRON_SECRET) fail('CRON_SECRET', 'obligatoire en production (protège GET /api/cron/deliveries)');
    else if (e.CRON_SECRET.length < 16) fail('CRON_SECRET', 'trop court (minimum 16 caractères)');

    // Stockage objet (Cloudflare R2 / S3).
    if (e.WOLLEEN_STORAGE === 's3') {
      for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_URL'] as const) {
        if (!e[k]) fail(k, 'obligatoire quand WOLLEEN_STORAGE=s3');
      }
    }
  });

type ParsedEnv = z.infer<typeof schema>;

export type PaymentsMode = 'live' | 'test' | 'simulation';

export type Env = ParsedEnv & {
  isProduction: boolean;
  /** live : sk_live_ ; test : sk_test_ (dev ou préproduction autorisée) ; simulation : pas de clé (dev uniquement). */
  paymentsMode: PaymentsMode;
};

/** Erreur de configuration : liste les variables fautives, JAMAIS leurs valeurs. */
export class EnvValidationError extends Error {
  readonly issues: { variable: string; message: string }[];

  constructor(nodeEnv: string, issues: { variable: string; message: string }[]) {
    super(
      [
        `Configuration invalide (NODE_ENV=${nodeEnv}) : Wolleen refuse de démarrer.`,
        ...issues.map((i) => `  • ${i.variable} : ${i.message}`),
        'Corrigez les variables d’environnement (voir .env.example et docs/deploy.md § Variables).',
      ].join('\n'),
    );
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/** Valide un objet d'environnement (process.env par défaut). Lève EnvValidationError si invalide. */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const nodeEnv = typeof source.NODE_ENV === 'string' && source.NODE_ENV ? source.NODE_ENV : 'development';
    const issues = result.error.issues.map((i) => ({ variable: String(i.path[0] ?? '?'), message: i.message }));
    throw new EnvValidationError(nodeEnv, issues);
  }
  const e = result.data;
  const paymentsMode: PaymentsMode = !e.STRIPE_SECRET_KEY
    ? 'simulation'
    : /^(sk|rk)_live_/.test(e.STRIPE_SECRET_KEY)
      ? 'live'
      : 'test';
  return { ...e, isProduction: e.NODE_ENV === 'production', paymentsMode };
}

/**
 * Pendant `next build` (NEXT_PHASE=phase-production-build, NODE_ENV=production), les secrets d'exécution
 * ne sont pas forcément disponibles (CI, image Docker) : on ne bloque pas la compilation, la validation
 * stricte a lieu au démarrage du serveur. SKIP_ENV_VALIDATION=1 permet aussi de contourner (outillage).
 */
function shouldSkipStrictValidation(source: Record<string, string | undefined>): boolean {
  return source.NEXT_PHASE === 'phase-production-build' || source.SKIP_ENV_VALIDATION === '1';
}

function load(): Env {
  if (shouldSkipStrictValidation(process.env)) {
    try {
      return parseEnv(process.env);
    } catch {
      // Valeurs non validées, mais typées : uniquement pour la phase de build.
      return parseEnv({ ...process.env, NODE_ENV: 'development' });
    }
  }
  return parseEnv(process.env);
}

/** Configuration serveur validée et typée. */
export const env: Env = load();
