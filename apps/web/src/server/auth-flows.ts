import 'server-only';
import { z } from 'zod';
import { newId, slugify } from '@wolleen/core';
import { db, eq, ilike, or, studioMembers, studios, type DB } from '@wolleen/db';
import { auth as defaultAuth, PASSWORD_MIN_LENGTH, type Auth } from './auth';
import { AUTH_RATE_LIMITS, authLimiter, clientIp, type SlidingWindowLimiter } from './auth-rate-limit';

/*
 * Logique serveur des formulaires /login, /signup et /studio/signup (tâche « auth »).
 * Indépendante de Next.js (sauf via le plugin nextCookies de Better Auth) pour être testable avec une base en mémoire.
 */

export type FieldName = 'name' | 'email' | 'password' | 'studioName';

export interface AuthFormResult {
  ok: boolean;
  /** Message global (en français), affiché en tête de formulaire. */
  error?: string;
  /** Erreurs par champ (en français). */
  fieldErrors?: Partial<Record<FieldName, string>>;
}

const email = z
  .string({ required_error: 'Saisissez votre adresse e-mail.' })
  .trim()
  .toLowerCase()
  .min(1, 'Saisissez votre adresse e-mail.')
  .max(254, 'Adresse e-mail trop longue.')
  .email('Adresse e-mail invalide.');
const password = z
  .string({ required_error: 'Saisissez un mot de passe.' })
  .min(PASSWORD_MIN_LENGTH, `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`)
  .max(128, 'Le mot de passe ne doit pas dépasser 128 caractères.');
const name = z
  .string({ required_error: 'Saisissez votre nom.' })
  .trim()
  .min(1, 'Saisissez votre nom.')
  .max(80, 'Le nom ne doit pas dépasser 80 caractères.');
const studioName = z
  .string({ required_error: 'Saisissez le nom du studio.' })
  .trim()
  .min(2, 'Le nom du studio doit contenir au moins 2 caractères.')
  .max(60, 'Le nom du studio ne doit pas dépasser 60 caractères.');

export const signInSchema = z.object({
  email,
  password: z
    .string({ required_error: 'Saisissez votre mot de passe.' })
    .min(1, 'Saisissez votre mot de passe.')
    .max(128, 'Le mot de passe ne doit pas dépasser 128 caractères.'),
});
export const signUpSchema = z.object({ name, email, password });
export const studioSignUpSchema = z.object({ studioName, name, email, password });

function fieldErrors(err: z.ZodError): AuthFormResult {
  const out: Partial<Record<FieldName, string>> = {};
  for (const issue of err.issues) {
    const key = issue.path[0] as FieldName;
    if (key && !out[key]) out[key] = issue.message;
  }
  return { ok: false, error: 'Corrigez les champs indiqués.', fieldErrors: out };
}

/** Traduit une erreur Better Auth (APIError) en message français. */
export function authErrorMessage(e: unknown): string {
  const err = e as { body?: { code?: string }; statusCode?: number; status?: unknown } | null;
  const code = err?.body?.code;
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'E-mail ou mot de passe incorrect.';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou utilisez une autre adresse.';
    case 'PASSWORD_TOO_SHORT':
      return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
    case 'PASSWORD_TOO_LONG':
      return 'Le mot de passe ne doit pas dépasser 128 caractères.';
    case 'INVALID_EMAIL':
      return 'Adresse e-mail invalide.';
    case 'EMAIL_NOT_VERIFIED':
      return 'Vérifiez votre adresse e-mail avant de vous connecter.';
  }
  if (err?.statusCode === 429 || err?.status === 'TOO_MANY_REQUESTS') return 'Trop de tentatives. Réessayez dans un instant.';
  return 'Une erreur est survenue. Réessayez.';
}

function isApiError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'statusCode' in e && 'body' in e;
}

interface FlowDeps {
  auth?: Auth;
  database?: DB;
  /** En-têtes de la requête (IP, user-agent) transmis à Better Auth. */
  headers?: Headers;
  /** Limiteur de débit (instance partagée par défaut ; injectable en test). */
  limiter?: SlidingWindowLimiter;
}

function rateLimited(retryAfterS: number): AuthFormResult {
  const min = Math.max(1, Math.ceil(retryAfterS / 60));
  return { ok: false, error: `Trop de tentatives. Réessayez dans ${min} min.` };
}

/** Connexion e-mail + mot de passe. En cas de succès, le cookie de session est posé (plugin nextCookies). */
export async function signInWithPassword(input: Record<string, unknown>, deps: FlowDeps = {}): Promise<AuthFormResult & { userId?: string }> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  const limiter = deps.limiter ?? authLimiter;
  const emailKey = `signin:email:${parsed.data.email}`;
  const ipKey = `signin:ip:${clientIp(deps.headers)}`;
  // Même réponse que le compte existe ou non (pas d'énumération par le blocage).
  const wait = Math.max(
    limiter.retryAfter(emailKey, AUTH_RATE_LIMITS.signInFailuresPerEmail),
    limiter.retryAfter(ipKey, AUTH_RATE_LIMITS.signInFailuresPerIp),
  );
  if (wait) return rateLimited(wait);
  const a = deps.auth ?? defaultAuth;
  try {
    const res = await a.api.signInEmail({ body: parsed.data, headers: deps.headers ?? new Headers() });
    return { ok: true, userId: res.user.id };
  } catch (e) {
    if (!isApiError(e)) throw e;
    limiter.record(emailKey, AUTH_RATE_LIMITS.signInFailuresPerEmail);
    limiter.record(ipKey, AUTH_RATE_LIMITS.signInFailuresPerIp);
    return { ok: false, error: authErrorMessage(e) };
  }
}

/** Inscription joueur. Connecte automatiquement le nouvel utilisateur. */
export async function signUpWithPassword(input: Record<string, unknown>, deps: FlowDeps = {}): Promise<AuthFormResult & { userId?: string }> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  const limiter = deps.limiter ?? authLimiter;
  const ipKey = `signup:ip:${clientIp(deps.headers)}`;
  const wait = limiter.retryAfter(ipKey, AUTH_RATE_LIMITS.signUpPerIp);
  if (wait) return rateLimited(wait);
  limiter.record(ipKey, AUTH_RATE_LIMITS.signUpPerIp);
  const a = deps.auth ?? defaultAuth;
  try {
    const res = await a.api.signUpEmail({ body: parsed.data, headers: deps.headers ?? new Headers() });
    return { ok: true, userId: res.user.id };
  } catch (e) {
    if (!isApiError(e)) throw e;
    const error = authErrorMessage(e);
    const code = (e as { body?: { code?: string } }).body?.code ?? '';
    return { ok: false, error, fieldErrors: code.startsWith('USER_ALREADY_EXISTS') ? { email: error } : undefined };
  }
}

/** Slug de studio unique (`nova-games`, puis `nova-games-2`, …). */
export async function uniqueStudioSlug(name: string, database: DB = db): Promise<string> {
  const base = (slugify(name) || 'studio').slice(0, 48).replace(/-$/, '') || 'studio';
  // `base` ne contient que [a-z0-9-] : pas de caractère joker LIKE à échapper.
  const rows = await database
    .select({ slug: studios.slug })
    .from(studios)
    .where(or(eq(studios.slug, base), ilike(studios.slug, `${base}-%`)));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Crée un studio dont `userId` devient owner. Réessaie si le slug est pris entre-temps. */
export async function createStudioForOwner(userId: string, rawName: string, database: DB = db) {
  const studioNameValue = studioName.parse(rawName);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await uniqueStudioSlug(studioNameValue, database);
    const id = newId('std');
    const created = await database.transaction(async (tx) => {
      const [row] = await tx.insert(studios).values({ id, name: studioNameValue, slug }).onConflictDoNothing({ target: studios.slug }).returning();
      if (!row) return null;
      await tx.insert(studioMembers).values({ studioId: id, userId, role: 'owner' });
      return row;
    });
    if (created) return created;
  }
  throw new Error('STUDIO_SLUG_CONFLICT');
}

/**
 * Inscription studio : crée le compte (s'il n'y a pas d'utilisateur connecté) puis le studio, dont l'utilisateur devient owner.
 * `currentUserId` : utilisateur déjà connecté — seul le nom du studio est alors demandé.
 */
export async function signUpStudio(
  input: Record<string, unknown>,
  deps: FlowDeps & { currentUserId?: string | null } = {},
): Promise<AuthFormResult & { userId?: string; studioId?: string; studioSlug?: string }> {
  const database = deps.database ?? db;
  let userId = deps.currentUserId ?? null;
  if (userId) {
    const parsed = z.object({ studioName }).safeParse(input);
    if (!parsed.success) return fieldErrors(parsed.error);
  } else {
    const parsed = studioSignUpSchema.safeParse(input);
    if (!parsed.success) return fieldErrors(parsed.error);
    const res = await signUpWithPassword(parsed.data, deps);
    if (!res.ok || !res.userId) return res;
    userId = res.userId;
  }
  const studio = await createStudioForOwner(userId, String(input.studioName), database);
  return { ok: true, userId, studioId: studio.id, studioSlug: studio.slug };
}

