/**
 * Appel à l'API Claude (vision + sortie structurée JSON) puis post-traitement pur.
 *
 * Usage serveur uniquement : la clé `ANTHROPIC_API_KEY` ne doit jamais atteindre le navigateur.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AiStyleError } from './errors';
import { prepareImage, type ImageInput } from './image';
import { normalizeCardStyle } from './normalize';
import { CARD_STYLE_SCHEMA, SYSTEM_PROMPT, buildUserText } from './prompt';
import type { CardStyleSuggestion, NormalizeOptions } from './types';

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type Effort = NonNullable<NonNullable<CreateParams['output_config']>['effort']>;

/** Sous-ensemble du client Anthropic utilisé ici : permet d'injecter un client simulé en test. */
export interface AiStyleClient {
  beta: { messages: { create(body: CreateParams): PromiseLike<BetaMessage> } };
}

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_EFFORT: Effort = 'medium';

/** Modèles qui acceptent le repli serveur `fallbacks: "default"` en cas de refus de sécurité. */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface GenerateOptions extends NormalizeOptions {
  /** Client injecté (tests, configuration partagée). Par défaut `new Anthropic()` (lit ANTHROPIC_API_KEY). */
  client?: AiStyleClient;
  /** Modèle Claude (défaut : claude-opus-5-5). */
  model?: string;
  /** Effort de raisonnement (défaut : medium). `low` réduit coût et latence. */
  effort?: Effort;
  /** Repli serveur automatique si le modèle refuse la requête (défaut : true, ignoré si non supporté). */
  fallbacks?: boolean;
  /** Contexte libre fourni par le studio (nom du jeu, de l'article…), 500 caractères max. */
  context?: string;
  maxTokens?: number;
}

export interface GenerateResult extends CardStyleSuggestion {
  /** Sortie JSON brute du modèle avant post-traitement (pour le débogage / la télémétrie). */
  raw: unknown;
  /** Modèle qui a effectivement répondu (peut différer en cas de repli). */
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  /** Coût estimé en dollars US d'après la grille publique (null si modèle inconnu). */
  estimatedCostUsd: number | null;
}

/** Tarifs publics en $ par million de jetons (entrée, sortie) — à mettre à jour si la grille change. */
export const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number },
): number | null {
  const p = PRICING_USD_PER_MTOK[model];
  if (!p) return null;
  const input =
    usage.inputTokens * p.input + (usage.cacheWriteTokens ?? 0) * p.input * 1.25 + (usage.cacheReadTokens ?? 0) * p.input * 0.1;
  return Math.round(((input + usage.outputTokens * p.output) / 1e6) * 1e6) / 1e6;
}

/** Construit la requête Messages (exportée pour les tests et le débogage). */
export function buildRequest(input: ImageInput, options: GenerateOptions = {}): CreateParams {
  const image = prepareImage(input);
  const model = options.model ?? DEFAULT_MODEL;
  const source: Anthropic.Beta.Messages.BetaImageBlockParam['source'] =
    image.type === 'url'
      ? { type: 'url', url: image.url }
      : { type: 'base64', media_type: image.media_type, data: image.data };

  const useFallbacks = (options.fallbacks ?? true) && FALLBACK_MODELS.has(model);
  return {
    model,
    max_tokens: options.maxTokens ?? 16000,
    system: SYSTEM_PROMPT,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: options.effort ?? DEFAULT_EFFORT,
      format: { type: 'json_schema', schema: CARD_STYLE_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source },
          { type: 'text', text: buildUserText(options.context) },
        ],
      },
    ],
    ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  };
}

/** Extrait et parse le JSON de la réponse ; lève une AiStyleError explicite sinon. */
export function parseResponse(message: BetaMessage): unknown {
  if (message.stop_reason === 'refusal') {
    throw new AiStyleError('refusal', "Le modèle a refusé d'analyser cette image.", {
      category: message.stop_details?.category ?? null,
    });
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AiStyleError('truncated', 'Réponse du modèle tronquée (max_tokens atteint).');
  }
  const text = message.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new AiStyleError('invalid_output', 'Réponse du modèle vide.');
  try {
    return JSON.parse(text);
  } catch {
    throw new AiStyleError('invalid_output', 'Réponse du modèle non JSON.', { text: text.slice(0, 200) });
  }
}

/**
 * Génère `{ layout, style }` + titre / sous-titre suggérés à partir d'une capture d'un article en jeu.
 *
 * Lève `AiStyleError` (image invalide, refus, sortie illisible) ou les erreurs typées du SDK Anthropic
 * (`Anthropic.RateLimitError`, `Anthropic.AuthenticationError`…) que l'appelant traduit pour l'UI.
 */
export async function generateCardStyle(input: ImageInput, options: GenerateOptions = {}): Promise<GenerateResult> {
  const body = buildRequest(input, options);
  const client: AiStyleClient = options.client ?? new Anthropic();
  const message = await client.beta.messages.create(body);
  const raw = parseResponse(message);
  const suggestion = normalizeCardStyle(raw, options);

  const u = message.usage;
  const usage = {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
  };
  const model = message.model || body.model;
  return { ...suggestion, raw, model, usage, estimatedCostUsd: estimateCostUsd(model, usage) };
}
