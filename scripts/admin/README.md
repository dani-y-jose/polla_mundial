# Admin CLI

A local CLI for querying and managing the polla Firestore DB, using the
**firebase-admin SDK**. It connects with a service-account key and **bypasses
`firestore.rules` entirely** — full read/write to project `polla-mundial-dj-2026`.

It reuses the app's scoring engine (`src/lib/scoring.ts`), so `leaderboard`
produces the same ranking the app shows.

## Setup (one time)

1. Get a service-account key from the Firebase console:
   **Project settings → Service accounts → Generate new private key**.
2. Save it as `scripts/admin/.service-account.json` (already gitignored), or
   point `GOOGLE_APPLICATION_CREDENTIALS` at it.
3. Deps (`firebase-admin`, `tsx`) are already in `devDependencies`; run
   `npm install` if needed.

> ⚠️ The key grants full project access. Never commit it or paste it anywhere.

## Usage

```bash
npm run admin -- help
npm run admin -- <command> [args] [flags]
```

### Querying

```bash
npm run admin -- stats                         # DB overview: counts, match status, next kickoff
npm run admin -- count matches
npm run admin -- matches:list --status finished
npm run admin -- query predictions --where "matchId == m_42" --limit 10 --json
npm run admin -- query users --where "isAdmin == true"
npm run admin -- get groups <groupId>
npm run admin -- groups:list                   # discover group ids + rules
npm run admin -- leaderboard <groupId>         # ranked table via the app's scoring
```

Every read command takes `--json` for machine-readable output.

`--where` is `"field op value"`; repeat it for multiple clauses. Operators:
`== != > >= < <= array-contains in not-in array-contains-any`. For `in`/`not-in`/
`array-contains-any` pass a JSON array, e.g. `--where 'status in ["locked","finished"]'`.
`query` defaults to `--limit 50`.

### Managing

```bash
npm run admin -- users:make-admin you@example.com
npm run admin -- users:recompute                     # rebuild all totals from predictions
npm run admin -- matches:seed                        # insert the 72 WC2026 group matches (missing only)
npm run admin -- matches:create "México" "Brasil" 2026-07-01T20:00:00Z --phase finals --city Miami
npm run admin -- matches:score m_42 2 1 --resolution normal   # add --notify to fan out alerts
npm run admin -- set <coll> <id> '{"field":"value"}' --merge
npm run admin -- delete <coll> <id>
npm run admin -- invites:mint --max 5 --expires 2026-06-01T00:00:00Z
npm run admin -- db:export                            # dump collections to ./firestore-export/
```

Mutating commands prompt for confirmation; pass `--yes`/`-y` to skip. The
notification fan-out in `matches:score` only runs with `--notify`.

## Emulator

Set `FIRESTORE_EMULATOR_HOST=localhost:8080` to target a local emulator instead
of production (no key required in that mode).
