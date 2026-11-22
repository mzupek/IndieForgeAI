#!/bin/bash
# Wrapper so 2d sits with the other test-*-mac.sh scripts.
exec "$(dirname "$0")/scripts/test-minigame-params-mac.sh"
