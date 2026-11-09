'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { GAME_CATEGORIES, type Currency } from '@devappstore/core';
import { createGame } from '@/server/studio';
import { IconCopy } from './icons';

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'EUR', label: 'Euro (€)' },
  { value: 'USD', label: 'Dollar US ($)' },
  { value: 'GBP', label: 'Livre sterling (£)' },
];

function SecretRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-ink-2">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg bg-bg px-3 py-2 font-mono text-sm whitespace-nowrap">{value}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(value).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm hover:bg-bg"
        >
          <IconCopy size={14} /> {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <span className="text-xs text-ink-3">{hint}</span>
    </div>
  );
}

export function NewGameForm({ studioName }: { studioName: string }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('');
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: string; apiKey: string; webhookSecret: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (created)
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-semibold">« {name.trim()} » est créé</h2>
          <p className="mt-1 text-sm text-ink-2">
            Voici la clé API de votre jeu. <strong className="text-ink">Elle ne sera plus jamais affichée</strong> : copiez-la maintenant et
            gardez-la côté serveur (variables d&apos;environnement). Vous pourrez en générer une nouvelle depuis l&apos;onglet Intégration.
          </p>
        </div>
        <SecretRow label="Clé API" value={created.apiKey} hint="En-tête Authorization: Bearer … pour l'API /api/v1 et le SDK." />
        <SecretRow label="Secret de signature webhook" value={created.webhookSecret} hint="Sert à vérifier l'en-tête DevAppStore-Signature (aussi visible dans Intégration)." />
        <div className="flex justify-end gap-3">
          <Link href={`/studio/games/${created.id}/integration`} className="rounded-lg border border-line px-5 py-2 text-sm font-semibold hover:bg-bg">
            Configurer l&apos;intégration
          </Link>
          <Link href={`/studio/games/${created.id}`} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:opacity-90">
            Continuer vers la boutique
          </Link>
        </div>
      </div>
    );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        if (!name.trim()) return setError('Le nom du jeu est obligatoire.');
        if (!category) return setError('Choisissez une catégorie.');
        startTransition(async () => {
          const r = await createGame({ name, category: category as (typeof GAME_CATEGORIES)[number], currency });
          if (!r.ok) setError(r.error);
          else setCreated(r.data);
        });
      }}
    >
      <p className="mb-1 text-sm text-ink-2">
        Le jeu est créé en brouillon dans le studio <strong className="text-ink">{studioName}</strong>. Vous configurerez ensuite sa boutique,
        puis la publierez.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink-2">Nom du jeu</span>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Crystal Clash" maxLength={60} autoFocus required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink-2">Catégorie</span>
        <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} required>
          <option value="" disabled>
            Choisir…
          </option>
          {GAME_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink-2">Devise de la boutique</span>
        <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
          {CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-2 flex justify-end gap-3">
        <Link href="/studio" className="rounded-lg bg-cancel px-5 py-2 text-sm font-semibold text-white hover:opacity-90">
          Annuler
        </Link>
        <button type="submit" disabled={pending} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {pending ? 'Création…' : 'Créer le jeu'}
        </button>
      </div>
    </form>
  );
}
