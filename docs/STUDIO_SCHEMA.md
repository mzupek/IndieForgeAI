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

## Out of 1a

- Custom pose slots / asset categories (1b)
- World / Stage / Encounter / Region CRUD, screens, `content apply` (1c)
- Export manifest changes / A4
- `seedDefaultGames` and the Neon Recall Game Definition markdown special case (flagged only)
- ScenesView / StoryboardEditor store-refresh bug (deferred)
