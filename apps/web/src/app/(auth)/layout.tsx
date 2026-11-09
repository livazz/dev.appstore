import Link from 'next/link';

/** Mise en page des pages d'authentification : logo + carte centrée, sobre (inspirée d'App Store Connect). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2 rounded-[var(--radius)] focus-visible:outline-2 focus-visible:outline-primary">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-brand text-lg font-black text-ink">
            W
          </span>
          <span className="text-lg font-semibold tracking-tight text-ink">Wolleen</span>
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12">{children}</main>
    </div>
  );
}
