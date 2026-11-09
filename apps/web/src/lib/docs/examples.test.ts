import { describe, expect, it } from 'vitest';
import { LINK_CODE_TTL_MS, SIGNATURE_HEADER, SIGNATURE_TOLERANCE_S, WEBHOOK_RETRY_SCHEDULE_MS, signPayload, verifySignature } from '@wolleen/core';
import {
  EXAMPLE_BODY,
  EXAMPLE_LOOKUP_PLAYER_ID,
  EXAMPLE_LOOKUP_V1,
  EXAMPLE_SECRET,
  EXAMPLE_SIGNATURE_HEADER,
  EXAMPLE_TIMESTAMP,
  VERIFY_CSHARP,
  VERIFY_GO,
  VERIFY_NODE,
  VERIFY_PHP,
  VERIFY_PYTHON,
} from './examples';
import { DOCS_FACTS, RETRY_SCHEDULE_TEXT, formatDelay } from './facts';

describe('vecteur de test de signature affiché dans la doc', () => {
  it('correspond à signPayload de @wolleen/core', () => {
    expect(signPayload(EXAMPLE_BODY, EXAMPLE_SECRET, EXAMPLE_TIMESTAMP)).toBe(EXAMPLE_SIGNATURE_HEADER);
  });

  it('est accepté par verifySignature dans la tolérance, refusé au-delà', () => {
    expect(verifySignature(EXAMPLE_BODY, EXAMPLE_SIGNATURE_HEADER, EXAMPLE_SECRET, EXAMPLE_TIMESTAMP + 10)).toBe(true);
    expect(verifySignature(EXAMPLE_BODY, EXAMPLE_SIGNATURE_HEADER, EXAMPLE_SECRET, EXAMPLE_TIMESTAMP + SIGNATURE_TOLERANCE_S + 1)).toBe(false);
    expect(verifySignature(EXAMPLE_BODY + ' ', EXAMPLE_SIGNATURE_HEADER, EXAMPLE_SECRET, EXAMPLE_TIMESTAMP)).toBe(false);
  });

  it('signature du player lookup : corps signé = identifiant joueur brut', () => {
    expect(signPayload(EXAMPLE_LOOKUP_PLAYER_ID, EXAMPLE_SECRET, EXAMPLE_TIMESTAMP)).toBe(`t=${EXAMPLE_TIMESTAMP},v1=${EXAMPLE_LOOKUP_V1}`);
  });

  it('la vérification Node documentée accepte la signature de core', async () => {
    // Le snippet Node est du JS exécutable : on en extrait la fonction verifySignature et on l'évalue.
    const fn = VERIFY_NODE.slice(VERIFY_NODE.indexOf('export function verifySignature'), VERIFY_NODE.indexOf('\n}\n') + 2).replace('export ', '');
    const { createHmac, timingSafeEqual } = await import('node:crypto');
    const verify = new Function('createHmac', 'timingSafeEqual', 'Buffer', 'SECRET', 'TOLERANCE_S', `${fn}; return verifySignature;`)(
      createHmac,
      timingSafeEqual,
      Buffer,
      EXAMPLE_SECRET,
      SIGNATURE_TOLERANCE_S,
    ) as (body: string, header: string | null, secret?: string, now?: number) => boolean;
    const header = signPayload(EXAMPLE_BODY, EXAMPLE_SECRET, EXAMPLE_TIMESTAMP);
    expect(verify(EXAMPLE_BODY, header, EXAMPLE_SECRET, EXAMPLE_TIMESTAMP + 60)).toBe(true);
    expect(verify(EXAMPLE_BODY, header, EXAMPLE_SECRET, EXAMPLE_TIMESTAMP + 301)).toBe(false);
    expect(verify(EXAMPLE_BODY, header, 'whsec_autre', EXAMPLE_TIMESTAMP)).toBe(false);
    expect(verify(EXAMPLE_BODY, null, EXAMPLE_SECRET, EXAMPLE_TIMESTAMP)).toBe(false);
  });

  it('chaque exemple de vérification utilise le bon en-tête, la bonne tolérance et une comparaison en temps constant', () => {
    const samples = { VERIFY_NODE, VERIFY_PYTHON, VERIFY_PHP, VERIFY_GO, VERIFY_CSHARP };
    const constantTime: Record<keyof typeof samples, string> = {
      VERIFY_NODE: 'timingSafeEqual',
      VERIFY_PYTHON: 'hmac.compare_digest',
      VERIFY_PHP: 'hash_equals',
      VERIFY_GO: 'hmac.Equal',
      VERIFY_CSHARP: 'FixedTimeEquals',
    };
    for (const [name, code] of Object.entries(samples) as [keyof typeof samples, string][]) {
      expect(code, name).toMatch(new RegExp(`${SIGNATURE_TOLERANCE_S}`));
      expect(code, name).toContain(constantTime[name]);
      expect(code.toLowerCase(), name).toMatch(/sha256/);
      expect(code.toLowerCase(), name).toContain(SIGNATURE_HEADER.toLowerCase().replace('-', name === 'VERIFY_PHP' ? '_' : '-'));
    }
  });
});

describe('faits techniques repris dans la doc', () => {
  it('restent alignés sur les constantes de @wolleen/core', () => {
    expect(DOCS_FACTS.signatureHeader).toBe(SIGNATURE_HEADER);
    expect(DOCS_FACTS.toleranceS).toBe(SIGNATURE_TOLERANCE_S);
    expect(DOCS_FACTS.linkCodeTtlMin * 60_000).toBe(LINK_CODE_TTL_MS);
    expect(DOCS_FACTS.retrySchedule).toHaveLength(WEBHOOK_RETRY_SCHEDULE_MS.length);
    // Même libellé que l'onglet Intégration de l'espace studio.
    expect(RETRY_SCHEDULE_TEXT).toBe('10 s, 1 min, 5 min, 30 min, 2 h, 6 h, 24 h');
  });

  it('formatDelay couvre secondes, minutes, heures et jours', () => {
    expect(formatDelay(5_000)).toBe('5 s');
    expect(formatDelay(90 * 60_000)).toBe('1 h 30 min');
    expect(formatDelay(72 * 3600_000)).toBe('3 j');
    expect(formatDelay(54 * 3600_000)).toBe('2 j 6 h');
  });
});
