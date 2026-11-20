#!/bin/bash
# Clip-block Mac verification (timing + CLI + export data)
# Pure timing is also in src/shared/storyboard/clipBlocks.test.ts (no Electron).
# This script uses an ffmpeg-static fixture for clip import duration metadata.
# It does NOT run the Electron Storyboard UI and does not claim manual playback.
# Isolated temp data only. Does not touch real studio data.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Clip-block Mac Verification Test"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit: clip block timing (tsx, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/storyboard/clipBlocks.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-clip-blocks-test-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"

json_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]);
print(d['id'] if isinstance(d, dict) else d[0]['id'])"
}

clip_import_id() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['imported'][0]['id'])"
}

echo "Test directory: $TEST_DIR"
echo "CLI: $CLI"
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
png(os.environ['IMG'], 0, 0, 255)
PY
[ -f "$TEST_IMAGE" ] || fail "Failed to create test image"
pass "Test image created"

FFMPEG=$(node -p "require('ffmpeg-static')" 2>/dev/null || true)
[ -n "$FFMPEG" ] && [ -x "$FFMPEG" ] || fail "ffmpeg-static not found (needed for fixture video)"
TEST_VIDEO="$TEST_DIR/test_intro.mp4"
"$FFMPEG" -y -f lavfi -i testsrc=duration=1.5:size=320x240:rate=30 -pix_fmt yuv420p "$TEST_VIDEO" >/dev/null 2>&1
[ -f "$TEST_VIDEO" ] || fail "Failed to create fixture mp4"
pass "ffmpeg-static fixture video (1.5s mp4)"

mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy",
    "description": "pre-clip-block sparse document",
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
    "gameDefinitions": []
  }
}
EOF
pass "Legacy sparse studio.json written (no clipTrack)"

echo ""
echo "----------------------------------------"
echo "Test 1: Legacy load + clip import duration + implicit play"
echo "----------------------------------------"
SB_OUT=$($CLI storyboard create --game game-test --name "Clip Board")
SB_ID=$(echo "$SB_OUT" | json_id)
SHOT_OUT=$($CLI shot add --storyboard "$SB_ID" --name "Shot One" --duration 2)
SHOT_ID=$(echo "$SHOT_OUT" | json_id)
CHAR_OUT=$($CLI character create --game game-test --name "Hero" --role player)
CHAR_ID=$(echo "$CHAR_OUT" | json_id)
$CLI pose import "$CHAR_ID" "$TEST_IMAGE" --slot ready >/dev/null
LAYER_POSE=$($CLI layer add --shot "$SHOT_ID" --z 1 --character "$CHAR_ID" --pose "$($CLI pose list "$CHAR_ID" | python3 -c "import sys,json; print(next(p['id'] for p in json.load(sys.stdin) if p['slot']=='ready'))")")
POSE_LAYER_ID=$(echo "$LAYER_POSE" | json_id)

CLIP_OUT=$($CLI clip import "$TEST_VIDEO" --game game-test --moment intro)
CLIP_ID=$(echo "$CLIP_OUT" | clip_import_id)
$CLI clip show "$CLIP_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert abs(d['durationSec']-1.5)<0.15, d
assert d['file'].endswith('.mp4'), d
"
pass "Clip import duration ~1.5s from fixture metadata"

LAYER_CLIP=$($CLI layer add --shot "$SHOT_ID" --z 2 --clip "$CLIP_ID")
CLIP_LAYER_ID=$(echo "$LAYER_CLIP" | json_id)

$CLI storyboard show --id "$SB_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
shot=next(s for s in d['shots'] if s['id']=='$SHOT_ID')
assert shot.get('clipTrack')==[] or shot.get('clipTrack') is not None
assert shot['durationSec']==2
"

sample_src() {
  local t="$1"
  $CLI shot clip sample --shot "$SHOT_ID" --time "$t" | python3 -c "
import sys,json
d=json.load(sys.stdin)
hits=[s for s in d['samples'] if s.get('layerId')=='$CLIP_LAYER_ID']
print('none' if not hits else f\"{hits[0]['sourceTimeSec']:.3f}:{'i' if hits[0]['implicit'] else 'e'}\")
"
}
[ "$(sample_src 0.5)" = "0.500:i" ] || fail "implicit at 0.5 should play source 0.5 (got $(sample_src 0.5))"
[ "$(sample_src 1.0)" != "none" ] || fail "implicit should play at t=1.0 within clip duration"
[ "$(sample_src 1.7)" = "none" ] || fail "implicit never silent-extends; t=1.7 is past min(clip~1.5, shot=2) (got $(sample_src 1.7))"
$CLI storyboard show --id "$SB_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
shot=next(s for s in d['shots'] if s['id']=='$SHOT_ID')
assert shot['durationSec']==2, shot
"
pass "Implicit legacy layer.clipId plays [0, min(clip,shot)); shot duration unchanged"

echo ""
echo "----------------------------------------"
echo "Test 2: Explicit block CRUD, trim, reverse seek, loop wrap"
echo "----------------------------------------"
BLOCK=$($CLI shot clip add --shot "$SHOT_ID" --clip "$CLIP_ID" --layer "$CLIP_LAYER_ID" --time 0.5 --source-in 0.25 --source-out 1.0)
BLOCK_ID=$(echo "$BLOCK" | json_id)
echo "$BLOCK" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert abs(d['t']-0.5)<1e-9
assert abs(d['durationSec']-0.75)<1e-9
assert abs(d['sourceInSec']-0.25)<1e-9
assert abs(d['sourceOutSec']-1.0)<1e-9
assert d['role']=='layer'
"
$CLI shot clip list --shot "$SHOT_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert any(x['id']=='$BLOCK_ID' for x in d), d
"
$CLI shot clip show --id "$BLOCK_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['id']=='$BLOCK_ID'
assert abs(d['t']-0.5)<1e-9
"

# Explicit replaces implicit: before block hidden
[ "$(sample_src 0.4)" = "none" ] || fail "before explicit block hidden (got $(sample_src 0.4))"
[ "$(sample_src 0.5)" = "0.250:e" ] || fail "at start source=in (got $(sample_src 0.5))"
[ "$(sample_src 0.9)" = "0.650:e" ] || fail "mid trim (got $(sample_src 0.9))"
[ "$(sample_src 1.25)" = "none" ] || fail "at end exclusive hidden (got $(sample_src 1.25))"

# Reverse seek is the same function of time
[ "$(sample_src 0.9)" = "0.650:e" ] || fail "reverse-equivalent mid"
[ "$(sample_src 0.4)" = "none" ] || fail "reverse-equivalent before"

# Loop wrap to t=0 hides a block that starts at 0.5
[ "$(sample_src 0)" = "none" ] || fail "loop wrap t=0 hides late block"

$CLI shot clip update --id "$BLOCK_ID" --time 0.6 >/dev/null
$CLI shot clip show --id "$BLOCK_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); assert abs(d['t']-0.6)<1e-9"
pass "CRUD + trim + reverse-equivalent sample + loop wrap"

echo ""
echo "----------------------------------------"
echo "Test 3: --extend-shot required; shrink rejected; overlap; wrong game"
echo "----------------------------------------"
if $CLI shot clip update --id "$BLOCK_ID" --time 1.6 2>&1 | grep -q "extend-shot"; then
  pass "Overflow without --extend-shot rejected"
else
  fail "Overflow was accepted without --extend-shot"
fi

$CLI shot clip update --id "$BLOCK_ID" --time 1.6 --extend-shot >/dev/null
$CLI storyboard show --id "$SB_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
shot=next(s for s in d['shots'] if s['id']=='$SHOT_ID')
assert abs(shot['durationSec']-2.35)<1e-6, shot
"
pass "Opt-in --extend-shot lengthens the shot"

if $CLI shot update --id "$SHOT_ID" --duration 1.0 2>&1 | grep -q "clip block ends"; then
  pass "Duration shrink rejected while clip block exists"
else
  fail "Duration shrink was accepted"
fi

if $CLI shot clip add --shot "$SHOT_ID" --clip "$CLIP_ID" --layer "$CLIP_LAYER_ID" --time 1.8 --source-in 0 --source-out 0.5 --extend-shot 2>&1 | grep -q "overlaps"; then
  pass "Overlap on same layer rejected"
else
  fail "Overlap was accepted"
fi

OTHER_CHAR=$($CLI character create --game game-other --name "Villain" --role player)
OTHER_CHAR_ID=$(echo "$OTHER_CHAR" | json_id)
OTHER_CLIP_OUT=$($CLI clip import "$TEST_VIDEO" --game game-other --character "$OTHER_CHAR_ID" --moment hit)
OTHER_CLIP_ID=$(echo "$OTHER_CLIP_OUT" | clip_import_id)
if $CLI shot clip add --shot "$SHOT_ID" --clip "$OTHER_CLIP_ID" --role background --time 0 --source-in 0 --source-out 0.4 2>&1 | grep -q "not in game"; then
  pass "Wrong-game clip rejected"
else
  fail "Wrong-game clip was accepted"
fi

echo ""
echo "----------------------------------------"
echo "Test 4: Background block + in-use + remove restores implicit"
echo "----------------------------------------"
BG=$($CLI shot clip add --shot "$SHOT_ID" --clip "$CLIP_ID" --role background --time 0 --source-in 0 --source-out 0.4)
BG_ID=$(echo "$BG" | json_id)
$CLI shot clip sample --shot "$SHOT_ID" --time 0.2 | python3 -c "
import sys,json
d=json.load(sys.stdin)
bg=[s for s in d['samples'] if s['role']=='background']
assert bg and bg[0]['clipId']=='$CLIP_ID' and abs(bg[0]['sourceTimeSec']-0.2)<1e-6, d
assert bg[0]['implicit'] is False
"
$CLI shot clip sample --shot "$SHOT_ID" --time 0.4 | python3 -c "
import sys,json
d=json.load(sys.stdin)
bg=[s for s in d['samples'] if s['role']=='background']
assert not bg, d
"

if $CLI clip remove "$CLIP_ID" 2>&1 | grep -q "referenced"; then
  pass "In-use clip delete rejected"
else
  fail "In-use clip was deleted"
fi

$CLI shot clip remove --id "$BLOCK_ID" >/dev/null
[ "$(sample_src 0.5)" = "0.500:i" ] || fail "after removing explicit, implicit resumes (got $(sample_src 0.5))"
$CLI shot clip list --shot "$SHOT_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert all(x['id']!='$BLOCK_ID' for x in d), d
"
pass "Background sample bounds; remove restores implicit"

echo ""
echo "----------------------------------------"
echo "Test 5: Export timing data"
echo "----------------------------------------"
EXPORT_DIR="$TEST_DIR/export-out"
mkdir -p "$EXPORT_DIR"
$CLI export game-test --target "$EXPORT_DIR" >/dev/null
MANIFEST=$(find "$EXPORT_DIR" -name manifest.json | head -1)
[ -n "$MANIFEST" ] || fail "Export did not write manifest.json"
python3 - "$MANIFEST" "$BG_ID" "$CLIP_ID" <<'PY'
import json,sys
path, bg_id, clip_id = sys.argv[1], sys.argv[2], sys.argv[3]
m=json.load(open(path))
shots=[]
for sb in m.get('storyboards') or []:
    shots.extend(sb.get('shots') or [])
assert shots, m
shot=shots[0]
track=shot.get('clipTrack') or []
assert any(b['id']==bg_id for b in track), track
b=next(b for b in track if b['id']==bg_id)
assert b['clipId']==clip_id
assert b['role']=='background'
assert 'sourceInSec' in b and 'sourceOutSec' in b and 't' in b and 'durationSec' in b
assert b.get('clipFile')
print('ok')
PY
pass "Export manifest includes clipTrack timing + clipFile (authoring data)"

echo ""
echo "----------------------------------------"
echo "Test 6: --help documents shot clip CRUD/sample"
echo "----------------------------------------"
HELP_CLIP=$($CLI shot clip --help)
echo "$HELP_CLIP" | grep -q "add" || fail "shot clip --help missing add"
echo "$HELP_CLIP" | grep -q "sample" || fail "shot clip --help missing sample"
HELP_ADD=$($CLI shot clip add --help)
echo "$HELP_ADD" | grep -q -- "--clip" || fail "shot clip add --help missing --clip"
echo "$HELP_ADD" | grep -q -- "--time" || fail "shot clip add --help missing --time"
echo "$HELP_ADD" | grep -q -- "--source-in" || fail "shot clip add --help missing --source-in"
echo "$HELP_ADD" | grep -q -- "--extend-shot" || fail "shot clip add --help missing --extend-shot"
HELP_SAMPLE=$($CLI shot clip sample --help)
echo "$HELP_SAMPLE" | grep -q -- "--time" || fail "shot clip sample --help missing --time"
pass "Accurate --help for shot clip add/list/show/update/remove/sample"

echo ""
echo "=========================================="
echo -e "${GREEN}All clip-block CLI tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified (automated, no Electron UI):"
echo "  ✓ Timing unit tests (half-open, trim, reverse seek, loop, implicit, extend, overlap)"
echo "  ✓ ffmpeg-static fixture import duration metadata"
echo "  ✓ Implicit legacy play never silent-extends"
echo "  ✓ Explicit CRUD / trim / sample / loop wrap / CLI roundtrip"
echo "  ✓ --extend-shot required; shrink rejected; overlap; wrong-game"
echo "  ✓ Background bounds; in-use delete; remove restores implicit"
echo "  ✓ Export manifest clipTrack timing data"
echo "  ✓ --help documents forge shot clip"
echo ""
echo "NOT executed here (requires Electron on Mac):"
echo "  Storyboard timeline bars, play/pause/stop/loop, reverse scrub video frames,"
echo "  forge-file decode, unsupported-host codecs. Do not treat this script as UI playback proof."
echo ""
echo "Manual Mac UI (not executed here):"
echo "  1. npm run dev, open Storyboards for the selected Game"
echo "  2. Import an mp4/webm in Clips (Game-scoped). Do not seed/mutate Matt production media."
echo "  3. Timeline Clips track: + Clip @ t, place layer or background block, drag, trim edges, edit in/out, delete"
echo "  4. Overflow prompts Extend shot (ConfirmModal) — cancel must not extend"
echo "  5. Play / Pause / Stop / Loop and scrub both directions — clip plays only on its bar"
echo "  6. Before/after the bar the clip is hidden (not last-frame freeze)"
echo "  7. Legacy backgroundClip dropdown still implicit-plays from 0 until an explicit background block exists"
echo "  8. Camera / Pose/State / Effects tracks and P3 preview still work; no C.3c FX keys"
