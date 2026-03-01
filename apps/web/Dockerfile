# Quorum Web (Next.js) — multi-stage Docker build
# Build context: repository root (for monorepo workspace resolution)

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /repo

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Layer-cache: copy only manifests first, then install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY pnpm-approved-builds.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/
# BFF package.json needed because pnpm-workspace.yaml references apps/*
COPY apps/bff/package.json ./apps/bff/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/types ./packages/types
COPY apps/web ./apps/web

# Build types first (web depends on @snomed/types)
RUN pnpm --filter @snomed/types build

# Build Next.js (produces .next/standalone via output: 'standalone' in next.config.ts)
# BFF_URL must be set at build time because Next.js middleware (Edge Runtime)
# inlines process.env values during compilation — they are NOT read at runtime.
# Inside the Docker network, the web container reaches BFF via its service name.
ENV BFF_URL=http://bff:3001
RUN pnpm --filter web build

# ── Stage 2: runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S quorum && adduser -S quorum -G quorum

# Standalone server — outputFileTracingRoot is ../../ (monorepo root)
# so standalone output preserves the apps/web/ directory structure
COPY --from=builder --chown=quorum:quorum /repo/apps/web/.next/standalone ./

# Static assets must be copied manually (standard Next.js standalone behaviour)
COPY --from=builder --chown=quorum:quorum /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=quorum:quorum /repo/apps/web/public ./apps/web/public

USER quorum
EXPOSE 3000

# Next.js standalone health check — the landing page always returns 200
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

# Entry point mirrors the monorepo layout inside standalone output
CMD ["node", "apps/web/server.js"]
