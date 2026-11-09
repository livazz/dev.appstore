import { html, oneLine, safeUrl, type EmailContent, type ResolvedContext } from '@devappstore/emails';
import type { ModerationAction } from '@devappstore/db';
import { SUSPENSION_GROUNDS, type SuspensionGround } from './admin-logic';

/*
 * E-mail « décision de modération » envoyé aux responsables du studio (exigence P2B — règlement UE 2019/1150, art. 4 :
 * exposé des motifs sur un support durable, au plus tard quand la suspension prend effet, avec la voie de contestation).
 * Gabarit autonome à la marque Dev AppStore (logo : carré jaune « D »).
 */

export interface ModerationEmailData {
  action: ModerationAction;
  studioName: string;
  gameName: string;
  ground?: string | null;
  reason?: string | null;
  decidedAt: Date;
  /** Référence de la décision (id de la notification), à citer en cas de contestation. */
  reference: string;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function groundLabel(ground?: string | null) {
  return ground && ground in SUSPENSION_GROUNDS ? SUSPENSION_GROUNDS[ground as SuspensionGround] : ground || null;
}

function formatDate(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone }).format(d);
}

export function moderationEmail(data: ModerationEmailData, ctx: ResolvedContext): EmailContent {
  const studioUrl = safeUrl(`${ctx.appUrl}/studio`);
  const when = formatDate(data.decidedAt, ctx.timeZone);
  const ground = groundLabel(data.ground);
  const subjects: Record<ModerationAction, string> = {
    approve: `« ${data.gameName} » est en ligne sur Dev AppStore`,
    suspend: `Suspension de « ${data.gameName} » sur Dev AppStore`,
    reactivate: `« ${data.gameName} » est de nouveau en ligne sur Dev AppStore`,
  };
  const intros: Record<ModerationAction, string> = {
    approve: `La revue de votre jeu « ${data.gameName} » est approuvée : sa boutique est désormais visible dans le catalogue.`,
    suspend: `L’équipe Dev AppStore a suspendu votre jeu « ${data.gameName} » le ${when}. Sa boutique n’est plus visible et aucun nouvel achat n’est possible. Les achats déjà payés restent livrés.`,
    reactivate: `Votre jeu « ${data.gameName} » est réactivé depuis le ${when} : sa boutique est de nouveau visible et les achats sont rouverts.`,
  };
  const subject = oneLine(subjects[data.action], 180);
  const isSuspension = data.action === 'suspend';
  const contest = `Vous pouvez contester cette décision en répondant à cet e-mail ou en écrivant à ${ctx.supportEmail} en citant la référence ${data.reference}. Votre réclamation sera examinée par une personne de l’équipe, qui vous répondra de façon motivée.`;

  const body = html`<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:24px 12px;background:#f2f2f5;font-family:${FONT};color:#1d1d1f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="padding:0 8px 16px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="40" height="40" align="center" valign="middle" bgcolor="#ffd43b" style="width:40px;height:40px;background:#ffd43b;border-radius:10px;font-size:24px;line-height:40px;font-weight:800;color:#1d1d1f;">D</td>
<td style="padding-left:10px;font-size:20px;line-height:40px;font-weight:800;">Dev AppStore</td>
</tr></table></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e4ea;border-radius:14px;padding:28px 32px;font-size:15px;line-height:23px;">
<p style="margin:0 0 14px 0;">Bonjour ${data.studioName},</p>
<p style="margin:0 0 14px 0;">${intros[data.action]}</p>
${
  isSuspension
    ? html`<div style="margin:0 0 14px 0;padding:14px 16px;background:#fdecec;border-left:4px solid #e5484d;border-radius:8px;">
<p style="margin:0 0 6px 0;font-weight:700;">Motifs de la décision</p>
${ground ? html`<p style="margin:0 0 6px 0;"><strong>Fondement :</strong> ${ground}</p>` : ''}
<p style="margin:0;white-space:pre-wrap;">${data.reason ?? ''}</p></div>
<p style="margin:0 0 14px 0;">${contest}</p>`
    : data.reason
      ? html`<p style="margin:0 0 14px 0;"><strong>Note de l’équipe :</strong> ${data.reason}</p>`
      : ''
}
<p style="margin:0 0 14px 0;"><a href="${studioUrl}" style="color:#4aa8f0;">Ouvrir mon espace studio</a></p>
<p style="margin:0;color:#5f5f66;font-size:13px;">Référence : ${data.reference}</p>
</td></tr>
<tr><td style="padding:18px 16px;font-size:12px;line-height:18px;color:#8a8a93;text-align:center;">
Vous recevez cet e-mail car vous êtes responsable du studio « ${data.studioName} » sur Dev AppStore.<br>
${[ctx.companyName, ctx.companyAddress].filter(Boolean).join(' · ')}
</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    'Dev AppStore',
    '',
    `Bonjour ${data.studioName},`,
    '',
    intros[data.action],
    ...(isSuspension
      ? ['', 'MOTIFS DE LA DÉCISION', ...(ground ? [`Fondement : ${ground}`] : []), data.reason ?? '', '', contest]
      : data.reason
        ? ['', `Note de l’équipe : ${data.reason}`]
        : []),
    '',
    `Espace studio : ${studioUrl}`,
    `Référence : ${data.reference}`,
  ].join('\n');

  return { subject, html: body.value, text };
}
