# Export & Manifest System

The Adventure Lens Games asset pipeline exports game-ready assets to Unity and Godot projects with a versioned JSON manifest for engine integration.

## Overview

The export system:
- **Copies only APPROVED poses** (1024x1024 PNG files with alpha channel)
- **Includes clips** (video files and thumbnails)
- **References scene presets** used in the game
- **Works incrementally** - only copies changed files
- **Never deletes** files outside the IndieForge subfolder
- **Validates before export** - warns on incomplete character sets, errors on missing files
- **Provides dry-run mode** - preview changes without copying

## Export Targets

### Unity (Neon Recall)
- **Project Path**: `~/Documents/Agencies/1182/Neon_Recall`
- **Export Subfolder**: `Assets/IndieForge/game-neon-recall/`
- **Unity imports** assets automatically from the Assets folder

### Godot (Ring'Em Up)
- **Project Path**: `/Users/mzupek/Documents/Agencies/1182/RingEmUp`
- **Export Subfolder**: `assets/indie_forge/game-ring-em-up/`
- **Godot resource path**: `res://assets/indie_forge/game-ring-em-up/`

Export targets are configurable per game in the Studio UI or via the CLI.

## Manifest Schema

The export manifest (`manifest.json`) is a versioned JSON file describing all exported assets with relative paths inside the export directory.

**Schema Version**: 1

**Location**: Exported to `<export-dir>/manifest.json`

**JSON Schema**: [`docs/export-manifest-schema.json`](docs/export-manifest-schema.json)

### Manifest Structure

```json
{
  "schemaVersion": 1,
  "exportedAt": "2024-01-01T00:00:00.000Z",
  "game": {
    "id": "game-neon-recall",
    "name": "Neon Recall",
    "engine": "unity"
  },
  "characters": [
    {
      "id": "char-uuid",
      "name": "Hero",
      "role": "protagonist",
      "styleNotes": "Cyberpunk detective style",
      "tags": ["player", "main"],
      "poses": [
        {
          "slot": "ready",
          "file": "poses/char-uuid_ready.png",
          "width": 1024,
          "height": 1024,
          "status": "approved"
        }
      ]
    }
  ],
  "clips": [
    {
      "id": "clip-uuid",
      "moment": "intro",
      "characterId": "char-uuid",
      "durationSec": 1.5,
      "file": "clips/clip-uuid_clip.mp4",
      "thumbnail": "clips/clip-uuid_thumb.png",
      "tags": ["cinematic"]
    }
  ],
  "presets": [
    {
      "id": "preset-uuid",
      "type": "versus",
      "params": {
        "cameraAngle": "low",
        "zoom": 1.2,
        "framingPadding": 40
      },
      "tags": ["battle", "dramatic"]
    }
  ]
}
```

### Manifest Fields

#### `schemaVersion` (integer, required)
Schema version for compatibility checking. Current version: 1.

#### `exportedAt` (string, ISO 8601, required)
Timestamp when this manifest was generated.

#### `game` (object, required)
Game metadata:
- `id`: Game identifier
- `name`: Human-readable game name
- `engine`: "unity" or "godot"

#### `characters` (array, required)
Characters with **approved poses only**. Characters with no approved poses are omitted.

Each character includes:
- `id`: Character identifier
- `name`: Character name
- `role`: Character role (protagonist, antagonist, support, npc)
- `styleNotes`: Optional style notes for the character
- `tags`: Character tags
- `poses`: Array of approved poses (see below)

#### `poses` (array per character)
**Only APPROVED poses** (status = "approved") are exported.

Each pose includes:
- `slot`: Pose slot (ready, success, hurt, win, defeat)
- `file`: Relative path to pose image (e.g., `poses/char-uuid_ready.png`)
- `width`: Image width (always 1024 for approved poses)
- `height`: Image height (always 1024 for approved poses)
- `status`: Always "approved" in exports

#### `clips` (array, required)
All clips for cutscenes and moments.

Each clip includes:
- `id`: Clip identifier
- `moment`: Clip moment (intro, hit, finisher, defeat, story_beat)
- `characterId`: Optional associated character ID
- `durationSec`: Duration in seconds
- `file`: Relative path to video file (e.g., `clips/clip-uuid_clip.mp4`)
- `thumbnail`: Relative path to thumbnail (e.g., `clips/clip-uuid_thumb.png`)
- `tags`: Clip tags

#### `presets` (array, required)
Scene and camera presets referenced by the game.

Each preset includes:
- `id`: Preset identifier
- `type`: Preset type (versus, zoom_punch, shake, flash, freeze)
- `params`: Preset parameters (schema varies by type)
- `tags`: Preset tags

## Export Directory Structure

```
<export-dir>/
├── manifest.json          # Versioned manifest
├── poses/
│   ├── char1_ready.png   # 1024x1024 approved poses
│   ├── char1_success.png
│   ├── char1_hurt.png
│   ├── char1_win.png
│   ├── char1_defeat.png
│   └── char2_ready.png
└── clips/
    ├── clip1_clip.mp4    # Video files
    ├── clip1_thumb.png   # Thumbnails
    ├── clip2_clip.mp4
    └── clip2_thumb.png
```

## Validation

The export system validates before copying files:

### Errors (block export)
- Missing pose files on disk
- Missing clip files or thumbnails on disk

### Warnings (allow export)
- Characters with incomplete pose sets (missing approved poses for some slots)
- Characters with no approved poses (character omitted from export)

## Dry Run Mode

Preview what would be exported without copying files:

**UI**: Click "Validate" to see dry-run preview  
**CLI**: `forge export <game-id> --dry-run --json`

Dry-run output shows:
- Files that would be copied (new or modified)
- Files that are already up-to-date (unchanged)
- Total file count and size
- Validation warnings and errors

## Incremental Export

The export system uses file hashing (SHA-256) to detect changes:
- **New files**: Not present in export directory
- **Modified files**: Hash differs from export directory
- **Unchanged files**: Hash matches, skipped

This ensures efficient exports even for large asset sets.

## Safety Guarantees

1. **Never deletes files** - Export only adds or updates files
2. **Confined to IndieForge subfolder** - No changes outside Assets/IndieForge/ (Unity) or assets/indie_forge/ (Godot)
3. **Validation before export** - Checks files exist before copying
4. **Dry-run preview** - See changes before committing

## CLI Usage

### Export with validation
```bash
forge export game-neon-recall --json
```

### Dry run (no files copied)
```bash
forge export game-neon-recall --dry-run --json
```

### Export to custom target
```bash
forge export game-neon-recall --target /path/to/project --json
```

### Print JSON Schema
```bash
forge export schema --json
```

## UI Usage

1. Navigate to **Export** in the Studio sidebar
2. Select a game
3. Review the validation summary
4. View the dry-run preview (files to be copied)
5. Edit the export target path if needed
6. Click **Export** to copy files

## Human-Only Approval

**Important**: The CLI cannot approve poses. Approval is a human-only decision.

- CLI can import poses (default status: "draft")
- Only humans can approve poses via the UI
- Only APPROVED poses are exported

This ensures quality control and prevents automated approval of AI-generated content.

## Engine Integration

### Unity
Place the exported manifest and assets in `Assets/IndieForge/<game-id>/`. Unity will:
- Auto-import PNG files as Texture2D
- Auto-import MP4 files as VideoClip
- Load manifest.json as TextAsset

Parse the manifest in C# to map character IDs to pose textures and clip references.

### Godot
Place the exported manifest and assets in `assets/indie_forge/<game-id>/`. Godot will:
- Auto-import PNG files as Texture
- Auto-import MP4/WEBM as VideoStream
- Load manifest.json via JSON.parse()

Use the manifest to map character IDs to pose textures and clip resources.

## Versioning

The `schemaVersion` field enables backward compatibility:
- **Version 1**: Initial schema (current)
- Future versions may add fields while maintaining backward compatibility
- Engines should check `schemaVersion` and handle unknown versions gracefully

## Example Workflow

1. **Create & approve poses** for characters in the Studio UI
2. **Import clips** via CLI or UI
3. **Create presets** for camera effects
4. **Validate export** to check readiness
5. **Dry-run** to preview changes
6. **Export** to copy files to game project
7. **Engine auto-imports** assets
8. **Parse manifest** in engine to load assets by ID

## Files

- **Schema**: `docs/export-manifest-schema.json`
- **Types**: `src/shared/types/exportManifest.ts`
- **Service**: `src/core/storage/exportService.ts`
- **CLI**: `src/cli/commands/export.ts`
- **UI**: `src/renderer/components/ExportView.tsx`
