'use client';

import { useEffect, useRef, useState } from 'react';

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Repli (contexte non sécurisé, permissions) : sélection d'une zone de texte temporaire.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Bouton « Copier » des blocs de code, avec annonce aux lecteurs d'écran. */
export function CopyButton({ text, label = 'Copier le code' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onClick = async () => {
    const ok = await copyText(text);
    setState(ok ? 'ok' : 'error');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
      >
        {state === 'ok' ? (
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
            <path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h6.5" strokeLinecap="round" />
          </svg>
        )}
        <span aria-hidden="true">{state === 'ok' ? 'Copié' : state === 'error' ? 'Échec' : 'Copier'}</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'ok' ? 'Code copié dans le presse-papiers.' : state === 'error' ? 'La copie a échoué.' : ''}
      </span>
    </>
  );
}
