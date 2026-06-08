// Cloud Functions for Polla Mundial — the web-push senders.
//
// These run with admin privileges (they bypass firestore.rules), which is why
// the *sending* of notifications lives here and not in the client: only a
// trusted server may read every user's FCM tokens and fan out a push.
//
// Two entry points:
//   onMatchScored        — Firestore trigger: a match flips to "finished".
//   sendKickoffReminders — scheduled sweep: matches kicking off within the hour.
// Both funnel through fanOut(), which writes the in-app notification doc AND
// sends the push (and prunes dead tokens).

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { logger } from "firebase-functions";

initializeApp();
const db = getFirestore();

// Cap concurrency so a runaway never balloons cost on this small app.
setGlobalOptions({ maxInstances: 10 });

// A match counts as "starting soon" within this many minutes of kickoff. Keep in
// sync with SOON_WINDOW_MIN in src/app/dashboard/page.tsx (the in-app version).
const SOON_WINDOW_MIN = 60;

type NotifPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  type: "score_update" | "reminder";
};

// ---- Trigger A: score finalized ----
// Fires on every write to a match doc, but only acts on the transition INTO
// "finished" so re-saves and the reminderSent flag flip don't re-notify.
export const onMatchScored = onDocumentUpdated("matches/{matchId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.status === "finished" || after.status !== "finished") return;

  const matchId = event.params.matchId;
  const home = after.homeTeam ?? "Local";
  const away = after.awayTeam ?? "Visitante";

  const predictors = await predictorIdsFor(matchId);
  if (predictors.size === 0) {
    logger.info(`Match ${matchId} finished but had no predictions; nothing to send.`);
    return;
  }

  await fanOut(Array.from(predictors), {
    title: "Marcador Actualizado ⚽",
    body: `${home} vs ${away} finalizó ${after.homeScore} - ${after.awayScore}. ¡Revisa tus puntos!`,
    url: "/dashboard",
    tag: `score_${matchId}`,
    type: "score_update",
  });
  logger.info(`Score notification sent for ${matchId} to ${predictors.size} users.`);
});

// ---- Trigger B: "match starting soon" reminders ----
// Every 15 minutes, find upcoming matches within the next hour that haven't been
// reminded yet, and push only to group members who have NOT predicted them.
export const sendKickoffReminders = onSchedule("every 15 minutes", async () => {
  const now = Timestamp.now();
  const windowEnd = Timestamp.fromMillis(now.toMillis() + SOON_WINDOW_MIN * 60_000);

  // status == upcoming AND kickoffTime <= windowEnd. Needs the composite index
  // declared in firestore.indexes.json (status ASC, kickoffTime ASC).
  const matchesSnap = await db
    .collection("matches")
    .where("status", "==", "upcoming")
    .where("kickoffTime", "<=", windowEnd)
    .get();

  const due = matchesSnap.docs.filter((d) => {
    const kickoff = d.get("kickoffTime") as Timestamp | undefined;
    return !!kickoff && kickoff.toMillis() > now.toMillis() && d.get("reminderSent") !== true;
  });
  if (due.length === 0) return;

  // Universe of recipients: everyone who belongs to at least one group. Read once.
  const groupMembers = await groupMemberIds();

  for (const matchDoc of due) {
    const m = matchDoc.data();
    const matchId = matchDoc.id;
    const home = m.homeTeam ?? "Local";
    const away = m.awayTeam ?? "Visitante";

    const predictors = await predictorIdsFor(matchId);
    const audience = [...groupMembers].filter((uid) => !predictors.has(uid));

    // Mark reminded BEFORE fanning out, so a slow send can't double-fire on the
    // next 15-minute tick. (Worst case we drop a reminder, never duplicate one.)
    await matchDoc.ref.update({ reminderSent: true });

    if (audience.length === 0) {
      logger.info(`Match ${matchId} starting soon, but everyone already predicted.`);
      continue;
    }

    await fanOut(audience, {
      title: "¡Comienza pronto! ⏰",
      body: `${home} vs ${away} comienza pronto y aún no has pronosticado.`,
      url: "/dashboard",
      tag: `soon_${matchId}`,
      type: "reminder",
    });
    logger.info(`Kickoff reminder sent for ${matchId} to ${audience.length} users.`);
  }
});

// ---- Shared helpers ----

// Distinct userIds with a prediction for this match (across all their groups).
async function predictorIdsFor(matchId: string): Promise<Set<string>> {
  const snap = await db.collection("predictions").where("matchId", "==", matchId).get();
  const ids = new Set<string>();
  snap.forEach((d) => {
    const uid = d.get("userId") as string | undefined;
    if (uid) ids.add(uid);
  });
  return ids;
}

// Union of every group's members.
async function groupMemberIds(): Promise<Set<string>> {
  const snap = await db.collection("groups").get();
  const ids = new Set<string>();
  snap.forEach((d) => {
    const members = (d.get("members") as string[] | undefined) ?? [];
    members.forEach((uid) => ids.add(uid));
  });
  return ids;
}

// Writes one in-app notification doc per user (so the bell drawer shows it,
// whether or not the app is open) and sends a data-only push to every device
// token those users registered. Dead tokens are pruned.
async function fanOut(userIds: string[], p: NotifPayload): Promise<void> {
  const now = Timestamp.now();

  // 1. In-app notification docs, chunked under Firestore's 500-write batch limit.
  for (let i = 0; i < userIds.length; i += 450) {
    const batch = db.batch();
    for (const uid of userIds.slice(i, i + 450)) {
      const ref = db.collection("users").doc(uid).collection("notifications").doc();
      batch.set(ref, {
        id: ref.id,
        userId: uid,
        title: p.title,
        message: p.body,
        timestamp: now,
        read: false,
        type: p.type,
      });
    }
    await batch.commit();
  }

  // 2. Collect every recipient's tokens (token -> owning uid, for pruning).
  const tokenOwners = new Map<string, string>();
  const userDocs = await Promise.all(
    userIds.map((uid) => db.collection("users").doc(uid).get())
  );
  for (const u of userDocs) {
    const tokens = (u.get("fcmTokens") as string[] | undefined) ?? [];
    tokens.forEach((t) => tokenOwners.set(t, u.id));
  }
  const tokens = [...tokenOwners.keys()];
  if (tokens.length === 0) return;

  // 3. Send (≤500 tokens per multicast). DATA-ONLY so the service worker renders
  //    exactly one notification — see public/sw.js.
  const messaging = getMessaging();
  const dead: { token: string; uid: string }[] = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: chunk,
      data: { title: p.title, body: p.body, url: p.url, tag: p.tag },
    });
    res.responses.forEach((r, idx) => {
      if (r.success) return;
      const code = r.error?.code ?? "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token") ||
        code.includes("invalid-argument")
      ) {
        const token = chunk[idx];
        dead.push({ token, uid: tokenOwners.get(token)! });
      }
    });
  }

  // 4. Prune tokens FCM rejected, grouped per user.
  if (dead.length > 0) {
    const byUser = new Map<string, string[]>();
    for (const { token, uid } of dead) {
      byUser.set(uid, [...(byUser.get(uid) ?? []), token]);
    }
    await Promise.all(
      [...byUser.entries()].map(([uid, toks]) =>
        db.collection("users").doc(uid).update({ fcmTokens: FieldValue.arrayRemove(...toks) })
      )
    );
    logger.info(`Pruned ${dead.length} dead tokens.`);
  }
}
