'use client';

import { useId } from 'react';

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 flex-none rounded-full transition-colors before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${checked ? 'bg-ok' : 'bg-ink-3'}`}
      >
        <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
}) {
  const id = useId();
  const none = value === 'transparent';
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <label htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        {allowNone && (
          <button
            type="button"
            title="Aucune couleur"
            aria-pressed={none}
            onClick={() => onChange(none ? '#888888' : 'transparent')}
            className={`min-h-9 rounded-md border px-2.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${none ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2'}`}
          >
            Aucun
          </button>
        )}
        <span
          className="relative block size-9 overflow-hidden rounded-md border border-line has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-primary"
          style={
            none
              ? { background: 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 10px 10px' }
              : { background: value }
          }
        >
          <input
            id={id}
            type="color"
            value={none ? '#888888' : value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
      </div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  onChange,
  unit = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col py-0.5 text-sm">
      {/* Libellé et valeur sur une ligne, curseur dessous (maquette : « Height ——o— 250 »). */}
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <output htmlFor={id} className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white tabular-nums">
          {value}
          {unit}
        </output>
      </div>
      <div>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-9 w-full cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </div>
    </div>
  );
}
