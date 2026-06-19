// Kickoff times are stored as absolute UTC instants (Firestore Timestamps).
// The pool is Bolivian, so all match times are displayed pinned to Bolivia
// time (America/La_Paz, UTC-4, no DST) — independent of the device or of the
// server timezone during SSR. This guarantees every participant sees the same
// time and avoids the server(UTC)/client hydration mismatch a bare
// toLocaleString() would produce.
export const DISPLAY_TIME_ZONE = "America/La_Paz";

// A value that may carry a timestamp in any of the shapes this codebase deals
// with: a JS Date, a Firestore Timestamp (`{ toMillis }`), epoch millis, an ISO
// string, or nothing.
export type TimestampLike = Date | number | string | { toMillis: () => number } | null | undefined;

// Normalizes any of those shapes to epoch milliseconds. This is the single home
// for the `instanceof Date ? getTime() : toMillis()` dance that used to be
// copy-pasted across the pages. Returns 0 for a nullish/unparseable value so
// callers can fall back with `toMs(x) || Date.now()` when they need "now".
export function toMs(value: TimestampLike): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return new Date(value).getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

// Date + time, e.g. "11/6/2026, 16:00". Bolivia time.
export function formatKickoffDateTime(value: TimestampLike): string {
  return new Date(toMs(value)).toLocaleString("es", {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  });
}

// Time only, e.g. "16:00". Bolivia time.
export function formatKickoffTime(value: TimestampLike): string {
  return new Date(toMs(value)).toLocaleTimeString("es", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Short weekday + day + month, e.g. "jue, 11 jun". Bolivia time.
export function formatKickoffDate(value: TimestampLike): string {
  return new Date(toMs(value)).toLocaleDateString("es", {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
