#!/bin/sh
set -eu

if [ -z "${WHATSAPP_MEDIA_SCANNER_TOKEN:-}" ] || [ "${#WHATSAPP_MEDIA_SCANNER_TOKEN}" -lt 32 ]; then
  echo "WHATSAPP_MEDIA_SCANNER_TOKEN must contain at least 32 characters." >&2
  exit 1
fi

mkdir -p /run/clamav /var/lib/clamav
chown -R clamav:clamav /run/clamav /var/lib/clamav

# A scanner without current signatures must not report files as clean.
freshclam --stdout
clamd --config-file=/etc/clamav/clamd.conf --foreground &
CLAMD_PID=$!

READY=0
for _ in $(seq 1 45); do
  if nc -z 127.0.0.1 3310; then READY=1; break; fi
  if ! kill -0 "$CLAMD_PID" 2>/dev/null; then
    echo "ClamAV daemon exited before becoming ready." >&2
    exit 1
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "ClamAV did not become ready." >&2
  exit 1
fi

# Refresh definitions in the background. Scan requests continue to fail closed on daemon errors.
freshclam --daemon --foreground --daemon-notify=/etc/clamav/clamd.conf >/dev/null 2>&1 &
exec node /srv/scanner/server.mjs
