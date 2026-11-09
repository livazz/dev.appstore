'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ITEM_TYPES, PERIODS, PRICE_TIERS_CENTS, formatMoney, type Period } from '@wolleen/core';
import { fetchCatalogAction, importSelectionAction, repriceAction } from '@/server/import-actions';
import type { CatalogPreview, ImportOutcome, PreviewRow } from '@/server/import-logic';
import { btnCancel, btnGhost, btnPrimary, card, input } from './ui';

const SOURCE = {
  app_store: { label: 'App Store', className: 'bg-ink/5 text-ink' },
  google_play: { label: 'Google Play', className: 'bg-ok/10 text-ok' },
} as const;
const TYPE_LABEL = Object.fromEntries(ITEM_TYPES.map((t) => [t.value, t.label]));
const isSub = (r: Pick<PreviewRow, 'type'>) => r.type === 'auto_renewable' || r.type === 'non_renewing';

interface RowState extends PreviewRow {
  selected: boolean;
}

/** Récupération du catalogue (stores ou exemple), aperçu éditable, import de la sélection. */
export function CatalogImporter({ gameId, hasCredentials }: { gameId: string; hasCredentials: boolean }) {
  const router = useRouter();
  const [discountPct, setDiscountPct] = useState(20);
  const [preview, setPreview] = useState<Omit<CatalogPreview, 'rows'> | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [showStorePrice, setShowStorePrice] = useState(true);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'fetch' | 'demo' | 'reprice' | 'import'>('');
  const [, startTransition] = useTransition();

  const discountBps = Math.round(Math.min(90, Math.max(0, discountPct || 0)) * 100);
  const selected = rows.filter((r) => r.selected);
  const selectable = rows.filter((r) => !r.existing);

  const fetchCatalog = (demo: boolean) => {
    setError('');
    setOutcome(null);
    setBusy(demo ? 'demo' : 'fetch');
    startTransition(async () => {
      const r = await fetchCatalogAction(gameId, { demo, discountBps });
      setBusy('');
      if (!r.ok) {
        setError(r.error);
        router.refresh(); // journal
        return;
      }
      const { rows: list, ...meta } = r.data;
      setPreview(meta);
      setRows(list.map((x) => ({ ...x, selected: x.preselected })));
      router.refresh();
    });
  };

  const reprice = () => {
    if (!rows.length || preview?.discountBps === discountBps) return;
    setBusy('reprice');
    startTransition(async () => {
      const r = await repriceAction(gameId, { discountBps, prices: rows.map((x) => x.storePriceCents) });
      setBusy('');
      if (!r.ok) return setError(r.error);
      setPreview((p) => (p ? { ...p, discountBps } : p));
      setRows((cur) =>
        cur.map((x, i) => {
          const p = r.data[i]!;
          const notes = x.notes.filter((n) => !/palier/.test(n));
          return { ...x, suggestedCents: p.suggestedCents, webPriceCents: p.webPriceCents, notes: p.note ? [p.note, ...notes] : notes };
        }),
      );
    });
  };

  const update = (key: string, patch: Partial<RowState>) => setRows((cur) => cur.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const selectAll = (on: boolean) => setRows((cur) => cur.map((x) => (x.existing ? x : { ...x, selected: on })));

  const doImport = () => {
    if (!preview || !selected.length) return;
    setError('');
    setBusy('import');
    startTransition(async () => {
      const r = await importSelectionAction(gameId, {
        runId: preview.runId,
        showStorePrice,
        items: selected.map((x) => ({
          productId: x.productId,
          type: x.type,
          period: x.period,
          title: x.title,
          subtitle: x.subtitle,
          storePriceCents: x.storePriceCents,
          priceCents: x.webPriceCents,
          quantity: x.quantity,
        })),
      });
      setBusy('');
      if (!r.ok) return setError(r.error);
      setOutcome(r.data);
      const created = new Set(r.data.created.map((c) => c.productId));
      setRows((cur) => cur.map((x) => (created.has(x.productId) ? { ...x, existing: 'active', selected: false } : x)));
      router.refresh();
    });
  };

  const warnings = useMemo(() => (preview?.warnings ?? []).filter((w) => w.code === 'inactive' || w.code === 'fetch_failed' || !rows.some((r) => r.storeProductId === w.productId)), [preview, rows]);

  return (
    <section className={card}>
      <h2 className="text-base font-semibold text-ink">Catalogue</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="discount" className="mb-1 block text-xs font-medium text-ink-2">
            Remise web suggérée
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-ink-2">−</span>
            <input
              id="discount"
              type="number"
              min={0}
              max={90}
              step={5}
              value={discountPct}
              onChange={(e) => setDiscountPct(Number(e.target.value))}
              onBlur={reprice}
              onKeyDown={(e) => e.key === 'Enter' && reprice()}
              className={`${input} w-20 text-right tabular-nums`}
            />
            <span className="text-sm text-ink-2">%</span>
          </div>
        </div>
        <button type="button" className={btnPrimary} onClick={() => fetchCatalog(false)} disabled={!hasCredentials || !!busy} title={hasCredentials ? undefined : 'Enregistrez d’abord des identifiants'}>
          {busy === 'fetch' ? 'Lecture des stores…' : 'Récupérer le catalogue'}
        </button>
        <button type="button" className={hasCredentials ? btnGhost : btnCancel} onClick={() => fetchCatalog(true)} disabled={!!busy}>
          {busy === 'demo' ? 'Chargement…' : 'Essayer avec un catalogue d’exemple'}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        {hasCredentials
          ? 'Lecture seule : rien n’est modifié sur vos stores. Un catalogue de 300 articles se lit en quelques secondes.'
          : 'Aucune clé enregistrée : le catalogue d’exemple simule les réponses d’App Store Connect et de Google Play pour tester la page.'}{' '}
        La remise rétrocède au joueur une partie de la commission store économisée (30 % → ~5 %).
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {outcome && (
        <div role="status" className="mt-4 rounded-lg border border-ok/40 bg-ok/5 p-4 text-sm">
          <p className="font-medium text-ink">
            {outcome.created.length} article{outcome.created.length > 1 ? 's' : ''} créé{outcome.created.length > 1 ? 's' : ''} dans la boutique
            {outcome.skipped.length > 0 && `, ${outcome.skipped.length} ignoré${outcome.skipped.length > 1 ? 's' : ''}`}.
          </p>
          {outcome.skipped.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-2">
              {outcome.skipped.map((s) => (
                <li key={s.productId}>
                  <span className="font-mono text-xs">{s.productId}</span> : {s.reason}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/studio/games/${gameId}`} className="mt-3 inline-block font-medium text-primary hover:underline">
            Personnaliser les visuels dans la boutique →
          </Link>
        </div>
      )}

      {preview && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <p className="text-ink">
              <strong>{rows.length}</strong> produit{rows.length > 1 ? 's' : ''} trouvé{rows.length > 1 ? 's' : ''}
              {preview.mode === 'demo' && <span className="ml-2 rounded bg-cancel/10 px-1.5 py-0.5 text-xs text-cancel">catalogue d&apos;exemple</span>}
              <span className="text-ink-3"> · prix {preview.regionLabel}, remise −{preview.discountBps / 100} %</span>
              {busy === 'reprice' && <span className="text-ink-3"> · recalcul…</span>}
            </p>
            <span className="flex-1" />
            <button type="button" className="text-ink-2 hover:text-ink" onClick={() => selectAll(true)}>
              Tout cocher
            </button>
            <button type="button" className="text-ink-2 hover:text-ink" onClick={() => selectAll(false)}>
              Tout décocher
            </button>
            <label className="flex items-center gap-2 text-ink-2">
              <input type="checkbox" checked={showStorePrice} onChange={(e) => setShowStorePrice(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              Afficher le prix store barré
            </label>
          </div>

          {warnings.length > 0 && (
            <details className="mt-3 rounded-lg border border-warn/40 bg-warn/5 px-4 py-2 text-sm">
              <summary className="cursor-pointer font-medium text-warn">
                {warnings.length} produit{warnings.length > 1 ? 's' : ''} non importable{warnings.length > 1 ? 's' : ''} ou avertissement{warnings.length > 1 ? 's' : ''}
              </summary>
              <ul className="mt-2 space-y-1 pb-1 text-ink-2">
                {warnings.map((w, i) => (
                  <li key={i}>
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${SOURCE[w.source].className}`}>{SOURCE[w.source].label}</span>
                    {w.productId && <span className="mr-1 font-mono text-xs text-ink">{w.productId}</span>}
                    {w.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-3 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-bg text-xs text-ink-3">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner"
                      className="size-4 accent-[var(--primary)]"
                      checked={selectable.length > 0 && selectable.every((r) => r.selected)}
                      onChange={(e) => selectAll(e.target.checked)}
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Article</th>
                  <th className="px-3 py-2 text-right font-medium">Prix store</th>
                  <th className="px-3 py-2 font-medium">Prix web</th>
                  <th className="px-3 py-2 font-medium">Quantité</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.key} row={r} currency={preview.currency} onChange={(p) => update(r.key, p)} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 py-3 backdrop-blur">
            <p className="text-sm text-ink-2">
              {selected.length} sélectionné{selected.length > 1 ? 's' : ''} · style par défaut, mise en page 4 (modifiables ensuite dans la boutique)
            </p>
            <span className="flex-1" />
            <button type="button" className={btnPrimary} onClick={doImport} disabled={!selected.length || !!busy}>
              {busy === 'import' ? 'Import…' : `Importer la sélection (${selected.length})`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ row: r, currency, onChange }: { row: RowState; currency: CatalogPreview['currency']; onChange: (p: Partial<RowState>) => void }) {
  const disabled = !!r.existing;
  const discount = r.storePriceCents > r.webPriceCents ? Math.round((1 - r.webPriceCents / r.storePriceCents) * 100) : 0;
  return (
    <tr className={`border-t border-line align-top ${disabled ? 'bg-bg/60 text-ink-3' : ''}`}>
      <td className="px-3 py-3">
        <input
          type="checkbox"
          aria-label={`Importer ${r.title}`}
          className="size-4 accent-[var(--primary)]"
          checked={r.selected}
          disabled={disabled}
          onChange={(e) => onChange({ selected: e.target.checked })}
        />
      </td>
      <td className="px-3 py-3">
        <input
          className={`${input} max-w-[300px] py-1.5 font-medium`}
          value={r.title}
          maxLength={80}
          disabled={disabled}
          onChange={(e) => onChange({ title: e.target.value })}
          aria-label="Titre de l'article"
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded px-1.5 py-0.5 ${SOURCE[r.source].className}`}>{SOURCE[r.source].label}</span>
          <span className="font-mono text-ink">{r.productId}</span>
          <span className="text-ink-3">· {TYPE_LABEL[r.type]}</span>
          {isSub(r) && (
            <select
              className="rounded border border-line bg-surface px-1 py-0.5 text-xs"
              value={r.period ?? 'month'}
              disabled={disabled}
              onChange={(e) => onChange({ period: e.target.value as Period })}
              aria-label="Période"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </div>
        {r.subtitle && <p className="mt-1 max-w-[300px] truncate text-xs text-ink-3" title={r.subtitle}>{r.subtitle}</p>}
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{formatMoney(r.storePriceCents, r.storeCurrency)}</td>
      <td className="px-3 py-3 whitespace-nowrap">
        <select
          className={`${input} w-28 py-1.5 tabular-nums`}
          value={r.webPriceCents}
          disabled={disabled}
          onChange={(e) => onChange({ webPriceCents: Number(e.target.value) })}
          aria-label="Prix web"
        >
          {PRICE_TIERS_CENTS.map((c) => (
            <option key={c} value={c}>
              {formatMoney(c, currency)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-3">
          {discount > 0 ? `−${discount} % vs store` : 'pas de remise'}
          {r.suggestedCents !== null && r.suggestedCents !== r.webPriceCents && ` · suggéré ${formatMoney(r.suggestedCents, currency)}`}
        </p>
      </td>
      <td className="px-3 py-3">
        {r.type === 'consumable' ? (
          <input
            type="number"
            min={1}
            max={1_000_000}
            className={`${input} w-24 py-1.5 tabular-nums`}
            value={r.quantity}
            disabled={disabled}
            onChange={(e) => onChange({ quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
            aria-label="Quantité livrée"
          />
        ) : (
          <span className="text-ink-3">1</span>
        )}
      </td>
      <td className="max-w-[260px] px-3 py-3 text-xs">
        {r.existing === 'active' && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">Déjà dans la boutique</span>}
        {r.existing === 'archived' && <span className="rounded-full bg-ink/5 px-2 py-0.5 font-medium text-ink-2">Article archivé</span>}
        {!r.existing && !r.notes.length && <span className="rounded-full bg-ok/10 px-2 py-0.5 font-medium text-ok">Nouveau</span>}
        {r.notes.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-warn">
            {r.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}
