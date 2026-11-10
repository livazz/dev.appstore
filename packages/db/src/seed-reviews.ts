/*
 * Seed des avis de démo : pour chaque jeu EN LIGNE, 8 à 40 avis déterministes (générateur pseudo-aléatoire dont la
 * graine dépend de l'identifiant du jeu), écrits par des auteurs fictifs, avec des textes français propres au genre
 * du jeu (modèles par catégorie + phrases génériques), des notes réalistes (majorité de 4 et 5) et des dates étalées
 * sur les 6 derniers mois. Identifiants fixes + onConflictDoNothing : relancer le seed n'ajoute rien.
 * Les avis de démo n'ont pas de compte (`user_id` null) : seul `author_name` est affiché.
 */
import { db, eq, gameReviews, games } from './index';

type Bucket = 'pos' | 'mid' | 'neg';
type Templates = Record<Bucket, string[]>;

/** Phrases propres à chaque genre. `{jeu}` est remplacé par le nom du jeu. */
const BY_CATEGORY: Record<string, Templates> = {
  course: {
    pos: [
      'Les sensations de vitesse sont top, surtout avec le nitro dans les longues lignes droites.',
      'Les circuits sont variés et le drift est vraiment bien dosé, on progresse à chaque course.',
      'Les courses en ligne se lancent en quelques secondes et il y a toujours du monde.',
      'La personnalisation des voitures est très poussée, je passe presque autant de temps au garage qu’en course.',
      'Les contrôles tactiles répondent au quart de tour, même sur mon vieux téléphone.',
      'Le mode championnat est prenant, j’enchaîne les saisons sans voir le temps passer.',
      'Graphismes superbes de nuit, les reflets sur la route mouillée sont bluffants.',
      'Les défis quotidiens donnent une bonne raison de revenir chaque jour.',
    ],
    mid: [
      'Bonnes sensations de conduite, mais on retombe vite sur les mêmes circuits.',
      'Sympa pour des courses rapides, par contre les meilleures voitures demandent beaucoup de temps de jeu.',
      'Le multijoueur est fun mais le matchmaking me met souvent contre des joueurs bien plus forts.',
      'Le jeu est beau, dommage que le carburant limite le nombre de courses d’affilée.',
      'Correct dans l’ensemble, la caméra en virage serré reste perfectible.',
    ],
    neg: [
      'Impossible de rivaliser en ligne sans acheter les voitures améliorées.',
      'Beaucoup de déconnexions en pleine course, ce qui fait perdre la récompense.',
      'Les adversaires de l’IA trichent clairement dans le dernier tour.',
      'Trop de publicités entre les courses, ça casse complètement le rythme.',
      'Depuis la dernière mise à jour le jeu rame dès qu’il y a plus de quatre voitures à l’écran.',
    ],
  },
  'battle royale': {
    pos: [
      'Les parties sont intenses du début à la fin, la zone qui se resserre met vraiment la pression.',
      'Très bon gunplay pour un jeu mobile, les armes ont chacune leur personnalité.',
      'Jouer en escouade avec des amis est un vrai plaisir, le chat vocal fonctionne bien.',
      'Le matchmaking est rapide et les serveurs tiennent bien la charge.',
      'Les saisons apportent régulièrement de nouvelles cartes et des modes temporaires sympas.',
      'Le passe de combat est généreux même en version gratuite.',
      'Aucun lag constaté, même en 4G dans le train.',
    ],
    mid: [
      'Bon jeu mais il y a pas mal de tricheurs en classé.',
      'Les parties sont fun, par contre l’atterrissage est souvent chaotique avec trop de joueurs au même endroit.',
      'Les skins sont jolis mais vraiment chers, heureusement ils ne donnent aucun avantage.',
      'Il faut un bon téléphone pour en profiter, sinon les graphismes sont très dégradés.',
      'Sympa, mais les bots en début de saison sont un peu trop nombreux.',
    ],
    neg: [
      'Trop de tricheurs en partie classée, aucune sanction visible.',
      'La batterie fond en une demi-heure et le téléphone chauffe énormément.',
      'L’équilibrage des armes est raté depuis la dernière saison, tout le monde joue la même.',
      'Je me fais éliminer par des joueurs que je n’ai même pas vus, les serveurs ne suivent pas.',
      'Le jeu pousse beaucoup trop à l’achat de caisses aléatoires.',
    ],
  },
  strategie: {
    pos: [
      'Excellent jeu de stratégie, il faut vraiment réfléchir à sa composition d’armée.',
      'Les alliances rendent le jeu très vivant, on s’organise pour les guerres de clans.',
      'La gestion des ressources est fine et chaque décision compte.',
      'Les campagnes solo sont bien écrites et la difficulté monte progressivement.',
      'J’adore planifier mes attaques, il y a toujours une nouvelle tactique à tester.',
      'Le jeu respecte le temps du joueur : on peut avancer en dix minutes par jour.',
      'Les mises à jour ajoutent régulièrement des unités et des cartes, la communauté est active.',
    ],
    mid: [
      'Bonne profondeur stratégique, mais les temps de construction deviennent très longs passé un certain niveau.',
      'Intéressant, même si les joueurs qui dépensent beaucoup ont un vrai avantage en guerre.',
      'Le début est passionnant, le milieu de partie traîne un peu en longueur.',
      'Bon jeu mais l’interface est chargée sur un petit écran.',
      'Le tutoriel est trop court, on se perd un peu dans les menus au départ.',
    ],
    neg: [
      'Les temps d’attente sont interminables sans payer pour accélérer.',
      'Je me fais raser ma base pendant la nuit par des joueurs vingt niveaux au-dessus.',
      'Les événements sont pensés uniquement pour pousser à l’achat.',
      'Trop de notifications pour me rappeler de revenir, c’est épuisant.',
      'Le jeu plante pendant les guerres de clans, on perd tout le bénéfice de l’attaque.',
    ],
  },
  aventure: {
    pos: [
      'L’univers est magnifique et on a envie d’explorer chaque recoin.',
      'L’histoire est prenante, j’ai hâte de découvrir le prochain chapitre.',
      'Les énigmes sont bien pensées sans être frustrantes.',
      'La bande-son est superbe, à jouer avec un casque.',
      'Les personnages sont attachants et les dialogues bien écrits.',
      'Chaque île ou région a son ambiance propre, la direction artistique est soignée.',
      'Le rythme est bien dosé entre exploration, combats et histoire.',
    ],
    mid: [
      'Très belle aventure, mais les chapitres arrivent au compte-gouttes.',
      'L’exploration est agréable, dommage que l’énergie limite les sessions.',
      'Bon scénario, quelques allers-retours un peu répétitifs.',
      'Joli jeu, les quêtes secondaires manquent un peu de variété.',
      'Sympa, mais certains passages sont difficiles à comprendre sans aide.',
    ],
    neg: [
      'L’histoire s’arrête net derrière un mur payant.',
      'Bugs de sauvegarde : j’ai perdu deux heures de progression.',
      'Trop court pour le prix des packs de chapitres.',
      'Les temps de chargement entre les zones sont beaucoup trop longs.',
      'Les choix proposés n’ont presque aucun impact sur l’histoire.',
    ],
  },
  action: {
    pos: [
      'Le jeu est nerveux et les combats sont très satisfaisants.',
      'Les contrôles sont précis, on sent vraiment ses progrès d’une partie à l’autre.',
      'Les boss sont impressionnants et demandent de bien apprendre leurs attaques.',
      'Parfait pour des sessions courtes dans les transports.',
      'Les animations sont fluides et les effets visuels très réussis.',
      'Les combos sont faciles à apprendre mais difficiles à maîtriser, exactement ce que j’aime.',
      'Il y a toujours un nouveau personnage ou une nouvelle arme à débloquer.',
    ],
    mid: [
      'Bonnes sensations, mais la difficulté grimpe d’un coup après le monde 3.',
      'Fun, même si les niveaux finissent par se ressembler.',
      'Bon jeu, les contrôles virtuels manquent parfois de précision dans les moments chauds.',
      'Sympa, par contre il faut beaucoup répéter les mêmes niveaux pour améliorer son équipement.',
      'Le jeu est beau mais les publicités pour doubler les récompenses sont trop insistantes.',
    ],
    neg: [
      'Injouable sans acheter les améliorations, les ennemis deviennent des sacs à PV.',
      'Les contrôles ne répondent pas bien, je meurs à cause de la maniabilité.',
      'Crash systématique au lancement depuis la dernière mise à jour.',
      'Beaucoup trop répétitif, on refait les mêmes niveaux en boucle.',
      'Le système d’énergie empêche de jouer plus de quelques minutes.',
    ],
  },
  sport: {
    pos: [
      'Les matchs sont rapides et très fun, idéal pour une pause.',
      'Le gameplay est accessible mais il y a une vraie marge de progression.',
      'Jouer contre des amis en ligne est génial, les parties sont souvent serrées.',
      'Les animations sont réalistes et la physique de la balle est bien faite.',
      'Le mode carrière est prenant, on construit son équipe petit à petit.',
      'Les tournois du week-end sont une super idée.',
      'Prise en main immédiate, même pour quelqu’un qui ne connaît pas bien le sport.',
    ],
    mid: [
      'Bon jeu de sport, mais les adversaires en ligne ont souvent des joueurs bien mieux notés.',
      'Les matchs sont sympas, les menus sont un peu lents.',
      'Amusant, mais la caméra n’est pas toujours bien placée.',
      'Correct, il manque encore quelques modes de jeu.',
      'Bonne base, l’IA des coéquipiers fait parfois n’importe quoi.',
    ],
    neg: [
      'On affronte des équipes qui ont clairement tout acheté, aucune chance.',
      'Les matchs en ligne lagguent énormément, les tirs partent en retard.',
      'L’arbitrage automatique est incompréhensible.',
      'Les meilleures cartes joueurs ne s’obtiennent que dans des packs payants.',
      'Trop de publicités après chaque match.',
    ],
  },
  rpg: {
    pos: [
      'Un vrai RPG avec de la profondeur : les builds de personnages sont très variés.',
      'Les combats au tour par tour sont tactiques et jamais ennuyeux.',
      'L’histoire principale est épique et les quêtes annexes valent le détour.',
      'La progression est gratifiante, on sent ses héros devenir plus forts.',
      'Le système d’équipement est riche sans être trop compliqué.',
      'Les donjons sont bien conçus et les récompenses motivantes.',
      'On peut très bien progresser sans payer en étant un peu patient.',
    ],
    mid: [
      'Bon RPG, mais le farm devient lourd en fin de jeu.',
      'Les invocations sont généreuses au début, beaucoup moins ensuite.',
      'Belle histoire, les combats automatiques retirent un peu d’intérêt.',
      'Riche et beau, mais l’interface est vraiment surchargée.',
      'Bon jeu, l’équilibrage des héros mériterait d’être revu.',
    ],
    neg: [
      'Les taux d’invocation sont ridicules, impossible d’obtenir les meilleurs héros sans payer.',
      'Le farm est interminable passé le niveau 40.',
      'Beaucoup trop de monnaies différentes, on ne comprend plus rien.',
      'Le contenu de fin de jeu se résume à refaire les mêmes donjons.',
      'Bug qui bloque la quête principale depuis une semaine, aucune réponse du support.',
    ],
  },
  cartes: {
    pos: [
      'Le système de cartes est malin, chaque deck se joue vraiment différemment.',
      'Les parties durent quelques minutes, parfait pour jouer n’importe où.',
      'On obtient beaucoup de cartes gratuitement, construire un deck compétitif est possible sans payer.',
      'Les classements de fin de saison motivent à s’améliorer.',
      'Les illustrations des cartes sont superbes.',
      'Le mode brawl hebdomadaire renouvelle bien le plaisir.',
      'L’équilibrage est suivi de près, les cartes trop fortes sont vite corrigées.',
    ],
    mid: [
      'Bon jeu de cartes, mais la méta est dominée par deux ou trois decks.',
      'Agréable, la chance au tirage pèse parfois un peu trop.',
      'Sympa, même si les nouvelles extensions coûtent cher.',
      'Bonne idée, l’interface pour gérer ses decks pourrait être plus claire.',
      'Les parties sont bien, l’attente entre deux coffres l’est moins.',
    ],
    neg: [
      'Le jeu est devenu un concours de portefeuille depuis la dernière extension.',
      'Je tombe tout le temps contre le même deck, c’est lassant.',
      'Le tirage des cartes semble truqué en partie classée.',
      'Les coffres gratuits ne donnent presque que des cartes communes.',
      'Déconnexions fréquentes en fin de partie, défaite comptée quand même.',
    ],
  },
  puzzle: {
    pos: [
      'Très relaxant, parfait pour se vider la tête le soir.',
      'Les niveaux sont bien pensés et la difficulté monte en douceur.',
      'Les graphismes sont mignons et les animations très satisfaisantes.',
      'Il y a des centaines de niveaux, on n’en voit pas le bout.',
      'Les événements saisonniers sont adorables.',
      'On peut jouer hors connexion, idéal dans le métro.',
      'Les bonus combinés donnent des effets vraiment jouissifs.',
    ],
    mid: [
      'Sympa mais certains niveaux semblent impossibles sans bonus.',
      'Agréable, même si le principe reste classique.',
      'Bon passe-temps, les vies limitées sont frustrantes.',
      'Mignon, mais ça devient répétitif après quelques dizaines de niveaux.',
      'Correct, quelques publicités de trop entre les niveaux.',
    ],
    neg: [
      'Bloqué au même niveau depuis une semaine, il faut clairement payer pour avancer.',
      'Les vies se rechargent beaucoup trop lentement.',
      'Les niveaux difficiles sont réglés pour vous faire acheter des coups supplémentaires.',
      'Une publicité après chaque niveau, c’est insupportable.',
      'Ma progression a disparu après un changement de téléphone.',
    ],
  },
  simulation: {
    pos: [
      'On construit et on décore à son rythme, c’est très apaisant.',
      'La gestion est simple à prendre en main mais il y a de la profondeur.',
      'Voir son domaine grandir petit à petit est très gratifiant.',
      'Les détails et les petites animations sont adorables.',
      'On peut visiter les créations des amis, ça donne plein d’idées.',
      'Le jeu avance même quand on n’est pas là, sans être punitif.',
      'Les objectifs sont clairs et les récompenses régulières.',
    ],
    mid: [
      'Agréable, mais les constructions prennent de plus en plus de temps.',
      'Sympa, l’espace de stockage est vite plein.',
      'Bonne simulation, quelques bugs d’affichage sur tablette.',
      'Joli, mais on finit par manquer d’objectifs.',
      'Plaisant, même si la monnaie premium est trop présente.',
    ],
    neg: [
      'Les temps d’attente deviennent absurdes, plusieurs jours pour un bâtiment.',
      'Tout ce qui est joli est payant.',
      'Le jeu me demande sans arrêt de regarder des publicités pour avancer.',
      'Bug qui fait disparaître des objets achetés.',
      'Très lent sur mon téléphone dès que la carte devient grande.',
    ],
  },
  casual: {
    pos: [
      'Mignon et sans prise de tête, exactement ce qu’il me fallait.',
      'Mes enfants et moi adorons y jouer ensemble.',
      'Simple à comprendre, on joue en deux secondes.',
      'Très doux, aucune pression, idéal pour se détendre.',
      'Les petits personnages sont trop chou et les sons apaisants.',
      'Parfait pour une partie rapide en attendant le bus.',
    ],
    mid: [
      'Sympa pour passer le temps, mais on en fait vite le tour.',
      'Mignon, un peu trop de publicités tout de même.',
      'Agréable, il manque quelques nouveautés.',
      'Bon petit jeu, la progression ralentit beaucoup.',
    ],
    neg: [
      'Trop de publicités, on passe plus de temps à les regarder qu’à jouer.',
      'Très vite répétitif.',
      'Le jeu se bloque régulièrement sur l’écran de chargement.',
      'Tout devient payant passé les premiers niveaux.',
    ],
  },
};

/** Variantes de libellés de catégorie (sans accents, minuscules). */
const ALIASES: Record<string, string> = {
  courses: 'course',
  karting: 'course',
  'battle-royale': 'battle royale',
  tir: 'battle royale',
  fps: 'battle royale',
  tactique: 'strategie',
  'tower defense': 'strategie',
  aventures: 'aventure',
  narratif: 'aventure',
  arcade: 'action',
  plateforme: 'action',
  combat: 'action',
  sports: 'sport',
  'jeu de role': 'rpg',
  'jeux de role': 'rpg',
  carte: 'cartes',
  'jeu de cartes': 'cartes',
  casino: 'cartes',
  reflexion: 'puzzle',
  'match-3': 'puzzle',
  mots: 'puzzle',
  gestion: 'simulation',
  famille: 'casual',
  occasionnel: 'casual',
};

const GENERIC: Templates = {
  pos: [
    'Le jeu est soigné et les mises à jour sont régulières.',
    'Le studio écoute vraiment la communauté.',
    'On peut très bien jouer sans rien dépenser.',
    'Graphismes réussis et prise en main immédiate.',
  ],
  mid: ['Le jeu a du potentiel, il manque encore un peu de contenu.', 'Correct, sans plus pour l’instant.', 'Quelques bugs à corriger mais la base est bonne.'],
  neg: ['Le jeu pousse trop à l’achat.', 'Beaucoup de bugs depuis la dernière mise à jour.', 'Le support ne répond pas.'],
};

/** Phrases sur la boutique (achats in-app via Dev AppStore). */
const SHOP: Templates = {
  pos: [
    'J’ai acheté un pack sur la boutique Dev AppStore : livré dans le jeu en quelques secondes.',
    'Les packs sont moins chers ici que dans le jeu, c’est appréciable.',
    'La liaison du compte a pris deux minutes et mes gemmes sont arrivées tout de suite.',
    'Achats in-app au juste prix, rien de forcé.',
    'Le pass mensuel vaut vraiment le coup pour les joueurs réguliers.',
  ],
  mid: ['Les offres sont correctes mais j’aimerais plus de promotions.', 'Les prix des packs restent un peu élevés, même avec la réduction.'],
  neg: ['Les prix des packs sont exagérés.', 'Les offres « limitées » reviennent toutes les semaines, ce n’est pas très honnête.'],
};

const OPENERS: Templates = {
  pos: ['Je joue depuis plusieurs mois et je ne m’en lasse pas.', 'Découvert grâce à un ami, adopté tout de suite.', 'Franchement une très bonne surprise.', 'Mon jeu préféré du moment.', 'J’ai testé pas mal de jeux du genre, celui-ci est au-dessus.'],
  mid: ['Je joue un peu tous les jours.', 'Avis après deux semaines de jeu.', 'Je suis partagé.'],
  neg: ['J’ai beaucoup aimé au début.', 'Joueur depuis la sortie, je suis déçu.', 'Avis honnête après un mois.'],
};

const CLOSERS: Templates = {
  pos: ['Je recommande !', 'Bravo au studio.', 'Hâte de voir la suite.', 'Foncez.', 'Continuez comme ça !'],
  mid: ['À voir avec les prochaines mises à jour.', 'Peut mieux faire.', 'Je garde quand même le jeu.'],
  neg: ['Dommage, le potentiel est là.', 'Je désinstalle.', 'J’espère que ce sera corrigé.'],
};

const SHORT: Templates = {
  pos: ['Super jeu, très addictif !', 'Génial, rien à redire.', 'Top du top, bravo.', 'Excellent, je recommande vivement.', 'Très bon jeu, merci !'],
  mid: ['Pas mal, sans plus.', 'Sympa mais répétitif.', 'Moyen, mais ça passe le temps.'],
  neg: ['Vraiment décevant.', 'Trop de pubs, dommage.', 'Ne fonctionne pas bien chez moi.'],
};

const FIRST_NAMES = [
  'Camille', 'Lucas', 'Léa', 'Hugo', 'Manon', 'Nathan', 'Chloé', 'Enzo', 'Inès', 'Mathis', 'Sarah', 'Théo', 'Jade', 'Yanis', 'Emma',
  'Karim', 'Amina', 'Julien', 'Sophie', 'Mehdi', 'Clara', 'Antoine', 'Lina', 'Maxime', 'Zoé', 'Nicolas', 'Fatou', 'Romain', 'Élodie',
  'Thomas', 'Aïcha', 'Kévin', 'Laura', 'Rayan', 'Pauline', 'Samuel', 'Nora', 'Bastien', 'Mélissa', 'Adrien', 'Yasmine', 'Quentin',
  'Océane', 'Diego', 'Margaux', 'Ibrahim', 'Anaïs', 'Florian', 'Salomé', 'Moussa', 'Charlotte', 'Paul', 'Lucie', 'Tom', 'Héloïse',
];
const LAST_INITIALS = 'ABCDEFGHJKLMNOPRSTVZ';
const PSEUDOS = [
  'DarkLynx', 'Gamer_Lili', 'NovaFox', 'PtitLoup77', 'Mamie_Gamer', 'ZenPanda', 'Kraken84', 'LaFée', 'Tonton_Ju', 'PixelQueen',
  'Ravenn', 'xXSniperXx', 'Capucine_42', 'LeGrandBleu', 'Moonwalker', 'Sushi_Roll', 'Choupette', 'Rikiki', 'Tempête', 'Dédé_du_Sud',
  'Ludo59', 'Mlle_Bulle', 'KoalaZz', 'Marmotte', 'Flashou',
];

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function templatesForCategory(category: string | null | undefined): Templates {
  const key = normalize(category ?? '');
  return BY_CATEGORY[key] ?? BY_CATEGORY[ALIASES[key] ?? ''] ?? GENERIC;
}

/** Avis de démo d'un jeu (pur, déterministe). Exporté pour les tests. */
export function generateGameReviews(game: { id: string; name: string; category: string | null }, now: Date) {
  const rand = mulberry32(hashString(game.id));
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
  const specific = templatesForCategory(game.category);
  const n = 8 + Math.floor(rand() * 33); // 8 à 40
  // Biais par jeu : certains jeux sont mieux notés que d'autres.
  const bias = rand() * 1.0 - 0.6;
  const weights = { 5: 0.44 + bias * 0.25, 4: 0.3, 3: 0.11 - bias * 0.05, 2: 0.08 - bias * 0.08, 1: 0.07 - bias * 0.12 };
  const ratings = ([5, 4, 3, 2, 1] as const).map((r) => [r, Math.max(0.01, weights[r])] as const);
  const totalW = ratings.reduce((s, [, w]) => s + w, 0);
  const drawRating = () => {
    let x = rand() * totalW;
    for (const [r, w] of ratings) if ((x -= w) <= 0) return r;
    return 5;
  };
  const used = new Set<string>();
  const fresh = (arr: readonly string[]) => {
    for (let i = 0; i < 4; i++) {
      const s = pick(arr);
      if (!used.has(s)) return used.add(s), s;
    }
    return pick(arr);
  };
  const fill = (s: string) => s.replace(/\{jeu\}/g, game.name);

  const out: (typeof gameReviews.$inferInsert)[] = [];
  for (let i = 0; i < n; i++) {
    const rating = drawRating();
    const bucket: Bucket = rating >= 4 ? 'pos' : rating === 3 ? 'mid' : 'neg';
    let body: string;
    if (rand() < 0.14) {
      body = pick(SHORT[bucket]);
    } else {
      const parts: string[] = [];
      if (rand() < 0.4) parts.push(pick(OPENERS[bucket]));
      parts.push(fresh(specific[bucket]));
      if (rand() < 0.5) parts.push(fresh(rand() < 0.75 ? specific[bucket] : GENERIC[bucket]));
      if (rating === 4 && rand() < 0.45) parts.push(fresh(specific.mid));
      if (rand() < 0.3) parts.push(pick(SHOP[bucket]));
      if (rand() < 0.45) parts.push(pick(CLOSERS[bucket]));
      body = [...new Set(parts)].join(' ');
    }
    const author =
      rand() < 0.7 ? `${pick(FIRST_NAMES)} ${LAST_INITIALS[Math.floor(rand() * LAST_INITIALS.length)]}.` : pick(PSEUDOS);
    // Dates sur 6 mois, plus d'avis récents que d'anciens.
    const ageMs = Math.pow(rand(), 1.4) * 180 * 86_400_000 + Math.floor(rand() * 86_400_000);
    const createdAt = new Date(now.getTime() - ageMs);
    const updatedAt = rand() < 0.08 ? new Date(Math.min(now.getTime(), createdAt.getTime() + (1 + rand() * 10) * 86_400_000)) : createdAt;
    out.push({ id: `rev_seed_${game.id}_${String(i).padStart(2, '0')}`, gameId: game.id, userId: null, authorName: author, rating, body: fill(body), status: 'visible', createdAt, updatedAt });
  }
  return out;
}

export async function seedReviews(now: Date = new Date()) {
  const live = await db.select({ id: games.id, name: games.name, category: games.category }).from(games).where(eq(games.status, 'live'));
  let reviews = 0;
  for (const g of live) {
    const rows = generateGameReviews(g, now);
    const inserted = await db.insert(gameReviews).values(rows).onConflictDoNothing().returning({ id: gameReviews.id });
    reviews += inserted.length;
  }
  return { games: live.length, reviews };
}
