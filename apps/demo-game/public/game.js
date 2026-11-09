// Client du faux jeu Nova Games.
// - Crystal Clash (mode webhook) : Wolleen appelle le serveur du jeu, qui pousse l'inventaire ici (SSE /api/events).
// - Pixel Farm (mode SDK) : le client du jeu écoute Wolleen lui-même avec @wolleen/sdk (servi en ES module par /sdk/).

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('fr-FR');

const RESOURCES = {
  crystal: [
    { key: 'gems', label: 'gemmes' },
    { key: 'gold', label: 'or' },
  ],
  farm: [
    { key: 'seeds', label: 'graines' },
    { key: 'gold', label: 'or' },
  ],
};
const PRODUCT_LABELS = {
  gems_1200: 'Sac de gemmes',
  gems_6500: 'Coffre de gemmes',
  gold_10000: "Pile d'or",
  starter_pack: 'Pack débutant',
  pass_royal_monthly: 'Pass Royal',
  seeds_50: 'Sachet de graines',
  coins_10000: 'Bourse de pièces',
};

let config;
let gameKey = 'crystal';
let player;
let inventory = {};
/** Fonction d'arrêt de la connexion temps réel en cours. */
let teardown = () => {};
let wolleen; // client SDK (Pixel Farm)
let expiryTimer;
let mountSeq = 0;

function readPref(k, d) {
  try {
    return localStorage.getItem(`demo:${k}`) ?? d;
  } catch {
    return d;
  }
}
function writePref(k, v) {
  try {
    localStorage.setItem(`demo:${k}`, v);
  } catch {
    /* navigation privée */
  }
}

// --------------------------------------------------------------- Rendu

function renderPills(changed = {}) {
  const pills = $('pills');
  pills.innerHTML = '';
  for (const r of RESOURCES[gameKey]) {
    const el = document.createElement('div');
    el.className = 'pill';
    el.dataset.key = r.key;
    el.innerHTML = `<span class="ico ${r.key}"></span><span class="val"></span>`;
    el.querySelector('.val').textContent = fmt(inventory[r.key] ?? 0);
    el.title = r.label;
    pills.append(el);
  }
  for (const [k, from] of Object.entries(changed)) animatePill(k, from, inventory[k] ?? 0);
  const perks = $('perks');
  perks.innerHTML = '';
  if (inventory.royalPass) perks.insertAdjacentHTML('beforeend', '<span class="perk">Pass Royal actif</span>');
  if (inventory.starterPack) perks.insertAdjacentHTML('beforeend', '<span class="perk">Pack débutant</span>');
}

function animatePill(key, from, to) {
  const pill = document.querySelector(`.pill[data-key="${key}"]`);
  if (!pill || from === to) return;
  const val = pill.querySelector('.val');
  const start = performance.now();
  const dur = 900;
  const step = (t) => {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    val.textContent = fmt(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  pill.classList.remove('bump');
  void pill.offsetWidth;
  pill.classList.add('bump');
  const n = document.createElement('span');
  n.className = 'float-num';
  n.textContent = `${to > from ? '+' : '−'}${fmt(Math.abs(to - from))}`;
  const rect = pill.getBoundingClientRect();
  const screen = $('screen').getBoundingClientRect();
  n.style.left = `${rect.left - screen.left + rect.width / 2 - 20}px`;
  n.style.top = `${rect.top - screen.top + rect.height}px`;
  $('toasts').append(n);
  setTimeout(() => n.remove(), 1500);
}

function showReward(productId, delta, refund) {
  const parts = Object.entries(delta)
    .filter(([k]) => k !== 'royalPass' && k !== 'starterPack')
    .map(([k, v]) => `${v > 0 ? '+' : '−'}${fmt(Math.abs(v))} ${labelOf(k)}`);
  const el = document.createElement('div');
  el.className = 'reward';
  el.innerHTML = `<span></span><small></small>`;
  el.firstChild.textContent = refund ? 'Achat remboursé' : 'Achat reçu !';
  el.lastChild.textContent = [PRODUCT_LABELS[productId] ?? productId, ...parts].join(' · ');
  $('toasts').append(el);
  setTimeout(() => el.remove(), 2700);
}

function labelOf(key) {
  return { gems: 'gemmes', gold: 'or', seeds: 'graines' }[key] ?? key;
}

function setInventory(next, { animate = false } = {}) {
  const changed = {};
  if (animate) for (const r of RESOURCES[gameKey]) if ((inventory[r.key] ?? 0) !== (next[r.key] ?? 0)) changed[r.key] = inventory[r.key] ?? 0;
  inventory = { ...next };
  renderPills(changed);
}

function setStatus(state, text) {
  const s = $('status');
  s.classList.toggle('on', state === 'on');
  s.classList.toggle('off', state === 'off');
  $('status-text').textContent = text;
}

function log(text, cls = '') {
  const ul = $('log');
  if (ul.querySelector('.muted')) ul.innerHTML = '';
  const li = document.createElement('li');
  li.className = cls;
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString('fr-FR');
  li.append(time, document.createTextNode(text));
  ul.prepend(li);
}

// --------------------------------------------------- Crystal (webhook)

function startCrystal() {
  const es = new EventSource(`/api/events?game=crystal&player=${encodeURIComponent(player.id)}`);
  es.addEventListener('open', () => setStatus('on', 'Serveur du jeu connecté · webhook Wolleen'));
  es.addEventListener('error', () => setStatus('wait', 'Reconnexion au serveur du jeu…'));
  es.addEventListener('state', (m) => setInventory(JSON.parse(m.data).inventory));
  es.addEventListener('inventory', (m) => {
    const u = JSON.parse(m.data);
    const refund = u.record.event === 'purchase.refunded';
    setInventory(u.inventory, { animate: true });
    showReward(u.record.product_id, u.record.delta, refund);
    log(`Webhook reçu : ${PRODUCT_LABELS[u.record.product_id] ?? u.record.product_id} (${u.record.delivery_id})`, 'ok');
  });
  return () => es.close();
}

// ------------------------------------------------------- Farm (SDK)

function farmKey() {
  return `farm:inv:${player.id}`;
}

function applyGrant(inv, productId, quantity, refund) {
  const g = config.grants[productId];
  if (!g) return null;
  const sign = refund ? -1 : 1;
  const delta = 'perUnit' in g ? { [g.perUnit]: sign * (quantity > 0 ? quantity : g.fallback) } : Object.fromEntries(Object.entries(g.fixed).map(([k, v]) => [k, sign * v]));
  const next = { ...inv };
  for (const [k, v] of Object.entries(delta)) next[k] = Math.max(0, (next[k] ?? 0) + v);
  return { next, delta };
}

async function startFarm() {
  const { Wolleen } = await import('/sdk/index.js');
  const saved = readPref(farmKey(), null);
  setInventory(saved ? JSON.parse(saved) : { seeds: 0, gold: 0, ...config.startingInventory.farm });
  // Le client du jeu parle à Wolleen via le proxy du serveur démo (même origine, pas de CORS).
  wolleen = new Wolleen({
    apiKey: config.games.farm.apiKey,
    baseUrl: `${location.origin}/proxy`,
    storage: localStorage, // dédoublonnage persistant : jamais deux fois le même delivery_id
    onError: (e) => console.warn('[Wolleen]', e),
  });
  const sub = wolleen.onPurchase(player.id, (e) => {
    const refund = e.event === 'purchase.refunded';
    const r = applyGrant(inventory, e.product_id, e.quantity, refund);
    if (!r) {
      log(`Produit inconnu ignoré : ${e.product_id}`, 'warn');
      return;
    }
    // Créditer (et sauvegarder) AVANT de rendre la main : le SDK acquitte ensuite.
    writePref(farmKey(), JSON.stringify(r.next));
    setInventory(r.next, { animate: true });
    showReward(e.product_id, r.delta, refund);
    log(`SDK : ${PRODUCT_LABELS[e.product_id] ?? e.product_id} reçu et acquitté (${e.delivery_id})`, 'ok');
  });
  const poll = setInterval(() => {
    setStatus(sub.connected ? 'on' : 'wait', sub.connected ? 'SDK connecté à Wolleen · temps réel' : 'SDK : connexion à Wolleen…');
  }, 500);
  return () => {
    clearInterval(poll);
    sub.unsubscribe();
  };
}

// ---------------------------------------------------- Code de liaison

async function requestCode() {
  const btn = $('request-code');
  btn.disabled = true;
  $('link-error').hidden = true;
  try {
    let code;
    if (gameKey === 'farm') {
      code = await wolleen.requestLinkCode(player.id, player.name);
    } else {
      const res = await fetch('/api/link-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game: 'crystal', player_id: player.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `Erreur ${res.status}`);
      code = body;
    }
    $('code-box').hidden = false;
    $('link-code').textContent = code.code;
    const expires = new Date(code.expires_at).getTime();
    clearInterval(expiryTimer);
    const tick = () => {
      const s = Math.max(0, Math.round((expires - Date.now()) / 1000));
      $('link-expiry').textContent = s > 0 ? `Expire dans ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : 'Code expiré, générez-en un autre.';
    };
    tick();
    expiryTimer = setInterval(tick, 1000);
    log(`Code de liaison ${code.code} généré (${gameKey === 'farm' ? 'SDK' : 'serveur du jeu'})`);
  } catch (e) {
    const msg = e?.message ?? String(e);
    $('link-error').textContent = /fetch|injoignable|Failed/i.test(msg) ? `Wolleen injoignable (${config.wolleenUrl}). ${msg}` : msg;
    $('link-error').hidden = false;
  } finally {
    btn.disabled = false;
  }
}

// ------------------------------------------------------------ Montage

async function mount() {
  teardown();
  teardown = () => {};
  const g = config.games[gameKey];
  $('screen').dataset.game = gameKey;
  $('game-title').textContent = g.name;
  document.querySelectorAll('.game-card').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.game === gameKey)));
  $('mode-hint').textContent =
    g.mode === 'webhook'
      ? 'Wolleen envoie un webhook signé au serveur du jeu (port 4100), qui crédite l’inventaire puis le pousse au jeu.'
      : 'Le jeu écoute Wolleen directement avec @wolleen/sdk (flux temps réel + rattrapage), crédite puis acquitte.';
  $('simulate').hidden = g.mode !== 'webhook';
  $('player-name').textContent = player.name;
  $('player-level').textContent = `Niv. ${player.level}`;
  $('avatar').textContent = player.name.slice(0, 1);
  $('player-id').textContent = player.id;
  $('shop-link').href = `${config.wolleenUrl}/games/${g.slug}`;
  $('link-url').href = `${config.wolleenUrl}/games/${g.slug}/link`;
  $('link-url').textContent = `${config.wolleenUrl.replace(/^https?:\/\//, '')}/games/${g.slug}/link`;
  $('link-via').textContent = g.mode === 'webhook' ? 'via le serveur du jeu' : 'via le SDK';
  $('code-box').hidden = true;
  $('link-error').hidden = true;
  setStatus('wait', 'Connexion…');
  const seq = ++mountSeq;
  try {
    const stop = gameKey === 'crystal' ? startCrystal() : await startFarm();
    if (seq !== mountSeq) return stop(); // changement de jeu/joueur pendant le démarrage
    teardown = stop;
  } catch (e) {
    setStatus('off', 'Erreur de démarrage');
    log(String(e?.message ?? e), 'warn');
  }
}

async function main() {
  config = await (await fetch('/api/config')).json();
  $('open-wolleen').href = config.wolleenUrl;
  const params = new URLSearchParams(location.search);
  gameKey = params.get('game') ?? readPref('game', 'crystal');
  if (!config.games[gameKey]) gameKey = 'crystal';
  const pid = params.get('player') ?? readPref('player', config.players[0].id);
  player = config.players.find((p) => p.id === pid) ?? config.players[0];

  const sel = $('player');
  for (const p of config.players) sel.add(new Option(`${p.name} · ${p.id} · niv. ${p.level}`, p.id));
  sel.value = player.id;
  sel.addEventListener('change', () => {
    player = config.players.find((p) => p.id === sel.value);
    writePref('player', player.id);
    mount();
  });
  document.querySelectorAll('.game-card').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.game === gameKey) return;
      gameKey = b.dataset.game;
      writePref('game', gameKey);
      mount();
    }),
  );
  $('open-settings').addEventListener('click', () => ($('settings').hidden = false));
  $('close-settings').addEventListener('click', () => ($('settings').hidden = true));
  $('settings').addEventListener('click', (e) => {
    if (e.target === $('settings')) $('settings').hidden = true;
  });
  $('request-code').addEventListener('click', requestCode);
  $('simulate').addEventListener('click', async () => {
    const products = ['gems_1200', 'gold_10000', 'gems_6500', 'starter_pack', 'pass_royal_monthly'];
    const product_id = products[Math.floor(Math.random() * products.length)];
    const res = await fetch('/api/dev/simulate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ player_id: player.id, product_id }) });
    if (!res.ok) log(`Simulation refusée (${res.status})`, 'warn');
  });
  await mount();
}

main().catch((e) => {
  setStatus('off', 'Serveur démo injoignable');
  console.error(e);
});
