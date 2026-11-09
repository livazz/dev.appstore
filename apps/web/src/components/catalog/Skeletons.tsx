/** Squelettes de chargement du site joueur (affichés pendant le rendu serveur des pages catalogue). */

export function Bone({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-black/[.07] motion-reduce:animate-none ${className}`} />;
}

/** Annonce discrète pour les lecteurs d'écran. */
function Loading({ label }: { label: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2">
      <Bone className="size-16 flex-none rounded-[14px]" />
      <div className="flex-1 space-y-2">
        <Bone className="h-4 w-2/3" />
        <Bone className="h-3 w-1/2" />
        <Bone className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** Rangées « À la une » + catégories de l'accueil. */
export function CatalogSkeleton() {
  return (
    <div>
      <Loading label="Chargement du catalogue…" />
      <section className="mt-10">
        <Bone className="h-7 w-36" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </section>
      {[0, 1].map((r) => (
        <section key={r} className="mt-10">
          <Bone className="h-7 w-32" />
          <div className="mt-4 flex gap-4 overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-[148px] flex-none space-y-2 sm:w-[168px]">
                <Bone className="size-[148px] rounded-[32px]" />
                <Bone className="h-4 w-3/4" />
                <Bone className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Page de recherche : titre, catégories, résultats. */
export function SearchSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <Loading label="Recherche en cours…" />
      <Bone className="h-8 w-64 max-w-full" />
      <div className="mt-5 flex gap-2 overflow-hidden py-1">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Bone key={i} className="h-11 w-24 flex-none rounded-full" />
        ))}
      </div>
      <Bone className="mt-8 h-6 w-28" />
      <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
      <Bone className="mt-10 h-6 w-32" />
      <div className="mt-3 space-y-px overflow-hidden rounded-[var(--radius)] bg-surface">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Bone className="size-14 flex-none rounded-lg" />
            <div className="flex-1 space-y-2">
              <Bone className="h-4 w-1/2" />
              <Bone className="h-3 w-1/3" />
            </div>
            <Bone className="h-5 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
