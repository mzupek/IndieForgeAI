# Forge CLI Documentation

Command-line interface for Indie Forge AI asset pipeline. Designed for use by AI agents (Game Engineer agents and Asset Creator agents).

## Installation

```bash
npm install
npm run build:cli
```

Or run directly:

```bash
npm run forge -- <command>
```

## Global Options

- `--data-dir <path>` - Override data directory (default: OS-specific user data dir)
- `--json` - Output in JSON format (recommended for AI agents)
- `--help` - Show help for any command

## Environment Variables

- `FORGE_DATA_DIR` - Override data directory (lower priority than `--data-dir`)

## Commands

### `forge games list`

List all games across all projects.

**Usage:**
```bash
forge games list [--json]
```

**JSON Output:**
```json
[
  {
    "id": "game-neon-recall",
    "name": "Neon Recall",
    "engine": "unity",
    "exportRoot": "./exports/neon-recall",
    "projectId": "proj-uuid",
    "projectName": "My Project",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

---

### `forge character list --game <id>`

List all characters in a game.

**Usage:**
```bash
forge character list --game game-neon-recall [--json]
```

**JSON Output:**
```json
[
  {
    "id": "char-uuid",
    "gameId": "game-neon-recall",
    "name": "Hero",
    "role": "protagonist",
    "styleNotes": "Bold colors, athletic build",
    "tags": ["player", "fighter"],
    "referenceImage": "/path/to/ref.png",
    "thumbnail": "/path/to/thumb.png",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

---

### `forge character show <character-id> --game <id>`

Show detailed information about a specific character.

**Usage:**
```bash
forge character show char-uuid --game game-neon-recall [--json]
```

**JSON Output:**
```json
{
  "id": "char-uuid",
  "gameId": "game-neon-recall",
  "name": "Hero",
  "role": "protagonist",
  "styleNotes": "Bold colors, athletic build",
  "tags": ["player", "fighter"],
  "referenceImage": "/path/to/ref.png",
  "thumbnail": "/path/to/thumb.png",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

---

### `forge character create`

Create a new character.

**Usage:**
```bash
forge character create \
  --game game-neon-recall \
  --name "Hero" \
  --role "protagonist" \
  [--style-notes "Bold colors, athletic build"] \
  [--tags "player,fighter"] \
  [--reference /path/to/ref.png] \
  [--json]
```

**JSON Output:**
```json
{
  "id": "char-uuid",
  "gameId": "game-neon-recall",
  "name": "Hero",
  "role": "protagonist",
  "styleNotes": "Bold colors, athletic build",
  "tags": ["player", "fighter"],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

---

### `forge character update <character-id>`

Update an existing character.

**Usage:**
```bash
forge character update char-uuid \
  --game game-neon-recall \
  [--name "New Name"] \
  [--role "new-role"] \
  [--style-notes "Updated notes"] \
  [--tags "tag1,tag2"] \
  [--reference /path/to/new-ref.png] \
  [--json]
```

**JSON Output:** Same as `show` command.

---

### `forge character delete <character-id> --game <id>`

Delete a character and all its poses.

**Usage:**
```bash
forge character delete char-uuid --game game-neon-recall [--json]
```

**JSON Output:**
```json
{
  "deleted": true,
  "characterId": "char-uuid"
}
```

---

### `forge pose import <character-id> <files...>`

Import pose(s) for a character. Files are auto-mapped by filename to pose slots.

**Important:** CLI-imported poses default to `status: "draft"`. Only the UI can approve poses.

**Pose Slots:** `ready`, `success`, `hurt`, `win`, `defeat`

**Filename Auto-Mapping:**
- `hero_ready.png` → `ready`
- `boss-hurt.png` → `hurt`
- `gate_drone_success_v2.png` → `success`
- `character_win.png` → `win`
- `npc-defeat.png` → `defeat`

**Usage:**
```bash
# Auto-map by filename
forge pose import char-uuid hero_ready.png hero_hurt.png hero_win.png [--json]

# Specify slot explicitly (single file only)
forge pose import char-uuid pose.png --slot ready [--json]
```

**JSON Output:**
```json
{
  "imported": [
    {
      "id": "pose-uuid",
      "characterId": "char-uuid",
      "slot": "ready",
      "file": "/path/to/pose.png",
      "status": "draft",
      "source": "import",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "errors": []
}
```

**Error Handling:**
Files that cannot be mapped or fail to import are listed in `errors` array. Exit code is non-zero if all imports fail.

---

### `forge pose list <character-id>`

List all poses for a character.

**Usage:**
```bash
forge pose list char-uuid [--json]
```

**JSON Output:**
```json
[
  {
    "id": "pose-uuid",
    "characterId": "char-uuid",
    "slot": "ready",
    "file": "/path/to/pose.png",
    "status": "draft",
    "source": "import",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

---

### `forge pose remove <pose-id>`

Remove a pose.

**Usage:**
```bash
forge pose remove pose-uuid [--json]
```

**JSON Output:**
```json
{
  "deleted": true,
  "poseId": "pose-uuid"
}
```

---

### `forge validate [<character-id>]`

Validate pose completeness. Exits with code 1 if any character is incomplete.

**Validation Rules:**
1. All 5 pose slots filled (`ready`, `success`, `hurt`, `win`, `defeat`)
2. Each pose must have `status: "approved"`
3. 1024×1024 pixel dimensions
4. Transparent background (alpha channel + transparent corners)
5. Optional: consistent facing direction

**Usage:**
```bash
# Validate specific character
forge validate char-uuid [--json]

# Validate all characters in a game
forge validate --game game-neon-recall [--json]

# Validate all characters across all projects
forge validate [--json]
```

**JSON Output:**
```json
[
  {
    "characterId": "char-uuid",
    "characterName": "Hero",
    "complete": false,
    "issues": [
      {
        "slot": "ready",
        "type": "status",
        "message": "ready pose is draft (must be approved)"
      },
      {
        "slot": "success",
        "type": "missing",
        "message": "success pose is missing"
      }
    ]
  }
]
```

**Exit Codes:**
- `0` - All validated characters are complete
- `1` - One or more characters are incomplete or validation error

---

### `forge status`

Show overall project status summary.

**Usage:**
```bash
forge status [--json]
```

**JSON Output:**
```json
{
  "projects": 1,
  "games": 2,
  "characters": 5,
  "poses": 20,
  "completeCharacters": 3,
  "details": [
    {
      "projectId": "proj-uuid",
      "projectName": "My Project",
      "games": 2,
      "characters": 5,
      "poses": 20
    }
  ]
}
```

---

## Approval Workflow

**Important:** The CLI cannot approve poses. This is intentional to ensure human review.

1. **AI Agent imports poses via CLI:**
   ```bash
   forge pose import char-uuid hero_ready.png hero_hurt.png
   ```
   → Poses are imported with `status: "draft"`

2. **Human reviews in UI:**
   - Open Indie Forge app
   - Navigate to Poses tab
   - Review each pose
   - Click "Approve" on individual poses or "Approve All"

3. **Validation passes only after approval:**
   ```bash
   forge validate char-uuid
   ```
   → Returns complete only when all poses are approved

---

## Example Workflow for AI Agents

```bash
# 1. Check status
forge status --json

# 2. List games
forge games list --json

# 3. Create character
forge character create \
  --game game-neon-recall \
  --name "Boss Character" \
  --role "enemy" \
  --tags "boss,hard" \
  --json

# 4. Import poses with auto-mapped filenames
forge pose import <char-id> \
  boss_ready.png \
  boss_success.png \
  boss_hurt.png \
  boss_win.png \
  boss_defeat.png \
  --json

# 5. Validate (will fail until human approves in UI)
forge validate <char-id> --json

# 6. List poses to check status
forge pose list <char-id> --json
```

---

## File Locking

The CLI uses file locking to prevent conflicts with the Electron app. If the app is open:
- The CLI waits for locks to be released
- The app automatically reloads project data on changes (via file watching)
- Atomic writes prevent corruption

---

## Error Handling

All errors are reported via:
- **JSON mode:** `{"error": true, "message": "..."}`
- **Human mode:** Plain text error messages
- **Exit codes:** Non-zero on error

---

## Data Directory

Default data directory locations:
- **Linux:** `~/.config/indie-forge-ai`
- **macOS:** `~/Library/Application Support/indie-forge-ai`
- **Windows:** `%APPDATA%/indie-forge-ai`

Override with `--data-dir` or `FORGE_DATA_DIR` environment variable.

---

## Clip Commands

### `forge clip import <files...>`

Import video clip(s) with automatic moment detection from filenames.

**Usage:**
```bash
# Auto-detect moment from filename
forge clip import hero_intro.mp4 boss_finisher.webm --game game-neon-recall [--json]

# Explicit moment
forge clip import clip.mp4 --game game-neon-recall --moment hit [--json]

# With character and tags
forge clip import clip.mp4 \
  --game game-neon-recall \
  --moment finisher \
  --character char-uuid \
  --tags "dramatic,slow-mo" \
  [--json]
```

**Options:**
- `--game <id>` (required) - Game ID
- `--moment <moment>` - Explicit moment (intro|hit|finisher|defeat|story_beat)
- `--character <id>` - Character ID
- `--tags <tags>` - Comma-separated tags

**Moment Auto-Mapping:**
Filenames are automatically mapped to moments:
- `hero_intro.mp4` → `intro`
- `boss-hit.webm` → `hit`
- `gate_drone_finisher.mp4` → `finisher`
- `character_defeat.mp4` → `defeat`
- `npc-story_beat.webm` → `story_beat`

Matching is case-insensitive and supports underscores, hyphens, or dots as separators.

**Duration Detection:**
- Automatically detects video duration using ffmpeg
- Warns if duration < 0.5s (too short)
- Warns if duration > 2.0s (too long)
- Recommended range: 0.5s - 2.0s

**JSON Output:**
```json
{
  "imported": [
    {
      "id": "clip-uuid",
      "characterId": "char-uuid",
      "moment": "intro",
      "file": "/path/to/clip.mp4",
      "durationSec": 1.5,
      "tags": ["dramatic"],
      "thumbnail": "/path/to/thumb.png",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "errors": [],
  "warnings": [
    "clip.mp4: Clip is 2.50s (recommended: 0.5s - 2s)"
  ]
}
```

---

### `forge clip list`

List clips with optional filtering.

**Usage:**
```bash
# List all clips
forge clip list [--json]

# Filter by game
forge clip list --game game-neon-recall [--json]

# Filter by character
forge clip list --character char-uuid [--json]

# Filter by moment
forge clip list --moment intro [--json]

# Combine filters
forge clip list --game game-neon-recall --moment finisher --character char-uuid [--json]
```

**Options:**
- `--game <id>` - Filter by game
- `--character <id>` - Filter by character
- `--moment <moment>` - Filter by moment

**JSON Output:**
```json
[
  {
    "id": "clip-uuid",
    "characterId": "char-uuid",
    "moment": "intro",
    "file": "/path/to/clip.mp4",
    "durationSec": 1.5,
    "tags": ["dramatic"],
    "thumbnail": "/path/to/thumb.png",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

---

### `forge clip show <clip-id>`

Show detailed information about a specific clip.

**Usage:**
```bash
forge clip show clip-uuid [--json]
```

**JSON Output:**
```json
{
  "id": "clip-uuid",
  "characterId": "char-uuid",
  "moment": "intro",
  "file": "/path/to/clip.mp4",
  "durationSec": 1.5,
  "tags": ["dramatic", "slow-mo"],
  "thumbnail": "/path/to/thumb.png",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

---

### `forge clip update <clip-id>`

Update clip metadata.

**Usage:**
```bash
# Change moment
forge clip update clip-uuid --moment finisher [--json]

# Change character
forge clip update clip-uuid --character char-uuid [--json]

# Update tags
forge clip update clip-uuid --tags "action,dramatic" [--json]

# Remove character association
forge clip update clip-uuid --character "" [--json]
```

**Options:**
- `--moment <moment>` - New moment
- `--character <id>` - New character ID (or empty string to unset)
- `--tags <tags>` - Comma-separated tags

**JSON Output:** Same as `show` command.

---

### `forge clip remove <clip-id>`

Remove a clip.

**Usage:**
```bash
forge clip remove clip-uuid [--json]
```

**JSON Output:**
```json
{
  "deleted": true,
  "clipId": "clip-uuid"
}
```

---

## Clip Workflow Example

```bash
# 1. Import clips with auto-detection
forge clip import \
  hero_intro.mp4 \
  hero_finisher.mp4 \
  boss_hit.webm \
  --game game-neon-recall \
  --json

# 2. List clips for a game
forge clip list --game game-neon-recall --json

# 3. Update clip metadata
forge clip update <clip-id> \
  --character <char-id> \
  --tags "cinematic,fast" \
  --json

# 4. Validate all clips are within duration range
forge clip list --json | jq '.[] | select(.durationSec < 0.5 or .durationSec > 2.0)'

# 5. Remove a clip
forge clip remove <clip-id> --json
```

---

## Audio Commands (A1 catalog)

Game-scoped imported audio library. Files are **copied into studio storage** (`audio/<id>/`). This is not storyboard mixer playback (A2) and does not call Suno/Runway.

Supported: `mp3`, `wav`, `ogg`, `m4a`. Kind is `music` or `sfx`. `--engine-notes` is an optional mapping note for existing engine clips — not a playable substitute.

### `forge audio import <files...>`

```bash
forge audio import hit.wav --game game-neon-recall --kind sfx --tags "battle,hit" [--json]

forge audio import loop.ogg --game game-neon-recall --kind music --name "Neon Circuitry" --engine-notes "existing Unity loop" [--json]
```

**Options:**
- `--game <id>` (required)
- `--kind <kind>` (required) - `music` | `sfx`
- `--name <name>` - display name (single file only; default: filename)
- `--tags <tags>` - comma-separated tags
- `--engine-notes <text>` - optional engine mapping note

### `forge audio list`

```bash
forge audio list --game game-neon-recall [--kind sfx] [--json]
```

### `forge audio show <audio-id>`

```bash
forge audio show <audio-id> --game game-neon-recall [--json]
```

### `forge audio update <audio-id>`

```bash
forge audio update <audio-id> --game game-neon-recall --name "Hit" --tags "battle" [--json]
forge audio update <audio-id> --game game-neon-recall --file ./new-hit.wav [--json]
```

`--file` replaces the studio-owned copy and re-probes duration. `--engine-notes ""` clears the note.

### `forge audio remove <audio-id>`

```bash
forge audio remove <audio-id> --game game-neon-recall [--json]
```

Rejected if later shot audio blocks or event `playSfx` bindings reference it (A2/A3). Unused catalog entries can be removed.

---

## Clip Moment Types

- **intro**: Character introduction or entrance
- **hit**: Character being hit or taking damage
- **finisher**: Special move or finishing attack
- **defeat**: Character defeated or knocked out
- **story_beat**: Narrative moment or cutscene

---

## Data Directory

Clips are stored in the studio data directory under `clips/`:
- Video files: `{clip-id}_clip.{ext}`
- Thumbnails: `{clip-id}_thumb.png`

Default locations:
- **Linux:** `~/.config/indie-forge-ai/clips`
- **macOS:** `~/Library/Application Support/indie-forge-ai/clips`
- **Windows:** `%APPDATA%/indie-forge-ai/clips`

---

## Preset Commands

### `forge preset list`

List scene and camera presets with optional filtering.

**Usage:**
```bash
# List all presets
forge preset list [--json]

# Filter by type
forge preset list --type shake [--json]

# Filter by tags
forge preset list --tags "dramatic,cinematic" [--json]
```

**Options:**
- `--type <type>` - Filter by preset type (versus|zoom_punch|shake|flash|freeze)
- `--tags <tags>` - Filter by tags (comma-separated, matches any)

**JSON Output:**
```json
[
  {
    "id": "preset-uuid",
    "type": "shake",
    "params": {
      "intensity": 20,
      "durationMs": 500,
      "frequency": 20
    },
    "tags": ["dramatic", "impact"],
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

---

### `forge preset show <preset-id>`

Show detailed information about a specific preset.

**Usage:**
```bash
forge preset show preset-uuid [--json]
```

**JSON Output:**
```json
{
  "id": "preset-uuid",
  "type": "zoom_punch",
  "params": {
    "target": "center",
    "zoomAmount": 1.5,
    "durationMs": 300,
    "ease": "easeOut"
  },
  "tags": ["impact", "fast"],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

---

### `forge preset create`

Create a new preset with default or custom parameters.

**Usage:**
```bash
# Create with default params
forge preset create --type shake [--json]

# Create with custom params
forge preset create \
  --type shake \
  --params '{"intensity": 25, "durationMs": 600, "frequency": 25}' \
  --tags "dramatic,impact" \
  [--json]

# Create a versus layout preset
forge preset create \
  --type versus \
  --params '{"cameraAngle": "low", "zoom": 1.2, "framingPadding": 40}' \
  --tags "battle,cinematic" \
  [--json]
```

**Options:**
- `--type <type>` (required) - Preset type (versus|zoom_punch|shake|flash|freeze)
- `--params <json>` - JSON params object (merged with type defaults)
- `--tags <tags>` - Comma-separated tags

**Default Parameters by Type:**

**versus:**
```json
{
  "cameraAngle": "front",
  "zoom": 1.0,
  "framingPadding": 50
}
```

**zoom_punch:**
```json
{
  "target": "center",
  "zoomAmount": 1.5,
  "durationMs": 300,
  "ease": "easeOut"
}
```

**shake:**
```json
{
  "intensity": 10,
  "durationMs": 500,
  "frequency": 20
}
```

**flash:**
```json
{
  "color": "#ffffff",
  "durationMs": 200,
  "opacity": 0.8
}
```

**freeze:**
```json
{
  "durationMs": 1000
}
```

**JSON Output:**
```json
{
  "id": "preset-uuid",
  "type": "shake",
  "params": {
    "intensity": 25,
    "durationMs": 600,
    "frequency": 25
  },
  "tags": ["dramatic", "impact"],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

---

### `forge preset update <preset-id>`

Update a preset's parameters or tags.

**Usage:**
```bash
# Update params (merged with existing)
forge preset update preset-uuid \
  --params '{"intensity": 30}' \
  [--json]

# Update tags
forge preset update preset-uuid \
  --tags "cinematic,slow-mo" \
  [--json]

# Update both
forge preset update preset-uuid \
  --params '{"durationMs": 800}' \
  --tags "extended,dramatic" \
  [--json]
```

**Options:**
- `--params <json>` - JSON params object (merged with existing params)
- `--tags <tags>` - Comma-separated tags (replaces existing tags)

**JSON Output:** Same as `show` command.

---

### `forge preset remove <preset-id>`

Remove a preset.

**Usage:**
```bash
forge preset remove preset-uuid [--json]
```

**JSON Output:**
```json
{
  "deleted": true,
  "presetId": "preset-uuid"
}
```

---

## Preset Types and Use Cases

### versus
Split-screen layout for character confrontation. Supports left/right character slots, camera angle, zoom, and framing padding. Common in battle sequences and dramatic face-offs.

**Params:**
- `leftCharacterId` (string, optional) - Left character ID
- `rightCharacterId` (string, optional) - Right character ID
- `cameraAngle` (string) - front|side|low|high
- `zoom` (number) - Camera zoom multiplier (0.5-2.0)
- `framingPadding` (number) - Edge padding in pixels

### zoom_punch
Quick zoom effect to emphasize impact or emotion. Commonly used for attacks, reactions, and dramatic reveals.

**Params:**
- `target` (string) - left|center|right - zoom target
- `zoomAmount` (number) - Zoom multiplier (1.0-3.0)
- `durationMs` (number) - Animation duration in milliseconds
- `ease` (string) - linear|easeIn|easeOut|easeInOut

### shake
Screen shake for impact effects. Intensity, duration, and frequency are configurable for different impact levels.

**Params:**
- `intensity` (number) - Shake intensity in pixels (1-50)
- `durationMs` (number) - Shake duration in milliseconds
- `frequency` (number) - Shake frequency in Hz (5-60)

### flash
Flash effect for transitions, impacts, or dramatic moments. Color and opacity are customizable.

**Params:**
- `color` (string) - Hex color (e.g., "#ffffff")
- `durationMs` (number) - Flash duration in milliseconds
- `opacity` (number) - Flash opacity (0.0-1.0)

### freeze
Freeze frame effect for dramatic pauses. Optional pose slot to hold a specific character pose.

**Params:**
- `durationMs` (number) - Freeze duration in milliseconds
- `holdPoseSlot` (string, optional) - ready|success|hurt|win|defeat

---

## Preset Workflow Example

```bash
# 1. Create presets for a dramatic battle scene
forge preset create \
  --type versus \
  --params '{"cameraAngle": "low", "zoom": 1.3}' \
  --tags "battle,dramatic" \
  --json

forge preset create \
  --type zoom_punch \
  --params '{"target": "left", "zoomAmount": 2.0, "durationMs": 250}' \
  --tags "battle,impact" \
  --json

forge preset create \
  --type shake \
  --params '{"intensity": 30, "durationMs": 400}' \
  --tags "battle,impact" \
  --json

# 2. List all battle presets
forge preset list --tags "battle" --json

# 3. Update a preset's intensity
forge preset update <preset-id> \
  --params '{"intensity": 40}' \
  --json

# 4. Remove unused presets
forge preset remove <preset-id> --json
```

---

## Studio Data Directory

Presets are stored in `studio.json` in the studio data directory:
- **Linux:** `~/.config/indie-forge-ai/studio.json`
- **macOS:** `~/Library/Application Support/indie-forge-ai/studio.json`
- **Windows:** `%APPDATA%/indie-forge-ai/studio.json`

Presets are studio-wide and can be reused across games and scenes.

---

# Storyboard Commands (Phase 4.5)

Storyboards are scenes with ordered shots, each containing layers (characters/poses/clips/images), camera animation, and effects timeline. Storyboards provide engineers with complete cinematography and timing for cutscenes and gameplay moments.

## Storyboard Management

### List Storyboards

```bash
forge storyboard list --game <gameId> [--json]
```

### Show Storyboard Details

```bash
forge storyboard show --id <storyboardId> [--json]
```

### Create Storyboard

```bash
forge storyboard create \
  --game <gameId> \
  --name "Gate Drone Battle" \
  --description "Opening cutscene battle sequence" \
  [--json]
```

### Remove Storyboard

```bash
forge storyboard remove --id <storyboardId> [--json]
```

---

## Shot Management

Shots are fixed-aspect-ratio stages with layers, camera animation, and effects.

### Add Shot

```bash
forge shot add \
  --storyboard <storyboardId> \
  --name "Drone appears" \
  --duration 3.5 \
  --aspect 16:9 \
  --notes "Drone flies in from upper right" \
  [--json]
```

### Update Shot

```bash
forge shot update \
  --id <shotId> \
  --name "Updated shot name" \
  --duration 4.0 \
  --notes "Engineer notes here" \
  [--background-asset <visualAssetId> [--background-state <stateId>]] \
  [--background-image <path>] \
  [--background-clip <clipId>] \
  [--clear-background-image] \
  [--clear-background] \
  [--json]
```

`--duration` is user-entered only. Forge does not restore a previous shot length from history. Shrink is refused (and lists blockers) if an audio block, clip block, timed key, camera keyframe, or effect marker would be cut.

Static shot background is a **Library visual asset** on the shot's Game (`--background-asset`, optional `--background-state` for an explicit state; omit state for default/static). Canvas uses the full-resolution `asset.image` or `state.file`, not the thumbnail. `--background-image` is the secondary direct import: the file is copied into studio `backgrounds/` and the shot stores that relative path, not the original external source. `--clear-background-image` clears the static/library image only (clip unchanged). `--clear-background` also clears the clip. Image and clip can coexist (clip draws over the still while a background clip block is active).

### Remove Shot

```bash
forge shot remove \
  --storyboard <storyboardId> \
  --id <shotId> \
  [--json]
```

### Timed clip blocks

Clip blocks are **range bars** on `shot.clipTrack` (not instantaneous keys, not C.3c FX keys). `durationSec` equals `sourceOutSec - sourceInSec` at 1x (no stretch). Sampling is half-open `[t, t+duration)`: **before and after the block the clip is not drawn** (not freeze last frame). Legacy `layer.clipId` / `backgroundClipId` without an explicit block for that target still play implicitly from `0` for `min(clip.duration, shot.duration)` — they never silently extend the shot. An explicit block for the same layer or background replaces that implicit playback. Overflow past shot duration requires `--extend-shot` (never silent). Overlap on the same target is rejected. Game-scoped clips: unassigned, or the clip’s character belongs to the shot’s Game.

This is **IndieForge authoring + export data**. Unity/Godot importers are unchanged; engine playback parity is not claimed.

```bash
forge shot clip add --shot <shotId> --clip <clipId> --time 0.5 [--role layer|background] [--layer <layerId>] [--source-in 0] [--source-out 1.2] [--extend-shot] [--json]
forge shot clip list --shot <shotId> [--json]
forge shot clip show --id <blockId> [--json]
forge shot clip update --id <blockId> [--time 1.0] [--source-in 0.2] [--source-out 1.0] [--extend-shot] [--json]
forge shot clip remove --id <blockId> [--json]
forge shot clip sample --shot <shotId> --time 0.8 [--json]
```

`sample` prints active blocks (including implicit) at the playhead. It is preview-only and never persisted. Reverse seek and loop wrap are the same function of time: loop to `t=0` hides a block that starts later.

Preview in Storyboard uses `forge-file://` video elements driven by `currentTime` from the playhead (paused; not `video.play()`), so scrubbing backwards is deterministic. Unsupported or missing media is shown as an error; it is not promised. Clip video stays muted; there is no clip soundtrack option.

### Timed audio blocks (A2)

Audio blocks are **range bars** on `shot.audioTrack`. Role is `music` or `sfx` and must match the library asset kind. Half-open `[t, t+duration)`: **silence outside the bar**. Non-loop 1x `durationSec` equals `sourceOutSec - sourceInSec`. `--loop` wraps the trim window so authored duration may be longer than trim (default **on** for music, off for sfx). Music overlap is rejected (one bed). SFX overlap is allowed.

Placing a long library file on a shorter shot **fits remaining shot time by default** (does not extend). Loop keeps the full source in/out and sets `durationSec` to remaining. Non-loop plays a prefix (`sourceOut` clamped). The library file is never rewritten. Overflow past shot duration still requires `--extend-shot` (never silent) when you pass an explicit overflowing `--duration`. `--fit-shot` clamps **this** block to the current shot end. It does **not** restore a previous shot length from history.

`forge shot update --duration` is user-entered only. Shrink is refused if audio, clips, timed keys, camera keyframes, or effect markers would be cut; the error lists blockers. Shorten those items first, then enter the new duration. Existing records that were accidentally extended have that same path (shorten the audio block, then enter the shot duration). Do not delete or reimport the library audio.

Storyboard playback uses `HTMLAudioElement.play()` / `pause()` synced to the master transport. **Paused `currentTime` seeks do not play sound.** Reverse scrub and pause position silently. Clip video remains muted. No cross-shot bus. Event SFX is A3 (not this command).

```bash
forge shot audio add --shot <shotId> --audio <audioId> --time 0.5 [--role music|sfx] [--source-in 0] [--source-out 1.2] [--duration 2] [--loop|--no-loop] [--volume 1] [--fade-in 0] [--fade-out 0] [--fit-shot] [--extend-shot] [--json]
forge shot audio list --shot <shotId> [--json]
forge shot audio show --id <blockId> [--json]
forge shot audio update --id <blockId> [--time 1.0] [--source-in 0.2] [--source-out 1.0] [--duration 2] [--loop true|false] [--volume 0.8] [--fade-in 0.1] [--fade-out 0.1] [--fit-shot] [--extend-shot] [--json]
forge shot audio remove --id <blockId> [--json]
forge shot audio sample --shot <shotId> --time 0.8 [--json]
forge shot update --id <shotId> --duration 3
```

`sample` prints active blocks, source time, and fade gain. It is preview-only and never persisted.

### Event SFX (A3)

`playSfx` is a **binding action** on a named event. It is **not** coupled to timed pose/state keys. Bind `playSfx` on the same event as `setPose` / `setState` / `setText` / `setVisibility` so one Fire button both changes the layer and plays a one-shot. `targetLayerId` is not required for `playSfx`.

Preview never writes authored layers, defaults, or `shot.audioTrack`. `forge event fire` reports preview SFX state with `persisted: false`. That output is **not** host speaker audio.

Playback: `durationSec` 0 plays the file once to completion unless Reset / Stop / shot change. Positive duration + `returnPolicy default` stops the voice at expiry. `hold` can play until completion / reset / stop. Event SFX never loops. Repeating the same binding cancels and restarts its voice; unrelated voices may overlap.

```bash
forge binding create --game <gameId> --shot <shotId> --event <eventId> --action playSfx --audio <audioId> [--volume 1] [--duration 0] [--return-policy default|hold] [--json]
forge binding create --game <gameId> --shot <shotId> --event <eventId> --layer <layerId> --action setPose --pose <poseId> --duration 0.5 [--json]
forge event fire --game <gameId> --shot <shotId> --event <eventId> [--now-ms 0] [--tick-ms 200] [--json]
```

### Event cues (timeline)

Authored `shot.eventCues[]` are **one-shot markers** on the Events track. They are **not** P4 pose/state keys (those are step/hold samples). Play fires the named event once per **forward-play crossing** of `t`. Pause, reverse scrub, and seek-into do not fire (no bursts). Shot-loop wrap re-arms the cue for the next pass. Firing uses the same preview engine as the Fire button (all shot bindings, including `playSfx`) and does **not** mutate authored JSON. A4 export can carry cues later; this command does not export.

Warns (does not fail) if the event has no bindings on this shot. Event delete is blocked while a cue still points at it. Shrinking the shot is refused if a cue would fall past the new end.

```bash
forge shot event-cue add --shot <shotId> --event <eventId> --time <seconds> [--json]
forge shot event-cue list --shot <shotId> [--json]
forge shot event-cue show --id <cueId> [--json]
forge shot event-cue update --id <cueId> [--time <seconds>] [--event <eventId>] [--json]
forge shot event-cue remove --id <cueId> [--json]
```

---

## Layer Management

Layers are composited elements: character poses, clips, or images with transforms.

### Add Layer

```bash
# Character with pose
forge layer add \
  --shot <shotId> \
  --z 10 \
  --character <characterId> \
  --pose <poseId> \
  --x 0.3 \
  --y 0.5 \
  --scale 1.2 \
  --rotation 0 \
  --opacity 1.0 \
  [--flip-x] \
  [--json]

# Clip layer
forge layer add \
  --shot <shotId> \
  --z 5 \
  --clip <clipId> \
  --x 0.5 \
  --y 0.5 \
  --scale 1.0 \
  [--json]

# Image layer
forge layer add \
  --shot <shotId> \
  --z 1 \
  --image ./path/to/background.png \
  --x 0.5 \
  --y 0.5 \
  --scale 1.0 \
  [--json]
```

**Layer Coordinates:**
- `x`, `y`: normalized stage coords [0-1] (0.5, 0.5 = center)
- `scale`: uniform scaling factor (1.0 = 200px max-side source-aspect fit)
- `rotation`: degrees (0-360)
- `z`: z-order (higher = closer to camera)
- `opacity`: 0.0 (transparent) to 1.0 (opaque)

Visual-asset layers draw at the **source image aspect** (contain in the 200px box). They are not stretched to a square. Existing layers keep authored `scale`/`x`/`y`; stretching was a draw bug. To reset size to the default source fit without moving the layer:

```bash
forge layer update --shot <shotId> --id <layerId> --fit-source [--json]
```

### Update Layer

```bash
forge layer update \
  --shot <shotId> \
  --id <layerId> \
  --pose <newPoseId> \
  --x 0.4 \
  --scale 1.5 \
  --rotation 15 \
  [--json]

# Reset uniform scale to 1 (200px max-side, source aspect). Does not rewrite x/y/state.
forge layer update --shot <shotId> --id <layerId> --fit-source [--json]
```

### Remove Layer

```bash
forge layer remove \
  --shot <shotId> \
  --id <layerId> \
  [--json]
```

### Timed pose/state keys (P4)

Keys live on the **same layer** (`timedKeys`). They do not create duplicate layers and are not C.3c FX keys. Sampling is step/hold: the last key with `t <= playhead` holds until the next key. Before the first key, the authored starting pose/state is used. Event preview (P3) still wins while a hold is active; when the hold ends, the **current** timeline sample is used.

```bash
forge layer key add --shot <shotId> --layer <layerId> --time 1.0 --pose <poseId> [--json]
forge layer key add --shot <shotId> --layer <layerId> --time 1.5 --state <stateId> [--json]
forge layer key list --shot <shotId> [--layer <layerId>] [--json]
forge layer key show --id <keyId> [--json]
forge layer key update --id <keyId> [--time 2.0] [--pose <poseId>|--state <stateId>] [--json]
forge layer key remove --id <keyId> [--json]
forge layer key sample --shot <shotId> --layer <layerId> --time 1.2 \
  [--event <eventId> --now-ms 0 --tick-ms 500] [--json]
```

Times must be `0..shot.durationSec`. Duplicate timestamps on the same layer (`|Δt| < 0.001s`) are rejected. Shrinking shot duration below an existing key is rejected. Pose/state must belong to that layer's character/asset.

---

## Camera Animation

Camera keyframes define focus targets, zoom, and framing over time.

### Add Camera Keyframe

```bash
# Target a specific layer
forge camera key \
  --shot <shotId> \
  --time 0.0 \
  --target-layer <layerId> \
  --zoom 1.0 \
  [--json]

# Target explicit coordinates
forge camera key \
  --shot <shotId> \
  --time 2.5 \
  --target-x 0.7 \
  --target-y 0.3 \
  --zoom 1.5 \
  --frame-x 0.6 \
  --frame-y 0.2 \
  --frame-w 0.4 \
  --frame-h 0.6 \
  [--json]
```

**Camera Params:**
- `time`: seconds within shot
- `target`: layer ID or (x,y) point
- `zoom`: 1.0 = normal, 2.0 = 2x zoom
- `framingRect` (optional): viewport window {x, y, width, height} in normalized coords

**JSON Output:**
```json
{
  "added": true,
  "keyframe": {
    "t": 2.5,
    "target": {"x": 0.7, "y": 0.3},
    "zoom": 1.5,
    "framingRect": {"x": 0.6, "y": 0.2, "width": 0.4, "height": 0.6}
  }
}
```

### Update Camera Keyframe

Update an existing camera keyframe's zoom or target without recreating it.

```bash
# Update zoom only
forge camera update \
  --shot <shotId> \
  --time 2.5 \
  --zoom 2.0 \
  [--json]

# Update target to layer
forge camera update \
  --shot <shotId> \
  --time 2.5 \
  --target-layer <layerId> \
  [--json]

# Update target to coordinates
forge camera update \
  --shot <shotId> \
  --time 2.5 \
  --target-x 0.8 \
  --target-y 0.4 \
  [--json]

# Update both zoom and target
forge camera update \
  --shot <shotId> \
  --time 2.5 \
  --zoom 1.8 \
  --target-x 0.5 \
  --target-y 0.6 \
  [--json]
```

**JSON Output:**
```json
{
  "updated": true,
  "keyframe": {
    "t": 2.5,
    "target": {"x": 0.5, "y": 0.6},
    "zoom": 1.8
  }
}
```

### Remove Camera Keyframe

```bash
forge camera remove \
  --shot <shotId> \
  --time 2.5 \
  [--json]
```

**JSON Output:**
```json
{
  "removed": true
}
```

---

## Effect Markers

Effect markers trigger presets or inline effects at specific times, optionally tied to clip moments.

### Add Effect

```bash
# Use preset
forge effect add \
  --shot <shotId> \
  --time 1.2 \
  --preset <presetId> \
  --moment hit \
  [--json]

# Inline effect
forge effect add \
  --shot <shotId> \
  --time 0.5 \
  --type shake \
  --params '{"intensity": 25, "durationMs": 300}' \
  [--json]
```

**Effect Types:** versus, zoom_punch, shake, flash, freeze (see Preset Commands for params)

### Remove Effect

```bash
forge effect remove \
  --shot <shotId> \
  --time 1.2 \
  [--json]
```

---

## Storyboard Workflow Example

```bash
# 1. Create storyboard
BOARD_ID=$(forge storyboard create \
  --game game-neon-recall \
  --name "Gate Drone Battle" \
  --description "Opening cutscene" \
  --json | jq -r '.id')

# 2. Add shots
SHOT1=$(forge shot add \
  --storyboard $BOARD_ID \
  --name "Drone appears" \
  --duration 3.0 \
  --notes "Drone enters from top right" \
  --json | jq -r '.id')

SHOT2=$(forge shot add \
  --storyboard $BOARD_ID \
  --name "Player reacts" \
  --duration 2.5 \
  --json | jq -r '.id')

# 3. Add layers to shot 1
# Background
forge layer add --shot $SHOT1 --z 1 \
  --image ./backgrounds/city-gate.png \
  --x 0.5 --y 0.5 --scale 1.0 --json

# Drone clip
DRONE_CLIP=$(forge clip list --game game-neon-recall --moment intro --json | jq -r '.[0].id')
forge layer add --shot $SHOT1 --z 10 \
  --clip $DRONE_CLIP \
  --x 0.7 --y 0.3 --scale 0.8 --json

# 4. Add camera animation
# Start wide at center
forge camera key --shot $SHOT1 \
  --time 0.0 --target-x 0.5 --target-y 0.5 --zoom 1.0 --json

# Zoom to drone at 2.0s
DRONE_LAYER=$(forge shot show --id $SHOT1 --json | jq -r '.shot.layers[] | select(.clipId != null) | .id' | head -1)
forge camera key --shot $SHOT1 \
  --time 2.0 --target-layer $DRONE_LAYER --zoom 1.8 --json

# Adjust zoom at 2.0s if needed
forge camera update --shot $SHOT1 \
  --time 2.0 --zoom 2.2 --json

# 5. Add effects
SHAKE_PRESET=$(forge preset list --type shake --json | jq -r '.[0].id')
forge effect add --shot $SHOT1 \
  --time 2.8 --preset $SHAKE_PRESET --moment hit --json

# 6. Add player to shot 2
PLAYER=$(forge character list --game game-neon-recall --json | jq -r '.[] | select(.role == "player") | .id')
HURT_POSE=$(forge pose list $PLAYER --json | jq -r '.[] | select(.slot == "hurt" and .status == "approved") | .id')

forge layer add --shot $SHOT2 --z 10 \
  --character $PLAYER --pose $HURT_POSE \
  --x 0.4 --y 0.6 --scale 1.2 --json

# 7. View storyboard
forge storyboard show --id $BOARD_ID --json
```

---

## Export with Storyboards

When you export a game with storyboards, the manifest includes:
- Shot sequences with resolved asset paths
- Layer transforms (x, y, scale, rotation, flipX, opacity)
- Camera keyframes with targets and framing
- Effect markers with timing and parameters
- Engineer notes per shot
- Shot thumbnails (PNG)
- Contact sheet (PNG) showing all shots

```bash
forge export game-neon-recall --json
```

The storyboard data appears in the manifest under `"storyboards"` (schema v2).

---

## Storyboard Data Model

**Storyboard:**
- ID, name, description
- Ordered list of shot IDs

**Shot:**
- ID, name, duration (seconds), aspect ratio (e.g., 16:9)
- Optional background image or clip
- Layers (z-ordered)
- Camera track (keyframes)
- Effects track (markers)
- Engineer notes

**Layer:**
- Character + pose, OR clip, OR image
- Transform: x, y, scale, rotation, flipX, opacity
- Z-order (higher = closer)

**Camera Keyframe:**
- Time (seconds)
- Target (layer ID or point)
- Zoom level
- Framing rect (optional)

**Effect Marker:**
- Time (seconds)
- Preset reference OR inline type + params
- Optional clip moment binding

Storyboards are stored in `studio.json` and exported to the game engine manifest (schema v2).
