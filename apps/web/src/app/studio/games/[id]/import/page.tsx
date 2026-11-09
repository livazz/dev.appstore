import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db, eq, games } from '@wolleen/db';
import { requireGameAccess } from '@/server/session';
import { getCredentialStatus, listImportRuns, regionFor } from '@/server/import-logic';
import { CredentialsPanel } from './CredentialsPanel';
import { CatalogImporter } from './CatalogImporter';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Importer depuis les stores — Wolleen Studio' };

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
const SOURCE_LABEL = { app_store: 'App Store', google_play: 'Google Play' } as const;
const STATUS = {
  fetched: { label: 'Catalogue lu', className: 'bg-primary/10 text-primary' },
  imported: { label: 'Importé', className: 'bg-ok/10 text-ok' },
  failed: { label: 'Échec', className: 'bg-danger/10 text-danger' },
} as const;

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let role: string;
  try {
    ({ role } = await requireGameAccess(id));
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') notFound();
    throw e;
  }
  const [game] = await db.select({ id: games.id, currency: games.currency }).from(games).where(eq(games.id, id));
  if (!game) notFound();
  const canEdit = role !== 'finance';
  const [credentials, runs] = await Promise.all([getCredentialStatus(db, id), listImportRuns(db, id, 8)]);
  const region = regionFor(game.currency);
  const hasCredentials = !!(credentials.app_store || credentials.google_play);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Importer depuis les stores</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Récupérez les achats in-app déjà configurés sur App Store Connect et Google Play : Wolleen crée les articles de votre boutique
          avec le <strong>même identifiant produit</strong>, pour que votre jeu reconnaisse les achats sans changement. Prix lus pour
          la région <strong>{region.label}</strong> ({game.currency}), devise de votre boutique.
        </p>
      </div>

      {!canEdit && (
        <p className="rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-ink">
          Votre rôle « finance » permet de consulter cette page, pas d&apos;importer des articles.
        </p>
      )}

      {canEdit && (
        <>
          <CredentialsPanel gameId={id} initial={credentials} />
          <CatalogImporter gameId={id} hasCredentials={hasCredentials} />
        </>
      )}

      <section className="rounded-[var(--radius)] border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Journal des imports</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">Aucun import pour l&apos;instant.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-ink-3">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Statut</th>
                  <th className="py-2 pr-3 text-right font-medium">Produits lus</th>
                  <th className="py-2 pr-3 text-right font-medium">Articles créés</th>
                  <th className="py-2 font-medium">Remarques</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap text-ink-2">{dateFmt.format(r.createdAt)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.sources.map((s) => SOURCE_LABEL[s]).join(' + ')}
                      {r.mode === 'demo' && <span className="ml-1.5 rounded bg-cancel/10 px-1.5 py-0.5 text-xs text-cancel">exemple</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[r.status].className}`}>{STATUS[r.status].label}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.productsFound}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.itemsCreated}</td>
                    <td className="max-w-[320px] truncate py-2 text-ink-3" title={r.error ?? undefined}>
                      {r.error ?? (r.warningsCount ? `${r.warningsCount} avertissement${r.warningsCount > 1 ? 's' : ''}` : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
