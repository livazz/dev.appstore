/**
 * Mise en page commune, compatible clients mail : tableaux imbriqués, styles inline, largeur 600 px,
 * pas de CSS externe, pas d'image obligatoire (le logo D jaune est une cellule de tableau).
 *
 * Chaque composant produit un `Block` à double rendu : HTML (échappé) et texte brut.
 */
import { html, safeUrl, trusted, plain, oneLine, type SafeHtml } from './escape';
import type { ResolvedContext } from './context';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface Block {
  html: SafeHtml;
  text: string;
}

export const COLORS = {
  brand: '#ffd43b',
  brandInk: '#1d1d1f',
  primary: '#4aa8f0',
  ink: '#1d1d1f',
  ink2: '#5f5f66',
  muted: '#8a8a93',
  border: '#e4e4ea',
  page: '#f2f2f5',
  surface: '#ffffff',
  soft: '#f7f7fa',
  noticeBg: '#fff8db',
  noticeBorder: '#ffd43b',
  dangerBg: '#fdecec',
  dangerBorder: '#e5484d',
  success: '#2f9e44',
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ---------------------------------------------------------------------------------------------------------
// Texte enrichi minimal (gras, lien) → HTML échappé + texte brut
// ---------------------------------------------------------------------------------------------------------

export type Rich = string | number | { b: Rich } | { a: string; href: string } | Rich[];

export function richHtml(r: Rich): SafeHtml {
  if (Array.isArray(r)) return html`${r.map(richHtml)}`;
  if (typeof r === 'string' || typeof r === 'number') return html`${r}`;
  if ('b' in r) return html`<strong style="font-weight:700;color:${COLORS.ink};">${richHtml(r.b)}</strong>`;
  return html`<a href="${safeUrl(r.href)}" style="color:${COLORS.primary};text-decoration:underline;">${r.a}</a>`;
}

export function richText(r: Rich): string {
  if (Array.isArray(r)) return r.map(richText).join('');
  if (typeof r === 'string' || typeof r === 'number') return plain(r);
  if ('b' in r) return richText(r.b);
  return `${plain(r.a)} (${safeUrl(r.href)})`;
}

// ---------------------------------------------------------------------------------------------------------
// Composants
// ---------------------------------------------------------------------------------------------------------

export function heading(text: string): Block {
  return {
    html: html`<tr><td style="padding:0 32px 12px 32px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${COLORS.ink};">${text}</td></tr>`,
    text: `${plain(text).toUpperCase()}\n`,
  };
}

export function subheading(text: string): Block {
  return {
    html: html`<tr><td style="padding:12px 32px 8px 32px;font-family:${FONT};font-size:16px;line-height:22px;font-weight:700;color:${COLORS.ink};">${text}</td></tr>`,
    text: `${plain(text)}\n${'-'.repeat(Math.min(plain(text).length, 60))}`,
  };
}

export function para(content: Rich, opts: { muted?: boolean } = {}): Block {
  const color = opts.muted ? COLORS.ink2 : COLORS.ink;
  return {
    html: html`<tr><td style="padding:0 32px 14px 32px;font-family:${FONT};font-size:15px;line-height:23px;color:${color};">${richHtml(content)}</td></tr>`,
    text: richText(content),
  };
}

export function bullets(items: Rich[]): Block {
  const rows = items.map(
    (it) =>
      html`<tr><td valign="top" width="18" style="width:18px;font-family:${FONT};font-size:15px;line-height:23px;color:${COLORS.ink2};">•</td><td style="font-family:${FONT};font-size:15px;line-height:23px;color:${COLORS.ink};padding-bottom:4px;">${richHtml(it)}</td></tr>`,
  );
  return {
    html: html`<tr><td style="padding:0 32px 14px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>`,
    text: items.map((it) => `  - ${richText(it)}`).join('\n'),
  };
}

export function button(label: string, url: string): Block {
  const href = safeUrl(url);
  return {
    html: html`<tr><td style="padding:6px 32px 22px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${COLORS.brand}" style="border-radius:10px;background:${COLORS.brand};">
<a href="${href}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;color:${COLORS.brandInk};text-decoration:none;border-radius:10px;">${label}</a>
</td></tr></table>
<div style="padding-top:10px;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};word-break:break-all;">Si le bouton ne fonctionne pas, copiez ce lien : <a href="${href}" style="color:${COLORS.muted};">${href}</a></div>
</td></tr>`,
    text: `${plain(label)} : ${href}`,
  };
}

export type DetailRow = [label: string, value: Rich];

/** Tableau « libellé / valeur » (récapitulatif de commande…). */
export function details(rows: DetailRow[], opts: { totalLabel?: string; total?: string } = {}): Block {
  const trs = rows.map(
    ([label, value]) =>
      html`<tr><td valign="top" style="padding:9px 12px 9px 0;border-bottom:1px solid ${COLORS.border};font-family:${FONT};font-size:14px;line-height:20px;color:${COLORS.ink2};width:42%;">${label}</td><td valign="top" style="padding:9px 0;border-bottom:1px solid ${COLORS.border};font-family:${FONT};font-size:14px;line-height:20px;color:${COLORS.ink};word-break:break-word;">${richHtml(value)}</td></tr>`,
  );
  const total =
    opts.total !== undefined
      ? html`<tr><td style="padding:12px 12px 0 0;font-family:${FONT};font-size:15px;font-weight:700;color:${COLORS.ink};">${opts.totalLabel ?? 'Total'}</td><td style="padding:12px 0 0 0;font-family:${FONT};font-size:17px;font-weight:700;color:${COLORS.ink};">${opts.total}</td></tr>`
      : '';
  const width = Math.max(...rows.map(([l]) => l.length), (opts.totalLabel ?? 'Total').length);
  const textRows = rows.map(([l, v]) => `  ${(l + ' :').padEnd(width + 2)} ${richText(v)}`);
  if (opts.total !== undefined) textRows.push(`  ${((opts.totalLabel ?? 'Total') + ' :').padEnd(width + 2)} ${opts.total}`);
  return {
    html: html`<tr><td style="padding:0 32px 18px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${trs}${total}</table></td></tr>`,
    text: textRows.join('\n'),
  };
}

/** Tableau à colonnes (rapport hebdo, liste d'échecs). */
export function dataTable(headers: string[], rows: Rich[][], opts: { alignRight?: number[] } = {}): Block {
  const right = new Set(opts.alignRight ?? []);
  const th = headers.map(
    (h, i) =>
      html`<th align="${right.has(i) ? 'right' : 'left'}" style="padding:8px 6px;border-bottom:2px solid ${COLORS.ink};font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;color:${COLORS.ink2};text-transform:uppercase;letter-spacing:0.3px;">${h}</th>`,
  );
  const trs = rows.map(
    (r) =>
      html`<tr>${r.map(
        (c, i) =>
          html`<td align="${right.has(i) ? 'right' : 'left'}" valign="top" style="padding:8px 6px;border-bottom:1px solid ${COLORS.border};font-family:${FONT};font-size:13px;line-height:19px;color:${COLORS.ink};word-break:break-word;">${richHtml(c)}</td>`,
      )}</tr>`,
  );
  const text = rows.map((r) => '  - ' + r.map((c, i) => `${headers[i]} : ${richText(c)}`).join(' | ')).join('\n');
  return {
    html: html`<tr><td style="padding:0 32px 18px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${th}</tr>${trs}</table></td></tr>`,
    text,
  };
}

/** Chiffres clés (2 à 3 tuiles côte à côte). */
export function stats(items: { label: string; value: string; hint?: string }[]): Block {
  const w = Math.floor(100 / items.length);
  const tds = items.map(
    (s) =>
      html`<td valign="top" width="${w}%" style="padding:6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${COLORS.soft}" style="background:${COLORS.soft};border-radius:10px;padding:14px;font-family:${FONT};">
<div style="font-size:12px;line-height:16px;color:${COLORS.ink2};">${s.label}</div>
<div style="font-size:20px;line-height:28px;font-weight:700;color:${COLORS.ink};">${s.value}</div>
${s.hint ? html`<div style="font-size:12px;line-height:16px;color:${COLORS.muted};">${s.hint}</div>` : ''}
</td></tr></table></td>`,
  );
  return {
    html: html`<tr><td style="padding:0 26px 16px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${tds}</tr></table></td></tr>`,
    text: items.map((s) => `  ${plain(s.label)} : ${s.value}${s.hint ? ` (${plain(s.hint)})` : ''}`).join('\n'),
  };
}

/** Encadré (mention légale, avertissement). */
export function notice(title: string, blocks: Rich[], tone: 'info' | 'danger' = 'info'): Block {
  const bg = tone === 'danger' ? COLORS.dangerBg : COLORS.noticeBg;
  const border = tone === 'danger' ? COLORS.dangerBorder : COLORS.noticeBorder;
  const ps = blocks.map(
    (b) => html`<p style="margin:0 0 10px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.ink};">${richHtml(b)}</p>`,
  );
  return {
    html: html`<tr><td style="padding:4px 32px 18px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bg}" style="background:${bg};border-left:4px solid ${border};border-radius:6px;padding:14px 16px 4px 16px;">
<p style="margin:0 0 8px 0;font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;color:${COLORS.ink};">${title}</p>
${ps}
</td></tr></table></td></tr>`,
    text: [`*** ${plain(title)} ***`, ...blocks.map(richText)].join('\n'),
  };
}

export function divider(): Block {
  return {
    html: html`<tr><td style="padding:4px 32px 18px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height:1px;line-height:1px;font-size:1px;background:${COLORS.border};">&nbsp;</td></tr></table></td></tr>`,
    text: '',
  };
}

/** Marque affichée en tête d'e-mail : nom + lettre du logo (carré jaune). */
export interface Brand {
  name: string;
  initial: string;
}

export const DEVAPPSTORE_BRAND: Brand = { name: 'Dev AppStore', initial: 'D' };
/** Alias historique de DEVAPPSTORE_BRAND. */
export const DEV_APPSTORE_BRAND = DEVAPPSTORE_BRAND;

/** Logo carré jaune (pur HTML : visible même si les images sont bloquées). */
export function logo(brand: Brand = DEVAPPSTORE_BRAND): SafeHtml {
  return html`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="40" height="40" align="center" valign="middle" bgcolor="${COLORS.brand}" style="width:40px;height:40px;background:${COLORS.brand};border-radius:10px;font-family:${FONT};font-size:24px;line-height:40px;font-weight:800;color:${COLORS.brandInk};">${brand.initial}</td>
<td style="padding-left:10px;font-family:${FONT};font-size:20px;line-height:40px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.3px;">${brand.name}</td>
</tr></table>`;
}

// ---------------------------------------------------------------------------------------------------------
// Gabarit complet
// ---------------------------------------------------------------------------------------------------------

export interface RenderOptions {
  subject: string;
  /** Texte d'aperçu affiché par les clients mail après l'objet. */
  preheader: string;
  blocks: Block[];
  ctx: ResolvedContext;
  /** Raison de l'envoi, affichée en pied de page (« Vous recevez cet e-mail car… »). */
  reason: string;
  /** Marque de l'en-tête (défaut : Dev AppStore). */
  brand?: Brand;
}

export function renderEmail({ subject, preheader, blocks, ctx, reason, brand = DEVAPPSTORE_BRAND }: RenderOptions): EmailContent {
  const cleanSubject = oneLine(subject, 180);
  const legal = [ctx.companyName, ctx.companyAddress].filter(Boolean).join(' · ');
  const mediator = ctx.mediator
    ? html`<br>Médiateur de la consommation : <a href="${safeUrl(ctx.mediator.url)}" style="color:${COLORS.muted};">${ctx.mediator.name}</a>`
    : '';
  const page = html`<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${cleanSubject}</title>
</head>
<body style="margin:0;padding:0;width:100%;background:${COLORS.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.page};opacity:0;">${oneLine(preheader, 160)}${trusted('&#8199;&#65279;&#847;'.repeat(20))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background:${COLORS.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td style="padding:0 8px 16px 8px;">${logo(brand)}</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.surface}" style="width:600px;max-width:600px;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:14px;">
<tr><td height="28" style="height:28px;line-height:28px;font-size:1px;">&nbsp;</td></tr>
${blocks.map((b) => b.html)}
<tr><td height="10" style="height:10px;line-height:10px;font-size:1px;">&nbsp;</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td style="padding:18px 16px;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};text-align:center;">
${reason}<br>
Une question ? <a href="${safeUrl(ctx.supportUrl)}" style="color:${COLORS.muted};">Centre d'aide</a> · <a href="mailto:${ctx.supportEmail}" style="color:${COLORS.muted};">${ctx.supportEmail}</a><br>
${legal}${mediator}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textParts = [
    plain(brand.name),
    '',
    ...blocks.map((b) => b.text).filter((t) => t !== ''),
    '',
    '—',
    plain(reason),
    `Aide : ${safeUrl(ctx.supportUrl)} · ${plain(ctx.supportEmail)}`,
    plain(legal),
    ctx.mediator ? `Médiateur de la consommation : ${plain(ctx.mediator.name)} (${safeUrl(ctx.mediator.url)})` : '',
  ];
  const text = textParts
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .concat('\n');

  return { subject: cleanSubject, html: page.value, text };
}
