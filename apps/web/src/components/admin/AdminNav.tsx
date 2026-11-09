'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface AdminNavLink {
  href: string;
  label: string;
}

/** Onglets du back-office ; défilent horizontalement dans leur bande sur mobile. */
export function AdminNav({ links }: { links: AdminNavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation administration" className="-mb-px overflow-x-auto">
      <ul className="flex min-w-max gap-1">
        {links.map((l) => {
          const active = l.href === '/admin' ? pathname === '/admin' : pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition ${
                  active ? 'border-brand text-ink' : 'border-transparent text-ink-2 hover:text-ink'
                }`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
