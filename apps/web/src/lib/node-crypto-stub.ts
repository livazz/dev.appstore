/*
 * Remplace `node:crypto` dans le bundle navigateur (voir next.config.ts).
 * @devappstore/core réexporte des helpers crypto réservés au serveur ; les composants client n'en
 * utilisent aucun. Si l'un d'eux était appelé côté navigateur, il échouerait explicitement.
 */
const serverOnly = (name: string) => () => {
  throw new Error(`${name}() est réservé au serveur (node:crypto indisponible dans le navigateur).`);
};

export const createHash = serverOnly('createHash');
export const createHmac = serverOnly('createHmac');
export const randomBytes = serverOnly('randomBytes');
export const randomInt = serverOnly('randomInt');
export const timingSafeEqual = serverOnly('timingSafeEqual');
const nodeCrypto = { createHash, createHmac, randomBytes, randomInt, timingSafeEqual };
export default nodeCrypto;
