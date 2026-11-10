// Visuels de démonstration (SVG générés, sans cadre ni texte : la boutique affiche titre, quantité et prix).
// Remplacez-les par vos propres images depuis l'éditeur (liste des visuels conseillés : docs/design/illustrations.md).
const uri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const DEFS = `<defs>
<linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6ffc9"/><stop offset=".5" stop-color="#2ee07a"/><stop offset="1" stop-color="#0b9b4c"/></linearGradient>
<linearGradient id="gW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98a4b"/><stop offset="1" stop-color="#7a4a1f"/></linearGradient>
<linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b67cff"/><stop offset="1" stop-color="#5a1fb8"/></linearGradient>
<linearGradient id="gGo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffcf3f"/><stop offset="1" stop-color="#d98a00"/></linearGradient>
<linearGradient id="gGoS" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d98a00"/><stop offset=".5" stop-color="#ffd84d"/><stop offset="1" stop-color="#c27400"/></linearGradient>
<linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8fb0"/><stop offset="1" stop-color="#d6336c"/></linearGradient>
<linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4ff"/><stop offset="1" stop-color="#2f6fe0"/></linearGradient>
<linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1d6"/><stop offset="1" stop-color="#e8c48f"/></linearGradient>
<linearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6f07a"/><stop offset="1" stop-color="#3fa82a"/></linearGradient>
<g id="gem"><path d="M0-18 L16-6 L10 16 L-10 16 L-16-6 Z" fill="url(#gG)" stroke="#06582b" stroke-width="2" stroke-linejoin="round"/><path d="M0-18 L6-6 L0 16 L-6-6 Z" fill="#d8ffe4" opacity=".55"/><path d="M-16-6 L16-6" stroke="#06582b" stroke-width="1.5" opacity=".6"/><path d="M-11-11 L-6-14" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".9"/></g>
<g id="coin"><ellipse cx="0" cy="4" rx="22" ry="8" fill="#b36b00"/><rect x="-22" y="-2" width="44" height="6" fill="url(#gGoS)"/><ellipse cx="0" cy="-2" rx="22" ry="8" fill="url(#gGo)" stroke="#a35f00" stroke-width="1.5"/><ellipse cx="0" cy="-2" rx="13" ry="4.5" fill="none" stroke="#c27400" stroke-width="1.5" opacity=".7"/></g>
</defs>`;

const art = (inner: string) => uri(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 180">${DEFS}${inner}</svg>`);
const use = (id: string, t: string) => `<use href="#${id}" xlink:href="#${id}" transform="${t}"/>`;
const coins = (x: number, from: number, n: number) => Array.from({ length: n }, (_, i) => use('coin', `translate(${x} ${from - i * 10})`)).join('');

export const ART_GEM_POUCH = art(`
<ellipse cx="100" cy="166" rx="66" ry="9" fill="#000" opacity=".18"/>
<path d="M52 78 Q48 150 70 160 L130 160 Q152 150 148 78 Z" fill="url(#gW)" stroke="#4a2a0c" stroke-width="4" stroke-linejoin="round"/>
<path d="M58 104 Q100 112 142 104" stroke="#4a2a0c" stroke-width="3" fill="none" opacity=".45"/>
<path d="M62 132 Q100 140 138 132" stroke="#4a2a0c" stroke-width="3" fill="none" opacity=".45"/>
<path d="M66 86 Q66 140 76 150" stroke="#fff" stroke-width="5" fill="none" opacity=".25" stroke-linecap="round"/>
${use('gem', 'translate(70 72) rotate(-14) scale(1.15)')}${use('gem', 'translate(130 70) rotate(16) scale(1.15)')}${use('gem', 'translate(100 56) scale(1.5)')}${use('gem', 'translate(84 86) rotate(-6) scale(1.05)')}${use('gem', 'translate(118 88) rotate(8) scale(1.05)')}
<ellipse cx="100" cy="80" rx="50" ry="10" fill="#4a2a0c" opacity=".35"/>`);

export const ART_GEM_CHEST = art(`
<ellipse cx="100" cy="168" rx="78" ry="9" fill="#000" opacity=".2"/>
${use('gem', 'translate(62 66) rotate(-18) scale(1.2)')}${use('gem', 'translate(140 62) rotate(20) scale(1.25)')}${use('gem', 'translate(100 44) scale(1.6)')}${use('gem', 'translate(80 72) scale(1.15)')}${use('gem', 'translate(122 74) rotate(10) scale(1.15)')}
<path d="M30 86 L170 86 L164 160 L36 160 Z" fill="url(#gP)" stroke="#2c0b63" stroke-width="4" stroke-linejoin="round"/>
<rect x="28" y="80" width="144" height="18" rx="5" fill="url(#gGo)" stroke="#7a4600" stroke-width="3.5"/>
<rect x="44" y="98" width="14" height="62" fill="url(#gGo)" stroke="#7a4600" stroke-width="3"/>
<rect x="142" y="98" width="14" height="62" fill="url(#gGo)" stroke="#7a4600" stroke-width="3"/>
<rect x="88" y="94" width="24" height="30" rx="5" fill="url(#gGo)" stroke="#7a4600" stroke-width="3.5"/>
<circle cx="100" cy="106" r="4" fill="#7a4600"/>
<path d="M70 110 L70 150" stroke="#fff" stroke-width="5" opacity=".18" stroke-linecap="round"/>`);

export const ART_GOLD = art(`
<ellipse cx="100" cy="166" rx="74" ry="10" fill="#000" opacity=".18"/>
${coins(66, 150, 5)}${coins(134, 150, 7)}${coins(100, 156, 9)}
<g transform="translate(150 52) rotate(-20)"><ellipse rx="20" ry="20" fill="url(#gGo)" stroke="#a35f00" stroke-width="2.5"/><circle r="12" fill="none" stroke="#c27400" stroke-width="2"/><path d="M-4-6 h8 M-4 0 h8 M-4 6 h8" stroke="#a35f00" stroke-width="2.5" stroke-linecap="round"/></g>`);

export const ART_PASS = art(`
<ellipse cx="100" cy="160" rx="66" ry="9" fill="#000" opacity=".2"/>
<path d="M40 140 L32 62 L70 96 L100 44 L130 96 L168 62 L160 140 Z" fill="url(#gGo)" stroke="#7a4600" stroke-width="5" stroke-linejoin="round"/>
<rect x="38" y="132" width="124" height="20" rx="6" fill="url(#gGoS)" stroke="#7a4600" stroke-width="4"/>
<circle cx="100" cy="112" r="13" fill="url(#gR)" stroke="#7a0f37" stroke-width="3.5"/>
<circle cx="66" cy="120" r="8" fill="url(#gB)" stroke="#1d3f8a" stroke-width="3"/>
<circle cx="134" cy="120" r="8" fill="url(#gB)" stroke="#1d3f8a" stroke-width="3"/>
<circle cx="32" cy="60" r="8" fill="url(#gGo)" stroke="#7a4600" stroke-width="3.5"/>
<circle cx="100" cy="42" r="9" fill="url(#gGo)" stroke="#7a4600" stroke-width="3.5"/>
<circle cx="168" cy="60" r="8" fill="url(#gGo)" stroke="#7a4600" stroke-width="3.5"/>
<path d="M58 104 L54 130" stroke="#fff" stroke-width="5" opacity=".45" stroke-linecap="round"/>
<circle cx="96" cy="108" r="4" fill="#fff" opacity=".7"/>`);

export const ART_STARTER = art(`
<ellipse cx="100" cy="166" rx="70" ry="9" fill="#000" opacity=".2"/>
<rect x="42" y="82" width="116" height="78" rx="8" fill="url(#gB)" stroke="#123a85" stroke-width="4.5"/>
<rect x="34" y="66" width="132" height="26" rx="7" fill="#5aa8ff" stroke="#123a85" stroke-width="4.5"/>
<rect x="90" y="66" width="20" height="94" fill="url(#gGo)" stroke="#7a4600" stroke-width="3.5"/>
<path d="M100 64 C80 30 52 40 62 58 C68 68 88 66 100 64 Z" fill="url(#gGo)" stroke="#7a4600" stroke-width="4" stroke-linejoin="round"/>
<path d="M100 64 C120 30 148 40 138 58 C132 68 112 66 100 64 Z" fill="url(#gGo)" stroke="#7a4600" stroke-width="4" stroke-linejoin="round"/>
<path d="M56 98 L56 146" stroke="#fff" stroke-width="6" opacity=".25" stroke-linecap="round"/>
${use('gem', 'translate(150 66) rotate(18) scale(.8)')}${use('coin', 'translate(46 156) scale(.7)')}`);

export const ART_SEEDS = art(`
<ellipse cx="100" cy="166" rx="60" ry="9" fill="#000" opacity=".18"/>
<path d="M56 54 L144 54 L150 158 L50 158 Z" fill="url(#gS)" stroke="#8a5a2b" stroke-width="4" stroke-linejoin="round"/>
<path d="M56 54 L144 54 L142 70 L58 70 Z" fill="#e8b46a" stroke="#8a5a2b" stroke-width="3.5" stroke-linejoin="round"/>
<circle cx="100" cy="110" r="28" fill="#ffd36b" stroke="#c27b00" stroke-width="3"/>
<path d="M100 132 C98 118 100 106 100 96" stroke="#3fa82a" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M100 104 C88 92 76 96 74 104 C86 110 96 108 100 104 Z" fill="url(#gL)" stroke="#2e7a1f" stroke-width="2.5"/>
<path d="M100 98 C112 84 126 88 128 96 C116 104 106 102 100 98 Z" fill="url(#gL)" stroke="#2e7a1f" stroke-width="2.5"/>
<ellipse cx="70" cy="150" rx="6" ry="4" fill="#8a5a2b"/><ellipse cx="128" cy="148" rx="6" ry="4" fill="#8a5a2b"/><ellipse cx="116" cy="156" rx="5" ry="3.5" fill="#a06a34"/>
<path d="M66 80 L66 140" stroke="#fff" stroke-width="5" opacity=".35" stroke-linecap="round"/>`);

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
