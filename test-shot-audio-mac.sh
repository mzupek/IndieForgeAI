#!/bin/bash
# A2 shot audio: timed blocks + CLI sample. Isolated temp data only.
# Does NOT run Electron and does not claim audible GUI playback.
# Does not touch real studio/media or Unity.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Shot audio (A2) verification"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit: timing + playback lifecycle (tsx, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/storyboard/audioBlocks.test.ts
echo ""
npx tsx src/shared/storyboard/audioPlayback.test.ts
echo ""
npx tsx src/shared/storyboard/shotDuration.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-shot-audio-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"

json_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]);
print(d['id'] if isinstance(d, dict) else d[0]['id'])"
}

audio_import_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]); print(d['imported'][0]['id'])"
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

WAV="$TEST_DIR/hit.wav"
WAV_SHORT="$TEST_DIR/hit-short.wav"
OGG="$TEST_DIR/bed.ogg"

OUT="$WAV" DUR=0.5 python3 - <<'PY'
import math, os, pathlib, struct
sr, dur = 8000, float(os.environ['DUR'])
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
OUT="$WAV_SHORT" DUR=0.2 python3 - <<'PY'
import math, os, pathlib, struct
sr, dur = 8000, float(os.environ['DUR'])
n = int(sr * dur)
samples = [int(8000 * math.sin(2 * math.pi * 220 * i / sr)) for i in range(n)]
data = b''.join(struct.pack('<h', s) for s in samples)
header = struct.pack(
    '<4sI4s4sIHHIIHH4sI',
    b'RIFF', 36 + len(data), b'WAVE', b'fmt ', 16,
    1, 1, sr, sr * 2, 2, 16,
    b'data', len(data)
)
pathlib.Path(os.environ['OUT']).write_bytes(header + data)
PY
FFMPEG=$(node -e "console.log(require('ffmpeg-static'))")
"$FFMPEG" -y -loglevel error -i "$WAV" "$OGG"
[ -f "$WAV" ] && [ -f "$OGG" ] && [ -f "$WAV_SHORT" ] || fail "Failed to create fixtures"
pass "Synthetic WAV/OGG fixtures"

mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy",
    "description": "A2 sparse studio (no audioTrack)",
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
pass "Legacy sparse studio.json written (no audioTrack)"

SB_OUT=$($CLI storyboard create --game game-test --name "Audio Board")
SB_ID=$(echo "$SB_OUT" | json_id)
SHOT_OUT=$($CLI shot add --storyboard "$SB_ID" --name "Shot One" --duration 2)
SHOT_ID=$(echo "$SHOT_OUT" | json_id)

HIT_IMP=$($CLI audio import "$WAV" --game game-test --kind sfx --name "Hit Wav")
HIT_ID=$(echo "$HIT_IMP" | audio_import_id)
BED_IMP=$($CLI audio import "$OGG" --game game-test --kind music --name "Bed Ogg")
BED_ID=$(echo "$BED_IMP" | audio_import_id)
OTHER_IMP=$($CLI audio import "$WAV" --game game-other --kind sfx --name "Other Hit")
OTHER_ID=$(echo "$OTHER_IMP" | audio_import_id)
[ -n "$HIT_ID" ] && [ -n "$BED_ID" ] && [ -n "$OTHER_ID" ] || fail "audio import ids"
pass "Imported Game-scoped WAV sfx + OGG music"

echo ""
echo "----------------------------------------"
echo "Test 1: CRUD, sample half-open, reverse, persist"
echo "----------------------------------------"
SFX=$($CLI shot audio add --shot "$SHOT_ID" --audio "$HIT_ID" --time 0.5)
SFX_ID=$(echo "$SFX" | json_id)
echo "$SFX" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
assert d['role']=='sfx'
assert abs(d['t']-0.5)<1e-9
assert abs(d['durationSec']-d['sourceOutSec']+d['sourceInSec'])<1e-6
assert d['loop'] is False
assert d['audioId']=='$HIT_ID'
"

sample_audio() {
  local t="$1"
  $CLI shot audio sample --shot "$SHOT_ID" --time "$t" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
hits=d.get('samples') or []
print('none' if not hits else f\"{hits[0]['role']}:{hits[0]['sourceTimeSec']:.3f}:{hits[0]['gain']:.2f}\")
"
}

[ "$(sample_audio 0.4)" = "none" ] || fail "before block silent (got $(sample_audio 0.4))"
[ "$(sample_audio 0.5)" = "sfx:0.000:1.00" ] || fail "at start (got $(sample_audio 0.5))"
[ "$(sample_audio 0.7)" = "sfx:0.200:1.00" ] || fail "mid (got $(sample_audio 0.7))"
[ "$(sample_audio 1.0)" = "none" ] || fail "at end exclusive (got $(sample_audio 1.0))"
[ "$(sample_audio 0.7)" = "sfx:0.200:1.00" ] || fail "reverse-equivalent mid"
[ "$(sample_audio 0)" = "none" ] || fail "loop wrap t=0 hides late block"

$CLI shot audio list --shot "$SHOT_ID" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('['); d=json.loads(t[i:])
assert any(x['id']=='$SFX_ID' for x in d), d
"
$CLI shot audio show --id "$SFX_ID" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
assert d['id']=='$SFX_ID'
"
$CLI shot audio update --id "$SFX_ID" --time 0.6 >/dev/null
$CLI shot audio show --id "$SFX_ID" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
assert abs(d['t']-0.6)<1e-9
"
npx tsx src/shared/storyboard/audio.shot-cli-roundtrip.ts "$SHOT_ID" "$SFX_ID" "$HIT_ID"
pass "CRUD + half-open sample + reverse-equivalent + persist"

echo ""
echo "----------------------------------------"
echo "Test 2: loop wrap, music overlap, SFX overlap, wrong game"
echo "----------------------------------------"
LOOP=$($CLI shot audio add --shot "$SHOT_ID" --audio "$BED_ID" --time 0 --loop --duration 1.2 --fade-in 0.2)
LOOP_ID=$(echo "$LOOP" | json_id)
echo "$LOOP" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
assert d['loop'] is True
assert abs(d['durationSec']-1.2)<1e-9
assert d['role']=='music'
"
$CLI shot audio sample --shot "$SHOT_ID" --time 0.6 | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
music=[s for s in d['samples'] if s['role']=='music']
assert music, d
assert abs(music[0]['sourceTimeSec']-0.1)<0.08, music
"
$CLI shot audio sample --shot "$SHOT_ID" --time 0.05 | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
music=[s for s in d['samples'] if s['role']=='music']
assert music and music[0]['gain']<1, music
"

if $CLI shot audio add --shot "$SHOT_ID" --audio "$BED_ID" --time 0.4 --loop --duration 0.5 2>&1 | grep -q "one music bed"; then
  pass "Music overlap rejected"
else
  fail "Music overlap was accepted"
fi

SFX2=$($CLI shot audio add --shot "$SHOT_ID" --audio "$HIT_ID" --time 0.65)
SFX2_ID=$(echo "$SFX2" | json_id)
[ -n "$SFX2_ID" ] || fail "overlapping SFX should be allowed"
pass "SFX overlap allowed"

if $CLI shot audio add --shot "$SHOT_ID" --audio "$OTHER_ID" --time 0 2>&1 | grep -q "belongs to game"; then
  pass "Wrong-game audio rejected"
else
  fail "Wrong-game audio was accepted"
fi

echo ""
echo "----------------------------------------"
echo "Test 3: extend/shrink, in-use, replace, remove"
echo "----------------------------------------"
if $CLI shot audio update --id "$SFX_ID" --time 1.7 2>&1 | grep -q "extend-shot"; then
  pass "Overflow without --extend-shot rejected"
else
  fail "Overflow was accepted without --extend-shot"
fi

$CLI shot audio update --id "$SFX_ID" --time 1.7 --extend-shot >/dev/null
$CLI storyboard show --id "$SB_ID" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
shot=next(s for s in d['shots'] if s['id']=='$SHOT_ID')
assert shot['durationSec']>2.1, shot
"
pass "Opt-in --extend-shot lengthens the shot"

if $CLI shot update --id "$SHOT_ID" --duration 1.0 2>&1 | grep -q "audio block"; then
  pass "Duration shrink rejected while audio block exists"
else
  fail "Duration shrink was accepted"
fi

if $CLI audio remove "$HIT_ID" --game game-test 2>&1 | grep -q "referenced"; then
  pass "In-use audio delete rejected"
else
  fail "In-use audio was deleted"
fi

if $CLI audio update "$HIT_ID" --game game-test --file "$WAV_SHORT" 2>&1 | grep -q "source out"; then
  pass "Shorter file replacement rejected while blocks need longer sourceOut"
else
  fail "Short replacement was accepted"
fi

$CLI shot audio remove --id "$SFX_ID" >/dev/null
$CLI shot audio remove --id "$SFX2_ID" >/dev/null
$CLI audio remove "$HIT_ID" --game game-test >/dev/null
$CLI shot audio list --shot "$SHOT_ID" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('['); d=json.loads(t[i:])
assert all(x['id'] not in ('$SFX_ID','$SFX2_ID') for x in d), d
assert any(x['id']=='$LOOP_ID' for x in d)
"
pass "Remove unused blocks; remaining music intact; unused library audio deleted"

echo ""
echo "----------------------------------------"
echo "Test 4: long 22s source on 3s shot — fit default, accidental extend, user-entered recovery"
echo "----------------------------------------"
WAV_LONG="$TEST_DIR/bed-22s.wav"
OUT="$WAV_LONG" DUR=22 python3 - <<'PY'
import math, os, pathlib, struct
sr, dur = 8000, float(os.environ['DUR'])
n = int(sr * dur)
samples = [int(9000 * math.sin(2 * math.pi * 330 * i / sr)) for i in range(n)]
data = b''.join(struct.pack('<h', s) for s in samples)
header = struct.pack(
    '<4sI4s4sIHHIIHH4sI',
    b'RIFF', 36 + len(data), b'WAVE', b'fmt ', 16,
    1, 1, sr, sr * 2, 2, 16,
    b'data', len(data)
)
pathlib.Path(os.environ['OUT']).write_bytes(header + data)
PY
[ -f "$WAV_LONG" ] || fail "Failed to create 22s WAV fixture"
LONG_IMP=$($CLI audio import "$WAV_LONG" --game game-test --kind music --name "Long Bed 22")
LONG_ID=$(echo "$LONG_IMP" | audio_import_id)
[ -n "$LONG_ID" ] || fail "long bed import id"
SFX_LONG_IMP=$($CLI audio import "$WAV_LONG" --game game-test --kind sfx --name "Long Sfx 22")
SFX_LONG_ID=$(echo "$SFX_LONG_IMP" | audio_import_id)
[ -n "$SFX_LONG_ID" ] || fail "long sfx import id"

SHORT_OUT=$($CLI shot add --storyboard "$SB_ID" --name "Short Fit" --duration 3)
SHORT_ID=$(echo "$SHORT_OUT" | json_id)

FIT=$($CLI shot audio add --shot "$SHORT_ID" --audio "$LONG_ID" --time 0 --fade-in 0.2 --fade-out 0.2)
FIT_ID=$(echo "$FIT" | json_id)
echo "$FIT" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
assert d['loop'] is True, d
assert abs(d['durationSec']-3)<1e-6, d
assert abs(d['sourceOutSec']-22)<0.08, d
assert abs(d['sourceInSec'])<1e-9, d
assert d.get('fitted') is True, d
assert d.get('extended') is False, d
assert abs(d['shotDurationSec']-3)<1e-6, d
assert d['audioId']=='$LONG_ID'
"
$CLI storyboard show --id "$SB_ID" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
shot=next(s for s in d['shots'] if s['id']=='$SHORT_ID')
assert abs(shot['durationSec']-3)<1e-6, shot
"
$CLI shot audio sample --shot "$SHORT_ID" --time 2.5 | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
music=[s for s in d['samples'] if s['role']=='music']
assert music, d
assert abs(music[0]['sourceTimeSec']-2.5)<0.05, music
"
$CLI shot audio sample --shot "$SHORT_ID" --time 0.05 | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
music=[s for s in d['samples'] if s['role']=='music']
assert music and music[0]['gain']<1, music
"
$CLI shot audio sample --shot "$SHORT_ID" --time 2.95 | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
music=[s for s in d['samples'] if s['role']=='music']
assert music and music[0]['gain']<1, music
"
pass "Default place 22s looping music on 3s shot fits remaining; source kept; shot not extended"

SFX_FIT=$($CLI shot audio add --shot "$SHORT_ID" --audio "$SFX_LONG_ID" --time 0 --no-loop)
echo "$SFX_FIT" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
assert d['loop'] is False, d
assert abs(d['durationSec']-3)<1e-6, d
assert abs(d['sourceOutSec']-3)<1e-6, d
assert d.get('fitted') is True, d
"
pass "Long non-loop SFX fits as prefix; library file unchanged"

OVF_OUT=$($CLI shot add --storyboard "$SB_ID" --name "Overflow Confirm" --duration 3)
OVF_ID=$(echo "$OVF_OUT" | json_id)
if $CLI shot audio add --shot "$OVF_ID" --audio "$LONG_ID" --time 0 --duration 22 --loop 2>&1 | grep -q "extend-shot"; then
  pass "Explicit overflowing --duration still requires --extend-shot or --fit-shot"
else
  fail "Explicit 22s duration was accepted without extend/fit"
fi

ACC_OUT=$($CLI shot add --storyboard "$SB_ID" --name "Accidental Extend" --duration 3)
ACC_ID=$(echo "$ACC_OUT" | json_id)
ACC=$($CLI shot audio add --shot "$ACC_ID" --audio "$LONG_ID" --time 0 --duration 22 --loop --extend-shot --fade-in 0.2 --fade-out 0.2)
ACC_BLOCK=$(echo "$ACC" | json_id)
echo "$ACC" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
assert d.get('extended') is True, d
assert abs(d['shotDurationSec']-22)<0.08, d
assert abs(d['durationSec']-22)<0.08, d
"
if $CLI shot update --id "$ACC_ID" --duration 3 2>&1 | grep -q "audio block"; then
  pass "Cannot shrink shot while 22s block remains (no invented history)"
else
  fail "Shot shrink was accepted while long audio block exists"
fi
$CLI shot audio update --id "$ACC_BLOCK" --duration 3 >/dev/null
$CLI shot audio show --id "$ACC_BLOCK" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
assert abs(d['durationSec']-3)<1e-6, d
assert abs(d['sourceOutSec']-22)<0.08, d
assert d['loop'] is True, d
"
$CLI shot update --id "$ACC_ID" --duration 3 >/dev/null
$CLI storyboard show --id "$SB_ID" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
shot=next(s for s in d['shots'] if s['id']=='$ACC_ID')
assert abs(shot['durationSec']-3)<1e-6, shot
block=next(b for b in shot.get('audioTrack') or [] if b['id']=='$ACC_BLOCK')
assert abs(block['durationSec']-3)<1e-6
assert abs(block['sourceOutSec']-22)<0.08
"
pass "Accidental extend recovered: shorten this audio Dur, then enter shot duration 3; source kept"

FIT_SHOT_OUT=$($CLI shot add --storyboard "$SB_ID" --name "Fit Flag" --duration 3)
FIT_SHOT_ID=$(echo "$FIT_SHOT_OUT" | json_id)
FIT_FLAG=$($CLI shot audio add --shot "$FIT_SHOT_ID" --audio "$LONG_ID" --time 0 --duration 22 --loop --fit-shot)
echo "$FIT_FLAG" | python3 -c "
import sys,json
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
assert abs(d['durationSec']-3)<1e-6, d
assert abs(d['sourceOutSec']-22)<0.08, d
assert d.get('fitted') is True, d
assert d.get('extended') is False, d
"
pass "--fit-shot clamps overflowing explicit duration without extending"

$CLI camera key --shot "$ACC_ID" --time 2.5 --json >/dev/null
if $CLI shot update --id "$ACC_ID" --duration 2.0 2>&1 | grep -q "camera keyframe"; then
  pass "Shrink blocked by unrelated camera keyframe"
else
  fail "Camera keyframe was silently truncated"
fi
$CLI effect add --shot "$ACC_ID" --time 2.6 --type shake --json >/dev/null
if $CLI shot update --id "$ACC_ID" --duration 2.0 2>&1 | grep -q "effect marker"; then
  pass "Shrink blocked by unrelated effect marker"
else
  fail "Effect marker was silently truncated"
fi
$CLI camera remove --shot "$ACC_ID" --time 2.5 --json >/dev/null
$CLI effect remove --shot "$ACC_ID" --time 2.6 --json >/dev/null
if $CLI shot update --id "$ACC_ID" --duration 2.5 2>&1 | grep -q "audio block"; then
  pass "After removing camera/effect, shrink still lists remaining audio (no silent truncation)"
else
  fail "Expected audio blocker after camera/effect removed"
fi
$CLI shot audio update --id "$ACC_BLOCK" --duration 2.5 >/dev/null
$CLI shot update --id "$ACC_ID" --duration 2.5 >/dev/null
pass "After shortening this audio, user-entered shot duration 2.5s is accepted"

echo ""
echo "----------------------------------------"
echo "Test 5: --help"
echo "----------------------------------------"
HELP_AUDIO=$($CLI shot audio --help)
echo "$HELP_AUDIO" | grep -q "add" || fail "shot audio --help missing add"
echo "$HELP_AUDIO" | grep -q "list" || fail "shot audio --help missing list"
echo "$HELP_AUDIO" | grep -q "show" || fail "shot audio --help missing show"
echo "$HELP_AUDIO" | grep -q "update" || fail "shot audio --help missing update"
echo "$HELP_AUDIO" | grep -q "remove" || fail "shot audio --help missing remove"
echo "$HELP_AUDIO" | grep -q "sample" || fail "shot audio --help missing sample"
HELP_ADD=$($CLI shot audio add --help)
echo "$HELP_ADD" | grep -q -- "--audio" || fail "add --help missing --audio"
echo "$HELP_ADD" | grep -q -- "--time" || fail "add --help missing --time"
echo "$HELP_ADD" | grep -q -- "--loop" || fail "add --help missing --loop"
echo "$HELP_ADD" | grep -q -- "--fit-shot" || fail "add --help missing --fit-shot"
echo "$HELP_ADD" | grep -q -- "--extend-shot" || fail "add --help missing --extend-shot"
HELP_UPDATE=$($CLI shot audio update --help)
echo "$HELP_UPDATE" | grep -q -- "--fit-shot" || fail "update --help missing --fit-shot"
echo "$HELP_UPDATE" | grep -q -- "--duration" || fail "update --help missing --duration"
HELP_SAMPLE=$($CLI shot audio sample --help)
echo "$HELP_SAMPLE" | grep -q -- "--time" || fail "sample --help missing --time"
pass "CLI --help documents shot audio add/list/show/update/remove/sample + --fit-shot"

echo ""
echo "=========================================="
echo -e "${GREEN}All A2 shot audio tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified (automated, no Electron UI):"
echo "  ✓ Timing + playback-lifecycle + shot-duration unit tests (mocks, not host audio)"
echo "  ✓ WAV/OGG isolated fixtures including 22s source"
echo "  ✓ CRUD / sample half-open / reverse-equivalent / loop wrap"
echo "  ✓ Music overlap rejected; SFX overlap allowed; wrong-game"
echo "  ✓ --extend-shot; shrink guard; in-use delete; short replace; remove"
echo "  ✓ 22s-on-3s fit default; accidental-extend recovery; camera/effect shrink guards"
echo "  ✓ --help"
echo ""
echo "NOT executed here: Mac Storyboard audible HTMLAudioElement.play()."
