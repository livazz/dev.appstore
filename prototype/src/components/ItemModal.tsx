import { useState } from 'react';
import type { App, ItemStyle, LayoutId, StoreItem } from '../types';
import { DEFAULT_STYLE, ITEM_TYPES, PERIODS, PRICE_TIERS } from '../lib/constants';
import { money, slug, uid } from '../lib/format';
import { pickImage } from '../lib/image';
import { deleteItem, saveItem } from '../lib/store';
import { Modal } from './Modal';
import { ColorField, Slider, Toggle } from './Controls';
import { ItemCard } from './ItemCard';
import { IconPlus } from './Icons';

function blankItem(app: App): StoreItem {
  // Le nouvel article reprend le style du dernier article créé pour garder une boutique cohérente.
  const last = app.items[app.items.length - 1];
  return {
    id: uid('itm_'),
    productId: '',
    type: 'consumable',
    period: 'month',
    title: '',
    subtitle: '',
    keywords: [],
    price: 4.99,
    oldPrice: null,
    models: [{ label: '' }],
    layout: last?.layout ?? 4,
    style: last ? { ...last.style } : { ...DEFAULT_STYLE },
    createdAt: Date.now(),
  };
}

export function ItemModal({ app, item, onClose }: { app: App; item?: StoreItem; onClose: () => void }) {
  const editing = !!item;
  const [draft, setDraft] = useState<StoreItem>(() => (item ? structuredClone(item) : blankItem(app)));
  const [tab, setTab] = useState<'info' | 'layout'>('info');
  const [kw, setKw] = useState(draft.keywords.join(', '));
  const [error, setError] = useState('');

  const set = (p: Partial<StoreItem>) => setDraft((d) => ({ ...d, ...p }));
  const setStyle = (p: Partial<ItemStyle>) => setDraft((d) => ({ ...d, style: { ...d.style, ...p } }));

  const productIdTaken = app.items.some((i) => i.id !== draft.id && i.productId && i.productId === draft.productId);

  const validate = () => {
    if (!draft.title.trim()) return "Le titre de l'article est obligatoire.";
    if (productIdTaken) return 'Cet identifiant produit est déjà utilisé dans cette app.';
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
    const keywords = kw.split(',').map((k) => k.trim()).filter(Boolean);
    saveItem(app.id, {
      ...draft,
      title: draft.title.trim(),
      productId: draft.productId.trim() || slug(draft.title) || draft.id,
      keywords,
    });
    onClose();
  };

  const setModelCount = (n: number) => {
    const c = Math.max(1, Math.min(3, n));
    const models = [...draft.models];
    while (models.length < c) models.push({ label: '' });
    set({ models: models.slice(0, c) });
  };

  const isSub = draft.type === 'auto_renewable' || draft.type === 'non_renewing';
  const previewGrid = { width: 150, height: 200 };

  return (
    <Modal onClose={onClose} wide label={editing ? "Modifier l'article" : 'Nouvel article'}>
      <div className="seg-tabs">
        <button className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>
          Infos article
        </button>
        <button className={tab === 'layout' ? 'active' : ''} onClick={next}>
          Mise en page
        </button>
      </div>

      {tab === 'info' ? (
        <div className="modal-body info-form">
          <fieldset className="type-grid">
            <legend>Type</legend>
            {ITEM_TYPES.map((t) => (
              <label key={t.value} className="check">
                <input type="checkbox" checked={draft.type === t.value} onChange={() => set({ type: t.value })} />
                <span>{t.label}</span>
              </label>
            ))}
          </fieldset>

          <div className="form-grid">
            <label className="field">
              <span>Titre de l'article</span>
              <input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Sac de gemmes" autoFocus />
            </label>
            <label className="field">
              <span>Sous-titre (optionnel)</span>
              <input value={draft.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder="+15 % offerts" />
            </label>
            <label className="field span2">
              <span>Mots-clés (optionnel) — séparés par une virgule, ils créent les filtres de la boutique</span>
              <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Gemmes, Monnaie, Meilleure offre" />
            </label>
            <label className="field">
              <span>Prix (palier)</span>
              <select value={draft.price} onChange={(e) => set({ price: Number(e.target.value) })}>
                {PRICE_TIERS.map((p) => (
                  <option key={p} value={p}>
                    {money(p, app.currency)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Ancien prix (barré)</span>
              <select
                value={draft.oldPrice ?? ''}
                onChange={(e) => set({ oldPrice: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Aucun</option>
                {PRICE_TIERS.filter((p) => p > draft.price).map((p) => (
                  <option key={p} value={p}>
                    {money(p, app.currency)}
                  </option>
                ))}
              </select>
            </label>
            {isSub && (
              <label className="field">
                <span>Durée</span>
                <select value={draft.period} onChange={(e) => set({ period: e.target.value as StoreItem['period'] })}>
                  {PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Identifiant produit (envoyé à votre jeu)</span>
              <input
                value={draft.productId}
                onChange={(e) => set({ productId: e.target.value.replace(/\s/g, '_') })}
                placeholder={slug(draft.title) || 'gems_1200'}
                className={productIdTaken ? 'invalid' : ''}
              />
            </label>
          </div>

          <div className="models">
            <label className="models-count">
              <span>Visuels</span>
              <input type="number" min={1} max={3} value={draft.models.length} onChange={(e) => setModelCount(Number(e.target.value))} />
            </label>
            <div className="models-row">
              {draft.models.map((m, i) => (
                <div key={i} className="model">
                  <button
                    type="button"
                    className="model-drop"
                    onClick={async () => {
                      const img = await pickImage(600, 600);
                      if (img) set({ models: draft.models.map((x, j) => (j === i ? { ...x, image: img } : x)) });
                    }}
                    aria-label={`Choisir le visuel ${i + 1}`}
                  >
                    {m.image ? <img src={m.image} alt="" /> : null}
                    <span className="model-plus">
                      <IconPlus size={18} />
                    </span>
                  </button>
                  <input
                    value={m.label}
                    placeholder={`Visuel ${i + 1} (optionnel)`}
                    onChange={(e) => set({ models: draft.models.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                  />
                </div>
              ))}
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
      ) : (
        <div className="modal-body layout-editor">
          <div className="style-panel">
            <label className="field compact">
              <span>Fond</span>
              <select value={draft.style.bgType} onChange={(e) => setStyle({ bgType: e.target.value as ItemStyle['bgType'] })}>
                <option value="solid">Couleur unie</option>
                <option value="linear">Dégradé linéaire</option>
                <option value="radial">Dégradé radial</option>
              </select>
            </label>
            <ColorField label={draft.style.bgType === 'solid' ? 'Couleur de fond' : 'Dégradé — couleur 1'} value={draft.style.bg1} onChange={(v) => setStyle({ bg1: v })} />
            {draft.style.bgType !== 'solid' && <ColorField label="Dégradé — couleur 2" value={draft.style.bg2} onChange={(v) => setStyle({ bg2: v })} />}
            <hr />
            <ColorField label="Police du titre" value={draft.style.titleColor} onChange={(v) => setStyle({ titleColor: v })} />
            <ColorField label="Fond du titre" value={draft.style.titleBg} onChange={(v) => setStyle({ titleBg: v })} allowNone />
            <Toggle label="Contour" checked={draft.style.titleOutline} onChange={(v) => setStyle({ titleOutline: v })} />
            <Toggle label="Ombre" checked={draft.style.titleShadow} onChange={(v) => setStyle({ titleShadow: v })} />
            <ColorField label="Police du sous-titre" value={draft.style.subtitleColor} onChange={(v) => setStyle({ subtitleColor: v })} />
            <hr />
            <ColorField label="Police du prix" value={draft.style.priceColor} onChange={(v) => setStyle({ priceColor: v })} />
            <ColorField label="Fond du prix" value={draft.style.priceBg} onChange={(v) => setStyle({ priceBg: v })} allowNone />
            <Toggle label="Contour" checked={draft.style.priceOutline} onChange={(v) => setStyle({ priceOutline: v })} />
            <Toggle label="Ombre" checked={draft.style.priceShadow} onChange={(v) => setStyle({ priceShadow: v })} />
            <hr />
            <Slider label="Bordure" value={draft.style.borderWidth} min={0} max={10} unit="px" onChange={(v) => setStyle({ borderWidth: v })} />
            <ColorField label="↳ Couleur" value={draft.style.borderColor} onChange={(v) => setStyle({ borderColor: v })} />
            <Toggle label="Coins arrondis" checked={draft.style.rounded} onChange={(v) => setStyle({ rounded: v })} />
            <Toggle label="Ombre portée" checked={draft.style.shadow} onChange={(v) => setStyle({ shadow: v })} />
          </div>
          <div className="layout-grid">
            {([1, 2, 3, 4, 5, 6] as LayoutId[]).map((l) => (
              <div key={l} className="layout-cell">
                <ItemCard
                  item={{ ...draft, layout: l, subtitle: draft.subtitle || (l === 4 || l === 5 ? '' : 'Sous-titre') }}
                  grid={previewGrid}
                  currency={app.currency}
                  selected={draft.layout === l}
                  onClick={() => set({ layout: l })}
                  label={`Mise en page ${l}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="modal-foot">
        {editing && (
          <button
            className="btn ghost danger"
            onClick={() => {
              if (confirm(`Supprimer « ${item!.title} » ?`)) {
                deleteItem(app.id, item!.id);
                onClose();
              }
            }}
          >
            Supprimer
          </button>
        )}
        <span className="spacer" />
        <button className="btn cancel" onClick={onClose}>
          Annuler
        </button>
        {tab === 'info' ? (
          <button className="btn primary" onClick={next}>
            Suivant
          </button>
        ) : (
          <button className="btn primary" onClick={save}>
            {editing ? 'Enregistrer' : 'Ajouter'} {!editing && <IconPlus size={18} />}
          </button>
        )}
      </div>
    </Modal>
  );
}
