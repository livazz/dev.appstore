import { db, games, eq } from '@wolleen/db';

export const dynamic = 'force-dynamic';

// Page temporaire de la vague 0 — remplacée par le catalogue (tâche « catalog »).
export default async function Home() {
  const live = await db.select({ id: games.id, name: games.name, slug: games.slug }).from(games).where(eq(games.status, 'live'));
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">Wolleen</h1>
      <ul className="mt-4 list-disc pl-6">
        {live.map((g) => (
          <li key={g.id}>{g.name}</li>
        ))}
      </ul>
    </main>
  );
}
