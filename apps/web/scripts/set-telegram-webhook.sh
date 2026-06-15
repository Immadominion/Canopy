#!/usr/bin/env bash
#
# Register (or re-point) the Telegram webhook for the publisher-approval bot.
#
# The webhook tells Telegram where to POST inbound updates — i.e. the founder's
# taps on the inline Approve / Reject buttons. It must point at a STABLE public
# URL. During local dev this is often a `cloudflared`/ngrok tunnel; that tunnel
# dies when the dev session ends, leaving the webhook pointed at a dead host
# (Telegram then reports `last_error_message: Wrong response ... 530`). Whenever
# you go to production — or the tunnel rotates — re-run this against the live
# domain.
#
# Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment, or
# from apps/web/.env.local if not already exported.
#
# Usage:
#   ./apps/web/scripts/set-telegram-webhook.sh https://www.trycanopy.xyz
#   ./apps/web/scripts/set-telegram-webhook.sh --info        # just print current state
#   ./apps/web/scripts/set-telegram-webhook.sh --delete      # remove the webhook
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

# Load token + secret from .env.local if they aren't already in the environment.
load_var() {
  local name="$1"
  if [[ -z "${!name:-}" && -f "$ENV_FILE" ]]; then
    local line
    line="$(grep -E "^${name}=" "$ENV_FILE" | head -1 || true)"
    if [[ -n "$line" ]]; then
      export "${name}=${line#*=}"
    fi
  fi
}

load_var TELEGRAM_BOT_TOKEN
load_var TELEGRAM_WEBHOOK_SECRET

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "error: TELEGRAM_BOT_TOKEN is not set (export it or add it to apps/web/.env.local)" >&2
  exit 1
fi

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

case "${1:-}" in
  --info)
    echo "Current webhook state:"
    curl -s "${API}/getWebhookInfo"
    echo
    exit 0
    ;;
  --delete)
    echo "Deleting webhook…"
    curl -s "${API}/deleteWebhook?drop_pending_updates=true"
    echo
    exit 0
    ;;
  "")
    echo "usage: $0 <https-base-url> | --info | --delete" >&2
    echo "  e.g. $0 https://www.trycanopy.xyz" >&2
    exit 1
    ;;
esac

BASE_URL="${1%/}"
WEBHOOK_URL="${BASE_URL}/api/v1/telegram/webhook"

if [[ "$WEBHOOK_URL" != https://* ]]; then
  echo "error: Telegram requires an https URL (got: $WEBHOOK_URL)" >&2
  exit 1
fi

echo "Registering webhook → ${WEBHOOK_URL}"

# secret_token is echoed back by Telegram in the X-Telegram-Bot-Api-Secret-Token
# header on every inbound update; the webhook route checks it. allowed_updates is
# scoped to the only update types the bot handles.
curl -s "${API}/setWebhook" \
  --data-urlencode "url=${WEBHOOK_URL}" \
  ${TELEGRAM_WEBHOOK_SECRET:+--data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}"} \
  --data-urlencode 'allowed_updates=["callback_query","message"]' \
  --data-urlencode "drop_pending_updates=true"
echo

if [[ -z "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  echo "warning: TELEGRAM_WEBHOOK_SECRET was not set, so the webhook is registered WITHOUT" >&2
  echo "         a secret token. The route rejects unsecured calls in production — set the" >&2
  echo "         secret and re-run, and make sure the same value is in your Vercel env." >&2
fi

echo
echo "Verifying:"
curl -s "${API}/getWebhookInfo"
echo
