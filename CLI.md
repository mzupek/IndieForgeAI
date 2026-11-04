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
