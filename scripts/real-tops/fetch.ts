/*
 * npm run real-tops:fetch [-- --limit 5] [--only mobile|pc] [--refresh]
 *
 * Récupère les vrais tops (STRICTEMENT LOCAL, voir common.ts) :
 * - mobile : top « les plus rentables » Jeux de l'App Store France (flux RSS public d'Apple), détails par l'API publique
 *   iTunes Lookup, « Achats intégrés » (noms + prix) lus sur la page publique apps.apple.com. Google Play n'a pas de
 *   source publique fiable (pas d'API ni de flux officiel) : App Store seul.
 * - PC : meilleures ventes Steam filtrées sur la catégorie « Achats en jeu » (35), détails par `appdetails`, visuels
 *   (logo, capsule, captures) et DLC par `IStoreBrowseService/GetItems` — API publiques, sans clé.
 * Écrit .data/real-tops/catalog.json, les images WebP dans apps/web/public/art/local/<slug>/ et
 * .data/real-tops/manquants.md (visuels introuvables + prompts de génération).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  ART_DIR, BANNERS_IN_DIR, CATALOG_FILE, DATA_DIR, MISSING_FILE, assertLocalOnly, cachedJson, cachedText, cleanIapTitle, decodeEntities,
  dominantColor, downloadImage, genericItems, htmlToText, importManualBanner, itemTypeFor, libraryArtFor, mapCategory,
  parseEuroCents, quantityFor, shortSummary, slugify, splitTitle, tidyParagraphs, type RealCatalog, type RealGame, type RealItem,
} from './common';

assertLocalOnly();

const args = process.argv.slice(2);
const argValue = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = Math.max(1, Math.min(100, Number(argValue('--limit') ?? 100)));
const ONLY = argValue('--only') as 'mobile' | 'pc' | undefined;
const REFRESH = args.includes('--refresh');
const LIST_TTL_H = 12;
const DETAIL_TTL_H = 24 * 7;
const MAX_SHOTS = 6;

const usedSlugs = new Set<string>();
function uniqueSlug(base: string, suffix: string): string {
  let s = slugify(base);
  if (usedSlugs.has(s)) s = `${s}-${suffix}`;
  for (let i = 2; usedSlugs.has(s); i++) s = `${slugify(base)}-${suffix}-${i}`;
  usedSlugs.add(s);
  return s;
}

// ——————————————————————————— App Store (mobile) ———————————————————————————

type RssEntry = { 'im:name': { label: string }; id: { attributes: { 'im:id': string } }; 'im:artist': { label: string } };
type Lookup = {
  trackId: number; trackName: string; sellerName?: string; artistName: string; genres: string[]; description: string;
  artworkUrl512?: string; screenshotUrls?: string[]; ipadScreenshotUrls?: string[]; trackViewUrl: string;
};

/** Achats intégrés affichés sur la page publique de l'app (JSON embarqué : « Achats intégrés » → items[]). */
function parseAppStoreIaps(html: string): Array<{ title: string; cents: number }> {
  const start = html.indexOf('"title":"Achats intégrés","summary"');
  if (start < 0) return [];
  // Paires « nom / prix » de la liste (la liste se termine par un bouton « En savoir plus »).
  const block = html.slice(start, start + 20_000).split('"$kind":"button"')[0]!;
  const pairs = [...block.matchAll(/"leadingText":("(?:[^"\\]|\\.)*"),"trailingText":("(?:[^"\\]|\\.)*")/g)];
  return pairs
    .map((m) => {
      try {
        return { title: decodeEntities(JSON.parse(m[1]!) as string).trim(), cents: parseEuroCents(JSON.parse(m[2]!) as string) ?? 0 };
      } catch {
        return { title: '', cents: 0 };
      }
    })
    .filter((x) => x.title && x.cents > 0);
}

const bigger = (url: string, size: string) => url.replace(/\/[^/]+$/, `/${size}`);

async function fetchAppStore(): Promise<RealGame[]> {
  console.log('App Store France — top « les plus rentables » (Jeux)…');
  const rss = await cachedJson<{ feed: { entry: RssEntry[] } }>(
    'https://itunes.apple.com/fr/rss/topgrossingapplications/limit=200/genre=6014/json',
    { maxAgeH: LIST_TTL_H, refresh: REFRESH },
  );
  const entries = (rss?.feed.entry ?? []).slice(0, LIMIT);
  if (!entries.length) throw new Error('Flux App Store vide ou injoignable.');
  const ids = entries.map((e) => e.id.attributes['im:id']);
  const details = new Map<string, Lookup>();
  for (let i = 0; i < ids.length; i += 50) {
    const lk = await cachedJson<{ results: Lookup[] }>(
      `https://itunes.apple.com/lookup?id=${ids.slice(i, i + 50).join(',')}&country=fr&lang=fr_fr`,
      { maxAgeH: DETAIL_TTL_H, refresh: REFRESH },
    );
    for (const r of lk?.results ?? []) details.set(String(r.trackId), r);
  }

  const out: RealGame[] = [];
  for (const [i, e] of entries.entries()) {
    const id = e.id.attributes['im:id'];
    const d = details.get(id);
    if (!d) continue;
    const { name, subtitle } = splitTitle(d.trackName);
    const slug = uniqueSlug(name, 'mobile');
    const genres = d.genres.filter((g) => g !== 'Jeux');
    const category = mapCategory(genres, `${d.trackName} ${d.description.slice(0, 600)}`);
    const storeDescription = tidyParagraphs(d.description);
    process.stdout.write(`  ${String(i + 1).padStart(3)}. ${name}`);

    const page = await cachedText(`https://apps.apple.com/fr/app/id${id}`, { maxAgeH: DETAIL_TTL_H, delayMs: 1200, refresh: REFRESH });
    const iaps = page ? parseAppStoreIaps(page) : [];
    // Doublons exacts retirés, puis tri par prix croissant (vitrine plus lisible).
    const seen = new Set<string>();
    const iapList = iaps
      .map((x) => ({ ...x, title: cleanIapTitle(x.title) }))
      .filter((x) => !seen.has(`${x.title}|${x.cents}`) && !!seen.add(`${x.title}|${x.cents}`))
      .sort((a, b) => a.cents - b.cents);
    const items: RealItem[] = iapList.length
      ? iapList.map((x, k) => ({
          productId: `${slugify(x.title, 30).replace(/-/g, '_')}_${k + 1}`,
          title: x.title.slice(0, 60),
          priceCents: x.cents,
          ...itemTypeFor(x.title),
          quantity: quantityFor(x.title),
          imageUrl: libraryArtFor(x.title, x.cents),
          description: `Achat intégré « ${x.title} » de ${name}, au prix de l'App Store France.`,
          source: 'appstore' as const,
        }))
      : genericItems(category, 'mobile');

    const icon = await downloadImage(d.artworkUrl512 && bigger(d.artworkUrl512, '1024x1024bb.png'), slug, 'icon', 'icon');
    const shotsSrc = (d.screenshotUrls?.length ? d.screenshotUrls : d.ipadScreenshotUrls ?? []).slice(0, MAX_SHOTS);
    const screenshots: string[] = [];
    for (const [k, u] of shotsSrc.entries()) {
      const s = await downloadImage(bigger(u, '1280x1280bb.jpg'), slug, `shot-${k + 1}`, 'shot');
      if (s) screenshots.push(s);
    }
    // Les stores mobiles n'ont pas de logo-titre détouré : bannière fournie à la main, sinon « manquante ».
    const banner = await importManualBanner(slug);
    const missing: RealGame['missing'] = [];
    if (!icon) missing.push('icon');
    if (!banner) missing.push('banner');
    if (!screenshots.length) missing.push('screenshots');
    console.log(` — ${items.length} articles${iapList.length ? ' (App Store)' : ' (génériques)'}, ${screenshots.length} captures`);

    out.push({
      slug, platform: 'mobile', rank: i + 1, sourceId: id, storeUrl: d.trackViewUrl.split('?')[0]!, name, subtitle: subtitle || genres.slice(0, 2).join(' · '),
      publisher: (d.sellerName || d.artistName || e['im:artist'].label).trim(), category,
      description: shortSummary(storeDescription), storeDescription, color: await dominantColor(icon),
      icon, banner, screenshots, items, missing,
    });
  }
  return out;
}

// ——————————————————————————— Steam (PC) ———————————————————————————

type SteamDetails = {
  type: string; name: string; steam_appid: number; is_free: boolean; short_description: string; about_the_game: string;
  developers?: string[]; publishers?: string[]; genres?: { description: string }[]; categories?: { id: number }[];
  header_image?: string; screenshots?: { path_full: string }[]; dlc?: number[];
};
type StoreItem = {
  appid: number; name: string; type?: number; success: number;
  assets?: Record<string, string> & { asset_url_format?: string };
  best_purchase_option?: { final_price_in_cents?: string };
};

const STEAM_CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/';
const assetUrl = (it: StoreItem | undefined, key: string): string | null => {
  const a = it?.assets;
  if (!a?.asset_url_format || !a[key]) return null;
  return STEAM_CDN + a.asset_url_format.replace('${FILENAME}', a[key]!);
};

async function steamItems(appids: number[]): Promise<Map<number, StoreItem>> {
  const map = new Map<number, StoreItem>();
  for (let i = 0; i < appids.length; i += 40) {
    const input = {
      ids: appids.slice(i, i + 40).map((appid) => ({ appid })),
      context: { language: 'french', country_code: 'FR' },
      data_request: { include_assets: true },
    };
    const res = await cachedJson<{ response: { store_items?: StoreItem[] } }>(
      `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
      { maxAgeH: DETAIL_TTL_H, delayMs: 1500, refresh: REFRESH },
    );
    for (const it of res?.response.store_items ?? []) if (it.success === 1) map.set(it.appid, it);
  }
  return map;
}

async function fetchSteam(): Promise<RealGame[]> {
  console.log('Steam — meilleures ventes avec « Achats en jeu »…');
  const candidates: number[] = [];
  for (let start = 0; start < 400 && candidates.length < LIMIT * 2.5 + 10; ) {
    const page = await cachedJson<{ results_html: string }>(
      `https://store.steampowered.com/search/results/?filter=topsellers&category1=998&category2=35&cc=fr&l=french&infinite=1&count=50&start=${start}`,
      { maxAgeH: LIST_TTL_H, delayMs: 1500, refresh: REFRESH },
    );
    const ids = [...(page?.results_html ?? '').matchAll(/data-ds-appid="(\d+)"/g)].map((m) => Number(m[1]));
    if (!ids.length) break;
    for (const id of ids) if (!candidates.includes(id)) candidates.push(id);
    start += ids.length;
  }

  // Détails un par un (appdetails n'accepte plus plusieurs ids) ; on garde les vrais jeux avec la catégorie 35.
  const kept: SteamDetails[] = [];
  for (const appid of candidates) {
    if (kept.length >= LIMIT) break;
    const res = await cachedJson<Record<string, { success: boolean; data?: SteamDetails }>>(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=fr&l=french`,
      { maxAgeH: DETAIL_TTL_H, delayMs: 1600, refresh: REFRESH },
    );
    const d = res?.[appid]?.data;
    if (d?.type === 'game' && d.categories?.some((c) => c.id === 35)) kept.push(d);
  }
  const store = await steamItems(kept.map((d) => d.steam_appid));
  // DLC : les 12 premiers de chaque jeu, interrogés par lots ; on écarte bandes originales, artbooks, gratuits.
  const dlcIds = [...new Set(kept.flatMap((d) => (d.dlc ?? []).slice(0, 12)))];
  const dlcs = await steamItems(dlcIds);

  const out: RealGame[] = [];
  for (const [i, d] of kept.entries()) {
    const it = store.get(d.steam_appid);
    const name = decodeEntities(d.name).replace(/[™®©]/g, '').trim();
    const slug = uniqueSlug(name, 'pc');
    const genres = (d.genres ?? []).map((g) => g.description);
    const storeDescription = htmlToText(d.about_the_game || d.short_description);
    const category = mapCategory(genres, `${name} ${d.short_description} ${storeDescription.slice(0, 800)}`);
    process.stdout.write(`  ${String(i + 1).padStart(3)}. ${name}`);

    const icon =
      (await downloadImage(assetUrl(it, 'library_capsule_2x') ?? assetUrl(it, 'library_capsule'), slug, 'icon', 'icon')) ??
      (await downloadImage(d.header_image, slug, 'icon', 'icon'));
    // Logo-titre détouré (PNG transparent) : chemin historique du CDN, absent pour les jeux récents.
    const banner =
      (await importManualBanner(slug)) ??
      (await downloadImage(`${STEAM_CDN}steam/apps/${d.steam_appid}/logo_2x.png`, slug, 'banner', 'banner')) ??
      (await downloadImage(`${STEAM_CDN}steam/apps/${d.steam_appid}/logo.png`, slug, 'banner', 'banner'));
    const screenshots: string[] = [];
    for (const [k, s] of (d.screenshots ?? []).slice(0, MAX_SHOTS).entries()) {
      const u = await downloadImage(s.path_full, slug, `shot-${k + 1}`, 'shot');
      if (u) screenshots.push(u);
    }

    const items: RealItem[] = [];
    for (const id of (d.dlc ?? []).slice(0, 12)) {
      const x = dlcs.get(id);
      const cents = Number(x?.best_purchase_option?.final_price_in_cents ?? 0);
      if (!x || cents <= 0 || /soundtrack|bande[- ]originale|\bost\b|artbook|wallpaper|fond d'écran/i.test(x.name)) continue;
      const title = decodeEntities(x.name).replace(/[™®©]/g, '').replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–:]\\s*`, 'i'), '').trim();
      const image = await downloadImage(assetUrl(x, 'main_capsule') ?? assetUrl(x, 'header'), slug, `dlc-${id}`, 'item');
      items.push({
        productId: `dlc_${id}`, title: title.slice(0, 60), priceCents: cents, type: 'non_consumable', quantity: 1,
        imageUrl: image ?? libraryArtFor(title, cents), description: `Contenu téléchargeable de ${name} sur Steam (prix France).`, source: 'steam-dlc',
      });
      if (items.length >= 6) break;
    }
    if (!items.length) items.push(...genericItems(category, 'pc'));

    const missing: RealGame['missing'] = [];
    if (!icon) missing.push('icon');
    if (!banner) missing.push('banner');
    if (!screenshots.length) missing.push('screenshots');
    console.log(` — ${items.length} articles${items[0]?.source === 'steam-dlc' ? ' (DLC)' : ' (génériques)'}, ${screenshots.length} captures${banner ? ', logo' : ''}`);

    out.push({
      slug, platform: 'pc', rank: i + 1, sourceId: String(d.steam_appid), storeUrl: `https://store.steampowered.com/app/${d.steam_appid}/`,
      name, subtitle: genres.filter((g) => !/indépendant|free to play|accès anticipé/i.test(g)).slice(0, 2).join(' · '),
      publisher: (d.publishers?.[0] || d.developers?.[0] || 'Éditeur inconnu').trim(), category,
      description: shortSummary(htmlToText(d.short_description) || storeDescription), storeDescription,
      color: await dominantColor(icon), icon, banner, screenshots, items, missing,
    });
  }
  return out;
}

// ——————————————————————————— manquants.md ———————————————————————————

const STYLE_HINT: Record<string, string> = {
  RPG: 'epic fantasy style, ornate gold trim, glowing gems, rich dramatic colors',
  Stratégie: 'heroic strategy game style, bold metallic beveled letters, shields and banners',
  Cartes: 'casino and card game style, glossy gold bevel, playful sparkle',
  Puzzle: 'soft cartoon style, rounded glossy candy-like letters, bright cheerful colors',
  Casual: 'cozy cartoon style, rounded glossy letters, warm friendly colors',
  Simulation: 'cozy colorful cartoon style, rounded glossy letters, warm friendly colors',
  Action: 'bold chunky 3D letters, dynamic angles, vibrant saturated colors, energetic',
  'Battle royale': 'bold chunky 3D letters, dynamic angles, vibrant saturated colors, energetic',
  Sport: 'sporty dynamic italic 3D lettering, energetic, bold outline',
  Course: 'speed racing style, italic chrome 3D letters, motion streaks',
  Aventure: 'adventure style, carved stone or wood letters, lush details',
};

function missingReport(games: RealGame[]): string {
  const lacking = games.filter((g) => g.missing.length);
  const lines = [
    '# Visuels introuvables en ligne — à générer',
    '',
    `Généré le ${new Date().toLocaleString('fr-FR')} par \`npm run real-tops:fetch\`. **Fichier local, ne jamais le commiter.**`,
    '',
    `${lacking.length} jeux sur ${games.length} ont au moins un visuel manquant ` +
      `(${games.filter((g) => g.missing.includes('banner')).length} bannières, ${games.filter((g) => g.missing.includes('icon')).length} icônes, ` +
      `${games.filter((g) => g.missing.includes('screenshots')).length} séries de captures).`,
    '',
    'Les stores mobiles ne publient pas de logo-titre détouré : la « bannière » (logo du jeu affiché en haut de sa boutique,',
    'comme pour Crystal Clash) est donc à générer pour presque tous les jeux mobiles, et pour les jeux Steam récents.',
    '',
    '**Mode d’emploi** : génère en **2400 × 1000, fond transparent** (Ideogram ou GPT Image écrivent bien le titre ;',
    'Midjourney : génère l’emblème puis détoure). Glisse l’icône indiquée comme image de référence de style. Dépose le PNG',
    `dans \`${BANNERS_IN_DIR.replace(DATA_DIR, '.data/real-tops')}/<slug>.png\` puis relance \`npm run real-tops:seed\` (conversion WebP automatique).`,
    '',
  ];
  for (const g of lacking) {
    lines.push(`## ${g.name} — \`${g.slug}\``, '');
    lines.push(`${g.platform === 'mobile' ? 'Mobile' : 'PC (Steam)'} · n° ${g.rank} · ${g.publisher} · ${g.category} · [fiche du store](${g.storeUrl})`, '');
    lines.push(`Manque : ${g.missing.map((m) => ({ icon: 'icône', banner: 'bannière', screenshots: 'captures' })[m]).join(', ')}.`);
    if (g.icon) lines.push(`Référence de style : \`apps/web/public${g.icon}\`.`);
    lines.push('');
    if (g.missing.includes('banner')) {
      lines.push(`Bannière → \`.data/real-tops/bannieres/${g.slug}.png\``, '');
      lines.push(
        `> official game title logo for the ${g.platform === 'mobile' ? 'mobile' : 'PC'} game "${g.name}" by ${g.publisher}, the words "${g.name}" ` +
          `in the game's own logo lettering, faithful to the game's official art style and color palette, ${STYLE_HINT[g.category] ?? STYLE_HINT.Casual}, ` +
          'small emblem elements from the game around the title, centered, wide horizontal composition, thick clean outline, ' +
          'isolated on a fully transparent background, no backdrop, no extra text, 2400x1000 --ar 12:5',
        '',
      );
    }
    if (g.missing.includes('icon')) {
      lines.push(
        `> mobile game app icon for "${g.name}" by ${g.publisher}, faithful to the game's official key art, main character or emblem filling the square, ` +
          `${STYLE_HINT[g.category] ?? STYLE_HINT.Casual}, full bleed, no text, 1024x1024 --ar 1:1`,
        '',
      );
    }
    if (g.missing.includes('screenshots')) lines.push('Captures : à reprendre à la main depuis la fiche du store si besoin.', '');
  }
  return lines.join('\n');
}

// ——————————————————————————— Principal ———————————————————————————

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(BANNERS_IN_DIR, { recursive: true });
  mkdirSync(ART_DIR, { recursive: true });
  const games: RealGame[] = [];
  if (ONLY !== 'pc') games.push(...(await fetchAppStore()));
  if (ONLY !== 'mobile') games.push(...(await fetchSteam()));
  const catalog: RealCatalog = {
    fetchedAt: new Date().toISOString(),
    sources: ['App Store France — top rentables Jeux (RSS Apple) + iTunes Lookup', 'Steam — meilleures ventes, catégorie Achats en jeu'],
    games,
  };
  writeFileSync(CATALOG_FILE, `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(MISSING_FILE, missingReport(games));
  const images = games.reduce((n, g) => n + (g.icon ? 1 : 0) + (g.banner ? 1 : 0) + g.screenshots.length + g.items.filter((i) => i.imageUrl.startsWith('/art/local/')).length, 0);
  console.log(
    `\n${games.filter((g) => g.platform === 'mobile').length} jeux mobiles, ${games.filter((g) => g.platform === 'pc').length} jeux Steam, ${images} images locales.` +
      `\nCatalogue : ${CATALOG_FILE}\nVisuels manquants : ${MISSING_FILE}\nEnsuite : npm run real-tops:seed`,
  );
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
