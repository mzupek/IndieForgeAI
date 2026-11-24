# Gate Drone content bundle (example seed only)

This is **data**, not app code. Dry-run against a copy of the studio first. Do not treat `memory_pad` / Gate Drone names as hardcoded in Forge.

## Prepare (same game as the existing Gate Drone Encounter scene)

```bash
# Region background (picked by name "Gate approach"):
forge asset create --game game-neon-recall --name "Gate approach" --category background --image ./alley.png --json

# World map background (picked by name "World 1 map"):
forge asset create --game game-neon-recall --name "World 1 map" --category background --image ./map.png --json

# Module used by the encounter (star kinds match the sample):
forge game module add --game game-neon-recall --id memory_pad --label "Memory pad" --type-ids battle --star-kinds win,noMisses,timeUnder --json

# Scene + tuning row: the sample looks them up by **name**
#   sceneId: "Gate Drone Encounter"
#   tuningProfileId: "Gate Drone Encounter"
#
# Enemy link: encounter.enemies[0].enemyId is the existing "Gate Drone" enemy (by name).
# Difficulty is omitted (player's choice). Story / Normal / Hard profiles are in the bundle.
```

## Apply

```bash
forge content apply --game game-neon-recall --file docs/samples/gate-drone-content.json --dry-run --json
# Prints alias map, creates/updates, validation issues. Writes nothing.

forge content apply --game game-neon-recall --file docs/samples/gate-drone-content.json --json
# Re-apply reports 0 changes (matched by key).

forge world flow --game game-neon-recall @world-1 --json
# Expected: World 1 > The Gate > Gate approach > hs-gate > Gate Drone with 0 errors.
```

`backgroundAssetId` is a visual asset uuid, `@key`, or name. `sceneId` / `tuningProfileId` accept uuid, `@key`, or exact name in this game. Map node `stageId`, stage `entryRegionId` / `clearedBy`, and hotspot `encounterId` accept `@key` aliases resolved across the file.
