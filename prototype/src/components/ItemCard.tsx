import type { CSSProperties } from 'react';
import type { Currency, GridSettings, ItemStyle, StoreItem } from '../types';
import { money, periodSuffix } from '../lib/format';
import { IconImage } from './Icons';

export function isHorizontal(layout: number) {
  return layout === 3 || layout === 6;
}

export function cardSize(layout: number, grid: Pick<GridSettings, 'width' | 'height'>) {
  return isHorizontal(layout)
    ? { w: Math.round(grid.width * 1.6), h: Math.round(grid.height * 0.62) }
    : { w: grid.width, h: grid.height };
}

export function background(st: Pick<ItemStyle, 'bgType' | 'bg1' | 'bg2'>) {
  if (st.bgType === 'solid') return st.bg1;
  if (st.bgType === 'linear') return `linear-gradient(180deg, ${st.bg1}, ${st.bg2})`;
  return `radial-gradient(circle at 50% 40%, ${st.bg1} 0%, ${st.bg2} 85%)`;
}

export function textEffects(outline: boolean, shadow: boolean) {
  const parts: string[] = [];
  if (outline) parts.push('-1px -1px 0 #000', '1px -1px 0 #000', '-1px 1px 0 #000', '1px 1px 0 #000');
  if (shadow) parts.push('0 2px 0 rgba(0,0,0,.45)', '0 3px 6px rgba(0,0,0,.25)');
  return parts.length ? parts.join(', ') : undefined;
}

type Props = {
  item: StoreItem;
  grid: Pick<GridSettings, 'width' | 'height'>;
  currency: Currency;
  onClick?: () => void;
  selected?: boolean;
  label?: string;
};

export function ItemCard({ item, grid, currency, onClick, selected, label }: Props) {
  const st = item.style;
  const { w, h } = cardSize(item.layout, grid);
  const s = grid.width / 200;
  const hz = isHorizontal(item.layout);
  const model = item.models[0];

  const cardStyle: CSSProperties = {
    width: w,
    height: h,
    background: background(st),
    border: st.borderWidth ? `${st.borderWidth}px solid ${st.borderColor}` : 'none',
    borderRadius: st.rounded ? 14 * s : 0,
    boxShadow: st.shadow ? '0 6px 16px rgba(0,0,0,.22), 0 2px 4px rgba(0,0,0,.18)' : 'none',
    ['--s' as string]: s,
  };

  const title = (
    <div
      className="ic-title"
      style={{ color: st.titleColor, background: st.titleBg, textShadow: textEffects(st.titleOutline, st.titleShadow) }}
    >
      {item.title || 'Titre'}
    </div>
  );
  const subtitle = item.subtitle ? (
    <div className="ic-sub" style={{ color: st.subtitleColor }}>
      {item.subtitle}
    </div>
  ) : null;
  const img = (
    <div className="ic-img">
      {model?.image ? (
        <img src={model.image} alt={model.label || item.title} draggable={false} />
      ) : (
        <div className="ic-img-ph">
          <IconImage size={36 * s} />
        </div>
      )}
    </div>
  );
  const price = (
    <div className="ic-price">
      <div
        className="ic-pill"
        style={{
          background: st.priceBg,
          color: st.priceColor,
          textShadow: textEffects(st.priceOutline, st.priceShadow),
          borderRadius: st.rounded ? 999 : 2,
        }}
      >
        {item.oldPrice && item.oldPrice > item.price ? <s className="ic-old">{money(item.oldPrice, currency)}</s> : null}
        <span className="ic-now">
          {money(item.price, currency)}
          <small>{periodSuffix(item)}</small>
        </span>
      </div>
    </div>
  );

  let body;
  switch (item.layout) {
    case 1:
      body = (<>{title}{subtitle}{img}{price}</>);
      break;
    case 2:
      body = (<>{img}{title}{subtitle}{price}</>);
      break;
    case 3:
      body = (<>{title}<div className="ic-row">{img}<div className="ic-col">{subtitle}{price}</div></div></>);
      break;
    case 5:
      body = (<>{img}{title}{price}</>);
      break;
    case 6:
      body = (<>{title}<div className="ic-row"><div className="ic-col">{subtitle}{price}</div>{img}</div></>);
      break;
    default:
      body = (<>{title}{img}{price}</>);
  }

  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={'item-card' + (hz ? ' hz' : '') + (selected ? ' selected' : '') + (onClick ? ' clickable' : '')}
      style={cardStyle}
      onClick={onClick}
      aria-label={label}
    >
      {body}
    </Tag>
  );
}
