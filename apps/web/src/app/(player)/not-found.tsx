import Link from 'next/link';

export default function PlayerNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <p className="text-5xl font-black text-ink-3">404</p>
      <h1 className="mt-4 text-2xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-ink-2">Ce jeu n’existe pas ou n’est pas encore disponible sur Dev AppStore.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-[var(--radius)] bg-primary px-6 font-semibold text-white hover:opacity-90">
        Retour au catalogue
      </Link>
    </div>
  );
}
