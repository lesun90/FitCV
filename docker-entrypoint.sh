#!/bin/sh
HASH_FILE=/app/node_modules/.package-lock-hash
CURRENT_HASH=$(md5sum /app/package-lock.json | cut -d' ' -f1)

if [ ! -f "$HASH_FILE" ] || [ "$(cat "$HASH_FILE")" != "$CURRENT_HASH" ]; then
  echo "package-lock.json changed — running npm ci..."
  npm ci
  echo "$CURRENT_HASH" > "$HASH_FILE"
fi

exec "$@"
