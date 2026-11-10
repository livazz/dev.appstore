'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  regenerateApiKey,
  regeneratePublishableKey,
  regenerateWebhookSecret,
  retryDeliveryAction,
  revealWebhookSecret,
  revokePlayerTokensAction,
  revokePreviousApiKey,
  sendTestEvent,
  updateWebhookUrl,
} from '@/app/studio/games/[id]/integration/actions';

const btn = 'inline-flex items-center justify-center rounded-lg px-3.5 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = `${btn} bg-primary text-white hover:brightness-95`;
const btnCancel = `${btn} bg-cancel text-white hover:brightness-95`;
const btnGhost = `${btn} border border-line bg-surface text-ink hover:bg-bg`;
const code = 'rounded-md border border-line bg-bg px-2.5 py-1.5 font-mono text-[13px] text-ink break-all';

export function CopyButton({ value, label = 'Copier' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={btnGhost}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* presse-papiers indisponible (http non sécurisé) */
        }
      }}
    >
      {copied ? 'Copié ✓' : label}
    </button>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="mt-2 text-sm text-danger">{error}</p> : null;
}

/* ---------------------------------------------------------------- clé publique */

export function PublishableKeyControl({ gameId, initialKey, canEdit }: { gameId: string; initialKey: string; canEdit: boolean }) {
  const [key, setKey] = useState(initialKey);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const regenerate = () =>
    start(async () => {
      setError(null);
      const r = await regeneratePublishableKey(gameId);
      setConfirming(false);
      if (!r.ok) return setError(r.error);
      setKey(r.publishableKey);
    });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={code}>{key}</span>
        <CopyButton value={key} />
        {canEdit && !confirming && (
          <button type="button" className={btnGhost} onClick={() => setConfirming(true)}>
            Régénérer
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm">
          <p className="text-ink">
            Les versions du jeu qui embarquent l&apos;ancienne clé publique ne pourront plus lier de compte ni recevoir d&apos;achats. À
            réserver à un abus avéré (la clé publique n&apos;est pas un secret).
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnCancel} onClick={() => setConfirming(false)} disabled={pending}>
              Annuler
            </button>
            <button type="button" className={btnPrimary} onClick={regenerate} disabled={pending}>
              {pending ? 'Génération…' : 'Générer une nouvelle clé publique'}
            </button>
          </div>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}

/* ---------------------------------------------------------------- jetons joueur */

export function RevokePlayerTokensControl({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            setResult(null);
            const r = await revokePlayerTokensAction(gameId, playerId);
            if (!r.ok) return setError(r.error);
            setResult(r.revoked > 0 ? `${r.revoked} jeton${r.revoked > 1 ? 's' : ''} révoqué${r.revoked > 1 ? 's' : ''}.` : 'Aucun jeton actif pour ce joueur.');
            setPlayerId('');
            router.refresh();
          });
        }}
      >
        <input
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          placeholder="ID du joueur dans le jeu, ex. #2PP8QL9"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        <button type="submit" className={btnGhost} disabled={pending || !playerId.trim()}>
          {pending ? 'Révocation…' : 'Révoquer ses jetons'}
        </button>
      </form>
      {result && <p className="mt-2 text-sm text-ok">{result}</p>}
      <ErrorText error={error} />
    </div>
  );
}

/* ---------------------------------------------------------------- clé secrète */

export interface PreviousKeyInfo {
  prefix: string;
  /** ISO */
  expiresAt: string;
  /** ISO */
  lastUsedAt: string | null;
}

const shortDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** `canEdit` : rotation autorisée (propriétaire / administrateur du studio). */
export function ApiKeyControl({ gameId, prefix, canEdit, previous: initialPrevious = null }: { gameId: string; prefix: string; canEdit: boolean; previous?: PreviousKeyInfo | null }) {
  const [confirming, setConfirming] = useState(false);
  const [immediate, setImmediate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [currentPrefix, setCurrentPrefix] = useState(prefix);
  const [previous, setPrevious] = useState<PreviousKeyInfo | null>(initialPrevious);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const regenerate = () =>
    start(async () => {
      setError(null);
      const oldPrefix = currentPrefix;
      const r = await regenerateApiKey(gameId, { immediate });
      setConfirming(false);
      if (!r.ok) return setError(r.error);
      setNewKey(r.apiKey);
      setCurrentPrefix(r.prefix);
      setPrevious(r.previousExpiresAt ? { prefix: oldPrefix, expiresAt: r.previousExpiresAt, lastUsedAt: null } : null);
    });
  const revokePrevious = () =>
    start(async () => {
      setError(null);
      const r = await revokePreviousApiKey(gameId);
      if (!r.ok) return setError(r.error);
      setPrevious(null);
    });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={code}>{currentPrefix}••••••••••••••••</span>
        {canEdit && !confirming && !newKey && (
          <button type="button" className={btnGhost} onClick={() => setConfirming(true)}>
            Régénérer
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm">
          <p className="text-ink">
            L&apos;ancienne clé secrète reste acceptée 24 h, le temps de déployer la nouvelle sur votre serveur.
          </p>
          <label className="mt-2 flex items-center gap-2 text-ink-2">
            <input type="checkbox" checked={immediate} onChange={(e) => setImmediate(e.target.checked)} />
            Clé compromise : révoquer l&apos;ancienne immédiatement
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnCancel} onClick={() => setConfirming(false)} disabled={pending}>
              Annuler
            </button>
            <button type="button" className={btnPrimary} onClick={regenerate} disabled={pending}>
              {pending ? 'Génération…' : 'Générer une nouvelle clé'}
            </button>
          </div>
        </div>
      )}
      {previous && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <span>
            Ancienne clé <span className="font-mono">{previous.prefix}…</span> acceptée jusqu&apos;au {shortDate(previous.expiresAt)}
            {previous.lastUsedAt ? ` · dernière utilisation ${shortDate(previous.lastUsedAt)}` : ' · non utilisée depuis la rotation'}
          </span>
          {canEdit && (
            <button type="button" className={btnGhost} onClick={revokePrevious} disabled={pending}>
              Révoquer maintenant
            </button>
          )}
        </div>
      )}
      {newKey && (
        <div className="mt-3 rounded-lg border border-ok/40 bg-ok/5 p-3 text-sm">
          <p className="font-medium text-ink">Nouvelle clé secrète — copiez-la maintenant dans la configuration de votre serveur, elle ne sera plus affichée.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={code}>{newKey}</span>
            <CopyButton value={newKey} />
          </div>
          <button type="button" className="mt-2 text-sm text-ink-2 underline" onClick={() => setNewKey(null)}>
            J&apos;ai copié la clé
          </button>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}

/* ---------------------------------------------------------------- secret webhook */

/** `canEdit` : affichage du secret ; `canRotate` : rotation (propriétaire / administrateur). */
export function WebhookSecretControl({ gameId, canEdit, canRotate = canEdit }: { gameId: string; canEdit: boolean; canRotate?: boolean }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [immediate, setImmediate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reveal = () =>
    start(async () => {
      setError(null);
      const r = await revealWebhookSecret(gameId);
      if (!r.ok) return setError(r.error);
      setSecret(r.secret);
    });
  const regenerate = () =>
    start(async () => {
      setError(null);
      const r = await regenerateWebhookSecret(gameId, { immediate });
      setConfirming(false);
      if (!r.ok) return setError(r.error);
      setSecret(r.secret);
    });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={code}>{secret ?? 'whsec_••••••••••••••••••••'}</span>
        {secret ? (
          <>
            <CopyButton value={secret} />
            <button type="button" className={btnGhost} onClick={() => setSecret(null)}>
              Masquer
            </button>
          </>
        ) : (
          canEdit && (
            <button type="button" className={btnGhost} onClick={reveal} disabled={pending}>
              Afficher
            </button>
          )
        )}
        {canRotate && !confirming && (
          <button type="button" className={btnGhost} onClick={() => setConfirming(true)} disabled={pending}>
            Régénérer
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm">
          <p className="text-ink">
            Pendant 24 h, chaque envoi porte deux signatures (<code className="font-mono">v1=</code> nouveau et ancien secret) : mettez à
            jour votre serveur sans interruption.
          </p>
          <label className="mt-2 flex items-center gap-2 text-ink-2">
            <input type="checkbox" checked={immediate} onChange={(e) => setImmediate(e.target.checked)} />
            Secret compromis : ne plus signer avec l&apos;ancien
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnCancel} onClick={() => setConfirming(false)} disabled={pending}>
              Annuler
            </button>
            <button type="button" className={btnPrimary} onClick={regenerate} disabled={pending}>
              {pending ? 'Génération…' : 'Générer un nouveau secret'}
            </button>
          </div>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}

/* ---------------------------------------------------------------- URL webhook + test */

/** `canEdit` : événement de test ; `canChangeUrl` : modification de l'URL (propriétaire / administrateur). */
export function WebhookUrlControl({ gameId, initialUrl, canEdit, canChangeUrl = canEdit }: { gameId: string; initialUrl: string | null; canEdit: boolean; canChangeUrl?: boolean }) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [saved, setSaved] = useState(initialUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = url.trim() !== saved;

  const save = () =>
    start(async () => {
      setError(null);
      setTest(null);
      setInfo(null);
      const r = await updateWebhookUrl(gameId, url);
      if (!r.ok) return setError(r.error);
      setSaved(r.webhookUrl ?? '');
      setUrl(r.webhookUrl ?? '');
      if (r.resumed > 0) {
        const n = r.resumed;
        setInfo(`${n} livraison${n > 1 ? 's' : ''} en attente ${n > 1 ? 'vont' : 'va'} être envoyée${n > 1 ? 's' : ''} à ce webhook.`);
      }
    });
  const sendTest = () =>
    start(async () => {
      setError(null);
      setTest(null);
      const r = await sendTestEvent(gameId);
      if (!r.ok) return setError(r.error);
      if (r.error) setTest({ ok: false, text: `Échec : ${r.error}${r.durationMs ? ` (${r.durationMs} ms)` : ''}` });
      else setTest({ ok: true, text: `Succès : HTTP ${r.statusCode} en ${r.durationMs} ms` });
    });

  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!canChangeUrl}
          placeholder="https://api.monjeu.com/devappstore/webhook"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        {canChangeUrl && dirty && (
          <>
            <button type="button" className={btnCancel} onClick={() => setUrl(saved)} disabled={pending}>
              Annuler
            </button>
            <button type="submit" className={btnPrimary} disabled={pending}>
              Enregistrer
            </button>
          </>
        )}
        {canEdit && !dirty && (
          <button type="button" className={btnPrimary} onClick={sendTest} disabled={pending || !saved}>
            {pending ? 'Envoi…' : 'Envoyer un événement de test'}
          </button>
        )}
      </form>
      <p className="mt-2 text-xs text-ink-3">
        Laissez vide si votre jeu reçoit les achats uniquement via le SDK. En production, l&apos;URL doit être en https:// et publique
        (aucune adresse interne ; les redirections ne sont pas suivies). Les réponses 2xx valent livraison ; sinon Dev AppStore réessaie
        (10 s, 1 min, 5 min, 30 min, 2 h, 6 h, 24 h).
      </p>
      {info && <p className="mt-2 text-sm text-ok">{info}</p>}
      {test && <p className={`mt-2 text-sm ${test.ok ? 'text-ok' : 'text-danger'}`}>{test.text}</p>}
      <ErrorText error={error} />
    </div>
  );
}

/* ---------------------------------------------------------------- relance d'une livraison */

export function RetryDeliveryButton({ gameId, deliveryId }: { gameId: string; deliveryId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        className={`${btnGhost} px-2.5 py-1 text-xs`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await retryDeliveryAction(gameId, deliveryId);
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
      >
        {pending ? 'Envoi…' : 'Relancer'}
      </button>
      {error && <span className="mt-1 text-xs text-danger">{error}</span>}
    </span>
  );
}
