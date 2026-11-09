'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DOC_GROUPS, DOC_PAGES, docHref } from '@/lib/docs/nav';

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-6">
      {DOC_GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-ink-3">{group}</p>
          <ul className="space-y-0.5">
            {DOC_PAGES.filter((p) => p.group === group).map((p) => {
              const href = docHref(p.slug);
              const current = pathname === href;
              return (
                <li key={p.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={current ? 'page' : undefined}
                    className={`block rounded-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                      current ? 'bg-brand/30 font-semibold text-ink' : 'text-ink-2 hover:bg-bg hover:text-ink'
                    }`}
                  >
                    {p.title}
                  </Link>
                  {current && p.sections.length > 0 && (
                    <ul className="mb-2 ml-3 mt-1 space-y-0.5 border-l border-line pl-2 lg:hidden">
                      {p.sections.map((s) => (
                        <li key={s.id}>
                          <a href={`#${s.id}`} onClick={onNavigate} className="block rounded px-2 py-1 text-xs text-ink-2 hover:text-ink">
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Navigation latérale : colonne fixe dès 1024 px, panneau repliable en dessous. */
export function DocsSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = DOC_PAGES.find((p) => docHref(p.slug) === pathname);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <div className="border-b border-line bg-surface lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="docs-mobile-nav"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <span className="min-w-0 truncate">
            <span className="text-ink-3">Documentation · </span>
            {current?.title ?? 'Sommaire'}
          </span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <nav id="docs-mobile-nav" aria-label="Documentation" hidden={!open} className="max-h-[70vh] overflow-y-auto border-t border-line px-1 py-4">
          <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
        </nav>
      </div>
      <nav aria-label="Documentation" className="sticky top-16 hidden max-h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto py-8 pr-4 lg:block">
        <NavList pathname={pathname} />
      </nav>
    </>
  );
}
