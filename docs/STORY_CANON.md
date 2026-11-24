# Story canon bundle format (Story Assistant)

Indie Forge is the shared home for **approved** story canon. Notion holds drafts. Story, engineer, and asset assistants read the same studio data.

This document is the apply/export contract. No game titles belong in app code. Per-game words (for example calling reveal tokens "memory fragments") live in **data**: `game.settings.revealTokenLabel`.

## Rules that never change

- Progress is **flags earned through play**.
- Rewards come from **interactions** (dialogue choice, encounter win, hotspot trigger). Never passive pickups.
- No currency, XP, loot, energy, or price fields.

## Entity: Character story profile

Optional object on `Character.storyProfile`:

| Field | Type | Notes |
| --- | --- | --- |
| summary | string | |
| bio | string | |
| motivation | string | |
| want | string | Surface personal goal |
| need | string | Hidden personal goal |
| arc | string | |
| voiceNotes | string | Speech / register |
| relationships | `{ characterId, relation }[]` | `characterId` may be uuid or `@key` |
| faction | string | Allegiance |
| canonStatus | `draft` \| `approved` | Missing means draft |

Create/update via the character UI, `forge character create|update --story-profile`, or `content apply` `characters[]` (this is how characters are created through apply).

## Entity: StoryCircle

Dan Harmon 8-step circle.

| Field | Type | Notes |
| --- | --- | --- |
| key | slug | Unique per game |
| name | string | |
| scope | `game` \| `world` \| `stage` | |
| refId | id / `@key` | Required for world and stage |
| surfaceGoal | string | Two-layer goal (what they think they want) |
| hiddenGoal | string | Two-layer goal (what they need) |
| steps | 8 objects | Indexes 1..8, labels You, Need, Go, Search, Find, Take, Return, Change |
| steps[].beat | string | |
| steps[].sceneId, dialogueId, encounterId, flagId | refs | Optional links |
| steps[].advancesCircleId, advancesStep | | Stage circles may point at the game/world step they advance |
| canonStatus | `draft` \| `approved` | Missing means draft |

**Step 6 rule:** every **stage-scoped** circle's Step 6 (Take) must link an `encounterId` in that stage. Draft = Flow + CLI **warning**. Approved = **error** (apply/CLI/UI refuse). So drafts can land before the encounter exists.

## Entity: RevealToken

Generic name for the formula's "reveal token". Display label is `game.settings.revealTokenLabel` (default `"Reveal token"`). A game may set that to `"Memory fragment"` in **data**.

| Field | Type | Notes |
| --- | --- | --- |
| key | slug | Required. Auto flag key is `revealed_<key>` |
| title, text | string | |
| mediaAssetId, mediaKind | image \| clip | Optional |
| unlockedBy | Condition | Optional |
| order | int | |
| chapter | string | Grouping |
| flagId | uuid | Written by Forge |
| canonStatus | `draft` \| `approved` | |

Effect `{ "grantRevealToken": { "tokenId": "@fragment_gate" } }` is valid on triggers, dialogue nodes/choices, and encounter `onWin`. Granting sets the auto bool flag so existing flag conditions can test it. `forge flow simulate` and `forge dialogue play` report `grantedRevealTokens`.

## Studio template

Built-in key `adventure-lens` (Adventure Lens RPG story formula). Data, not a hardcoded title.

```bash
forge story-template list --json
forge story-template show adventure-lens --json
forge game create --name "New Game" --engine unity --template adventure-lens --json
```

The template copies circle prompts, flag naming conventions, character profile fields, `revealTokenLabel`, a `story_beat` module, World 1 / Intro / The Gate stages, encounters (including the Step 6 slot), and empty circles. Regions/hotspots in the template data apply only when a background asset is present.

## Canon status

`draft` (default) or `approved` on profiles, circles, tokens, NPCs, and dialogues. Visible in the Story and Character UIs. Filter:

```bash
forge story-circle list --game <id> --canon approved --json
forge reveal-token list --game <id> --canon draft --json
forge npc list --game <id> --canon approved --json
forge dialogue list --game <id> --canon approved --json
forge content export --game <id> --out /tmp/out --canon approved --json
```

## `content apply` / export

`contentSchemaVersion` stays **1**. Studio schema stays **v2**. New arrays `characters`, `storyCircles`, `revealTokens` are optional on disk and filled in memory when missing. Existing v2 studios do not need `forge migrate`.

Apply is all-or-nothing, matches by `key`, supports `@key` aliases, dry-run, and idempotent re-apply (0 changes).

Minimal bundle:

```json
{
  "characters": [{ "key": "mentor", "name": "Mentor", "role": "npc", "storyProfile": { "summary": "…" } }],
  "revealTokens": [{ "key": "fragment_gate", "title": "The sealed gate", "text": "…", "order": 1 }],
  "storyCircles": [{ "key": "circle-intro", "name": "Intro circle", "scope": "stage", "refId": "@intro", "steps": [] }],
  "dialogues": [{ "key": "dlg-mentor-board", "name": "Talk", "startNodeId": "a", "nodes": [] }],
  "npcs": [{ "key": "mentor", "displayName": "Mentor", "characterId": "@mentor", "role": "mentor", "placements": [] }]
}
```

Example: `docs/samples/world1-story-canon.json`.
