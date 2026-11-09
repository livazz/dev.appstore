import { useId } from 'react';

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="ctrl-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={'toggle' + (checked ? ' on' : '')}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
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
    <div className="ctrl-row">
      <label htmlFor={id}>{label}</label>
      <div className="color-field">
        {allowNone && (
          <button
            type="button"
            className={'chip-none' + (none ? ' active' : '')}
            title="Aucune couleur"
            onClick={() => onChange(none ? '#888888' : 'transparent')}
          >
            Aucun
          </button>
        )}
        <span className={'swatch' + (none ? ' none' : '')} style={{ background: none ? undefined : value }}>
          <input id={id} type="color" value={none ? '#888888' : value} onChange={(e) => onChange(e.target.value)} />
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
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}</label>
      <div className="slider-wrap">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ['--pct' as string]: `${pct}%` }}
        />
        <span className="slider-bubble" style={{ left: `calc(${pct}% + ${(50 - pct) * 0.22}px)` }}>
          {value}
          {unit}
        </span>
      </div>
    </div>
  );
}
