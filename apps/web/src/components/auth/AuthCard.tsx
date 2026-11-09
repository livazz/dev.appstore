import type { ReactNode } from 'react';

/** Carte blanche des pages d'authentification. Le titre porte l'id `auth-title` (référencé par les formulaires). */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="w-full max-w-[420px]">
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <h1 id="auth-title" className="text-2xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {subtitle ? <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </section>
      {footer ? <div className="mt-5 text-center text-sm text-ink-2">{footer}</div> : null}
    </div>
  );
}
