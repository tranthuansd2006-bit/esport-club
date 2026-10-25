#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec docker-compose -p esportclub \
  -f docker-compose.yml \
  -f docker-compose.override.yml \
  -f docker-compose.monitoring.yml \
  -f docker-compose.exporters.yml \
  -f docker-compose.logging.yml \
  -f docker-compose.hardening.yml "$@"
