/*
 * Fabrique les paquets « glisser-déposer » téléchargeables depuis /docs/integration :
 *   apps/web/public/sdk/devappstore-unity-<version>.unitypackage   à glisser dans la fenêtre Project de Unity
 *   apps/web/public/sdk/devappstore-godot-<version>.zip            à décompresser à la racine du projet Godot
 *
 * Usage : npm run sdk:pack   (à relancer après toute modification de sdks/unity ou sdks/godot ; un test vérifie que les
 * paquets publiés correspondent aux sources : apps/web/src/lib/docs/sdk-packages.test.ts).
 *
 * Aucune dépendance : archives tar/gzip et zip écrites ici, sans horodatage, donc identiques d'une machine à l'autre.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = path.join(ROOT, 'apps/web/public/sdk');
const UNITY_DIR = path.join(ROOT, 'sdks/unity');
const GODOT_DIR = path.join(ROOT, 'sdks/godot');

/** Dossier d'import dans le projet Unity, et son identifiant (fixe : une mise à jour remplace le dossier existant). */
export const UNITY_ROOT = 'Assets/DevAppStore';
const UNITY_ROOT_GUID = 'd3a9c0de5d0e4a17b0a7de7a99570e01';

export const unityVersion = (): string => (JSON.parse(readFileSync(path.join(UNITY_DIR, 'package.json'), 'utf8')) as { version: string }).version;
export const godotVersion = (): string => /^version="([^"]+)"/m.exec(readFileSync(path.join(GODOT_DIR, 'addons/devappstore/plugin.cfg'), 'utf8'))![1]!;
export const unityFile = () => `devappstore-unity-${unityVersion()}.unitypackage`;
export const godotFile = () => `devappstore-godot-${godotVersion()}.zip`;

const posix = (p: string) => p.split(path.sep).join('/');

function walk(dir: string, skip: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (skip(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(full, ...walk(full, skip));
    else out.push(full);
  }
  return out;
}

// ------------------------------------------------------------------ Contenu des paquets

export interface UnityAsset {
  guid: string;
  /** Chemin dans le projet, ex. « Assets/DevAppStore/Runtime/DevAppStoreClient.cs ». */
  pathname: string;
  meta: Buffer;
  /** Absent pour un dossier. */
  asset?: Buffer;
}

const FOLDER_META = (guid: string) =>
  Buffer.from(`fileFormatVersion: 2\nguid: ${guid}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`);

/**
 * Fichiers du paquet Unity : tout sdks/unity qui possède un `.meta`, placé sous Assets/DevAppStore avec ses GUID
 * d'origine (le prefab retrouve ainsi ses scripts). Exclus : `package.json` (manifeste UPM) et les dossiers `…~`.
 */
export function unityAssets(): UnityAsset[] {
  const assets: UnityAsset[] = [{ guid: UNITY_ROOT_GUID, pathname: UNITY_ROOT, meta: FOLDER_META(UNITY_ROOT_GUID) }];
  for (const metaFile of walk(UNITY_DIR, (n) => n.endsWith('~') || n.startsWith('.')).filter((f) => f.endsWith('.meta'))) {
    const file = metaFile.slice(0, -'.meta'.length);
    const rel = posix(path.relative(UNITY_DIR, file));
    if (rel === 'package.json' || !existsSync(file)) continue;
    const meta = readFileSync(metaFile);
    const guid = /^guid: ([0-9a-f]{32})$/m.exec(meta.toString('utf8'))?.[1];
    if (!guid) throw new Error(`GUID introuvable dans ${metaFile}`);
    assets.push({ guid, pathname: `${UNITY_ROOT}/${rel}`, meta, ...(statSync(file).isDirectory() ? {} : { asset: readFileSync(file) }) });
  }
  return assets;
}

/** Fichiers de l'archive Godot : le dossier addons/devappstore, tel qu'il doit se trouver à la racine du projet. */
export function godotFiles(): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const addons = path.join(GODOT_DIR, 'addons');
  for (const f of walk(addons, (n) => n.startsWith('.'))) {
    if (!statSync(f).isDirectory()) files.set(`addons/${posix(path.relative(addons, f))}`, readFileSync(f));
  }
  return files;
}

// ------------------------------------------------------------------ tar + gzip (.unitypackage)

function tarHeader(name: string, size: number, dir: boolean): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  h.write(dir ? '0000755\0' : '0000644\0', 100, 8, 'ascii');
  h.write('0000000\0', 108, 8, 'ascii'); // uid
  h.write('0000000\0', 116, 8, 'ascii'); // gid
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  h.write('00000000000\0', 136, 12, 'ascii'); // date : 0, pour une archive reproductible
  h.write('        ', 148, 8, 'ascii');
  h.write(dir ? '5' : '0', 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return h;
}

function tar(entries: { name: string; data?: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    if (Buffer.byteLength(e.name) > 100) throw new Error(`Nom trop long pour tar : ${e.name}`);
    parts.push(tarHeader(e.name, e.data?.length ?? 0, !e.data));
    if (e.data) parts.push(e.data, Buffer.alloc((512 - (e.data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** gzip sans date ni système d'origine dans l'en-tête. */
function gzip(data: Buffer): Buffer {
  const tail = Buffer.alloc(8);
  tail.writeUInt32LE(crc32(data), 0);
  tail.writeUInt32LE(data.length >>> 0, 4);
  return Buffer.concat([Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff]), zlib.deflateRawSync(data, { level: 9 }), tail]);
}

/** Paquet Unity : un dossier par fichier, nommé par son GUID, avec `asset`, `asset.meta` et `pathname`. */
export function buildUnityPackage(assets: UnityAsset[] = unityAssets()): Buffer {
  const entries: { name: string; data?: Buffer }[] = [];
  for (const a of assets) {
    entries.push({ name: `${a.guid}/` });
    if (a.asset) entries.push({ name: `${a.guid}/asset`, data: a.asset });
    entries.push({ name: `${a.guid}/asset.meta`, data: a.meta }, { name: `${a.guid}/pathname`, data: Buffer.from(a.pathname) });
  }
  return gzip(tar(entries));
}

/** Relit un paquet Unity : chemin du projet → contenu (null pour un dossier). */
export function readUnityPackage(pkg: Buffer): Map<string, Buffer | null> {
  const raw = zlib.gunzipSync(pkg);
  const byGuid = new Map<string, { pathname?: string; asset?: Buffer }>();
  for (let off = 0; off + 512 <= raw.length; ) {
    const name = raw.toString('utf8', off, off + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(raw.toString('ascii', off + 124, off + 135), 8) || 0;
    const data = raw.subarray(off + 512, off + 512 + size);
    const [guid, part] = name.split('/') as [string, string | undefined];
    const e = byGuid.get(guid) ?? {};
    if (part === 'pathname') e.pathname = data.toString('utf8');
    if (part === 'asset') e.asset = Buffer.from(data);
    byGuid.set(guid, e);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  const out = new Map<string, Buffer | null>();
  for (const e of byGuid.values()) if (e.pathname) out.set(e.pathname, e.asset ?? null);
  return out;
}

// ------------------------------------------------------------------ zip (Godot)

export function buildZip(files: Map<string, Buffer>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const head = Buffer.alloc(26);
    head.writeUInt16LE(20, 0); // version requise
    head.writeUInt16LE(0x0800, 2); // noms en UTF-8
    head.writeUInt16LE(8, 4); // deflate
    head.writeUInt16LE(0, 6); // heure
    head.writeUInt16LE(0x0021, 8); // date fixe : 1er janvier 1980
    head.writeUInt32LE(crc32(data), 10);
    head.writeUInt32LE(packed.length, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt16LE(nameBuf.length, 22);
    head.writeUInt16LE(0, 24);
    const lfh = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), head, nameBuf, packed]);
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4); // version d'origine
    head.copy(cdh, 6); // mêmes champs que l'en-tête local
    cdh.writeUInt32LE(0, 34); // commentaire, disque, attributs internes
    cdh.writeUInt32LE(0, 38); // attributs externes
    cdh.writeUInt32LE(offset, 42);
    local.push(lfh);
    central.push(cdh, nameBuf);
    offset += lfh.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dir, end]);
}

/** Relit une archive zip écrite par buildZip : nom → contenu. */
export function readZip(zip: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
  if (end < 0) throw new Error('Archive zip illisible');
  let p = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const packedSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    out.set(name, zlib.inflateRawSync(zip.subarray(dataStart, dataStart + packedSize)));
    p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return out;
}

// ------------------------------------------------------------------ Écriture

export function writePackages(): { file: string; bytes: number }[] {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const f of readdirSync(OUT_DIR)) if (/^devappstore-(unity|godot)-.*\.(unitypackage|zip)$/.test(f)) rmSync(path.join(OUT_DIR, f));
  const out = [
    { file: unityFile(), data: buildUnityPackage() },
    { file: godotFile(), data: buildZip(godotFiles()) },
  ];
  for (const o of out) writeFileSync(path.join(OUT_DIR, o.file), o.data);
  return out.map((o) => ({ file: o.file, bytes: o.data.length }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const p of writePackages()) console.log(`${path.relative(ROOT, path.join(OUT_DIR, p.file))} : ${(p.bytes / 1024).toFixed(1)} Ko`);
}
