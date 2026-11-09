/** Échappe une chaîne pour l'utiliser telle quelle dans une RegExp. */
export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** RegExp insensible à la casse qui contient littéralement `s`. */
export const contient = (s: string) => new RegExp(escapeRegExp(s), 'i');
