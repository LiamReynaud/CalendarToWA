#!/usr/bin/env bash
# Build + upload Calendar to WhatsApp sur le Chrome Web Store (API v1.1).
# Credentials : .env.chrome-store (local) ou secrets GitHub Actions CWS_*.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.chrome-store"
ACTION="${1:-upload}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

for var in CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_EXTENSION_ID; do
  if [[ -z "${!var:-}" ]]; then
    echo "Erreur: $var manquant."
    echo "Copiez .env.chrome-store.example → .env.chrome-store"
    echo "OAuth : réutiliser le même projet Google Cloud que Alegria / calendly_to_gsheet."
    exit 1
  fi
done

export CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_EXTENSION_ID

echo "→ Build zip (package:chrome-store)…"
npm run package:chrome-store --prefix "$ROOT"

ZIP="$ROOT/dist/extension.zip"
if [[ ! -f "$ZIP" ]]; then
  echo "Erreur: zip introuvable: $ZIP"
  exit 1
fi

chmod +x "$ROOT/scripts/publish-cws.sh"
"$ROOT/scripts/publish-cws.sh" "$ACTION" "$ZIP"

echo ""
echo "Suivi: https://chrome.google.com/webstore/devconsole"
echo "Fiche publique: https://chromewebstore.google.com/detail/${CWS_EXTENSION_ID}"
