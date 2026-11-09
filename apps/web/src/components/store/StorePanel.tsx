'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { Currency, GameTheme } from '@wolleen/core/client';
import { ItemCard, textEffects, type CardItem } from './ItemCard';
import { activeFilterColors, panelBackground, safeColor, safeImageUrl } from './style-safety';
import s from './store.module.css';

export { panelBackground } from './style-safety';

export type PanelItem = CardItem & { id: string; keywords: string[] };

/**
 * Boutique d'un jeu (maquettes PDF) : bannière, en-tête, filtres par mots-clés, grille d'articles.
 * Partagé par la page publique (lecture) et l'éditeur studio (slots d'édition).
 */
export function StorePanel({
  theme,
  currency,
  bannerUrl,
  items,
  header,
  bannerTools,
  side,
  addTile,
  onItemClick,
  itemTools,
  emptyText = 'Aucun article pour le moment.',
}: {
  theme: GameTheme;
  currency: Currency;
  bannerUrl?: string | null;
  items: PanelItem[];
  header: ReactNode;
  bannerTools?: ReactNode;
  side?: ReactNode;
  addTile?: ReactNode;
  onItemClick?: (item: PanelItem) => void;
  /** Optionnel (éditeur studio) : outils superposés à chaque carte, ex. monter / descendre. */
  itemTools?: (item: PanelItem, index: number) => ReactNode;
  emptyText?: string;
}) {
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((i) => i.keywords.forEach((k) => m.set(k.toLowerCase(), k)));
    return [...m.values()];
  }, [items]);
  const visible = tag ? items.filter((i) => i.keywords.some((k) => k.toLowerCase() === tag.toLowerCase())) : items;
  const ts = items[0]?.style;
  // Filtre actif : style du 1er article, contraste du texte ≥ 4,5:1 garanti (titre blanc sur fond clair, etc.).
  const activeColors = useMemo(() => (ts ? activeFilterColors(ts) : null), [ts]);
  const banner = safeImageUrl(bannerUrl);

  return (
    <div className={s.panel} style={{ background: panelBackground(theme.gradient) }}>
      <div className={s.banner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {banner ? <img src={banner} alt="" className={s.bannerImg} /> : null}
        {bannerTools}
      </div>
      <div className={s.head}>{header}</div>
      <div className={s.body}>
        <aside className={s.side}>
          {side}
          {tags.length > 0 && (
            <nav className={s.tags} aria-label="Filtres">
              {[null, ...tags].map((t) => {
                const active = tag === t;
                return (
                  <button
                    key={t ?? '__all'}
                    className={s.tag}
                    aria-pressed={active}
                    onClick={() => setTag(t)}
                    type="button"
                    style={ts && activeColors ? {
                      background: active ? activeColors.background : 'rgba(255,255,255,.85)',
                      color: active ? activeColors.color : '#1d1d1f',
                      textShadow: active && activeColors.keepTextEffects ? textEffects(ts.titleOutline, ts.titleShadow) : undefined,
                      borderColor: ts.borderWidth ? safeColor(ts.borderColor, '#1d1d1f') : '#1d1d1f',
                      borderRadius: ts.rounded !== false ? 10 : 0,
                    } : undefined}
                  >
                    {t ?? 'Tout'}
                  </button>
                );
              })}
            </nav>
          )}
        </aside>
        <div className={s.grid} style={{ gap: theme.grid.margin }}>
          {visible.map((item) => {
            const card = <ItemCard key={item.id} item={item} grid={theme.grid} currency={currency} onClick={onItemClick ? () => onItemClick(item) : undefined} />;
            if (!itemTools) return card;
            return (
              <div key={item.id} className={s.toolWrap}>
                {card}
                {itemTools(item, items.indexOf(item))}
              </div>
            );
          })}
          {addTile}
          {!visible.length && !addTile && <p className={s.empty}>{emptyText}</p>}
        </div>
      </div>
    </div>
  );
}
