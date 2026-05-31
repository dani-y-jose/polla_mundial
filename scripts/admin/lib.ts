// Shared helpers for the admin CLI: timestamp handling, doc mappers, output
// formatting, --where parsing, and an interactive confirm gate.
import { createInterface } from "node:readline/promises";
import type { DocumentSnapshot, WhereFilterOp } from "firebase-admin/firestore";
import type { Match, Prediction } from "../../src/types";

// ---- Timestamps -----------------------------------------------------------

// Firestore (admin) returns Timestamp; the app types use Date. Tolerate both,
// mirroring the app's `instanceof Date ? .getTime() : .toMillis()` pattern.
export function toDate(v: any): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.toMillis === "function") return new Date(v.toMillis());
  return new Date(v);
}

// ---- Doc mappers (Firestore doc -> app shape) -----------------------------

export function mapMatch(doc: DocumentSnapshot): Match {
  const d = doc.data() as any;
  return { ...d, id: doc.id, kickoffTime: toDate(d?.kickoffTime) as Date };
}

export function mapPrediction(doc: DocumentSnapshot): Prediction {
  const d = doc.data() as any;
  return { ...d, id: doc.id, timestamp: toDate(d?.timestamp) as Date };
}

// ---- Output ---------------------------------------------------------------

// Deep-convert Timestamps/Dates to ISO strings so JSON output is readable.
function serialize(v: any): any {
  if (v == null) return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(serialize);
  if (typeof v === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(v)) out[k] = serialize(v[k]);
    return out;
  }
  return v;
}

export function printJson(v: any): void {
  console.log(JSON.stringify(serialize(v), null, 2));
}

const MAX_CELL = 48;

function cell(v: any): string {
  let s: string;
  if (v == null) s = "";
  else if (v instanceof Date) s = v.toISOString();
  else if (typeof v?.toDate === "function") s = v.toDate().toISOString();
  else if (typeof v === "object") s = JSON.stringify(serialize(v));
  else s = String(v);
  return s.length > MAX_CELL ? s.slice(0, MAX_CELL - 1) + "…" : s;
}

// Print an array of flat-ish objects as an aligned table.
export function printTable(rows: any[], columns?: string[]): void {
  if (!rows.length) {
    console.log("(no rows)");
    return;
  }
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const fmt = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i])).join("  ");
  console.log(fmt(cols));
  console.log(fmt(widths.map((w) => "-".repeat(w))));
  for (const r of rows) console.log(fmt(cols.map((c) => cell(r[c]))));
  console.log(`\n${rows.length} row(s)`);
}

// ---- --where parsing ------------------------------------------------------

const OPS = new Set<string>([
  "==", "!=", ">", ">=", "<", "<=", "array-contains", "in", "not-in", "array-contains-any",
]);

// Coerce a bare token to number/bool/null/JSON, else leave as string.
function coerce(s: string): any {
  if (s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s !== "" && !Number.isNaN(Number(s))) return Number(s);
  if (s.startsWith('"') || s.startsWith("[") || s.startsWith("{")) {
    try {
      return JSON.parse(s);
    } catch {
      /* fall through to raw string */
    }
  }
  return s;
}

// Turn `--where "field op value"` strings into [field, op, value] tuples.
// in / not-in / array-contains-any expect a JSON array value, e.g.
//   --where "status in [\"locked\",\"finished\"]"
export function parseWhere(clauses: string[]): Array<[string, WhereFilterOp, any]> {
  return clauses.map((c) => {
    const parts = c.trim().split(/\s+/);
    const field = parts[0];
    const op = parts[1];
    const rest = parts.slice(2).join(" ");
    if (!field || !OPS.has(op)) {
      throw new Error(
        `Bad --where "${c}". Expected: "field op value" with op in ${[...OPS].join(", ")}`,
      );
    }
    const value =
      op === "in" || op === "not-in" || op === "array-contains-any"
        ? JSON.parse(rest)
        : coerce(rest);
    return [field, op as WhereFilterOp, value];
  });
}

// ---- Confirm gate ---------------------------------------------------------

export async function confirm(msg: string, skip = false): Promise<boolean> {
  if (skip) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = (await rl.question(`${msg} [y/N] `)).trim().toLowerCase();
  rl.close();
  return ans === "y" || ans === "yes";
}
