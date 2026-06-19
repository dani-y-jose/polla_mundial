import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { matchSchema } from "@/lib/schemas";
import type { Match } from "@/types";
import { parseDocs } from "@/lib/parse";

// The global match list. Prefers the cached /api/matches endpoint — one shared,
// edge-cached read for every user instead of each running the same Firestore
// query on every login. Falls back to a direct Firestore read when the endpoint
// is unavailable (e.g. the public-read rule for `matches` isn't deployed yet),
// so the app never breaks. Each match is validated individually; malformed ones
// are dropped rather than poisoning the whole list.
export async function getMatches(): Promise<Match[]> {
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
