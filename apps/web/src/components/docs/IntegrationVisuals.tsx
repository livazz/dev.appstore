import type { ReactNode } from 'react';

/*
 * Illustrations du tutoriel /docs/integration : schéma du parcours d'un achat, aperçu de l'inspecteur Unity
 * (reconstitution en HTML, aux libellés réels du SDK), captures de l'écran de liaison dans un vrai build Unity, cartes
 * de téléchargement.
 */

function Art({ src, className = '' }: { src: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" decoding="async" className={`object-contain ${className}`} />;
}

/** Les trois gestes de l'intégration, en images. */
export function QuickSteps() {
  const steps: { art: string; title: string; text: string }[] = [
    { art: '/art/items/bundle.webp', title: 'Glissez', text: 'Le paquet dans votre projet, puis l’objet « DevAppStore » dans votre première scène.' },
    { art: '/art/site/step-link.webp', title: 'Collez', text: 'La clé publique de votre jeu, copiée depuis l’onglet Intégration.' },
    { art: '/art/site/step-delivered.webp', title: 'Branchez', text: 'La méthode de votre jeu qui donne un objet au joueur. C’est fini.' },
  ];
  return (
    <ol className="my-6 grid gap-3 sm:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="flex flex-col items-center rounded-[16px] bg-ink px-4 py-5 text-center text-white">
          <Art src={s.art} className="size-24 drop-shadow-[0_8px_16px_rgba(0,0,0,.4)]" />
          <p className="mt-3 text-xs font-black tracking-wide text-brand uppercase">Étape {i + 1}</p>
          <p className="text-xl font-bold">{s.title}</p>
          <p className="mt-1 text-sm leading-6 text-white/70">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** Parcours d'un achat, du site au jeu. */
export function FlowDiagram() {
  const nodes: { art: string; where: string; title: string; text: string }[] = [
    { art: '/art/items/gems-2.webp', where: 'Sur le site', title: 'Le joueur achète', text: 'Il paie sur la boutique web de votre jeu.' },
    { art: '/art/items/chest-rare.webp', where: 'Chez Dev AppStore', title: 'L’achat est gardé', text: 'Il attend en sécurité, même si le jeu est fermé.' },
    { art: '/art/site/step-link.webp', where: 'Dans votre jeu', title: 'Le jeu vient le chercher', text: 'Au lancement, au retour dans le jeu, puis toutes les 30 secondes.' },
    { art: '/art/site/step-delivered.webp', where: 'Dans votre jeu', title: 'L’objet est donné', text: 'Votre méthode le crédite, puis le jeu confirme la réception.' },
  ];
  return (
    <figure className="my-6">
      <ol className="grid gap-3 md:grid-cols-4">
        {nodes.map((n, i) => (
          <li key={n.title} className="relative flex items-center gap-3 rounded-[16px] border border-line bg-surface p-4 md:flex-col md:text-center">
            <Art src={n.art} className="size-16 flex-none md:size-20" />
            <div className="min-w-0">
              <p className="text-[11px] font-black tracking-wide text-ink-3 uppercase">{n.where}</p>
              <p className="font-bold text-ink">{n.title}</p>
              <p className="mt-0.5 text-sm leading-5 text-ink-2">{n.text}</p>
            </div>
            {i < nodes.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute -bottom-3.5 left-1/2 z-10 grid size-7 -translate-x-1/2 place-items-center rounded-full bg-brand text-sm font-black text-ink md:top-1/2 md:-right-3.5 md:bottom-auto md:left-auto md:translate-x-0 md:-translate-y-1/2"
              >
                <span className="md:hidden">↓</span>
                <span className="hidden md:inline">→</span>
              </span>
            )}
          </li>
        ))}
      </ol>
      <figcaption className="mt-3 text-center text-xs text-ink-3">Un achat n’est jamais perdu : tant que le jeu n’a pas confirmé, il est reproposé.</figcaption>
    </figure>
  );
}

function Field({ label, children, highlight = false }: { label: string; children: ReactNode; highlight?: boolean }) {
  return (
    <div className={`grid grid-cols-[42%_1fr] items-center gap-2 px-3 py-[3px] ${highlight ? 'bg-brand/15 ring-1 ring-brand ring-inset' : ''}`}>
      <span className="truncate text-[#c4c4c4]">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

const box = 'block truncate rounded-[3px] border border-[#212121] bg-[#2a2a2a] px-1.5 py-px text-[#d2d2d2]';

/** Aperçu de l'inspecteur Unity avec le prefab sélectionné (libellés réels des composants). */
export function InspectorMock() {
  return (
    <figure className="my-6">
      <div role="img" aria-label="Inspecteur Unity : la clé publique est collée dans Publishable Key et la méthode Inventory.Grant est branchée sur On Item Granted." className="mx-auto max-w-md overflow-hidden rounded-[10px] border border-[#1f1f1f] bg-[#383838] font-sans text-[12px] leading-5 text-[#d2d2d2] shadow-lg">
        <div className="flex items-center gap-2 border-b border-[#232323] bg-[#3c3c3c] px-3 py-1.5 font-semibold">
          <span className="grid size-4 place-items-center rounded-[3px] bg-[#6d9eeb] text-[9px] text-white">▣</span>
          DevAppStore
          <span className="ml-auto text-[10px] font-normal text-[#9a9a9a]">Inspector</span>
        </div>
        <div className="border-b border-[#232323] bg-[#3e3e3e] px-3 py-1 font-semibold">▾ Dev App Store Client (Script)</div>
        <div className="space-y-px py-1.5">
          <Field label="Publishable Key" highlight>
            <span className={box}>das_pub_3f9QmX7…</span>
          </Field>
          <Field label="Base Url">
            <span className={box}>https://devappstore.com</span>
          </Field>
          <Field label="Poll Interval Seconds">
            <span className={box}>30</span>
          </Field>
        </div>
        <div className="border-y border-[#232323] bg-[#3e3e3e] px-3 py-1 font-semibold">▾ Dev App Store Drop In (Script)</div>
        <div className="space-y-px py-1.5">
          <Field label="Player">
            <span className={box}>This Device ▾</span>
          </Field>
          <div className="px-3 pt-1.5">
            <div className="overflow-hidden rounded-[4px] border border-[#242424] bg-[#414141]">
              <p className="border-b border-[#2a2a2a] px-2 py-0.5">On Item Granted (String, Int32)</p>
              <div className="grid grid-cols-[34%_1fr] gap-1.5 bg-brand/15 px-2 py-1.5 ring-1 ring-brand ring-inset">
                <span className={box}>Runtime Only ▾</span>
                <span className={box}>Inventory.Grant ▾</span>
                <span className={`${box} col-span-2`}>◉ Inventory (Inventory)</span>
              </div>
              <p className="px-2 py-0.5 text-right text-[#9a9a9a]">+ −</p>
            </div>
          </div>
          <Field label="Show Button">
            <span className="text-[#d2d2d2]">☑</span>
          </Field>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-xs text-ink-3">Les deux seuls réglages à faire, surlignés en jaune. Illustration de l’inspecteur Unity.</figcaption>
    </figure>
  );
}

/** Captures du prefab dans un vrai build Unity (sdks/unity/Tests~/ShotProbe.cs) : le bouton, puis l'écran du code. */
export function GameScreens() {
  const shots = [
    { src: '/docs/unity-bouton.webp', alt: 'Dans le jeu, un bouton jaune « Boutique web » en haut à droite de l’écran.', label: 'Le bouton ajouté à votre jeu' },
    { src: '/docs/unity-code-de-liaison.webp', alt: 'Écran « Boutique web » : trois étapes, le code KG5N-C2T4 en grand, puis les boutons « Ouvrir la boutique » et « Fermer ».', label: 'L’écran du code de liaison' },
  ];
  return (
    <figure className="my-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {shots.map((s) => (
          <div key={s.src}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt={s.alt} width={960} height={600} loading="lazy" decoding="async" className="h-auto w-full rounded-[14px] border border-line shadow-sm" />
            <p className="mt-1.5 text-center text-xs font-semibold text-ink-2">{s.label}</p>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-center text-xs text-ink-3">Captures du prefab dans un jeu Unity. Le joueur ne saisit le code qu’une fois par appareil.</figcaption>
    </figure>
  );
}

/** Carte de téléchargement d'un paquet glisser-déposer. */
export function DownloadCard({ engine, version, href, hint }: { engine: string; version: string; href: string; hint: string }) {
  return (
    <a
      href={href}
      download
      className="group my-5 flex items-center gap-4 rounded-[16px] bg-ink p-4 text-white transition-shadow hover:shadow-[0_10px_28px_rgba(0,0,0,.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Art src="/art/items/bundle.webp" className="size-16 flex-none" />
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold">Télécharger pour {engine}</span>
        <span className="block text-sm text-white/65">
          Version {version} · {hint}
        </span>
      </span>
      <span className="flex-none rounded-full bg-brand px-4 py-2 text-sm font-black text-ink group-hover:brightness-95">Télécharger</span>
    </a>
  );
}
