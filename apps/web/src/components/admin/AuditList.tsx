import Link from 'next/link';
import { auditActionLabel, auditTargetHref } from '@/server/admin-logic';
import { Mono, Time } from './ui';

export interface AuditRow {
  id: string;
  adminId: string;
  adminEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

const DETAIL_LABELS: Record<string, string> = {
  from: 'De',
  to: 'Vers',
  ground: 'Fondement',
  reason: 'Motif',
  note: 'Note',
  previousReason: 'Motif précédent',
  previousStatus: 'Statut précédent',
  attempts: 'Tentatives',
  lastError: 'Dernière erreur',
  deliveryId: 'Livraison',
  revokedSessions: 'Sessions révoquées',
  noticeId: 'Notification',
  studioId: 'Studio',
  platformRole: 'Rôle plateforme',
};

function detailValue(v: unknown) {
  if (v === null || v === undefined) return '—';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** Entrées du journal d'audit (qui, quoi, sur quoi, quand, détails). */
export function AuditList({ rows, compact = false }: { rows: AuditRow[]; compact?: boolean }) {
  if (!rows.length) return <p className="text-sm text-ink-2">Aucune action journalisée.</p>;
  return (
    <ol className="flex flex-col divide-y divide-line">
      {rows.map((r) => {
        const href = auditTargetHref(r.targetType, r.targetId);
        const details = Object.entries(r.details ?? {});
        return (
          <li key={r.id} className="py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <strong>{auditActionLabel(r.action)}</strong>
              <span className="text-xs text-ink-2">
                <Time date={r.createdAt} />
              </span>
            </div>
            <p className="mt-0.5 break-words text-xs text-ink-2">
              par {r.adminEmail ?? r.adminId}
              {compact ? null : (
                <>
                  {' · '}
                  {href ? (
                    <Link href={href} className="text-primary hover:underline">
                      {r.targetType} {r.targetId}
                    </Link>
                  ) : (
                    <span>
                      {r.targetType} {r.targetId}
                    </span>
                  )}
                </>
              )}
            </p>
            {details.length ? (
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                {details.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-3">{DETAIL_LABELS[k] ?? k}</dt>
                    <dd className="min-w-0 whitespace-pre-line break-words">{k.endsWith('Id') ? <Mono>{detailValue(v)}</Mono> : detailValue(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
