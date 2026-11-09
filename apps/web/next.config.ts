import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { securityHeaders } from './src/lib/security-headers';

const nodeCryptoStub = fileURLToPath(new URL('./src/lib/node-crypto-stub.ts', import.meta.url));

const nextConfig: NextConfig = {
  // Image Docker (docs/deploy.md, Dockerfile) : serveur autonome dans .next/standalone/apps/web/server.js.
  // Sans effet sur `next dev` ni sur Vercel.
  output: 'standalone',
  // Monorepo : trace les dépendances depuis la racine du dépôt (packages/*, node_modules hoistés).
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // Paquets du monorepo publiés en TypeScript source.
  transpilePackages: ['@devappstore/core', '@devappstore/db', '@devappstore/emails', '@devappstore/importers', '@devappstore/ai-style'],
  serverExternalPackages: ['@electric-sql/pglite'],
  images: { unoptimized: true },
  // IA de style (AiStyleButton → generateStyleFromScreenshot) : le navigateur réduit la capture vers 900 Ko, mais
  // une image non décodable côté client part telle quelle. On aligne la limite des Server Actions (1 Mo par défaut)
  // sur celle du serveur (AI_STYLE_MAX_UPLOAD_BYTES = 8 Mio) + l'enveloppe multipart.
  experimental: { serverActions: { bodySizeLimit: '9mb' } },
  poweredByHeader: false,
  // Revue de sécurité (CHK-HDR-01) : CSP, frame-ancestors 'none', Referrer-Policy, Permissions-Policy, HSTS (prod).
  async headers() {
    return securityHeaders({ dev: process.env.NODE_ENV !== 'production' });
  },
  // Ajout studio-editor : @devappstore/core réexporte crypto.ts/ids.ts (node:crypto). Les composants client
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
