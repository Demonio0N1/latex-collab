#!/usr/bin/env bash
# Rebuild the Yjs CRDT bridge that the native app runs in JavaScriptCore.
# Requires the repo's npm deps (yjs, y-protocols, lib0) — run `npm install`
# at the repo root first. The output (ios/Resources/yjs-bridge.js) is
# committed, so this only needs re-running when the bridge source changes.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
node_modules/.bin/esbuild ios/bridge/yjs-bridge.js \
  --bundle --format=iife --platform=neutral \
  --main-fields=module,main --target=es2017 \
  --outfile=ios/Resources/yjs-bridge.js
echo "Built ios/Resources/yjs-bridge.js"
