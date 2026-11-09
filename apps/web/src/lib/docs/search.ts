import { DOC_PAGES, docHref, type DocPage } from './nav';

/** Entrée de l'index de recherche côté client (une par page et une par section). */
export interface SearchEntry {
  href: string;
  title: string;
  /** Titre de la page parente (vide pour une page). */
  page: string;
  haystack: string;
  titleNorm: string;
}

export interface SearchResult {
  href: string;
  title: string;
  page: string;
  score: number;
}

/** Minuscules, sans accents, ponctuation réduite à des espaces (garde `_`, `/`, `.` et `{}` utiles aux noms d'API). */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'«»"“”,;:!?()[\]#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSearchIndex(pages: DocPage[] = DOC_PAGES): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const p of pages) {
    out.push({
      href: docHref(p.slug),
      title: p.title,
      page: '',
      titleNorm: normalize(p.title),
      haystack: normalize([p.title, p.description, p.keywords ?? '', p.group].join(' ')),
    });
    for (const s of p.sections) {
      out.push({
        href: docHref(p.slug, s.id),
        title: s.title,
        page: p.title,
        titleNorm: normalize(s.title),
        haystack: normalize([s.title, s.keywords ?? '', p.title].join(' ')),
      });
    }
  }
  return out;
}

/**
 * Recherche simple : chaque mot de la requête doit apparaître (préfixe de mot ou sous-chaîne) dans l'entrée.
 * Score : correspondance dans le titre > début de mot > sous-chaîne ; les pages passent devant leurs sections à égalité.
 */
export function searchDocs(query: string, index: SearchEntry[], limit = 8): SearchResult[] {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [];
  const results: SearchResult[] = [];
  for (const e of index) {
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const inTitle = e.titleNorm.includes(t);
      const pos = e.haystack.indexOf(t);
      if (pos < 0) {
        ok = false;
        break;
      }
      const wordStart = pos === 0 || /[\s/._{-]/.test(e.haystack[pos - 1]);
      score += (inTitle ? 10 : 0) + (wordStart ? 3 : 1);
      if (e.titleNorm.startsWith(t)) score += 5;
    }
    if (!ok) continue;
    if (!e.page) score += 1;
    results.push({ href: e.href, title: e.title, page: e.page, score });
  }
  return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'fr')).slice(0, limit);
}
