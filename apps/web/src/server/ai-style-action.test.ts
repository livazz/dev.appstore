import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_ITEM_STYLE } from '@wolleen/core';
import { createTestDb } from '@wolleen/db/testing';
import type { DB } from '@wolleen/db';
import type { AiStyleClient } from '@wolleen/ai-style';

/*
 * Tests de la Server Action generateStyleFromScreenshot : base en mémoire, session simulée (même règle
 * que requireGameAccess) et client Claude simulé (aucun appel réseau, aucune clé réelle).
 */

const h = vi.hoisted(() => ({ db: null as unknown as DB, currentUser: 'usr_dev' as string | null }));

vi.mock('@wolleen/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wolleen/db')>();
  return {
    ...actual,
    get db() {
      return h.db;
    },
  };
});

vi.mock('./session', async () => {
  const { and, eq, games, studioMembers } = await import('@wolleen/db');
  return {
    requireGameAccess: async (gameId: string, roles?: string[]) => {
      if (!h.currentUser) throw new Error('NEXT_REDIRECT');
      const user = { id: h.currentUser, email: `${h.currentUser}@t.test`, name: h.currentUser };
      const [row] = await h.db
        .select({ studioId: games.studioId, role: studioMembers.role })
        .from(games)
        .innerJoin(studioMembers, and(eq(studioMembers.studioId, games.studioId), eq(studioMembers.userId, user.id)))
        .where(eq(games.id, gameId));
      if (!row || (roles && !roles.includes(row.role))) throw new Error('FORBIDDEN');
      return { user, studioId: row.studioId, role: row.role };
    },
  };
});

const { generateStyleFromScreenshot } = await import('./ai-style-action');
const logic = await import('./ai-style-logic');
const { aiStyleGenerations, games, items, studioMembers, studios, user, eq } = await import('@wolleen/db');

const OUTPUT = {
  layout: 2,
  confidence: 0.9,
  title: "Pile d'or",
  subtitle: '10 000 pièces',
  style: {
    ...DEFAULT_ITEM_STYLE,
    bgType: 'radial',
    bg1: '#fff6c9',
    bg2: '#f2c14e',
    titleColor: '#ffffff',
    titleBg: 'transparent',
    titleOutline: false,
  },
};

type Reply = object | Error;
let reply: Reply;
const create = vi.fn(async (_body: unknown) => {
  if (reply instanceof Error) throw reply;
  return reply;
});
const mockClient = { beta: { messages: { create } } } as unknown as AiStyleClient;

function message(text: string, extra: object = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    stop_details: null,
    content: [{ type: 'text', text, citations: null }],
    usage: { input_tokens: 1800, output_tokens: 700, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    ...extra,
  };
}

let png: Buffer;
let bigPng: Buffer;

function form(bytes: Buffer | null, type = 'image/png') {
  const fd = new FormData();
  if (bytes) fd.set('image', new File([new Uint8Array(bytes)], 'capture.png', { type }));
  return fd;
}

beforeAll(async () => {
  h.db = await createTestDb();
  await h.db.insert(user).values([
    { id: 'usr_dev', name: 'Dev', email: 'dev@t.test' },
    { id: 'usr_fin', name: 'Finance', email: 'fin@t.test' },
    { id: 'usr_other', name: 'Autre', email: 'other@t.test' },
  ]);
  await h.db.insert(studios).values([
    { id: 'std_a', name: 'Studio A', slug: 'studio-a' },
    { id: 'std_b', name: 'Studio B', slug: 'studio-b' },
  ]);
  await h.db.insert(studioMembers).values([
    { studioId: 'std_a', userId: 'usr_dev', role: 'developer' },
    { studioId: 'std_a', userId: 'usr_fin', role: 'finance' },
    { studioId: 'std_b', userId: 'usr_other', role: 'owner' },
  ]);
  const theme = { bannerGradient: { from: '#000', to: '#fff' }, grid: { width: 150, height: 200 } } as never;
  await h.db.insert(games).values([
    { id: 'gam_a', studioId: 'std_a', slug: 'jeu-a', name: 'Crystal Quest', theme, webhookSecret: 's', apiKeyHash: 'h', apiKeyPrefix: 'p' },
    { id: 'gam_b', studioId: 'std_b', slug: 'jeu-b', name: 'Jeu B', theme, webhookSecret: 's', apiKeyHash: 'h2', apiKeyPrefix: 'p2' },
  ]);
  await h.db.insert(items).values({
    id: 'itm_1',
    gameId: 'gam_a',
    productId: 'gems',
    title: 'Gemmes',
    priceCents: 499,
    layout: 5,
    style: { ...DEFAULT_ITEM_STYLE, borderColor: '#123456' },
  });
  png = await sharp({ create: { width: 400, height: 520, channels: 3, background: '#f2c14e' } }).png().toBuffer();
  bigPng = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#336699' } }).png().toBuffer();
});

beforeEach(async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
  vi.stubEnv('AI_STYLE_DAILY_LIMIT', '');
  h.currentUser = 'usr_dev';
  reply = message(JSON.stringify(OUTPUT));
  create.mockClear();
  logic.aiStyleDeps.createClient = () => mockClient;
  await h.db.delete(aiStyleGenerations);
});

describe('generateStyleFromScreenshot', () => {
  it('renvoie layout, style, titre et avertissements, et journalise la génération', async () => {
    const r = await generateStyleFromScreenshot('gam_a', form(png));
    if (!r.ok) throw new Error(r.error);
    expect(r.data.layout).toBe(2);
    expect(r.data.style.bg1).toBe('#fff6c9');
    expect(r.data.title).toBe("Pile d'or");
    expect(r.data.subtitle).toBe('10 000 pièces');
    expect(Array.isArray(r.data.warnings)).toBe(true);
    expect(r.data.remaining).toBe(19);

    // Requête : image réencodée en WebP, contexte du jeu.
    const body = create.mock.calls[0][0] as { messages: { content: { type: string; source?: { media_type: string }; text?: string }[] }[] };
    expect(body.messages[0].content[0].source?.media_type).toBe('image/webp');
    expect(body.messages[0].content[1].text).toContain('Crystal Quest');

    const rows = await h.db.select().from(aiStyleGenerations);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ studioId: 'std_a', gameId: 'gam_a', userId: 'usr_dev', status: 'ok', model: 'claude-opus-5-5', outputTokens: 700 });
    expect(rows[0].costMicroUsd).toBeGreaterThan(0);
  });

  it('utilise le style du dernier article comme repli quand le modèle hésite', async () => {
    reply = message(JSON.stringify({ ...OUTPUT, style: { ...OUTPUT.style, borderColor: null } }));
    const r = await generateStyleFromScreenshot('gam_a', form(png));
    if (!r.ok) throw new Error(r.error);
    expect(r.data.style.borderColor).toBe('#123456');
  });

  it('redimensionne les grandes captures avant envoi (côté long ≤ 1568 px)', async () => {
    const r = await generateStyleFromScreenshot('gam_a', form(bigPng));
    expect(r.ok).toBe(true);
    const body = create.mock.calls[0][0] as { messages: { content: { source?: { data: string } }[] }[] };
    const sent = Buffer.from(body.messages[0].content[0].source!.data, 'base64');
    const meta = await sharp(sent).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(1568);
  });

  describe('droits', () => {
    it("refuse un utilisateur d'un autre studio sans appeler l'IA", async () => {
      h.currentUser = 'usr_other';
      const r = await generateStyleFromScreenshot('gam_a', form(png));
      expect(r).toMatchObject({ ok: false, code: 'forbidden' });
      expect(create).not.toHaveBeenCalled();
    });

    it('refuse le rôle finance', async () => {
      h.currentUser = 'usr_fin';
      const r = await generateStyleFromScreenshot('gam_a', form(png));
      expect(r).toMatchObject({ ok: false, code: 'forbidden' });
    });

    it('refuse un jeu inexistant', async () => {
      const r = await generateStyleFromScreenshot('gam_inconnu', form(png));
      expect(r).toMatchObject({ ok: false, code: 'forbidden' });
    });

    it('laisse passer la redirection vers la connexion', async () => {
      h.currentUser = null;
      await expect(generateStyleFromScreenshot('gam_a', form(png))).rejects.toThrow('NEXT_REDIRECT');
    });
  });

  describe('configuration', () => {
    it('sans ANTHROPIC_API_KEY : erreur « fonction non configurée », rien de journalisé', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      const r = await generateStyleFromScreenshot('gam_a', form(png));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.code).toBe('not_configured');
      expect(r.error).toMatch(/fonction non configurée/i);
      expect(create).not.toHaveBeenCalled();
      expect(await h.db.select().from(aiStyleGenerations)).toHaveLength(0);
    });

    it('clé invalide côté API : erreur de configuration, quota non consommé', async () => {
      reply = new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'bad key' } }, 'bad key', new Headers());
      const r = await generateStyleFromScreenshot('gam_a', form(png));
      expect(r).toMatchObject({ ok: false, code: 'not_configured' });
      const [row] = await h.db.select().from(aiStyleGenerations);
      expect(row).toMatchObject({ status: 'error', errorCode: 'auth' });
      expect(await logic.countRecentGenerations(h.db, 'std_a')).toBe(0);
    });
  });

  describe('fichier', () => {
    it('refuse un formulaire sans image', async () => {
      const r = await generateStyleFromScreenshot('gam_a', form(null));
      expect(r).toMatchObject({ ok: false, code: 'invalid_input' });
    });

    it("refuse un fichier qui n'est pas une image", async () => {
      const r = await generateStyleFromScreenshot('gam_a', form(Buffer.from('pas une image du tout'), 'image/png'));
      expect(r).toMatchObject({ ok: false, code: 'invalid_image' });
      expect(create).not.toHaveBeenCalled();
    });

    it('refuse un fichier trop lourd', async () => {
      const huge = Buffer.alloc(8 * 1024 * 1024 + 1);
      const r = await generateStyleFromScreenshot('gam_a', form(huge));
      expect(r).toMatchObject({ ok: false, code: 'image_too_large' });
    });
  });

  describe('limite de débit par studio', () => {
    it('bloque au-delà de la limite quotidienne, par studio', async () => {
      vi.stubEnv('AI_STYLE_DAILY_LIMIT', '2');
      expect((await generateStyleFromScreenshot('gam_a', form(png))).ok).toBe(true);
      const second = await generateStyleFromScreenshot('gam_a', form(png));
      expect(second.ok && second.data.remaining).toBe(0);
      const third = await generateStyleFromScreenshot('gam_a', form(png));
      expect(third).toMatchObject({ ok: false, code: 'rate_limited' });
      expect(create).toHaveBeenCalledTimes(2);
      expect(await logic.countRecentGenerations(h.db, 'std_a')).toBe(2);

      // Un autre studio garde son propre quota.
      h.currentUser = 'usr_other';
      expect((await generateStyleFromScreenshot('gam_b', form(png))).ok).toBe(true);
    });

    it('la fenêtre est glissante sur 24 h', async () => {
      const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await h.db.insert(aiStyleGenerations).values(
        Array.from({ length: 20 }, (_, i) => ({ id: `aig_old_${i}`, studioId: 'std_a', gameId: 'gam_a', status: 'ok' as const, createdAt: old })),
      );
      expect((await generateStyleFromScreenshot('gam_a', form(png))).ok).toBe(true);
      await h.db.insert(aiStyleGenerations).values(
        Array.from({ length: 19 }, (_, i) => ({ id: `aig_new_${i}`, studioId: 'std_a', gameId: 'gam_a', status: 'ok' as const })),
      );
      expect(await generateStyleFromScreenshot('gam_a', form(png))).toMatchObject({ ok: false, code: 'rate_limited' });
    });

    it("un service saturé (429) ne consomme pas de quota ; un refus du modèle, si", async () => {
      reply = new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 'slow down', new Headers());
      expect(await generateStyleFromScreenshot('gam_a', form(png))).toMatchObject({ ok: false, code: 'service_busy' });
      expect(await logic.countRecentGenerations(h.db, 'std_a')).toBe(0);

      reply = message('', { stop_reason: 'refusal', content: [] });
      expect(await generateStyleFromScreenshot('gam_a', form(png))).toMatchObject({ ok: false, code: 'refusal' });
      expect(await logic.countRecentGenerations(h.db, 'std_a')).toBe(1);
    });
  });
});
