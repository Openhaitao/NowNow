#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${NOWNOW_STAGING_PAGES_PROJECT:-now-now-staging}"
BRANCH="${NOWNOW_STAGING_BRANCH:-main}"
PROD_SUPABASE_URL="https://yklskyyirfboamhtzzhp.supabase.co"

if [[ ! -f .env.staging ]]; then
  echo "Missing .env.staging. Copy .env.staging.example and fill the staging Supabase URL + anon key." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.staging
set +a

if [[ -z "${VITE_SUPABASE_URL:-}" || -z "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
  echo ".env.staging must define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." >&2
  exit 1
fi

if [[ "${VITE_SUPABASE_URL%/}" == "$PROD_SUPABASE_URL" ]]; then
  echo "Refusing to deploy staging with the production Supabase URL." >&2
  exit 1
fi

export VITE_APP_ENV="${VITE_APP_ENV:-staging}"
export SUPABASE_ORIGIN="${SUPABASE_ORIGIN:-$VITE_SUPABASE_URL}"

npm run build:staging
node scripts/patch-worker-origin.mjs "$SUPABASE_ORIGIN"
npx wrangler pages deploy dist --project-name "$PROJECT_NAME" --branch "$BRANCH" --commit-dirty=true
