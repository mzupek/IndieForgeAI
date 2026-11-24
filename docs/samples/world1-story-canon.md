# World 1 story canon bundle (example)

This is **data**, not app code. It is the Story Assistant's apply shape for approved canon that should live in Indie Forge (Notion stays drafts).

Keys match a typical World 1:

- `world-1`
- `intro`
- `the_gate`
- `region-intro-yard`
- `enc-hover-test`
- `enc-gate-drone`
- `dlg-mentor-board`

Progress is flags earned through play. Reveal tokens are granted by dialogue / encounter / trigger — never pickups, currency, or XP.

## Prepare

The world / stage / region / encounter records should already exist (template `adventure-lens`, or the World 1 Intro sample with those keys). Apply this file on top:

```bash
forge content apply --game <id> --file docs/samples/world1-story-canon.json --dry-run --json
forge content apply --game <id> --file docs/samples/world1-story-canon.json --json
# Re-apply reports 0 changes.

forge dialogue play @dlg-mentor-board --game <id> --choices 1 --json
# grantedRevealTokens includes fragment_gate; auto flag revealed_fragment_gate is true.

forge world flow @world-1 --game <id> --json
# Stage Intro circle Step 6 must link enc-hover-test (warning while draft, error if approved).
```

## What it models

1. Character `mentor` with an optional story profile (want vs need).
2. Game-scope campaign circle + stage-scope Intro circle. Step 6 (Take) on the stage circle points at `@enc-hover-test`.
3. Reveal token `fragment_gate` (display label is per-game `settings.revealTokenLabel`; Neon Recall can set that to "Memory fragment" in data).
4. Mentor dialogue grants the token on a choice — that is an interaction reward.

See `docs/STORY_CANON.md` for the bundle format.
