'use client';

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { formatMoney, type Currency, type GameTheme, type StoreSkin } from '@devappstore/core/client';
import type { CardItem } from './ItemCard';
import { panelBackground, safeColor, safeImageUrl, safeItemStyle } from './style-safety';
import { skinFontClass } from './skin-fonts';
import s from './skins.module.css';
import { RIBBON_RE, discountPct, fmtQty, groupSections, isWide, periodSuffix } from './skin-logic';

export type SkinItem = CardItem & { id: string; keywords: string[]; quantity?: number; points?: number | null };

type Skin = Exclude<StoreSkin, 'classic'>;

/** Fond par défaut de la page de chaque thème (remplacé par le dégradé du studio s'il est activé). */
const SKIN_BACKGROUND: Record<Skin, string> = {
  arcade: 'linear-gradient(180deg, #3b4cf0 0%, #3527c9 55%, #2a1c9e 100%)',
  premium: 'radial-gradient(90% 60% at 20% 0%, #2b2140 0%, #120f1c 55%, #08070d 100%)',
  casual: 'linear-gradient(180deg, #bfe6ff 0%, #e2f4ff 40%, #fff6e6 100%)',
  clean: '#f5f5f7',
};

const slug = (k: string) => `section-${k.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}`;

function BagIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={s.bag}>
      <path d="M6 7V6a4 4 0 1 1 8 0v1h2.2l.8 11H3L3.8 7H6Zm1.6 0h4.8V6a2.4 2.4 0 1 0-4.8 0v1Z" fill="currentColor" />
    </svg>
  );
}

export function SkinCard({
  item,
  skin,
  currency,
  width,
  onClick,
  label,
}: {
  item: SkinItem;
  skin: Skin;
  currency: Currency;
  width: number;
  onClick?: () => void;
  label?: string;
}) {
  const st = safeItemStyle(item.style);
  const wide = isWide(item.layout);
  const pct = discountPct(item);
  const ribbon = item.keywords.find((k) => RIBBON_RE.test(k.trim()));
  const imageUrl = safeImageUrl(item.models[0]?.imageUrl);
  const per = periodSuffix(item);
  const showQty = item.quantity != null && item.quantity > 1;

  const vars = {
    '--c1': st.bg1,
    '--c2': st.bg2,
    '--title': st.titleColor,
    '--buy-bg': st.priceBg,
    '--buy-fg': st.priceColor,
    '--cw': `${wide ? Math.round(width * 2.08) : width}px`,
    '--k': (width / 290).toFixed(3),
  } as CSSProperties;

  const cls = [s.card, wide && s.wide, item.layout === 6 && s.artRight, onClick && s.clickable].filter(Boolean).join(' ');
  const content = (
    <>
      {item.subtitle ? <span className={s.tab}>{item.subtitle}</span> : null}
      {pct ? <span className={s.pct}>-{pct}%</span> : null}
      {ribbon ? <span className={s.ribbon}>{ribbon}</span> : null}
      <span className={s.frame}>
        <span className={s.face}>
          <span className={s.head}>
            <span className={s.name}>{item.title || 'Titre'}</span>
            {showQty ? <span className={s.qty}>{fmtQty(item.quantity!)}</span> : null}
          </span>
          <span className={s.art}>
            <span className={s.rays} aria-hidden="true" />
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={item.models[0]?.label || item.title} draggable={false} />
            ) : (
              <span className={s.artPh} aria-hidden="true" />
            )}
          </span>
          <span className={s.foot}>
            {item.points ? <span className={s.pts}>+{fmtQty(item.points)} pts</span> : <span />}
            <span className={s.buy}>
              <BagIcon />
              {pct ? <s className={s.old}>{formatMoney(item.oldPriceCents!, currency)}</s> : null}
              <span className={s.now}>
                {formatMoney(item.priceCents, currency)}
                {per ? <small> {per}</small> : null}
              </span>
            </span>
          </span>
        </span>
      </span>
    </>
  );

  return onClick ? (
    <button type="button" className={cls} style={vars} onClick={onClick} aria-label={label ?? item.title}>
      {content}
    </button>
  ) : (
    <div className={cls} style={vars}>
      {content}
    </div>
  );
}

/**
 * Boutique « à thème » (inspirée des stores web des grands jeux mobiles) : page plein cadre aux couleurs du jeu,
 * bannière, sections par mot-clé avec grands titres, cartes à relief. Mêmes slots que StorePanel (éditeur studio).
 */
export function SkinStore({
  skin,
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
  emptyText,
}: {
  skin: Skin;
  theme: GameTheme;
  currency: Currency;
  bannerUrl?: string | null;
  items: SkinItem[];
  header: ReactNode;
  bannerTools?: ReactNode;
  side?: ReactNode;
  addTile?: ReactNode;
  onItemClick?: (item: SkinItem) => void;
  itemTools?: (item: SkinItem, index: number) => ReactNode;
  emptyText: string;
}) {
  const sections = useMemo(() => groupSections(items), [items]);
  const banner = safeImageUrl(bannerUrl);
  const width = Math.round(Math.max(theme.grid.width, 140) * 1.45);
  const background = theme.gradient.enabled ? panelBackground(theme.gradient) : SKIN_BACKGROUND[skin];
  const accent = safeColor(items[0]?.style.priceBg, '#4cc92f');

  const renderItem = (item: SkinItem) => {
    const card = (
      <SkinCard key={item.id} item={item} skin={skin} currency={currency} width={width} onClick={onItemClick ? () => onItemClick(item) : undefined} />
    );
    if (!itemTools) return card;
    return (
      <div key={item.id} className={s.toolWrap}>
        {card}
        {itemTools(item, items.indexOf(item))}
      </div>
    );
  };

  return (
    <div className={`${s.store} ${s[skin]} ${skinFontClass(skin)}`} style={{ background, ['--accent' as string]: accent, ['--gap' as string]: `${Math.max(theme.grid.margin, 12)}px` }}>
      <div className={s.pattern} aria-hidden="true" />
      <div className={s.banner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {banner ? <img src={banner} alt="" className={s.bannerImg} /> : null}
        {bannerTools}
      </div>
      <div className={s.header}>{header}</div>

      {sections.length > 1 && (
        <nav className={s.chips} aria-label="Rubriques de la boutique">
          {sections.map((sec) => (
            <a key={sec.key} href={`#${slug(sec.key)}`} className={s.chip}>
              {sec.title}
            </a>
          ))}
        </nav>
      )}

      {side ? <div className={s.side}>{side}</div> : null}

      {sections.map((sec, i) => (
        <section key={sec.key} id={slug(sec.key)} className={s.section} aria-labelledby={`${slug(sec.key)}-t`}>
          {i > 0 && <div className={s.divider} aria-hidden="true" />}
          <h2 id={`${slug(sec.key)}-t`} className={s.sectionTitle}>
            {sec.title}
          </h2>
          <div className={s.grid}>{sec.items.map(renderItem)}</div>
        </section>
      ))}

      {(addTile || !items.length) && (
        <section className={s.section}>
          <div className={s.grid}>
            {addTile ? (
              <div className={s.addSlot} style={{ ['--cw' as string]: `${width}px` }}>
                {addTile}
              </div>
            ) : null}
            {!items.length && !addTile && <p className={s.empty}>{emptyText}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
