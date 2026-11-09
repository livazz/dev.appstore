import 'server-only';
import { z } from 'zod';
import { authSecretProblem } from './server/auth-config';

/*
 * Variables d'environnement côté serveur — point de validation unique (CHK-CFG-02, CHK-PAY-10, CHK-CFG-01).
 *
 * Usage :  import { env } from '@/env';   env.PLATFORM_FEE_BPS, env.paymentsMode, env.isProduction…
 *
 * - Démarrage : src/instrumentation.ts appelle validateEnv() → le serveur Next.js refuse de démarrer si la
 *   configuration est invalide (échec au boot, pas à la 1re requête), y compris le secret de session (auth-config.ts).
 * - Lecture : `env` est une vue typée de process.env, relue si process.env change (tests : vi.stubEnv). Elle ne lève
 *   jamais : la validation stricte a déjà eu lieu au démarrage ; une variable au format invalide y vaut « non définie ».
 *
 * Ne JAMAIS importer ce module dans un composant client : il contient des secrets.
 */

/** Une chaîne vide (`KEY=` dans un .env) vaut « non définie ». */
const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v),
  z.string().optional(),
);

const optionalUrl = (example: string) =>
  optionalString.refine((v) => v === undefined || z.string().url().safeParse(v).success, {
    message: `doit être une URL absolue (ex. ${example})`,
  });

const optionalFlag = optionalString.refine((v) => v === undefined || v === '0' || v === '1', { message: 'doit valoir 0 ou 1' });

const STRIPE_SECRET_RE = /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/;

const baseSchema = z.object({
  NODE_ENV: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined),
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  /** Positionné par Next.js pendant `next build` (phase-production-build). */
  NEXT_PHASE: optionalString,

  // Base de données : vide → PGlite embarqué (dev uniquement).
  DATABASE_URL: optionalString.refine((v) => v === undefined || /^postgres(ql)?:\/\//.test(v), {
    message: 'doit être une URL postgres:// ou postgresql://',
  }),

  // URL publique et sessions (Better Auth).
  APP_URL: optionalUrl('https://wolleen.com'),
  AUTH_SECRET: optionalString,
  BETTER_AUTH_SECRET: optionalString,
  BETTER_AUTH_URL: optionalUrl('https://wolleen.com'),
  BETTER_AUTH_TRUSTED_ORIGINS: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  APPLE_CLIENT_ID: optionalString,
  APPLE_CLIENT_SECRET: optionalString,
  APPLE_APP_BUNDLE_IDENTIFIER: optionalString,

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
  WOLLEEN_ALLOW_TEST_PAYMENTS: optionalFlag,
  /** destination (défaut) | direct — une valeur inconnue retombe sur destination (avertissement, cf. stripe.ts). */
  CHARGE_MODEL: optionalString,
  /** 1 = Stripe Tax activé (désactivé par défaut, choix TVA non tranché). */
  STRIPE_AUTOMATIC_TAX: optionalString,
  PLATFORM_FEE_BPS: z.preprocess(
    (v) => (v === undefined || (typeof v === 'string' && v.trim() === '') ? '500' : typeof v === 'string' ? v.trim() : v),
    z
      .string()
      .regex(/^\d+$/, 'doit être un entier (points de base, 500 = 5 %)')
      .transform(Number)
      .pipe(z.number().int().min(0, 'doit être ≥ 0').max(3000, 'doit être ≤ 3000 (30 %)')),
  ),
  /** Version des CGV acceptées au checkout, stockée sur chaque commande (preuve de consentement). */
  WOLLEEN_CGV_VERSION: optionalString,
  /** Ancien nom (module notifications) : utilisé seulement si WOLLEEN_CGV_VERSION est vide. */
  CGV_VERSION: optionalString,
  /** Lien des CGV dans les reçus (défaut : {APP_URL}/legal/cgv). */
  CGV_URL: optionalUrl('https://wolleen.com/legal/cgv'),

  // Tâches planifiées, e-mails, IA.
  CRON_SECRET: optionalString,
  RESEND_API_KEY: optionalString.refine((v) => v === undefined || v.startsWith('re_'), {
    message: 'doit commencer par re_',
  }),
  ANTHROPIC_API_KEY: optionalString.refine((v) => v === undefined || v.startsWith('sk-ant-'), {
    message: 'doit commencer par sk-ant-',
  }),

  // Points Wolleen (lus par loyalty-logic.ts ; valeurs invalides → défauts).
  LOYALTY_ENABLED: optionalString,
  LOYALTY_FEE_CENTS_PER_POINT: optionalString,
  LOYALTY_POINTS_TTL_DAYS: optionalString,
  LOYALTY_MAX_COST_BPS: optionalString,

  // Stockage des fichiers (uploads).
  WOLLEEN_STORAGE: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined),
    z.enum(['local', 's3']).default('local'),
  ),
  WOLLEEN_DATA_DIR: optionalString,
  S3_ENDPOINT: optionalUrl('https://<account_id>.eu.r2.cloudflarestorage.com'),
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_PUBLIC_URL: optionalUrl('https://cdn.wolleen.eu'),
  /** Copie publique de S3_PUBLIC_URL, lue par le rendu client des images (style-safety.ts → safeImageUrl). */
  NEXT_PUBLIC_S3_PUBLIC_URL: optionalUrl('https://cdn.wolleen.eu'),
});

/** Variables lues par ce module (sert aussi d'empreinte pour relire process.env quand il change). */
const KEYS = Object.keys(baseSchema.shape) as (keyof typeof baseSchema.shape)[];

const schema = baseSchema.superRefine((e, ctx) => {
  const prod = e.NODE_ENV === 'production';
  const fail = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  // Secret de session : mêmes règles que Better Auth (auth-config.ts) — obligatoire, ≥ 32 caractères, pas d'exemple.
  if (prod) {
    const problem = authSecretProblem({ NODE_ENV: 'production', AUTH_SECRET: e.AUTH_SECRET, BETTER_AUTH_SECRET: e.BETTER_AUTH_SECRET });
    if (problem) fail(e.BETTER_AUTH_SECRET ? 'BETTER_AUTH_SECRET' : 'AUTH_SECRET', problem);
  }

  if (!prod) return;

  // Pas de repli PGlite en production (CHK-CFG-01).
  if (!e.DATABASE_URL) fail('DATABASE_URL', 'obligatoire en production (PGlite embarqué réservé au développement)');

  // URL publique en HTTPS (retours Stripe, liens e-mail, cookies sécurisés).
  if (!e.APP_URL) fail('APP_URL', 'obligatoire en production (ex. https://wolleen.com)');
  else if (!e.APP_URL.startsWith('https://')) fail('APP_URL', 'doit être en https:// en production');
  if (e.BETTER_AUTH_URL && !e.BETTER_AUTH_URL.startsWith('https://')) fail('BETTER_AUTH_URL', 'doit être en https:// en production');

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

  // Les tâches planifiées (/api/cron/*, /api/checkout/expire) ne doivent pas être publiques.
  if (!e.CRON_SECRET) fail('CRON_SECRET', 'obligatoire en production (protège /api/cron/* et /api/checkout/expire)');
  else if (e.CRON_SECRET.length < 16) fail('CRON_SECRET', 'trop court (minimum 16 caractères)');

  // Stockage objet (Cloudflare R2 / S3).
  if (e.WOLLEEN_STORAGE === 's3') {
    for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_URL'] as const) {
      if (!e[k]) fail(k, 'obligatoire quand WOLLEEN_STORAGE=s3');
    }
    if (e.S3_PUBLIC_URL && !e.S3_PUBLIC_URL.startsWith('https://')) fail('S3_PUBLIC_URL', 'doit être en https:// en production');
    // Sans elle, les boutiques n'affichent pas les images servies par le bucket (safeImageUrl, rendu serveur et client).
    const norm = (v: string | undefined) => v?.replace(/\/+$/, '');
    if (!e.NEXT_PUBLIC_S3_PUBLIC_URL) fail('NEXT_PUBLIC_S3_PUBLIC_URL', 'obligatoire quand WOLLEEN_STORAGE=s3 (même valeur que S3_PUBLIC_URL)');
    else if (norm(e.NEXT_PUBLIC_S3_PUBLIC_URL) !== norm(e.S3_PUBLIC_URL)) fail('NEXT_PUBLIC_S3_PUBLIC_URL', 'doit valoir S3_PUBLIC_URL');
  }
});

type ParsedEnv = z.infer<typeof schema>;

export type PaymentsMode = 'live' | 'test' | 'simulation';

export type Env = ParsedEnv & {
  isProduction: boolean;
  /** live : sk_live_ ; test : sk_test_ (dev ou préproduction autorisée) ; simulation : pas de clé (dev uniquement). */
  paymentsMode: PaymentsMode;
};

type Source = Record<string, string | undefined>;

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

function withDerived(e: ParsedEnv): Env {
  const paymentsMode: PaymentsMode = !e.STRIPE_SECRET_KEY
    ? 'simulation'
    : /^(sk|rk)_live_/.test(e.STRIPE_SECRET_KEY)
      ? 'live'
      : 'test';
  return { ...e, isProduction: e.NODE_ENV === 'production', paymentsMode };
}

/** Valide un objet d'environnement (process.env par défaut). Lève EnvValidationError si invalide. */
export function parseEnv(source: Source = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const nodeEnv = typeof source.NODE_ENV === 'string' && source.NODE_ENV ? source.NODE_ENV : 'development';
    const issues = result.error.issues.map((i) => ({ variable: String(i.path[0] ?? '?'), message: i.message }));
    throw new EnvValidationError(nodeEnv, issues);
  }
  return withDerived(result.data);
}

/**
 * Pendant `next build` (NEXT_PHASE=phase-production-build, NODE_ENV=production), les secrets d'exécution
 * ne sont pas forcément disponibles (CI, image Docker) : on ne bloque pas la compilation, la validation
 * stricte a lieu au démarrage du serveur. SKIP_ENV_VALIDATION=1 permet aussi de contourner (outillage).
 */
function shouldSkipStrictValidation(source: Source): boolean {
  return source.NEXT_PHASE === 'phase-production-build' || source.SKIP_ENV_VALIDATION === '1';
}

/**
 * Validation stricte au démarrage (src/instrumentation.ts) : lève EnvValidationError si la configuration est
 * invalide — sauf pendant `next build` / SKIP_ENV_VALIDATION=1. Renvoie la configuration validée.
 */
export function validateEnv(source: Source = process.env): Env {
  if (shouldSkipStrictValidation(source)) return readEnv(source);
  return parseEnv(source);
}

const warned = new Set<string>();

/**
 * Lecture tolérante (ne lève jamais) : configuration stricte si elle est valide ; sinon les règles de production sont
 * ignorées (elles ont été vérifiées au démarrage) et une variable au format invalide vaut « non définie »
 * (avertissement, sans sa valeur).
 */
export function readEnv(source: Source = process.env): Env {
  const strict = schema.safeParse(source);
  if (strict.success) return withDerived(strict.data);
  const cleaned: Source = { ...source };
  for (let i = 0; i <= KEYS.length; i++) {
    const loose = baseSchema.safeParse(cleaned);
    if (loose.success) return withDerived(loose.data);
    for (const issue of loose.error.issues) {
      const k = String(issue.path[0] ?? '');
      if (!(k in cleaned)) continue;
      delete cleaned[k];
      const msg = `[env] ${k} ignorée : ${issue.message}`;
      if (!warned.has(msg)) {
        warned.add(msg);
        console.warn(msg);
      }
    }
  }
  return withDerived(baseSchema.parse({}));
}

let cache: { fingerprint: string; value: Env } | null = null;

function current(): Env {
  const fingerprint = KEYS.map((k) => process.env[k] ?? '\u0001').join('\u0000') + `\u0000${process.env.SKIP_ENV_VALIDATION ?? ''}`;
  if (cache?.fingerprint !== fingerprint) cache = { fingerprint, value: readEnv(process.env) };
  return cache.value;
}

/** Configuration serveur typée (vue de process.env, validée au démarrage par instrumentation.ts). */
export const env: Env = new Proxy({} as Env, {
  get: (_t, p) => Reflect.get(current(), p),
  has: (_t, p) => p in current(),
  ownKeys: () => Reflect.ownKeys(current()),
  getOwnPropertyDescriptor: (_t, p) => {
    const v = current();
    return p in v ? { value: Reflect.get(v, p), enumerable: true, configurable: true, writable: false } : undefined;
  },
});
