/**
 * Échappement HTML systématique.
 *
 * Toute donnée dynamique (nom de joueur, d'objet, de studio, message d'erreur d'un serveur de jeu…) passe
 * par le gabarit `html\`…\`` qui échappe chaque interpolation, sauf si elle est déjà un `SafeHtml`
 * (fragment produit par `html` lui-même ou par un composant du package).
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => HTML_ESCAPES[c]!);
}

/** Fragment HTML considéré comme sûr (déjà échappé ou constant). */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString() {
    return this.value;
  }
}

export type HtmlValue = SafeHtml | string | number | null | undefined | false | HtmlValue[];

function renderValue(v: HtmlValue): string {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return escapeHtml(v);
}

/** Gabarit HTML : les interpolations sont échappées, les `SafeHtml` et tableaux de `SafeHtml` insérés tels quels. */
export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]!) + strings[i + 1]!;
  return new SafeHtml(out);
}

/** Insère du HTML de confiance (constante du code, jamais une donnée utilisateur). */
export function trusted(value: string): SafeHtml {
  return new SafeHtml(value);
}

/**
 * URL autorisée dans un `href` : `https:` (et `http:` pour le développement local) uniquement.
 * Lève une erreur sinon (`javascript:`, `data:`, URL relative…) : un lien d'e-mail est toujours généré
 * côté serveur, une URL invalide est un bug à corriger, pas un cas à masquer.
 */
export function safeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL invalide dans un e-mail : ${JSON.stringify(url)}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Protocole d'URL non autorisé dans un e-mail : ${parsed.protocol}`);
  }
  return parsed.toString();
}

/** Texte sur une ligne (objet d'e-mail, en-têtes) : supprime retours à la ligne et caractères de contrôle. */
export function oneLine(value: string, max = 200): string {
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Texte brut multi-lignes pour la version `text` : retire les caractères de contrôle hors \n et \t. */
export function plain(value: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}

export function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + '…' : value;
}
