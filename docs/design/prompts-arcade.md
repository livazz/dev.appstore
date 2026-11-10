# Prompts Midjourney — thème Arcade (Crystal Clash)

Chaque bloc est **complet** : copie-colle tel quel dans Midjourney (v7). Pas besoin d'ajouter de suffixe.
Style visé : gros objets 3D façon jeux d'action mobiles — formes épaisses, **contour sombre marqué**, couleurs
saturées, reflets brillants. La boutique dessine déjà le fond coloré, les rayons, le titre, la quantité et le prix :
l'image ne contient **que l'objet**.

## Mode d'emploi (5 minutes)

1. Lance d'abord le prompt **n° 1** (coffre de gemmes) plusieurs fois jusqu'à obtenir LE rendu que tu aimes.
2. Copie l'URL de cette image (clic droit → *Copier l'adresse de l'image*).
3. Pour tous les autres prompts, remplace `--sref STYLE` à la fin par `--sref <l'URL copiée>` : toutes les images
   auront le même style. (Pour le n° 1, supprime simplement `--sref STYLE`.)
4. Upscale l'image retenue, puis **détoure-la** (fond transparent) : remove.bg, Photoshop (« Supprimer l'arrière-plan »)
   ou l'outil de détourage de Midjourney si disponible.
5. Enregistre en PNG avec le nom indiqué et dépose les fichiers dans `apps/web/public/art/`. Je m'occupe du reste
   (compression, branchement dans la boutique et dans la démo).

> Alternative sans détourage : **Recraft** (recraft.ai) exporte directement en PNG transparent ; colle les mêmes
> prompts en retirant tout ce qui commence par `--`.

---

## Objets de la boutique (1024 × 1024, fond transparent après détourage)

**1 — `items/gems-3.png` — Coffre de gemmes** *(référence de style)*
```
an open purple treasure chest with thick gold trim overflowing with big emerald green faceted gems, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7
```

**2 — `items/gems-1.png` — Poignée de gemmes**
```
a small handful of three big emerald green faceted gems, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**3 — `items/gems-2.png` — Sac de gemmes**
```
a small brown leather pouch tied with a rope, overflowing with big emerald green faceted gems, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**4 — `items/gems-4.png` — Montagne de gemmes**
```
a huge glowing mountain of big emerald green faceted gems spilling out of a giant golden chest, sparkles, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**5 — `items/gold-1.png` — Quelques pièces**
```
a small stack of four thick shiny gold coins with an embossed star, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**6 — `items/gold-2.png` — Piles de pièces**
```
three tall stacks of thick shiny gold coins with an embossed star, one coin standing on its edge in front, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**7 — `items/gold-3.png` — Sac d'or**
```
a bulging burlap sack overflowing with thick shiny gold coins, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**8 — `items/pass.png` — Pass Royal (abonnement)**
```
a royal golden crown with a big ruby in the center and blue sapphires, resting on a small red velvet cushion, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**9 — `items/starter-pack.png` — Pack débutant**
```
a blue gift box with a big shiny golden ribbon bow, a few emerald green gems and gold coins bursting out of the top, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**10 — `items/chest-legendary.png` — Coffre légendaire** *(optionnel)*
```
a closed ornate golden treasure chest with orange magical glow leaking from the lid, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

**11 — `items/booster-x2.png` — Boost** *(optionnel)*
```
a round glass potion bottle with swirling glowing orange liquid and a cork, mobile game shop item icon, bold cartoon style, chunky stylized 3D render, thick dark outline around the silhouette, vibrant saturated colors, glossy specular highlights, soft rim light, centered, three-quarter view, isolated on plain flat light grey background, no text, no numbers, no frame, no border, no card --ar 1:1 --style raw --v 7 --sref STYLE
```

---

## Identité du jeu de démo

**12 — `games/crystal-clash/icon.png` — Icône (1024 × 1024, PAS de détourage)**
```
mobile game app icon, a heroic knight helmet with a blue plume in front of a giant glowing green crystal, crossed swords behind, bold cartoon style, chunky stylized 3D render, thick dark outlines, vibrant saturated colors, dramatic lighting, full bleed square composition filling the whole canvas, no text, no letters --ar 1:1 --style raw --v 7 --sref STYLE
```

**13 — `games/crystal-clash/banner.png` — Bannière (2400 × 1000, fond transparent après détourage)**
Logo-titre du jeu, affiché en haut de la boutique (comme le logo « Brawl Stars » en haut de leur store).
```
game logo emblem, a golden shield with a glowing green crystal in the center, two crossed swords behind it, small green gems flying around, bold cartoon style, chunky stylized 3D render, thick dark outline, vibrant saturated colors, glossy highlights, centered, wide composition, isolated on plain flat light grey background, no text, no letters --ar 12:5 --style raw --v 7 --sref STYLE
```
> Le nom « Crystal Clash » en lettres 3D : Midjourney écrit mal le texte. Génère l'emblème seul ; j'ajoute le nom en
> typographie dans la page (ou utilise Ideogram, très bon pour le texte : `3D cartoon game logo text "CRYSTAL CLASH", chunky letters, white with thick dark outline and gold bevel, transparent background`).

**14 — `games/crystal-clash/hero.png` — Image d'ambiance plein cadre (2400 × 1000, PAS de détourage)** *(optionnel)*
Pour un en-tête spectaculaire derrière le logo, comme les personnages en haut du store Brawl Stars.
```
wide fantasy battle arena between two castles, giant glowing green crystals, small cartoon knights and wizards clashing in the middle, blue sky with clouds, bold cartoon style, chunky stylized 3D mobile game key art, thick dark outlines, vibrant saturated colors, empty center area for a logo, no text --ar 12:5 --style raw --v 7 --sref STYLE
```

---

## Récapitulatif des fichiers

| # | Fichier | Indispensable |
|---|---|---|
| 1 | `items/gems-3.png` | oui |
| 2 | `items/gems-1.png` | oui |
| 3 | `items/gems-2.png` | oui |
| 4 | `items/gems-4.png` | non |
| 5 | `items/gold-1.png` | oui |
| 6 | `items/gold-2.png` | oui |
| 7 | `items/gold-3.png` | non |
| 8 | `items/pass.png` | oui |
| 9 | `items/starter-pack.png` | oui |
| 10 | `items/chest-legendary.png` | non |
| 11 | `items/booster-x2.png` | non |
| 12 | `games/crystal-clash/icon.png` | oui |
| 13 | `games/crystal-clash/banner.png` | oui |
| 14 | `games/crystal-clash/hero.png` | non |

Les autres thèmes (Premium sombre, Casual doux, Épuré) et le site ont leur liste dans
[illustrations.md](illustrations.md) ; dis-moi lequel tu veux ensuite et je te fais le même fichier prêt à coller.
