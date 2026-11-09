'use client';

import { useEffect, useId, useRef, useState, useTransition, type DragEvent } from 'react';
import type { Currency } from '@wolleen/core/client';
import { ItemCard, type CardItem } from '@/components/store/ItemCard';
import { generateStyleFromScreenshot } from '@/server/ai-style-action';
import { AI_STYLE_ACCEPTED_TYPES, AI_STYLE_MAX_UPLOAD_BYTES, type AiStyleResult } from '@/lib/ai-style-types';
import { shrinkForUpload } from './shrink-image';

/*
 * « Générer depuis une capture du jeu » : dépôt d'une capture de la carte telle qu'affichée dans le
 * jeu → génération { layout, style, title?, subtitle? } par IA → aperçu avec la carte partagée
 * (ItemCard) → Appliquer (onApply) ou Annuler. Rien n'est modifié tant que l'utilisateur n'applique pas.
 */

const PREVIEW_GRID = { width: 150, height: 200 };

/** Article d'exemple utilisé pour l'aperçu quand l'éditeur ne fournit pas son brouillon. */
const SAMPLE: Omit<CardItem, 'layout' | 'style'> = {
  title: 'Titre',
  subtitle: '',
  type: 'consumable',
  period: 'month',
  priceCents: 499,
  oldPriceCents: null,
  models: [{ label: '' }],
};

type Phase = 'closed' | 'idle' | 'loading' | 'result';

export function AiStyleButton({
  gameId,
  onApply,
  currency = 'EUR',
  preview,
}: {
  gameId: string;
  onApply: (result: AiStyleResult) => void;
  /** Devise de l'aperçu (défaut EUR). */
  currency?: Currency;
  /** Brouillon de l'article (prix, image…) pour un aperçu fidèle ; layout et style viennent de l'IA. */
  preview?: Omit<CardItem, 'layout' | 'style'>;
}) {
  const [phase, setPhase] = useState<Phase>('closed');
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiStyleResult | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const panelId = useId();

  // Libère l'URL d'aperçu de la capture.
  useEffect(() => () => void (shotUrl && URL.revokeObjectURL(shotUrl)), [shotUrl]);

  const reset = (next: Phase) => {
    requestRef.current++; // ignore une réponse en vol
    setPhase(next);
    setError('');
    setResult(null);
    setShotUrl(null);
    setDragOver(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setError('');
    if (!(AI_STYLE_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
      setError('Format non pris en charge : utilisez une capture PNG, JPEG ou WebP.');
      return;
    }
    if (file.size > AI_STYLE_MAX_UPLOAD_BYTES * 4) {
      setError("Image trop lourde : recadrez la capture sur l'article.");
      return;
    }
    const req = ++requestRef.current;
    setResult(null);
    setShotUrl(URL.createObjectURL(file));
    setPhase('loading');
    try {
      const blob = await shrinkForUpload(file);
      const fd = new FormData();
      fd.set('image', blob, file.name);
      const r = await generateStyleFromScreenshot(gameId, fd);
      if (req !== requestRef.current) return;
      if (r.ok) {
        setResult(r.data);
        setPhase('result');
      } else {
        setError(r.error);
        setPhase('idle');
      }
    } catch {
      if (req !== requestRef.current) return;
      setError("La génération a échoué (réseau ou image trop lourde). Réessayez avec une capture recadrée.");
      setPhase('idle');
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (phase === 'loading') return;
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const apply = () => {
    if (!result) return;
    const r = result;
    startTransition(() => onApply(r));
    reset('closed');
  };

  if (phase === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setPhase('idle')}
        aria-expanded={false}
        aria-controls={panelId}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink hover:border-primary hover:text-primary"
      >
        <SparkIcon />
        Générer depuis une capture du jeu
      </button>
    );
  }

  const base = preview ?? SAMPLE;
  const previewItem: CardItem | null = result
    ? {
        ...base,
        title: base.title.trim() || result.title || 'Titre',
        subtitle: base.subtitle.trim() || result.subtitle || '',
        layout: result.layout,
        style: result.style,
      }
    : null;

  return (
    <section
      id={panelId}
      aria-label="Générer le style depuis une capture du jeu"
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4"
      onPaste={(e) => {
        const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith('image/'));
        if (f && phase !== 'loading') void handleFile(f);
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <SparkIcon /> Générer depuis une capture du jeu
          </h3>
          <p className="mt-1 text-xs text-ink-3">
            Déposez une capture de l&apos;article tel qu&apos;il apparaît dans le jeu : l&apos;IA propose une mise en page et des couleurs.
            Recadrez sur la carte pour un meilleur résultat. La capture est transmise à Anthropic pour analyse.
          </p>
        </div>
      </div>

      {phase !== 'result' && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-line hover:border-primary/60'
          } ${phase === 'loading' ? 'pointer-events-none opacity-80' : ''}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={AI_STYLE_ACCEPTED_TYPES.join(',')}
            className="sr-only"
            disabled={phase === 'loading'}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          {phase === 'loading' ? (
            <>
              {shotUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shotUrl} alt="Capture envoyée" className="max-h-28 rounded-md object-contain" />
              )}
              <span role="status" className="flex items-center gap-2 font-medium text-ink-2">
                <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
                Analyse de la capture… (10 à 30 s)
              </span>
            </>
          ) : (
            <>
              <span className="font-medium text-ink-2">Glissez une capture ici, collez-la, ou cliquez pour choisir</span>
              <span className="text-xs text-ink-3">PNG, JPEG ou WebP</span>
            </>
          )}
        </label>
      )}

      {phase === 'result' && result && previewItem && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-center gap-6 rounded-lg bg-bg p-4">
            {shotUrl && (
              <figure className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shotUrl} alt="Capture du jeu" className="max-h-52 max-w-56 rounded-md object-contain shadow" />
                <figcaption className="text-xs text-ink-3">Dans le jeu</figcaption>
              </figure>
            )}
            <span aria-hidden="true" className="text-xl text-ink-3">→</span>
            <figure className="flex flex-col items-center gap-1">
              <ItemCard item={previewItem} grid={PREVIEW_GRID} currency={currency} />
              <figcaption className="text-xs text-ink-3">Sur le web · mise en page {result.layout}</figcaption>
            </figure>
          </div>

          {(result.title || result.subtitle) && (
            <p className="text-xs text-ink-2">
              Texte lu sur la capture :{' '}
              {[result.title, result.subtitle].filter(Boolean).map((t, i) => (
                <span key={i} className="mr-1 rounded bg-bg px-1.5 py-0.5 font-medium">
                  {t}
                </span>
              ))}
            </p>
          )}

          {result.warnings.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-lg bg-warn/10 px-3 py-2 text-xs text-ink-2">
              {result.warnings.map((w, i) => (
                <li key={`${w.code}-${w.field}-${i}`}>• {w.message}</li>
              ))}
            </ul>
          )}

          <p className="text-xs text-ink-3">
            {result.remaining} génération{result.remaining > 1 ? 's' : ''} restante{result.remaining > 1 ? 's' : ''} aujourd&apos;hui pour votre studio.
            Les réglages restent modifiables après application.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {phase === 'result' && (
          <button type="button" onClick={() => reset('idle')} className="mr-auto text-sm font-medium text-ink-2 hover:text-primary">
            Autre capture
          </button>
        )}
        <button type="button" onClick={() => reset('closed')} className="rounded-lg bg-cancel px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          Annuler
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={phase !== 'result'}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Appliquer
        </button>
      </div>
    </section>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 flex-none" fill="currentColor" aria-hidden="true">
      <path d="M10 1.5l1.9 4.6 4.6 1.9-4.6 1.9L10 14.5l-1.9-4.6L3.5 8l4.6-1.9L10 1.5zM15.5 13l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
    </svg>
  );
}
