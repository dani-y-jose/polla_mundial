// One-off: push the corrected WC2026 group-stage kickoff times (now canonical
// in wc2026.ts) to the production `matches` docs. Updates kickoffTime only,
// as a Firestore Timestamp. Skips finished matches and missing docs. Idempotent.
import { db, Timestamp } from "./firebase";
import { WC2026_GROUP_MATCHES } from "./wc2026";

const DRY = process.argv.includes("--dry");

async function main() {
  let updated = 0, unchanged = 0, skipped = 0, missing = 0;
  for (const m of WC2026_GROUP_MATCHES) {
    const ref = db.doc(`matches/${m.id}`);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`MISSING  ${m.id}`); missing++; continue; }
    const data = snap.data()!;
    if (data.status === "finished") { console.log(`SKIP(fin) ${m.id}`); skipped++; continue; }

    const want = new Date(m.kickoffISO);
    const cur: Date | null =
      data.kickoffTime?.toDate?.() ?? (data.kickoffTime ? new Date(data.kickoffTime) : null);
    if (cur && cur.getTime() === want.getTime()) { unchanged++; continue; }

    console.log(`UPDATE   ${m.id}: ${cur?.toISOString() ?? "—"} -> ${want.toISOString()}`);
    if (!DRY) await ref.update({ kickoffTime: Timestamp.fromDate(want) });
    updated++;
  }
  console.log(`\n${DRY ? "[DRY] " : ""}updated=${updated} unchanged=${unchanged} skipped=${skipped} missing=${missing}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
