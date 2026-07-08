import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Champion picks can be created or changed through the end of July 4, 2026.
// The cutoff is end-of-day July 4 across the Americas (2026-07-05 06:00 UTC =
// 23:59 July 4 in UTC-6). Kept in sync with championDeadline() in
// firestore.rules. The DB rule is authoritative; this guard is for UX only.
export const CHAMPION_DEADLINE = new Date("2026-07-05T06:00:00Z");

// `deadline` lets a caller pass a group's `championDeadline` override (see
// groupSchema in @/lib/schemas); it defaults to the global cutoff above.
export function isChampionLocked(now: Date = new Date(), deadline: Date = CHAMPION_DEADLINE): boolean {
  return now.getTime() >= deadline.getTime();
}

// Global cap on members per group. Configurable only by admins (stored at
// /config/app.maxMembersPerGroup); this is the fallback when the doc is absent.
// Kept in sync with maxMembersPerGroup() in firestore.rules, which is the
// authoritative enforcement point.
export const DEFAULT_MAX_MEMBERS_PER_GROUP = 100;

// Read the live global member cap, falling back to the default if the config
// doc has not been created yet or the read fails.
export async function getMaxMembersPerGroup(): Promise<number> {
  try {
    const snap = await getDoc(doc(db, "config", "app"));
    const value = snap.exists() ? (snap.data().maxMembersPerGroup as number | undefined) : undefined;
    return typeof value === "number" && value > 0 ? value : DEFAULT_MAX_MEMBERS_PER_GROUP;
  } catch {
    return DEFAULT_MAX_MEMBERS_PER_GROUP;
  }
}
