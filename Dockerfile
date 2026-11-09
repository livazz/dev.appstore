# syntax=docker/dockerfile:1.7
#
# Image Docker de Wolleen (apps/web, Next.js 15 en sortie « standalone »).
#
# PRÉREQUIS : apps/web/next.config.ts doit contenir (voir docs/deploy.md § Docker) :
#     output: 'standalone',
#     outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
#
# Cibles :
#   docker build -t wolleen-web .                       → image de production (cible « runner », par défaut)
#   docker build --target migrator -t wolleen-migrate . → job de migrations (drizzle-kit migrate)
#   docker build --target dev -t wolleen-dev .          → image de développement (docker-compose.yml)
#
# Debian slim plutôt qu'Alpine : binaires précompilés de sharp et de PGlite sans surprise musl.

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------------------------------------------------------------------------------------------
# Dépendances : seuls les manifestes sont copiés pour profiter du cache Docker.
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/demo-game/package.json apps/demo-game/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/sdk-js/package.json packages/sdk-js/
COPY packages/ai-style/package.json packages/ai-style/
COPY packages/importers/package.json packages/importers/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------------------------
# Développement : sources complètes, `next dev` (utilisé par docker-compose.yml).
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000 4100
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------------------------
# Migrations : `docker run --rm -e DATABASE_URL=… wolleen-migrate` avant chaque mise en production.
FROM deps AS migrator
COPY packages/core packages/core
COPY packages/db packages/db
WORKDIR /app/packages/db
CMD ["npm", "run", "db:migrate"]

# ---------------------------------------------------------------------------------------------
# Compilation Next.js. Les secrets d'exécution ne sont PAS nécessaires ici (et ne doivent pas
# être injectés dans l'image) ; seules les variables NEXT_PUBLIC_* sont figées au build.
FROM deps AS builder
ENV NODE_ENV=production
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
COPY . .
RUN npm run build -w @wolleen/web \
 && if [ ! -f apps/web/.next/standalone/apps/web/server.js ]; then \
      echo "ERREUR : sortie standalone absente. Ajoutez output: 'standalone' et outputFileTracingRoot dans apps/web/next.config.ts (voir docs/deploy.md)." >&2; \
      exit 1; \
    fi

# ---------------------------------------------------------------------------------------------
# Exécution : uniquement la sortie standalone (≈ 150 Mo), utilisateur non root.
FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
