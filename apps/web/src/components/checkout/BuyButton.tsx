'use client';

import Link from 'next/link';

/**
 * Bouton « Acheter » d'un article — PLACEHOLDER (tâche « catalog »).
 * La tâche « payments » remplace son contenu (liaison → POST /api/checkout → Stripe) en gardant exactement ces props.
 */
export function BuyButton({ gameId, gameSlug, itemId }: { gameId: string; gameSlug: string; itemId: string }) {
  return (
    <Link
      href={`/games/${encodeURIComponent(gameSlug)}/link?item=${encodeURIComponent(itemId)}`}
      data-game-id={gameId}
      className="inline-flex h-11 w-full items-center justify-center rounded-[var(--radius)] bg-primary px-6 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      Acheter
    </Link>
  );
}
