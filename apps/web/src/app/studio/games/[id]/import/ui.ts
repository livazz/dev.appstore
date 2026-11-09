/** Classes partagées par les composants de la page d'import (mêmes boutons que l'onglet Intégration). */
export const btn =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50';
export const btnPrimary = `${btn} bg-primary text-white hover:brightness-95`;
export const btnCancel = `${btn} bg-cancel text-white hover:brightness-95`;
export const btnGhost = `${btn} border border-line bg-surface text-ink hover:bg-bg`;
export const input =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-primary focus:ring-2 focus:ring-primary/20';
export const label = 'mb-1 block text-xs font-medium text-ink-2';
export const card = 'rounded-[var(--radius)] border border-line bg-surface p-5';
