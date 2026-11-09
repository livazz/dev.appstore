import { describe, expect, it } from 'vitest';
import { feeCents, savingsVsStores, signPayload, verifySignature, generateLinkCode, normalizeLinkCode, nextAttemptAt, canTransition } from './index';

describe('money', () => {
  it('calcule les commissions en centimes', () => {
    expect(feeCents(799, 500)).toBe(40);
    expect(savingsVsStores(1000, 500)).toBe(250);
  });
});

describe('signatures', () => {
  it('signe et vérifie', () => {
    const h = signPayload('{"a":1}', 'sec', 1000);
    expect(verifySignature('{"a":1}', h, 'sec', 1010)).toBe(true);
    expect(verifySignature('{"a":2}', h, 'sec', 1010)).toBe(false);
    expect(verifySignature('{"a":1}', h, 'autre', 1010)).toBe(false);
    expect(verifySignature('{"a":1}', h, 'sec', 2000)).toBe(false);
  });
});

describe('codes de liaison', () => {
  it('génère et normalise', () => {
    const c = generateLinkCode();
    expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizeLinkCode(c.toLowerCase().replace('-', ' '))).toBe(c);
    expect(normalizeLinkCode('abc')).toBeNull();
  });
});

describe('livraison', () => {
  it('planifie puis abandonne', () => {
    expect(nextAttemptAt(1, 0)?.getTime()).toBe(10_000);
    expect(nextAttemptAt(99)).toBeNull();
    expect(canTransition('delivered', 'acknowledged')).toBe(true);
    expect(canTransition('acknowledged', 'pending')).toBe(false);
  });
});
