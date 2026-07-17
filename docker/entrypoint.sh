#!/bin/sh
set -eu

BACKEND_URL_VALUE="${BACKEND_URL:-http://localhost:8080}"
ESCAPED_BACKEND_URL=$(printf '%s' "$BACKEND_URL_VALUE" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat > /usr/share/nginx/html/env.js <<EOF
window.__PFI_CONFIG__ = {"API_BASE_URL":"$ESCAPED_BACKEND_URL"};
EOF
