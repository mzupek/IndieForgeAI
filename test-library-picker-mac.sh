#!/bin/bash
# Library picker + Photoshop-style layer stack (non-UI).
# Isolated temp data only. Does not touch real studio data.
# Does not run Electron Storyboard UI.

set -e

echo "=========================================="
echo "Library picker / layer stack verification"
echo "=========================================="

echo ""
echo "Unit: Game-scoped catalog + clip routing"
npx tsx src/shared/storyboard/libraryCatalog.test.ts

echo ""
echo "Unit: layer stack reorder"
npx tsx src/shared/storyboard/layerStack.test.ts

echo ""
echo "Storage: persist z-order via updateShot (mktemp FORGE_DATA_DIR)"
npx tsx src/core/storage/layerStack.persist.test.ts

echo ""
echo "All library picker / layer stack tests passed"
