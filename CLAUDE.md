# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## ⚠️ This is NOT the Next.js you know

This repo runs **Next.js 16** with **React 19**. APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (`01-app`, `02-pages`, `03-architecture`) before writing framework code, and heed deprecation notices.

## Commands

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build
npm run start    # Serve the production build
npm run lint     # ESLint (flat config, eslint-config-next)
```

**Tests:** `src/lib/scoring.test.ts` is a standalone script using `console.assert` (it exports `runTests()`), not wired to any test runner — there is no `npm test`. To run it, execute it directly (e.g. `npx tsx src/lib/scoring.test.ts`) or call `runTests()`. When changing scoring logic, update this file alongside it.

## Architecture

A World Cup prediction pool ("polla") app: users join private groups, predict match scores, and compete on per-group leaderboards. UI copy is in **Spanish**. The app is a points tracker only — no real money handling by design.

**Stack:** Next.js App Router (all pages are `"use client"`), Firebase Auth + Firestore (client SDK only — no server/admin SDK, no API routes), Tailwind CSS v4. Deployed via **Firebase App Hosting** (backend `polla-mundial`, see [firebase.json](firebase.json)).

### Data flow & key invariants

- **No backend layer.** All reads/writes go directly from client components to Firestore via the singleton in [src/lib/firebase.ts](src/lib/firebase.ts). Security is enforced entirely by [firestore.rules](firestore.rules) — when you change how a collection is written, update the rules too.
- **Collections:** `users`, `matches`, `predictions`, `groups` (+ a `notifications` collection written in batches). Types are the source of truth in [src/types/index.ts](src/types/index.ts).
- **Timestamps:** Firestore returns `Timestamp`; code converts to `Date` on the client. Date-handling code must tolerate both — see the `instanceof Date ? .getTime() : .toMillis()` pattern.
- **Match lifecycle:** `upcoming → locked → finished`. Both the dashboard and admin pages run a **5s `setInterval`** that auto-locks any `upcoming` match whose `kickoffTime` has passed (writes `status: "locked"`). This client-side polling is how predictions get locked at kickoff — there is no server cron.
- **Admin gating:** `users/{uid}.isAdmin` controls write access to `matches` (enforced in rules) and access to [src/app/admin/page.tsx](src/app/admin/page.tsx), which redirects non-admins.

### Scoring ([src/lib/scoring.ts](src/lib/scoring.ts))

The heart of the app. Two functions:
- `calculatePoints(...)` — fixed 3/1/0 rule (exact / correct-outcome / wrong), used by admin when finalizing a score.
- `calculateGroupScores(members, matches, predictions, rules)` — the real leaderboard engine. Honors **per-group `GroupRules`**: configurable exact/outcome points, a **unique-prediction bonus** (awarded only when exactly one group member nailed the exact score), and **phase bonuses** (cuartos/semis/final) granted when a user correctly predicted the outcome of *all* matches in a round. Recomputed client-side from raw predictions + matches — points are not authoritative in the DB.

### Pages ([src/app/](src/app/))

- `page.tsx` — marketing landing.
- `login/` — email/password + Google sign-in; creates the `users/{uid}` profile on sign-up.
- `dashboard/` — the main app (~1400 lines): tabbed home/predictions/table/profile, group switching, live leaderboard via `calculateGroupScores`, prediction entry, notifications via `onSnapshot`.
- `admin/` — create/score matches, batch-seed a mock schedule (`MOCK_WORLD_CUP_MATCHES`), trigger score-update notifications.
- `groups/` and `groups/[id]/` — create/join via invite code, manage per-group rules and prize distribution.

## Conventions

- Path alias `@/*` → `src/*`.
- Mutations that touch multiple docs use `writeBatch`; live data uses `onSnapshot`.
- Spanish UI strings and phase/resolution translation maps (`PHASE_TRANSLATIONS`, `RESOLUTION_TRANSLATIONS`) are duplicated across pages — keep them in sync if edited.
- `puppeteer-core` is a declared dependency but currently unused in `src/`.
