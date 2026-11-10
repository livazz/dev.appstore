/*
 * Conversions entre les champs <input type="datetime-local"> (heure locale du navigateur, sans fuseau)
 * et les dates ISO 8601 échangées avec le serveur (promotions programmées des articles).
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO 8601 → valeur d'un champ datetime-local (heure locale du navigateur). */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valeur d'un champ datetime-local (heure locale) → ISO 8601, null si vide ou invalide. */
export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
