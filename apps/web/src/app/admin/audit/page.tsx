import Link from 'next/link';
import { listAuditEntries, listPlatformAdmins, requireAdminPermission } from '@/server/admin';
import { AUDIT_ACTION_LABELS, normalizeQuery, parsePage } from '@/server/admin-logic';
import { Card, PageHeader } from '@/components/admin/ui';
import { AuditList } from '@/components/admin/AuditList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Journal d’audit' };

const selectCls = 'w-full rounded-[var(--radius)] border border-line bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ action?: string; admin?: string; target?: string; page?: string }> }) {
  await requireAdminPermission('audit.read');
  const sp = await searchParams;
  const action = sp.action && sp.action in AUDIT_ACTION_LABELS ? sp.action : undefined;
  const adminId = normalizeQuery(sp.admin) || undefined;
  const targetId = normalizeQuery(sp.target) || undefined;
  const page = parsePage(sp.page);
  const [{ rows, hasMore }, admins] = await Promise.all([listAuditEntries({ action, adminId, targetId, page }), listPlatformAdmins()]);
  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (action) qs.set('action', action);
    if (adminId) qs.set('admin', adminId);
    if (targetId) qs.set('target', targetId);
    if (p > 1) qs.set('page', String(p));
    const s = qs.toString();
    return `/admin/audit${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <PageHeader title="Journal d’audit" />
      <form action="/admin/audit" method="get" className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]" aria-label="Filtrer le journal">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-action" className="text-sm font-medium">Action</label>
          <select id="f-action" name="action" defaultValue={action ?? ''} className={selectCls}>
            <option value="">Toutes</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-admin" className="text-sm font-medium">Administrateur</label>
          <select id="f-admin" name="admin" defaultValue={adminId ?? ''} className={selectCls}>
            <option value="">Tous</option>
            {admins.map((a) => (
              <option key={a.userId} value={a.userId}>{a.email}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-target" className="text-sm font-medium">Cible (id)</label>
          <input id="f-target" name="target" defaultValue={targetId} placeholder="gam_…, ord_…, usr_…" className={selectCls} />
        </div>
        <button type="submit" className="min-h-10 rounded-[var(--radius)] bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          Filtrer
        </button>
      </form>
      <Card>
        <AuditList rows={rows} />
      </Card>
      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
        {page > 1 ? <Link href={pageHref(page - 1)} className="text-primary hover:underline">← Plus récentes</Link> : <span />}
        <span className="text-ink-2">Page {page}</span>
        {hasMore ? <Link href={pageHref(page + 1)} className="text-primary hover:underline">Plus anciennes →</Link> : <span />}
      </nav>
      <p className="mt-4 text-xs text-ink-3">Le journal est en ajout seul : aucune entrée ne peut être modifiée ni supprimée depuis le back-office.</p>
    </>
  );
}
