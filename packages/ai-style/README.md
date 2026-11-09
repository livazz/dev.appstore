# @wolleen/ai-style

Génère automatiquement le **style de carte web** d'un article à partir d'une **capture d'écran de la carte dans le jeu**
(les pages « In Game → Template → In Web » des maquettes) :

```ts
{ layout: LayoutId, style: ItemStyle }   // types de @wolleen/core, directement utilisables par ItemCard
+ title / subtitle suggérés (lus sur l'image)
+ contraste mesuré, avertissements, coût estimé
```

Module autonome (phase 3) : **rien n'est branché dans `apps/web`** pour l'instant (voir « Intégration prévue »).

## Fonctionnement

1. **Préparation de l'image** (`prepareImage`) : octets / base64 / data URL ou URL HTTPS ; format détecté par signature
   (PNG, JPEG, WebP, GIF) ; refus au-delà de la limite de 5 Mo de l'API (base64).
2. **Appel Claude** (`generateCardStyle`) : SDK officiel `@anthropic-ai/sdk`, modèle `claude-opus-5-5`, vision +
   **sortie structurée** (`output_config.format` de type `json_schema`) avec réflexion adaptative et effort `medium`.
   Le schéma décrit les 6 mises en page et les 16 champs d'`ItemStyle` ; chaque champ accepte `null` = « je ne sais pas ».
   Le repli serveur `fallbacks: "default"` (bêta `server-side-fallback-2026-07-01`) est activé par défaut : si le modèle
   refuse une requête pour une raison de sécurité, l'API la relance automatiquement sur le modèle de repli recommandé.
3. **Post-traitement pur** (`normalizeCardStyle`, sans zod, ne lève jamais) :
   - couleurs normalisées en `#rrggbb` (accepte `#abc`, `#rrggbbaa`, `rgb()`, quelques noms) ; `titleBg` accepte aussi
     `transparent` ; toute valeur invalide → valeur de `DEFAULT_ITEM_STYLE` + avertissement ;
   - `borderWidth` entier borné à 0–10, `layout` 1–6, booléens et `bgType` vérifiés ;
   - si le modèle hésite (`null`) → valeur par défaut ; si sa confiance globale < 0,35 → layout 4 (défaut de l'éditeur) ;
   - dégradé dont seule la 1ʳᵉ couleur est fiable → 2ᵉ couleur dérivée de la 1ʳᵉ (plutôt qu'un gris sans rapport) ;
   - **contraste minimal WCAG** calculé pour chaque texte sur son fond effectif (bandeau de titre, ou pire cas du dégradé
     de la carte tel que rendu par `ItemCard` ; pastille pour le prix) : titre et prix ≥ 3:1 (grand texte gras),
     sous-titre ≥ 4,5:1 (petit texte). Le contour noir (`titleOutline` / `priceOutline`) compte comme séparation.
     Correction par ordre de discrétion : léger mélange vers le blanc/noir (teinte conservée) → activation du contour
     noir (rendu « cartoon » des jeux) → mélange plus fort → blanc + contour. Les paires texte/fond entièrement issues du
     style par défaut ne sont pas retouchées (choix produit) ;
   - textes nettoyés (espaces, guillemets, caractères invisibles), titre ≤ 40 et sous-titre ≤ 60 caractères,
     sous-titre identique au titre supprimé.

## Usage

```ts
import 'server-only';
import { generateCardStyle, AiStyleError } from '@wolleen/ai-style';
import Anthropic from '@anthropic-ai/sdk';

// ANTHROPIC_API_KEY est lu par le SDK. Code serveur uniquement.
try {
  const r = await generateCardStyle(
    { data: await file.arrayBuffer() },            // ou { url: 'https://…' } / base64 / data URL
    { context: 'Crystal Quest — pack de gemmes' },  // optionnel, indicatif
  );
  r.layout;             // 1–6
  r.style;              // ItemStyle complet et sûr
  r.title, r.subtitle;  // suggestions (null si illisible)
  r.warnings;           // [{ code, field, message }] en français, à afficher dans l'éditeur
  r.contrast;           // { title, subtitle, price } ratios finaux
  r.estimatedCostUsd;   // d'après r.usage et la grille publique
} catch (e) {
  if (e instanceof AiStyleError) {
    // e.code : invalid_image | unsupported_media_type | image_too_large | refusal | truncated | invalid_output
  } else if (e instanceof Anthropic.RateLimitError) {
    // 429 : réessayer plus tard (le SDK a déjà fait 2 tentatives)
  } else if (e instanceof Anthropic.AuthenticationError) {
    // clé absente ou invalide
  } else if (e instanceof Anthropic.APIError) {
    // autre erreur HTTP (e.status)
  } else throw e;
}
```

Options (`GenerateOptions`) : `model`, `effort` (`low` pour réduire coût et latence), `fallbacks` (défaut `true`,
ignoré pour les modèles qui ne le supportent pas), `context`, `maxTokens`, `client` (client injecté),
et celles de `normalizeCardStyle` : `fallbackStyle` (ex. le style du dernier article du jeu), `fallbackLayout`,
`contrast` (seuils), `minLayoutConfidence`.

Post-traitement seul (sans réseau), par exemple pour revalider un style saisi :

```ts
import { normalizeCardStyle } from '@wolleen/ai-style';
const { style, warnings } = normalizeCardStyle(rawJson, { fallbackStyle: lastItem.style });
```

### Tests

```bash
npm test -w @wolleen/ai-style        # vitest, client simulé : aucun appel réseau, aucune clé requise
npm run typecheck -w @wolleen/ai-style
```

## Coût estimé par image

Tarifs publics `claude-opus-5-5` : 4 $ / M jetons en entrée, 20 $ / M en sortie. Une image coûte environ
`largeur × hauteur / 750` jetons (plafonnée vers ~4 800 jetons, côté long ≤ 2 576 px).

| Capture | Jetons image | Entrée totale¹ | Sortie² | Coût estimé |
|---|---|---|---|---|
| Carte recadrée (~400 × 520 px) | ~280 | ~1 400 | ~600–1 200 | **≈ 0,02–0,03 $** |
| Carte en HD (~1080 × 1400 px) | ~2 000 | ~3 100 | ~600–1 200 | **≈ 0,025–0,035 $** |
| Écran de téléphone entier (1170 × 2532 px) | ~3 950 | ~5 000 | ~600–1 200 | **≈ 0,03–0,045 $** |

¹ image + prompt système et schéma (~1 100 jetons). ² JSON (~400 jetons) + réflexion adaptative à l'effort `medium`.

Ordres de grandeur : **2 à 5 centimes par génération** ; avec `effort: 'low'` compter ~30 % de moins.
Recadrer la capture sur l'article avant l'envoi (ex. avec `sharp`, déjà installé dans `apps/web`) divise le coût
d'entrée et améliore la précision des couleurs. Des modèles moins chers existent (`claude-sonnet-5-5` ≈ moitié prix,
`claude-haiku-5-5` < 0,2 centime) via l'option `model`, au prix d'une analyse visuelle moins fine : à évaluer sur des
captures réelles avant d'en changer. Chaque résultat renvoie `usage` et `estimatedCostUsd` pour mesurer le coût réel.

## Intégration prévue dans l'éditeur (non branchée)

Dans la modale article de `/studio/games/[id]` (onglet « Mise en page », à côté de la grille des 6 layouts) :

1. Bouton **« Générer depuis une capture »** → sélecteur de fichier (PNG/JPEG/WebP) ou glisser-déposer / coller.
   Recadrage optionnel côté client sur la carte (meilleur résultat, coût moindre).
2. Envoi à une route serveur, par ex. `POST /api/studio/games/[id]/ai-style` (multipart) :
   `import 'server-only'`, `requireGameAccess(gameId, ['owner', 'admin', 'developer'])`, limite de débit par studio
   (ex. 30 générations / heure), puis `generateCardStyle({ data: bytes }, { fallbackStyle: dernierStyleDuJeu })`.
   Envoyer les octets plutôt qu'une URL d'`/api/uploads` (une URL locale n'est pas joignable par l'API).
3. Réponse `{ layout, style, title, subtitle, warnings, contrast }` → aperçu avec `ItemCard` à côté de la capture,
   avertissements listés (« Titre peu lisible sur son fond : contour noir activé »…).
4. **« Appliquer »** fusionne `layout` + `style` dans le brouillon (annulable) ; titre / sous-titre proposés seulement
   si les champs sont vides (sinon affichés comme suggestions cliquables). Les curseurs restent éditables ensuite.
5. Bouton masqué si `ANTHROPIC_API_KEY` est absent ; erreurs traduites (`image_too_large` → « Image trop lourde,
   recadrez la capture », `RateLimitError` → « Service saturé, réessayez dans une minute »).

À prévoir côté web : ajouter `@wolleen/ai-style` aux dépendances de `apps/web` (et à `transpilePackages` si le paquet
y figure pour `@wolleen/core`), variable `ANTHROPIC_API_KEY` dans l'environnement serveur, et mention dans les CGU
studio que la capture est transmise à Anthropic pour analyse.

## Limites connues

- Les couleurs sont estimées visuellement par le modèle : les dégradés complexes, textures et effets lumineux des jeux
  sont ramenés à 2 couleurs ; le résultat est un **point de départ** éditable, pas une copie au pixel près.
- Le schéma JSON n'a pas encore été validé contre l'API réelle (pas de clé dans l'environnement de développement) :
  faire un premier essai avec une vraie capture avant l'intégration.
- La grille de prix (`PRICING_USD_PER_MTOK`) est codée en dur : à mettre à jour si les tarifs changent.
