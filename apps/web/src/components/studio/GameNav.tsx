'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { GameStatus } from '@devappstore/core';
import { deleteGame, publishGame, unpublishGame } from '@/server/studio';
import { IconExternal, IconMore, IconPlus } from './icons';

const roundBtn = 'flex size-9 items-center justify-center rounded-full transition';

/** Boutons « + » (ajouter un article) et « ⋯ » (boutique publique, publication, suppression) du fil d'Ariane. */
export function GameActions({ gameId, slug, name, status }: { gameId: string; slug: string; name: string; status: GameStatus }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError('');
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Action impossible.');
      else {
        setOpen(false);
        after?.();
        router.refresh();
      }
    });
  };

  const item = 'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-bg disabled:opacity-50';

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/studio/games/${gameId}?new=1`}
        scroll={false}
        className={`${roundBtn} bg-ink text-white hover:opacity-85`}
        aria-label="Ajouter un article"
        title="Ajouter un article"
      >
        <IconPlus size={18} />
      </Link>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Plus d'actions"
          aria-haspopup="menu"
          aria-expanded={open}
          className={`${roundBtn} bg-surface text-ink ring-1 ring-line hover:bg-bg`}
        >
          <IconMore size={18} />
        </button>
        {open && (
          <div role="menu" className="absolute top-11 right-0 z-40 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-xl sm:right-auto sm:left-0">
            <a role="menuitem" href={`/games/${slug}`} target="_blank" rel="noreferrer" className={item}>
              <span>
                Voir la boutique publique
                {status !== 'live' && <span className="block text-xs text-ink-3">Visible par les joueurs une fois publiée</span>}
              </span>
              <IconExternal size={14} />
            </a>
            {status === 'live' ? (
              <button role="menuitem" type="button" className={item} disabled={pending} onClick={() => act(() => unpublishGame(gameId))}>
                Repasser en brouillon
              </button>
            ) : (
              <button role="menuitem" type="button" className={item} disabled={pending || status === 'suspended'} onClick={() => act(() => publishGame(gameId))}>
                <span>
                  Soumettre et publier
                  <span className="block text-xs text-ink-3">Phase 1 : la boutique passe directement en ligne</span>
                </span>
              </button>
            )}
            <hr className="my-1 border-line" />
            <button
              role="menuitem"
              type="button"
              className={`${item} text-danger`}
              disabled={pending}
              onClick={() => {
                if (confirm(`Supprimer le jeu « ${name} » et toute sa boutique ? Cette action est définitive.`))
                  act(() => deleteGame(gameId), () => router.push('/studio'));
              }}
            >
              Supprimer le jeu
            </button>
            {error && (
              <p role="alert" className="m-1 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
      {error && !open && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Onglets Boutique | Ventes et tendances | Intégration | Importer. */
export function GameTabs({ gameId }: { gameId: string }) {
  const pathname = usePathname();
  const base = `/studio/games/${gameId}`;
  const tabs = [
    { href: base, label: 'Boutique', active: pathname === base },
    { href: `${base}/sales`, label: 'Ventes et tendances', active: pathname.startsWith(`${base}/sales`) },
    { href: `${base}/integration`, label: 'Intégration', active: pathname.startsWith(`${base}/integration`) },
    { href: `${base}/import`, label: 'Importer', active: pathname.startsWith(`${base}/import`) },
  ];
  return (
    <nav aria-label="Sections du jeu" className="mb-6 flex gap-6 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? 'page' : undefined}
          className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold whitespace-nowrap transition ${t.active ? 'border-primary text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
