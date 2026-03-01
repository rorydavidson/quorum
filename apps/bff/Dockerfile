# Quorum BFF — multi-stage Docker build
# Build context: repository root (for monorepo workspace resolution)

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /repo

# Native compilation tools for better-sqlite3 (in dependencies, compiled but unused in prod)
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Layer-cache: copy only manifests first, then install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY pnpm-approved-builds.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/bff/package.json ./apps/bff/
# Web package.json needed because pnpm-workspace.yaml references apps/*
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/types ./packages/types
COPY apps/bff ./apps/bff

RUN pnpm --filter @snomed/types build
RUN pnpm --filter bff build

# Create a self-contained production deployment bundle.
# pnpm deploy resolves workspace:* symlinks and copies production deps.
# NOTE: pnpm deploy respects .gitignore, which excludes dist/ — so we must
# copy dist/ explicitly afterwards, all in one RUN to ensure atomicity.
RUN pnpm --filter bff deploy --prod /app/deployed \
    && cp -r /repo/apps/bff/dist /app/deployed/dist \
    && echo "=== Verifying BFF build ===" \
    && ls -la /app/deployed/dist/ \
    && test -f /app/deployed/dist/index.js

# ── Stage 2: runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S quorum && adduser -S quorum -G quorum

# Copy the deployed bundle (includes node_modules with native better-sqlite3 built for Alpine)
COPY --from=builder --chown=quorum:quorum /app/deployed ./

USER quorum
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
