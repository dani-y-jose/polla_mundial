// Kickoff times are stored as absolute UTC instants (Firestore Timestamps).
// The pool is Bolivian, so all match times are displayed pinned to Bolivia
// time (America/La_Paz, UTC-4, no DST) — independent of the device or of the
// server timezone during SSR. This guarantees every participant sees the same
// time and avoids the server(UTC)/client hydration mismatch a bare
// toLocaleString() would produce.
export const DISPLAY_TIME_ZONE = "America/La_Paz";

// Accepts a Date, a Firestore Timestamp, or epoch millis and returns its
// millisecond value. Tolerates both shapes per the codebase's Timestamp/Date
// convention.
function toMillis(value: Date | number | { toMillis: () => number }): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return value.toMillis();
}

// Date + time, e.g. "11/6/2026, 16:00". Bolivia time.
export function formatKickoffDateTime(value: Date | number | { toMillis: () => number }): string {
  return new Date(toMillis(value)).toLocaleString("es", {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  });
}

// Time only, e.g. "16:00". Bolivia time.
export function formatKickoffTime(value: Date | number | { toMillis: () => number }): string {
  return new Date(toMillis(value)).toLocaleTimeString("es", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Short weekday + day + month, e.g. "jue, 11 jun". Bolivia time.
export function formatKickoffDate(value: Date | number | { toMillis: () => number }): string {
  return new Date(toMillis(value)).toLocaleDateString("es", {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
