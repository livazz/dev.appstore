'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CopyButton } from './CopyButton';

export interface CodeTab {
  /** Libellé de l'onglet (« Node », « Python »…) : sert aussi de préférence partagée entre les blocs. */
  label: string;
  code: string;
  /** Titre affiché au-dessus du code (nom de fichier…). */
  title?: string;
}

const STORAGE_KEY = 'docs.lang';
const EVENT = 'docs-lang-change';

function readPref(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Onglets de langage (motif ARIA « tabs », flèches gauche/droite, Début/Fin).
 * Choisir un langage le sélectionne dans tous les blocs de la page qui le proposent, et le mémorise.
 */
export function CodeTabs({ tabs, ariaLabel = 'Langage' }: { tabs: CodeTab[]; ariaLabel?: string }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const apply = (label: string | null) => {
      if (!label) return;
      const i = tabs.findIndex((t) => t.label === label);
      if (i >= 0) setActive(i);
    };
    apply(readPref());
    const onChange = (e: Event) => apply((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [tabs]);

  const select = (i: number, focus = false) => {
    setActive(i);
    if (focus) refs.current[i]?.focus();
    const label = tabs[i].label;
    try {
      window.localStorage.setItem(STORAGE_KEY, label);
    } catch {
      /* stockage indisponible : préférence non mémorisée */
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: label }));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const n = tabs.length;
    const next = { ArrowRight: (active + 1) % n, ArrowLeft: (active - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next, true);
  };

  const tab = tabs[active];
  return (
    <div className="my-5 min-w-0 overflow-hidden rounded-[var(--radius)] bg-[#17171a] text-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pr-2">
        <div role="tablist" aria-label={ariaLabel} className="flex min-w-0 overflow-x-auto">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${i}`}
              aria-selected={i === active}
              aria-controls={`${base}-panel`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={onKeyDown}
              className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                i === active ? 'border-brand text-white' : 'border-transparent text-white/60 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CopyButton text={tab.code} label={`Copier le code (${tab.label})`} />
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`}>
        {tab.title && <p className="border-b border-white/10 px-4 py-1.5 font-mono text-xs text-white/50">{tab.title}</p>}
        <pre tabIndex={0} className="overflow-x-auto p-4 text-[13px] leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
          <code className="font-mono">{tab.code}</code>
        </pre>
      </div>
    </div>
  );
}
