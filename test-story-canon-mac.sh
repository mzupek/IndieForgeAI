#!/bin/bash
# Wrapper so story canon sits with the other test-*-mac.sh scripts.
exec "$(dirname "$0")/scripts/test-story-canon-mac.sh"
