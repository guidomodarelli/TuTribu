#!/bin/bash

# Vercel ignoreCommand: exit 0 skips the build, exit 1 builds.
# Dependencies are not installed yet at this step, so `npx` downloads the
# dependency-free @astra-kit/rp at the range declared in package.json and runs
# `astra-rp ignore-build`: only the next stable patch, minor or major version
# of package.json is built. Anything that prevents a BUILD decision (no
# Node.js, npx or network failure, gate error) skips the build.

set -u

NODE_BINARY=$(command -v node || command -v node.exe || true)

if [ -z "$NODE_BINARY" ]; then
  echo "Node.js was not found; the version cannot be verified. Skipping build."
  exit 0
fi

ASTRA_RP_RANGE=$("$NODE_BINARY" -p "require('./package.json').devDependencies['@astra-kit/rp'] ?? ''" 2>/dev/null || true)

if [ -z "$ASTRA_RP_RANGE" ]; then
  echo "@astra-kit/rp is not declared in devDependencies; the version cannot be verified. Skipping build."
  exit 0
fi

GATE_OUTPUT=$(npx --yes --package "@astra-kit/rp@$ASTRA_RP_RANGE" astra-rp ignore-build)
GATE_EXIT_CODE=$?
echo "$GATE_OUTPUT"

if [ "$GATE_EXIT_CODE" -ne 0 ]; then
  echo "The build gate failed with exit code $GATE_EXIT_CODE. Skipping build."
  exit 0
fi

if [ "$(printf '%s\n' "$GATE_OUTPUT" | tail -n 1)" = "BUILD" ]; then
  exit 1
fi

exit 0
