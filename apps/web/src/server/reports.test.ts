import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ITEM_STYLE, DEFAULT_THEME } from '@devappstore/core';
import { createTestDb } from '@devappstore/db/testing';
import type { DB } from '@devappstore/db';
import type { Mailer, MailMessage } from '@devappstore/emails';

/*
 * Signalements de contenus : base en mémoire, session simulée, notFound() remplacé par une erreur repérable.
 * Couvre le dépôt (validation, jeu en ligne, article du jeu, anti-doublon, limitation de débit, accusé de réception),
 * les accès au back-office (404 hors superadmin / support), « classer sans suite » (transaction avec l'audit,
 * e-mails aux signalants) et la clôture par une suspension (`suspendGame`, non dupliqué).
 */

const h = vi.hoisted(() => ({
  db: null as unknown as DB,
  current: null as null | { id: string; email: string; name: string },
}));

vi.mock('@devappstore/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@devappstore/db')>();
  return {
    ...actual,
    get db() {
      return h.db;
    },
  };
});

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('./session', () => ({
  getCurrentUser: async () => h.current,
  ADMIN_RECENT_LOGIN_MS: 12 * 60 * 60_000,
  requireRecentLogin: async () => h.current,
}));

vi.mock('./delivery', () => ({ dispatchDelivery: vi.fn() }));

const reports = await import('./reports');
const admin = await import('./admin');
const { MemoryRateLimitStore } = await import('./rate-limit');
const { REPORT_LIMITS } = await import('./reports-logic');
const { adminAuditLog, contentReports, eq, games, items, platformAdmins, studioMembers, studios, user } = await import('@devappstore/db');

const U = {
  super: { id: 'usr_super', email: 'super@devappstore.test', name: 'Super' },
  support: { id: 'usr_support', email: 'support@devappstore.test', name: 'Support' },
  finance: { id: 'usr_finance', email: 'finance@devappstore.test', name: 'Finance' },
  owner: { id: 'usr_owner', email: 'owner@studio.test', name: 'Owner' },
  player: { id: 'usr_player', email: 'joueur@exemple.test', name: 'Joueur' },
};

function sentMailer() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = { send: async (m) => (sent.push(m), { id: `m${sent.length}` }) };
  return { sent, mailer };
}

const login = (u: { id: string; email: string; name: string } | null) => {
  h.current = u;
};

const valid = {
  category: 'illegal_content' as const,
  explanation: 'La bannière reprend un logo protégé et promet des gemmes jamais livrées.',
  email: 'Visiteur@Exemple.test',
  goodFaith: true as const,
};

let store = new MemoryRateLimitStore();
let ipSeq = 0;
/** Contexte de dépôt : IP neuve à chaque appel (sauf précision), magasin de limites isolé. */
const ctx = (extra: Partial<Parameters<typeof reports.submitReport>[2]> = {}) => ({ ip: `10.0.0.${++ipSeq % 250}`, store, ...extra });

async function reportsOf(gameId: string) {
  return h.db.select().from(contentReports).where(eq(contentReports.gameId, gameId));
}

beforeAll(async () => {
  h.db = await createTestDb();
  await h.db.insert(user).values(Object.values(U));
  await h.db.insert(platformAdmins).values([
    { userId: U.super.id, role: 'superadmin' },
    { userId: U.support.id, role: 'support' },
    { userId: U.finance.id, role: 'finance' },
  ]);
  await h.db.insert(studios).values({ id: 'std_t', name: 'Studio Test', slug: 'studio-test' });
  await h.db.insert(studioMembers).values({ studioId: 'std_t', userId: U.owner.id, role: 'owner' });
  const base = { studioId: 'std_t', theme: DEFAULT_THEME, webhookSecret: 'whsec_secret', apiKeyHash: 'hash', apiKeyPrefix: 'das_test' };
  await h.db.insert(games).values([
    { ...base, id: 'gam_live', slug: 'jeu-live', name: 'Jeu Live', status: 'live' },
    { ...base, id: 'gam_draft', slug: 'jeu-brouillon', name: 'Jeu Brouillon', status: 'draft' },
    { ...base, id: 'gam_other', slug: 'jeu-autre', name: 'Jeu Autre', status: 'live' },
    { ...base, id: 'gam_susp', slug: 'jeu-susp', name: 'Jeu Suspendu', status: 'live' },
    { ...base, id: 'gam_tx', slug: 'jeu-tx', name: 'Jeu Tx', status: 'live' },
  ]);
  await h.db.insert(items).values([
    { id: 'itm_live', gameId: 'gam_live', productId: 'gems', title: 'Sac de gemmes', priceCents: 499, style: DEFAULT_ITEM_STYLE },
    { id: 'itm_other', gameId: 'gam_other', productId: 'gold', title: 'Or', priceCents: 199, style: DEFAULT_ITEM_STYLE },
  ]);
});

beforeEach(() => {
  login(null);
  store = new MemoryRateLimitStore();
});

describe('submitReport — dépôt par un visiteur', () => {
  it('enregistre le signalement (e-mail normalisé, bonne foi horodatée) et envoie l’accusé de réception', async () => {
    const { sent, mailer } = sentMailer();
    const now = new Date('2026-11-10T10:00:00Z');
    const r = await reports.submitReport('jeu-live', { ...valid, itemId: 'itm_live' }, ctx({ mailer, now }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({ email: 'visiteur@exemple.test', gameName: 'Jeu Live', itemTitle: 'Sac de gemmes', ackSent: true });
    const [row] = await h.db.select().from(contentReports).where(eq(contentReports.id, r.reportId));
    expect(row).toMatchObject({
      gameId: 'gam_live',
      itemId: 'itm_live',
      target: 'itm_live',
      category: 'illegal_content',
      reporterEmail: 'visiteur@exemple.test',
      reporterUserId: null,
      status: 'open',
    });
    expect(row!.goodFaithAt.toISOString()).toBe(now.toISOString());
    expect(row!.ackSentAt).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('visiteur@exemple.test');
    expect(sent[0]!.subject).toContain('Accusé de réception');
    expect(sent[0]!.text).toContain(r.reportId);
    expect(sent[0]!.text).toContain('Sac de gemmes');
  });

  it('préremplit l’e-mail du compte connecté et rattache le compte', async () => {
    const { mailer } = sentMailer();
    const r = await reports.submitReport('jeu-live', { ...valid, email: '' }, ctx({ mailer, user: U.player }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await h.db.select().from(contentReports).where(eq(contentReports.id, r.reportId));
    expect(row).toMatchObject({ reporterEmail: U.player.email, reporterUserId: U.player.id, target: 'game' });
  });

  it('refuse les saisies invalides sans rien enregistrer ni consommer de quota', async () => {
    const before = (await reportsOf('gam_live')).length;
    const { mailer, sent } = sentMailer();
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ ...valid, explanation: 'Trop court' }, /au moins 20 caractères/],
      [{ ...valid, explanation: 'x'.repeat(2001) }, /2000 caractères/],
      [{ ...valid, category: 'spam' }, /catégorie/],
      [{ ...valid, email: '' }, /adresse e-mail/],
      [{ ...valid, email: 'pas-un-email' }, /invalide/],
      [{ ...valid, goodFaith: false }, /bonne foi/],
    ];
    for (const [input, msg] of cases) {
      const r = await reports.submitReport('jeu-live', input as never, ctx({ mailer, ip: '192.0.2.50' }));
      expect(r).toMatchObject({ ok: false, error: 'invalid' });
      if (!r.ok) expect(r.message).toMatch(msg);
    }
    expect((await reportsOf('gam_live')).length).toBe(before);
    expect(sent).toHaveLength(0);
    // Aucune requête invalide n'a consommé le quota de l'IP.
    const d = await store.hit('report:ip:192.0.2.50', REPORT_LIMITS.perIpBurst);
    expect(d).toMatchObject({ allowed: true, remaining: REPORT_LIMITS.perIpBurst.max - 1 });
  });

  it('refuse un jeu non publié et un article d’un autre jeu', async () => {
    const { mailer } = sentMailer();
    expect(await reports.submitReport('jeu-brouillon', valid, ctx({ mailer }))).toMatchObject({ ok: false, error: 'not_found' });
    expect(await reports.submitReport('inconnu', valid, ctx({ mailer }))).toMatchObject({ ok: false, error: 'not_found' });
    expect(await reports.submitReport('jeu-live', { ...valid, itemId: 'itm_other' }, ctx({ mailer }))).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('anti-doublon : un seul signalement ouvert par signalant et par cible', async () => {
    const { mailer, sent } = sentMailer();
    const input = { ...valid, email: 'doublon@exemple.test', itemId: 'itm_other' };
    expect((await reports.submitReport('jeu-autre', input, ctx({ mailer }))).ok).toBe(true);
    const again = await reports.submitReport('jeu-autre', { ...input, email: 'DOUBLON@exemple.test ' }, ctx({ mailer }));
    expect(again).toMatchObject({ ok: false, error: 'duplicate' });
    // Une autre cible (le jeu dans son ensemble) reste possible.
    expect((await reports.submitReport('jeu-autre', { ...input, itemId: '' }, ctx({ mailer }))).ok).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('accepte le signalement même si l’accusé de réception ne part pas', async () => {
    const mailer: Mailer = { send: async () => Promise.reject(new Error('SMTP indisponible')) };
    const r = await reports.submitReport('jeu-live', { ...valid, email: 'panne@exemple.test' }, ctx({ mailer }));
    expect(r).toMatchObject({ ok: true, ackSent: false });
    if (!r.ok) return;
    const [row] = await h.db.select().from(contentReports).where(eq(contentReports.id, r.reportId));
    expect(row!.ackSentAt).toBeNull();
    expect(row!.notifyError).toContain('SMTP indisponible');
  });
});

describe('submitReport — limitation de débit', () => {
  it('limite par IP (rafale) puis répond « rate_limited » avec un délai', async () => {
    const { mailer } = sentMailer();
    const ip = '198.51.100.7';
    for (let i = 0; i < REPORT_LIMITS.perIpBurst.max; i++) {
      const r = await reports.submitReport('jeu-live', { ...valid, email: `ip${i}@exemple.test` }, ctx({ mailer, ip }));
      expect(r.ok).toBe(true);
    }
    const blocked = await reports.submitReport('jeu-live', { ...valid, email: 'ip-de-trop@exemple.test' }, ctx({ mailer, ip }));
    expect(blocked).toMatchObject({ ok: false, error: 'rate_limited' });
    if (!blocked.ok) expect(blocked.retryAfterS).toBeGreaterThan(0);
    // Une autre IP n'est pas concernée.
    expect((await reports.submitReport('jeu-live', { ...valid, email: 'autre-ip@exemple.test' }, ctx({ mailer }))).ok).toBe(true);
  });

  it('limite par e-mail du signalant, quelle que soit l’IP', async () => {
    const { mailer } = sentMailer();
    const email = 'cible-spam@exemple.test';
    const targets = ['itm_live', '', 'itm_other'];
    let accepted = 0;
    // Cibles variées pour ne pas buter sur l'anti-doublon.
    for (let i = 0; i < REPORT_LIMITS.perEmailDay.max; i++) {
      const slug = i < 2 ? 'jeu-live' : 'jeu-autre';
      const itemId = i < 2 ? targets[i] : i === 2 ? 'itm_other' : '';
      const r = await reports.submitReport(slug, { ...valid, email, itemId }, ctx({ mailer }));
      if (r.ok || r.error === 'duplicate') accepted++;
    }
    expect(accepted).toBe(REPORT_LIMITS.perEmailDay.max);
    const r = await reports.submitReport('jeu-tx', { ...valid, email }, ctx({ mailer }));
    expect(r).toMatchObject({ ok: false, error: 'rate_limited' });
  });

  it('limite par compte connecté, même en changeant d’IP et d’e-mail', async () => {
    const { mailer } = sentMailer();
    for (let i = 0; i < REPORT_LIMITS.perAccountDay.max; i++) {
      await store.hit(`report:user:${U.owner.id}`, REPORT_LIMITS.perAccountDay);
    }
    const r = await reports.submitReport('jeu-live', { ...valid, email: 'nouvelle@exemple.test' }, ctx({ mailer, user: U.owner }));
    expect(r).toMatchObject({ ok: false, error: 'rate_limited' });
  });
});

describe('Back-office — accès', () => {
  it('404 pour les visiteurs, joueurs, studios et la finance ; superadmin et support autorisés', async () => {
    for (const u of [null, U.player, U.owner, U.finance]) {
      login(u);
      await expect(reports.listOpenReportsForAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(reports.dismissReports('gam_live', { reason: 'Rien de contraire à la charte constaté.', reportIds: ['x'] })).rejects.toThrow('NEXT_NOT_FOUND');
    }
    for (const u of [U.super, U.support]) {
      login(u);
      await expect(reports.listOpenReportsForAdmin()).resolves.toBeInstanceOf(Array);
    }
  });

  it('regroupe les signalements ouverts par jeu, avec le nombre et le fondement suggéré', async () => {
    login(U.support);
    const groups = await reports.listOpenReportsForAdmin();
    const live = groups.find((g) => g.game.id === 'gam_live')!;
    expect(live.count).toBe(live.reports.length);
    expect(live.count).toBeGreaterThan(1);
    expect(live.suggestedGround).toBe('illegal_content');
    expect(live.reports.some((r) => r.itemTitle === 'Sac de gemmes')).toBe(true);
    expect(live.reports.every((r) => r.reporterEmail && r.explanation && r.createdAt instanceof Date)).toBe(true);
    // Les plus signalés d'abord.
    expect(groups.map((g) => g.count)).toEqual([...groups.map((g) => g.count)].sort((a, b) => b - a));
    const counts = await reports.countOpenReports();
    expect(counts.reports).toBe(groups.reduce((s, g) => s + g.count, 0));
    expect(counts.games).toBe(groups.length);
  });
});

describe('Back-office — classer sans suite', () => {
  it('exige un motif d’au moins 20 caractères', async () => {
    login(U.super);
    await expect(reports.dismissReports('gam_live', { reason: 'court', reportIds: ['x'] })).rejects.toThrow(/au moins 20 caractères/);
    await expect(reports.dismissReports('gam_live', { reason: '', reportIds: ['x'] })).rejects.toThrow(admin.AdminError);
  });

  it('clôt les signalements affichés, journalise dans la même transaction et informe chaque signalant', async () => {
    const { mailer: m0 } = sentMailer();
    const a = await reports.submitReport('jeu-tx', { ...valid, email: 'a@exemple.test' }, ctx({ mailer: m0 }));
    const b = await reports.submitReport('jeu-tx', { ...valid, email: 'b@exemple.test', category: 'fraud' }, ctx({ mailer: m0 }));
    if (!a.ok || !b.ok) throw new Error('dépôt impossible');
    // Arrivé après l'affichage de la page : n'est pas dans reportIds, reste ouvert.
    const late = await reports.submitReport('jeu-tx', { ...valid, email: 'tard@exemple.test' }, ctx({ mailer: m0 }));
    if (!late.ok) throw new Error('dépôt impossible');

    login(U.support);
    const { sent, mailer } = sentMailer();
    const reason = 'Le logo est sous licence du studio : aucun manquement constaté.';
    const r = await reports.dismissReports('gam_tx', { reason, reportIds: [a.reportId, b.reportId] }, { mailer });
    expect(r).toEqual({ closed: 2, notified: 2, stillOpen: 1 });

    const rows = await reportsOf('gam_tx');
    const closed = rows.filter((x) => x.id !== late.reportId);
    expect(closed.every((x) => x.status === 'dismissed' && x.decisionReason === reason && x.decidedBy === U.support.id && x.decisionSentAt)).toBe(true);
    expect(rows.find((x) => x.id === late.reportId)!.status).toBe('open');

    const audit = await h.db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, 'gam_tx'));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ adminId: U.support.id, action: 'reports.dismiss', targetType: 'game' });
    expect((audit[0]!.details as { reportIds: string[] }).reportIds.sort()).toEqual([a.reportId, b.reportId].sort());

    expect(sent.map((m) => m.to).sort()).toEqual(['a@exemple.test', 'b@exemple.test']);
    expect(sent[0]!.subject).toMatch(/classé sans suite/);
    expect(sent[0]!.text).toContain(reason);
    // Le studio n'est pas prévenu.
    expect(sent.some((m) => m.to === U.owner.email)).toBe(false);

    // Deuxième décision sur les mêmes signalements : refusée, rien n'est journalisé.
    await expect(reports.dismissReports('gam_tx', { reason, reportIds: [a.reportId] }, { mailer })).rejects.toThrow(/déjà été traités/);
    expect(await h.db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, 'gam_tx'))).toHaveLength(1);
  });

  it('transaction : si le journal d’audit échoue, aucun signalement n’est clos', async () => {
    const { mailer: m0 } = sentMailer();
    const s = await reports.submitReport('jeu-tx', { ...valid, email: 'rollback@exemple.test', itemId: '' }, ctx({ mailer: m0 }));
    if (!s.ok) throw new Error('dépôt impossible');
    login(U.super);
    const { sent, mailer } = sentMailer();
    // Fait échouer l'INSERT du journal à l'intérieur de la transaction.
    const realTransaction = h.db.transaction.bind(h.db);
    const spy = vi.spyOn(h.db, 'transaction').mockImplementation(((fn: (tx: unknown) => Promise<unknown>) =>
      realTransaction(async (tx) => {
        const proxied = new Proxy(tx, {
          get(target, prop, receiver) {
            if (prop === 'insert') {
              return (table: unknown) => {
                if (table === adminAuditLog) throw new Error('journal indisponible');
                return target.insert(table as never);
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        });
        return fn(proxied);
      })) as never);
    try {
      await expect(reports.dismissReports('gam_tx', { reason: 'Motif suffisamment long pour être valide.', reportIds: [s.reportId] }, { mailer })).rejects.toThrow(
        'journal indisponible',
      );
    } finally {
      spy.mockRestore();
    }
    const [row] = await h.db.select().from(contentReports).where(eq(contentReports.id, s.reportId));
    expect(row!.status).toBe('open');
    expect(sent).toHaveLength(0);
  });
});

describe('Suspension depuis le panneau de modération (suspendGame)', () => {
  it('clôt tous les signalements ouverts du jeu dans la transaction de la suspension et informe les signalants', async () => {
    const { mailer: m0 } = sentMailer();
    const ids: string[] = [];
    for (const email of ['s1@exemple.test', 's2@exemple.test']) {
      const r = await reports.submitReport('jeu-susp', { ...valid, email }, ctx({ mailer: m0 }));
      if (!r.ok) throw new Error('dépôt impossible');
      ids.push(r.reportId);
    }
    login(U.support);
    const { sent, mailer } = sentMailer();
    const reason = 'Bannière reprenant la marque d’un tiers sans autorisation, signalée deux fois.';
    const res = await admin.suspendGame('gam_susp', { ground: 'illegal_content', reason }, { mailer });
    expect(res).toMatchObject({ status: 'suspended', closedReports: 2 });

    const rows = await reportsOf('gam_susp');
    expect(rows.every((r) => r.status === 'actioned' && r.decisionGround === 'illegal_content' && r.decisionNoticeId === res.noticeId && r.decisionReason === reason)).toBe(
      true,
    );
    const [audit] = await h.db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, 'gam_susp'));
    expect(audit).toMatchObject({ action: 'game.suspend' });
    expect((audit!.details as { closedReports: string[] }).closedReports.sort()).toEqual(ids.sort());

    // Studio : e-mail de modération existant ; signalants : décision avec motif et fondement.
    expect(sent.filter((m) => m.to === U.owner.email)).toHaveLength(1);
    const toReporters = sent.filter((m) => m.to.startsWith('s'));
    expect(toReporters.map((m) => m.to).sort()).toEqual(['s1@exemple.test', 's2@exemple.test']);
    expect(toReporters[0]!.subject).toMatch(/jeu suspendu/);
    expect(toReporters[0]!.text).toContain(reason);
    expect(toReporters[0]!.text).toContain('Contenu illicite ou trompeur');

    // Le jeu suspendu ne peut plus être signalé (boutique masquée).
    expect(await reports.submitReport('jeu-susp', { ...valid, email: 'apres@exemple.test' }, ctx({ mailer: m0 }))).toMatchObject({ ok: false, error: 'not_found' });
  });
});
