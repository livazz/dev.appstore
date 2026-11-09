import { ImageResponse } from 'next/og';
import { BRAND_BG, BRAND_INK, BRAND_YELLOW, SITE_NAME } from '@/lib/seo';

/* Image Open Graph par défaut (aperçus de liens) : carré jaune « D » et promesse du site. Générée au build. */

export const alt = `${SITE_NAME} — vos achats in-app moins cher, sur le web`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const D_PATH = 'M19 14h13a18 18 0 0 1 0 36H19zm10 9v18h3a9 9 0 0 0 0-18z';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 96px', background: BRAND_BG, color: BRAND_INK }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <svg width="168" height="168" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="14" fill={BRAND_YELLOW} />
            <path d={D_PATH} fill={BRAND_INK} fillRule="evenodd" />
          </svg>
          <div style={{ fontSize: 88, letterSpacing: -2 }}>{SITE_NAME}</div>
        </div>
        <div style={{ marginTop: 56, fontSize: 52, lineHeight: 1.2, maxWidth: 980 }}>Vos achats in-app moins cher, sur le web.</div>
        <div style={{ marginTop: 24, fontSize: 32, color: '#5f5f66' }}>Liez votre compte de jeu, achetez : c’est livré automatiquement.</div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 18, background: BRAND_YELLOW }} />
      </div>
    ),
    size,
  );
}
