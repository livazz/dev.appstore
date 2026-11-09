'use client';

import { useState, useTransition } from 'react';
import {
  DEFAULT_ITEM_STYLE,
  ITEM_TYPES,
  PERIODS,
  PRICE_TIERS_CENTS,
  formatMoney,
  slugify,
  type Currency,
  type ItemStyle,
  type LayoutId,
  type Period,
} from '@wolleen/core';
import { ItemCard } from '@/components/store/ItemCard';
import { createItem, deleteItem, updateItem } from '@/server/studio';
import type { EditorItem } from '@/lib/studio-types';
import { pickAndUploadImage } from '@/lib/upload';
import { Modal } from './Modal';
import { ColorField, Slider, Toggle } from './Controls';
import { IconPlus } from './icons';

type Draft = Omit<EditorItem, 'id'> & { id: string | null };

function blankItem(last: EditorItem | undefined): Draft {
  // Le nouvel article reprend le style du dernier article pour garder une boutique cohérente.
  return {
    id: null,
    productId: '',
    type: 'consumable',
    period: 'month',
    title: '',
    subtitle: '',
    keywords: [],
    priceCents: 499,
    oldPriceCents: null,
    quantity: 1,
    models: [{ label: '' }],
    layout: last?.layout ?? 4,
    style: last ? { ...last.style } : { ...DEFAULT_ITEM_STYLE },
  };
}

/** Identifiant produit suggéré à partir du titre (ex. « Sac de gemmes » → sac_de_gemmes). */
export function suggestProductId(title: string) {
  return slugify(title).replace(/-/g, '_').slice(0, 64);
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const labelCls = 'flex flex-col gap-1 text-sm';
const labelText = 'font-medium text-ink-2';

export function ItemModal({
  gameId,
  currency,
  items,
  item,
  onClose,
  onSaved,
  onDeleted,
}: {
  gameId: string;
  currency: Currency;
  items: EditorItem[];
  item?: EditorItem;
  onClose: () => void;
  onSaved: (item: EditorItem) => void;
  onDeleted: (itemId: string) => void;
}) {
  const editing = !!item;
  const [draft, setDraft] = useState<Draft>(() => (item ? structuredClone(item) : blankItem(items[items.length - 1])));
  const [tab, setTab] = useState<'info' | 'layout'>('info');
  const [kw, setKw] = useState(draft.keywords.join(', '));
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const setStyle = (p: Partial<ItemStyle>) => setDraft((d) => ({ ...d, style: { ...d.style, ...p } }));

  const effectiveProductId = draft.productId.trim() || suggestProductId(draft.title);
  const productIdTaken = items.some((i) => i.id !== draft.id && i.productId === effectiveProductId);

  const validate = () => {
    if (!draft.title.trim()) return "Le titre de l'article est obligatoire.";
    if (!effectiveProductId) return "L'identifiant produit est obligatoire.";
    if (productIdTaken) return 'Cet identifiant produit est déjà utilisé dans ce jeu.';
    if (draft.oldPriceCents != null && draft.oldPriceCents <= draft.priceCents) return "L'ancien prix doit être supérieur au prix.";
    return '';
  };

  const next = () => {
    const e = validate();
    setError(e);
    if (!e) setTab('layout');
  };

  const save = () => {
    const e = validate();
    if (e) {
      setError(e);
      setTab('info');
      return;
    }
    const { id, ...rest } = draft;
    const input = {
      ...rest,
      title: draft.title.trim(),
      productId: effectiveProductId,
      keywords: kw.split(',').map((k) => k.trim()).filter(Boolean),
    };
    startTransition(async () => {
      const r = id ? await updateItem(gameId, id, input) : await createItem(gameId, input);
      if (!r.ok) {
        setError(r.error);
        setTab('info');
        return;
      }
      onSaved(r.data);
      onClose();
    });
  };

  const remove = () => {
    if (!item || !confirm(`Supprimer « ${item.title} » ?`)) return;
    startTransition(async () => {
      const r = await deleteItem(gameId, item.id);
      if (!r.ok) return setError(r.error);
      onDeleted(item.id);
      onClose();
    });
  };

  const setModelCount = (n: number) => {
    const c = Math.max(1, Math.min(3, Number.isFinite(n) ? n : 1));
    const models = [...draft.models];
    while (models.length < c) models.push({ label: '' });
    set({ models: models.slice(0, c) });
  };

  const uploadModel = async (i: number) => {
    setUploading(i);
    setError('');
    try {
      const url = await pickAndUploadImage('item');
      if (url) setDraft((d) => ({ ...d, models: d.models.map((x, j) => (j === i ? { ...x, imageUrl: url } : x)) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const isSub = draft.type === 'auto_renewable' || draft.type === 'non_renewing';
  const previewGrid = { width: 150, height: 200 };
  const tabBtn = (active: boolean) =>
    `flex-1 rounded-md px-4 py-1.5 text-sm font-semibold transition ${active ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`;

  return (
    <Modal onClose={onClose} wide label={editing ? "Modifier l'article" : 'Nouvel article'}>
      <h2 className="mb-4 text-lg font-bold">{editing ? "Modifier l'article" : 'Nouvel article'}</h2>
      <div className="mx-auto mb-5 flex max-w-md rounded-lg bg-bg p-1" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'info'} className={tabBtn(tab === 'info')} onClick={() => setTab('info')}>
          Infos article
        </button>
        <button type="button" role="tab" aria-selected={tab === 'layout'} className={tabBtn(tab === 'layout')} onClick={next}>
          Mise en page
        </button>
      </div>

      {tab === 'info' ? (
        <div className="flex flex-col gap-5">
          <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <legend className={`${labelText} mb-2 text-sm`}>Type</legend>
            {ITEM_TYPES.map((t) => (
              <label key={t.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="item-type" checked={draft.type === t.value} onChange={() => set({ type: t.value })} className="accent-primary" />
                <span>{t.label}</span>
              </label>
            ))}
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              <span className={labelText}>Titre de l&apos;article</span>
              <input className={inputCls} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Sac de gemmes" maxLength={80} autoFocus />
            </label>
            <label className={labelCls}>
              <span className={labelText}>Sous-titre (optionnel)</span>
              <input className={inputCls} value={draft.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder="+15 % offerts" maxLength={80} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              <span className={labelText}>Mots-clés (optionnel) — séparés par une virgule, ils créent les filtres de la boutique</span>
              <input className={inputCls} value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Gemmes, Monnaie, Meilleure offre" />
            </label>
            <label className={labelCls}>
              <span className={labelText}>Prix (palier)</span>
              <select
                className={inputCls}
                value={draft.priceCents}
                onChange={(e) => {
                  const p = Number(e.target.value);
                  set({ priceCents: p, oldPriceCents: draft.oldPriceCents != null && draft.oldPriceCents <= p ? null : draft.oldPriceCents });
                }}
              >
                {PRICE_TIERS_CENTS.map((p) => (
                  <option key={p} value={p}>{formatMoney(p, currency)}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              <span className={labelText}>Ancien prix (barré)</span>
              <select
                className={inputCls}
                value={draft.oldPriceCents ?? ''}
                onChange={(e) => set({ oldPriceCents: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Aucun</option>
                {PRICE_TIERS_CENTS.filter((p) => p > draft.priceCents).map((p) => (
                  <option key={p} value={p}>{formatMoney(p, currency)}</option>
                ))}
              </select>
            </label>
            {isSub && (
              <label className={labelCls}>
                <span className={labelText}>Durée</span>
                <select className={inputCls} value={draft.period} onChange={(e) => set({ period: e.target.value as Period })}>
                  {PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className={labelCls}>
              <span className={labelText}>Identifiant produit (envoyé à votre jeu)</span>
              <input
                className={`${inputCls} font-mono ${productIdTaken ? 'border-danger ring-2 ring-danger/20' : ''}`}
                value={draft.productId}
                onChange={(e) => set({ productId: e.target.value.replace(/\s/g, '_') })}
                placeholder={suggestProductId(draft.title) || 'gems_1200'}
                maxLength={64}
                aria-invalid={productIdTaken}
              />
            </label>
            <label className={labelCls}>
              <span className={labelText}>Quantité livrée</span>
              <input
                className={inputCls}
                type="number"
                min={1}
                max={1_000_000}
                value={draft.quantity}
                onChange={(e) => set({ quantity: Math.max(1, Math.min(1_000_000, Math.floor(Number(e.target.value) || 1))) })}
              />
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 text-sm">
              <span className={labelText}>Visuels</span>
              <input
                type="number"
                min={1}
                max={3}
                value={draft.models.length}
                onChange={(e) => setModelCount(Number(e.target.value))}
                className={`${inputCls} w-20`}
              />
            </label>
            <div className="flex flex-wrap gap-4">
              {draft.models.map((m, i) => (
                <div key={i} className="flex w-36 flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => uploadModel(i)}
                    disabled={uploading !== null}
                    aria-label={`Choisir le visuel ${i + 1}`}
                    className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-line bg-bg hover:border-primary"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {m.imageUrl ? <img src={m.imageUrl} alt="" className="size-full object-contain p-2" /> : null}
                    <span className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-primary text-white shadow">
                      {uploading === i ? <span className="size-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <IconPlus size={16} />}
                    </span>
                  </button>
                  {m.imageUrl && (
                    <button
                      type="button"
                      className="self-start text-xs text-danger hover:underline"
                      onClick={() => set({ models: draft.models.map((x, j) => (j === i ? { label: x.label } : x)) })}
                    >
                      Retirer l&apos;image
                    </button>
                  )}
                  <input
                    className={inputCls}
                    value={m.label}
                    maxLength={40}
                    placeholder={`Visuel ${i + 1} (optionnel)`}
                    onChange={(e) => set({ models: draft.models.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex w-full flex-none flex-col divide-y divide-line rounded-xl border border-line px-4 py-2 lg:w-80">
            <div className="py-2">
              <label className="flex items-center justify-between gap-3 py-1 text-sm">
                <span>Fond</span>
                <select
                  className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
                  value={draft.style.bgType}
                  onChange={(e) => setStyle({ bgType: e.target.value as ItemStyle['bgType'] })}
                >
                  <option value="solid">Couleur unie</option>
                  <option value="linear">Dégradé linéaire</option>
                  <option value="radial">Dégradé radial</option>
                </select>
              </label>
              <ColorField label={draft.style.bgType === 'solid' ? 'Couleur de fond' : 'Dégradé — couleur 1'} value={draft.style.bg1} onChange={(v) => setStyle({ bg1: v })} />
              {draft.style.bgType !== 'solid' && <ColorField label="Dégradé — couleur 2" value={draft.style.bg2} onChange={(v) => setStyle({ bg2: v })} />}
            </div>
            <div className="py-2">
              <ColorField label="Police du titre" value={draft.style.titleColor} onChange={(v) => setStyle({ titleColor: v })} />
              <ColorField label="Fond du titre" value={draft.style.titleBg} onChange={(v) => setStyle({ titleBg: v })} allowNone />
              <Toggle label="Contour" checked={draft.style.titleOutline} onChange={(v) => setStyle({ titleOutline: v })} />
              <Toggle label="Ombre" checked={draft.style.titleShadow} onChange={(v) => setStyle({ titleShadow: v })} />
              <ColorField label="Police du sous-titre" value={draft.style.subtitleColor} onChange={(v) => setStyle({ subtitleColor: v })} />
            </div>
            <div className="py-2">
              <ColorField label="Police du prix" value={draft.style.priceColor} onChange={(v) => setStyle({ priceColor: v })} />
              <ColorField label="Fond du prix" value={draft.style.priceBg} onChange={(v) => setStyle({ priceBg: v })} allowNone />
              <Toggle label="Contour" checked={draft.style.priceOutline} onChange={(v) => setStyle({ priceOutline: v })} />
              <Toggle label="Ombre" checked={draft.style.priceShadow} onChange={(v) => setStyle({ priceShadow: v })} />
            </div>
            <div className="py-2">
              <Slider label="Bordure" value={draft.style.borderWidth} min={0} max={10} unit="px" onChange={(v) => setStyle({ borderWidth: v })} />
              <ColorField label="↳ Couleur" value={draft.style.borderColor} onChange={(v) => setStyle({ borderColor: v })} />
              <Toggle label="Coins arrondis" checked={draft.style.rounded} onChange={(v) => setStyle({ rounded: v })} />
              <Toggle label="Ombre portée" checked={draft.style.shadow} onChange={(v) => setStyle({ shadow: v })} />
            </div>
          </div>
          <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(250px,1fr))] content-start items-center justify-items-center gap-6 rounded-xl bg-bg p-6">
            {([1, 2, 3, 4, 5, 6] as LayoutId[]).map((l) => (
              <ItemCard
                key={l}
                item={{ ...draft, layout: l, subtitle: draft.subtitle || (l === 4 || l === 5 ? '' : 'Sous-titre') }}
                grid={previewGrid}
                currency={currency}
                selected={draft.layout === l}
                onClick={() => set({ layout: l })}
                label={`Mise en page ${l}`}
              />
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        {editing && (
          <button type="button" onClick={remove} disabled={pending} className="rounded-lg px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10">
            Supprimer
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onClose} className="rounded-lg bg-cancel px-5 py-2 text-sm font-semibold text-white hover:opacity-90">
          Annuler
        </button>
        {tab === 'info' ? (
          <button type="button" onClick={next} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:opacity-90">
            Suivant
          </button>
        ) : (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter'} {!editing && !pending && <IconPlus size={16} />}
          </button>
        )}
      </div>
    </Modal>
  );
}
