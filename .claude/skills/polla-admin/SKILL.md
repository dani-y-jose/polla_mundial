---
name: polla-admin
description: Query or manage the polla's Firestore DB from the terminal via the firebase-admin CLI (npm run admin). Use whenever a task involves reading or changing Firestore data for this World Cup prediction app — ad-hoc queries, debugging a group leaderboard, scoring/creating/seeding matches, managing users/admins, minting/revoking invites, listing groups, DB stats, or exporting collections. Triggers on requests like "query the DB", "why is this leaderboard wrong", "score match X", "make this user an admin", "seed the matches", "how many predictions are there".
---

# polla-admin

Drive the project's admin CLI ([scripts/admin/](../../../scripts/admin/)) to read and
write the polla's Firestore (`polla-mundial-dj-2026`). The CLI uses the
**firebase-admin SDK and bypasses `firestore.rules`** — it has full read/write.

## Prerequisites
- A service-account key at `scripts/admin/.service-account.json` (gitignored). If a
  command prints "Missing service-account key", tell the user to add it (Firebase
  console → Project settings → Service accounts → Generate new private key). Do not
  try to create or fake the key.
- Run all commands from the **repo root**: `npm run admin -- <command> [flags]`.

## Authoritative command list
`npm run admin -- help` prints the always-current command reference. Run it first if
unsure of exact syntax. Cheat-sheet below.

### Read (safe)
```
stats [--json]                         # counts, match-status breakdown, next kickoff
query <coll> [--where "f op v"]... [--order f[:desc]] [--limit N] [--json]
get <coll> <docId> [--json]
count <coll> [--where ...]
leaderboard <groupId> [--json]         # ranked via the app's real scoring engine
groups:list [--json]                   # discover group ids + rules
matches:list [--status upcoming|locked|finished] [--json]
predictions:for-match <matchId> [--json]   predictions:for-user <uid> [--json]
invites:list [--json]                  users:recompute [uid] [--json]   db:export [coll] [--out dir]
```
`--where` is `"field op value"` (repeatable). Ops: `== != > >= < <= array-contains in
not-in array-contains-any`; for `in`/`not-in`/`array-contains-any` pass a JSON array,
e.g. `--where 'status in ["locked","finished"]'`. `query` defaults to `--limit 50`.

### Write (mutates PROD — see Safety)
```
set <coll> <docId> '<json>' [--merge] [--yes]      delete <coll> <docId> [--yes]
matches:create <home> <away> <kickoffISO> [--phase ...] [--city] [--stadium] [--referee] [--id] [--yes]
matches:seed [--yes]                               # 72 WC2026 group matches, missing only (idempotent)
matches:score <matchId> <home> <away> [--resolution normal|extra_time|penalties] [--notify] [--yes]
users:make-admin <email|uid> [--yes]               users:revoke-admin <email|uid> [--yes]
invites:mint --max N [--expires <ISO>]             invites:revoke <code> [--yes]
```

## Safety — READ THIS BEFORE ANY WRITE
- **Reads are always safe.** Run them freely.
- **Writes hit production.** For `set`, `delete`, `matches:create`, `matches:seed`,
  `matches:score`, `users:make-admin`/`revoke-admin`, `invites:mint`/`revoke`:
  state exactly what you're about to change and **get the user's explicit go-ahead
  first**. Do **not** pass `--yes` unless the user has approved that specific action
  (without `--yes` the CLI prompts interactively, which a non-interactive run will
  not satisfy — so confirm in chat, then run with `--yes`).
- **`--notify` fans a notification out to EVERY user.** Only add it when the user
  explicitly asks to notify players.
- **Never** print, paste, commit, or read out the service-account key.
- Prefer the smallest blast radius: query/inspect first, mutate one doc, verify.

## Parsing
Use `--json` for any read you need to reason over programmatically — it emits clean
JSON (Timestamps as ISO strings). Tables are for human display only.

## Common workflows
- **Debug a leaderboard:** `groups:list --json` to find the id → `leaderboard <id> --json`.
  The engine is the app's own `calculateGroupScores`, so the output equals the in-app
  table. To dig in: `matches:list --status finished --json` and
  `predictions:for-match <matchId> --json`.
- **Score a finished match:** confirm intent → `matches:score <matchId> <h> <a>
  [--resolution ...] --yes`. This writes the score, sets `pointsEarned` on every
  prediction (3/1/0), and recomputes affected users' totals. Add `--notify` only if asked.
- **Find a user:** `query users --where "email == someone@example.com" --json`, then
  e.g. `users:make-admin someone@example.com --yes` (after approval).
- **DB overview:** `stats` (add `--json` to parse).
- **Backup before risky bulk work:** `db:export` → `./firestore-export/`.
