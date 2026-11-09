'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buildSearchIndex, searchDocs } from '@/lib/docs/search';

/** Recherche dans la documentation, entièrement côté client (combobox ARIA, raccourci « / »). */
export function DocsSearch() {
  const router = useRouter();
  const index = useMemo(() => buildSearchIndex(), []);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const listId = `${id}-results`;

  const results = useMemo(() => searchDocs(q, index), [q, index]);
  const showList = open && q.trim().length > 0;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    router.push(href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (q) setQ('');
      else inputRef.current?.blur();
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && showList) {
      e.preventDefault();
      go(results[Math.min(active, results.length - 1)].href);
    }
  };

  return (
    <div ref={wrapRef} className="relative w-full max-w-sm">
      <label htmlFor={`${id}-input`} className="sr-only">
        Rechercher dans la documentation
      </label>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="9" r="6" />
        <path d="M14 14l4 4" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        id={`${id}-input`}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results.length ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Rechercher…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-[var(--radius)] border border-line bg-bg pl-9 pr-9 text-sm outline-none placeholder:text-ink-3 focus:border-primary focus:bg-surface [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[11px] text-ink-3 sm:block">
        /
      </kbd>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Résultats de recherche"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-[var(--radius)] border border-line bg-surface p-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li role="option" aria-selected={false} aria-disabled="true" className="px-3 py-2 text-sm text-ink-3">
              Aucun résultat pour « {q.trim()} »
            </li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.href}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(r.href);
                }}
                className={`cursor-pointer rounded-md px-3 py-2 text-sm ${i === active ? 'bg-primary/10 text-ink' : 'text-ink-2'}`}
              >
                <span className="block font-medium text-ink">{r.title}</span>
                {r.page && <span className="block text-xs text-ink-3">{r.page}</span>}
              </li>
            ))
          )}
        </ul>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {showList ? `${results.length} résultat${results.length > 1 ? 's' : ''}` : ''}
      </p>
    </div>
  );
}
