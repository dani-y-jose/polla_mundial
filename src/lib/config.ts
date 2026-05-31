import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Opening match of the World Cup 2026 (2026-06-11 20:00 UTC).
// Champion picks lock at this moment — kept in sync with championDeadline() in
// firestore.rules. The DB rule is authoritative; this guard is for UX only.
export const CHAMPION_DEADLINE = new Date("2026-06-11T20:00:00Z");

export function isChampionLocked(now: Date = new Date()): boolean {
  return now.getTime() >= CHAMPION_DEADLINE.getTime();
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
