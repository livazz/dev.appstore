import { useState } from 'react';
import type { BannerGradient } from '../types';
import { IconClose } from './Icons';

export function panelBackground(g: BannerGradient) {
  if (!g.enabled) return '#ffffff';
  return g.style === 'linear'
    ? `linear-gradient(180deg, ${g.c1} 0%, ${g.c2} 100%)`
    : `radial-gradient(ellipse at 50% 0%, ${g.c1} 0%, ${g.c2} 75%)`;
}

export function GradientPicker({ value, onChange, onClose }: { value: BannerGradient; onChange: (g: BannerGradient) => void; onClose: () => void }) {
  const [active, setActive] = useState<'c1' | 'c2'>('c1');
  const [hex, setHex] = useState(value[active].replace('#', ''));
  const color = value[active];

  const setColor = (c: string) => {
    onChange({ ...value, [active]: c, enabled: true });
    setHex(c.replace('#', ''));
  };

  return (
    <div className="gradient-pop" role="dialog" aria-label="Dégradé de fond">
      <button className="pop-x" onClick={onClose} aria-label="Fermer">
        <IconClose size={18} />
      </button>
      <div className="gp-main">
        <div className="gp-picker">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Choisir la couleur" />
          <div className="gp-hex">
            <input
              value={hex}
              maxLength={6}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9a-f]/gi, '');
                setHex(v);
                if (v.length === 6) onChange({ ...value, [active]: '#' + v.toLowerCase(), enabled: true });
              }}
              aria-label="Code hexadécimal"
            />
            <span>HEX</span>
          </div>
        </div>
        <div className="gp-opts">
          <div>
            <h4>Couleurs</h4>
            <div className="gp-btns">
              {(['c1', 'c2'] as const).map((k) => (
                <button
                  key={k}
                  className={'gp-swatch' + (active === k ? ' active' : '')}
                  style={{ background: value[k] }}
                  onClick={() => {
                    setActive(k);
                    setHex(value[k].replace('#', ''));
                  }}
                  aria-label={k === 'c1' ? 'Couleur du haut' : 'Couleur du bas'}
                />
              ))}
            </div>
          </div>
          <div>
            <h4>Style</h4>
            <div className="gp-btns">
              <button className={'gp-btn' + (value.style === 'linear' ? ' active' : '')} onClick={() => onChange({ ...value, style: 'linear' })}>Linéaire</button>
              <button className={'gp-btn' + (value.style === 'radial' ? ' active' : '')} onClick={() => onChange({ ...value, style: 'radial' })}>Radial</button>
            </div>
          </div>
          <div>
            <h4>Aperçu</h4>
            <div className="gp-btns">
              <button className={'gp-btn' + (value.enabled ? ' active' : '')} onClick={() => onChange({ ...value, enabled: true })}>Activé</button>
              <button className={'gp-btn' + (!value.enabled ? ' active' : '')} onClick={() => onChange({ ...value, enabled: false })}>Désactivé</button>
            </div>
          </div>
        </div>
      </div>
      <div className="gp-preview" style={{ background: panelBackground({ ...value, enabled: true }) }} />
    </div>
  );
}
