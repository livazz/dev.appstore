'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  regenerateApiKey,
  regenerateWebhookSecret,
  retryDeliveryAction,
  revealWebhookSecret,
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

/* ---------------------------------------------------------------- clé API */

export function ApiKeyControl({ gameId, prefix, canEdit }: { gameId: string; prefix: string; canEdit: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [currentPrefix, setCurrentPrefix] = useState(prefix);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const regenerate = () =>
    start(async () => {
      setError(null);
      const r = await regenerateApiKey(gameId);
      setConfirming(false);
      if (!r.ok) return setError(r.error);
      setNewKey(r.apiKey);
      setCurrentPrefix(r.prefix);
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
          <p className="text-ink">L&apos;ancienne clé cessera de fonctionner immédiatement : votre jeu et votre serveur devront utiliser la nouvelle.</p>
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
      {newKey && (
        <div className="mt-3 rounded-lg border border-ok/40 bg-ok/5 p-3 text-sm">
          <p className="font-medium text-ink">Nouvelle clé API — copiez-la maintenant, elle ne sera plus affichée.</p>
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

export function WebhookSecretControl({ gameId, canEdit }: { gameId: string; canEdit: boolean }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
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
      const r = await regenerateWebhookSecret(gameId);
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
        {canEdit && !confirming && (
          <button type="button" className={btnGhost} onClick={() => setConfirming(true)} disabled={pending}>
            Régénérer
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm">
          <p className="text-ink">Les signatures seront calculées avec le nouveau secret dès maintenant. Mettez à jour votre serveur.</p>
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

export function WebhookUrlControl({ gameId, initialUrl, canEdit }: { gameId: string; initialUrl: string | null; canEdit: boolean }) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [saved, setSaved] = useState(initialUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = url.trim() !== saved;

  const save = () =>
    start(async () => {
      setError(null);
      setTest(null);
      const r = await updateWebhookUrl(gameId, url);
      if (!r.ok) return setError(r.error);
      setSaved(r.webhookUrl ?? '');
      setUrl(r.webhookUrl ?? '');
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
          disabled={!canEdit}
          placeholder="https://api.monjeu.com/wolleen/webhook"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        {canEdit && dirty && (
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
        Laissez vide si votre jeu reçoit les achats uniquement via le SDK. Les réponses 2xx valent livraison ; sinon Wolleen réessaie
        (10 s, 1 min, 5 min, 30 min, 2 h, 6 h, 24 h).
      </p>
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
