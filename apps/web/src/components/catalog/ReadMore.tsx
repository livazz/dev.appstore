'use client';

import { useId, useState } from 'react';
import { foldParagraphs } from './about-text';

/** Texte en paragraphes, replié au-delà des premiers paragraphes avec un bouton « Lire la suite ». */
export function ReadMore({ text }: { text: string }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const { visible, hidden } = foldParagraphs(text);
  return (
    <div className="mt-2 text-ink-2">
      {visible.map((p, i) => (
        <p key={i} className="mt-2 whitespace-pre-line first:mt-0">
          {p}
        </p>
      ))}
      {hidden.length > 0 && (
        <>
          <div id={id} hidden={!expanded}>
            {hidden.map((p, i) => (
              <p key={i} className="mt-2 whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-controls={id}
            className="mt-2 min-h-9 text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {expanded ? 'Réduire' : 'Lire la suite'}
          </button>
        </>
      )}
    </div>
  );
}
