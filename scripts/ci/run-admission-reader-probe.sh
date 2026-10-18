#!/usr/bin/env bash
set -euo pipefail
exec bash "$(dirname "$0")/run-admission-reader-session.sh" node scripts/ci/run-admission-reader-probe.mjs
