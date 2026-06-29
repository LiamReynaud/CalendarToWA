#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-upload}"
ZIP_FILE="${2:-dist/extension.zip}"

trim() {
  local value="$1"
  value="${value//$'\r'/}"
  value="${value//$'\n'/}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

CWS_CLIENT_ID=$(trim "${CWS_CLIENT_ID:-}")
CWS_CLIENT_SECRET=$(trim "${CWS_CLIENT_SECRET:-}")
CWS_REFRESH_TOKEN=$(trim "${CWS_REFRESH_TOKEN:-}")
CWS_EXTENSION_ID=$(trim "${CWS_EXTENSION_ID:-}")
CWS_EXTENSION_ID="${CWS_EXTENSION_ID//[[:space:]]/}"

if [[ -z "$CWS_CLIENT_ID" || -z "$CWS_CLIENT_SECRET" || -z "$CWS_REFRESH_TOKEN" || -z "$CWS_EXTENSION_ID" ]]; then
  echo "Missing required environment variable (CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_EXTENSION_ID)."
  exit 1
fi

if [[ ! "$CWS_EXTENSION_ID" =~ ^[a-z]{32}$ ]]; then
  echo "Invalid CWS_EXTENSION_ID format (expected 32 lowercase letters)."
  echo "Length: ${#CWS_EXTENSION_ID}"
  exit 1
fi

if [[ ! -f "$ZIP_FILE" ]]; then
  echo "Zip file not found: $ZIP_FILE"
  exit 1
fi

echo "Requesting access token..."
TOKEN_RESPONSE=$(curl -sS -X POST "https://oauth2.googleapis.com/token" \
  --data-urlencode "client_id=${CWS_CLIENT_ID}" \
  --data-urlencode "client_secret=${CWS_CLIENT_SECRET}" \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "refresh_token=${CWS_REFRESH_TOKEN}")

if echo "$TOKEN_RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
  echo "OAuth failed:"
  echo "$TOKEN_RESPONSE" | jq .
  exit 1
fi

ACCESS_TOKEN=$(trim "$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')")
if [[ -z "$ACCESS_TOKEN" || "$ACCESS_TOKEN" == "null" ]]; then
  echo "No access_token in response:"
  echo "$TOKEN_RESPONSE" | jq .
  exit 1
fi

echo "OAuth OK"
echo "Extension ID length: ${#CWS_EXTENSION_ID}"

UPLOAD_URL="https://www.googleapis.com/upload/chromewebstore/v1.1/items/${CWS_EXTENSION_ID}?uploadType=media"
echo "Uploading ${ZIP_FILE}..."
UPLOAD_HTTP=$(curl -sS -o /tmp/cws-upload-response.json -w "%{http_code}" -X PUT "${UPLOAD_URL}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -H "Content-Type: application/zip" \
  --data-binary "@${ZIP_FILE}")

UPLOAD_RESPONSE=$(cat /tmp/cws-upload-response.json)
if [[ "$UPLOAD_HTTP" != "200" ]]; then
  echo "Upload failed (HTTP ${UPLOAD_HTTP}):"
  echo "$UPLOAD_RESPONSE" | jq . 2>/dev/null || echo "$UPLOAD_RESPONSE"
  if [[ "$UPLOAD_HTTP" == "403" ]]; then
    echo ""
    echo "403 usually means:"
    echo "  - OAuth account is not the extension owner in Developer Dashboard"
    echo "  - Chrome Web Store API not enabled in Google Cloud project"
  fi
  exit 1
fi

echo "$UPLOAD_RESPONSE" | jq .

UPLOAD_STATE=$(echo "$UPLOAD_RESPONSE" | jq -r '.uploadState // empty')
if [[ "$UPLOAD_STATE" == "FAILURE" ]]; then
  echo "Upload failed."
  exit 1
fi

if [[ "$ACTION" == "upload" ]]; then
  echo "Upload complete. Publish manually from the Developer Dashboard if needed."
  exit 0
fi

echo "Submitting for publish..."
PUBLISH_URL="https://www.googleapis.com/chromewebstore/v1.1/items/${CWS_EXTENSION_ID}/publish"
PUBLISH_HTTP=$(curl -sS -o /tmp/cws-publish-response.json -w "%{http_code}" -X POST "${PUBLISH_URL}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -H "Content-Type: application/json" \
  -d '{"deployPercentage":100}')

PUBLISH_RESPONSE=$(cat /tmp/cws-publish-response.json)
if [[ "$PUBLISH_HTTP" != "200" ]]; then
  echo "Publish failed (HTTP ${PUBLISH_HTTP}):"
  echo "$PUBLISH_RESPONSE" | jq . 2>/dev/null || echo "$PUBLISH_RESPONSE"
  exit 1
fi

echo "$PUBLISH_RESPONSE" | jq .
echo "Publish request submitted."
