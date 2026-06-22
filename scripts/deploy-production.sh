#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${NOWNOW_PRODUCTION_PAGES_PROJECT:-now-now}"
BRANCH="${NOWNOW_PRODUCTION_BRANCH:-main}"
PROD_SUPABASE_URL="https://yklskyyirfboamhtzzhp.supabase.co"

if [[ -f .env.production ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.production
  set +a
fi

if [[ -z "${VITE_SUPABASE_ANON_KEY:-}" && -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

export VITE_APP_ENV="${VITE_APP_ENV:-production}"
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-$PROD_SUPABASE_URL}"

if [[ -z "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
  echo "Missing VITE_SUPABASE_ANON_KEY. Keep it in .env.production or .env.local." >&2
  exit 1
fi

if [[ "${VITE_SUPABASE_URL%/}" != "$PROD_SUPABASE_URL" ]]; then
  echo "Refusing production deploy with non-production Supabase URL: $VITE_SUPABASE_URL" >&2
  exit 1
fi

export SUPABASE_ORIGIN="${SUPABASE_ORIGIN:-$VITE_SUPABASE_URL}"

if [[ "${SUPABASE_ORIGIN%/}" != "$PROD_SUPABASE_URL" ]]; then
  echo "Refusing production deploy with non-production Supabase origin: $SUPABASE_ORIGIN" >&2
  exit 1
fi

npm run preflight:production-schema
npm run build:production
node scripts/patch-worker-origin.mjs "$SUPABASE_ORIGIN"
npx wrangler pages deploy dist --project-name "$PROJECT_NAME" --branch "$BRANCH" --commit-dirty=true
