'use client';

import { useState } from 'react';
import { ART_LIBRARY } from '@/lib/art-library';

/** Grille de la bibliothèque d'illustrations de la plateforme, affichée dans la fenêtre d'article. */
export function ArtLibraryPicker({ selected, onPick, onClose }: { selected?: string; onPick: (url: string, label: string) => void; onClose: () => void }) {
  const [cat, setCat] = useState(0);
  const current = ART_LIBRARY[cat]!;
  return (
    <div className="rounded-2xl border border-line bg-bg p-3" role="group" aria-label="Bibliothèque d'illustrations">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Bibliothèque d&apos;illustrations</p>
        <button type="button" onClick={onClose} className="text-xs font-medium text-ink-2 hover:text-ink hover:underline">
          Fermer
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ART_LIBRARY.map((c, i) => (
          <button
            key={c.title}
            type="button"
            onClick={() => setCat(i)}
            aria-pressed={i === cat}
            className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-white"
          >
            {c.title}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {current.items.map((a) => (
          <button
            key={a.url}
            type="button"
            onClick={() => onPick(a.url, a.label)}
            title={a.label}
            aria-label={a.label}
            aria-current={selected === a.url ? 'true' : undefined}
            className="group flex flex-col items-center gap-1 rounded-xl border-2 border-transparent bg-[radial-gradient(circle,#5d6cf0,#2c37a8)] p-1.5 hover:border-primary aria-[current=true]:border-primary"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt="" loading="lazy" className="aspect-square w-full object-contain transition group-hover:scale-105" />
            <span className="w-full truncate text-center text-[11px] font-medium text-white">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
