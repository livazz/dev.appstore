import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { AiStyleError } from './errors';
import { buildRequest, estimateCostUsd, generateCardStyle, type AiStyleClient } from './generate';
import { MAX_IMAGE_BASE64_BYTES, detectImageMediaType, prepareImage } from './image';
import { isHexColor } from './color';

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

/** Faux PNG : signature valide + quelques octets (le contenu n'est jamais décodé côté test). */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

const GOLD_OUTPUT = {
  layout: 2,
  confidence: 0.85,
  title: "Pile d'or",
  subtitle: '10 000 pièces',
  style: {
    bgType: 'radial',
    bg1: '#fff6c9',
    bg2: '#f2c14e',
    titleColor: '#ffffff', // illisible sur fond clair, sans contour → doit être corrigé
    titleBg: 'transparent',
    titleOutline: false,
    titleShadow: true,
    subtitleColor: '#6b4a00',
    priceColor: '#ffffff',
    priceBg: '#2e7d32',
    priceOutline: false,
    priceShadow: false,
    borderWidth: 3,
    borderColor: '#b8860b',
    rounded: true,
    shadow: true,
  },
};

function message(partial: Partial<BetaMessage> & { text?: string }): BetaMessage {
  const { text, ...rest } = partial;
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    stop_details: null,
    content: text === undefined ? [] : [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text, citations: null }],
    usage: { input_tokens: 1800, output_tokens: 700, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    ...rest,
  } as unknown as BetaMessage;
}

/** Client simulé : enregistre la requête, aucun appel réseau. */
function mockClient(reply: BetaMessage | Error) {
  const create = vi.fn(async (_body: CreateParams) => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  const client: AiStyleClient = { beta: { messages: { create } } };
  return { client, create };
}

describe('generateCardStyle (client simulé)', () => {
  it('envoie une requête vision + sortie structurée et post-traite la réponse', async () => {
    const { client, create } = mockClient(message({ text: JSON.stringify(GOLD_OUTPUT) }));
    const r = await generateCardStyle({ data: PNG }, { client, context: 'Crystal Quest — boutique' });

    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0][0];
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config?.effort).toBe('medium');
    expect(body.output_config?.format?.type).toBe('json_schema');
    expect(body).not.toHaveProperty('temperature');
    expect(body.fallbacks).toBe('default');
    expect(body.betas).toEqual(['server-side-fallback-2026-07-01']);
    const content = body.messages[0].content as Anthropic.Beta.Messages.BetaContentBlockParam[];
    expect(content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png' } });
    expect(content[1]).toMatchObject({ type: 'text' });
    expect((content[1] as { text: string }).text).toContain('Crystal Quest');

    expect(r.layout).toBe(2);
    expect(r.title).toBe("Pile d'or");
    expect(r.subtitle).toBe('10 000 pièces');
    expect(r.style.bg1).toBe('#fff6c9');
    expect(r.style.titleOutline).toBe(true); // blanc conservé, contour noir ajouté
    expect(r.contrast.title).toBeGreaterThanOrEqual(3);
    expect(r.warnings.some((w) => w.field === 'style.titleColor')).toBe(true);
    expect(r.raw).toEqual(GOLD_OUTPUT);
    expect(r.model).toBe('claude-opus-5-5');
    expect(r.usage).toEqual({ inputTokens: 1800, outputTokens: 700, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(r.estimatedCostUsd).toBeCloseTo(0.0212, 6);
  });

  it('applique des valeurs sûres même si le modèle renvoie des valeurs hors bornes', async () => {
    const bad = { ...GOLD_OUTPUT, layout: 9, style: { ...GOLD_OUTPUT.style, borderWidth: 40, bg1: 'doré', priceBg: '#12' } };
    const { client } = mockClient(message({ text: JSON.stringify(bad) }));
    const r = await generateCardStyle({ data: PNG }, { client });
    expect(r.layout).toBe(4);
    expect(r.style.borderWidth).toBe(10);
    expect(isHexColor(r.style.bg1)).toBe(true);
    expect(isHexColor(r.style.priceBg)).toBe(true);
  });

  it("n'ajoute pas le repli serveur pour un modèle qui ne le supporte pas, ou si désactivé", () => {
    const haiku = buildRequest({ data: PNG }, { model: 'claude-haiku-5-5', effort: 'low' });
    expect(haiku).not.toHaveProperty('fallbacks');
    expect(haiku).not.toHaveProperty('betas');
    expect(haiku.output_config?.effort).toBe('low');
    expect(buildRequest({ data: PNG }, { fallbacks: false })).not.toHaveProperty('fallbacks');
  });

  it('transmet une URL HTTPS telle quelle', () => {
    const body = buildRequest({ url: 'https://cdn.wolleen.test/captures/a.png' });
    const content = body.messages[0].content as Anthropic.Beta.Messages.BetaContentBlockParam[];
    expect(content[0]).toEqual({ type: 'image', source: { type: 'url', url: 'https://cdn.wolleen.test/captures/a.png' } });
  });

  it('lève AiStyleError sur refus, troncature ou sortie non JSON', async () => {
    const cases: [BetaMessage, string][] = [
      [message({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'general_harms', explanation: null } as never }), 'refusal'],
      [message({ stop_reason: 'max_tokens', text: '{"layout":' }), 'truncated'],
      [message({ text: 'Voici le style : bleu' }), 'invalid_output'],
      [message({}), 'invalid_output'],
    ];
    for (const [reply, code] of cases) {
      const { client } = mockClient(reply);
      await expect(generateCardStyle({ data: PNG }, { client })).rejects.toMatchObject({ name: 'AiStyleError', code });
    }
  });

  it("propage les erreurs du SDK sans les masquer et n'appelle pas l'API si l'image est invalide", async () => {
    const boom = new Error('rate limited');
    const { client } = mockClient(boom);
    await expect(generateCardStyle({ data: PNG }, { client })).rejects.toBe(boom);

    const ok = mockClient(message({ text: '{}' }));
    await expect(generateCardStyle({ data: new Uint8Array([1, 2, 3]) }, { client: ok.client })).rejects.toBeInstanceOf(AiStyleError);
    expect(ok.create).not.toHaveBeenCalled();
  });
});

describe('prepareImage', () => {
  it('détecte le format par signature', () => {
    expect(detectImageMediaType(PNG)).toBe('image/png');
    expect(detectImageMediaType(JPEG)).toBe('image/jpeg');
    expect(detectImageMediaType(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
    expect(detectImageMediaType(new TextEncoder().encode('RIFF....WEBPVP8 '))).toBe('image/webp');
    expect(detectImageMediaType(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('accepte octets, base64 brut et data URL', () => {
    const b64 = Buffer.from(PNG).toString('base64');
    for (const data of [PNG, PNG.buffer, b64, `data:image/png;base64,${b64}`]) {
      const p = prepareImage({ data });
      expect(p).toEqual({ type: 'base64', media_type: 'image/png', data: b64, bytes: PNG.length });
    }
  });

  it('fait primer la signature sur le type déclaré', () => {
    const p = prepareImage({ data: JPEG, mediaType: 'image/png' });
    expect(p.type === 'base64' && p.media_type).toBe('image/jpeg');
  });

  it('rejette les images invalides, trop lourdes ou non HTTPS', () => {
    const err = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as AiStyleError).code;
      }
      return null;
    };
    expect(err(() => prepareImage({ data: new Uint8Array() }))).toBe('invalid_image');
    expect(err(() => prepareImage({ data: '%%%' }))).toBe('invalid_image');
    expect(err(() => prepareImage({ data: new TextEncoder().encode('<svg/>') }))).toBe('unsupported_media_type');
    const big = new Uint8Array(Math.ceil((MAX_IMAGE_BASE64_BYTES / 4) * 3) + 3);
    big.set(PNG);
    expect(err(() => prepareImage({ data: big }))).toBe('image_too_large');
    expect(err(() => prepareImage({ url: 'http://exemple.test/a.png' }))).toBe('invalid_image');
    expect(err(() => prepareImage({ url: 'pas une url' }))).toBe('invalid_image');
  });
});

describe('estimateCostUsd', () => {
  it('calcule le coût d\'après la grille publique', () => {
    expect(estimateCostUsd('claude-opus-5-5', { inputTokens: 1_000_000, outputTokens: 0 })).toBe(4);
    expect(estimateCostUsd('claude-opus-5-5', { inputTokens: 0, outputTokens: 1_000_000 })).toBe(20);
    expect(estimateCostUsd('claude-haiku-5-5', { inputTokens: 2000, outputTokens: 500 })).toBeCloseTo(0.00045, 8);
    expect(estimateCostUsd('modele-inconnu', { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });
});
