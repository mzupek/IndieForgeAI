#!/bin/bash
# 1c World / Stage / Encounter / Region + content apply/export.
# Isolated mktemp + FORGE_DATA_DIR only.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "1c world structure / content apply"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, isolated tmpdir, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/worldContent/validate.test.ts
echo ""
npx tsx src/shared/worldContent/mapBackground.test.ts
echo ""
npx tsx --tsconfig tsconfig.node.json src/core/storage/worldContentService.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-1c-world-XXXXXX)
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
    "starKinds": ["win", "noMisses", "timeUnder"]
  }]
}
settings_b = {
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
      {"id": "game-a", "name": "Game A", "engine": "unity", "exportRoot": "./exports/a", "settings": settings_a, "createdAt": now, "updatedAt": now},
      {"id": "game-b", "name": "Game B", "engine": "godot", "exportRoot": "./exports/b", "settings": settings_b, "createdAt": now, "updatedAt": now}
    ],
    "characters": [],
    "poses": [],
    "clips": [],
    "scenePresets": [],
    "scenes": [{
      "id": "scene-a", "gameId": "game-a", "name": "Gate Drone Encounter",
      "cast": [], "poseRefs": [], "clipRefs": [], "audioRefs": [], "interactionHooks": [], "attachedPresets": [],
      "createdAt": now, "updatedAt": now
    }],
    "storyboards": [],
    "storyboardShots": [],
    "exportProfiles": [],
    "gameDefinitions": [{
      "id": "def-a", "gameId": "game-a", "stage": "MVP", "pillars": [], "puzzleCore": "", "storySynopsis": "",
      "cast": [], "linkedAssets": {"poses": [], "clips": [], "presets": []},
      "themeSlots": [], "interactions": [],
      "tuningProfiles": [{"id": "tune-a", "name": "Gate Drone Encounter", "params": {"hp": 20}}],
      "keepCutInvent": {"keep": [], "cut": [], "invent": []},
      "mvpBoard": [], "markdownSource": "", "createdAt": now, "updatedAt": now
    }],
    "visualAssets": [{
      "id": "bg-a", "gameId": "game-a", "key": "bg-gate-approach", "name": "Gate approach",
      "category": "background", "tags": [], "defaultStateId": None, "schemaVersion": 2,
      "createdAt": now, "updatedAt": now
    }],
    "assetStates": [], "fonts": [], "palettes": [], "eventDefinitions": [], "eventBindings": [],
    "audioAssets": [], "worlds": [], "stages": [], "encounters": [], "regions": [],
    "createdAt": now, "updatedAt": now
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

echo ""
echo "----------------------------------------"
echo "Game-agnostic: no title-specific ids in 1c app modules"
echo "----------------------------------------"
if grep -RInE 'memory_pad|game-neon-recall|Gate Drone|ride_boost' \
  src/shared/worldContent \
  src/shared/gameSettings/encounterSettings.ts \
  src/core/storage/worldContentService.ts \
  src/cli/commands/worldContent.ts \
  src/renderer/components/WorldsView.tsx \
  >/dev/null 2>&1; then
  fail "game-specific strings leaked into 1c app modules"
fi
pass "no game-specific strings in 1c modules"

echo ""
echo "----------------------------------------"
echo "CRUD + @key + filters"
echo "----------------------------------------"
$CLI world create --game game-a --name "World 1" --key world-1 --order 1 >/tmp/forge-1c-world.json
WORLD_ID=$(python3 -c "import json; print(json.load(open('/tmp/forge-1c-world.json'))['record']['id'])")
$CLI stage create --game game-a --world @world-1 --name "The Gate" --key stage-gate --order 1 >/tmp/forge-1c-stage.json
$CLI world show --game game-a @world-1 >/tmp/forge-1c-show.json
python3 - <<'PY'
import json
show = json.load(open("/tmp/forge-1c-show.json"))
assert show["key"] == "world-1", show
print("show @key ok")
PY
pass "world/stage create + show @key"

echo ""
echo "----------------------------------------"
echo "Cross-game refuse"
echo "----------------------------------------"
if $CLI stage create --game game-b --world @world-1 --name "Nope" --order 1 >/tmp/forge-1c-cross.json 2>/tmp/forge-1c-cross.err; then
  fail "cross-game stage create should fail"
fi
pass "cross-game world ref refused"

echo ""
echo "----------------------------------------"
echo "Type / module / tuning / star checks"
echo "----------------------------------------"
if $CLI encounter create --game game-a --stage @stage-gate --name Bad --type raid --module pad >/tmp/e.json 2>/tmp/e.err; then
  fail "unknown type should fail"
fi
if $CLI encounter create --game game-a --stage @stage-gate --name Bad --type battle --module missing >/tmp/e.json 2>/tmp/e.err; then
  fail "unknown module should fail"
fi
STARS='[{"id":"s1","label":"A","kind":"win"},{"id":"s2","label":"B","kind":"win"},{"id":"s3","label":"C","kind":"win"},{"id":"s4","label":"D","kind":"win"}]'
if $CLI encounter create --game game-a --stage @stage-gate --name Bad --type battle --module pad --stars "$STARS" >/tmp/e.json 2>/tmp/e.err; then
  fail "4 stars should fail"
fi
if $CLI encounter create --game game-a --stage @stage-gate --name Bad --type battle --module pad --stars '[{"id":"s1","label":"X","kind":"perfect"}]' >/tmp/e.json 2>/tmp/e.err; then
  fail "unknown star kind should fail"
fi
if $CLI encounter create --game game-a --stage @stage-gate --name Bad --type battle --module pad --tuning missing >/tmp/e.json 2>/tmp/e.err; then
  fail "missing tuning should fail"
fi
pass "type/module/star/tuning refused"

echo ""
echo "----------------------------------------"
echo "Region anchor checks"
echo "----------------------------------------"
if $CLI region create --game game-a --name R --background bg-a --anchors '[{"id":"a","pos":[2,0]}]' --spawn a >/tmp/r.json 2>/tmp/r.err; then
  fail "pos out of range should fail"
fi
if $CLI region create --game game-a --name R --background bg-a --anchors '[{"id":"a","pos":[0.5,0.5]}]' --spawn missing >/tmp/r.json 2>/tmp/r.err; then
  fail "bad spawn should fail"
fi
if $CLI region create --game game-a --name R --background logo-missing --anchors '[{"id":"a","pos":[0.5,0.5]}]' --spawn a >/tmp/r.json 2>/tmp/r.err; then
  fail "missing background should fail"
fi
pass "region anchor/background checks"

echo ""
echo "----------------------------------------"
echo "content apply dry-run writes nothing; re-apply 0 changes; failure writes nothing"
echo "----------------------------------------"
BUNDLE="$TEST_DIR/bundle.json"
cat > "$BUNDLE" <<'JSON'
{
  "worlds": [{ "key": "world-1", "name": "World 1", "order": 1 }],
  "stages": [{ "key": "stage-gate", "worldId": "@world-1", "name": "The Gate", "order": 1 }],
  "regions": [{
    "key": "region-gate-approach",
    "stageId": "@stage-gate",
    "name": "Gate approach",
    "backgroundAssetId": "Gate approach",
    "anchors": [{"id":"a-start","pos":[0.12,0.78]},{"id":"a-gate","pos":[0.80,0.70]}],
    "edges": [["a-start","a-gate"]],
    "spawn": "a-start",
    "hotspots": [{"id":"hs-gate","anchor":"a-gate","prompt":"Hack the gate"}],
    "exits": []
  }],
  "encounters": [{
    "key": "enc-gate-drone",
    "stageId": "@stage-gate",
    "name": "Gate Drone",
    "typeId": "battle",
    "moduleId": "pad",
    "sceneId": "Gate Drone Encounter",
    "tuningProfileId": "Gate Drone Encounter",
    "stars": [
      {"id":"s1","label":"Win","kind":"win"},
      {"id":"s2","label":"No misses","kind":"noMisses"}
    ]
  }]
}
JSON

BEFORE=$(hash_of "$STUDIO")
$CLI content apply --game game-a --file "$BUNDLE" --dry-run >/tmp/forge-1c-dry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "dry-run changed studio.json"
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-1c-dry.json"))
assert r["written"] is False
assert r["creates"] or r["unchanged"]
print("dry-run alias count", len(r["aliasMap"]))
PY
pass "dry-run writes nothing"

$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-1c-apply.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-1c-apply.json"))
assert r.get("creates") is not None
print("first apply creates", len(r["creates"]), "updates", len(r["updates"]))
PY
pass "first apply wrote records"

AFTER_APPLY=$(hash_of "$STUDIO")
$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-1c-re.json
AFTER_RE=$(hash_of "$STUDIO")
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-1c-re.json"))
assert r["creates"] == [], r
assert r["updates"] == [], r
assert r["written"] is False
print("re-apply unchanged", len(r["unchanged"]))
PY
[ "$AFTER_APPLY" = "$AFTER_RE" ] || fail "re-apply changed studio.json"
pass "re-apply reports 0 changes"

FAIL_BUNDLE="$TEST_DIR/fail.json"
python3 - <<'PY'
import json, os
src = json.load(open(os.environ["FORGE_DATA_DIR"] + "/bundle.json")) if False else None
PY
cat > "$FAIL_BUNDLE" <<'JSON'
{
  "encounters": [{
    "key": "enc-bad",
    "stageId": "@stage-gate",
    "name": "Bad",
    "typeId": "battle",
    "moduleId": "pad",
    "stars": [
      {"id":"s1","label":"A","kind":"win"},
      {"id":"s2","label":"B","kind":"win"},
      {"id":"s3","label":"C","kind":"win"},
      {"id":"s4","label":"D","kind":"win"}
    ]
  }]
}
JSON
FAIL_BEFORE=$(hash_of "$STUDIO")
if $CLI content apply --game game-a --file "$FAIL_BUNDLE" >/tmp/forge-1c-fail.json 2>/tmp/forge-1c-fail.err; then
  fail "invalid apply should fail"
fi
FAIL_AFTER=$(hash_of "$STUDIO")
[ "$FAIL_BEFORE" = "$FAIL_AFTER" ] || fail "failed apply wrote studio.json"
pass "failure writes nothing"

echo ""
echo "----------------------------------------"
echo "Second game stays separate"
echo "----------------------------------------"
$CLI world create --game game-b --name "Other World" --key world-1 --json >/tmp/forge-1c-b.json
python3 - <<'PY'
import json, os
studio = json.load(open(os.environ["FORGE_DATA_DIR"] + "/studio.json"))
a = [w for w in studio["assetPipeline"]["worlds"] if w["gameId"]=="game-a"]
b = [w for w in studio["assetPipeline"]["worlds"] if w["gameId"]=="game-b"]
assert len(a)==1 and a[0]["name"]=="World 1"
assert len(b)==1 and b[0]["name"]=="Other World"
print("two games isolated")
PY
pass "world in a second game stays separate"

echo ""
echo "----------------------------------------"
echo "In-use removal + settings guard"
echo "----------------------------------------"
if $CLI world remove --game game-a @world-1 >/tmp/rm.json 2>/tmp/rm.err; then
  fail "world in use should refuse"
fi
if $CLI game type remove --game game-a --id battle >/tmp/rmt.json 2>/tmp/rmt.err; then
  fail "type in use should refuse"
fi
if $CLI game module remove --game game-a --id pad >/tmp/rmm.json 2>/tmp/rmm.err; then
  fail "module in use should refuse"
fi
pass "in-use removal refused"

echo ""
echo "----------------------------------------"
echo "content export"
echo "----------------------------------------"
OUT="$TEST_DIR/out"
$CLI content export --game game-a --out "$OUT" >/tmp/forge-1c-export.json
python3 - <<PY
import json, os
path = os.path.join("$OUT", "content.json")
data = json.load(open(path))
assert data["contentSchemaVersion"] == 1
assert data["gameId"] == "game-a"
assert len(data["worlds"]) == 1
assert len(data["stages"]) == 1
assert len(data["encounters"]) == 1
assert len(data["regions"]) == 1
print("exported", path)
PY
pass "content export sidecar"

echo ""
echo "----------------------------------------"
echo "Stage reorder 1..N; unknown/missing refused; other worlds untouched"
echo "----------------------------------------"
$CLI stage create --game game-a --world @world-1 --name "Stage B" --key stage-b --order 2 >/tmp/forge-1c-sb.json
$CLI stage create --game game-a --world @world-1 --name "Stage C" --key stage-c --order 3 >/tmp/forge-1c-sc.json
$CLI world create --game game-a --name "World 2" --key world-2 --order 2 >/tmp/forge-1c-w2.json
$CLI stage create --game game-a --world @world-2 --name "Other" --key stage-other --order 1 >/tmp/forge-1c-so.json
$CLI stage reorder --game game-a --world @world-1 --ids @stage-c,@stage-gate,@stage-b >/tmp/forge-1c-reorder.json
python3 - <<'PY'
import json, os
studio = json.load(open(os.environ["FORGE_DATA_DIR"] + "/studio.json"))
stages = studio["assetPipeline"]["stages"]
w1 = [s for s in stages if s.get("key") in ("stage-c", "stage-gate", "stage-b")]
w1.sort(key=lambda s: s["order"])
assert [s["key"] for s in w1] == ["stage-c", "stage-gate", "stage-b"], w1
assert [s["order"] for s in w1] == [1, 2, 3], w1
other = [s for s in stages if s.get("key") == "stage-other"]
assert len(other) == 1 and other[0]["order"] == 1
out = json.load(open("/tmp/forge-1c-reorder.json"))
assert [s["key"] for s in out["records"]] == ["stage-c", "stage-gate", "stage-b"]
assert [s["order"] for s in out["records"]] == [1, 2, 3]
print("renumbered 1..N; other world untouched")
PY
pass "reorder renumbers 1..N"

if $CLI stage reorder --game game-a --world @world-1 --ids @stage-c,@stage-gate,missing >/tmp/forge-1c-re-unknown.json 2>/tmp/forge-1c-re-unknown.err; then
  fail "unknown id should be refused"
fi
pass "unknown id refused"

if $CLI stage reorder --game game-a --world @world-1 --ids @stage-c,@stage-gate >/tmp/forge-1c-re-missing.json 2>/tmp/forge-1c-re-missing.err; then
  fail "missing id should be refused"
fi
pass "missing ids refused"

if $CLI stage reorder --game game-a --world @world-1 --ids @stage-c,@stage-gate,@stage-other >/tmp/forge-1c-re-other.json 2>/tmp/forge-1c-re-other.err; then
  fail "stage from another world should be refused"
fi
pass "other-world id refused"

echo ""
echo -e "${GREEN}All 1c world-content checks passed${NC}"
