// Visuels de démonstration (SVG générés) — remplacez-les par vos propres images depuis l'éditeur.
const uri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const cardArt = (inner: string, label: string, labelColor = '#7CFF6B') => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c6f92"/><stop offset="1" stop-color="#c9ccd6"/></linearGradient>
  </defs>
  <rect x="4" y="4" width="192" height="212" rx="16" fill="url(#bg)" stroke="#1b1f2a" stroke-width="6"/>
  ${inner}
  <text x="100" y="48" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34" fill="${labelColor}" stroke="#0d2b0a" stroke-width="2.5" paint-order="stroke">${label}</text>
</svg>`;

const gem = (x: number, y: number, s = 1, c = '#2ee86a') => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <polygon points="0,-14 13,-4 8,13 -8,13 -13,-4" fill="${c}" stroke="#0a5a24" stroke-width="2"/>
    <polygon points="0,-14 6,-3 -6,-3" fill="#b9ffd0" opacity=".8"/>
  </g>`;

const bucket = `
  <path d="M52 120 L148 120 L136 196 L64 196 Z" fill="#a8652e" stroke="#4a2a10" stroke-width="4"/>
  <rect x="58" y="138" width="84" height="9" fill="#9aa3ad" stroke="#4a4f56" stroke-width="2"/>
  <rect x="62" y="172" width="76" height="9" fill="#9aa3ad" stroke="#4a4f56" stroke-width="2"/>
  <path d="M52 120 Q100 60 148 120" fill="none" stroke="#6b737c" stroke-width="5"/>`;

export const ART_GEM_POUCH = uri(
  cardArt(
    `${bucket}${gem(80, 112)}${gem(104, 102, 1.2)}${gem(126, 114)}${gem(92, 124, 0.9)}${gem(118, 126, 0.9)}${gem(60, 196, 0.8)}${gem(146, 192, 0.7)}`,
    '1 200',
  ),
);

export const ART_GEM_CHEST = uri(
  cardArt(
    `<rect x="40" y="120" width="120" height="76" rx="8" fill="#7a3f9c" stroke="#2c1240" stroke-width="4"/>
     <rect x="40" y="148" width="120" height="10" fill="#f2c94c" stroke="#7a5a10" stroke-width="2"/>
     <rect x="92" y="140" width="16" height="26" rx="3" fill="#f2c94c" stroke="#7a5a10" stroke-width="2"/>
     ${gem(62, 112)}${gem(84, 100, 1.2)}${gem(108, 96, 1.3)}${gem(132, 106, 1.1)}${gem(146, 118, 0.8)}${gem(74, 120, 0.8)}${gem(120, 118)}`,
    '6 500',
  ),
);

const coin = (x: number, y: number) => `
  <ellipse cx="${x}" cy="${y + 4}" rx="22" ry="8" fill="#b7860b"/>
  <ellipse cx="${x}" cy="${y}" rx="22" ry="8" fill="#ffd34d" stroke="#8a6200" stroke-width="2"/>`;
const stack = (x: number, base: number, n: number) =>
  Array.from({ length: n }, (_, i) => coin(x, base - i * 9)).join('');

export const ART_GOLD = uri(
  cardArt(`${stack(70, 196, 7)}${stack(130, 196, 9)}${stack(100, 200, 5)}`, '10 000', '#ffe26b'),
);

export const ART_PASS = uri(
  cardArt(
    `<path d="M50 180 L58 110 L80 140 L100 96 L120 140 L142 110 L150 180 Z" fill="#ffd34d" stroke="#8a6200" stroke-width="4"/>
     <circle cx="100" cy="150" r="10" fill="#e8384f" stroke="#7a0f1f" stroke-width="3"/>
     <circle cx="70" cy="160" r="6" fill="#2f80ed"/><circle cx="130" cy="160" r="6" fill="#2f80ed"/>`,
    'PASS',
    '#ffe26b',
  ),
);

export const ART_STARTER = uri(
  cardArt(
    `<rect x="50" y="112" width="100" height="84" rx="6" fill="#2f80ed" stroke="#0f2f63" stroke-width="4"/>
     <rect x="92" y="112" width="16" height="84" fill="#ffd34d" stroke="#8a6200" stroke-width="2"/>
     <rect x="50" y="146" width="100" height="14" fill="#ffd34d" stroke="#8a6200" stroke-width="2"/>
     <path d="M100 112 C80 88 66 104 100 112 C134 104 120 88 100 112 Z" fill="#ffd34d" stroke="#8a6200" stroke-width="3"/>`,
    'x3',
    '#ffffff',
  ),
);

export const ART_SEEDS = uri(
  cardArt(
    `<path d="M70 196 L60 120 L140 120 L130 196 Z" fill="#d9b47a" stroke="#6b4a1c" stroke-width="4"/>
     <path d="M100 118 L92 70 L108 70 Z" fill="#ff8a1f" stroke="#8a3d00" stroke-width="3"/>
     <path d="M100 74 l-12 -16 M100 74 l0 -20 M100 74 l12 -16" stroke="#2e9e3c" stroke-width="5" stroke-linecap="round"/>
     <circle cx="84" cy="160" r="5" fill="#6b4a1c"/><circle cx="108" cy="150" r="5" fill="#6b4a1c"/><circle cx="118" cy="174" r="5" fill="#6b4a1c"/>`,
    '50',
    '#ffffff',
  ),
);

export const BANNER_CRYSTAL = uri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".55" stop-color="#f5b82e"/><stop offset="1" stop-color="#b86b0a"/></linearGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#9aa6b8"/></linearGradient>
    <linearGradient id="shield" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f8de0"/><stop offset="1" stop-color="#173f8a"/></linearGradient>
  </defs>
  <g font-family="Arial Black, Arial, sans-serif" font-weight="900" text-anchor="middle" stroke="#2a1600" stroke-width="10" paint-order="stroke" stroke-linejoin="round">
    <text x="520" y="135" font-size="120" fill="url(#steel)">CRYSTAL</text>
    <text x="520" y="262" font-size="130" fill="url(#gold)">CLASH</text>
  </g>
  <g transform="translate(910 30)">
    <path d="M110 0 L220 40 L205 170 L110 240 L15 170 L0 40 Z" fill="url(#gold)" stroke="#2a1600" stroke-width="10" stroke-linejoin="round"/>
    <path d="M110 30 L190 58 L178 158 L110 208 L42 158 L30 58 Z" fill="url(#shield)"/>
    <polygon points="110,62 150,112 110,182 70,112" fill="#8ff0ff" stroke="#0b4f7a" stroke-width="6"/>
    <polygon points="110,62 130,112 110,112" fill="#ffffff" opacity=".7"/>
  </g>
</svg>`);

export const ICON_CRYSTAL = uri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <defs>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f80ed"/><stop offset="1" stop-color="#173f8a"/></linearGradient>
    <linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a5a"/><stop offset="1" stop-color="#a3121f"/></linearGradient>
  </defs>
  <rect width="300" height="300" fill="url(#l)"/>
  <polygon points="300,0 300,300 120,300" fill="url(#r)"/>
  <polygon points="150,40 225,140 150,260 75,140" fill="#8ff0ff" stroke="#0b2f4a" stroke-width="10" stroke-linejoin="round"/>
  <polygon points="150,40 185,140 150,140" fill="#ffffff" opacity=".75"/>
  <polygon points="75,140 150,140 150,260" fill="#3bb7d9" opacity=".6"/>
</svg>`);

export const BANNER_FARM = uri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff59d"/><stop offset="1" stop-color="#f9a825"/></linearGradient></defs>
  <g font-family="Arial Black, Arial, sans-serif" font-weight="900" text-anchor="middle" stroke="#2b3d0f" stroke-width="12" paint-order="stroke" stroke-linejoin="round">
    <text x="600" y="190" font-size="150" fill="url(#g)">PIXEL FARM</text>
  </g>
</svg>`);

export const ICON_FARM = uri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <rect width="300" height="300" fill="#7ed957"/>
  <rect y="210" width="300" height="90" fill="#5aa832"/>
  <path d="M70 220 L70 130 L150 70 L230 130 L230 220 Z" fill="#d93a2b" stroke="#5c120b" stroke-width="10" stroke-linejoin="round"/>
  <rect x="120" y="150" width="60" height="70" fill="#fff" stroke="#5c120b" stroke-width="8"/>
  <path d="M120 150 L180 220 M180 150 L120 220" stroke="#5c120b" stroke-width="6"/>
</svg>`);
