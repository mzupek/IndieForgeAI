#!/bin/bash
# 2d mini-game / encounter module param specs.
# Isolated mktemp + FORGE_DATA_DIR only. Never Matt's studio.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "2d mini-game param specs"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, isolated tmpdir, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/gameSettings/paramSpecs.test.ts
echo ""
npx tsx --tsconfig tsconfig.node.json src/core/storage/gameSettingsService.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-2d-params-XXXXXX)
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
  }, {
    "id": "mini",
    "label": "Mini",
    "typeIds": ["minigame"]
  }]
}
settings_b = {
  "poseSlots": [],
  "assetCategories": [],
  "encounterTypes": ["battle", "puzzle", "minigame", "story"],
  "modules": [{
    "id": "mini",
    "label": "Mini",
    "typeIds": ["minigame"]
  }]
}
studio = {
  "schemaVersion": 2,
  "createdAt": now,
  "updatedAt": now,
  "extraStudioFlag": True,
  "assetPipeline": {
    "schemaVersion": 2,
    "id": "studio",
    "name": "Studio",
    "description": "",
    "games": [
      {"id": "game-a", "name": "Game A", "engine": "unity", "exportRoot": "./exports/a", "settings": settings_a, "createdAt": now, "updatedAt": now},
      {"id": "game-b", "name": "Game B", "engine": "godot", "exportRoot": "./exports/b", "settings": settings_b, "createdAt": now, "updatedAt": now}
    ],
    "characters": [],
    "poses": [],
    "clips": [], "scenePresets": [], "scenes": [], "storyboards": [], "storyboardShots": [],
    "exportProfiles": [],
    "gameDefinitions": [{
      "id": "def-a", "gameId": "game-a", "stage": "MVP", "pillars": [], "puzzleCore": "",
      "storySynopsis": "", "cast": [], "linkedAssets": {"poses": [], "clips": [], "presets": []},
      "themeSlots": [], "interactions": [],
      "tuningProfiles": [{"id": "tune-a", "name": "Pad Tune", "params": {"enemyHP": 20, "rounds": 10}}],
      "keepCutInvent": {"keep": [], "cut": [], "invent": []}, "mvpBoard": [], "markdownSource": "",
      "createdAt": now, "updatedAt": now
    }],
    "visualAssets": [{
      "id": "bg-a", "gameId": "game-a", "name": "Alley", "category": "background",
      "tags": [], "defaultStateId": None, "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }], "assetStates": [], "fonts": [], "palettes": [],
    "eventDefinitions": [], "eventBindings": [], "audioAssets": [],
    "worlds": [{
      "id": "world-a", "gameId": "game-a", "key": "world-1", "name": "World 1", "order": 1,
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "stages": [{
      "id": "stage-a", "gameId": "game-a", "worldId": "world-a", "key": "stage-gate",
      "name": "The Gate", "order": 1, "entryRegionId": "r-a", "entryAnchor": "a-start",
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "encounters": [{
      "id": "enc-mini", "gameId": "game-a", "stageId": "stage-a", "key": "enc-mini",
      "name": "Lane run", "typeId": "minigame", "moduleId": "mini",
      "stars": [], "order": 1, "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "regions": [{
      "id": "r-a", "gameId": "game-a", "stageId": "stage-a", "key": "region-gate",
      "name": "Approach", "backgroundAssetId": "bg-a",
      "anchors": [{"id": "a-start", "pos": [0.12, 0.78]}, {"id": "a-lane", "pos": [0.5, 0.5]}],
      "edges": [["a-start", "a-lane"]], "spawn": "a-start",
      "hotspots": [{"id": "hs-mini", "anchor": "a-lane", "prompt": "Race", "encounterId": "enc-mini"}],
      "exits": [{"id": "x-map", "anchor": "a-start", "toWorldMap": True}],
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "enemies": [], "attackTables": [], "difficultyProfiles": [],
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
echo "Game-agnostic: no title-specific ids in 2d app modules"
echo "----------------------------------------"
if grep -RInE 'memory_pad|game-neon-recall|Gate Drone|Neon Recall|Ring.?em.?Up|ride_boost|hoverboard' \
  src/shared/gameSettings/paramSpecs.ts \
  src/shared/gameSettings/encounterSettings.ts \
  src/core/storage/gameSettingsService.ts \
  src/cli/commands/gameSettings.ts \
  src/renderer/components/GameSettingsView.tsx \
  src/renderer/components/WorldsView.tsx \
  >/dev/null 2>&1; then
  fail "game-specific strings leaked into 2d app modules"
fi
pass "no game-specific strings in 2d modules"

echo ""
echo "----------------------------------------"
echo "Param spec CRUD + validation + dry-run"
echo "----------------------------------------"
BEFORE=$(hash_of "$STUDIO")
$CLI game module param add mini --game game-a --key lanes --type int --min 1 --max 4 --default 2 --required --dry-run >/tmp/forge-2d-param-dry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "param --dry-run wrote studio.json"
$CLI game module param add mini --game game-a --key lanes --type int --min 1 --max 4 --default 2 --required >/tmp/forge-2d-lanes.json
$CLI game module param add mini --game game-a --key mode --type enum --options a,b --default a >/tmp/forge-2d-mode.json
$CLI game module param add mini --game game-a --key turbo --type bool --default false >/tmp/forge-2d-turbo.json
$CLI game module param add mini --game game-a --key label --type string --default go >/tmp/forge-2d-label.json
$CLI game module param add mini --game game-a --key speed --type float --min 0.5 --max 2 --default 1 >/tmp/forge-2d-speed.json
$CLI game module param list mini --game game-a >/tmp/forge-2d-plist.json
python3 - <<'PY'
import json
specs = json.load(open("/tmp/forge-2d-plist.json"))["paramSpecs"]
keys = [s["key"] for s in specs]
assert keys == ["lanes", "mode", "turbo", "label", "speed"], keys
lanes = next(s for s in specs if s["key"] == "lanes")
assert lanes["type"] == "int" and lanes["min"] == 1 and lanes["max"] == 4 and lanes["required"] is True
assert lanes["default"] == 2
mode = next(s for s in specs if s["key"] == "mode")
assert mode["options"] == ["a", "b"]
turbo = next(s for s in specs if s["key"] == "turbo")
assert turbo["default"] is False
print("five specs saved")
PY
if $CLI game module param add mini --game game-a --key lanes --type int >/tmp/x.json 2>/tmp/x.err; then
  fail "duplicate param should fail"
fi
if $CLI game module param add mini --game game-a --key bad --type bytes >/tmp/x.json 2>/tmp/x.err; then
  fail "unknown type should fail"
fi
grep -qi "int, float, bool, enum, string" /tmp/x.err /tmp/x.json || fail "type error should list allowed types"
if $CLI game module param add mini --game game-a --key oops --type enum >/tmp/x.json 2>/tmp/x.err; then
  fail "enum without options should fail"
fi
$CLI game module param list mini --game game-b >/tmp/forge-2d-b.json
python3 - <<'PY'
import json
specs = json.load(open("/tmp/forge-2d-b.json"))["paramSpecs"]
assert specs == [], specs
print("game-b mini has no specs")
PY
pass "param spec CRUD, refusals, isolation"

echo ""
echo "----------------------------------------"
echo "Label update keeps paramSpecs"
echo "----------------------------------------"
$CLI game module update --game game-a mini --label "Mini game" >/tmp/forge-2d-label-mod.json
python3 - <<'PY'
import json, os
studio = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")))
mod = next(m for m in studio["assetPipeline"]["games"][0]["settings"]["modules"] if m["id"] == "mini")
assert mod["label"] == "Mini game"
assert [s["key"] for s in mod["paramSpecs"]] == ["lanes", "mode", "turbo", "label", "speed"]
print("paramSpecs kept")
PY
pass "module update preserves paramSpecs"

echo ""
echo "----------------------------------------"
echo "Flow warns missing required / out of range"
echo "----------------------------------------"
$CLI world flow --game game-a @world-1 >/tmp/forge-2d-flow-missing.json
python3 - <<'PY'
import json
blob = json.dumps(json.load(open("/tmp/forge-2d-flow-missing.json")))
assert "Lane run" in blob, blob
assert "Required param 'lanes' is missing" in blob, blob
print("missing required")
PY
$CLI definition tuning add --game game-a --name "Mini Bad" --param lanes=9 >/tmp/forge-2d-tune-bad.json
BAD_ID=$(python3 -c 'import json; print(json.load(open("/tmp/forge-2d-tune-bad.json"))["id"])')
$CLI encounter update @enc-mini --game game-a --tuning "$BAD_ID" >/tmp/forge-2d-enc-bad.json
$CLI world flow --game game-a @world-1 >/tmp/forge-2d-flow-range.json
python3 - <<'PY'
import json
blob = json.dumps(json.load(open("/tmp/forge-2d-flow-range.json")))
assert "must be <= 4" in blob, blob
print("out of range")
PY
$CLI definition tuning add --game game-a --name "Mini Ok" --param lanes=3 >/tmp/forge-2d-tune-ok.json
OK_ID=$(python3 -c 'import json; print(json.load(open("/tmp/forge-2d-tune-ok.json"))["id"])')
$CLI encounter update @enc-mini --game game-a --tuning "$OK_ID" >/tmp/forge-2d-enc-ok.json
$CLI world flow --game game-a @world-1 >/tmp/forge-2d-flow-ok.json
python3 - <<'PY'
import json
blob = json.dumps(json.load(open("/tmp/forge-2d-flow-ok.json")))
assert "Required param 'lanes' is missing" not in blob, blob
assert "must be <= 4" not in blob, blob
print("in-range ok")
PY
pass "flow param warnings"

echo ""
echo "----------------------------------------"
echo "In-use param remove names the encounter"
echo "----------------------------------------"
if $CLI game module param remove mini --game game-a --key lanes >/tmp/x.json 2>/tmp/x.err; then
  fail "in-use param spec should refuse remove"
fi
grep -qi "Lane run" /tmp/x.err /tmp/x.json || fail "param in-use error should name the encounter"
$CLI game module param remove mini --game game-a --key turbo >/tmp/forge-2d-rm-turbo.json
python3 - <<'PY'
import json
mod = json.load(open("/tmp/forge-2d-rm-turbo.json"))["module"]
assert not any(s["key"] == "turbo" for s in mod.get("paramSpecs") or [])
print("unused optional param removed")
PY
pass "in-use param remove refused"

echo ""
echo "----------------------------------------"
echo "content export includes paramSpecs; apply 0 changes"
echo "----------------------------------------"
$CLI content export --game game-a --out "$TEST_DIR/export-a" >/tmp/forge-2d-export.json
python3 - <<'PY'
import json, os
content = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "export-a", "content.json")))
assert content["contentSchemaVersion"] == 1, content
mini = next(m for m in content["settings"]["modules"] if m["id"] == "mini")
keys = [s["key"] for s in mini.get("paramSpecs") or []]
assert "lanes" in keys, mini
enc = next(e for e in content["encounters"] if e.get("key") == "enc-mini")
assert enc["moduleId"] == "mini"
print("export paramSpecs, schema 1")
PY
BUNDLE="$TEST_DIR/bundle-2d.json"
python3 - <<'PY'
import json, os
content = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "export-a", "content.json")))
enc = next(e for e in content["encounters"] if e.get("key") == "enc-mini")
bundle = {
  "encounters": [{
    "key": enc["key"],
    "stageId": "@stage-gate",
    "name": enc["name"],
    "typeId": enc["typeId"],
    "moduleId": enc["moduleId"],
    "tuningProfileId": "Mini Ok",
    "stars": enc.get("stars") or []
  }]
}
open(os.path.join(os.environ["FORGE_DATA_DIR"], "bundle-2d.json"), "w").write(json.dumps(bundle, indent=2) + "\n")
PY
$CLI content apply --game game-a --file "$BUNDLE" --dry-run >/tmp/forge-2d-apply-dry.json
$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-2d-apply.json
$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-2d-re.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-2d-re.json"))
assert r["creates"] == [], r
assert r["updates"] == [], r
assert r["written"] is False
print("re-apply unchanged", len(r["unchanged"]))
PY
pass "export paramSpecs, apply idempotent"

echo ""
echo -e "${GREEN}✓ 2d mini-game param spec tests passed${NC}"
