// Opening match of the World Cup 2026 (2026-06-11 20:00 UTC).
// Champion picks lock at this moment — kept in sync with championDeadline() in
// firestore.rules. The DB rule is authoritative; this guard is for UX only.
export const CHAMPION_DEADLINE = new Date("2026-06-11T20:00:00Z");

export function isChampionLocked(now: Date = new Date()): boolean {
  return now.getTime() >= CHAMPION_DEADLINE.getTime();
}
