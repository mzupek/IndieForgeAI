#!/bin/bash
# Wrapper so Step 4 sits with the other test-*-mac.sh scripts.
exec "$(dirname "$0")/scripts/test-npcs-dialogue-mac.sh"
