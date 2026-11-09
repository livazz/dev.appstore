'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Rafraîchit la page serveur (router.refresh) tant que `active` est vrai, toutes les `intervalMs`,
 * pendant au plus `maxMs` ; propose ensuite un bouton « Actualiser ».
 */
export function AutoRefresh({ active, intervalMs = 2000, maxMs = 3 * 60_000 }: { active: boolean; intervalMs?: number; maxMs?: number }) {
  const router = useRouter();
  const [round, setRound] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > maxMs) {
        clearInterval(t);
        setTimedOut(true);
        return;
      }
      if (!document.hidden) router.refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, maxMs, router, round]);

  if (!active) return null;
  if (!timedOut) return <span className="sr-only">Actualisation automatique en cours.</span>;
  return (
    <p className="mt-4 text-center text-sm text-ink-2">
      Cela prend plus de temps que prévu.{' '}
      <button
        type="button"
        className="font-semibold text-primary hover:underline"
        onClick={() => {
          setTimedOut(false);
          setRound((r) => r + 1);
          router.refresh();
        }}
      >
        Actualiser
      </button>
    </p>
  );
}
