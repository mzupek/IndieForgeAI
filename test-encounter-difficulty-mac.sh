#!/bin/bash
# Wrapper so 2c sits with the other test-*-mac.sh scripts.
exec "$(dirname "$0")/scripts/test-encounter-difficulty-mac.sh"
