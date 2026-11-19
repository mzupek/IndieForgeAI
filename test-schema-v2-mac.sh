#!/bin/bash
# Schema v2 safety (1a): refuse-newer, read/migrate/export dry-run no-write,
# migrate backup + bump + idempotent. Isolated mktemp + FORGE_DATA_DIR only.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Schema v2 / 1a safety verification"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, isolated tmpdir, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/studio/schema.test.ts
echo ""
npx tsx src/core/storage/studioMigrate.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-schema-v2-XXXXXX)
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
studio = {
  "schemaVersion": 1,
  "createdAt": now,
  "updatedAt": now,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "studio",
    "name": "Studio",
    "description": "",
    "games": [{
      "id": "game-test",
      "name": "Test Game",
      "engine": "unity",
      "exportRoot": "./exports/test",
      "createdAt": now,
      "updatedAt": now
    }],
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
    "assetStates": [],
    "fonts": [],
    "palettes": [],
    "eventDefinitions": [],
    "eventBindings": [],
    "audioAssets": [],
    "createdAt": now,
    "updatedAt": now
  }
}
path = os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
with open(path, "w") as f:
    json.dump(studio, f, indent=2)
    f.write("\n")
PY
pass "v1 studio.json fixture"

hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}
mtime_of() { python3 -c "import os; print(os.stat('$1').st_mtime_ns)"; }
listing() { python3 -c "import os; print('\\n'.join(sorted(os.listdir('$TEST_DIR'))))"; }

echo ""
echo "----------------------------------------"
echo "games list (read) does not write"
echo "----------------------------------------"
H1=$(hash_of "$STUDIO")
M1=$(mtime_of "$STUDIO")
L1=$(listing)
$CLI games list >/dev/null
H2=$(hash_of "$STUDIO")
M2=$(mtime_of "$STUDIO")
L2=$(listing)
[ "$H1" = "$H2" ] || fail "games list changed studio.json hash"
[ "$M1" = "$M2" ] || fail "games list changed studio.json mtime"
[ "$L1" = "$L2" ] || fail "games list changed folder listing"
pass "games list: hash/mtime/listing unchanged"

echo ""
echo "----------------------------------------"
echo "export --dry-run does not persist exportTarget"
echo "----------------------------------------"
$CLI export game-test --dry-run >/dev/null
H3=$(hash_of "$STUDIO")
[ "$H1" = "$H3" ] || fail "export dry-run changed studio.json"
python3 -c "import json; d=json.load(open('$STUDIO')); assert 'exportTarget' not in d['assetPipeline']['games'][0]"
pass "export --dry-run writes nothing"

echo ""
echo "----------------------------------------"
echo "migrate --dry-run writes nothing"
echo "----------------------------------------"
DRY=$($CLI migrate --dry-run)
echo "$DRY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['dryRun'] is True and d['written'] is False
assert d['alreadyCurrent'] is False
assert d['plan']['targetSchemaVersion']==2
assert len(d['plan']['changes'])>0
"
H4=$(hash_of "$STUDIO")
[ "$H1" = "$H4" ] || fail "migrate --dry-run changed studio.json"
[ "$(listing)" = "$L1" ] || fail "migrate --dry-run changed folder listing"
pass "migrate --dry-run: plan only"

echo ""
echo "----------------------------------------"
echo "migrate: backup + bump; second run no-op"
echo "----------------------------------------"
MIG=$($CLI migrate)
echo "$MIG" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['written'] is True and d['backupPath']
assert d['plan']['targetSchemaVersion']==2
"
BACKUP=$(echo "$MIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['backupPath'])")
[ -f "$BACKUP" ] || fail "backup file missing"
python3 -c "
import json
orig=json.load(open('$BACKUP'))
assert orig['schemaVersion']==1
cur=json.load(open('$STUDIO'))
assert cur['schemaVersion']==2
assert cur['assetPipeline']['schemaVersion']==2
assert cur['assetPipeline']['worlds']==[]
assert cur['assetPipeline']['games'][0]['id']=='game-test'
assert 'settings' in cur['assetPipeline']['games'][0]
"
pass "backup is v1; studio.json is v2"

AGAIN=$($CLI migrate)
echo "$AGAIN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['alreadyCurrent'] is True and d['written'] is False
"
BACKUPS=$(ls "$TEST_DIR"/studio.v1-backup-*.json | wc -l | tr -d ' ')
[ "$BACKUPS" = "1" ] || fail "second migrate wrote another backup"
pass "second migrate is a no-op"

echo ""
echo "----------------------------------------"
echo "refuse schemaVersion newer than supported"
echo "----------------------------------------"
python3 - <<'PY'
import json, os
path=os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
d=json.load(open(path))
d["schemaVersion"]=99
d["assetPipeline"]["schemaVersion"]=99
json.dump(d, open(path,"w"), indent=2)
PY
if NEWER=$($CLI games list 2>&1); then
  fail "games list should refuse schema 99"
else
  echo "$NEWER" | python3 -c "import sys; t=sys.stdin.read(); assert 'schemaVersion 99' in t and 'supports up to' in t"
fi
pass "refuse-newer on read command"

echo ""
echo "=========================================="
echo -e "${GREEN}All schema v2 / 1a checks passed${NC}"
echo "=========================================="
