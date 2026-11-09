/** Identifiants préfixés lisibles : usr_, std_, gam_, itm_, lnk_, ord_, dlv_ … (Web Crypto : Node 20+ et navigateur). */
export function newId(prefix: string) {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${prefix}_${b64}`;
}

export function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
