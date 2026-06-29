// Admin CLI for the polla Firestore DB (firebase-admin — bypasses rules).
//
//   npm run admin -- <command> [args] [flags]
//   npm run admin -- help
//
// See firebase.ts for credential resolution. Reuses the app's scoring engine
// (src/lib/scoring.ts) so `leaderboard` matches the in-app table exactly.
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Query, QueryDocumentSnapshot, WriteBatch } from "firebase-admin/firestore";
import { calculateGroupScores, calculatePoints } from "../../src/lib/scoring";
import { toMs } from "../../src/lib/dates";
import type { Group, GroupRules, Match, MatchPhase, ResolutionMethod } from "../../src/types";
import { auth, db, FieldValue } from "./firebase";
import { confirm, mapMatch, mapPrediction, parseWhere, printJson, printTable } from "./lib";
import { WC2026_GROUP_MATCHES } from "./wc2026";

const DEFAULT_RULES: GroupRules = {
  exactScorePoints: 3,
  correctOutcomePoints: 1,
  uniquePredictionPoints: 0,
  quarterFinalsBonus: 0,
  semiFinalsBonus: 0,
  finalsBonus: 0,
};

const RESOLUTIONS = ["normal", "extra_time", "penalties"] as const;
const PHASES: MatchPhase[] = ["group", "round_of_32", "round_of_16", "quarter_finals", "semi_finals", "finals"];
const KNOWN_COLLECTIONS = ["users", "matches", "predictions", "champions", "groups", "invites", "inviteCodes"];

const USAGE = `polla admin CLI — query & manage Firestore (bypasses security rules)

Usage: npm run admin -- <command> [args] [flags]

Generic data:
  query <collection> [--where "f op v"]... [--order f[:desc]] [--limit N] [--json]
  get <collection> <docId> [--json]
  set <collection> <docId> '<json>' [--merge] [--yes]
  delete <collection> <docId> [--yes]
  count <collection> [--where "f op v"]...
  stats [--json]                              doc counts, match status breakdown, next kickoff

Domain:
  leaderboard <groupId> [--json]              ranked table via the app's scoring engine
  groups:list [--json]                        id, name, member count, rules summary
  matches:list [--status upcoming|locked|finished] [--json]
  matches:create <home> <away> <kickoffISO> [--phase group|round_of_32|round_of_16|
                 quarter_finals|semi_finals|finals] [--city] [--stadium] [--referee] [--id] [--yes]
  matches:seed [--yes]                        insert the 72 WC2026 group matches (missing only)
  matches:delete <matchId> [--yes]            delete a match AND every prediction tied to it
  matches:score <matchId> <home> <away> [--resolution normal|extra_time|penalties]
                                        [--notify] [--yes]
  predictions:for-match <matchId> [--json]
  predictions:for-user <uid> [--json]
  users:make-admin <email|uid> [--yes]
  users:revoke-admin <email|uid> [--yes]
  users:delete <email|uid> [--keep-auth] [--keep-data] [--yes]
                                        full account wipe: user doc, predictions,
                                        notifications subcol, group memberships,
                                        invite consumedBy, AND the Firebase Auth login.
                                        --keep-auth: Firestore cascade only (no login).
                                        --keep-data: delete only the Auth login.
  invites:list [--json]
  invites:mint --max N [--expires <ISO>]
  invites:revoke <code> [--yes]
  db:export [collection] [--out <dir>]

--where examples:  --where "status == finished"   --where "matchId == m_42"
                   --where "status in [\\"locked\\",\\"finished\\"]"
Operators: == != > >= < <= array-contains in not-in array-contains-any
Note: query defaults to --limit 50.`;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    where: { type: "string", multiple: true },
    order: { type: "string" },
    limit: { type: "string" },
    json: { type: "boolean" },
    merge: { type: "boolean" },
    yes: { type: "boolean", short: "y" },
    notify: { type: "boolean" },
    "keep-auth": { type: "boolean" },
    "keep-data": { type: "boolean" },
    status: { type: "string" },
    resolution: { type: "string" },
    max: { type: "string" },
    expires: { type: "string" },
    out: { type: "string" },
    phase: { type: "string" },
    city: { type: "string" },
    stadium: { type: "string" },
    referee: { type: "string" },
    id: { type: "string" },
  },
});

const [command, ...args] = positionals;

function req(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required argument: <${name}>`);
  return value;
}

function applyWhere(q: Query): Query {
  for (const [f, op, v] of parseWhere(values.where ?? [])) q = q.where(f, op, v);
  return q;
}

// email-or-uid -> users doc ref
async function resolveUserRef(idOrEmail: string) {
  if (idOrEmail.includes("@")) {
    const snap = await db.collection("users").where("email", "==", idOrEmail).limit(1).get();
    if (snap.empty) throw new Error(`No user with email ${idOrEmail}`);
    return snap.docs[0].ref;
  }
  const ref = db.collection("users").doc(idOrEmail);
  if (!(await ref.get()).exists) throw new Error(`No user with uid ${idOrEmail}`);
  return ref;
}

// Resolve a user from email-or-uid across BOTH Firestore and Auth, tolerating
// either being absent — so users:delete can clean up a partially-deleted account
// (e.g. doc already gone but the Auth login lingers, or vice-versa).
async function resolveUserIdentity(idOrEmail: string): Promise<{
  uid: string | null;
  email: string | null;
  isAdmin: boolean;
  docExists: boolean;
  authExists: boolean;
}> {
  const isEmail = idOrEmail.includes("@");
  let uid: string | null = isEmail ? null : idOrEmail;
  let email: string | null = isEmail ? idOrEmail : null;
  let isAdmin = false;
  let docExists = false;

  // Firestore side.
  if (isEmail) {
    const snap = await db.collection("users").where("email", "==", idOrEmail).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0];
      uid = d.id;
      docExists = true;
      const data = d.data() as { email?: string; isAdmin?: boolean };
      email = data.email ?? email;
      isAdmin = !!data.isAdmin;
    }
  } else {
    const doc = await db.collection("users").doc(idOrEmail).get();
    docExists = doc.exists;
    if (doc.exists) {
      const data = doc.data() as { email?: string; isAdmin?: boolean };
      email = data.email ?? null;
      isAdmin = !!data.isAdmin;
    }
  }

  // Auth side — look up by uid if we have one, else by email.
  let authExists = false;
  try {
    const rec = uid ? await auth.getUser(uid) : await auth.getUserByEmail(idOrEmail);
    uid ??= rec.uid;
    email ??= rec.email ?? null;
    authExists = true;
  } catch (e: unknown) {
    if ((e as { code?: string })?.code !== "auth/user-not-found") throw e; // surface real errors
  }

  return { uid, email, isAdmin, docExists, authExists };
}

// Commit write closures in chunks under Firestore's 500-op batch limit.
async function commitBatched(writes: Array<(b: WriteBatch) => void>): Promise<void> {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) w(batch);
    await batch.commit();
  }
}

function randomCode(len: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Accent-stripping slug for generated match ids (e.g. "México" -> "mexico").
function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function main() {
  switch (command) {
    // ---- Generic --------------------------------------------------------
    case "query": {
      const coll = req(args[0], "collection");
      let q = applyWhere(db.collection(coll));
      if (values.order) {
        const [f, dir] = values.order.split(":");
        q = q.orderBy(f, dir === "desc" ? "desc" : "asc");
      }
      q = q.limit(values.limit ? Number(values.limit) : 50);
      const snap = await q.get();
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (values.json) printJson(rows);
      else printTable(rows);
      break;
    }

    case "get": {
      const coll = req(args[0], "collection");
      const id = req(args[1], "docId");
      const doc = await db.collection(coll).doc(id).get();
      if (!doc.exists) throw new Error(`${coll}/${id} not found`);
      printJson({ id: doc.id, ...doc.data() });
      break;
    }

    case "set": {
      const coll = req(args[0], "collection");
      const id = req(args[1], "docId");
      const data = JSON.parse(req(args[2], "json"));
      const verb = values.merge ? "merge into" : "overwrite";
      if (!(await confirm(`${verb} ${coll}/${id}?`, values.yes))) return;
      await db.collection(coll).doc(id).set(data, { merge: !!values.merge });
      console.log(`✓ ${verb} ${coll}/${id}`);
      break;
    }

    case "delete": {
      const coll = req(args[0], "collection");
      const id = req(args[1], "docId");
      if (!(await confirm(`Delete ${coll}/${id}?`, values.yes))) return;
      await db.collection(coll).doc(id).delete();
      console.log(`✓ deleted ${coll}/${id}`);
      break;
    }

    case "count": {
      const coll = req(args[0], "collection");
      const snap = await applyWhere(db.collection(coll)).count().get();
      console.log(snap.data().count);
      break;
    }

    case "stats": {
      const matches = (await db.collection("matches").get()).docs.map(mapMatch);
      const counts: Record<string, number> = { matches: matches.length };
      for (const c of KNOWN_COLLECTIONS) {
        if (c === "matches") continue;
        counts[c] = (await db.collection(c).count().get()).data().count;
      }
      const byStatus: Record<string, number> = { upcoming: 0, locked: 0, finished: 0 };
      for (const m of matches) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
      const next = matches
        .filter((m) => m.status !== "finished" && m.kickoffTime)
        .sort((a, b) => toMs(a.kickoffTime) - toMs(b.kickoffTime))[0];
      const nextKickoff = next
        ? { id: next.id, match: `${next.homeTeam} v ${next.awayTeam}`, kickoff: next.kickoffTime }
        : null;

      if (values.json) {
        printJson({ collections: counts, matchesByStatus: byStatus, nextKickoff });
      } else {
        printTable(KNOWN_COLLECTIONS.map((c) => ({ collection: c, docs: counts[c] })));
        console.log(
          `\nmatches: ${byStatus.upcoming} upcoming, ${byStatus.locked} locked, ${byStatus.finished} finished`,
        );
        if (next) {
          console.log(`next kickoff: ${nextKickoff!.match} @ ${new Date(toMs(next.kickoffTime)).toISOString()} (${next.id})`);
        }
      }
      break;
    }

    // ---- Domain ---------------------------------------------------------
    case "leaderboard": {
      const groupId = req(args[0], "groupId");
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (!groupDoc.exists) throw new Error(`group ${groupId} not found`);
      const group = groupDoc.data() as Partial<Group>;
      const members: string[] = group.members ?? [];
      const rules: GroupRules = group.rules ?? DEFAULT_RULES;

      const [matchesSnap, predsSnap] = await Promise.all([
        db.collection("matches").get(),
        db.collection("predictions").where("groupId", "==", groupId).get(),
      ]);
      const matches = matchesSnap.docs.map(mapMatch);
      const predictions = predsSnap.docs.map(mapPrediction);

      const scores = calculateGroupScores(groupId, members, matches, predictions, rules);

      const userDocs = members.length
        ? await db.getAll(...members.map((m) => db.collection("users").doc(m)))
        : [];
      const names = new Map(userDocs.map((d) => [d.id, (d.data() as { displayName?: string } | undefined)?.displayName ?? "(unknown)"]));

      const rows = members
        .map((uid) => ({
          uid,
          name: names.get(uid),
          totalPoints: scores[uid]?.totalPoints ?? 0,
          exactGuesses: scores[uid]?.exactGuesses ?? 0,
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .map((r, i) => ({ rank: i + 1, ...r }));

      if (values.json) {
        printJson({ groupId, name: group.name ?? null, standings: rows });
      } else {
        console.log(`Group: ${group.name ?? groupId}  (rules: ${group.rules ? "custom" : "default"})`);
        printTable(rows, ["rank", "name", "totalPoints", "exactGuesses", "uid"]);
      }
      break;
    }

    case "groups:list": {
      const snap = await db.collection("groups").get();
      const rows = snap.docs
        .map((d) => {
          const g = d.data() as Partial<Group>;
          const r = g.rules;
          const rulesSummary = r
            ? `${r.exactScorePoints}/${r.correctOutcomePoints}` +
              (r.uniquePredictionPoints ? ` +uniq${r.uniquePredictionPoints}` : "") +
              (r.quarterFinalsBonus || r.semiFinalsBonus || r.finalsBonus
                ? ` +bonus(${r.quarterFinalsBonus}/${r.semiFinalsBonus}/${r.finalsBonus})`
                : "")
            : "default";
          return {
            id: d.id,
            name: g.name ?? "",
            members: Array.isArray(g.members) ? g.members.length : 0,
            entryFee: g.entryFee ?? 0,
            rules: rulesSummary,
            creatorId: g.creatorId ?? "",
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      if (values.json) printJson(rows);
      else printTable(rows);
      break;
    }

    case "matches:list": {
      let q: Query = db.collection("matches");
      if (values.status) q = q.where("status", "==", values.status);
      const snap = await q.get();
      const rows = snap.docs
        .map(mapMatch)
        .sort((a, b) => toMs(a.kickoffTime) - toMs(b.kickoffTime))
        .map((m) => ({
          id: m.id,
          phase: m.phase,
          match: `${m.homeTeam} v ${m.awayTeam}`,
          kickoff: m.kickoffTime,
          status: m.status,
          score: m.homeScore == null ? "" : `${m.homeScore}-${m.awayScore}`,
        }));
      if (values.json) printJson(rows);
      else printTable(rows);
      break;
    }

    case "matches:create": {
      const homeTeam = req(args[0], "home");
      const awayTeam = req(args[1], "away");
      const iso = req(args[2], "kickoffISO");
      const kickoff = new Date(iso);
      if (Number.isNaN(kickoff.getTime())) throw new Error("kickoffISO must be a valid ISO date");
      const phase = (values.phase ?? "group") as MatchPhase;
      if (!PHASES.includes(phase)) throw new Error(`--phase must be one of: ${PHASES.join(", ")}`);
      const id = values.id ?? slugify(`${homeTeam}_${awayTeam}_${iso}`);
      const status: Match["status"] = kickoff <= new Date() ? "locked" : "upcoming";
      const payload: Match = {
        id,
        homeTeam,
        awayTeam,
        kickoffTime: kickoff,
        status,
        homeScore: null,
        awayScore: null,
        phase,
        city: values.city ?? "",
        stadiumName: values.stadium ?? "",
        refereeName: values.referee ?? "Por Definir",
        refereeCountry: "",
        resolutionMethod: null,
        qualifier: null,
      };
      console.log(`${homeTeam} v ${awayTeam}  ${iso}  [${phase}, ${status}]  id=${id}`);
      if (!(await confirm("Create this match?", values.yes))) return;
      await db.collection("matches").doc(id).set(payload);
      console.log(`✓ created match ${id}`);
      break;
    }

    case "matches:delete": {
      const matchId = req(args[0], "matchId");
      const matchRef = db.collection("matches").doc(matchId);
      const matchDoc = await matchRef.get();
      const preds = await db.collection("predictions").where("matchId", "==", matchId).get();

      const m = matchDoc.data() as Partial<Match>;
      const label = matchDoc.exists ? `${m.homeTeam} v ${m.awayTeam}` : "(match doc missing)";
      console.log(
        `${matchId}  ${label}\n` +
          `  match doc:   ${matchDoc.exists ? "delete" : "already gone"}\n` +
          `  predictions: ${preds.size} — delete (their pointsEarned go with them)`,
      );
      if (preds.empty && !matchDoc.exists) {
        console.log("Nothing to delete.");
        break;
      }
      if (!(await confirm("Delete this match and all its predictions?", values.yes))) return;

      // Cascade predictions, then the match doc. User point totals aren't stored —
      // leaderboards recompute live from predictions + matches — so no recompute is needed.
      let batch = db.batch();
      let n = 0;
      for (const p of preds.docs) {
        batch.delete(p.ref);
        if (++n % 400 === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }
      if (matchDoc.exists) batch.delete(matchRef);
      await batch.commit();
      console.log(`✓ deleted match ${matchId} and ${preds.size} prediction(s)`);
      break;
    }

    case "matches:seed": {
      const existing = new Set((await db.collection("matches").get()).docs.map((d) => d.id));
      const toInsert = WC2026_GROUP_MATCHES.filter((m) => !existing.has(m.id));
      console.log(
        `WC2026 group stage: ${WC2026_GROUP_MATCHES.length} matches, ` +
          `${toInsert.length} missing, ${WC2026_GROUP_MATCHES.length - toInsert.length} already present.`,
      );
      if (toInsert.length === 0) {
        console.log("Nothing to seed.");
        break;
      }
      if (!(await confirm(`Insert ${toInsert.length} matches?`, values.yes))) return;

      const now = new Date();
      const batch = db.batch();
      for (const m of toInsert) {
        const kickoff = new Date(m.kickoffISO);
        const payload: Match = {
          id: m.id,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          kickoffTime: kickoff,
          status: kickoff <= now ? "locked" : "upcoming",
          homeScore: null,
          awayScore: null,
          phase: "group",
          city: m.city,
          stadiumName: m.stadiumName,
          refereeName: "Por Definir",
          refereeCountry: "",
          resolutionMethod: null,
          qualifier: null,
        };
        batch.set(db.collection("matches").doc(m.id), payload);
      }
      await batch.commit();
      console.log(`✓ seeded ${toInsert.length} matches`);
      break;
    }

    case "matches:score": {
      const matchId = req(args[0], "matchId");
      const home = Number(req(args[1], "home"));
      const away = Number(req(args[2], "away"));
      if (Number.isNaN(home) || Number.isNaN(away)) throw new Error("home/away must be numbers");
      const resolution = (values.resolution ?? "normal") as ResolutionMethod;
      if (resolution && !RESOLUTIONS.includes(resolution)) {
        throw new Error(`--resolution must be one of: ${RESOLUTIONS.join(", ")}`);
      }

      const matchRef = db.collection("matches").doc(matchId);
      const matchDoc = await matchRef.get();
      if (!matchDoc.exists) throw new Error(`match ${matchId} not found`);
      const match = matchDoc.data() as Partial<Match>;

      const predsSnap = await db.collection("predictions").where("matchId", "==", matchId).get();
      const affectedUsers = new Set(predsSnap.docs.map((d) => d.data().userId as string));

      console.log(
        `${match.homeTeam} ${home} - ${away} ${match.awayTeam}  (${resolution})\n` +
          `  predictions to score:   ${predsSnap.size}\n` +
          `  users with predictions: ${affectedUsers.size}\n` +
          `  notifications:          ${values.notify ? "fan out to ALL users" : "none (use --notify)"}`,
      );
      if (!(await confirm("Finalize this score?", values.yes))) return;

      // 1. Match + per-prediction points in one batch.
      const batch = db.batch();
      batch.update(matchRef, {
        homeScore: home,
        awayScore: away,
        status: "finished",
        resolutionMethod: resolution,
      });
      for (const d of predsSnap.docs) {
        const p = d.data();
        batch.update(d.ref, {
          pointsEarned: calculatePoints(p.predictedHomeScore, p.predictedAwayScore, home, away),
        });
      }
      await batch.commit();

      // 2. Optional notification fan-out to every user (mirrors the admin page).
      if (values.notify) {
        const usersSnap = await db.collection("users").get();
        let nBatch = db.batch();
        let n = 0;
        for (const u of usersSnap.docs) {
          const ref = u.ref.collection("notifications").doc();
          nBatch.set(ref, {
            id: ref.id,
            userId: u.id,
            title: "Marcador Actualizado ⚽",
            message: `${match.homeTeam} ${home} - ${away} ${match.awayTeam}`,
            timestamp: FieldValue.serverTimestamp(),
            read: false,
            type: "score_update",
          });
          if (++n % 400 === 0) {
            await nBatch.commit();
            nBatch = db.batch();
          }
        }
        await nBatch.commit();
        console.log(`  ✓ ${usersSnap.size} notifications sent`);
      }

      console.log(`✓ scored ${matchId}: ${predsSnap.size} predictions, ${affectedUsers.size} users`);
      break;
    }

    case "predictions:for-match":
    case "predictions:for-user": {
      const field = command.endsWith("match") ? "matchId" : "userId";
      const value = req(args[0], field);
      const snap = await db.collection("predictions").where(field, "==", value).get();
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (values.json) printJson(rows);
      else printTable(rows);
      break;
    }

    case "users:make-admin":
    case "users:revoke-admin": {
      const grant = command === "users:make-admin";
      const ref = await resolveUserRef(req(args[0], "email|uid"));
      const who = (await ref.get()).data() as { email?: string } | undefined;
      if (!(await confirm(`${grant ? "Grant" : "Revoke"} admin for ${who?.email ?? ref.id}?`, values.yes))) return;
      await ref.update({ isAdmin: grant });
      console.log(`✓ isAdmin=${grant} for ${who?.email ?? ref.id}`);
      break;
    }

    case "users:delete": {
      const input = req(args[0], "email|uid");
      const keepAuth = !!values["keep-auth"];
      const keepData = !!values["keep-data"];
      if (keepAuth && keepData) throw new Error("--keep-auth with --keep-data deletes nothing");

      const { uid, email, isAdmin, docExists, authExists } = await resolveUserIdentity(input);
      if (!uid) throw new Error(`No user found in Firestore or Auth for "${input}"`);
      const who = email ?? uid;

      // Gather everything keyed off this uid (skipped when --keep-data).
      let preds: QueryDocumentSnapshot[] = [];
      let champs: QueryDocumentSnapshot[] = [];
      let notifs: QueryDocumentSnapshot[] = [];
      let memberGroups: QueryDocumentSnapshot[] = [];
      let consumedInvites: QueryDocumentSnapshot[] = [];
      if (!keepData) {
        const [p, c, n, g, inv] = await Promise.all([
          db.collection("predictions").where("userId", "==", uid).get(),
          db.collection("champions").where("userId", "==", uid).get(),
          db.collection("users").doc(uid).collection("notifications").get(),
          db.collection("groups").where("members", "array-contains", uid).get(),
          db.collection("invites").where("consumedBy", "array-contains", uid).get(),
        ]);
        preds = p.docs;
        champs = c.docs;
        notifs = n.docs;
        memberGroups = g.docs;
        consumedInvites = inv.docs;
      }
      const createdGroups = memberGroups.filter((d) => (d.data() as { creatorId?: string }).creatorId === uid);

      console.log(
        `Delete user ${who}  (uid=${uid}${isAdmin ? ", ADMIN" : ""})\n` +
          `  firestore doc:     ${docExists ? "present" : "absent"}${keepData ? " — kept" : ""}\n` +
          `  auth account:      ${authExists ? "present" : "absent"}${keepAuth ? " — kept" : ""}` +
          (keepData
            ? ""
            : `\n  predictions:       ${preds.length} — delete\n` +
              `  champion picks:    ${champs.length} — delete\n` +
              `  notifications:     ${notifs.length} — delete (subcollection)\n` +
              `  group memberships: ${memberGroups.length} — remove from members\n` +
              `  invite consumedBy: ${consumedInvites.length} — remove + decrement uses`),
      );
      if (isAdmin) console.log(`  ⚠ ${who} is an ADMIN.`);
      for (const d of createdGroups) {
        console.log(`  ⚠ creator of group ${d.id} — creatorId left dangling; reassign or delete the group separately.`);
      }
      if (!(await confirm("Permanently delete this account?", values.yes))) return;

      if (!keepData) {
        const writes: Array<(b: WriteBatch) => void> = [];
        for (const d of preds) writes.push((b) => b.delete(d.ref));
        for (const d of champs) writes.push((b) => b.delete(d.ref));
        for (const d of notifs) writes.push((b) => b.delete(d.ref));
        for (const d of memberGroups) {
          writes.push((b) => b.update(d.ref, { members: FieldValue.arrayRemove(uid) }));
        }
        for (const d of consumedInvites) {
          const uses = Math.max(0, ((d.data() as { uses?: number }).uses ?? 1) - 1);
          writes.push((b) => b.update(d.ref, { consumedBy: FieldValue.arrayRemove(uid), uses }));
        }
        if (docExists) writes.push((b) => b.delete(db.collection("users").doc(uid)));
        await commitBatched(writes);
        console.log(
          `  ✓ firestore: ${preds.length} preds, ${champs.length} champions, ${notifs.length} notifs, ` +
            `${memberGroups.length} groups, ${consumedInvites.length} invites` +
            `${docExists ? ", user doc" : ""}`,
        );
      }
      if (!keepAuth) {
        if (authExists) {
          await auth.deleteUser(uid);
          console.log(`  ✓ auth: deleted login`);
        } else {
          console.log(`  – auth: nothing to delete`);
        }
      }
      console.log(`✓ deleted user ${who}`);
      break;
    }

    case "invites:list": {
      const snap = await db.collection("invites").get();
      const rows = snap.docs.map((d) => ({ code: d.id, ...d.data() }));
      if (values.json) printJson(rows);
      else printTable(rows);
      break;
    }

    case "invites:mint": {
      const maxUses = Number(req(values.max, "max")); // --max is required
      if (Number.isNaN(maxUses) || maxUses < 1) throw new Error("--max must be a positive number");
      const expiresAt = values.expires ? new Date(values.expires) : null;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new Error("--expires must be an ISO date");

      let code = "";
      for (let i = 0; i < 5; i++) {
        code = randomCode(10);
        if (!(await db.collection("invites").doc(code).get()).exists) break;
        code = "";
      }
      if (!code) throw new Error("could not generate a unique invite code");

      await db.collection("invites").doc(code).set({
        code,
        type: "app",
        groupId: null,
        maxUses,
        uses: 0,
        consumedBy: [],
        expiresAt,
        active: true,
        createdBy: "cli",
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log(`✓ minted invite ${code}  (maxUses=${maxUses}, expires=${expiresAt?.toISOString() ?? "never"})`);
      break;
    }

    case "invites:revoke": {
      const code = req(args[0], "code");
      if (!(await db.collection("invites").doc(code).get()).exists) throw new Error(`invite ${code} not found`);
      if (!(await confirm(`Revoke (deactivate) invite ${code}?`, values.yes))) return;
      await db.collection("invites").doc(code).update({ active: false });
      console.log(`✓ revoked invite ${code}`);
      break;
    }

    case "db:export": {
      const dir = values.out ?? "firestore-export";
      mkdirSync(dir, { recursive: true });
      const collections = args[0] ? [args[0]] : KNOWN_COLLECTIONS;
      for (const coll of collections) {
        const snap = await db.collection(coll).get();
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const file = `${dir}/${coll}.json`;
        writeFileSync(file, JSON.stringify(docs, null, 2));
        console.log(`✓ ${coll}: ${docs.length} docs -> ${file}`);
      }
      break;
    }

    case "help":
    case undefined:
      console.log(USAGE);
      break;

    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(USAGE);
      process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nError: ${err?.message ?? err}`);
    process.exit(1);
  });
