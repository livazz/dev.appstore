import { randomBytes } from 'node:crypto';

/** Identifiants préfixés lisibles : usr_, std_, gam_, itm_, lnk_, ord_, dlv_ … */
export function newId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

export function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
