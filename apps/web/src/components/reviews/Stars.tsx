import { formatAverage, starFill } from '@/server/reviews-logic';

/* Étoiles d'affichage (lecture seule). Utilisable côté serveur et côté client. */

const PATH = 'M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.9z';

export function Stars({ value, size = 'md', label }: { value: number; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const px = size === 'lg' ? 'size-6' : size === 'sm' ? 'size-3.5' : 'size-4.5';
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `Note : ${formatAverage(value)} sur 5`}>
      {starFill(value).map((f, i) => (
        <svg key={i} viewBox="0 0 20 20" className={`${px} shrink-0`} aria-hidden>
          <defs>
            <linearGradient id={`half-${i}`}>
              <stop offset="50%" stopColor="currentColor" />
              <stop offset="50%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <path d={PATH} className="text-amber-400" fill={f === 'full' ? 'currentColor' : f === 'half' ? `url(#half-${i})` : 'none'} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}
