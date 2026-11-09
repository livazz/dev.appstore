import { describe, expect, it } from 'vitest';
import {
  addDays,
  DEFAULT_LOYALTY_CONFIG,
  expiringSoon,
  isLoyaltyEnabled,
  isRewardWithinBudget,
  loyaltyConfigFromEnv,
  minOrderForDiscount,
  minPointsForDiscount,
  pointsForFee,
  pointsToRevoke,
  replayLedger,
  type LedgerEntry,
} from './loyalty-logic';

const T0 = new Date('2026-01-01T00:00:00Z');
let n = 0;
function entry(e: Partial<LedgerEntry> & Pick<LedgerEntry, 'delta' | 'reason'>, at: Date): LedgerEntry {
  return { id: `e${++n}`, orderId: null, refEntryId: null, expiresAt: null, createdAt: at, ...e };
}
const award = (orderId: string, points: number, at: Date, ttlDays = 365) =>
  entry({ delta: points, reason: 'order_award', orderId, expiresAt: addDays(at, ttlDays) }, at);

describe('barème et configuration', () => {
  it('1 point par tranche de 10 centimes de commission, arrondi inférieur', () => {
    expect(pointsForFee(40)).toBe(4);
    expect(pointsForFee(49)).toBe(4);
    expect(pointsForFee(9)).toBe(0);
    expect(pointsForFee(0)).toBe(0);
    expect(pointsForFee(-50)).toBe(0);
    expect(pointsForFee(40, { ...DEFAULT_LOYALTY_CONFIG, feeCentsPerPoint: 1 })).toBe(40);
  });

  it('lit la configuration et ignore les valeurs invalides', () => {
    expect(loyaltyConfigFromEnv({})).toEqual(DEFAULT_LOYALTY_CONFIG);
    expect(loyaltyConfigFromEnv({ LOYALTY_FEE_CENTS_PER_POINT: '5', LOYALTY_POINTS_TTL_DAYS: '30', LOYALTY_MAX_COST_BPS: '1000' })).toMatchObject({
      feeCentsPerPoint: 5,
      pointsTtlDays: 30,
      maxCostBps: 1000,
    });
    expect(loyaltyConfigFromEnv({ LOYALTY_FEE_CENTS_PER_POINT: '0', LOYALTY_MAX_COST_BPS: '20000' })).toEqual(DEFAULT_LOYALTY_CONFIG);
  });

  it('désactivé par défaut en production, activable explicitement', () => {
    expect(isLoyaltyEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isLoyaltyEnabled({ NODE_ENV: 'production', LOYALTY_ENABLED: '1' })).toBe(true);
    expect(isLoyaltyEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isLoyaltyEnabled({ NODE_ENV: 'development', LOYALTY_ENABLED: 'false' })).toBe(false);
  });
});

describe('budget : coût ≤ 20 % de la commission', () => {
  it('1 € de réduction coûte au moins 50 points (10 c/point, 20 %)', () => {
    expect(minPointsForDiscount(100)).toBe(50);
    expect(isRewardWithinBudget({ kind: 'discount', pointsCost: 50, valueCents: 100 })).toBe(true);
    expect(isRewardWithinBudget({ kind: 'discount', pointsCost: 49, valueCents: 100 })).toBe(false);
    expect(isRewardWithinBudget({ kind: 'discount', pointsCost: 50, valueCents: null })).toBe(false);
  });

  it('les objets bonus (offerts par le studio) ne coûtent rien à Dev AppStore', () => {
    expect(isRewardWithinBudget({ kind: 'bonus_item', pointsCost: 1, valueCents: null })).toBe(true);
    expect(isRewardWithinBudget({ kind: 'bonus_item', pointsCost: 0, valueCents: null })).toBe(false);
  });

  it('budget nul : aucune réduction possible', () => {
    expect(isRewardWithinBudget({ kind: 'discount', pointsCost: 1_000_000, valueCents: 1 }, { ...DEFAULT_LOYALTY_CONFIG, maxCostBps: 0 })).toBe(false);
  });

  it('montant minimum de commande pour couvrir la réduction par la commission', () => {
    expect(minOrderForDiscount(100, 500)).toBe(2000);
    expect(minOrderForDiscount(100, 0)).toBeNull();
  });
});

describe('rejeu du registre', () => {
  it('additionne les lots et exclut les lots expirés', () => {
    const entries = [award('o1', 10, T0), award('o2', 5, addDays(T0, 100))];
    expect(replayLedger(entries, addDays(T0, 10)).balance).toBe(15);
    expect(replayLedger(entries, addDays(T0, 365)).balance).toBe(5); // o1 expire pile à J+365
    expect(replayLedger(entries, addDays(T0, 500)).balance).toBe(0);
  });

  it('un débit consomme d’abord les points qui expirent le plus tôt', () => {
    const entries = [
      award('o1', 10, T0), // expire J+365
      award('o2', 10, addDays(T0, 10)), // expire J+375
      entry({ delta: -12, reason: 'redemption' }, addDays(T0, 20)),
    ];
    const s = replayLedger(entries, addDays(T0, 30));
    expect(s.balance).toBe(8);
    expect(s.lots.map((l) => l.remaining)).toEqual([0, 8]);
    // À J+366 le lot o1 (vide) expire sans perte, o2 reste.
    expect(replayLedger(entries, addDays(T0, 366)).balance).toBe(8);
  });

  it('un débit ne peut pas consommer un lot déjà expiré', () => {
    const entries = [award('o1', 10, T0, 30), award('o2', 3, addDays(T0, 40)), entry({ delta: -3, reason: 'redemption' }, addDays(T0, 50))];
    const s = replayLedger(entries, addDays(T0, 50));
    expect(s.balance).toBe(0);
    expect(s.lots[0]).toMatchObject({ isExpired: true, expired: 10, remaining: 0 });
    expect(s.uncovered).toBe(0);
  });

  it('les écritures d’expiration ne changent pas le solde', () => {
    const a = award('o1', 10, T0, 30);
    const entries = [a, entry({ delta: -10, reason: 'expiry', refEntryId: a.id }, addDays(T0, 30))];
    const s = replayLedger(entries, addDays(T0, 31));
    expect(s.balance).toBe(0);
    expect(s.lots[0]).toMatchObject({ expiryRecorded: true, expired: 10 });
  });

  it('la reprise consomme le lot de sa commande en premier', () => {
    const entries = [award('o1', 10, T0), award('o2', 10, addDays(T0, 1)), entry({ delta: -10, reason: 'order_revoke', orderId: 'o2' }, addDays(T0, 2))];
    const s = replayLedger(entries, addDays(T0, 3));
    expect(s.lots.map((l) => l.remaining)).toEqual([10, 0]);
  });

  it('signale les points qui expirent dans les 30 jours', () => {
    const entries = [award('o1', 10, T0), award('o2', 4, addDays(T0, 200))];
    expect(expiringSoon(replayLedger(entries, addDays(T0, 340)), addDays(T0, 340))).toEqual([{ points: 10, expiresAt: addDays(T0, 365) }]);
    expect(expiringSoon(replayLedger(entries, addDays(T0, 100)), addDays(T0, 100))).toEqual([]);
  });
});

describe('points à reprendre au remboursement', () => {
  it('reprend les points de la commande', () => {
    const s = replayLedger([award('o1', 10, T0), award('o2', 5, T0)], addDays(T0, 1));
    expect(pointsToRevoke(s, 'o1')).toBe(10);
  });

  it('reprise non bornée par le solde : les points dépensés deviennent une dette (C-2)', () => {
    const s = replayLedger([award('o1', 10, T0), entry({ delta: -8, reason: 'redemption' }, addDays(T0, 1))], addDays(T0, 2));
    expect(pointsToRevoke(s, 'o1')).toBe(10);
    const after = replayLedger(
      [award('o1', 10, T0), entry({ delta: -8, reason: 'redemption' }, addDays(T0, 1)), entry({ delta: -10, reason: 'order_revoke', orderId: 'o1' }, addDays(T0, 2))],
      addDays(T0, 3),
    );
    expect(after).toMatchObject({ balance: -8, debt: 8, uncovered: 0 });
    // Les points suivants remboursent la dette avant d'être disponibles.
    const repaid = replayLedger([...[award('o1', 10, T0), entry({ delta: -8, reason: 'redemption' }, addDays(T0, 1)), entry({ delta: -10, reason: 'order_revoke', orderId: 'o1' }, addDays(T0, 2))], award('o2', 5, addDays(T0, 3))], addDays(T0, 4));
    expect(repaid).toMatchObject({ balance: -3, debt: 3 });
  });

  it('ne reprend pas les points déjà expirés du lot', () => {
    const s = replayLedger([award('o1', 10, T0, 30), award('o2', 20, addDays(T0, 10))], addDays(T0, 40));
    expect(pointsToRevoke(s, 'o1')).toBe(0);
  });

  it('0 si la commande n’a pas rapporté de points', () => {
    expect(pointsToRevoke(replayLedger([award('o1', 10, T0)], T0), 'oX')).toBe(0);
  });
});
