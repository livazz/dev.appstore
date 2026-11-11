import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildUnityPackage, buildZip, godotFile, godotFiles, godotVersion, OUT_DIR, readUnityPackage, readZip, ROOT, UNITY_ROOT, unityAssets, unityFile,
  unityVersion,
} from '../../../../../scripts/pack-sdks';
import { SDK_PACKAGES } from './sdk-packages';

const HINT = 'relancez `npm run sdk:pack` après avoir modifié sdks/unity ou sdks/godot';

describe('paquets SDK téléchargeables (/sdk)', () => {
  it('les versions annoncées sont celles des SDK', () => {
    expect(SDK_PACKAGES.unity.version).toBe(unityVersion());
    expect(SDK_PACKAGES.godot.version).toBe(godotVersion());
    expect(SDK_PACKAGES.unity.href).toBe(`/sdk/${unityFile()}`);
    expect(SDK_PACKAGES.godot.href).toBe(`/sdk/${godotFile()}`);
    const client = readFileSync(path.join(ROOT, 'sdks/unity/Runtime/DevAppStoreClient.cs'), 'utf8');
    expect(client).toContain(`Version = "${unityVersion()}"`);
    expect(readFileSync(path.join(ROOT, 'sdks/godot/addons/devappstore/devappstore.gd'), 'utf8')).toContain(`SDK_VERSION := "${godotVersion()}"`);
  });

  it('le paquet Unity publié contient exactement les sources, sous Assets/DevAppStore', () => {
    const file = path.join(OUT_DIR, unityFile());
    expect(existsSync(file), HINT).toBe(true);
    const published = readUnityPackage(readFileSync(file));
    const sources = unityAssets();
    expect([...published.keys()].sort()).toEqual(sources.map((a) => a.pathname).sort());
    for (const a of sources) expect(published.get(a.pathname)?.equals(a.asset!) ?? null, `${a.pathname} : ${HINT}`).toBe(a.asset ? true : null);
    // Le prefab et ses deux scripts voyagent ensemble, avec leurs identifiants.
    const prefab = published.get(`${UNITY_ROOT}/Prefabs/DevAppStore.prefab`)!.toString('utf8');
    for (const script of ['DevAppStoreClient', 'DevAppStoreDropIn']) {
      const guid = /^guid: ([0-9a-f]{32})$/m.exec(readFileSync(path.join(ROOT, `sdks/unity/Runtime/${script}.cs.meta`), 'utf8'))![1];
      expect(prefab, script).toContain(`guid: ${guid}`);
    }
    expect([...published.keys()].some((p) => p.includes('Tests~') || p.endsWith('package.json'))).toBe(false);
  });

  it('l’archive Godot publiée contient exactement addons/devappstore', () => {
    const file = path.join(OUT_DIR, godotFile());
    expect(existsSync(file), HINT).toBe(true);
    const published = readZip(readFileSync(file));
    const sources = godotFiles();
    expect([...published.keys()].sort()).toEqual([...sources.keys()].sort());
    for (const [name, data] of sources) expect(published.get(name)!.equals(data), `${name} : ${HINT}`).toBe(true);
    expect([...sources.keys()]).toEqual(expect.arrayContaining(['addons/devappstore/plugin.cfg', 'addons/devappstore/devappstore.gd', 'addons/devappstore/link_button.tscn']));
  });

  it('archives relisibles après écriture (tar + gzip, zip)', () => {
    const assets = unityAssets();
    expect(readUnityPackage(buildUnityPackage(assets)).size).toBe(assets.length);
    const files = new Map([['a/é.txt', Buffer.from('bonjour')], ['b.bin', Buffer.alloc(3000, 7)]]);
    const back = readZip(buildZip(files));
    expect(back.get('a/é.txt')!.toString()).toBe('bonjour');
    expect(back.get('b.bin')!.equals(files.get('b.bin')!)).toBe(true);
  });
});
