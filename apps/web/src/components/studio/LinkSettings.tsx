import 'server-only';
import { getLinkSettings } from '@/server/linking';
import { requireGameAccess } from '@/server/session';
import { saveLinkSettingsAction } from './link-settings-actions';
import { LinkSettingsForm } from './LinkSettingsForm';

const CODE_SAMPLE = `curl -X POST https://<devappstore>/api/v1/link-codes \\
  -H "Authorization: Bearer das_…" \\
  -H "Content-Type: application/json" \\
  -d '{"player_id":"#2PP8QL9","player_name":"Lina"}'

→ 200 { "code": "K7QF-M2XA", "expires_at": "2026-01-01T12:10:00.000Z" }
  (429 + Retry-After si trop de demandes)`;

const LOOKUP_SAMPLE = `GET https://api.monjeu.com/devappstore/players/%232PP8QL9
Accept: application/json
DevAppStore-Signature: t=1767268800,v1=<HMAC-SHA256 hex>

→ 200 { "player_id": "#2PP8QL9", "display_name": "Lina", "level": 42, "avatar_url": "https://…" }
→ 404 si l'identifiant est inconnu`;

const VERIFY_SAMPLE = `// Node.js — v1 = HMAC-SHA256(secret webhook, \`\${t}.\${player_id}\`), player_id décodé
import crypto from 'node:crypto';

app.get('/devappstore/players/:id', (req, res) => {
  const { t, v1 = '' } = Object.fromEntries((req.get('DevAppStore-Signature') ?? '').split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', process.env.DEVAPPSTORE_WEBHOOK_SECRET).update(\`\${t}.\${req.params.id}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  if (!fresh || v1.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) {
    return res.status(401).end();
  }
  const player = findPlayer(req.params.id);
  if (!player) return res.status(404).end();
  res.json({ player_id: player.id, display_name: player.name, level: player.level });
});`;

/**
 * Réglages de liaison des comptes joueurs (onglet Intégration du studio).
 * Composant serveur : <LinkSettings gameId={game.id} />. L'enregistrement est protégé par requireGameAccess.
 */
export async function LinkSettings({ gameId }: { gameId: string }) {
  await requireGameAccess(gameId);
  const settings = await getLinkSettings(gameId);
  if (!settings) return null;

  return (
    <section className="rounded-[var(--radius)] border border-line bg-surface p-6" aria-labelledby="link-settings-title">
      <h3 id="link-settings-title" className="text-lg font-semibold text-ink">
        Liaison des comptes joueurs
      </h3>
      <p className="mt-1 text-sm text-ink-2">
        Avant son premier achat, le joueur relie son compte Dev AppStore à son compte dans le jeu : c&apos;est à ce compte que ses achats
        sont livrés.
      </p>

      <LinkSettingsForm
        action={saveLinkSettingsAction.bind(null, gameId)}
        initial={{ methods: settings.linkMethods, playerLookupUrl: settings.playerLookupUrl ?? '' }}
      />

      <details className="mt-6 rounded-lg border border-line bg-bg p-4 text-sm">
        <summary className="cursor-pointer font-medium text-ink">Documentation technique</summary>
        <h4 className="mt-4 font-medium text-ink">Code affiché dans le jeu</h4>
        <p className="mt-1 text-ink-2">
          Votre serveur (ou le SDK) demande un code pour le joueur, puis l&apos;affiche avec le lien de la boutique. Un nouveau code
          annule le précédent ; chaque code ne sert qu&apos;une fois.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs leading-relaxed text-ink">{CODE_SAMPLE}</pre>
        <h4 className="mt-5 font-medium text-ink">Recherche par identifiant</h4>
        <p className="mt-1 text-ink-2">
          Dev AppStore appelle votre URL en remplaçant <code className="font-mono">{'{player_id}'}</code>. La signature porte sur
          l&apos;identifiant brut, avec le secret de webhook du jeu : vérifiez-la et refusez les requêtes de plus de 5 minutes.
          Les redirections ne sont pas suivies ; réponse attendue en moins de 5 s et de 16 Ko.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs leading-relaxed text-ink">{LOOKUP_SAMPLE}</pre>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs leading-relaxed text-ink">{VERIFY_SAMPLE}</pre>
      </details>
    </section>
  );
}

export default LinkSettings;
