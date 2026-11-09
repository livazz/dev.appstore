import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { securityHeaders } from './src/lib/security-headers';

const nodeCryptoStub = fileURLToPath(new URL('./src/lib/node-crypto-stub.ts', import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ['@wolleen/core', '@wolleen/db'],
  serverExternalPackages: ['@electric-sql/pglite'],
  images: { unoptimized: true },
  poweredByHeader: false,
  // Revue de sécurité (CHK-HDR-01) : CSP, frame-ancestors 'none', Referrer-Policy, Permissions-Policy, HSTS (prod).
  async headers() {
    return securityHeaders({ dev: process.env.NODE_ENV !== 'production' });
  },
  // Ajout studio-editor : @wolleen/core réexporte crypto.ts/ids.ts (node:crypto). Les composants client
  // (StorePanel, ItemCard, éditeur) n'utilisent que ses constantes et formatMoney/slugify, mais webpack
  // refuse le schéma « node: » dans le bundle navigateur. On le remplace côté client par un module
  // qui lève une erreur si on l'appelle (Turbopack, lui, fournit déjà un polyfill).
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:crypto$/, (resource: { request: string }) => {
          resource.request = nodeCryptoStub;
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
