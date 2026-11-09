import { CopyButton } from './CopyButton';

/**
 * Bloc de code (composant serveur) : en-tête avec langage/titre et bouton copier.
 * Le défilement horizontal reste interne au bloc (pas de scroll de page à 390 px).
 */
export function CodeBlock({ code, lang, title }: { code: string; lang?: string; title?: string }) {
  const caption = title ?? lang;
  return (
    <figure className="my-5 min-w-0 overflow-hidden rounded-[var(--radius)] bg-[#17171a] text-white shadow-sm">
      <figcaption className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="truncate font-mono text-xs text-white/60">{caption ?? 'code'}</span>
        <CopyButton text={code} label={caption ? `Copier le code (${caption})` : 'Copier le code'} />
      </figcaption>
      <pre tabIndex={0} className="overflow-x-auto p-4 text-[13px] leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
        <code className="font-mono">{code}</code>
      </pre>
    </figure>
  );
}
