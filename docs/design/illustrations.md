# Illustrations à générer — Dev AppStore

Liste des visuels nécessaires pour la nouvelle boutique et le site, avec les prompts prêts à coller
(Midjourney v7 ; fonctionnent aussi dans Recraft, Scenario, Leonardo ou Layer, spécialisés « game assets »).

Dépose les fichiers retenus dans `apps/web/public/art/` en respectant les noms ci-dessous : je les branche ensuite.

---

## 1. Règles communes (à respecter pour TOUTES les images)

- **Fond transparent** (PNG 32 bits). Midjourney ne sait pas faire de transparence : génère sur fond uni
  (`plain flat light grey background`), puis détoure (remove.bg, Photoshop « Supprimer l'arrière-plan », ou Recraft
  qui exporte directement en transparent).
- **Aucun texte, chiffre, cadre, bordure, carte ou étiquette** dans l'image : la quantité, le nom et le prix sont
  affichés par le site. C'est ce qui rendait les anciens visuels moches (cadre dans le cadre).
- **Objet seul, centré**, occupant ~80 % du carré, vue 3/4 légèrement plongeante, lumière en haut à gauche.
- **Même style partout** : génère d'abord 2-3 objets, garde le meilleur, puis réutilise-le comme référence de style
  (`--sref <url de l'image>` dans Midjourney) pour toutes les autres, et note la seed.
- Taille : **1024 × 1024** pour les objets, **1024 × 1024** pour les icônes de jeu, **2400 × 1000** pour les
  bannières. Exporte en PNG, je compresse (WebP) côté site.

### Suffixe de style à ajouter à chaque prompt d'objet

```
, mobile game item icon, stylized 3D render, chunky shapes, glossy highlights, vibrant saturated colors,
soft rim light, clean silhouette, centered, isolated on plain flat light grey background, no text, no frame,
no border, no card --ar 1:1 --style raw --v 7
```

### Paliers de quantité

Les jeux mobiles montrent la valeur par la **taille du tas** : pour chaque monnaie, 4 paliers (petit → énorme)
qui se ressemblent mais grossissent. Garde la même gemme / la même pièce d'un palier à l'autre.

---

## 2. Bibliothèque générique d'objets (proposée à tous les studios)

Visuels par défaut que n'importe quel studio peut choisir dans l'éditeur s'il n'a pas ses propres images.
Priorité : ★ = indispensable pour la démo, ☆ = bibliothèque complète.

| # | Fichier | Description | Prompt (+ suffixe commun) |
|---|---|---|---|
| ★1 | `items/gems-1.png` | Poignée de gemmes | `a small handful of 3 emerald green faceted gems` |
| ★2 | `items/gems-2.png` | Petit sac de gemmes | `a small leather pouch overflowing with emerald green faceted gems` |
| ★3 | `items/gems-3.png` | Coffre de gemmes | `an open purple and gold treasure chest overflowing with emerald green faceted gems` |
| ☆4 | `items/gems-4.png` | Montagne de gemmes | `a huge glowing pile of emerald green faceted gems spilling out of a large golden chest, sparkles` |
| ★5 | `items/gold-1.png` | Quelques pièces | `a small stack of 4 shiny gold coins` |
| ★6 | `items/gold-2.png` | Piles de pièces | `three tall stacks of shiny gold coins` |
| ☆7 | `items/gold-3.png` | Sac d'or | `a bulging burlap sack overflowing with shiny gold coins` |
| ☆8 | `items/gold-4.png` | Coffre d'or | `an open wooden treasure chest overflowing with shiny gold coins, sparkles` |
| ★9 | `items/pass.png` | Pass / abonnement | `a royal golden crown with a ruby and sapphires on a small purple velvet cushion` |
| ★10 | `items/starter-pack.png` | Pack débutant | `a blue gift box with a big golden ribbon bow, a few green gems and gold coins peeking out` |
| ☆11 | `items/chest-common.png` | Coffre commun | `a closed wooden treasure chest with iron bands` |
| ☆12 | `items/chest-rare.png` | Coffre rare | `a closed blue and silver treasure chest, faint blue glow` |
| ☆13 | `items/chest-epic.png` | Coffre épique | `a closed purple and gold treasure chest, magical purple glow` |
| ☆14 | `items/chest-legendary.png` | Coffre légendaire | `a closed ornate golden treasure chest with orange magical glow and light rays` |
| ☆15 | `items/energy.png` | Énergie | `a glowing yellow lightning bolt energy crystal` |
| ☆16 | `items/lives.png` | Vies | `a glossy red heart with a soft shine` |
| ☆17 | `items/key.png` | Clé | `an ornate golden key with a blue gem` |
| ☆18 | `items/ticket.png` | Ticket / pass de saison | `a golden VIP ticket with star decorations, no text` |
| ☆19 | `items/booster-x2.png` | Boost ×2 | `a glowing potion bottle with swirling orange liquid` |
| ☆20 | `items/remove-ads.png` | Sans pub | `a shield with a crossed-out megaphone symbol, glossy blue` |
| ☆21 | `items/bundle.png` | Lot / bundle | `a wooden crate full of mixed rewards: green gems, gold coins and a small chest` |
| ☆22 | `items/skin.png` | Skin / cosmétique | `a mannequin bust wearing a stylish golden armor piece` |

Petites icônes de monnaie (affichées à côté des quantités, ~24 px) :

| # | Fichier | Prompt (+ suffixe commun) |
|---|---|---|
| ★23 | `icons/gem.png` | `a single emerald green faceted gem, simple, bold` |
| ★24 | `icons/coin.png` | `a single shiny gold coin seen slightly from above, simple, bold` |

---

## 3. Jeux de démo

### Crystal Clash (stratégie / PvP — direction Arcade)

| # | Fichier | Description | Prompt |
|---|---|---|---|
| ★25 | `games/crystal-clash/icon.png` | Icône du jeu (1024²) | `mobile game app icon, a heroic knight helmet in front of a giant glowing green crystal, crossed swords, epic, stylized 3D, vibrant, full bleed square composition, no text --ar 1:1 --style raw --v 7` |
| ★26 | `games/crystal-clash/banner.png` | Bannière (2400×1000) | `wide fantasy battle arena between two castles, giant glowing green crystals, small knights and wizards clashing in the middle, blue sky, stylized 3D mobile game key art, vibrant, empty center area for UI, no text --ar 12:5 --style raw --v 7` |

Articles : utilise ★1-★3, ★5-★6, ★9, ★10 de la bibliothèque (même style).

### Pixel Farm (ferme / casual — direction Casual doux)

| # | Fichier | Description | Prompt |
|---|---|---|---|
| ★27 | `games/pixel-farm/icon.png` | Icône du jeu (1024²) | `mobile game app icon, a cute smiling red barn with a sunflower and a chick, soft pastel colors, rounded shapes, stylized 3D, full bleed square composition, no text --ar 1:1 --style raw --v 7` |
| ★28 | `games/pixel-farm/banner.png` | Bannière (2400×1000) | `cozy pastel farm landscape, red barn, fields of crops, windmill, cute animals, fluffy clouds, soft morning light, stylized 3D mobile game key art, empty center area for UI, no text --ar 12:5 --style raw --v 7` |
| ★29 | `items/farm-seeds.png` | Sachet de graines | `a small paper seed packet with sprouting seeds and a tiny green sprout, cute pastel style` |
| ★30 | `items/farm-coins.png` | Bourse de pièces | `a cute small cloth coin purse with gold coins, pastel cozy style` |

Pour Pixel Farm, remplace dans le suffixe `glossy highlights, vibrant saturated colors` par
`soft pastel colors, rounded cute shapes, cozy`.

---

## 4. Site (accueil, parcours, états vides)

Style : mêmes rendus 3D stylisés, mais scènes simples sur fond transparent. Suffixe :
`, stylized 3D illustration, soft lighting, vibrant but friendly colors, isolated on plain flat light grey background, no text --style raw --v 7`

| # | Fichier | Où | Prompt (+ suffixe) |
|---|---|---|---|
| ★31 | `site/hero.png` (1600×1200) | Accueil, bandeau du haut | `a smartphone floating at an angle with game rewards bursting out of the screen: green gems, gold coins, a treasure chest and a crown --ar 4:3` |
| ★32 | `site/step-search.png` (800²) | Accueil, étape 1 « Cherchez votre jeu » | `a large magnifying glass over a small game controller --ar 1:1` |
| ★33 | `site/step-link.png` (800²) | Étape 2 « Liez votre compte » | `two glossy chain links connecting a smartphone and a game controller --ar 1:1` |
| ★34 | `site/step-delivered.png` (800²) | Étape 3 « Achetez, c'est livré » | `a delivery parcel box opening with gems and coins flying out toward a smartphone --ar 1:1` |
| ☆35 | `site/studios-hero.png` (1600×1200) | Page « Pour les studios » | `a game developer desk with a monitor showing a game store, a piggy bank full of gold coins and a rising green chart arrow --ar 4:3` |
| ☆36 | `site/empty-search.png` (800²) | Aucun résultat de recherche | `a cute confused little robot holding an empty magnifying glass --ar 1:1` |
| ☆37 | `site/empty-purchases.png` (800²) | « Mes achats » vide | `an empty open treasure chest with a single sparkle inside --ar 1:1` |
| ☆38 | `site/empty-links.png` (800²) | Aucun jeu lié | `a game controller with a loose unplugged cable, cute --ar 1:1` |
| ★39 | `site/purchase-success.png` (800²) | Page de succès d'achat | `a treasure chest bursting open with confetti, gems and coins, celebration --ar 1:1` |
| ☆40 | `site/not-found.png` (800²) | Page 404 | `a cute lost little robot holding a torn treasure map --ar 1:1` |

---

## 5. Ordre conseillé

1. **Calage du style** : génère ★3 (coffre de gemmes) jusqu'à obtenir LE rendu voulu → c'est ta référence `--sref`.
2. Les ★ restants (≈ 20 images) : de quoi refaire entièrement la démo Crystal Clash + Pixel Farm et l'accueil.
3. Les ☆ ensuite, pour la bibliothèque complète proposée aux studios.

Envoie-moi les fichiers (ou dépose-les dans `apps/web/public/art/`) : je les détoure / compresse si besoin, les
branche dans le seed et la boutique, et j'ajoute la bibliothèque générique au sélecteur d'images de l'éditeur.
