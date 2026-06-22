import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { matchSchema } from "@/lib/schemas";
import type { Match } from "@/types";
import { parseDocs } from "@/lib/parse";

// One-shot read of the global match list. Prefers the cached /api/matches
// endpoint — one shared, edge-cached read for every user instead of each running
// the same Firestore query on every login. Falls back to a direct Firestore read
// when the endpoint is unavailable (e.g. the public-read rule for `matches` isn't
// deployed yet), so the app never breaks. Each match is validated individually;
// malformed ones are dropped rather than poisoning the whole list.
async function fetchMatches(): Promise<Match[]> {
  try {
    const res = await fetch("/api/matches");
    if (res.ok) {
      const body = (await res.json()) as { matches?: unknown };
      const raw = Array.isArray(body.matches) ? body.matches : [];
      const out: Match[] = [];
      for (const m of raw) {
        const parsed = matchSchema.safeParse(m);
        if (parsed.success) out.push(parsed.data);
      }
      if (out.length > 0) return out;
    }
  } catch {
    // fall through to the direct read
  }
  const snap = await getDocs(collection(db, "matches"));
  return parseDocs(matchSchema, snap);
}

// In-memory memo of the in-flight (or last successful) read. `matches` is global,
// user-independent fixture data, so the login page can warm this before the user
// even authenticates; the dashboard is reached by a client-side navigation that
// keeps this module alive, so it reuses the result instead of issuing a second
// read after sign-in. The TTL matches the /api/matches revalidate window, and the
// dashboard attaches a live onSnapshot right after load — so any brief staleness
// self-corrects within a moment.
let cache: { at: number; promise: Promise<Match[]> } | null = null;
const TTL_MS = 60_000;

export function getMatches(): Promise<Match[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.promise;

  const promise = fetchMatches();
  cache = { at: Date.now(), promise };
  // Never hold onto a failed or empty read: drop the entry so the next caller
  // retries from scratch instead of being stuck with an empty list for the TTL.
  promise
    .then((list) => {
      if (list.length === 0 && cache?.promise === promise) cache = null;
    })
    .catch(() => {
      if (cache?.promise === promise) cache = null;
    });

  return promise;
}
