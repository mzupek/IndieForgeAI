#!/bin/bash
# 2a enemies + module winConditions.
# Isolated mktemp + FORGE_DATA_DIR only. Never Matt's studio.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "2a enemies"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, isolated tmpdir, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/enemies/validate.test.ts
echo ""
npx tsx --tsconfig tsconfig.node.json src/core/storage/enemyService.test.ts
echo ""
npx tsx --tsconfig tsconfig.node.json src/core/storage/gameSettingsService.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-2a-enemy-XXXXXX)
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
settings_a = {
  "poseSlots": [],
  "assetCategories": [],
  "encounterTypes": ["battle", "puzzle", "minigame", "story"],
  "modules": [{
    "id": "pad",
    "label": "Pad",
    "typeIds": ["battle"],
    "starKinds": ["win"]
  }]
}
settings_b = {
  "poseSlots": [],
  "assetCategories": [],
  "encounterTypes": ["battle", "puzzle", "minigame", "story"],
  "modules": [{
    "id": "duel",
    "label": "Duel",
    "typeIds": ["battle"]
  }]
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
      {"id": "game-a", "name": "Game A", "engine": "unity", "exportRoot": "./exports/a", "settings": settings_a, "createdAt": now, "updatedAt": now},
      {"id": "game-b", "name": "Game B", "engine": "godot", "exportRoot": "./exports/b", "settings": settings_b, "createdAt": now, "updatedAt": now}
    ],
    "characters": [
      {
        "id": "char-a", "gameId": "game-a", "key": "scout", "name": "Scout", "role": "enemy",
        "tags": [], "poseSlots": [{"key": "arc", "label": "Arc"}],
        "createdAt": now, "updatedAt": now
      },
      {
        "id": "char-b", "gameId": "game-b", "name": "Other", "role": "npc", "tags": [],
        "createdAt": now, "updatedAt": now
      }
    ],
    "poses": [
      {
        "id": "pose-ready", "characterId": "char-a", "slot": "ready", "file": "/tmp/ready.png",
        "status": "approved", "source": "import", "createdAt": now, "updatedAt": now
      },
      {
        "id": "pose-hurt", "characterId": "char-a", "slot": "hurt", "file": "/tmp/hurt.png",
        "status": "approved", "source": "import", "createdAt": now, "updatedAt": now
      }
    ],
    "clips": [], "scenePresets": [], "scenes": [], "storyboards": [], "storyboardShots": [],
    "exportProfiles": [], "gameDefinitions": [], "visualAssets": [], "assetStates": [],
    "fonts": [], "palettes": [], "eventDefinitions": [], "eventBindings": [], "audioAssets": [],
    "worlds": [], "stages": [], "encounters": [], "regions": [],
    "createdAt": now, "updatedAt": now
  }
}
path = os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
with open(path, "w") as f:
    json.dump(studio, f, indent=2)
    f.write("\n")
PY
pass "v2 two-game fixture (no title names)"

hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

echo ""
echo "----------------------------------------"
echo "Game-agnostic: no title-specific ids in 2a app modules"
echo "----------------------------------------"
if grep -RInE 'memory_pad|game-neon-recall|Gate Drone|Neon Recall|Ring.?em.?Up|ride_boost' \
  src/shared/enemies \
  src/core/storage/enemyService.ts \
  src/cli/commands/enemy.ts \
  src/renderer/components/EnemiesView.tsx \
  src/renderer/components/GameSettingsView.tsx \
  src/shared/gameSettings/encounterSettings.ts \
  >/dev/null 2>&1; then
  fail "game-specific strings leaked into 2a app modules"
fi
pass "no game-specific strings in 2a modules"

echo ""
echo "----------------------------------------"
echo "Module winConditions"
echo "----------------------------------------"
BEFORE=$(hash_of "$STUDIO")
$CLI game module update --game game-a pad --win-conditions locks,enemyHp,either --dry-run >/tmp/forge-2a-mod-dry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "module --dry-run wrote studio.json"
python3 - <<'PY'
import json
mod = json.load(open("/tmp/forge-2a-mod-dry.json"))["module"]
assert mod["winConditions"] == ["locks", "enemyHp", "either"], mod
print("dry-run module payload ok")
PY
$CLI game module update --game game-a pad --win-conditions locks,enemyHp,either >/tmp/forge-2a-mod.json
python3 - <<'PY'
import json, os
studio = json.load(open(os.environ["FORGE_DATA_DIR"] + "/studio.json"))
mod = next(m for m in studio["assetPipeline"]["games"][0]["settings"]["modules"] if m["id"] == "pad")
assert mod["winConditions"] == ["locks", "enemyHp", "either"], mod
other = json.load(open("/tmp/forge-2a-mod.json"))["module"]
assert other["winConditions"] == ["locks", "enemyHp", "either"]
print("winConditions saved")
PY
pass "module --win-conditions (dry-run byte-identical, camelCase kept)"

echo ""
echo "----------------------------------------"
echo "Enemy CRUD + @key + character name"
echo "----------------------------------------"
$CLI enemy create --game game-a --name Scout --character Scout --module pad --win locks \
  --win-param count=3 --pose hit=hurt --pose defeat=defeat --pose attack=arc --key scout-en \
  --stat hp=12 >/tmp/forge-2a-create.json
ENEMY_ID=$(python3 -c "import json; print(json.load(open('/tmp/forge-2a-create.json'))['record']['id'])")
$CLI enemy show --game game-a @scout-en >/tmp/forge-2a-show.json
python3 - <<'PY'
import json
rec = json.load(open("/tmp/forge-2a-show.json"))["record"]
assert rec["key"] == "scout-en", rec
assert rec["winCondition"] == {"kind": "locks", "params": {"count": 3}}, rec
assert rec["poses"]["hit"] == "hurt", rec
assert rec["poses"]["defeat"] == "defeat", rec
assert rec["poses"]["attack"] == "arc", rec
assert rec["stats"]["hp"] == 12, rec
print("create/show ok")
PY
$CLI enemy list --game game-a >/tmp/forge-2a-list.json
python3 - <<'PY'
import json
rows = json.load(open("/tmp/forge-2a-list.json"))["enemies"]
assert len(rows) == 1, rows
print("list ok")
PY
$CLI enemy update --game game-a @scout-en --name "Scout Two" >/tmp/forge-2a-upd.json
python3 - <<'PY'
import json
rec = json.load(open("/tmp/forge-2a-upd.json"))["record"]
assert rec["name"] == "Scout Two"
assert rec["winCondition"]["kind"] == "locks"
print("update keeps win condition")
PY
pass "CRUD + @key + exact character name"

echo ""
echo "----------------------------------------"
echo "Validation"
echo "----------------------------------------"
if $CLI enemy create --game game-a --name Cross --character char-b --module pad --win locks >/tmp/forge-2a-cross.json 2>/tmp/forge-2a-cross.err; then
  fail "cross-game character should be refused"
fi
grep -q "belongs to game 'game-b'" /tmp/forge-2a-cross.err || fail "cross-game error message"
if $CLI enemy create --game game-a --name BadWin --character Scout --module pad --win nope >/tmp/forge-2a-win.json 2>/tmp/forge-2a-win.err; then
  fail "unknown win kind should be refused"
fi
grep -qi "win" /tmp/forge-2a-win.err || fail "win kind error message"
if $CLI enemy update --game game-a @scout-en --pose idle=nope >/tmp/forge-2a-pose.json 2>/tmp/forge-2a-pose.err; then
  fail "unknown pose slot should be refused"
fi
grep -q "Pose slot 'nope'" /tmp/forge-2a-pose.err || fail "pose slot error message"
pass "cross-game / win kind / pose slot refused"

echo ""
echo "----------------------------------------"
echo "Checklist have/missing"
echo "----------------------------------------"
$CLI enemy checklist --game game-a @scout-en >/tmp/forge-2a-check.json
python3 - <<'PY'
import json
c = json.load(open("/tmp/forge-2a-check.json"))
assert c["enemy"] == "Scout Two", c
slots = {p["slot"]: p for p in c["poses"]}
assert slots["ready"]["have"] is True, c
assert slots["hurt"]["have"] is True, c
assert slots["arc"]["have"] is False, c
assert slots["defeat"]["have"] is False, c
assert c["ready"] is False, c
assert c["usedBy"] == [], c
print("checklist have/missing ok")
PY
pass "checklist have/missing"

echo ""
echo "----------------------------------------"
echo "Character in use + win condition in use"
echo "----------------------------------------"
if $CLI character delete char-a --game game-a >/tmp/forge-2a-chardel.json 2>/tmp/forge-2a-chardel.err; then
  fail "character in use should be refused"
fi
grep -q "Scout Two" /tmp/forge-2a-chardel.err || fail "character in-use message should name the enemy"
if $CLI game module update --game game-a pad --win-conditions enemyHp,either >/tmp/forge-2a-winrm.json 2>/tmp/forge-2a-winrm.err; then
  fail "removing used win condition should be refused"
fi
grep -qi "locks" /tmp/forge-2a-winrm.err || fail "win condition in-use message"
pass "character / win-condition in-use refused"

echo ""
echo "----------------------------------------"
echo "Dry-run byte-identical + save keeps arrays"
echo "----------------------------------------"
python3 - <<'PY'
import json, os
path = os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
studio = json.load(open(path))
studio["extraStudioFlag"] = True
studio["assetPipeline"]["enemies"][0]["futureFlag"] = "keep-me"
json.dump(studio, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
BEFORE=$(hash_of "$STUDIO")
$CLI enemy update --game game-a @scout-en --notes "dry" --dry-run >/tmp/forge-2a-en-dry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "enemy --dry-run wrote studio.json"
$CLI enemy update --game game-a @scout-en --notes "kept" >/tmp/forge-2a-en-notes.json
python3 - <<'PY'
import json, os
studio = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")))
en = studio["assetPipeline"]["enemies"][0]
assert en["futureFlag"] == "keep-me", en
assert en["notes"] == "kept", en
assert studio["extraStudioFlag"] is True
for name in ("worlds", "stages", "encounters", "regions", "enemies"):
    assert isinstance(studio["assetPipeline"][name], list), name
print("overlay + arrays kept")
PY
pass "dry-run byte-identical; unknown fields and arrays kept"

echo ""
echo "----------------------------------------"
echo "Second game isolated + content apply/export"
echo "----------------------------------------"
$CLI enemy list --game game-b >/tmp/forge-2a-b.json
python3 - <<'PY'
import json
rows = json.load(open("/tmp/forge-2a-b.json"))["enemies"]
assert rows == [], rows
print("game-b empty")
PY
$CLI content export --game game-a --out "$TEST_DIR/export-a" >/tmp/forge-2a-export.json
python3 - <<'PY'
import json, os
content = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "export-a", "content.json")))
assert content["contentSchemaVersion"] == 1, content
assert len(content["enemies"]) == 1, content["enemies"]
assert content["enemies"][0]["key"] == "scout-en"
print("export enemies + schema 1")
PY
BUNDLE="$TEST_DIR/enemy-bundle.json"
python3 - <<'PY'
import json, os
path = os.path.join(os.environ["FORGE_DATA_DIR"], "enemy-bundle.json")
json.dump({
  "enemies": [{
    "key": "applied-en",
    "name": "Applied",
    "characterId": "@scout",
    "moduleId": "pad",
    "winCondition": {"kind": "either", "params": {}},
    "poses": {"hit": "hurt"}
  }]
}, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-2a-apply.json
python3 - <<'PY'
import json
res = json.load(open("/tmp/forge-2a-apply.json"))
assert any(r.get("key") == "applied-en" and r["action"] == "create" for r in res["creates"]), res
print("apply create enemy")
PY
$CLI enemy list --game game-a >/tmp/forge-2a-list2.json
python3 - <<'PY'
import json
rows = json.load(open("/tmp/forge-2a-list2.json"))["enemies"]
assert sorted(r["key"] for r in rows) == ["applied-en", "scout-en"], rows
print("two enemies after apply")
PY
$CLI enemy remove --game game-a @scout-en >/tmp/forge-2a-rm.json
$CLI enemy remove --game game-a @applied-en >/tmp/forge-2a-rm2.json
$CLI character delete char-a --game game-a >/tmp/forge-2a-chardel-ok.json
pass "game isolation, content apply/export, character deletes after enemies gone"

echo ""
echo -e "${GREEN}✓ 2a enemy tests passed${NC}"
