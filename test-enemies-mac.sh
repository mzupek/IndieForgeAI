#!/bin/bash
# Wrapper so 2a sits with the other test-*-mac.sh scripts.
exec "$(dirname "$0")/scripts/test-enemies-mac.sh"
