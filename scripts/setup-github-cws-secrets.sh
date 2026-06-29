#!/usr/bin/env bash
# Copie les secrets CWS vers GitHub Actions (CalendarToWA).
# Prérequis : .env.chrome-store rempli, gh auth login

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.chrome-store"
REPO="${GITHUB_REPO:-LiamReynaud/CalendarToWA}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Fichier introuvable: $ENV_FILE"
  echo "cp .env.chrome-store.example .env.chrome-store"
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

for var in CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_EXTENSION_ID; do
  if [[ -z "${!var:-}" ]]; then
    echo "Erreur: $var manquant dans .env.chrome-store"
    exit 1
  fi
done

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI requis: brew install gh && gh auth login"
  exit 1
fi

gh secret set CWS_CLIENT_ID --repo "$REPO" --body "$CWS_CLIENT_ID"
gh secret set CWS_CLIENT_SECRET --repo "$REPO" --body "$CWS_CLIENT_SECRET"
gh secret set CWS_REFRESH_TOKEN --repo "$REPO" --body "$CWS_REFRESH_TOKEN"
gh secret set CWS_EXTENSION_ID --repo "$REPO" --body "$CWS_EXTENSION_ID"

echo "Secrets CWS configurés sur $REPO"
