#!/bin/sh
set -e

# Replace build-time placeholders with runtime env values
# Uses | delimiter to avoid conflicts with URL slashes
if [ -n "$NEXT_PUBLIC_API_URL" ]; then
  find .next -name '*.js' -exec sed -i "s|__NEXT_PUBLIC_API_URL__|$NEXT_PUBLIC_API_URL|g" {} +
fi

if [ -n "$NEXT_PUBLIC_WS_URL" ]; then
  find .next -name '*.js' -exec sed -i "s|__NEXT_PUBLIC_WS_URL__|$NEXT_PUBLIC_WS_URL|g" {} +
fi

exec node server.js
