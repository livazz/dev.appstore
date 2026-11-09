import { describe, expect, it } from 'vitest';
import { resolveContext } from '@wolleen/emails';
import {
  auditTargetHref,
  can,
  dayKeys,
  effectiveTakeRateBps,
  escapeLike,
  fillDailySeries,
  nextGameStatus,
  parsePage,
  parsePeriod,
  periodStart,
  rolesFor,
  suspendGameSchema,
} from './admin-logic';
import { moderationEmail } from './admin-emails';

describe('droits', () => {
  it('la finance lit mais ne modère pas ; seul le superadmin et la finance lisent le journal', () => {
    expect(can('finance', 'dashboard.read')).toBe(true);
    expect(can('finance', 'games.moderate')).toBe(false);
    expect(can('support', 'games.moderate')).toBe(true);
    expect(can('support', 'audit.read')).toBe(false);
    expect(can(null, 'dashboard.read')).toBe(false);
    expect(rolesFor('users.disable')).toEqual(['superadmin', 'support']);
  });
});

describe('transitions de modération', () => {
  it('approuver : review → live uniquement', () => {
    expect(nextGameStatus('review', 'approve')).toBe('live');
    expect(nextGameStatus('draft', 'approve')).toBeNull();
    expect(nextGameStatus('live', 'approve')).toBeNull();
  });
  it('suspendre : tout sauf un jeu déjà suspendu ; réactiver : suspended → live', () => {
    expect(nextGameStatus('live', 'suspend')).toBe('suspended');
    expect(nextGameStatus('review', 'suspend')).toBe('suspended');
    expect(nextGameStatus('suspended', 'suspend')).toBeNull();
    expect(nextGameStatus('suspended', 'reactivate')).toBe('live');
    expect(nextGameStatus('live', 'reactivate')).toBeNull();
  });
  it('motif de suspension obligatoire et assez précis', () => {
    expect(suspendGameSchema.safeParse({ ground: 'fraud', reason: '' }).success).toBe(false);
    expect(suspendGameSchema.safeParse({ ground: 'fraud' }).success).toBe(false);
    expect(suspendGameSchema.safeParse({ ground: 'nope', reason: 'x'.repeat(30) }).success).toBe(false);
    const ok = suspendGameSchema.safeParse({ ground: 'fraud', reason: `  ${'x'.repeat(30)}  ` });
    expect(ok.success && ok.data.reason).toBe('x'.repeat(30));
  });
});

describe('utilitaires', () => {
  it('périodes et séries', () => {
    expect(parsePeriod('7')).toBe(7);
    expect(parsePeriod('90')).toBe(30);
    expect(parsePeriod(undefined)).toBe(30);
    const now = new Date('2026-11-09T10:00:00Z');
    expect(dayKeys(3, now)).toEqual(['2026-11-07', '2026-11-08', '2026-11-09']);
    expect(periodStart(3, now).toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(fillDailySeries(3, [{ day: '2026-11-08', cents: 500 }], now).map((p) => p.cents)).toEqual([0, 500, 0]);
    expect(effectiveTakeRateBps(10_000, 500)).toBe(500);
    expect(effectiveTakeRateBps(0, 0)).toBe(0);
  });
  it('recherche, pagination, liens du journal', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    expect(parsePage('3')).toBe(3);
    expect(parsePage('-1')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(auditTargetHref('order', 'ord_1')).toBe('/admin/orders/ord_1');
    expect(auditTargetHref('other', 'x')).toBeNull();
  });
});

describe('e-mail de modération', () => {
  it('échappe les données et mentionne motif, fondement et contestation pour une suspension', () => {
    const mail = moderationEmail(
      { action: 'suspend', studioName: '<Nova>', gameName: 'Crystal', ground: 'fraud', reason: 'Motif <script>', decidedAt: new Date('2026-11-09T10:00:00Z'), reference: 'gmn_1' },
      resolveContext({ supportEmail: 'support@devappstore.test' }),
    );
    expect(mail.subject).toBe('Suspension de « Crystal » sur Dev AppStore');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;Nova&gt;');
    expect(mail.text).toContain('Fondement : Fraude ou paiements suspects');
    expect(mail.text).toContain('support@devappstore.test');
    expect(mail.text).toContain('gmn_1');
  });
});
