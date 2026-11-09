'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteStoreCredentialsAction, saveStoreCredentialsAction } from '@/server/import-actions';
import type { CredentialStatus, CredentialSummary } from '@/server/import-logic';
import { btnCancel, btnGhost, btnPrimary, card, input, label } from './ui';

type Source = keyof CredentialStatus;

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Identifiants App Store Connect et Google Play : saisie, remplacement, suppression. Jamais relus depuis le serveur. */
export function CredentialsPanel({ gameId, initial }: { gameId: string; initial: CredentialStatus }) {
  const [status, setStatus] = useState(initial);
  return (
    <section className={card}>
      <h2 className="text-base font-semibold text-ink">Identifiants des stores</h2>
      <p className="mt-1 text-sm text-ink-2">
        Chiffrés au repos (AES-256-GCM) et jamais renvoyés au navigateur. Accès en lecture seule suffisant. Renseignez un store, ou les deux.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <StoreCard gameId={gameId} source="app_store" summary={status.app_store} onChange={setStatus} />
        <StoreCard gameId={gameId} source="google_play" summary={status.google_play} onChange={setStatus} />
      </div>
    </section>
  );
}

function StoreCard({
  gameId,
  source,
  summary,
  onChange,
}: {
  gameId: string;
  source: Source;
  summary: CredentialSummary | null;
  onChange: (s: CredentialStatus) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const title = source === 'app_store' ? 'App Store Connect' : 'Google Play';

  const save = (data: Record<string, string>) => {
    setError('');
    startTransition(async () => {
      const r = await saveStoreCredentialsAction(gameId, source, data);
      if (!r.ok) return setError(r.error);
      onChange(r.data);
      setEditing(false);
      router.refresh();
    });
  };
  const remove = () => {
    if (!confirm(`Supprimer les identifiants ${title} de ce jeu ?`)) return;
    setError('');
    startTransition(async () => {
      const r = await deleteStoreCredentialsAction(gameId, source);
      if (!r.ok) return setError(r.error);
      onChange(r.data);
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">{title}</h3>
        {summary ? (
          <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-medium text-ok">Enregistré</span>
        ) : (
          <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-ink-3">Non configuré</span>
        )}
      </div>

      {summary && !editing ? (
        <div className="mt-3 space-y-3 text-sm">
          <p className="font-mono text-[13px] break-all text-ink">{summary.hint}</p>
          <p className="text-xs text-ink-3">Mis à jour le {dateFmt.format(new Date(summary.updatedAt))}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnGhost} onClick={() => setEditing(true)} disabled={pending}>
              Remplacer
            </button>
            <button type="button" className={`${btnGhost} text-danger`} onClick={remove} disabled={pending}>
              Supprimer
            </button>
          </div>
        </div>
      ) : source === 'app_store' ? (
        <AppStoreForm pending={pending} onSubmit={save} onCancel={summary ? () => setEditing(false) : undefined} />
      ) : (
        <GooglePlayForm pending={pending} onSubmit={save} onCancel={summary ? () => setEditing(false) : undefined} />
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Bouton « Choisir un fichier » qui remplit un champ texte avec le contenu du fichier (lu localement). */
function FilePick({ accept, onText, children }: { accept: string; onText: (s: string) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onText(await f.text());
          e.target.value = '';
        }}
      />
      <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => ref.current?.click()}>
        {children}
      </button>
    </>
  );
}

function FormActions({ pending, onCancel }: { pending: boolean; onCancel?: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <button type="submit" className={btnPrimary} disabled={pending}>
        {pending ? 'Vérification…' : 'Enregistrer'}
      </button>
      {onCancel && (
        <button type="button" className={btnCancel} onClick={onCancel} disabled={pending}>
          Annuler
        </button>
      )}
    </div>
  );
}

function AppStoreForm({ pending, onSubmit, onCancel }: { pending: boolean; onSubmit: (d: Record<string, string>) => void; onCancel?: () => void }) {
  const [v, setV] = useState({ issuerId: '', keyId: '', privateKey: '', appId: '' });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="asc-issuer">Issuer ID</label>
          <input id="asc-issuer" className={`${input} font-mono`} value={v.issuerId} onChange={set('issuerId')} placeholder="57246542-96fe-1a63-e053-0824d011072a" required autoComplete="off" />
        </div>
        <div>
          <label className={label} htmlFor="asc-key">Key ID</label>
          <input id="asc-key" className={`${input} font-mono`} value={v.keyId} onChange={(e) => setV({ ...v, keyId: e.target.value.toUpperCase() })} placeholder="2X9R4HXF34" required autoComplete="off" />
        </div>
        <div>
          <label className={label} htmlFor="asc-app">Apple ID de l&apos;app</label>
          <input id="asc-app" className={`${input} font-mono`} value={v.appId} onChange={set('appId')} placeholder="1561234567" inputMode="numeric" required autoComplete="off" />
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className={label.replace('mb-1 ', '')} htmlFor="asc-p8">Clé privée (.p8)</label>
          <FilePick accept=".p8,.pem,text/plain" onText={(s) => setV((x) => ({ ...x, privateKey: s }))}>Choisir le fichier .p8</FilePick>
        </div>
        <textarea id="asc-p8" className={`${input} h-24 resize-y font-mono text-xs`} value={v.privateKey} onChange={set('privateKey')} placeholder={'-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49…\n-----END PRIVATE KEY-----'} required spellCheck={false} />
      </div>
      <details className="text-xs text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">Où trouver ces informations ?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>App Store Connect → Utilisateurs et accès → Intégrations → App Store Connect API → Clés d&apos;équipe → « + ».</li>
          <li>Rôle <strong>App Manager</strong> (évitez Admin). Téléchargez <code>AuthKey_&lt;KEY_ID&gt;.p8</code> : une seule fois possible.</li>
          <li>Key ID : colonne de la clé. Issuer ID : en haut de la page (bouton « Copier »).</li>
          <li>Apple ID : Apps → votre app → Informations sur l&apos;app → Apple ID (nombre, pas le bundle id).</li>
        </ol>
      </details>
      <FormActions pending={pending} onCancel={onCancel} />
    </form>
  );
}

function GooglePlayForm({ pending, onSubmit, onCancel }: { pending: boolean; onSubmit: (d: Record<string, string>) => void; onCancel?: () => void }) {
  const [v, setV] = useState({ packageName: '', serviceAccount: '' });
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <div>
        <label className={label} htmlFor="gp-pkg">Nom de package</label>
        <input id="gp-pkg" className={`${input} font-mono`} value={v.packageName} onChange={(e) => setV({ ...v, packageName: e.target.value })} placeholder="com.studio.jeu" required autoComplete="off" />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className={label.replace('mb-1 ', '')} htmlFor="gp-sa">JSON du compte de service</label>
          <FilePick accept=".json,application/json" onText={(s) => setV((x) => ({ ...x, serviceAccount: s }))}>Choisir le fichier .json</FilePick>
        </div>
        <textarea id="gp-sa" className={`${input} h-24 resize-y font-mono text-xs`} value={v.serviceAccount} onChange={(e) => setV({ ...v, serviceAccount: e.target.value })} placeholder={'{ "type": "service_account", "client_email": "…", "private_key": "…" }'} required spellCheck={false} />
      </div>
      <details className="text-xs text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">Où trouver ces informations ?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Google Cloud Console : activez « Google Play Android Developer API », puis IAM → Comptes de service → Créer.</li>
          <li>Compte de service → Clés → Ajouter une clé → JSON : le fichier est téléchargé.</li>
          <li>Play Console → Utilisateurs et autorisations → invitez l&apos;e-mail du compte de service sur l&apos;app (« Voir les informations sur l&apos;application »).</li>
          <li>Les nouvelles permissions peuvent mettre jusqu&apos;à 24 h à s&apos;appliquer.</li>
        </ol>
      </details>
      <FormActions pending={pending} onCancel={onCancel} />
    </form>
  );
}
