'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Menu compte replié des petits écrans : <details>/<summary> natif (fonctionne sans JS, clavier compris),
 * refermé en plus à la navigation, au clic à l'extérieur et sur Échap.
 */
export function AccountMenuDisclosure({
  summary,
  summaryLabel,
  className,
  children,
}: {
  summary: React.ReactNode;
  summaryLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key !== 'Escape' || !el?.open) return;
      el.open = false;
      el.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <details ref={ref} className={`group relative ${className ?? ''}`}>
      <summary
        aria-label={summaryLabel}
        className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-1 rounded-[var(--radius)] px-1.5 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
      >
        {summary}
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 text-ink-2 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 8 5 5 5-5" />
        </svg>
      </summary>
      <div className="absolute top-full right-0 z-40 mt-1 flex w-60 flex-col rounded-xl border border-line bg-surface p-1.5 shadow-xl">{children}</div>
    </details>
  );
}
