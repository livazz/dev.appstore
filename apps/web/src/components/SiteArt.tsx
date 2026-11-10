/** Illustration du site (apps/web/public/art/site, fond transparent), décorative : alt vide. */
export type SiteArtName =
  | 'hero' | 'studios-hero' | 'step-search' | 'step-link' | 'step-delivered' | 'empty-search' | 'empty-purchases'
  | 'empty-links' | 'purchase-success' | 'not-found' | 'email-verify' | 'loyalty' | 'report';

export function SiteArt({ name, className = 'mx-auto size-40', priority }: { name: SiteArtName; className?: string; priority?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/art/site/${name}.webp`} alt="" aria-hidden="true" className={`object-contain ${className}`} loading={priority ? 'eager' : 'lazy'} decoding="async" />;
}
