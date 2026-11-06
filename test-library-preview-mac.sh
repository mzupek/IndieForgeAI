#!/bin/bash
# Library default-state preview path selection.
# Isolated temp data only. Does not touch real studio/media.
# Pure path tests + CLI create-empty → state-create → set-default.
# Does NOT verify Electron Library pixels.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Library preview path verification"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit: library preview resolver (tsx, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/storyboard/libraryPreview.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-library-preview-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"

json_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]);
print(d['id'] if isinstance(d, dict) else d[0]['id'])"
}

echo "Test directory: $TEST_DIR"
echo ""

cleanup() {
  echo ""
  echo "Cleaning up test directory: $TEST_DIR"
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

fail() {
  echo -e "${RED}✗ $1${NC}"
  exit 1
}

pass() {
  echo -e "${GREEN}✓ $1${NC}"
}

TEST_IMAGE="$TEST_DIR/test-image.png"
IMG="$TEST_IMAGE" python3 - <<'PY'
import struct, zlib, pathlib, os
def png(path, r, g, b):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes([r, g, b, 255]) * 8 for _ in range(8))
    ihdr = struct.pack('>IIBBBBB', 8, 8, 8, 6, 0, 0, 0)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    pathlib.Path(path).write_bytes(data)
png(os.environ['IMG'], 0, 80, 200)
PY
[ -f "$TEST_IMAGE" ] || fail "Failed to create test image"
pass "Fixture PNG created"

mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy",
    "description": "library preview isolated studio",
    "games": [
      {
        "id": "game-test",
        "name": "Test Game",
        "engine": "unity",
        "exportRoot": "./exports/test",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      },
      {
        "id": "game-other",
        "name": "Other Game",
        "engine": "godot",
        "exportRoot": "./exports/other",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "characters": [],
    "poses": [],
    "clips": [],
    "scenePresets": [],
    "scenes": [],
    "storyboards": [],
    "storyboardShots": [],
    "exportProfiles": [],
    "gameDefinitions": [],
    "visualAssets": [],
    "assetStates": []
  }
}
EOF
pass "Isolated studio.json written"

echo ""
echo "----------------------------------------"
echo "CLI: static --image vs create-empty → state → set-default"
echo "----------------------------------------"
STATIC=$($CLI asset create --game game-test --name "Static Logo" --category logo --image "$TEST_IMAGE")
STATIC_ID=$(echo "$STATIC" | json_id)
echo "$STATIC" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('thumbnail'), d
assert d.get('image'), d
"

HOUSING=$($CLI asset create --game game-test --name "Keypad Housing" --category prop)
HOUSING_ID=$(echo "$HOUSING" | json_id)
echo "$HOUSING" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert not d.get('thumbnail'), d
assert not d.get('image'), d
assert d.get('defaultStateId') in (None, ''), d
"

IDLE=$($CLI asset-state create --game game-test --asset "$HOUSING_ID" --name "Idle" --file "$TEST_IMAGE")
IDLE_ID=$(echo "$IDLE" | json_id)
LOCKED=$($CLI asset-state create --game game-test --asset "$HOUSING_ID" --name "Locked" --file "$TEST_IMAGE")
LOCKED_ID=$(echo "$LOCKED" | json_id)
$CLI asset set-default-state "$HOUSING_ID" --game game-test --state "$IDLE_ID" >/dev/null
AFTER_IDLE=$($CLI asset show "$HOUSING_ID" --game game-test)
echo "$AFTER_IDLE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('defaultStateId')=='$IDLE_ID', d
assert not d.get('thumbnail'), d
assert not d.get('image'), d
"
pass "set-default-state does not write root thumbnail/image"

$CLI asset set-default-state "$HOUSING_ID" --game game-test --state "$LOCKED_ID" >/dev/null
AFTER_LOCKED=$($CLI asset show "$HOUSING_ID" --game game-test)
echo "$AFTER_LOCKED" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('defaultStateId')=='$LOCKED_ID', d
assert not d.get('thumbnail'), d
"

export LIBRARY_PREVIEW_GAME=game-test
npx tsx src/shared/storyboard/libraryPreview.cli-roundtrip.ts
pass "CLI path selection: static thumb; default-state file; default change; no destructive writes"

echo ""
echo "=========================================="
echo -e "${GREEN}All library preview path tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified (automated, no Electron UI):"
echo "  ✓ Static root thumbnail preferred"
echo "  ✓ create-empty → asset-state create → set-default uses state.file"
echo "  ✓ Changing default changes preview path"
echo "  ✓ set-default-state does not write asset.thumbnail"
echo "  ✓ Missing / wrong-parent / wrong-game covered in unit tests"
echo ""
echo "NOT executed here: Mac Library pixels / data-URL decode."
