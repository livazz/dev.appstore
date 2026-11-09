'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from './icons';

export function Modal({ children, onClose, wide, label }: { children: ReactNode; onClose: () => void; wide?: boolean; label: string }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`relative w-full rounded-2xl bg-surface p-6 shadow-2xl ${wide ? 'max-w-5xl' : 'max-w-lg'}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-3 right-3 grid size-11 place-items-center rounded-full text-ink-2 hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
        >
          <IconClose size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}
