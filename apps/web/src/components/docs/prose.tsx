import Link from 'next/link';
import type { ReactNode } from 'react';
import { docHref, docNeighbours, getDocPage } from '@/lib/docs/nav';

/* Éléments typographiques des pages de documentation (composants serveur, aucun JS client). */

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="group mt-12 scroll-mt-24 border-t border-line pt-8 text-xl font-semibold tracking-tight text-ink first:mt-0 first:border-0 first:pt-0 sm:text-2xl">
      {children}
      <a href={`#${id}`} className="ml-2 text-ink-3 opacity-0 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100" aria-label="Lien vers cette section">
        #
      </a>
    </h2>
  );
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="group mt-8 scroll-mt-24 text-lg font-semibold text-ink">
      {children}
      <a href={`#${id}`} className="ml-2 text-ink-3 opacity-0 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100" aria-label="Lien vers cette section">
        #
      </a>
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="my-4 leading-7 text-ink-2">{children}</p>;
}

export function C({ children }: { children: ReactNode }) {
  return <code className="break-words rounded bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="my-4 list-disc space-y-2 pl-6 leading-7 text-ink-2 marker:text-ink-3">{children}</ul>;
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="my-4 list-decimal space-y-2 pl-6 leading-7 text-ink-2 marker:text-ink-3">{children}</ol>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const cls = 'font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary';
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

const CALLOUT = {
  info: { cls: 'border-primary/40 bg-primary/5', label: 'À savoir' },
  tip: { cls: 'border-ok/40 bg-ok/5', label: 'Conseil' },
  warn: { cls: 'border-warn/50 bg-warn/5', label: 'Attention' },
  danger: { cls: 'border-danger/50 bg-danger/5', label: 'Important' },
} as const;

export function Callout({ kind = 'info', title, children }: { kind?: keyof typeof CALLOUT; title?: string; children: ReactNode }) {
  const c = CALLOUT[kind];
  return (
    <aside className={`my-5 rounded-[var(--radius)] border-l-4 px-4 py-3 text-sm leading-6 text-ink-2 ${c.cls}`} aria-label={title ?? c.label}>
      <p className="mb-1 font-semibold text-ink">{title ?? c.label}</p>
      <div className="space-y-2 [&_p]:m-0">{children}</div>
    </aside>
  );
}

/** Tableau responsive : défilement horizontal interne si nécessaire. */
export function Table({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="my-5 overflow-x-auto rounded-[var(--radius)] border border-line bg-surface" tabIndex={0} role="region" aria-label={caption ?? 'Tableau'}>
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-bg text-xs uppercase tracking-wide text-ink-3">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-ink-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const METHOD_CLS: Record<string, string> = {
  GET: 'bg-ok/10 text-ok',
  POST: 'bg-primary/15 text-[#1f6fae]',
};

/** En-tête d'une route : méthode + chemin + mode d'authentification. */
export function Endpoint({ method, path, auth = 'Clé API (Bearer)' }: { method: 'GET' | 'POST'; path: string; auth?: string }) {
  return (
    <div className="my-4 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-line bg-surface px-3 py-2">
      <span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${METHOD_CLS[method]}`}>{method}</span>
      <code className="min-w-0 break-all font-mono text-sm text-ink">{path}</code>
      <span className="ml-auto text-xs text-ink-3">Auth : {auth}</span>
    </div>
  );
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="my-6 space-y-6 border-l-2 border-line pl-6 [counter-reset:step]">{children}</ol>;
}

/** Étape numérotée ; commencez le contenu par un <H3> (titre et ancre de l'étape). */
export function Step({ children }: { children: ReactNode }) {
  return (
    <li className="relative [counter-increment:step] before:absolute before:-left-[2.4rem] before:top-0 before:grid before:size-7 before:place-items-center before:rounded-full before:bg-brand before:text-xs before:font-bold before:text-ink before:content-[counter(step)] [&>h3:first-child]:mt-0">
      {children}
    </li>
  );
}

/** Coquille d'une page : titre, description, sommaire « Sur cette page » (≥ 1280 px), précédent / suivant. */
export function DocPage({ slug, children }: { slug: string; children: ReactNode }) {
  const page = getDocPage(slug);
  const { prev, next } = docNeighbours(slug);
  return (
    <div className="flex gap-10">
      <article className="min-w-0 flex-1 py-8 lg:py-10">
        <p className="text-sm font-medium text-ink-3">{page.group}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{page.title}</h1>
        <p className="mt-3 text-lg text-ink-2">{page.description}</p>
        <div className="mt-10">{children}</div>
        <nav aria-label="Pages voisines" className="mt-16 grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
          {prev ? (
            <Link href={docHref(prev.slug)} className="rounded-[var(--radius)] border border-line bg-surface px-4 py-3 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">
              <span className="block text-xs text-ink-3">Précédent</span>
              <span className="font-medium text-ink">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={docHref(next.slug)} className="rounded-[var(--radius)] border border-line bg-surface px-4 py-3 text-right hover:border-primary focus-visible:outline-2 focus-visible:outline-primary sm:col-start-2">
              <span className="block text-xs text-ink-3">Suivant</span>
              <span className="font-medium text-ink">{next.title}</span>
            </Link>
          )}
        </nav>
      </article>
      {page.sections.length > 0 && (
        <aside className="sticky top-16 hidden max-h-[calc(100vh-4rem)] w-52 shrink-0 overflow-y-auto py-10 xl:block" aria-label="Sur cette page">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Sur cette page</p>
          <ul className="space-y-1 border-l border-line text-sm">
            {page.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-ink-2 hover:border-ink hover:text-ink">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}

export function docMetadata(slug: string) {
  const p = getDocPage(slug);
  return {
    title: slug ? `${p.title} — Documentation Dev AppStore` : 'Documentation développeur — Dev AppStore',
    description: p.description,
  };
}
