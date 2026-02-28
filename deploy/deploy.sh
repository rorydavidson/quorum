#!/usr/bin/env bash
#
# Quorum — build and deploy
#
# Usage:
#   sudo bash deploy/deploy.sh
#
# Run from the repo root (e.g., /opt/quorum), or the script will detect
# the correct root automatically based on its own location.
#
# What this script does:
#   1. Installs dependencies (pnpm install --frozen-lockfile)
#   2. Builds packages/types, apps/bff, apps/web
#   3. Copies Next.js static assets into standalone output
#   4. Sets ownership to quorum:quorum
#   5. Restarts systemd services (BFF first, then web)
#   6. Waits for BFF health check before starting web

set -euo pipefail

QUORUM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${QUORUM_DIR}"

echo "==> Deploying Quorum from ${QUORUM_DIR}"
echo "    $(date -Iseconds)"

# ── 1. Dependencies ─────────────────────────────────────────────────────────

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

# ── 2. Build ─────────────────────────────────────────────────────────────────

echo "==> Building packages/types..."
pnpm --filter types build

echo "==> Building apps/bff..."
pnpm --filter bff build

echo "==> Building apps/web..."
pnpm --filter web build

# ── 3. Next.js standalone asset copy ────────────────────────────────────────

# The standalone output does not include static assets or public/.
# They must be copied manually (this is standard Next.js standalone behaviour).
STANDALONE_DIR="${QUORUM_DIR}/apps/web/.next/standalone"

if [ -d "${STANDALONE_DIR}" ]; then
    echo "==> Copying Next.js static assets into standalone..."

    mkdir -p "${STANDALONE_DIR}/apps/web/.next"
    cp -r "${QUORUM_DIR}/apps/web/.next/static" \
          "${STANDALONE_DIR}/apps/web/.next/static"

    if [ -d "${QUORUM_DIR}/apps/web/public" ]; then
        cp -r "${QUORUM_DIR}/apps/web/public" \
              "${STANDALONE_DIR}/apps/web/public"
    fi
else
    echo "ERROR: Standalone directory not found at ${STANDALONE_DIR}"
    echo "       Check that next.config.ts has output: 'standalone'"
    exit 1
fi

# ── 4. Ownership ────────────────────────────────────────────────────────────

echo "==> Setting file ownership..."
chown -R quorum:quorum "${QUORUM_DIR}"

# ── 5. Restart services ─────────────────────────────────────────────────────

echo "==> Restarting BFF..."
systemctl restart quorum-bff.service
echo "    Waiting for BFF to become healthy..."

# Wait up to 30 seconds for BFF health check
for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:3001/health > /dev/null 2>&1; then
        echo "    BFF healthy after ${i}s"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "    WARNING: BFF did not become healthy within 30s"
        echo "    Check logs: journalctl -u quorum-bff -n 50"
    fi
    sleep 1
done

echo "==> Restarting Web..."
systemctl restart quorum-web.service
sleep 3

# ── 6. Status ───────────────────────────────────────────────────────────────

echo ""
echo "==> Service status:"
systemctl is-active --quiet quorum-bff && echo "    quorum-bff: active" || echo "    quorum-bff: FAILED"
systemctl is-active --quiet quorum-web && echo "    quorum-web: active" || echo "    quorum-web: FAILED"

echo ""
echo "==> Deploy complete. Useful commands:"
echo "      journalctl -u quorum-bff -f     # BFF logs"
echo "      journalctl -u quorum-web -f     # Web logs"
echo "      systemctl status quorum-bff     # BFF status"
echo "      systemctl status quorum-web     # Web status"
echo "      curl http://127.0.0.1:3001/health  # BFF health check"
