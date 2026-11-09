import type { ReactNode } from 'react';

export interface FaqEntry {
  question: string;
  answer: ReactNode;
}

/** FAQ accessible sans JavaScript (éléments natifs details / summary). */
export function Faq({ entries }: { entries: FaqEntry[] }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {entries.map((e) => (
        <details key={e.question} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            <span>{e.question}</span>
            <span aria-hidden="true" className="text-xl leading-none text-ink-3 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="space-y-2 px-5 pb-5 text-ink-2">{e.answer}</div>
        </details>
      ))}
    </div>
  );
}
