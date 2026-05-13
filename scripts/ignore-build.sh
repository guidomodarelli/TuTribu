#!/bin/bash

set -u
set -o pipefail

NODE_BINARY=$(command -v node || command -v node.exe || true)

if [ -z "$NODE_BINARY" ]; then
  echo "Node.js was not found. Building."
  exit 1
fi

if ! OLD_VERSION=$(git show HEAD^:package.json | "$NODE_BINARY" -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).version"); then
  echo "Previous package version could not be read. Building."
  exit 1
fi

if ! NEW_VERSION=$("$NODE_BINARY" -pe "require('./package.json').version"); then
  echo "Current package version could not be read. Building."
  exit 1
fi

if [ "$OLD_VERSION" = "$NEW_VERSION" ]; then
  echo "Version did not change. Skipping build."
  exit 0
else
  echo "Version changed: $OLD_VERSION -> $NEW_VERSION. Building."
  exit 1
fi
