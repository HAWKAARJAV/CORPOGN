#!/bin/bash
# run.sh — One-command runner for the NGO discovery pipeline.
#
# Usage:
#   bash scripts/ngo-discovery/run.sh              # Full run (~100 NGOs)
#   bash scripts/ngo-discovery/run.sh --dry-run    # Discover + rank only, no DB
#   bash scripts/ngo-discovery/run.sh --max 5      # Full pipeline, 5 NGOs
#   bash scripts/ngo-discovery/run.sh --max 5 --dry-run
#   MAX_FETCHES=500 bash scripts/ngo-discovery/run.sh --dry-run  # Custom ceiling

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "CorpoGN NGO Discovery Pipeline"
echo "Project: $PROJECT_ROOT"
echo ""

# Ensure we're in project root (needed for .env.local)
cd "$PROJECT_ROOT"

# Check Node >= 20
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌  Node.js >= 20 required (found v$NODE_VERSION)"
  exit 1
fi

# Check .env.local exists
if [ ! -f ".env.local" ]; then
  echo "❌  .env.local not found at $PROJECT_ROOT/.env.local"
  exit 1
fi

# Check schema has been applied (warn only)
echo "⚠   Ensure ngo-discovery-schema.sql has been applied to Supabase before first run."
echo "    Run: psql \"\$DATABASE_URL\" -f scripts/ngo-discovery/ngo-discovery-schema.sql"
echo ""

node "scripts/ngo-discovery/index.mjs" "$@"
