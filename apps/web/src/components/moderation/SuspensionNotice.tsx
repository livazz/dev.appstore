import { getActiveSuspension } from '@/server/moderation-notices';
import { SUSPENSION_GROUNDS, type SuspensionGround } from '@/server/admin-logic';

const dtf = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });

/**
 * Bandeau de l'espace studio : motif de la suspension du jeu décidée par l'équipe Dev AppStore (exigence P2B),
 * avec la voie de contestation. N'affiche rien si le jeu n'est pas suspendu. L'appelant a déjà vérifié l'accès au jeu.
 */
export async function SuspensionNotice({ gameId, supportEmail = process.env.SUPPORT_EMAIL || 'support@wolleen.com' }: { gameId: string; supportEmail?: string }) {
  const n = await getActiveSuspension(gameId);
  if (!n) return null;
  const ground = n.ground ? (SUSPENSION_GROUNDS[n.ground as SuspensionGround] ?? n.ground) : null;
  return (
    <section role="alert" aria-label="Jeu suspendu" className="mb-5 rounded-2xl border-l-4 border-danger bg-danger/10 p-4 text-sm">
      <h2 className="font-semibold text-danger">Jeu suspendu par l’équipe Dev AppStore le {dtf.format(n.createdAt)}</h2>
      <p className="mt-1 text-ink-2">Sa boutique n’est plus visible et les achats sont bloqués. Les achats déjà payés restent livrés.</p>
      {ground ? (
        <p className="mt-2">
          <strong>Fondement :</strong> {ground}
        </p>
      ) : null}
      {n.reason ? <p className="mt-1 whitespace-pre-line break-words">{n.reason}</p> : null}
      <p className="mt-2 text-ink-2">
        Pour contester cette décision, écrivez à{' '}
        <a href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Contestation ${n.id}`)}`} className="text-primary underline">
          {supportEmail}
        </a>{' '}
        en citant la référence <code className="font-mono">{n.id}</code>.
      </p>
    </section>
  );
}
