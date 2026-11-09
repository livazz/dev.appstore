import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { db } from '@devappstore/db';
import { requireGameAccess } from '@/server/session';
import { getGame, listItems, StudioError } from '@/server/studio-logic';
import { toEditorGame, toEditorItem } from '@/lib/studio-types';
import { StoreEditor } from '@/components/studio/StoreEditor';

export const dynamic = 'force-dynamic';

/** Onglet « Boutique » : éditeur de la boutique du jeu (maquettes PDF). */
export default async function GameStorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireGameAccess(id);
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') notFound();
    throw e;
  }
  let game;
  try {
    game = await getGame(db, id);
  } catch (e) {
    if (e instanceof StudioError) notFound();
    throw e;
  }
  const items = await listItems(db, id);

  return (
    <Suspense>
      <StoreEditor key={game.id} initialGame={toEditorGame(game)} initialItems={items.map(toEditorItem)} />
    </Suspense>
  );
}
