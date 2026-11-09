import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { SIGNATURE_HEADER, formatMoney, type DeliveryStatus, type PurchaseEvent } from '@wolleen/core';
import { db, eq, games } from '@wolleen/db';
import { listRecentDeliveries } from '@/server/delivery';
import { requireGameAccess } from '@/server/session';
import {
  ApiKeyControl,
  CopyButton,
  RetryDeliveryButton,
  WebhookSecretControl,
  WebhookUrlControl,
} from '@/components/studio/integration/IntegrationControls';
import { LinkSettings } from '@/components/studio/LinkSettings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Intégration — Wolleen Studio' };

const STATUS: Record<DeliveryStatus, { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'bg-warn/10 text-warn' },
  delivered: { label: 'Livrée', className: 'bg-primary/10 text-primary' },
  acknowledged: { label: 'Créditée', className: 'bg-ok/10 text-ok' },
  failed: { label: 'Échec', className: 'bg-danger/10 text-danger' },
};

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Paris' });

async function baseUrl() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
  return process.env.APP_URL ?? 'http://localhost:3000';
}

function Section({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius)] border border-line bg-surface p-5">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-4 font-mono text-[12.5px] leading-relaxed text-ink">
      <code>{children}</code>
    </pre>
  );
}

export default async function IntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let role: string;
  try {
    ({ role } = await requireGameAccess(id));
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') notFound();
    throw e;
  }
  const [game] = await db.select().from(games).where(eq(games.id, id));
  if (!game) notFound();
  const canEdit = role !== 'finance';
  const origin = await baseUrl();
  const storeUrl = `${origin}/games/${game.slug}`;
  const log = await listRecentDeliveries(game.id, 50);

  const samplePayload: PurchaseEvent = {
    event: 'purchase.completed',
    delivery_id: 'dlv_8QmZt3…',
    order_id: 'ord_Xr2b9L…',
    game_id: game.id,
    player_id: 'player_42',
    product_id: 'gems_1200',
    item_type: 'consumable',
    quantity: 1200,
    amount_cents: 799,
    currency: game.currency,
    created_at: '2026-11-09T14:03:12.000Z',
  };

  const nodeExample = `// Express — vérification de la signature ${SIGNATURE_HEADER}
import crypto from 'node:crypto';
import express from 'express';

const app = express();
const SECRET = process.env.WOLLEEN_WEBHOOK_SECRET; // whsec_…

app.post('/wolleen/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const body = req.body.toString('utf8'); // corps BRUT, avant JSON.parse
  const header = req.get('${SIGNATURE_HEADER}') ?? ''; // "t=1731160992,v1=5f2c…"
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', SECRET).update(\`\${t}.\${body}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300; // 5 min de tolérance
  if (!fresh || !v1 || v1.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) {
    return res.status(400).send('signature invalide');
  }

  const event = JSON.parse(body);
  // Idempotence : ne créditez qu'une fois par delivery_id (Wolleen peut renvoyer le même événement).
  if (!(await alreadyCredited(event.delivery_id))) {
    await creditPlayer(event.player_id, event.product_id, event.quantity);
  }
  res.sendStatus(200); // toute réponse 2xx vaut livraison
});`;

  const sdkExample = `# Sans serveur, le jeu récupère lui-même les achats du joueur (le SDK Wolleen encapsule ces appels).
# 1. Au lancement / retour au premier plan : achats en attente
curl -H "Authorization: Bearer $WOLLEEN_API_KEY" "${origin}/api/v1/deliveries?player_id=player_42"

# 2. En jeu : flux temps réel (Server-Sent Events, événement "purchase", ping toutes les 15 s)
curl -N -H "Authorization: Bearer $WOLLEEN_API_KEY" "${origin}/api/v1/deliveries/stream?player_id=player_42"

# 3. Après avoir crédité le joueur : accusé de réception (idempotent)
curl -X POST -H "Authorization: Bearer $WOLLEEN_API_KEY" "${origin}/api/v1/deliveries/dlv_…/ack"`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Intégration</h1>
        <p className="mt-1 text-sm text-ink-2">
          Connectez {game.name} à Wolleen : chaque achat est livré automatiquement à votre jeu, par webhook signé vers votre serveur et/ou en
          temps réel via le SDK.
        </p>
      </div>

      <Section title="Boutique publique" description="Partagez ce lien avec vos joueurs (dans le jeu, sur vos réseaux, dans vos e-mails).">
        <div className="flex flex-wrap items-center gap-2">
          <a href={storeUrl} target="_blank" rel="noreferrer" className="font-mono text-sm text-primary hover:underline break-all">
            {storeUrl}
          </a>
          <CopyButton value={storeUrl} label="Copier le lien" />
        </div>
      </Section>

      <Section
        title="Clé API"
        description={
          <>
            Authentifie votre jeu et votre serveur auprès de l&apos;API Wolleen (<code className="font-mono">Authorization: Bearer …</code>). Seul le
            préfixe est conservé en clair.
          </>
        }
      >
        <ApiKeyControl gameId={game.id} prefix={game.apiKeyPrefix} canEdit={canEdit} />
      </Section>

      <Section
        title="Webhook"
        description={
          <>
            Wolleen envoie un <code className="font-mono">POST</code> JSON à chaque achat, signé avec l&apos;en-tête{' '}
            <code className="font-mono">{SIGNATURE_HEADER}</code> (HMAC-SHA256 du secret ci-dessous).
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">URL du webhook</h3>
            <WebhookUrlControl gameId={game.id} initialUrl={game.webhookUrl} canEdit={canEdit} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Secret de signature</h3>
            <WebhookSecretControl gameId={game.id} canEdit={canEdit} />
          </div>
        </div>
      </Section>

      <Section title="Liaison des comptes" description="Comment vos joueurs relient leur compte Wolleen à leur compte de jeu.">
        <LinkSettings gameId={game.id} />
      </Section>

      <Section title="Journal des livraisons" description="Les 50 dernières livraisons de ce jeu.">
        {log.length === 0 ? (
          <p className="text-sm text-ink-3">Aucune livraison pour l&apos;instant. Elles apparaîtront ici dès le premier achat.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Joueur</th>
                  <th className="px-2 py-2 font-medium">Produit</th>
                  <th className="px-2 py-2 font-medium">Montant</th>
                  <th className="px-2 py-2 font-medium">Statut</th>
                  <th className="px-2 py-2 font-medium">Tentatives</th>
                  <th className="px-5 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {log.map((d) => {
                  const s = STATUS[d.status];
                  return (
                    <tr key={d.id} className="align-top">
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink-2">
                        {dateFmt.format(d.createdAt)}
                        <div className="font-mono text-[11px] text-ink-3">{d.id}</div>
                      </td>
                      <td className="px-2 py-2.5 font-mono text-xs">{d.playerId}</td>
                      <td className="px-2 py-2.5">
                        <span className="font-mono text-xs">{d.payload.product_id}</span>
                        <span className="text-ink-3"> × {d.payload.quantity}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5">{formatMoney(d.payload.amount_cents, d.payload.currency)}</td>
                      <td className="px-2 py-2.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>
                        {d.lastError && d.status !== 'acknowledged' && d.status !== 'delivered' && (
                          <div className="mt-1 max-w-[220px] text-xs text-danger">{d.lastError}</div>
                        )}
                        {d.status === 'pending' && d.nextAttemptAt && (
                          <div className="mt-1 text-xs text-ink-3">Prochain essai : {dateFmt.format(d.nextAttemptAt)}</div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-ink-2">{d.attempts}</td>
                      <td className="px-5 py-2.5 text-right">
                        {canEdit && (d.status === 'pending' || d.status === 'failed') ? (
                          <RetryDeliveryButton gameId={game.id} deliveryId={d.id} />
                        ) : (
                          <span className="text-xs text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Exemples de code" description="Créditez toujours une seule fois par delivery_id : un même achat peut vous parvenir plusieurs fois.">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Payload de l&apos;événement</h3>
            <CodeBlock>{JSON.stringify(samplePayload, null, 2)}</CodeBlock>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Vérifier la signature (Node.js)</h3>
            <CodeBlock>{nodeExample}</CodeBlock>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Recevoir les achats dans le jeu (API utilisée par le SDK)</h3>
            <CodeBlock>{sdkExample}</CodeBlock>
          </div>
        </div>
      </Section>
    </div>
  );
}
