# Toutes les illustrations — prompts prêts à coller


74 illustrations : 46 objets de boutique, 6 icônes, 9 pour les jeux de démo, 13 pour le site.

Chaque bloc est **complet** : copie-colle tel quel dans Midjourney (v7). Il y a aussi
[prompts-tous.txt](prompts-tous.txt), un prompt par ligne, pour enchaîner plus vite.

## Mode d'emploi

1. **Calage du style** : lance le prompt **O-03 (coffre de gemmes)** sans `--sref STYLE` plusieurs fois, jusqu'à LE rendu voulu.
2. Copie l'URL de cette image, puis dans tous les autres prompts **remplace `STYLE` par cette URL** (rechercher/remplacer
   dans prompts-tous.txt) : toute la collection aura le même style.
3. Upscale, puis **détoure** les objets et icônes (fond transparent) : remove.bg, Photoshop, ou Recraft qui exporte
   directement en transparent. Ne détoure pas les icônes de jeu ni les images d'ambiance.
4. Enregistre en PNG avec le **nom de fichier indiqué** et dépose tout dans `apps/web/public/art/` : je branche ensuite
   la bibliothèque dans l'éditeur (choix de visuel pour les studios), la démo et le site.

**Règles** : pas de texte, chiffre, cadre ni carte dans les images (la boutique affiche titre, quantité et prix).
Formats : objets et icônes 1024 × 1024 ; bannières 2400 × 1000 ; illustrations du site au ratio indiqué.

### Variantes de style par thème (facultatif)

Les prompts ci-dessous sont dans le style **Arcade** (contours épais, couleurs vives). Pour une bibliothèque adaptée
à un autre thème, remplace dans chaque prompt `bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights`
par :

| Thème | Remplacement |
|---|---|
| Premium sombre | `dark fantasy style, ornate detailed 3D render, gold filigree accents, rich jewel tones, magical glow, cinematic rim light` |
| Casual doux | `cute casual style, soft rounded 3D render, pastel colors, gentle shading, cozy and friendly` |
| Épuré | `clean minimal 3D render, smooth matte materials, simple geometric shapes, soft studio lighting, modern product style` |


## Monnaie 1 — Gemmes vertes (4 tailles)

**O-01 — `items/gems-1.png` — Poignée de gemmes**
```
a small handful of three big emerald green faceted gems, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-02 — `items/gems-2.png` — Sac de gemmes**
```
a small brown leather pouch tied with a rope, overflowing with big emerald green faceted gems, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-03 — `items/gems-3.png` — Coffre de gemmes** *(référence de style : à générer en premier)*
```
an open purple treasure chest with thick gold trim overflowing with big emerald green faceted gems, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7
```

**O-04 — `items/gems-4.png` — Montagne de gemmes**
```
a huge glowing mountain of big emerald green faceted gems spilling out of a giant golden chest, sparkles, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```


## Monnaie 2 — Pièces d'or (4 tailles)

**O-05 — `items/gold-1.png` — Quelques pièces**
```
a small stack of four thick shiny gold coins with an embossed star, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-06 — `items/gold-2.png` — Piles de pièces**
```
three tall stacks of thick shiny gold coins with an embossed star, one coin standing on its edge in front, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-07 — `items/gold-3.png` — Sac d'or**
```
a bulging burlap sack overflowing with thick shiny gold coins, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-08 — `items/gold-4.png` — Coffre d'or**
```
an open wooden treasure chest with iron bands overflowing with thick shiny gold coins, sparkles, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```


## Monnaie 3 — Cristaux bleus / diamants (4 tailles)

**O-09 — `items/crystals-1.png` — Quelques cristaux**
```
three glowing sky blue diamond crystals, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-10 — `items/crystals-2.png` — Bourse de cristaux**
```
a small blue velvet pouch overflowing with glowing sky blue diamond crystals, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-11 — `items/crystals-3.png` — Caisse de cristaux**
```
an open wooden crate full of glowing sky blue diamond crystals, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-12 — `items/crystals-4.png` — Montagne de cristaux**
```
a huge pile of glowing sky blue diamond crystals around a giant crystal cluster, sparkles, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```


## Monnaies et ressources secondaires

**O-13 — `items/silver.png` — Pièces d'argent**
```
a stack of thick shiny silver coins, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-14 — `items/tokens.png` — Jetons**
```
a pile of round purple game tokens with a star symbol, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-15 — `items/stars.png` — Étoiles**
```
three shiny golden stars, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-16 — `items/elixir.png` — Élixir**
```
a glass flask full of glowing pink magical elixir, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-17 — `items/energy.png` — Énergie**
```
a glowing yellow lightning bolt energy crystal, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-18 — `items/lives.png` — Vies**
```
a glossy red heart with a soft shine, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-19 — `items/key.png` — Clé**
```
an ornate golden key with a blue gem, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-20 — `items/ticket.png` — Ticket**
```
a golden VIP ticket with star decorations and a torn edge, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```


## Coffres (raretés et états)

**O-21 — `items/chest-common.png` — Coffre commun**
```
a closed wooden treasure chest with iron bands, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-22 — `items/chest-rare.png` — Coffre rare**
```
a closed blue and silver treasure chest, faint blue magical glow, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-23 — `items/chest-epic.png` — Coffre épique**
```
a closed purple and gold treasure chest, purple magical glow, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-24 — `items/chest-legendary.png` — Coffre légendaire**
```
a closed ornate golden treasure chest with orange magical glow leaking from the lid, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-25 — `items/chest-mystery.png` — Coffre mystère**
```
a closed dark treasure chest with a glowing question mark shaped lock, mysterious purple smoke, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-26 — `items/chest-open.png` — Coffre ouvert**
```
an open treasure chest bursting with light rays, gems, coins and confetti flying out, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```


## Cadeaux et packs

**O-27 — `items/starter-pack.png` — Pack débutant**
```
a blue gift box with a big shiny golden ribbon bow, a few emerald green gems and gold coins bursting out of the top, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-28 — `items/gift-small.png` — Petit cadeau**
```
a small red gift box with a white ribbon bow, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-29 — `items/gift-big.png` — Gros cadeau**
```
a large stack of three colorful gift boxes with big ribbon bows, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-30 — `items/daily-gift.png` — Cadeau quotidien**
```
a cute gift box with a small calendar tag and a clock charm, sparkles, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-31 — `items/bundle.png` — Lot**
```
a wooden crate full of mixed rewards: emerald green gems, gold coins and a small chest, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-32 — `items/mega-bundle.png` — Méga pack**
```
a giant golden crate overflowing with gems, coins, crystals, a crown and a chest, sparkles and light rays, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```


## Couronnes, pass et abonnements

**O-33 — `items/pass.png` — Pass Royal (couronne)**
```
a royal golden crown with a big ruby in the center and blue sapphires, resting on a small red velvet cushion, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-34 — `items/crown-silver.png` — Couronne argent**
```
a silver crown with blue gems, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-35 — `items/vip.png` — Badge VIP**
```
a shiny golden VIP shield badge with a star and laurels, no letters, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-36 — `items/season-pass.png` — Pass de saison**
```
a glossy golden season pass card with a crown emblem and colorful keys hanging from it, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-37 — `items/subscription-scroll.png` — Abonnement (parchemin)**
```
a rolled royal parchment scroll with a red wax seal and gold ribbon, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-38 — `items/trophy.png` — Trophée**
```
a shiny golden trophy cup with handles and a star, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```


## Boosts, objets utiles et cosmétiques

**O-39 — `items/booster-x2.png` — Boost ×2**
```
a round glass potion bottle with swirling glowing orange liquid and a cork, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-40 — `items/xp-boost.png` — Boost d'expérience**
```
a glowing green potion bottle with a star shaped stopper, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-41 — `items/speed-up.png` — Accélérateur**
```
a golden hourglass with glowing blue sand and small wings, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-42 — `items/shield.png` — Bouclier**
```
a sturdy round wooden shield with metal rim and a gold emblem, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-43 — `items/remove-ads.png` — Sans publicité**
```
a blue shield with a crossed-out megaphone symbol, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-44 — `items/skin.png` — Skin / tenue**
```
a mannequin bust wearing a stylish golden armor chest piece, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-45 — `items/emote.png` — Emote**
```
a cute round yellow smiling face emoji with sparkles, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**O-46 — `items/card-pack.png` — Paquet de cartes**
```
a sealed shiny foil card pack with a lightning emblem, a few cards peeking out, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```


## Petites icônes de monnaie (affichées à côté des quantités)

**I-01 — `icons/gem.png` — Icône gemme**
```
a single emerald green faceted gem, simple bold game currency icon, chunky stylized 3D render, thick dark outline, vibrant saturated colors, glossy highlight, centered, front view, isolated on plain flat light grey background, no text, no numbers, no frame --ar 1:1 --style raw --v 7 --sref STYLE
```

**I-02 — `icons/coin.png` — Icône pièce**
```
a single thick shiny gold coin with an embossed star, simple bold game currency icon, chunky stylized 3D render, thick dark outline, vibrant saturated colors, glossy highlight, centered, front view, isolated on plain flat light grey background, no text, no numbers, no frame --ar 1:1 --style raw --v 7 --sref STYLE
```

**I-03 — `icons/crystal.png` — Icône cristal**
```
a single glowing sky blue diamond crystal, simple bold game currency icon, chunky stylized 3D render, thick dark outline, vibrant saturated colors, glossy highlight, centered, front view, isolated on plain flat light grey background, no text, no numbers, no frame --ar 1:1 --style raw --v 7 --sref STYLE
```

**I-04 — `icons/energy.png` — Icône énergie**
```
a single yellow lightning bolt, simple bold game currency icon, chunky stylized 3D render, thick dark outline, vibrant saturated colors, glossy highlight, centered, front view, isolated on plain flat light grey background, no text, no numbers, no frame --ar 1:1 --style raw --v 7 --sref STYLE
```

**I-05 — `icons/heart.png` — Icône vie**
```
a single glossy red heart, simple bold game currency icon, chunky stylized 3D render, thick dark outline, vibrant saturated colors, glossy highlight, centered, front view, isolated on plain flat light grey background, no text, no numbers, no frame --ar 1:1 --style raw --v 7 --sref STYLE
```

**I-06 — `icons/star.png` — Icône étoile**
```
a single shiny golden star, simple bold game currency icon, chunky stylized 3D render, thick dark outline, vibrant saturated colors, glossy highlight, centered, front view, isolated on plain flat light grey background, no text, no numbers, no frame --ar 1:1 --style raw --v 7 --sref STYLE
```


## Jeux de démo (Crystal Clash : Arcade ; Pixel Farm : Casual)

**J-01 — `games/crystal-clash/icon.png` — Crystal Clash — icône (1024², pas de détourage)**
```
mobile game app icon, a heroic knight helmet with a blue plume in front of a giant glowing green crystal, crossed swords behind, bold cartoon style, chunky stylized 3D render, thick dark outlines, vibrant saturated colors, dramatic lighting, full bleed square composition filling the whole canvas, no text, no letters --ar 1:1 --style raw --v 7 --sref STYLE
```

**J-02 — `games/crystal-clash/banner.png` — Crystal Clash — emblème/bannière (2400×1000, détourer)**
```
game logo emblem, a golden shield with a glowing green crystal in the center, two crossed swords behind it, small green gems flying around, bold cartoon style, chunky stylized 3D render, thick dark outlines, vibrant saturated colors, glossy highlights, centered, wide composition, isolated on plain flat light grey background, no text, no letters --ar 12:5 --style raw --v 7 --sref STYLE
```

**J-03 — `games/crystal-clash/hero.png` — Crystal Clash — image d'ambiance (2400×1000)**
```
wide fantasy battle arena between two castles, giant glowing green crystals, small cartoon knights and wizards clashing in the middle, blue sky with clouds, bold cartoon style, chunky stylized 3D render, thick dark outlines, vibrant saturated colors mobile game key art, empty center area for a logo, no text --ar 12:5 --style raw --v 7 --sref STYLE
```

**J-04 — `games/pixel-farm/icon.png` — Pixel Farm — icône (1024², pas de détourage)**
```
mobile game app icon, a cute smiling red barn with a big sunflower and a yellow chick, soft pastel colors, rounded cute shapes, cozy stylized 3D render, full bleed square composition, no text --ar 1:1 --style raw --v 7
```

**J-05 — `games/pixel-farm/banner.png` — Pixel Farm — bannière (2400×1000)**
```
cozy pastel farm landscape, red barn, fields of crops, windmill, cute animals, fluffy clouds, soft morning light, stylized 3D mobile game key art, empty center area for a logo, no text --ar 12:5 --style raw --v 7
```

**J-06 — `items/farm-seeds.png` — Pixel Farm — sachet de graines (détourer)**
```
a small paper seed packet with seeds spilling and a tiny green sprout, mobile game shop item icon, soft pastel colors, rounded cute shapes, cozy stylized 3D render, centered, isolated on plain flat light grey background, no text, no frame --ar 1:1 --style raw --v 7
```

**J-07 — `items/farm-coins.png` — Pixel Farm — bourse de pièces (détourer)**
```
a cute small cloth coin purse with gold coins, mobile game shop item icon, soft pastel colors, rounded cute shapes, cozy stylized 3D render, centered, isolated on plain flat light grey background, no text, no frame --ar 1:1 --style raw --v 7
```

**J-08 — `items/farm-tractor.png` — Pixel Farm — tracteur (boost)**
```
a cute little red toy tractor, mobile game shop item icon, soft pastel colors, rounded cute shapes, cozy stylized 3D render, centered, isolated on plain flat light grey background, no text, no frame --ar 1:1 --style raw --v 7
```

**J-09 — `items/farm-fertilizer.png` — Pixel Farm — engrais**
```
a cute green bag of magic fertilizer with sparkles and a leaf logo, mobile game shop item icon, soft pastel colors, rounded cute shapes, cozy stylized 3D render, centered, isolated on plain flat light grey background, no text, no frame --ar 1:1 --style raw --v 7
```


> Pixel Farm a son propre style (pastel) : génère d'abord J-06, puis utilise son URL comme `--sref` pour J-04 à J-09.


## Site (accueil, parcours, états vides)

**S-01 — `site/hero.png` — Accueil — image principale (1600×1200)**
```
a smartphone floating at an angle with game rewards bursting out of the screen: green gems, gold coins, a treasure chest and a crown, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 4:3 --sref STYLE
```

**S-02 — `site/step-search.png` — Étape 1 « Cherchez votre jeu »**
```
a large magnifying glass over a small game controller, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 1:1 --sref STYLE
```

**S-03 — `site/step-link.png` — Étape 2 « Liez votre compte »**
```
two glossy chain links connecting a smartphone and a game controller, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 1:1 --sref STYLE
```

**S-04 — `site/step-delivered.png` — Étape 3 « C'est livré »**
```
a delivery parcel box opening with gems and coins flying out toward a smartphone, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 1:1 --sref STYLE
```

**S-05 — `site/purchase-success.png` — Succès d'achat**
```
a treasure chest bursting open with confetti, gems and coins, celebration, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 1:1 --sref STYLE
```

**S-06 — `site/studios-hero.png` — Page « Pour les studios » (1600×1200)**
```
a game developer desk with a monitor showing a game shop, a piggy bank full of gold coins and a rising green chart arrow, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 4:3 --sref STYLE
```

**S-07 — `site/loyalty.png` — Points de fidélité**
```
a glowing golden loyalty badge medal with a star, surrounded by small coins and sparkles, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 1:1 --sref STYLE
```

**S-08 — `site/empty-search.png` — Aucun résultat**
```
a cute confused little robot holding an empty magnifying glass, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 1:1 --sref STYLE
```

**S-09 — `site/empty-purchases.png` — « Mes achats » vide**
```
an empty open treasure chest with a single sparkle inside, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 1:1 --sref STYLE
```

**S-10 — `site/empty-links.png` — Aucun jeu lié**
```
a game controller with a loose unplugged cable, cute, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 1:1 --sref STYLE
```

**S-11 — `site/not-found.png` — Page 404**
```
a cute lost little robot holding a torn treasure map, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 1:1 --sref STYLE
```

**S-12 — `site/report.png` — Signalement envoyé**
```
a friendly shield with a check mark and a small flag, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 1:1 --sref STYLE
```

**S-13 — `site/email-verify.png` — Vérifiez votre e-mail**
```
a cute envelope with a glowing check mark seal, flying, stylized 3D illustration, bold cartoon style, thick dark outlines, vibrant friendly colors, soft lighting, isolated on plain flat light grey background, no text --style raw --v 7 --ar 1:1 --sref STYLE
```
