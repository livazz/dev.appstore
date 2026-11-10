'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Galerie horizontale de captures d'écran + visionneuse plein écran (<dialog> modal natif :
 * piège de focus et Échap fournis par le navigateur ; flèches ← → pour naviguer).
 * Les URL reçues doivent déjà être filtrées par `safeImageUrl` (fait par la page serveur).
 */
export function ScreenshotGallery({ urls, gameName }: { urls: string[]; gameName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const count = urls.length;

  const open = (i: number) => {
    setIndex(i);
    dialogRef.current?.showModal();
  };
  const close = useCallback(() => dialogRef.current?.close(), []);
  const go = useCallback((delta: number) => setIndex((i) => (i == null ? i : (i + delta + count) % count)), [count]);

  // Fermeture (Échap, bouton, fond) : on rend le focus à la miniature affichée en dernier.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onClose = () =>
      setIndex((i) => {
        if (i != null) thumbs.current[i]?.focus();
        return null;
      });
    d.addEventListener('close', onClose);
    return () => d.removeEventListener('close', onClose);
  }, []);

  if (!count) return null;
  const label = (i: number) => `Capture d’écran ${i + 1} sur ${count} de ${gameName}`;

  return (
    <>
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2" aria-label={`Captures d’écran de ${gameName}`}>
        {urls.map((url, i) => (
          <li key={url} className="flex-none snap-start">
            <button
              ref={(el) => {
                thumbs.current[i] = el;
              }}
              type="button"
              onClick={() => open(i)}
              aria-label={`Agrandir : ${label(i)}`}
              className="block h-44 overflow-hidden rounded-[var(--radius)] bg-bg ring-1 ring-line focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-56"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" loading="lazy" className="h-full w-auto max-w-[80vw] object-cover" />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label={index != null ? label(index) : `Captures d’écran de ${gameName}`}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/90 p-0 text-white backdrop:bg-black/60"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            go(1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            go(-1);
          }
        }}
      >
        {index != null && (
          <div className="flex h-full flex-col" onClick={(e) => e.target === e.currentTarget && close()}>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm" aria-live="polite">
                {index + 1} / {count}
              </span>
              <button
                type="button"
                onClick={close}
                autoFocus
                aria-label="Fermer la visionneuse"
                className="grid size-11 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onClick={(e) => e.target === e.currentTarget && close()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[index]} alt={label(index)} className="max-h-full max-w-full object-contain" />
              {count > 1 && (
                <>
                  <NavButton side="left" onClick={() => go(-1)} label="Capture précédente" />
                  <NavButton side="right" onClick={() => go(1)} label="Capture suivante" />
                </>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

function NavButton({ side, onClick, label }: { side: 'left' | 'right'; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 ${side === 'left' ? 'left-3' : 'right-3'} grid size-12 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={side === 'left' ? 'm12 4-6 6 6 6' : 'm8 4 6 6-6 6'} />
      </svg>
    </button>
  );
}
