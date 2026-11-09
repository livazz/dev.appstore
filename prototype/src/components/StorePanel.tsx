import { useMemo, useState, type ReactNode } from 'react';
import type { App, StoreItem } from '../types';
import { background, ItemCard, textEffects } from './ItemCard';
import { panelBackground } from './GradientPicker';

/** Panneau boutique partagé : utilisé par l'éditeur (mode édition) et par la boutique publique. */
export function StorePanel({
  app,
  bannerTools,
  headerSlot,
  sideSlot,
  onItemClick,
  addTile,
  emptyText = 'Aucun article pour le moment.',
}: {
  app: App;
  bannerTools?: ReactNode;
  headerSlot: ReactNode;
  sideSlot?: ReactNode;
  onItemClick: (item: StoreItem) => void;
  addTile?: ReactNode;
  emptyText?: string;
}) {
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => {
    const set = new Map<string, string>();
    app.items.forEach((i) => i.keywords.forEach((k) => set.set(k.toLowerCase(), k)));
    return [...set.values()];
  }, [app.items]);
  const visible = tag ? app.items.filter((i) => i.keywords.some((k) => k.toLowerCase() === tag.toLowerCase())) : app.items;
  const tagStyle = app.items[0]?.style;

  return (
    <div className="store-panel" style={{ background: panelBackground(app.gradient) }}>
      <div className={'banner' + (app.bannerImage ? ' has-img' : '')}>
        {app.bannerImage ? <img src={app.bannerImage} alt="" className="banner-img" /> : null}
        {bannerTools}
      </div>

      <div className="app-head">{headerSlot}</div>

      <div className="store-body">
        <aside className="store-side">
          {sideSlot}
          {tags.length > 0 && (
            <nav className="tags" aria-label="Filtres">
              {[null, ...tags].map((t) => {
                const active = tag === t;
                return (
                  <button
                    key={t ?? '__all'}
                    className={'tag' + (active ? ' active' : '')}
                    aria-pressed={active}
                    onClick={() => setTag(t)}
                    style={
                      tagStyle
                        ? {
                            background: active ? background(tagStyle) : 'rgba(255,255,255,.85)',
                            color: active ? tagStyle.titleColor : '#1d1d1f',
                            textShadow: active ? textEffects(tagStyle.titleOutline, tagStyle.titleShadow) : undefined,
                            borderColor: tagStyle.borderWidth ? tagStyle.borderColor : '#1d1d1f',
                            borderRadius: tagStyle.rounded ? 10 : 0,
                          }
                        : undefined
                    }
                  >
                    {t ?? 'Tout'}
                  </button>
                );
              })}
            </nav>
          )}
        </aside>
        <div className="item-grid" style={{ gap: app.grid.margin }}>
          {visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              grid={app.grid}
              currency={app.currency}
              onClick={() => onItemClick(item)}
              label={item.title}
            />
          ))}
          {addTile}
          {!visible.length && !addTile && <p className="empty">{emptyText}</p>}
        </div>
      </div>
    </div>
  );
}
