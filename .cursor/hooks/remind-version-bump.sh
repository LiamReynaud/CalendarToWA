#!/usr/bin/env bash
# Vérifie versions synchronisées avant fin de session (projet CalendarToWA).
set -euo pipefail

input=$(cat)
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ ! -f "$ROOT/package.json" ]]; then
  echo '{}'
  exit 0
fi

if ! grep -q '"check:versions"' "$ROOT/package.json" 2>/dev/null; then
  exec "$HOME/.cursor/hooks/remind-version-bump-on-stop.sh"
fi

mapfile -t changed < <(
  {
    git -C "$ROOT" diff --name-only HEAD 2>/dev/null || true
    git -C "$ROOT" diff --name-only --cached 2>/dev/null || true
    git -C "$ROOT" ls-files --others --exclude-standard 2>/dev/null || true
  } | sort -u
)

code_changed=false
for f in "${changed[@]}"; do
  [[ -z "$f" ]] && continue
  if [[ "$f" =~ ^(content/|background\.js|popup/|lib/) ]]; then
    code_changed=true
    break
  fi
done

if [[ "$code_changed" == false ]]; then
  echo '{}'
  exit 0
fi

if ! (cd "$ROOT" && npm run -s check:versions >/dev/null 2>&1); then
  printf '%s\n' '{"followup_message":"CalendarToWA : npm run check:versions a échoué. Exécute npm run version:bump (+C) puis npm run check:versions avant de terminer."}'
else
  echo '{}'
fi
