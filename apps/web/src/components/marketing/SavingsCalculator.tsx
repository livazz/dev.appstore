'use client';

import { useId, useState } from 'react';
import { bpsToPercentLabel, estimateSavings, formatEurosRounded } from './savings';

/**
 * Calculateur interactif : revenu mensuel IAP × part basculée sur le web → gain annuel.
 * Les taux viennent de la page serveur (STORE_FEE_BPS, DEFAULT_PLATFORM_FEE_BPS de @wolleen/core).
 */
export function SavingsCalculator({ storeFeeBps, platformFeeBps }: { storeFeeBps: number; platformFeeBps: number }) {
  const id = useId();
  const [revenue, setRevenue] = useState('20000');
  const [share, setShare] = useState(30);

  const revenueEuros = Number(revenue.replace(/[\s  ]/g, '').replace(',', '.'));
  const valid = revenue.trim() !== '' && Number.isFinite(revenueEuros) && revenueEuros >= 0;
  const result = estimateSavings({
    monthlyRevenueCents: valid ? Math.round(revenueEuros * 100) : 0,
    webSharePct: share,
    storeFeeBps,
    platformFeeBps,
  });

  return (
    <div className="grid gap-6 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-8 md:grid-cols-2 md:gap-10">
      <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()} aria-label="Paramètres du calculateur">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-revenue`} className="font-semibold">
            Revenu mensuel des achats in-app
          </label>
          <div className="flex items-center rounded-[var(--radius)] border border-line bg-bg focus-within:outline-2 focus-within:outline-primary">
            <input
              id={`${id}-revenue`}
              inputMode="decimal"
              autoComplete="off"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              aria-invalid={!valid}
              aria-describedby={`${id}-revenue-hint`}
              className="w-full min-w-0 bg-transparent px-3 py-2.5 text-lg tabular-nums outline-none"
            />
            <span className="shrink-0 px-3 text-ink-2">€ / mois</span>
          </div>
          <p id={`${id}-revenue-hint`} className={`text-sm ${valid ? 'text-ink-3' : 'text-danger'}`}>
            {valid ? 'Chiffre brut, avant commission des stores.' : 'Saisissez un montant positif, par exemple 20000.'}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <label htmlFor={`${id}-share`} className="font-semibold">
              Part des ventes basculées sur le web
            </label>
            <output htmlFor={`${id}-share`} className="text-lg font-bold tabular-nums">
              {share} %
            </output>
          </div>
          <input
            id={`${id}-share`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={share}
            onChange={(e) => setShare(Number(e.target.value))}
            aria-valuetext={`${share} pour cent`}
            className="w-full accent-[var(--primary)]"
          />
          <div className="flex justify-between text-xs text-ink-3" aria-hidden="true">
            <span>0 %</span>
            <span>50 %</span>
            <span>100 %</span>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-ink-3">
          Hypothèses : commission des stores de {bpsToPercentLabel(storeFeeBps)} (taux standard ; certains programmes appliquent
          un taux réduit), commission Wolleen de {bpsToPercentLabel(platformFeeBps)}. Estimation indicative, hors taxes et
          hors frais de change éventuels.
        </p>
      </form>

      <section aria-label="Résultat de l'estimation" className="flex flex-col justify-center gap-5 rounded-xl bg-bg p-5 sm:p-6">
        <div aria-live="polite" aria-atomic="true">
          <p className="text-sm font-medium text-ink-2">Gain annuel estimé</p>
          <p className="mt-1 text-4xl font-black tracking-tight text-ok tabular-nums sm:text-5xl">
            {formatEurosRounded(result.annualGainCents)}
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
          <div className="rounded-lg bg-surface p-3">
            <dt className="text-ink-3">Ventes web / an</dt>
            <dd className="mt-1 font-semibold tabular-nums">{formatEurosRounded(result.annualWebCents)}</dd>
          </div>
          <div className="rounded-lg bg-surface p-3">
            <dt className="text-ink-3">Commission stores évitée</dt>
            <dd className="mt-1 font-semibold tabular-nums">{formatEurosRounded(result.annualStoreFeeCents)}</dd>
          </div>
          <div className="rounded-lg bg-surface p-3">
            <dt className="text-ink-3">Commission Wolleen</dt>
            <dd className="mt-1 font-semibold tabular-nums">{formatEurosRounded(result.annualPlatformFeeCents)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
