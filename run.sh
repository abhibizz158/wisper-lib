#!/usr/bin/env sh
# Start the local application from any working directory.
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if command -v node >/dev/null 2>&1; then
  exec node "$PROJECT_DIR/scripts/dev.mjs" "$@"
elif command -v nodejs >/dev/null 2>&1; then
  exec nodejs "$PROJECT_DIR/scripts/dev.mjs" "$@"
fi
printf '%s\n' 'Node.js 22 or 24 LTS with npm is required. Install it from https://nodejs.org/ and run this command again.' >&2
exit 1
