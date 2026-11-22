#!/bin/bash
# Wrapper so Step 3 sits with the other test-*-mac.sh scripts.
exec "$(dirname "$0")/scripts/test-flags-triggers-mac.sh"
