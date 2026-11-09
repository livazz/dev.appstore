/** Squelette de l'onglet « Ventes et tendances » (mêmes espacements que la page). Le cadre du jeu (onglets) reste affiché. */
function Bone({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-black/[.07] motion-reduce:animate-none ${className}`} />;
}

export default function SalesLoading() {
  return (
    <div className="flex flex-col gap-5 py-6">
      <p role="status" className="sr-only">
        Chargement des ventes…
      </p>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="space-y-2">
          <Bone className="h-8 w-60 max-w-full" />
          <Bone className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-3">
          <Bone className="h-11 w-56" />
          <Bone className="h-11 w-36" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`space-y-2 rounded-[var(--radius)] border border-line bg-surface p-5 ${i === 2 ? 'col-span-2 lg:col-span-1 lg:row-span-2' : ''}`}
          >
            <Bone className="h-3 w-24" />
            <Bone className="h-7 w-32" />
            <Bone className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
        <Bone className="h-5 w-40" />
        <Bone className="mt-4 h-52 w-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        {[5, 8].map((rows, k) => (
          <div key={k} className="space-y-3 rounded-[var(--radius)] border border-line bg-surface p-5">
            <Bone className="h-5 w-36" />
            {Array.from({ length: rows }, (_, i) => (
              <Bone key={i} className="h-6 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
