#!/bin/bash
# Shot Library background + secondary direct import.
# Isolated temp data only. Does not touch real studio/media.
# Does NOT verify Electron Storyboard canvas pixels.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Shot background Library / import verification"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit: shot background resolver (tsx, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/storyboard/shotBackground.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-shot-bg-XXXXXX)
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
    "description": "shot background isolated studio",
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

SB=$($CLI storyboard create --game game-test --name "BG Board")
SB_ID=$(echo "$SB" | json_id)
SHOT=$($CLI shot add --storyboard "$SB_ID" --name "BG Shot")
SHOT_ID=$(echo "$SHOT" | json_id)

STATIC=$($CLI asset create --game game-test --name "Static Logo" --category logo --image "$TEST_IMAGE")
STATIC_ID=$(echo "$STATIC" | json_id)
HOUSING=$($CLI asset create --game game-test --name "Keypad Housing" --category prop)
HOUSING_ID=$(echo "$HOUSING" | json_id)
IDLE=$($CLI asset-state create --game game-test --asset "$HOUSING_ID" --name "Idle" --file "$TEST_IMAGE")
IDLE_ID=$(echo "$IDLE" | json_id)
LOCKED=$($CLI asset-state create --game game-test --asset "$HOUSING_ID" --name "Locked" --file "$TEST_IMAGE")
LOCKED_ID=$(echo "$LOCKED" | json_id)
$CLI asset set-default-state "$HOUSING_ID" --game game-test --state "$IDLE_ID" >/dev/null
OTHER=$($CLI asset create --game game-other --name "Other Logo" --category logo --image "$TEST_IMAGE")
OTHER_ID=$(echo "$OTHER" | json_id)

echo ""
echo "----------------------------------------"
echo "CLI: Library static / default / explicit state"
echo "----------------------------------------"
$CLI shot update --id "$SHOT_ID" --background-asset "$STATIC_ID" >/dev/null
export SHOT_BACKGROUND_SHOT="BG Shot"
export SHOT_BACKGROUND_GAME=game-test
export SHOT_BACKGROUND_MODE=library
npx tsx src/shared/storyboard/shotBackground.cli-roundtrip.ts
pass "static Library asset: full image, not thumbnail, no backgroundImage copy"

$CLI shot update --id "$SHOT_ID" --background-asset "$HOUSING_ID" >/dev/null
npx tsx src/shared/storyboard/shotBackground.cli-roundtrip.ts
python3 - "$TEST_DIR/studio.json" "$SHOT_ID" "$IDLE_ID" <<'PY'
import json,sys
studio=json.load(open(sys.argv[1]))
shot=next(s for s in studio['assetPipeline']['storyboardShots'] if s['id']==sys.argv[2])
assert shot.get('backgroundVisualAssetId')
assert shot.get('backgroundAssetStateId') in (None, ''), shot
assert not shot.get('backgroundImage'), shot
PY
pass "default state (omit --background-state) does not copy onto backgroundImage"

$CLI shot update --id "$SHOT_ID" --background-asset "$HOUSING_ID" --background-state "$LOCKED_ID" >/dev/null
npx tsx src/shared/storyboard/shotBackground.cli-roundtrip.ts
python3 - "$TEST_DIR/studio.json" "$SHOT_ID" "$LOCKED_ID" <<'PY'
import json,sys
studio=json.load(open(sys.argv[1]))
shot=next(s for s in studio['assetPipeline']['storyboardShots'] if s['id']==sys.argv[2])
assert shot.get('backgroundAssetStateId')==sys.argv[3], shot
PY
pass "explicit Locked state persisted and reloaded"

echo ""
echo "----------------------------------------"
echo "CLI: wrong-game / wrong-parent / in-use"
echo "----------------------------------------"
if $CLI shot update --id "$SHOT_ID" --background-asset "$OTHER_ID" 2>&1 | grep -q "belongs to game"; then
  pass "wrong-game Library asset rejected"
else
  fail "wrong-game asset was accepted"
fi
if $CLI shot update --id "$SHOT_ID" --background-asset "$HOUSING_ID" --background-state "$OTHER_ID" 2>&1 | grep -qi "belong\|not found\|requires"; then
  pass "wrong-parent / invalid state rejected"
else
  fail "wrong-parent state was accepted"
fi

$CLI shot update --id "$SHOT_ID" --background-asset "$HOUSING_ID" --background-state "$LOCKED_ID" >/dev/null
if $CLI asset delete "$HOUSING_ID" --game game-test 2>&1 | grep -q "Cannot delete"; then
  pass "in-use asset delete rejected (background ref)"
else
  fail "in-use housing asset was deleted"
fi
if $CLI asset-state delete "$LOCKED_ID" --game game-test 2>&1 | grep -q "Cannot delete"; then
  pass "in-use explicit state delete rejected (background ref)"
else
  fail "in-use Locked state was deleted"
fi

echo ""
echo "----------------------------------------"
echo "CLI: clear image vs clip; direct import; missing file"
echo "----------------------------------------"
# backgroundClipId can be set to a missing clip for image-vs-clip clear tests
# without importing a real clip (clip playback is not this test).
python3 - "$TEST_DIR/studio.json" "$SHOT_ID" <<'PY'
import json,sys
p=sys.argv[1]; sid=sys.argv[2]
studio=json.load(open(p))
shot=next(s for s in studio['assetPipeline']['storyboardShots'] if s['id']==sid)
shot['backgroundClipId']='clip-placeholder'
json.dump(studio, open(p,'w'), indent=2)
PY

$CLI shot update --id "$SHOT_ID" --clear-background-image >/dev/null
python3 - "$TEST_DIR/studio.json" "$SHOT_ID" <<'PY'
import json,sys
studio=json.load(open(sys.argv[1]))
shot=next(s for s in studio['assetPipeline']['storyboardShots'] if s['id']==sys.argv[2])
assert not shot.get('backgroundVisualAssetId'), shot
assert not shot.get('backgroundImage'), shot
assert shot.get('backgroundClipId')=='clip-placeholder', shot
PY
pass "clear-background-image leaves clip"

IMPORT=$($CLI shot update --id "$SHOT_ID" --background-image "$TEST_IMAGE")
echo "$IMPORT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('backgroundImage','').startswith('backgrounds/'), d
assert d.get('backgroundVisualAssetId') in (None, '')
assert '$TEST_IMAGE' not in (d.get('backgroundImage') or '')
"
export SHOT_BACKGROUND_MODE=import
npx tsx src/shared/storyboard/shotBackground.cli-roundtrip.ts
pass "direct import copies to backgrounds/ (not original source path)"

if $CLI shot update --id "$SHOT_ID" --background-image "$TEST_DIR/missing-nope.png" 2>&1 | grep -qi "not found\|ENOENT"; then
  pass "direct import missing file fails (does not store orphan path)"
else
  fail "missing import was accepted"
fi

echo ""
echo "----------------------------------------"
echo "CLI: export data + --help"
echo "----------------------------------------"
$CLI shot update --id "$SHOT_ID" --background-asset "$STATIC_ID" >/dev/null
EXPORT_DIR="$TEST_DIR/export-out"
mkdir -p "$EXPORT_DIR"
$CLI export game-test --target "$EXPORT_DIR" >/dev/null
MANIFEST=$(find "$EXPORT_DIR" -name manifest.json | head -1)
[ -n "$MANIFEST" ] || fail "Export did not write manifest.json"
python3 - "$MANIFEST" "$STATIC_ID" <<'PY'
import json,sys
m=json.load(open(sys.argv[1]))
shots=[]
for sb in m.get('storyboards') or []:
    shots.extend(sb.get('shots') or [])
assert shots, m
shot=shots[0]
assert shot.get('backgroundVisualAssetId')==sys.argv[2], shot
assert shot.get('backgroundFile'), shot
assert 'thumbnail.png' not in (shot.get('backgroundFile') or '')
assert not shot.get('backgroundFile','').startswith('/tmp/'), shot
print('ok')
PY
pass "export includes Library asset id + resolved backgroundFile"

HELP=$($CLI shot update --help)
echo "$HELP" | grep -q -- "--background-asset" || fail "shot update --help missing --background-asset"
echo "$HELP" | grep -q -- "--background-state" || fail "shot update --help missing --background-state"
echo "$HELP" | grep -q -- "--clear-background-image" || fail "shot update --help missing --clear-background-image"
echo "$HELP" | grep -q -- "--background-image" || fail "shot update --help missing --background-image"
pass "shot update --help documents Library / import / clear"

echo ""
echo "=========================================="
echo -e "${GREEN}All shot background tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified (automated, no Electron UI):"
echo "  ✓ Static / default / explicit Library state"
echo "  ✓ Persisted + reloaded resolved full-res path"
echo "  ✓ Wrong-game / wrong-parent / in-use"
echo "  ✓ Direct import copies relative; missing file fails"
echo "  ✓ Clear image leaves clip; export stable refs"
echo ""
echo "NOT executed here: Mac Storyboard canvas pixels / file dialog."
echo "Cancel of the Import dialog is UI-only (chooseImage returns null; no write)."
