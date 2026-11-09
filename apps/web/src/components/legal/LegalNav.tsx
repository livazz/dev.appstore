'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LEGAL_DOCUMENTS } from '@/lib/legal-versions';

/** Navigation entre les documents légaux : pastilles sur mobile, liste verticale collante sur grand écran. */
export function LegalNav() {
  const pathname = usePathname();
  return (
    <nav aria-labelledby="documents-legaux" className="print:hidden">
      <h2 id="documents-legaux" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
        Documents légaux
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2 lg:flex-col lg:gap-1">
        {LEGAL_DOCUMENTS.map((d) => {
          const active = pathname === d.href;
          return (
            <li key={d.slug}>
              <Link
                href={d.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-full border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:rounded-[var(--radius)] lg:border-transparent lg:px-3 lg:py-2 ${
                  active
                    ? 'border-ink bg-ink font-semibold text-white lg:bg-surface lg:text-ink lg:shadow-[inset_3px_0_0_var(--brand)]'
                    : 'border-line bg-surface text-ink-2 hover:text-ink lg:bg-transparent lg:hover:bg-surface'
                }`}
              >
                {d.shortTitle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
