import { DEFAULT_ITEM_STYLE, type ItemStyle } from '@wolleen/core';
import { ItemCard, type CardItem } from '@/components/store/ItemCard';

const grid = { width: 180, height: 240 };

const style = (overrides: Partial<ItemStyle>): ItemStyle => ({ ...DEFAULT_ITEM_STYLE, ...overrides });

/** Articles de démonstration (données statiques, aucune image : l'emplacement visuel par défaut est affiché). */
const DEMO_ITEMS: (CardItem & { key: string })[] = [
  {
    key: 'gems',
    title: 'Sac de gemmes',
    subtitle: '1 200 gemmes',
    type: 'consumable',
    period: 'month',
    priceCents: 899,
    oldPriceCents: 1099,
    models: [{ label: 'Sac de gemmes' }],
    layout: 1,
    style: style({ bgType: 'radial', bg1: '#e9f5ff', bg2: '#4aa8f0', priceBg: '#1d1d1f' }),
  },
  {
    key: 'pass',
    title: 'Pass de saison',
    subtitle: 'Récompenses exclusives',
    type: 'auto_renewable',
    period: 'month',
    priceCents: 499,
    oldPriceCents: null,
    models: [{ label: 'Pass de saison' }],
    layout: 2,
    style: style({ bgType: 'linear', bg1: '#fff3c4', bg2: '#ffd43b', priceBg: '#a43cf0' }),
  },
  {
    key: 'skin',
    title: 'Tenue légendaire',
    subtitle: 'Édition limitée',
    type: 'non_consumable',
    period: 'month',
    priceCents: 1499,
    oldPriceCents: null,
    models: [{ label: 'Tenue légendaire' }],
    layout: 4,
    style: style({ bgType: 'radial', bg1: '#f4e8ff', bg2: '#a43cf0', titleColor: '#ffffff', titleShadow: true, priceBg: '#1d1d1f' }),
  },
];

const FEATURES = [
  'Bannière, dégradé de fond et icône du jeu',
  '6 mises en page de cartes, couleurs, bordures et ombres',
  'Prix par paliers, prix barrés et abonnements',
  'Aperçu en direct, identique à ce que voient vos joueurs',
];

/** Aperçu de l'éditeur visuel de boutique, construit avec le vrai composant ItemCard. */
export function EditorPreview() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <h2 id="editeur-titre" className="text-2xl font-bold tracking-tight sm:text-3xl">
          Une boutique à vos couleurs, sans écrire une ligne de code
        </h2>
        <p className="mt-3 text-ink-2">
          L&apos;éditeur visuel reprend les codes de votre jeu. Ce que vous voyez dans l&apos;éditeur est exactement ce qui s&apos;affiche
          sur la page publique de votre jeu.
        </p>
        <ul className="mt-5 space-y-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden="true" className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-brand text-xs font-black">
                ✓
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <figure className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5" aria-hidden="true">
          <span className="size-3 rounded-full bg-danger/70" />
          <span className="size-3 rounded-full bg-warn/70" />
          <span className="size-3 rounded-full bg-ok/70" />
          <span className="ml-3 truncate text-xs text-ink-3">Éditeur de boutique — Crystal Quest</span>
        </div>
        <div
          className="flex flex-wrap justify-center gap-5 p-5 sm:p-8"
          style={{ background: 'linear-gradient(160deg, #4aa8f0 0%, #ffffff 75%)' }}
        >
          {DEMO_ITEMS.map(({ key, ...item }) => (
            <ItemCard key={key} item={item} grid={grid} currency="EUR" />
          ))}
        </div>
        <figcaption className="border-t border-line px-4 py-3 text-sm text-ink-2">
          Exemple de boutique réalisée avec l&apos;éditeur (données de démonstration).
        </figcaption>
      </figure>
    </div>
  );
}
