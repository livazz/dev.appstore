import type { ItemStyle, LayoutId } from '@wolleen/core';

/** Seuils de contraste minimal (ratio WCAG) par élément de texte de la carte. */
export interface ContrastThresholds {
  /** Titre : gros et gras → seuil « grand texte » WCAG AA (3:1) par défaut. */
  title: number;
  /** Sous-titre : petit texte → seuil WCAG AA normal (4,5:1) par défaut. */
  subtitle: number;
  /** Prix : pastille en gras → 3:1 par défaut. */
  price: number;
}

export const DEFAULT_CONTRAST: ContrastThresholds = { title: 3, subtitle: 4.5, price: 3 };

/** Layout utilisé quand le modèle hésite ou renvoie une valeur invalide (même défaut que l'éditeur). */
export const DEFAULT_LAYOUT: LayoutId = 4;

/** En dessous de cette confiance globale, le layout proposé est remplacé par DEFAULT_LAYOUT. */
export const MIN_LAYOUT_CONFIDENCE = 0.35;

export const TITLE_MAX_LENGTH = 40;
export const SUBTITLE_MAX_LENGTH = 60;

/** Code machine d'un avertissement de post-traitement (affichable dans l'éditeur). */
export type StyleWarningCode =
  | 'invalid_payload'
  | 'invalid_layout'
  | 'low_confidence_layout'
  | 'invalid_color'
  | 'invalid_bg_type'
  | 'invalid_boolean'
  | 'border_width_clamped'
  | 'invalid_border_width'
  | 'derived_bg2'
  | 'contrast_fixed'
  | 'outline_enabled'
  | 'text_truncated';

export interface StyleWarning {
  code: StyleWarningCode;
  /** Champ concerné (`layout`, `style.titleColor`, `title`…). */
  field: string;
  /** Message en français destiné à l'utilisateur studio. */
  message: string;
}

/** Contraste final mesuré pour chaque texte (pire cas sur le fond effectif). */
export interface ContrastReport {
  title: number;
  subtitle: number;
  price: number;
}

/** Résultat du post-traitement : directement utilisable par `ItemCard` / la modale article. */
export interface CardStyleSuggestion {
  layout: LayoutId;
  style: ItemStyle;
  /** Titre lu sur la capture (null si aucun texte fiable). */
  title: string | null;
  /** Sous-titre lu sur la capture (null si absent). */
  subtitle: string | null;
  /** Confiance globale déclarée par le modèle, bornée à [0, 1] (null si absente ou invalide). */
  confidence: number | null;
  contrast: ContrastReport;
  warnings: StyleWarning[];
}

export interface NormalizeOptions {
  /** Style de repli champ par champ (par défaut DEFAULT_ITEM_STYLE). */
  fallbackStyle?: ItemStyle;
  fallbackLayout?: LayoutId;
  contrast?: Partial<ContrastThresholds>;
  /** Confiance sous laquelle le layout retombe sur `fallbackLayout`. */
  minLayoutConfidence?: number;
}
