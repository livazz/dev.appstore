/** Paramètres communs à tous les e-mails (URL du site, identité légale, support). */
export interface EmailContext {
  /** URL publique du site, sans `/` final. */
  appUrl: string;
  supportEmail: string;
  /** Page d'aide / formulaire de contact. Par défaut `${appUrl}/support`. */
  supportUrl?: string;
  /** Éditeur du site (mentions légales). */
  companyName: string;
  companyAddress?: string;
  /** Médiateur de la consommation (art. L612-1 C. conso). */
  mediator?: { name: string; url: string };
  /** Fuseau d'affichage des dates. */
  timeZone: string;
}

export const DEFAULT_CONTEXT: EmailContext = {
  appUrl: 'http://localhost:3000',
  supportEmail: 'support@wolleen.com',
  companyName: 'Wolleen SAS',
  timeZone: 'Europe/Paris',
};

export type ResolvedContext = EmailContext & { supportUrl: string };

export function resolveContext(ctx?: Partial<EmailContext>): ResolvedContext {
  const merged = { ...DEFAULT_CONTEXT, ...stripUndefined(ctx ?? {}) };
  const appUrl = merged.appUrl.replace(/\/+$/, '');
  return { ...merged, appUrl, supportUrl: merged.supportUrl ?? `${appUrl}/support` };
}

/** Contexte lu depuis l'environnement (`APP_URL` / `NEXT_PUBLIC_APP_URL`, `SUPPORT_EMAIL`, `MAIL_COMPANY_*`). */
export function contextFromEnv(env: Record<string, string | undefined> = process.env): ResolvedContext {
  return resolveContext({
    appUrl: env.APP_URL || env.NEXT_PUBLIC_APP_URL || env.BETTER_AUTH_URL || undefined,
    supportEmail: env.SUPPORT_EMAIL || undefined,
    companyName: env.MAIL_COMPANY_NAME || undefined,
    companyAddress: env.MAIL_COMPANY_ADDRESS || undefined,
    mediator:
      env.MAIL_MEDIATOR_NAME && env.MAIL_MEDIATOR_URL
        ? { name: env.MAIL_MEDIATOR_NAME, url: env.MAIL_MEDIATOR_URL }
        : undefined,
  });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function appLink(ctx: ResolvedContext, path: string) {
  return `${ctx.appUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
