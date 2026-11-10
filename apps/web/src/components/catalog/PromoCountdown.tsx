'use client';

import { useEffect, useState } from 'react';
import { formatRemaining } from '@/lib/promo';

/**
 * Compte à rebours jusqu'à la fin d'une promo. Le premier rendu utilise l'heure du serveur (`serverNow`) pour éviter
 * un écart d'hydratation, puis l'heure du navigateur, rafraîchie toutes les 30 s.
 */
export function PromoCountdown({ endsAt, serverNow, className = '' }: { endsAt: string; serverNow: number; className?: string }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const left = new Date(endsAt).getTime() - now;
  return (
    <span className={className}>
      <time dateTime={endsAt}>{left > 0 ? `Encore ${formatRemaining(left)}` : 'Promo terminée'}</time>
    </span>
  );
}
