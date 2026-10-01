#!/usr/bin/env bash
set -euo pipefail
npm run preflight
npm run check
npm run test
npm run build
