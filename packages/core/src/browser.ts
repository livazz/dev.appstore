/*
 * Point d'entrée navigateur de @wolleen/core (condition d'export "browser") : tout le domaine pur,
 * sans les modules qui dépendent de node:crypto (crypto.ts, ids.ts), utilisables seulement côté serveur.
 * Permet aux composants client ('use client') d'importer formatMoney, PERIODS, GAME_CATEGORIES… depuis '@wolleen/core'.
 */
export * from './types';
export * from './constants';
export * from './money';
export * from './delivery';
