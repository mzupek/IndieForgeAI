#!/bin/bash
# 1d World stage node map. Isolated mktemp + FORGE_DATA_DIR only.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "1d world stage node map"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, isolated tmpdir, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/worldContent/validate.test.ts
echo ""
npx tsx --tsconfig tsconfig.node.json src/core/storage/worldContentService.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-1d-map-XXXXXX)
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
    "characters": [], "poses": [], "clips": [], "scenePresets": [],
    "scenes": [{
      "id": "scene-a", "gameId": "game-a", "name": "Gate Drone Encounter",
      "cast": [], "poseRefs": [], "clipRefs": [], "audioRefs": [], "interactionHooks": [], "attachedPresets": [],
      "createdAt": now, "updatedAt": now
    }],
    "storyboards": [], "storyboardShots": [], "exportProfiles": [],
    "gameDefinitions": [{
      "id": "def-a", "gameId": "game-a", "stage": "MVP", "pillars": [], "puzzleCore": "", "storySynopsis": "",
      "cast": [], "linkedAssets": {"poses": [], "clips": [], "presets": []},
      "themeSlots": [], "interactions": [],
      "tuningProfiles": [{"id": "tune-a", "name": "Gate Drone Encounter", "params": {"hp": 20}}],
      "keepCutInvent": {"keep": [], "cut": [], "invent": []},
      "mvpBoard": [], "markdownSource": "", "createdAt": now, "updatedAt": now
    }],
    "visualAssets": [
      {
        "id": "bg-a", "gameId": "game-a", "key": "bg-gate-approach", "name": "Gate approach",
        "category": "background", "tags": [], "defaultStateId": None, "schemaVersion": 2,
        "createdAt": now, "updatedAt": now
      },
      {
        "id": "bg-map", "gameId": "game-a", "name": "World 1 map",
        "category": "background", "tags": [], "defaultStateId": None, "schemaVersion": 2,
        "createdAt": now, "updatedAt": now
      }
    ],
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
echo "Game-agnostic: no title-specific ids in 1d app modules"
echo "----------------------------------------"
if grep -RInE 'memory_pad|game-neon-recall|Gate Drone|ride_boost' \
  src/shared/worldContent \
  src/core/storage/worldContentService.ts \
  src/cli/commands/worldContent.ts \
  src/renderer/components/WorldsView.tsx \
  src/renderer/components/WorldMapPanel.tsx \
  src/renderer/components/WorldFlowPreview.tsx \
  >/dev/null 2>&1; then
  fail "game-specific strings leaked into 1d app modules"
fi
pass "no game-specific strings in 1d modules"

echo ""
echo "----------------------------------------"
echo "Map CLI: set, node add/move/remove, path add/remove, show"
echo "----------------------------------------"
$CLI world create --game game-a --name "World 1" --key world-1 --order 1 >/tmp/forge-1d-world.json
$CLI stage create --game game-a --world @world-1 --name "The Gate" --key stage-gate --order 1 >/tmp/forge-1d-stage.json
$CLI stage create --game game-a --world @world-1 --name "Test" --key stage-test --order 2 >/tmp/forge-1d-stage2.json
$CLI world map set --game game-a @world-1 --background "World 1 map" >/tmp/forge-1d-mapset.json
$CLI world map node add --game game-a @world-1 --stage @stage-gate --pos 0.18,0.72 --id n-gate >/tmp/forge-1d-node.json
$CLI world map node add --game game-a @world-1 --stage @stage-test --pos 0.46,0.55 --id n-test >/tmp/forge-1d-node2.json
$CLI world map node move --game game-a @world-1 n-gate --pos 0.20,0.70 >/tmp/forge-1d-move.json
$CLI world map path add --game game-a @world-1 --from n-gate --to n-test --id p-gt --waypoints "0.30,0.70;0.38,0.58" >/tmp/forge-1d-path.json
$CLI world map show --game game-a @world-1 >/tmp/forge-1d-show.json
python3 - <<'PY'
import json
shown = json.load(open("/tmp/forge-1d-show.json"))
m = shown["map"]
assert m["startNodeId"] == "n-gate", m
assert any(n["id"]=="n-gate" and n["pos"]==[0.2, 0.7] for n in m["nodes"]), m["nodes"]
assert any(p["id"]=="p-gt" for p in m["paths"]), m["paths"]
print("map show ok")
PY
pass "map set / node / path / show"

echo ""
echo "----------------------------------------"
echo "Refusals"
echo "----------------------------------------"
$CLI world create --game game-a --name "World 2" --key world-2 --order 2 >/tmp/forge-1d-w2.json
$CLI world map set --game game-a @world-2 --background "World 1 map" >/tmp/forge-1d-w2set.json
if $CLI world map node add --game game-a @world-2 --stage @stage-gate --pos 0.1,0.1 --id n-x >/tmp/x.json 2>/tmp/x.err; then
  fail "node for a stage in another world should fail"
fi
if $CLI world map node add --game game-a @world-1 --stage @stage-gate --pos 0.3,0.3 --id n-dup >/tmp/x.json 2>/tmp/x.err; then
  fail "second node for a stage should fail"
fi
if $CLI world map node add --game game-a @world-1 --stage @stage-test --pos 2,0 --id n-bad >/tmp/x.json 2>/tmp/x.err; then
  fail "pos outside 0..1 should fail"
fi
if $CLI world map path add --game game-a @world-1 --from n-gate --to missing >/tmp/x.json 2>/tmp/x.err; then
  fail "path to missing node should fail"
fi
if $CLI world map node remove --game game-a @world-1 n-gate >/tmp/x.json 2>/tmp/x.err; then
  fail "removing start node should fail"
fi
if $CLI stage update --game game-a @stage-gate --unlock-after @stage-test >/tmp/x.json 2>/tmp/x.err; then
  fail "start node stage unlockAfter should fail"
fi
$CLI stage update --game game-a @stage-test --unlock-after @stage-gate >/tmp/forge-1d-unlock.json
if $CLI stage update --game game-a @stage-gate --unlock-after @stage-test >/tmp/x.json 2>/tmp/x.err; then
  fail "unlock cycle should fail"
fi

$CLI region create --game game-a --name "Gate approach" --key region-gate-approach --stage @stage-gate \
  --background "Gate approach" --anchors '[{"id":"a-start","pos":[0.12,0.78]},{"id":"a-gate","pos":[0.80,0.70]}]' \
  --spawn a-start --edges '[["a-start","a-gate"]]' --hotspots '[{"id":"hs-gate","anchor":"a-gate","prompt":"Hack the gate"}]' \
  --exits '[]' >/tmp/forge-1d-region.json

$CLI region create --game game-a --name "Other room" --key region-other --stage @stage-test \
  --background "Gate approach" --anchors '[{"id":"a-start","pos":[0.5,0.5]}]' --spawn a-start \
  >/tmp/forge-1d-region2.json

if $CLI stage update --game game-a @stage-gate --entry-region @region-other >/tmp/x.json 2>/tmp/x.err; then
  fail "entry region from another stage should fail"
fi
$CLI stage update --game game-a @stage-gate --entry-region @region-gate-approach --entry-anchor a-start >/tmp/forge-1d-entry.json
if $CLI stage update --game game-a @stage-gate --entry-region @region-gate-approach --entry-anchor missing >/tmp/x.json 2>/tmp/x.err; then
  fail "missing entry anchor should fail"
fi

$CLI encounter create --game game-a --stage @stage-gate --name "Gate Drone" --key enc-gate-drone \
  --type battle --module pad --scene "Gate Drone Encounter" --tuning "Gate Drone Encounter" \
  --stars '[{"id":"s1","label":"Win","kind":"win"}]' >/tmp/forge-1d-enc.json
$CLI encounter create --game game-a --stage @stage-test --name "Other fight" --key enc-other \
  --type battle --module pad >/tmp/forge-1d-enc2.json

if $CLI region update --game game-a @region-gate-approach \
  --hotspots '[{"id":"hs-gate","anchor":"a-gate","prompt":"Hack the gate","encounterId":"@enc-other"}]' \
  >/tmp/x.json 2>/tmp/x.err; then
  fail "hotspot encounter from another stage should fail"
fi
if $CLI region update --game game-a @region-gate-approach \
  --exits '[{"id":"x-both","anchor":"a-start","toRegionId":"@region-other","toWorldMap":true}]' \
  >/tmp/x.json 2>/tmp/x.err; then
  fail "exit with both targets should fail"
fi
pass "refusals"

echo ""
echo "----------------------------------------"
echo "Remove refusals for stages with nodes, entry regions, linked encounters"
echo "----------------------------------------"
$CLI region update --game game-a @region-gate-approach \
  --hotspots '[{"id":"hs-gate","anchor":"a-gate","prompt":"Hack the gate","encounterId":"@enc-gate-drone"}]' \
  --exits '[{"id":"x-map","anchor":"a-start","toWorldMap":true}]' >/tmp/forge-1d-link.json
$CLI stage update --game game-a @stage-gate --cleared-by @enc-gate-drone >/tmp/forge-1d-cleared.json

if $CLI stage remove --game game-a @stage-gate >/tmp/x.json 2>/tmp/x.err; then
  fail "stage with map node should refuse remove"
fi
if $CLI region remove --game game-a @region-gate-approach >/tmp/x.json 2>/tmp/x.err; then
  fail "entry region should refuse remove"
fi
if $CLI encounter remove --game game-a @enc-gate-drone >/tmp/x.json 2>/tmp/x.err; then
  fail "hotspot-linked encounter should refuse remove"
fi
pass "in-use remove refused"

echo ""
echo "----------------------------------------"
echo "Sample bundle: dry-run / apply / re-apply / failure writes nothing"
echo "----------------------------------------"
BUNDLE="$TEST_DIR/bundle.json"
cp docs/samples/gate-drone-content.json "$BUNDLE"
python3 - <<'PY'
import json, os
path = os.environ["FORGE_DATA_DIR"] + "/bundle.json"
data = json.load(open(path))
# Fixture module id is pad, not memory_pad
data["encounters"][0]["moduleId"] = "pad"
json.dump(data, open(path, "w"), indent=2)
PY

BEFORE=$(hash_of "$STUDIO")
$CLI content apply --game game-a --file "$BUNDLE" --dry-run >/tmp/forge-1d-dry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "dry-run changed studio.json"
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-1d-dry.json"))
assert r["written"] is False
print("dry-run alias count", len(r["aliasMap"]))
PY
pass "dry-run writes nothing"

$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-1d-apply.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-1d-apply.json"))
assert r.get("creates") is not None
print("apply creates", len(r["creates"]), "updates", len(r["updates"]), "unchanged", len(r["unchanged"]))
PY
pass "sample apply"

AFTER_APPLY=$(hash_of "$STUDIO")
$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-1d-re.json
AFTER_RE=$(hash_of "$STUDIO")
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-1d-re.json"))
assert r["creates"] == [], r
assert r["updates"] == [], r
assert r["written"] is False
print("re-apply unchanged", len(r["unchanged"]))
PY
[ "$AFTER_APPLY" = "$AFTER_RE" ] || fail "re-apply changed studio.json"
pass "re-apply reports 0 changes"

FAIL_BUNDLE="$TEST_DIR/fail.json"
cat > "$FAIL_BUNDLE" <<'JSON'
{
  "stages": [{
    "key": "stage-gate",
    "worldId": "@world-1",
    "name": "The Gate",
    "unlockAfter": ["@stage-gate"]
  }]
}
JSON
FAIL_BEFORE=$(hash_of "$STUDIO")
if $CLI content apply --game game-a --file "$FAIL_BUNDLE" >/tmp/forge-1d-fail.json 2>/tmp/forge-1d-fail.err; then
  fail "broken bundle should fail"
fi
FAIL_AFTER=$(hash_of "$STUDIO")
[ "$FAIL_BEFORE" = "$FAIL_AFTER" ] || fail "failed apply wrote studio.json"
pass "failure writes nothing"

echo ""
echo "----------------------------------------"
echo "world flow + path cut"
echo "----------------------------------------"
# Sample apply replaced the map with the single Gate node. Re-add the test node/path.
$CLI world map node add --game game-a @world-1 --stage @stage-test --pos 0.46,0.55 --id n-test >/tmp/forge-1d-node2b.json
$CLI world map path add --game game-a @world-1 --from n-gate --to n-test --id p-gt >/tmp/forge-1d-pathb.json
$CLI world flow --game game-a @world-1 >/tmp/forge-1d-flow.json
python3 - <<'PY'
import json
flow = json.load(open("/tmp/forge-1d-flow.json"))
errors = [i for i in flow["issues"] if i["level"]=="error"]
assert errors == [], errors
blob = json.dumps(flow)
assert "The Gate" in blob
assert "Gate approach" in blob
print("flow 0 errors")
PY
pass "flow on sample is 0 errors"

$CLI world map path remove --game game-a @world-1 p-gt >/tmp/forge-1d-cut.json
$CLI world flow --game game-a @world-1 >/tmp/forge-1d-flow2.json
python3 - <<'PY'
import json
flow = json.load(open("/tmp/forge-1d-flow2.json"))
msgs = " ".join(i["message"] for i in flow["issues"])
assert "No path reaches" in msgs or "unreachable" in msgs.lower() or "no path" in msgs.lower(), msgs
print("cut path flagged")
PY
$CLI world map path add --game game-a @world-1 --from n-gate --to n-test --id p-gt >/tmp/forge-1d-pathback.json
pass "cutting a path flags unreachable"

echo ""
echo "----------------------------------------"
echo "Export map fields; second game isolated; unknown fields survive"
echo "----------------------------------------"
OUT="$TEST_DIR/out"
$CLI content export --game game-a --out "$OUT" >/tmp/forge-1d-export.json
python3 - <<PY
import json, os
path = os.path.join("$OUT", "content.json")
data = json.load(open(path))
assert data["contentSchemaVersion"] == 1
assert data["worlds"][0]["map"]["startNodeId"] == "n-gate"
assert any(s.get("entryRegionId") for s in data["stages"])
print("export includes map fields")
PY
pass "export includes map fields"

$CLI world create --game game-b --name "Other World" --key world-1 >/tmp/forge-1d-b.json
python3 - <<'PY'
import json, os
studio = json.load(open(os.environ["FORGE_DATA_DIR"] + "/studio.json"))
b = [w for w in studio["assetPipeline"]["worlds"] if w["gameId"]=="game-b"]
assert len(b)==1
assert not b[0].get("map")
print("second game isolated")
PY
pass "second game sees none of the map"

python3 - <<'PY'
import json, os
path = os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
studio = json.load(open(path))
for w in studio["assetPipeline"]["worlds"]:
    if w.get("key")=="world-1" and w["gameId"]=="game-a":
        w["_keepUnknown"] = True
json.dump(studio, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
$CLI world update --game game-a @world-1 --name "World 1" >/tmp/forge-1d-keep.json
python3 - <<'PY'
import json, os
studio = json.load(open(os.environ["FORGE_DATA_DIR"] + "/studio.json"))
w = next(x for x in studio["assetPipeline"]["worlds"] if x.get("key")=="world-1" and x["gameId"]=="game-a")
assert w.get("_keepUnknown") is True, w
assert w.get("map", {}).get("startNodeId")=="n-gate"
print("unknown + map fields preserved on name update")
PY
pass "saves preserve unknown fields and map"

echo ""
echo -e "${GREEN}All 1d world-map checks passed${NC}"
