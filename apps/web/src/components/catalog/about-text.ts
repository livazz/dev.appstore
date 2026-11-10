/** Découpe une présentation en paragraphes (séparés par au moins une ligne vide), sans paragraphes vides. */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Paragraphes affichés d'emblée et paragraphes repliés derrière « Lire la suite » :
 * on montre le premier paragraphe (et le deuxième s'il reste court), le reste est replié.
 */
export function foldParagraphs(text: string, budget = 360): { visible: string[]; hidden: string[] } {
  const all = splitParagraphs(text);
  if (all.length <= 1) return { visible: all, hidden: [] };
  let n = 1;
  if (all[0]!.length + all[1]!.length <= budget) n = 2;
  if (all.length === n) return { visible: all, hidden: [] };
  return { visible: all.slice(0, n), hidden: all.slice(n) };
}
