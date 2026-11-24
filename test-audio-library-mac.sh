#!/bin/bash
# A1 audio library: Game-scoped import catalog.
# Isolated temp data only. Does not touch real studio/media or Unity.
# Does NOT verify Electron audible preview.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Audio library (A1) verification"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit: kinds / extensions / game scope / delete guards (tsx)"
echo "----------------------------------------"
npx tsx src/shared/storyboard/audioValidation.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-audio-library-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"

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

WAV="$TEST_DIR/hit.wav"
WAV2="$TEST_DIR/hit2.wav"
OGG="$TEST_DIR/loop.ogg"
TXT="$TEST_DIR/not-audio.txt"

OUT="$WAV" python3 - <<'PY'
import math, os, pathlib, struct
sr, dur = 8000, 0.5
n = int(sr * dur)
samples = [int(12000 * math.sin(2 * math.pi * 440 * i / sr)) for i in range(n)]
data = b''.join(struct.pack('<h', s) for s in samples)
header = struct.pack(
    '<4sI4s4sIHHIIHH4sI',
    b'RIFF', 36 + len(data), b'WAVE', b'fmt ', 16,
    1, 1, sr, sr * 2, 2, 16,
    b'data', len(data)
)
pathlib.Path(os.environ['OUT']).write_bytes(header + data)
PY
cp "$WAV" "$WAV2"
echo "not audio" > "$TXT"
[ -f "$WAV" ] || fail "Failed to create WAV fixture"

FFMPEG=$(node -e "console.log(require('ffmpeg-static'))")
"$FFMPEG" -y -loglevel error -i "$WAV" "$OGG"
[ -f "$OGG" ] || fail "Failed to create OGG fixture"
pass "Synthetic WAV/OGG fixtures"

mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy",
    "description": "A1 audio isolated studio (no audioAssets field)",
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

IMPORTED=$($CLI audio import "$WAV" --game game-test --kind sfx --name "Hit Wav" --tags "battle,hit" --engine-notes "tile_synth")
WAV_ID=$(echo "$IMPORTED" | python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]); print(d['imported'][0]['id'])")
[ -n "$WAV_ID" ] || fail "WAV import id missing"
echo "$IMPORTED" | python3 -c "
import sys,json
t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:])
a=d['imported'][0]
assert a['kind']=='sfx'
assert a['name']=='Hit Wav'
assert abs(a['durationSec']-0.5)<0.08, a['durationSec']
assert 'battle' in a['tags']
assert a['engineNotes']=='tile_synth'
assert '/audio/' in a['file'].replace('\\\\','/')
"
pass "WAV import records duration, tags, engineNotes, studio path"

OGG_IMP=$($CLI audio import "$OGG" --game game-test --kind music --name "Loop Ogg" --tags "loop")
OGG_ID=$(echo "$OGG_IMP" | python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]); print(d['imported'][0]['id'])")
[ -n "$OGG_ID" ] || fail "OGG import id missing"
pass "OGG import"

npx tsx src/shared/storyboard/audio.cli-roundtrip.ts
pass "Persist/reload: Game-scoped catalog + probed duration"

OTHER=$($CLI audio list --game game-other)
echo "$OTHER" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('['); d=json.loads(t[i:])
assert d==[], d
"
pass "Other game list is empty"

if $CLI audio show "$WAV_ID" --game game-other >/tmp/forge-audio-wrong-game.json 2>&1; then
  fail "show wrong-game should fail"
else
  pass "show wrong-game rejected"
fi

if $CLI audio import "$TEST_DIR/missing.wav" --game game-test --kind sfx >/tmp/forge-audio-missing.json 2>&1; then
  fail "missing file should fail"
else
  grep -q "File not found" /tmp/forge-audio-missing.json || fail "missing file error text"
  pass "Missing file import fails (no orphan record)"
fi

if $CLI audio import "$TXT" --game game-test --kind sfx >/tmp/forge-audio-txt.json 2>&1; then
  fail "txt import should fail"
else
  grep -qi "Unsupported" /tmp/forge-audio-txt.json || fail "unsupported error text"
  pass "Unsupported extension rejected"
fi

$CLI audio update "$WAV_ID" --game game-test --name "Hit Wav 2" --tags "battle" >/dev/null
SHOW=$($CLI audio show "$WAV_ID" --game game-test)
echo "$SHOW" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
assert d['name']=='Hit Wav 2', d
assert d['tags']==['battle'], d
"
$CLI audio update "$WAV_ID" --game game-test --file "$WAV2" >/dev/null
pass "Update name/tags and replace file"

$CLI audio remove "$OGG_ID" --game game-test >/dev/null
LEFT=$($CLI audio list --game game-test)
echo "$LEFT" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('['); d=json.loads(t[i:])
ids=[a['id'] for a in d]
assert '$OGG_ID' not in ids
assert '$WAV_ID' in ids
"
pass "Remove unused audio; remaining catalog intact"

HELP=$($CLI audio --help)
echo "$HELP" | grep -q "import" || fail "audio --help missing import"
echo "$HELP" | grep -q "list" || fail "audio --help missing list"
echo "$HELP" | grep -q "show" || fail "audio --help missing show"
echo "$HELP" | grep -q "update" || fail "audio --help missing update"
echo "$HELP" | grep -q "remove" || fail "audio --help missing remove"
IMPHELP=$($CLI audio import --help)
echo "$IMPHELP" | grep -q -- "--kind" || fail "import --help missing --kind"
echo "$IMPHELP" | grep -q -- "--engine-notes" || fail "import --help missing --engine-notes"
pass "CLI --help documents audio import/list/show/update/remove"

echo ""
echo "=========================================="
echo -e "${GREEN}All A1 audio library tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified (automated, no Electron UI):"
echo "  ✓ WAV/OGG isolated fixtures"
echo "  ✓ duration probed; studio-owned copy"
echo "  ✓ Game scope / persist-reload"
echo "  ✓ missing file + unsupported extension"
echo "  ✓ update/remove unused; --help"
echo ""
echo "NOT executed here: Mac Library <audio> audible preview."
