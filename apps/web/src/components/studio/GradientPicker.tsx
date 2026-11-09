'use client';

import { useState } from 'react';
import type { GameTheme } from '@wolleen/core';
import { panelBackground } from '@/components/store/StorePanel';
import { IconClose } from './icons';

type Gradient = GameTheme['gradient'];

const segBtn = (active: boolean) =>
  `rounded-lg border px-3 py-1.5 text-sm font-medium ${active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:bg-bg'}`;

/** Sélecteur de dégradé 2 couleurs (linéaire / radial, activé / désactivé) pour le fond de la boutique. */
export function GradientPicker({ value, onChange, onClose }: { value: Gradient; onChange: (g: Gradient) => void; onClose: () => void }) {
  const [active, setActive] = useState<'c1' | 'c2'>('c1');
  const [hex, setHex] = useState(value[active].replace('#', ''));
  const color = value[active];

  const setColor = (c: string) => {
    onChange({ ...value, [active]: c, enabled: true });
    setHex(c.replace('#', ''));
  };

  return (
    <div
      role="dialog"
      aria-label="Dégradé de fond"
      className="absolute top-16 left-3 z-20 w-[min(440px,calc(100%-24px))] rounded-2xl border border-line bg-surface p-4 text-left shadow-xl"
    >
      <button type="button" onClick={onClose} aria-label="Fermer" className="absolute top-3 right-3 rounded-full p-1 text-ink-2 hover:bg-bg">
        <IconClose size={18} />
      </button>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          <label className="relative block size-32 cursor-pointer overflow-hidden rounded-xl border border-line" style={{ background: color }}>
            <span className="sr-only">Choisir la couleur</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
          </label>
          <div className="flex items-center gap-1 rounded-lg border border-line px-2 py-1">
            <span className="text-ink-3">#</span>
            <input
              value={hex}
              maxLength={6}
              aria-label="Code hexadécimal"
              className="w-16 font-mono text-sm uppercase outline-none"
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9a-f]/gi, '');
                setHex(v);
                if (v.length === 6) onChange({ ...value, [active]: '#' + v.toLowerCase(), enabled: true });
              }}
            />
            <span className="text-[10px] font-semibold text-ink-3">HEX</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div>
            <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase">Couleurs</h4>
            <div className="flex gap-2">
              {(['c1', 'c2'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={k === 'c1' ? 'Couleur du haut' : 'Couleur du bas'}
                  aria-pressed={active === k}
                  onClick={() => {
                    setActive(k);
                    setHex(value[k].replace('#', ''));
                  }}
                  className={`size-9 rounded-lg border-2 ${active === k ? 'border-primary ring-2 ring-primary/30' : 'border-line'}`}
                  style={{ background: value[k] }}
                />
              ))}
            </div>
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase">Style</h4>
            <div className="flex gap-2">
              <button type="button" className={segBtn(value.style === 'linear')} onClick={() => onChange({ ...value, style: 'linear' })}>Linéaire</button>
              <button type="button" className={segBtn(value.style === 'radial')} onClick={() => onChange({ ...value, style: 'radial' })}>Radial</button>
            </div>
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase">Aperçu</h4>
            <div className="flex gap-2">
              <button type="button" className={segBtn(value.enabled)} onClick={() => onChange({ ...value, enabled: true })}>Activé</button>
              <button type="button" className={segBtn(!value.enabled)} onClick={() => onChange({ ...value, enabled: false })}>Désactivé</button>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 h-10 rounded-lg border border-line" style={{ background: panelBackground({ ...value, enabled: true }) }} />
    </div>
  );
}
