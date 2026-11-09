'use client';

import { useSearchParams } from 'next/navigation';
import { GAME_CATEGORIES } from '@wolleen/core';

/** Champ « Rechercher » + menu « Toutes catégories », prérempli depuis l'URL. */
export function SearchBar() {
  const params = useSearchParams();
  return <SearchForm key={params.toString()} q={params.get('q') ?? ''} cat={params.get('cat') ?? ''} />;
}

/** Formulaire GET vers /search (fonctionne sans JavaScript). */
export function SearchForm({ q = '', cat = '' }: { q?: string; cat?: string }) {
  return (
    <form
      action="/search"
      role="search"
      className="flex h-11 w-full min-w-0 items-center rounded-full border border-line bg-bg pl-3 transition-colors focus-within:border-primary focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/40"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px] flex-none text-ink-2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Rechercher"
        aria-label="Rechercher un jeu ou un article"
        maxLength={100}
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-ink-2"
      />
      <select
        name="cat"
        defaultValue={cat}
        aria-label="Catégorie"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-full max-w-[45%] flex-none cursor-pointer rounded-r-full border-l border-line bg-transparent pr-2 pl-2 text-sm text-ink-2 outline-none focus-visible:bg-primary/10 focus-visible:text-ink sm:pr-3"
      >
        <option value="">Toutes catégories</option>
        {GAME_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button type="submit" className="sr-only">
        Rechercher
      </button>
    </form>
  );
}
