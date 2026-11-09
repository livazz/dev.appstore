import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { App, StoreItem } from '../types';
import { updateApp, useApp } from '../lib/store';
import { pickImage } from '../lib/image';
import { GRID_LIMITS } from '../lib/constants';
import { StorePanel } from '../components/StorePanel';
import { GradientPicker } from '../components/GradientPicker';
import { ItemModal } from '../components/ItemModal';
import { Slider } from '../components/Controls';
import { IconClose, IconEdit, IconGradient, IconPlus } from '../components/Icons';

function InlineEdit({ value, onSave, className, label }: { value: string; onSave: (v: string) => void; className?: string; label: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  if (editing)
    return (
      <input
        className={'inline-input ' + (className ?? '')}
        value={v}
        autoFocus
        aria-label={label}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          onSave(v.trim() || value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setV(value);
            setEditing(false);
          }
        }}
      />
    );
  return (
    <button className={'inline-edit ' + (className ?? '')} onClick={() => { setV(value); setEditing(true); }} title={`Modifier : ${label}`}>
      {value}
      <IconEdit size={className === 'app-name' ? 22 : 14} />
    </button>
  );
}

export function LinkedStatus({ app }: { app: App }) {
  return app.webhookUrl ? (
    <span className="status ok"><i />Liée au jeu</span>
  ) : (
    <span className="status warn"><i />Non liée — configurez l'intégration</span>
  );
}

export function AppEditor() {
  const { appId } = useParams();
  const app = useApp(appId)!;
  const [gradOpen, setGradOpen] = useState(false);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [adding, setAdding] = useState(false);

  const set = (p: Partial<App>) => updateApp(app.id, p);

  const bannerTools = (
    <>
      <button className="tool tl" onClick={() => setGradOpen((o) => !o)} title="Dégradé de fond" aria-label="Dégradé de fond">
        <IconGradient size={22} />
      </button>
      <button
        className="tool tr"
        onClick={async () => {
          const img = await pickImage(1600, 500);
          if (img) set({ bannerImage: img });
        }}
        title="Changer la bannière"
        aria-label="Changer la bannière"
      >
        <IconEdit size={22} />
      </button>
      {app.bannerImage ? (
        <button className="tool remove" onClick={() => set({ bannerImage: undefined })} title="Retirer la bannière" aria-label="Retirer la bannière">
          <IconClose size={18} />
        </button>
      ) : (
        <p className="banner-hint">Bannière de l'app — PNG transparent conseillé (1600×400). Avec un fond transparent, choisissez deux couleurs pour générer un dégradé.</p>
      )}
      {gradOpen && <GradientPicker value={app.gradient} onChange={(g) => set({ gradient: g })} onClose={() => setGradOpen(false)} />}
    </>
  );

  const header = (
    <>
      <button
        className="app-icon editable"
        onClick={async () => {
          const img = await pickImage(300, 300);
          if (img) set({ icon: img });
        }}
        aria-label="Changer l'icône (300×300)"
        title="Icône 300×300, affichée en 120×120"
      >
        {app.icon ? <img src={app.icon} alt="" /> : null}
        <span className="icon-edit"><IconEdit size={30} /></span>
      </button>
      <div className="app-meta">
        <InlineEdit className="app-name" value={app.name} onSave={(v) => set({ name: v })} label="Nom de l'app" />
        <InlineEdit value={app.subtitle} onSave={(v) => set({ subtitle: v })} label="Sous-titre" />
        <InlineEdit value={app.publisher} onSave={(v) => set({ publisher: v })} label="Éditeur" />
        <LinkedStatus app={app} />
      </div>
    </>
  );

  const side = (
    <div className="size-panel">
      <Slider label="Hauteur" value={app.grid.height} {...GRID_LIMITS.height} onChange={(v) => set({ grid: { ...app.grid, height: v } })} />
      <Slider label="Largeur" value={app.grid.width} {...GRID_LIMITS.width} onChange={(v) => set({ grid: { ...app.grid, width: v } })} />
      <Slider label="Marge" value={app.grid.margin} {...GRID_LIMITS.margin} onChange={(v) => set({ grid: { ...app.grid, margin: v } })} />
    </div>
  );

  const addTile = (
    <button className="add-tile" style={{ width: app.grid.width, height: app.grid.height }} onClick={() => setAdding(true)} aria-label="Ajouter un article">
      <span><IconPlus size={22} /></span>
    </button>
  );

  return (
    <>
      <StorePanel app={app} bannerTools={bannerTools} headerSlot={header} sideSlot={side} onItemClick={setEditing} addTile={addTile} />
      {editing && <ItemModal app={app} item={editing} onClose={() => setEditing(null)} />}
      {adding && <ItemModal app={app} onClose={() => setAdding(false)} />}
    </>
  );
}
