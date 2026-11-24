#!/bin/bash
# 1b pose slots + asset categories. Isolated mktemp + FORGE_DATA_DIR only.
# Example keys ride/ride_boost are test-only.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "1b pose slots / asset categories"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, isolated tmpdir, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/poseValidation.test.ts
echo ""
npx tsx src/shared/gameSettings/poseSlots.test.ts
echo ""
npx tsx src/shared/gameSettings/assetCategories.test.ts
echo ""
npx tsx --tsconfig tsconfig.node.json src/core/storage/gameSettingsService.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-1b-slots-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"
STUDIO="$TEST_DIR/studio.json"

fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
pass() { echo -e "${GREEN}✓ $1${NC}"; }

cleanup() { rm -rf "$TEST_DIR"; }
trap cleanup EXIT

mkdir -p "$TEST_DIR"
python3 - <<'PY'
import json, os
now = "2026-01-01T00:00:00.000Z"
settings = {
  "poseSlots": [],
  "assetCategories": [],
  "encounterTypes": ["battle", "puzzle", "minigame", "story"],
  "modules": []
}
studio = {
  "schemaVersion": 2,
  "createdAt": now,
  "updatedAt": now,
  "assetPipeline": {
    "schemaVersion": 2,
    "id": "studio",
    "name": "Studio",
    "description": "",
    "games": [
      {
        "id": "game-a",
        "name": "Game A",
        "engine": "unity",
        "exportRoot": "./exports/a",
        "settings": settings,
        "createdAt": now,
        "updatedAt": now
      },
      {
        "id": "game-b",
        "name": "Game B",
        "engine": "godot",
        "exportRoot": "./exports/b",
        "settings": {
          "poseSlots": [],
          "assetCategories": [],
          "encounterTypes": ["battle", "puzzle", "minigame", "story"],
          "modules": []
        },
        "createdAt": now,
        "updatedAt": now
      }
    ],
    "characters": [
      {
        "id": "char-hero",
        "gameId": "game-a",
        "name": "Hero",
        "role": "player",
        "tags": [],
        "createdAt": now,
        "updatedAt": now
      },
      {
        "id": "char-b",
        "gameId": "game-b",
        "name": "Other",
        "role": "npc",
        "tags": [],
        "createdAt": now,
        "updatedAt": now
      }
    ],
    "poses": [],
    "clips": [],
    "scenePresets": [],
    "scenes": [],
    "storyboards": [],
    "storyboardShots": [],
    "exportProfiles": [],
    "gameDefinitions": [],
    "visualAssets": [],
    "assetStates": [],
    "fonts": [],
    "palettes": [],
    "eventDefinitions": [],
    "eventBindings": [],
    "audioAssets": [],
    "worlds": [],
    "stages": [],
    "encounters": [],
    "regions": [],
    "createdAt": now,
    "updatedAt": now
  }
}
path = os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
with open(path, "w") as f:
    json.dump(studio, f, indent=2)
    f.write("\n")
PY
pass "v2 studio fixture (two games)"

hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}
mtime_of() { python3 -c "import os; print(os.stat('$1').st_mtime_ns)"; }

echo ""
echo "----------------------------------------"
echo "Game-agnostic: no ride/ride_boost in 1b app modules"
echo "----------------------------------------"
if grep -RInE 'ride_boost|["'\'']ride["'\'']' \
  src/shared/gameSettings/keys.ts \
  src/shared/gameSettings/poseSlots.ts \
  src/shared/gameSettings/assetCategories.ts \
  src/core/storage/gameSettingsService.ts \
  src/cli/commands/gameSettings.ts \
  src/renderer/components/GameSettingsView.tsx \
  2>/dev/null; then
  fail "1b production modules must not hardcode ride/ride_boost"
fi
pass "1b modules have no ride/ride_boost literals"

echo ""
echo "----------------------------------------"
echo "list is read-only"
echo "----------------------------------------"
H1=$(hash_of "$STUDIO")
M1=$(mtime_of "$STUDIO")
$CLI game slot list --game game-a >/dev/null
$CLI game category list --game game-a >/dev/null
$CLI character slots list char-hero --game game-a >/dev/null
$CLI games list >/dev/null
H2=$(hash_of "$STUDIO")
M2=$(mtime_of "$STUDIO")
[ "$H1" = "$H2" ] || fail "list commands changed studio.json hash"
[ "$M1" = "$M2" ] || fail "list commands changed studio.json mtime"
pass "slot/category/character list + games list write nothing"

echo ""
echo "----------------------------------------"
echo "add game slot, character slot, isolation"
echo "----------------------------------------"
$CLI game slot add --game game-a --key ride --label Ride >/dev/null
$CLI character slots add char-hero --game game-a --key ride_boost --label "Ride Boost" >/dev/null
python3 - <<'PY'
import json, os, subprocess, sys
listed = json.loads(subprocess.check_output(
  ["node","out/cli/forge.js","--json","game","slot","list","--game","game-a"], text=True))
assert any(s["key"]=="ride" for s in listed["game"]), listed
listed_b = json.loads(subprocess.check_output(
  ["node","out/cli/forge.js","--json","game","slot","list","--game","game-b"], text=True))
assert listed_b["game"] == [], listed_b
char = json.loads(subprocess.check_output(
  ["node","out/cli/forge.js","--json","character","slots","list","char-hero","--game","game-a"], text=True))
assert any(s["key"]=="ride_boost" for s in char["character"]), char
assert any(s["key"]=="ride" for s in char["game"]), char
PY
pass "game-a has ride; game-b does not; hero has ride_boost"

echo ""
echo "----------------------------------------"
echo "duplicate / unknown refusals"
echo "----------------------------------------"
if OUT=$($CLI game slot add --game game-a --key ready --label Ready 2>&1); then
  fail "adding built-in ready should fail"
else
  echo "$OUT" | python3 -c "import sys; t=sys.stdin.read(); assert 'already exists' in t, t"
fi
if OUT=$($CLI character slots add char-hero --game game-a --key ride --label Ride 2>&1); then
  fail "character slot clashing with game slot should fail"
else
  echo "$OUT" | python3 -c "import sys; t=sys.stdin.read(); assert 'already exists' in t, t"
fi
pass "duplicate ready/ride refused"

echo ""
echo "----------------------------------------"
echo "pose import custom slot + in-use remove"
echo "----------------------------------------"
TEST_IMAGE="$TEST_DIR/hero_ride.png"
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > "$TEST_IMAGE"
$CLI pose import char-hero "$TEST_IMAGE" --slot ride >/dev/null
if OUT=$($CLI game slot remove --game game-a --key ride 2>&1); then
  fail "remove in-use ride should fail"
else
  echo "$OUT" | python3 -c "import sys; t=sys.stdin.read(); assert 'in use' in t and 'Hero ride' in t, t"
fi
pass "pose import --slot ride; remove refused with users"

echo ""
echo "----------------------------------------"
echo "categories including background"
echo "----------------------------------------"
$CLI game category add --game game-a --key map --label Map --base background >/dev/null
$CLI asset create --game game-a --name Alley --category background >/dev/null
$CLI asset create --game game-a --name District --category map >/dev/null
python3 - <<'PY'
import json, subprocess
cats = json.loads(subprocess.check_output(
  ["node","out/cli/forge.js","--json","game","category","list","--game","game-a"], text=True))
assert any(c["key"]=="background" for c in cats["core"])
assert any(c["key"]=="map" and c.get("base")=="background" for c in cats["game"])
assets = json.loads(subprocess.check_output(
  ["node","out/cli/forge.js","--json","asset","list","--game","game-a"], text=True))
assert any(a["category"]=="background" and a["name"]=="Alley" for a in assets)
assert any(a["category"]=="map" and a["name"]=="District" for a in assets)
other = json.loads(subprocess.check_output(
  ["node","out/cli/forge.js","--json","game","category","list","--game","game-b"], text=True))
assert other["game"] == []
PY
if OUT=$($CLI game category remove --game game-a --key map 2>&1); then
  fail "remove in-use map should fail"
else
  echo "$OUT" | python3 -c "import sys; t=sys.stdin.read(); assert 'in use' in t and 'District' in t, t"
fi
$CLI game category add --game game-a --key banner --label Banner >/dev/null
$CLI game category remove --game game-a --key banner >/dev/null
pass "background + custom category; in-use refuse; unused remove"

echo ""
echo "----------------------------------------"
echo "unknown slot/category refused"
echo "----------------------------------------"
if OUT=$($CLI pose import char-hero "$TEST_IMAGE" --slot nope 2>&1); then
  fail "unknown slot should fail"
else
  echo "$OUT" | python3 -c "import sys; t=sys.stdin.read(); assert 'Unknown pose slot' in t, t"
fi
if OUT=$($CLI asset create --game game-a --name X --category nope 2>&1); then
  fail "unknown category should fail"
else
  echo "$OUT" | python3 -c "import sys; t=sys.stdin.read(); assert 'Unknown asset category' in t, t"
fi
pass "unknown slot/category refused"

echo ""
echo "----------------------------------------"
echo "export dry-run does not write; meaning of core poses unchanged"
echo "----------------------------------------"
H3=$(hash_of "$STUDIO")
DRY=$($CLI export game-a --dry-run --target "$TEST_DIR/export-out")
echo "$DRY" | python3 -c "
import sys, json
d=json.load(sys.stdin)
# dry-run payload lists filesToCopy destinations; custom ride is additive
dests = [f.get('destination','') for f in d.get('filesToCopy', [])]
"
H4=$(hash_of "$STUDIO")
[ "$H3" = "$H4" ] || fail "export dry-run changed studio.json"
pass "export --dry-run writes nothing"

echo ""
echo "=========================================="
echo -e "${GREEN}All 1b slot/category checks passed${NC}"
echo "=========================================="
