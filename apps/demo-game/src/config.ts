/*
 * Configuration du faux studio « Nova Games ».
 * Les clés reprennent `DEMO_KEYS` de packages/db/src/seed.ts (on ne l'importe pas : ce module lance le seed).
 * La cohérence est vérifiée par un test (`config.test.ts`).
 */

export type GameKey = 'crystal' | 'farm';

export interface DemoGame {
  key: GameKey;
  id: string;
  slug: string;
  name: string;
  /** webhook : le serveur du studio reçoit les achats ; sdk : le client du jeu les écoute via @wolleen/sdk. */
  mode: 'webhook' | 'sdk';
  apiKey: string;
  webhookSecret: string;
}

export interface DemoConfig {
  port: number;
  /** URL de Wolleen (site + API). */
  wolleenUrl: string;
  games: Record<GameKey, DemoGame>;
}

export const DEMO_KEYS = {
  crystal: { apiKey: 'wk_test_demo_crystal_clash', webhookSecret: 'whsec_demo_crystal_clash' },
  farm: { apiKey: 'wk_test_demo_pixel_farm', webhookSecret: 'whsec_demo_pixel_farm' },
} as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DemoConfig {
  return {
    port: Number(env.PORT) || 4100,
    wolleenUrl: (env.WOLLEEN_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    games: {
      crystal: {
        key: 'crystal',
        id: 'gam_crystal',
        slug: 'crystal-clash',
        name: 'Crystal Clash',
        mode: 'webhook',
        apiKey: env.CRYSTAL_API_KEY || DEMO_KEYS.crystal.apiKey,
        webhookSecret: env.CRYSTAL_WEBHOOK_SECRET || DEMO_KEYS.crystal.webhookSecret,
      },
      farm: {
        key: 'farm',
        id: 'gam_farm',
        slug: 'pixel-farm',
        name: 'Pixel Farm',
        mode: 'sdk',
        apiKey: env.FARM_API_KEY || DEMO_KEYS.farm.apiKey,
        webhookSecret: env.FARM_WEBHOOK_SECRET || DEMO_KEYS.farm.webhookSecret,
      },
    },
  };
}
