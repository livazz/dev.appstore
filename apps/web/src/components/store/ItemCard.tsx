import type { CSSProperties } from 'react';
import { formatMoney, PERIODS, type Currency, type GameTheme, type ItemModel, type ItemStyle, type ItemType, type LayoutId, type Period } from '@devappstore/core/client';
import { cardBackground, safeImageUrl, safeItemStyle } from './style-safety';
import s from './store.module.css';

export { cardBackground } from './style-safety';

/** Sous-ensemble d'un article nécessaire à l'affichage (ligne DB ou brouillon de l'éditeur). */
export interface CardItem {
  title: string;
  subtitle: string;
  type: ItemType;
  period: Period;
  priceCents: number;
  oldPriceCents: number | null;
  models: ItemModel[];
  layout: LayoutId;
  style: ItemStyle;
}

type Grid = Pick<GameTheme['grid'], 'width' | 'height'>;

export const isHorizontal = (layout: number) => layout === 3 || layout === 6;

export function cardSize(layout: number, grid: Grid) {
  return isHorizontal(layout) ? { w: Math.round(grid.width * 1.6), h: Math.round(grid.height * 0.62) } : { w: grid.width, h: grid.height };
}

export function textEffects(outline: boolean, shadow: boolean) {
  const p: string[] = [];
  if (outline) p.push('-1px -1px 0 #000', '1px -1px 0 #000', '-1px 1px 0 #000', '1px 1px 0 #000');
  if (shadow) p.push('0 2px 0 rgba(0,0,0,.45)', '0 3px 6px rgba(0,0,0,.25)');
  return p.length ? p.join(', ') : undefined;
}

function periodSuffix(item: CardItem) {
  if (item.type !== 'auto_renewable' && item.type !== 'non_renewing') return '';
  return PERIODS.find((p) => p.value === item.period)?.short ?? '';
}

export function ItemCard({
  item,
  grid,
  currency,
  onClick,
  selected,
  label,
}: {
  item: CardItem;
  grid: Grid;
  currency: Currency;
  onClick?: () => void;
  selected?: boolean;
  label?: string;
}) {
  // Défense en profondeur (D-18) : couleurs / nombres revalidés au rendu, images tierces ignorées.
  const st = safeItemStyle(item.style);
  const { w, h } = cardSize(item.layout, grid);
  const k = grid.width / 200;
  const model = item.models[0];
  const imageUrl = safeImageUrl(model?.imageUrl);

  const style: CSSProperties = {
    width: w,
    height: h,
    background: cardBackground(st),
    border: st.borderWidth ? `${st.borderWidth}px solid ${st.borderColor}` : 'none',
    borderRadius: st.rounded ? 14 * k : 0,
    boxShadow: st.shadow ? '0 6px 16px rgba(0,0,0,.22), 0 2px 4px rgba(0,0,0,.18)' : 'none',
    ['--s' as string]: k,
  };

  const title = (
    <div className={s.title} style={{ color: st.titleColor, background: st.titleBg, textShadow: textEffects(st.titleOutline, st.titleShadow) }}>
      {item.title || 'Titre'}
    </div>
  );
  const subtitle = item.subtitle ? <div className={s.sub} style={{ color: st.subtitleColor }}>{item.subtitle}</div> : null;
  const img = (
    <div className={s.img}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={model?.label || item.title} draggable={false} />
      ) : (
        <div className={s.imgPh} aria-hidden="true" />
      )}
    </div>
  );
  const hasOld = item.oldPriceCents != null && item.oldPriceCents > item.priceCents;
  const price = (
    <div className={s.price}>
      <div className={s.pill} style={{ background: st.priceBg, color: st.priceColor, textShadow: textEffects(st.priceOutline, st.priceShadow), borderRadius: st.rounded ? 999 : 2 }}>
        {hasOld ? <s className={s.old}>{formatMoney(item.oldPriceCents!, currency)}</s> : null}
        <span className={s.now}>
          {formatMoney(item.priceCents, currency)}
          <small>{periodSuffix(item)}</small>
        </span>
      </div>
    </div>
  );

  let body;
  switch (item.layout) {
    case 1: body = <>{title}{subtitle}{img}{price}</>; break;
    case 2: body = <>{img}{title}{subtitle}{price}</>; break;
    case 3: body = <>{title}<div className={s.row}>{img}<div className={s.col}>{subtitle}{price}</div></div></>; break;
    case 5: body = <>{img}{title}{price}</>; break;
    case 6: body = <>{title}<div className={s.row}><div className={s.col}>{subtitle}{price}</div>{img}</div></>; break;
    default: body = <>{title}{img}{price}</>;
  }

  const cls = [s.card, selected && s.selected, onClick && s.clickable].filter(Boolean).join(' ');
  return onClick ? (
    <button type="button" className={cls} style={style} onClick={onClick} aria-label={label ?? item.title}>{body}</button>
  ) : (
    <div className={cls} style={style}>{body}</div>
  );
}
