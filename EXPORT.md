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

---

## Schema Version 2: Storyboards (Phase 4.5)

**Schema v2** adds storyboard support while maintaining backward compatibility with v1 fields.

### New in v2

#### Storyboards Array

The manifest now includes an optional `storyboards` array containing complete shot sequences with:

- **Shot metadata**: Name, duration, aspect ratio, engineer notes
- **Layers**: Characters with poses, clips, or images, each with:
  - Z-order, position (x, y), scale, rotation, flipX, opacity
  - Resolved asset paths (pose files, clip files)
- **Camera track**: Keyframes with target (layer ID or point), zoom, framing rect
- **Effects track**: Effect markers with timing, preset references or inline definitions, optional clip moment bindings
- **Clip track** (optional): timed clip blocks with start, duration, source in/out, role, and resolved `clipFile`. This is authoring/export **data** in IndieForge. Engine importers are not updated here; do not assume Unity/Godot playback parity.

**Example storyboard entry:**

```json
{
  "schemaVersion": 2,
  "storyboards": [
    {
      "id": "sb-gate-drone-battle",
      "name": "Gate Drone Battle",
      "description": "Opening cutscene",
      "shots": [
        {
          "id": "shot-1",
          "name": "Drone appears",
          "durationSec": 3.0,
          "aspectRatio": { "width": 16, "height": 9 },
          "layers": [
            {
              "id": "layer-bg",
              "zOrder": 1,
              "imagePath": "backgrounds/city-gate.png",
              "x": 0.5,
              "y": 0.5,
              "scale": 1.0,
              "rotation": 0,
              "flipX": false,
              "opacity": 1.0
            },
            {
              "id": "layer-drone",
              "zOrder": 10,
              "clipId": "clip-drone-intro",
              "clipFile": "clips/drone_intro.mp4",
              "x": 0.7,
              "y": 0.3,
              "scale": 0.8,
              "rotation": 0,
              "flipX": false,
              "opacity": 1.0
            }
          ],
          "cameraTrack": [
            {
              "t": 0.0,
              "target": { "x": 0.5, "y": 0.5 },
              "zoom": 1.0
            },
            {
              "t": 2.0,
              "target": "layer-drone",
              "zoom": 1.5,
              "framingRect": { "x": 0.6, "y": 0.2, "width": 0.4, "height": 0.6 }
            }
          ],
          "effectsTrack": [
            {
              "t": 2.8,
              "presetId": "preset-shake-01",
              "moment": "hit"
            }
          ],
          "clipTrack": [
            {
              "id": "cblock-1",
              "clipId": "clip-drone-intro",
              "clipFile": "clips/drone_intro.mp4",
              "role": "layer",
              "layerId": "layer-drone",
              "t": 0.5,
              "durationSec": 1.2,
              "sourceInSec": 0.0,
              "sourceOutSec": 1.2
            }
          ],
          "notes": "Drone enters from top right, camera follows and zooms. Shake effect on impact."
        }
      ]
    }
  ]
}
```

### Layer Types

Layers can contain:
1. **Character pose**: `characterId` + `poseId` + resolved `poseFile` path
2. **Clip**: `clipId` + resolved `clipFile` path
3. **Image**: `imagePath` (absolute or relative)

### Camera Animation

Camera keyframes define:
- **Target**: Layer ID (string) or explicit point `{x, y}`
- **Zoom**: Multiplier (1.0 = normal, 2.0 = 2x zoom)
- **Framing rect** (optional): Viewport window in normalized coords

Engine interpolates between keyframes for smooth camera motion.

### Effect Markers

Effects can:
- Reference a preset by `presetId`
- Define inline with `inlineType` + `inlineParams`
- Bind to clip moments (`intro`, `hit`, `finisher`, `defeat`, `story_beat`)

### Contact Sheets & Thumbnails

Storyboards may include:
- **Contact sheet**: PNG showing all shots in grid layout (for engineer review)
- **Shot thumbnails**: Individual PNG previews per shot

### Engine Integration (v2)

#### Unity
```csharp
[System.Serializable]
public class StoryboardManifest {
    public int schemaVersion;
    public StoryboardData[] storyboards;
}

[System.Serializable]
public class StoryboardData {
    public string id;
    public string name;
    public ShotData[] shots;
}

[System.Serializable]
public class ShotData {
    public string id;
    public string name;
    public float durationSec;
    public LayerData[] layers;
    public CameraKeyframe[] cameraTrack;
    public EffectMarker[] effectsTrack;
    public string notes;
}

// Load manifest
var json = Resources.Load<TextAsset>("IndieForge/game-id/manifest").text;
var manifest = JsonUtility.FromJson<StoryboardManifest>(json);

foreach (var storyboard in manifest.storyboards) {
    // Process shots, layers, camera, effects
}
```

#### Godot
```gdscript
# Load manifest
var file = FileAccess.open("res://assets/indie_forge/game-id/manifest.json", FileAccess.READ)
var manifest = JSON.parse_string(file.get_as_text())

for storyboard in manifest.storyboards:
    for shot in storyboard.shots:
        # Process layers
        for layer in shot.layers:
            if layer.has("poseFile"):
                var texture = load("res://assets/indie_forge/game-id/" + layer.poseFile)
            elif layer.has("clipFile"):
                var video = load("res://assets/indie_forge/game-id/" + layer.clipFile)
        
        # Process camera animation
        for keyframe in shot.cameraTrack:
            # Interpolate camera position/zoom
            pass
        
        # Process effects
        for effect in shot.effectsTrack:
            # Trigger effect at effect.t seconds
            pass
```

## v1 → v2 Migration

v2 is backward compatible:
- All v1 fields remain unchanged
- `storyboards` is optional (absent in v1 exports)
- Engines can check `schemaVersion` and handle accordingly

**Fallback:**
```javascript
if (manifest.schemaVersion === 1 || !manifest.storyboards) {
    // Use legacy v1 workflow
} else {
    // Use v2 storyboard workflow
}
```

## Storyboard Workflow

1. **Create storyboard** for a scene
2. **Add shots** with durations and aspect ratios
3. **Add layers** to shots (characters, poses, clips, images)
4. **Position & transform** layers (CLI or UI)
5. **Add camera keyframes** for focus and framing
6. **Add effect markers** tied to presets or inline
7. **Export** to generate manifest v2 with storyboards
8. **Engine imports** shots as timeline sequences

## Files (v2)

- **Schema v2**: `docs/export-manifest-schema-v2.json`
- **Types**: `src/shared/types/exportManifest.ts`
- **Service**: `src/core/storage/exportService.ts` (updated)
- **CLI**: `src/cli/commands/storyboard.ts`, `CLI.md`
- **UI**: `src/renderer/components/StoryboardEditor.tsx`
