# Studio schema versions (1a)

This Forge build’s **supported studio schema is 2**. `studio.json` stores `schemaVersion` on the file wrapper and on `assetPipeline`. The **export manifest** (`schemaVersion: 2` in `EXPORT.md`) is a different number and is unchanged.

## Guard

If either field is **greater than 2**, the app and CLI refuse to load or save. Message includes the found version and the supported version. An older build left running cannot open a newer file and cannot overwrite it.

Missing `schemaVersion` is treated as 1.

## Read vs write

| Path | Function | Disk |
|---|---|---|
| list / show / export `--dry-run` / migrate `--dry-run` | `readStudio()` | Never writes. No lock file. Missing arrays filled **in memory only**. |
| create / update / real export / `forge migrate` | `loadStudio` / `saveStudio` | May write. First-time missing `studio.json` still creates a **v2** file. |
| App, schema 1 | `readStudio` via project open | Read-only banner; Electron saves throw until migrate. |
| CLI writes on v1 | `saveStudio` with `FORGE_CLI=1` | Still allowed (stay at v1 until `forge migrate`). |

Legacy load-time writes (persist empty `scenes`, copy absolute background paths) do **not** run on the read path. Background copies still run on the write load path only.

## What v2 adds in 1a (groundwork, not 1b/1c)

`forge migrate` (after a verified timestamped backup):

1. Sets both `schemaVersion` fields to **2**.
2. Ensures empty `worlds`, `stages`, `encounters`, `regions` arrays (no records yet — that is 1c).
3. Adds `settings` on each game if missing: empty `poseSlots` / `assetCategories` / `modules`, and default `encounterTypes` `battle`, `puzzle`, `minigame`, `story`.
4. Does **not** rewrite existing characters, poses, clips, storyboards, events, audio, or Game Definitions.
5. Optional `key` is allowed on Game, Character, VisualAsset, Scene, EventDefinition, and the new record types. **Never backfilled.**

New studios created by this build start at v2 (including `seedDefaultGames`, which is unchanged aside from attaching empty `settings`).

## Commands (Matt)

Quit the Electron app first.

```bash
# See the data dir you will touch (or set FORGE_DATA_DIR / --data-dir).
forge migrate --dry-run --json
# Confirm studio.json hash is unchanged, then:
forge migrate --json
```

Backup file: `studio.v1-backup-<UTC timestamp>.json` next to `studio.json` (userData, or `FORGE_DATA_DIR`). JSON includes `backupPath`. Reopen the app; existing screens should look the same.

Rollback: quit the app, copy the backup over `studio.json`, redeploy the previous commit if needed.

Idempotent: a second `forge migrate` reports already at v2 and writes nothing.

## 1b (same schema v2 — no bump)

Optional fields only. Missing means empty / core-five required:

- `game.settings.poseSlots` / `assetCategories` (lists were empty after 1a)
- `character.poseSlots` and `character.corePosesRequired` (optional; default empty / true)
- `Pose.slot` and `VisualAsset.category` are free-form strings validated against the effective lists
- built-in asset category `background` is code, not a schema bump

## 1c (same schema v2 — no bump)

The empty `worlds` / `stages` / `encounters` / `regions` arrays from 1a now hold records. Optional `key` slugs (unique per game and record type) accept `@key` aliases. Validation is game-agnostic: types and modules come from `game.settings`.

- **World:** name, description?, order. No refs.
- **Stage:** worldId in the same game.
- **Encounter:** typeId in `settings.encounterTypes`; moduleId in `settings.modules` and supports that type; sceneId in the same game (uuid, `@key`, or exact name); tuningProfileId is a Game Definition tuning row (uuid or name); difficultyProfileId stored, not checked; at most 3 stars; star kind must be in the module's `starKinds` when that list is present.
- **Region:** background asset must be a background-based category; unique anchor ids; pos in 0..1; edges/spawn/hotspots/exits reference real anchors; exits target a region in the same game. Edges are `[a,b]` or `{from,to,requires?,hint?}`. `requires` is stored with a warning and ignored until vehicles.
- Removing a record is refused while other records reference it. Removing an encounter type or module is refused while encounters use it.

`forge content export --game <id> --out <dir>` writes `<dir>/content.json` with `contentSchemaVersion: 1`. Export **manifest v2 is unchanged**.

Sample Gate Drone bundle (docs only, not app code): `docs/samples/gate-drone-content.json`.

## 1d (same schema v2 — no bump)

Optional fields only. Missing means no map, no entry region, and no hotspot/exit links. 1c records stay valid. No migrate and no backup.

- **World.map:** `backgroundAssetId` (background-based category in this game), `nodes[]` (unique ids; stage in this world; at most one node per stage; pos 0..1; optional `label`, `hidden`), `paths[]` (from/to real different nodes; no duplicate pair; two-way; optional waypoints in 0..1, drawing only), `startNodeId` (required once a node exists; real node; that stage cannot have `unlockAfter`).
- **Stage:** `unlockAfter` (stages in this world, not itself, no cycles), `clearedBy` (encounters in this stage; default = every hotspot-linked encounter), `entryRegionId` / `entryAnchor` (region in this stage; anchor defaults to spawn), `returnToNode` (a node on this world's map; default = the stage's own node).
- **Region hotspot.encounterId:** encounter in the same stage; a region with no stage cannot set it.
- **Region exit:** either `toRegionId` or `toWorldMap: true`, never both.

Removing a record is refused while something points at it (including a map node, an entry region, or a hotspot-linked encounter). Removing a node also removes its paths and is refused for the start node.

`forge content export` includes these fields. **`contentSchemaVersion` stays 1** (every field is optional/additive; readers that ignore unknown keys keep working). Export **manifest v2 is unchanged**.

Save paths keep fields they do not know about (in-place updates plus apply overlay), so later optional keys survive a name-only update or a bundle that omits them.

## 2a (same schema v2 — no bump)

Optional top-level `enemies` array, filled in memory when missing (same as `worlds`). No migrate. No freemium / currency / reward fields. Still poses only.

- **Game.settings.modules[].winConditions:** optional unique string keys (camelCase allowed). Removal is refused while an enemy in this game uses that kind.
- **Enemy:** `id`, optional `key`, `gameId`, `name`, `characterId` (same game), `moduleId` (exists and supports `battle`), `winCondition: { kind, params }` (`kind` must be in that module's `winConditions`; `params` are flat numbers), `stats` (flat numbers), `poses` (built-in moments `idle` / `telegraph` / `attack` / `hit` / `defeat` / `win` → a pose slot of that character: core, game, or character), optional reserved `attackTableId` (stored, not validated), optional `assets[]` `{ role, assetId, states? }` (states must exist), optional `notes`.
- Character removal is refused while an enemy uses it (message names the enemy).
- `content apply` / `content export` include `enemies`. **`contentSchemaVersion` stays 1**. Export **manifest v2 is unchanged**. Saves overlay unknown fields so extra keys survive an update.

## Out of 1a / 1b / 1c / 1d / 2a

- Attack tables and difficulty (2b / 2c)
- A4 portable export package
- `seedDefaultGames` and the Neon Recall Game Definition markdown special case (flagged only)
- ScenesView / StoryboardEditor store-refresh bug (deferred)
- Visual map editor (step 6)
