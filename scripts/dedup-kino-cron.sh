#!/bin/bash
# dedup-kino-cron.sh - Roda dedup-kino a cada 6h com --auto-apply
#
# v1.0 (2026-07-25): Criado para agendar auto-hide de posts antigos.
# - --auto-apply: Fix Y (aplica hides automaticamente)
# - --no-llm: pula Stage 3 (LLM) para ser rapido
# - --days=7: lookback de 7 dias (pega posts recentes)
# - Auto-close: closePastEvents() roda automaticamente
#   - Eventos com data_evento/data_fim_evento no passado
#   - Oportunidades com deadline_date no passado (Fix S3)
#
# Frequencia: 6h (4x por dia) - balanceia freshness vs carga
# Logs: /var/log/cadu-dedup-kino.log

set -euo pipefail

LOG_FILE="/var/log/cadu-dedup-kino.log"
SCRIPT_PATH="/docker/openclaw-hahq/data/.openclaw/workspace/scripts/dedup-kino.js"
SUPABASE_URL="${KC_SUPABASE_URL:-https://wacyrkwhkvzwkqpolrbg.supabase.co}"
SUPABASE_ANON_KEY="${KC_SUPABASE_ANON_KEY:?KC_SUPABASE_ANON_KEY is required}"
SUPABASE_SERVICE_ROLE_KEY="${KC_SUPABASE_SERVICE_ROLE_KEY:?KC_SUPABASE_SERVICE_ROLE_KEY is required}"
CADU_KINO_EMAIL="${CADU_KINO_EMAIL:?CADU_KINO_EMAIL is required}"
CADU_KINO_PASSWORD="${CADU_KINO_PASSWORD:?CADU_KINO_PASSWORD is required}"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

echo "=== [$(date -Iseconds)] dedup-kino-cron start ===" >> "$LOG_FILE"

# Source env vars
if [ -f /etc/openclaw-cron.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/openclaw-cron.env
  set +a
fi

# Run dedup-kino with auto-apply
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
CADU_KINO_EMAIL="$CADU_KINO_EMAIL" \
CADU_KINO_PASSWORD="$CADU_KINO_PASSWORD" \
  node "$SCRIPT_PATH" --auto-apply --no-llm --days=7 \
  >> "$LOG_FILE" 2>&1 || {
    rc=$?
    echo "   ❌ dedup-kino failed with exit code $rc" >> "$LOG_FILE"
    exit $rc
  }

echo "=== [$(date -Iseconds)] dedup-kino-cron done ===" >> "$LOG_FILE"
