# Gate Drone content bundle (example seed only)

This is **data**, not app code. Dry-run against a copy of the studio first. Do not treat `memory_pad` / Gate Drone names as hardcoded in Forge.

## Prepare (same game as the existing Gate Drone Encounter scene)

```bash
# Background asset the region picks by name ("Gate approach"):
forge asset create --game game-neon-recall --name "Gate approach" --category background --image ./alley.png --json

# Module used by the encounter (star kinds match the sample):
forge game module add --game game-neon-recall --id memory_pad --label "Memory pad" --type-ids battle --star-kinds win,noMisses,timeUnder --json

# Scene + tuning row: the sample looks them up by **name**
#   sceneId: "Gate Drone Encounter"
#   tuningProfileId: "Gate Drone Encounter"
# If your scene is named "Gate Drone Battle", change sceneId in the JSON (or pass the uuid).
```

## Apply

```bash
forge content apply --game game-neon-recall --file docs/samples/gate-drone-content.json --dry-run --json
# Prints alias map (@world-1 → uuid, …), creates/updates, validation issues. Writes nothing.

forge content apply --game game-neon-recall --file docs/samples/gate-drone-content.json --json
# Re-apply reports 0 changes (matched by key).
```

`backgroundAssetId` is a visual asset uuid, `@key`, or name. `sceneId` / `tuningProfileId` accept uuid, `@key`, or exact name in this game.
