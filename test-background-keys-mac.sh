#!/bin/bash
# Timed background keys + layer visibility range.
# Isolated temp data only. Does NOT run Electron or touch real studio/media.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Background keys + layer visibility range"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/storyboard/backgroundKeys.test.ts
echo ""
npx tsx src/shared/storyboard/layerVisibilityRange.test.ts
echo ""
npx tsx src/shared/storyboard/timelinePointer.test.ts
echo ""
npx tsx src/shared/storyboard/shotDuration.test.ts
echo ""
npx tsx src/shared/storyboard/mediaLoadGuard.test.ts
echo ""
npx tsx src/shared/storyboard/shotBackground.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-bg-keys-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"

json_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]);
print(d['id'] if isinstance(d, dict) else d[0]['id'])"
}

key_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]); print(d['key']['id'])"
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
TEST_IMAGE2="$TEST_DIR/test-image-2.png"
IMG="$TEST_IMAGE" IMG2="$TEST_IMAGE2" python3 - <<'PY'
import struct, zlib, pathlib, os
def png(path, r, g, b):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes([r, g, b, 255]) * 8 for _ in range(8))
    ihdr = struct.pack('>IIBBBBB', 8, 8, 8, 6, 0, 0, 0)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    pathlib.Path(path).write_bytes(data)
png(os.environ['IMG'], 0, 80, 200)
png(os.environ['IMG2'], 200, 40, 0)
PY
[ -f "$TEST_IMAGE" ] && [ -f "$TEST_IMAGE2" ] || fail "Failed to create test images"
pass "Fixture PNGs created"

mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy",
    "description": "background keys isolated studio",
    "games": [
      {
        "id": "game-test",
        "name": "Test Game",
        "engine": "unity",
        "exportRoot": "./exports/test",
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

SB=$($CLI storyboard create --game game-test --name "BG Keys Board")
SB_ID=$(echo "$SB" | json_id)
SHOT=$($CLI shot add --storyboard "$SB_ID" --name "Establish" --duration 4)
SHOT_ID=$(echo "$SHOT" | json_id)
STATIC=$($CLI asset create --game game-test --name "Static Logo" --category logo --image "$TEST_IMAGE")
STATIC_ID=$(echo "$STATIC" | json_id)
LAYER=$($CLI layer add --shot "$SHOT_ID" --text "Title" --z 1)
LAYER_ID=$(echo "$LAYER" | json_id)
[ -n "$SHOT_ID" ] && [ -n "$STATIC_ID" ] && [ -n "$LAYER_ID" ] || fail "setup ids"
pass "Shot + library still + text layer"

echo ""
echo "----------------------------------------"
echo "CLI: background-key add/list/show/update/remove"
echo "----------------------------------------"
ADD=$($CLI shot background-key add --shot "$SHOT_ID" --time 1.25 --background-asset "$STATIC_ID")
echo "$ADD" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['key']['backgroundVisualAssetId']=='$STATIC_ID'
assert abs(d['key']['t']-1.25)<1e-9
assert d['key']['schemaVersion']==1
"
KEY_ID=$(echo "$ADD" | key_id)
[ -n "$KEY_ID" ] || fail "key id"

LIST=$($CLI shot background-key list --shot "$SHOT_ID")
echo "$LIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert len(d)==1 and d[0]['id']=='$KEY_ID'
"

SHOW=$($CLI shot background-key show --id "$KEY_ID")
echo "$SHOW" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['shotId']=='$SHOT_ID'
assert d['key']['id']=='$KEY_ID'
"

UPD=$($CLI shot background-key update --id "$KEY_ID" --time 2.0)
echo "$UPD" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert abs(d['key']['t']-2.0)<1e-9
"
pass "background-key add/list/show/update roundtrip"

IMG_ADD=$($CLI shot background-key add --shot "$SHOT_ID" --time 3.0 --background-image "$TEST_IMAGE2")
IMG_KEY=$(echo "$IMG_ADD" | key_id)
echo "$IMG_ADD" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['key']['backgroundImage'].startswith('backgrounds/'), d
assert not d['key'].get('backgroundVisualAssetId')
"
pass "background-key direct image copied into studio backgrounds/"

python3 - "$TEST_DIR/studio.json" "$SHOT_ID" <<'PY'
import json,sys
studio=json.load(open(sys.argv[1]))
shot=next(s for s in studio['assetPipeline']['storyboardShots'] if s['id']==sys.argv[2])
assert 'backgroundKeys' in shot and len(shot['backgroundKeys'])==2, shot
PY
pass "keys persisted on the shot (A4 can carry them)"

echo ""
echo "----------------------------------------"
echo "CLI: validation + shrink guard"
echo "----------------------------------------"
if $CLI shot background-key add --shot "$SHOT_ID" --time 9 --background-asset "$STATIC_ID" 2>&1 | grep -q "after shot duration"; then
  pass "Background key past shot duration rejected"
else
  fail "Out-of-range background key was accepted"
fi

if $CLI shot update --id "$SHOT_ID" --duration 1 2>&1 | grep -q "background key"; then
  pass "Shot-shrink blocked by background key"
else
  fail "Shot shrink silently truncated background key"
fi

$CLI shot background-key remove --id "$KEY_ID" >/dev/null
$CLI shot background-key remove --id "$IMG_KEY" >/dev/null
EMPTY=$($CLI shot background-key list --shot "$SHOT_ID")
echo "$EMPTY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d==[] or len(d)==0
"
pass "remove deletes the key only"

echo ""
echo "----------------------------------------"
echo "CLI: layer visible-from / visible-to"
echo "----------------------------------------"
$CLI layer update --shot "$SHOT_ID" --id "$LAYER_ID" --visible-from 1 --visible-to 3 >/dev/null
python3 - "$TEST_DIR/studio.json" "$SHOT_ID" "$LAYER_ID" <<'PY'
import json,sys
studio=json.load(open(sys.argv[1]))
shot=next(s for s in studio['assetPipeline']['storyboardShots'] if s['id']==sys.argv[2])
layer=next(l for l in shot['layers'] if l['id']==sys.argv[3])
assert layer.get('visibleFromSec')==1, layer
assert layer.get('visibleToSec')==3, layer
assert layer.get('visible') is not False
PY
pass "visible-from/to persisted; eye visible unchanged"

if $CLI shot update --id "$SHOT_ID" --duration 2 2>&1 | grep -q "present until"; then
  pass "Shot-shrink blocked by visibility to"
else
  fail "Shot shrink silently truncated visibility range"
fi

$CLI layer update --shot "$SHOT_ID" --id "$LAYER_ID" --clear-visible-range >/dev/null
python3 - "$TEST_DIR/studio.json" "$SHOT_ID" "$LAYER_ID" <<'PY'
import json,sys
studio=json.load(open(sys.argv[1]))
shot=next(s for s in studio['assetPipeline']['storyboardShots'] if s['id']==sys.argv[2])
layer=next(l for l in shot['layers'] if l['id']==sys.argv[3])
assert 'visibleFromSec' not in layer or layer.get('visibleFromSec') is None, layer
assert 'visibleToSec' not in layer or layer.get('visibleToSec') is None, layer
PY
pass "clear-visible-range restores whole-shot presence"

echo ""
echo "----------------------------------------"
echo "CLI --help"
echo "----------------------------------------"
HELP_PARENT=$(node out/cli/forge.js shot background-key --help)
echo "$HELP_PARENT" | grep -q "add" || fail "background-key --help missing add"
echo "$HELP_PARENT" | grep -q "list" || fail "background-key --help missing list"
echo "$HELP_PARENT" | grep -q "update" || fail "background-key --help missing update"
echo "$HELP_PARENT" | grep -q "remove" || fail "background-key --help missing remove"
HELP_ADD=$(node out/cli/forge.js shot background-key add --help)
echo "$HELP_ADD" | grep -q -- "--time" || fail "add --help missing --time"
echo "$HELP_ADD" | grep -q -- "--background-asset" || fail "add --help missing --background-asset"
echo "$HELP_ADD" | grep -q -- "--background-state" || fail "add --help missing --background-state"
echo "$HELP_ADD" | grep -q -- "--background-image" || fail "add --help missing --background-image"
HELP_LAYER=$(node out/cli/forge.js layer update --help)
echo "$HELP_LAYER" | grep -q -- "--visible-from" || fail "layer update missing --visible-from"
echo "$HELP_LAYER" | grep -q -- "--visible-to" || fail "layer update missing --visible-to"
echo "$HELP_LAYER" | grep -q -- "--clear-visible-from" || fail "layer update missing --clear-visible-from"
pass "CLI --help documents background-key and visibility flags"

echo ""
echo "=========================================="
echo -e "${GREEN}All background-key / visibility-range tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified (automated, no Electron UI):"
echo "  ✓ Step/hold sample; old shots unchanged; preload path collection"
echo "  ✓ Half-open presence; omitted range = whole shot"
echo "  ✓ 7-track hit test + selected-layer range trim edges"
echo "  ✓ CLI add/list/show/update/remove; image copy; shrink guards; clear range"
echo ""
echo "NOT executed here: Mac Storyboard canvas paint of keys / range bars."
