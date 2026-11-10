import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { SIGNATURE_HEADER, formatMoney, type DeliveryStatus, type PurchaseEvent, type StudioRole } from '@devappstore/core';
import { db, eq, games } from '@devappstore/db';
import { PLAYER_TOKEN_HEADER, ensurePublishableKey } from '@/server/api-key';
import { listDeliveryLog } from '@/server/delivery';
import { INTEGRATION_ADMINS, listIntegrationAudit } from '@/server/integration-audit';
import { playerTokenSummary } from '@/server/player-tokens';
import { requireGameAccess } from '@/server/session';
import {
  ApiKeyControl,
  CopyButton,
  PublishableKeyControl,
  RetryDeliveryButton,
  RevokePlayerTokensControl,
  WebhookSecretControl,
  WebhookUrlControl,
} from '@/components/studio/integration/IntegrationControls';
import { LinkSettings } from '@/components/studio/LinkSettings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Intégration' };

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
  let role: StudioRole;
  try {
    ({ role } = await requireGameAccess(id));
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') notFound();
    throw e;
  }
  // Projection explicite : aucun secret (webhookSecret, apiKeyHash) n'est lu pour le rendu.
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      slug: games.slug,
      currency: games.currency,
      webhookUrl: games.webhookUrl,
      apiKeyPrefix: games.apiKeyPrefix,
      apiKeyPreviousPrefix: games.apiKeyPreviousPrefix,
      apiKeyPreviousExpiresAt: games.apiKeyPreviousExpiresAt,
      apiKeyPreviousLastUsedAt: games.apiKeyPreviousLastUsedAt,
    })
    .from(games)
    .where(eq(games.id, id));
  if (!game) notFound();
  const canEdit = role !== 'finance';
  // Rotations de clés / secret et changement d'URL : propriétaire et administrateur seulement (A-08, F8).
  const canAdmin = INTEGRATION_ADMINS.includes(role);
  const previousKey =
    game.apiKeyPreviousPrefix && game.apiKeyPreviousExpiresAt && game.apiKeyPreviousExpiresAt.getTime() > Date.now()
      ? { prefix: game.apiKeyPreviousPrefix, expiresAt: game.apiKeyPreviousExpiresAt.toISOString(), lastUsedAt: game.apiKeyPreviousLastUsedAt?.toISOString() ?? null }
      : null;
  const origin = await baseUrl();
  const storeUrl = `${origin}/games/${game.slug}`;
  const [publishableKey, log, tokens, audit] = await Promise.all([
    ensurePublishableKey(game.id),
    listDeliveryLog(game.id, 50),
    playerTokenSummary(game.id),
    listIntegrationAudit(game.id, 20),
  ]);

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
const SECRET = process.env.DEVAPPSTORE_WEBHOOK_SECRET; // whsec_…

app.post('/devappstore/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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
  // Idempotence : ne créditez qu'une fois par delivery_id (Dev AppStore peut renvoyer le même événement).
  if (!(await alreadyCredited(event.delivery_id))) {
    await creditPlayer(event.player_id, event.product_id, event.quantity);
  }
  res.sendStatus(200); // toute réponse 2xx vaut livraison
});`;

  const serverExample = `# Depuis VOTRE SERVEUR uniquement : clé secrète (das_secret_…), accès à tous les joueurs du jeu.
# Code de liaison à afficher dans le jeu (le serveur connaît l'identité du joueur connecté)
curl -X POST -H "Authorization: Bearer $DEVAPPSTORE_SECRET_KEY" -H "Content-Type: application/json" \\
  -d '{"player_id":"player_42","player_name":"Ali"}' "${origin}/api/v1/link-codes"

# Achats en attente d'un joueur, puis accusé de réception après crédit (idempotent)
curl -H "Authorization: Bearer $DEVAPPSTORE_SECRET_KEY" "${origin}/api/v1/deliveries?player_id=player_42"
curl -X POST -H "Authorization: Bearer $DEVAPPSTORE_SECRET_KEY" "${origin}/api/v1/deliveries/dlv_…/ack"`;

  const sdkExample = `# Jeu SANS serveur (le SDK Dev AppStore encapsule ces appels) : clé publique ${publishableKey ?? 'das_pub_…'}
# 1. Liaison (une fois par appareil) : code à afficher + identifiant de la demande
curl -X POST -H "Authorization: Bearer $DEVAPPSTORE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \\
  -d '{"player_id":"player_42"}' "${origin}/api/v1/link-codes"
#    → { "code": "K7QF-M2XA", "expires_at": "…", "link_request_id": "lnc_…" }

# 2. Le joueur saisit le code sur ${storeUrl}/link ; le jeu interroge la demande (toutes les 3 s)
curl -H "Authorization: Bearer $DEVAPPSTORE_PUBLISHABLE_KEY" "${origin}/api/v1/link-requests/lnc_…"
#    → { "status": "linked", "player_token": "das_pt_…" }  (délivré une seule fois : à conserver sur l'appareil)

# 3. Achats du joueur (liste, flux temps réel SSE, accusé de réception) avec le jeton joueur
curl -H "Authorization: Bearer $DEVAPPSTORE_PUBLISHABLE_KEY" -H "${PLAYER_TOKEN_HEADER}: $PLAYER_TOKEN" "${origin}/api/v1/deliveries"
curl -N -H "Authorization: Bearer $DEVAPPSTORE_PUBLISHABLE_KEY" -H "${PLAYER_TOKEN_HEADER}: $PLAYER_TOKEN" "${origin}/api/v1/deliveries/stream"
curl -X POST -H "Authorization: Bearer $DEVAPPSTORE_PUBLISHABLE_KEY" -H "${PLAYER_TOKEN_HEADER}: $PLAYER_TOKEN" "${origin}/api/v1/deliveries/dlv_…/ack"`;

  const jsSdkExample = `import { DevAppStore } from '@devappstore/sdk';

const devappstore = new DevAppStore({ publishableKey: '${publishableKey ?? 'das_pub_…'}', baseUrl: '${origin}', storage: localStorage });

// Paramètres → « Lier mon compte web » (une fois par appareil)
const link = await devappstore.requestLinkCode(player.id, player.name);
showCode(link.code);                 // le joueur le saisit sur Dev AppStore
await devappstore.waitForLink(link);     // jeton joueur reçu et mémorisé (storage)

// Achats (et remboursements) : chaque delivery_id une seule fois, ack après le handler
devappstore.onPurchase(player.id, async (e) => {
  if (e.event === 'purchase.refunded') await inventory.revoke(e.order_id);
  else await inventory.grant(e.order_id, e.product_id, e.quantity);
});`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Intégration</h1>
        <p className="mt-1 text-sm text-ink-2">
          Connectez {game.name} à Dev AppStore : chaque achat est livré automatiquement à votre jeu, par webhook signé vers votre serveur (clé
          secrète) ou en temps réel via le SDK embarqué (clé publique + jeton joueur).
        </p>
        <p className="mt-1 text-sm text-ink-2">
          Guide complet : <Link href="/docs/demarrage-rapide" className="text-primary underline">documentation développeur</Link>.
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
        title="Clés API"
        description={
          <>
            Deux clés, deux usages (<code className="font-mono">Authorization: Bearer …</code>). Tout ce qui est embarqué dans le jeu peut être
            extrait : seule la clé publique doit s&apos;y trouver.
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-1 text-sm font-medium text-ink">Clé publique — dans le jeu</h3>
            <p className="mb-2 text-sm text-ink-2">
              Pour un jeu <strong>sans serveur</strong> (SDK JavaScript, Unity, Godot, Unreal). Elle n&apos;est pas secrète : seule, elle permet
              uniquement de demander un code de liaison. Une fois le code saisi par le joueur, le SDK reçoit un <strong>jeton joueur</strong> qui
              lui donne accès aux achats de <strong>ce joueur</strong> (et de lui seul).
            </p>
            {publishableKey ? (
              <PublishableKeyControl gameId={game.id} initialKey={publishableKey} canEdit={canAdmin} />
            ) : (
              <p className="text-sm text-danger">Clé publique indisponible.</p>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium text-ink">Clé secrète — sur votre serveur uniquement</h3>
            <p className="mb-2 text-sm text-ink-2">
              Accès à tout le jeu : achats de tous les joueurs, accusés de réception, codes de liaison, révocation des jetons. Ne
              l&apos;embarquez <strong>jamais</strong> dans le jeu ni dans une page web. Seul son préfixe est conservé : elle n&apos;est affichée
              qu&apos;à sa création.
            </p>
            <ApiKeyControl gameId={game.id} prefix={game.apiKeyPrefix} canEdit={canAdmin} previous={previousKey} />
          </div>
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-5 py-2 font-medium">Votre jeu…</th>
                  <th className="px-2 py-2 font-medium">Clé</th>
                  <th className="px-5 py-2 font-medium">Réception des achats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink-2">
                <tr>
                  <td className="px-5 py-2.5">a un serveur (jeu en ligne, comptes joueurs)</td>
                  <td className="px-2 py-2.5 font-mono text-xs">das_secret_…</td>
                  <td className="px-5 py-2.5">Webhook signé vers votre serveur (recommandé) ; codes de liaison demandés par votre serveur.</td>
                </tr>
                <tr>
                  <td className="px-5 py-2.5">n&apos;a pas de serveur (hors ligne, HTML5, prototype)</td>
                  <td className="px-2 py-2.5 font-mono text-xs">das_pub_…</td>
                  <td className="px-5 py-2.5">SDK dans le jeu : liaison par code → jeton joueur → flux temps réel et accusés de réception.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section
        title="Webhook"
        description={
          <>
            Dev AppStore envoie un <code className="font-mono">POST</code> JSON à chaque achat, signé avec l&apos;en-tête{' '}
            <code className="font-mono">{SIGNATURE_HEADER}</code> (HMAC-SHA256 du secret ci-dessous).
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">URL du webhook</h3>
            <WebhookUrlControl gameId={game.id} initialUrl={game.webhookUrl} canEdit={canEdit} canChangeUrl={canAdmin} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Secret de signature</h3>
            <WebhookSecretControl gameId={game.id} canEdit={canEdit} canRotate={canAdmin} />
          </div>
        </div>
      </Section>

      <Section
        title="Jetons joueur (SDK sans serveur)"
        description={
          <>
            Chaque appareil lié par le SDK avec la clé publique reçoit un jeton (<code className="font-mono">{PLAYER_TOKEN_HEADER}</code>), lié au
            joueur et au compte Dev AppStore qui a saisi le code. Révoquez-les si un appareil est perdu ou un compte compromis : le jeu devra
            refaire la liaison.
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-2">
          {tokens.active === 0 ? 'Aucun appareil lié pour l’instant.' : `${tokens.active} jeton${tokens.active > 1 ? 's' : ''} actif${tokens.active > 1 ? 's' : ''}.`}
        </p>
        {tokens.recent.length > 0 && (
          <ul className="mb-3 divide-y divide-line rounded-lg border border-line text-sm">
            {tokens.recent.map((t, i) => (
              <li key={`${t.playerId}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-mono text-xs">{t.playerId}</span>
                <span className="text-xs text-ink-3">
                  lié le {dateFmt.format(t.createdAt)}
                  {t.lastUsedAt ? ` · vu le ${dateFmt.format(t.lastUsedAt)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && <RevokePlayerTokensControl gameId={game.id} />}
      </Section>

      <Section title="Liaison des comptes" description="Comment vos joueurs relient leur compte Dev AppStore à leur compte de jeu.">
        <LinkSettings gameId={game.id} />
      </Section>

      <Section title="Journal des modifications" description="Rotations de clés et de secret, changements d'URL, affichages du secret (20 dernières entrées).">
        {audit.length === 0 ? (
          <p className="text-sm text-ink-3">Aucune modification enregistrée.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="font-mono text-xs">{a.action}</span>
                  {a.details.to !== undefined && <span className="ml-2 text-xs text-ink-3">→ {String(a.details.to ?? '(vide)')}</span>}
                </span>
                <span className="text-xs text-ink-3">
                  {dateFmt.format(a.createdAt)} · {a.actorRole} · <span className="font-mono">{a.actorUserId}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Journal des livraisons" description="Les 50 derniers événements de ce jeu (achats et remboursements).">
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
                        {d.kind === 'refund' && (
                          <span className="mr-1.5 inline-block rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">Remboursement</span>
                        )}
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
            <p className="mt-2 text-sm text-ink-2">
              Remboursement : même format avec <code className="font-mono">&quot;event&quot;: &quot;purchase.refunded&quot;</code>, le même{' '}
              <code className="font-mono">order_id</code> que l&apos;achat et un <code className="font-mono">delivery_id</code> propre. Retirez
              l&apos;objet si vous aviez crédité cet <code className="font-mono">order_id</code>, sinon ignorez-le ; accusez réception dans les deux cas.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Vérifier la signature (Node.js)</h3>
            <CodeBlock>{nodeExample}</CodeBlock>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">API serveur (clé secrète)</h3>
            <CodeBlock>{serverExample}</CodeBlock>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Jeu sans serveur : SDK JavaScript (clé publique + jeton joueur)</h3>
            <CodeBlock>{jsSdkExample}</CodeBlock>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Jeu sans serveur : API utilisée par les SDK</h3>
            <CodeBlock>{sdkExample}</CodeBlock>
          </div>
        </div>
      </Section>
    </div>
  );
}
