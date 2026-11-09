import Link from 'next/link';
import type { DeliveryStatus, GameStatus, OrderStatus } from '@wolleen/core';

/* Briques d'interface du back-office Dev AppStore (Server Components). */

export const GAME_STATUS: Record<GameStatus, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-bg text-ink-2 ring-line' },
  review: { label: 'En revue', cls: 'bg-warn/10 text-warn ring-warn/30' },
  live: { label: 'En ligne', cls: 'bg-ok/10 text-ok ring-ok/30' },
  suspended: { label: 'Suspendu', cls: 'bg-danger/10 text-danger ring-danger/30' },
};

export const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-primary/10 text-ink ring-primary/30' },
  delivered: { label: 'Livrée', cls: 'bg-ok/10 text-ok ring-ok/30' },
  acknowledged: { label: 'Confirmée', cls: 'bg-ok/10 text-ok ring-ok/30' },
  failed: { label: 'En échec', cls: 'bg-danger/10 text-danger ring-danger/30' },
};

export const ORDER_STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: 'Non payée', cls: 'bg-bg text-ink-2 ring-line' },
  paid: { label: 'Payée', cls: 'bg-ok/10 text-ok ring-ok/30' },
  failed: { label: 'Paiement échoué', cls: 'bg-danger/10 text-danger ring-danger/30' },
  refunded: { label: 'Remboursée', cls: 'bg-warn/10 text-warn ring-warn/30' },
};

export function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{label}</span>;
}

export function GameStatusBadge({ status }: { status: GameStatus }) {
  return <Badge {...(GAME_STATUS[status] ?? { label: status, cls: 'bg-bg text-ink-2 ring-line' })} />;
}

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus | null }) {
  if (!status) return <Badge label="Aucune livraison" cls="bg-bg text-ink-3 ring-line" />;
  return <Badge {...(DELIVERY_STATUS[status] ?? { label: status, cls: 'bg-bg text-ink-2 ring-line' })} />;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge {...(ORDER_STATUS[status] ?? { label: status, cls: 'bg-bg text-ink-2 ring-line' })} />;
}

const dtf = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
const df = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

export function formatDateTime(d: Date | null | undefined) {
  return d ? dtf.format(d) : '—';
}
export function formatDate(d: Date | null | undefined) {
  return d ? df.format(d) : '—';
}

export function Time({ date, withTime = true }: { date: Date | null | undefined; withTime?: boolean }) {
  if (!date) return <span className="text-ink-3">—</span>;
  return <time dateTime={date.toISOString()}>{withTime ? formatDateTime(date) : formatDate(date)}</time>;
}

/** Titre de page avec fil d'Ariane. */
export function PageHeader({ title, crumbs = [], children }: { title: string; crumbs?: { href: string; label: string }[]; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {crumbs.length ? (
          <nav aria-label="Fil d’Ariane" className="mb-1 text-sm text-ink-2">
            <ol className="flex flex-wrap items-center gap-1">
              {crumbs.map((c) => (
                <li key={c.href} className="flex items-center gap-1">
                  <Link href={c.href} className="hover:text-ink hover:underline">
                    {c.label}
                  </Link>
                  <span aria-hidden className="text-ink-3">
                    /
                  </span>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="break-words text-2xl font-bold sm:text-3xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Card({ title, children, className = '', actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-black/5 sm:p-5 ${className}`} aria-label={title}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Liste « libellé : valeur » (empilée sur mobile). */
export function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-2">{k}</dt>
          <dd className="mb-2 min-w-0 break-words sm:mb-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <code className="break-all rounded bg-bg px-1 py-0.5 font-mono text-xs">{children}</code>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-2">{children}</p>;
}

/** Formulaire de recherche GET (fonctionne sans JavaScript). */
export function SearchForm({
  action,
  name = 'q',
  defaultValue,
  label,
  placeholder,
  hidden = {},
}: {
  action: string;
  name?: string;
  defaultValue?: string;
  label: string;
  placeholder?: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} method="get" role="search" className="flex w-full max-w-xl gap-2">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="sr-only" htmlFor={`search-${name}`}>
        {label}
      </label>
      <input
        id={`search-${name}`}
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-[var(--radius)] border border-line bg-surface px-3 py-2 text-sm placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <button type="submit" className="shrink-0 rounded-[var(--radius)] bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
        Rechercher
      </button>
    </form>
  );
}

/** Tableau responsive : défile horizontalement dans son cadre (jamais la page). */
export function TableWrap({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export const th = 'border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-2 sm:px-3';
export const td = 'border-b border-line px-4 py-2.5 align-top sm:px-3';

/** État du compte Stripe Connect d'un studio. */
export function StripeBadge({ accountId, chargesEnabled }: { accountId: string | null; chargesEnabled: boolean }) {
  if (!accountId) return <Badge label="Stripe non connecté" cls="bg-bg text-ink-2 ring-line" />;
  return chargesEnabled ? <Badge label="Stripe actif" cls="bg-ok/10 text-ok ring-ok/30" /> : <Badge label="Stripe incomplet" cls="bg-warn/10 text-warn ring-warn/30" />;
}
