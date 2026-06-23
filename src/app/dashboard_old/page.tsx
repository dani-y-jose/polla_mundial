"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  getDoc, 
  query, 
  where, 
  updateDoc, 
  arrayUnion,
  onSnapshot,
  writeBatch
} from "firebase/firestore";
import { Match, Prediction, User, Group, Invite } from "@/types";
// Aliased + type-only so it doesn't shadow the DOM `Notification` global used
// for web-push permission checks below.
import type { Notification as AppNotification } from "@/types";
import { matchSchema, predictionSchema, userSchema, groupSchema, championSchema, notificationSchema } from "@/lib/schemas";
import { parseDoc, parseDocs } from "@/lib/parse";
import { getMatches } from "@/lib/matches";
import { predictionInputSchema, prizeInputSchema, groupRulesInputSchema, firstError } from "@/lib/form-schemas";
import { calculateGroupScores } from "@/lib/scoring";
import { getFlag, WORLD_CUP_TEAMS } from "@/lib/flags";
import { isChampionLocked, getMaxMembersPerGroup, DEFAULT_MAX_MEMBERS_PER_GROUP } from "@/lib/config";
import { formatKickoffDateTime, formatKickoffTime, formatKickoffDate, toMs } from "@/lib/dates";
import { enablePushNotifications, pushIsSupported } from "@/lib/messaging";
import { useDialog } from "@/components/DialogProvider";
import { PHASE_TRANSLATIONS, DEFAULT_GROUP_RULES, SOON_WINDOW_MIN, PREDICTIONS_PER_PAGE } from "@/lib/constants";

type Tab = "home" | "predictions" | "table" | "groups" | "profile";

// The expensive, cacheable inputs to a group's leaderboard. Scores are always
// recomputed from the *current* matches, so this caches only the reads (member
// profiles + the group's predictions + champion picks).
type GroupLeaderboardRaw = {
  members: User[];
  predictions: Prediction[];
  champions: Record<string, string>;
};

// Group-stage matches encode their group letter in the seeded id, e.g.
// "wc26_a_mexico_vs_sudafrica" → "A". Returns null for matches that don't
// follow the seed convention (e.g. manually-created ones), so they're only
// ever shown under the "all groups" option.
const getMatchGroupLetter = (match: Match): string | null => {
  const m = /^wc26_([a-l])_/i.exec(match.id);
  return m ? m[1].toUpperCase() : null;
};

// Shared "active group" picker. The selection (`selectedGroup`) is global to the
// dashboard, so the same control appears in Inicio, Pronósticos and Tabla and
// switching it anywhere updates every tab. Renders nothing when the user has no
// groups. `label` lets each tab title the control in context.
function GroupSelector({
  groups,
  selectedGroup,
  onChange,
  label,
}: {
  groups: Group[];
  selectedGroup: Group | null;
  onChange: (groupId: string) => void;
  label: string;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</label>
      <select
        value={selectedGroup?.id || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold text-emerald-400"
      >
        {groups.map(group => (
          <option key={group.id} value={group.id} className="bg-neutral-950 text-white">
            {group.name} ({group.inviteCode})
          </option>
        ))}
      </select>
    </div>
  );
}

export default function UnifiedDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  
  // Data State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<User | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<User[]>([]);
  
  const [matches, setMatches] = useState<Match[]>([]);
  // Predictions are per-group: keyed [groupId][matchId]. A user predicts each
  // match separately in every group, so points stay independent across groups.
  const [predictionsByGroup, setPredictionsByGroup] = useState<Record<string, Record<string, Prediction>>>({});

  // Form/Local States
  const [loading, setLoading] = useState(true);
  // Surfaced by a watchdog when the initial load stalls, so the user gets a
  // retry instead of an infinite spinner.
  const [loadError, setLoadError] = useState(false);
  const [savingPrediction, setSavingPrediction] = useState<Record<string, boolean>>({});
  // Tracks which predictions are persisted and unmodified, keyed `${groupId}_${matchId}`.
  // true = saved exactly as shown; false/absent = unsaved edits. Drives the
  // "✓ Guardado" / "Cambios sin guardar" indicator in the predictions tab.
  const [savedPredictions, setSavedPredictions] = useState<Record<string, boolean>>({});
  // This user's saved champion per group (groupId -> team). `selectedChampion`
  // and `championSaved` track the picker for the currently selected group.
  const [championsByGroup, setChampionsByGroup] = useState<Record<string, string>>({});
  const [selectedChampion, setSelectedChampion] = useState("");
  const [championSaved, setChampionSaved] = useState(false);
  const [predictionFilter, setPredictionFilter] = useState<"all" | "group" | "round_of_16" | "quarter_finals" | "semi_finals" | "finals">("all");
  // Sub-filter for the "Grupos" phase: a group letter ("A".."L") or "all".
  const [groupLetterFilter, setGroupLetterFilter] = useState<string>("all");
  // Status filter for the predictions list: all, still-open (editable), or closed/played.
  const [predictionStatusFilter, setPredictionStatusFilter] = useState<"todos" | "abiertos" | "finalizados">("abiertos");
  const [predictionPage, setPredictionPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Group + leaderboard states
  const [groupError, setGroupError] = useState("");
  const [groupFormError, setGroupFormError] = useState(""); // join/create forms (kept separate from pending-invite groupError)
  const [maxMembers, setMaxMembers] = useState(DEFAULT_MAX_MEMBERS_PER_GROUP);

  // Create-group form
  const [newGroupName, setNewGroupName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [entryFee, setEntryFee] = useState(0);
  const [exactScorePoints, setExactScorePoints] = useState(3);
  const [correctOutcomePoints, setCorrectOutcomePoints] = useState(1);
  const [uniquePredictionPoints, setUniquePredictionPoints] = useState(0);
  const [quarterFinalsBonus, setQuarterFinalsBonus] = useState(0);
  const [semiFinalsBonus, setSemiFinalsBonus] = useState(0);
  const [finalsBonus, setFinalsBonus] = useState(0);
  const [firstPlacePercent, setFirstPlacePercent] = useState(50);
  const [secondPlacePercent, setSecondPlacePercent] = useState(30);
  const [thirdPlacePercent, setThirdPlacePercent] = useState(20);

  // Join-group form
  const [inviteCode, setInviteCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [groupScores, setGroupScores] = useState<Record<string, { totalPoints: number; exactGuesses: number }>>({});
  // Champion pick per member for the currently selected group (uid -> team),
  // used by the leaderboard. Loaded alongside the group's leaderboard.
  const [memberChampions, setMemberChampions] = useState<Record<string, string>>({});
  // Per-group leaderboard cache (raw reads), for instant re-display on switch.
  // Always revalidated in the background; dropped when the user edits a pick.
  const leaderboardCacheRef = useRef<Record<string, GroupLeaderboardRaw>>({});
  // Mirrors the selected group id so a slow background revalidation never
  // overwrites the table after the user has already switched away.
  const selectedGroupIdRef = useRef<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  // Web-push enrollment state for this device, surfaced in the profile tab.
  const [pushState, setPushState] = useState<
    "idle" | "working" | "granted" | "denied" | "unsupported" | "no-vapid" | "error"
  >("idle");

  // Pending group invite to confirm joining — sourced from ?join=CODE (a link
  // followed while signed in / right after sign-up) or, as a fallback, the code
  // that admitted this account (dbUser.inviteId). Resolved in loadAllData.
  const [pendingInvite, setPendingInvite] = useState<{ code: string; groupId: string; groupName: string } | null>(null);
  const [joiningPending, setJoiningPending] = useState(false);
  const [pendingDismissed, setPendingDismissed] = useState(false);

  const router = useRouter();
  const { alert: showAlert } = useDialog();

  // A 1-second ticking clock so kickoff/lock checks and countdowns stay live in
  // render without calling the impure Date.now() during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Keep the selected-group ref in sync (used to guard background revalidations).
  useEffect(() => {
    selectedGroupIdRef.current = selectedGroup?.id ?? null;
  }, [selectedGroup]);

  // Auto-Lock Scheduler for User Dashboard
  useEffect(() => {
    if (matches.length === 0) return;

    const interval = setInterval(async () => {
      const now = Date.now();
      let updatedSome = false;
      const updatedMatches = [...matches];

      for (let i = 0; i < updatedMatches.length; i++) {
        const m = updatedMatches[i];
        const kickoffMs = toMs(m.kickoffTime);
        
        if (m.status === "upcoming" && now >= kickoffMs) {
          try {
            const mRef = doc(db, "matches", m.id);
            await updateDoc(mRef, { status: "locked" });
            updatedMatches[i] = { ...m, status: "locked" };
            updatedSome = true;
            console.log(`[Auto-Lock Dashboard] Match ${m.homeTeam} vs ${m.awayTeam} locked.`);
          } catch (err) {
            console.error("Error auto-locking match in dashboard:", err);
          }
        }
      }

      if (updatedSome) {
        setMatches(updatedMatches);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [matches]);

  // Detect this device's push capability/permission on mount so the profile tab
  // shows the right state without the user having to click first.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!(await pushIsSupported())) {
        if (active) setPushState("unsupported");
        return;
      }
      if (typeof Notification !== "undefined") {
        if (Notification.permission === "granted" && active) setPushState("granted");
        else if (Notification.permission === "denied" && active) setPushState("denied");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleEnablePush = async () => {
    if (!user) return;
    setPushState("working");
    const res = await enablePushNotifications(user.uid);
    if (res.ok) {
      setPushState("granted");
      return;
    }
    setPushState(
      res.reason === "denied"
        ? "denied"
        : res.reason === "unsupported"
        ? "unsupported"
        : res.reason === "no-vapid"
        ? "no-vapid"
        : "error"
    );
  };

  const handleOpenNotifDrawer = async () => {
    setShowNotifDrawer(true);
    if (!user) return;

    const unreadNotifs = notifications.filter(n => !n.read);
    if (unreadNotifs.length === 0) return;

    try {
      const batch = writeBatch(db);
      unreadNotifs.forEach((n) => {
        const nRef = doc(db, "users", user.uid, "notifications", n.id);
        batch.update(nRef, { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Error marking notifications as read:", err);
    }
  };

  // Combined fetch function to pull all necessary Firestore state
  async function loadAllData(uid: string) {
    try {
      setLoading(true);
      setLoadError(false);

      // Fire every independent read at once. None depends on another, so a
      // single Promise.all collapses ~6 serial round-trips into one — critical
      // on slow transports (long-polling makes many ~190ms polls per query, so
      // serial reads stacked up to 15s+). The leaderboard and invite resolution
      // are deferred below so they never block the initial render.
      const [userDoc, groupSnapshot, cap, matchesData, predsSnapshot, champsSnapshot] =
        await Promise.all([
          getDoc(doc(db, "users", uid)),
          getDocs(query(collection(db, "groups"), where("members", "array-contains", uid))),
          getMaxMembersPerGroup(),
          getMatches(),
          getDocs(query(collection(db, "predictions"), where("userId", "==", uid))),
          getDocs(query(collection(db, "champions"), where("userId", "==", uid))),
        ]);

      // User profile
      const userData = parseDoc(userSchema, userDoc);
      if (userData) setDbUser(userData);

      // Groups + global member cap
      const groupsData = parseDocs(groupSchema, groupSnapshot);
      setGroups(groupsData);
      setMaxMembers(cap);

      // Matches (from the cached /api/matches endpoint), sorted by kickoff.
      matchesData.sort((a, b) => toMs(a.kickoffTime) - toMs(b.kickoffTime));
      setMatches(matchesData);

      // This user's predictions, keyed [groupId][matchId].
      const byGroup: Record<string, Record<string, Prediction>> = {};
      const savedSeed: Record<string, boolean> = {};
      predsSnapshot.forEach((doc) => {
        const data = parseDoc(predictionSchema, doc);
        if (!data || !data.groupId) return; // ignore malformed / legacy global predictions
        (byGroup[data.groupId] ??= {})[data.matchId] = data;
        savedSeed[`${data.groupId}_${data.matchId}`] = true;
      });
      setPredictionsByGroup(byGroup);
      setSavedPredictions(savedSeed);

      // This user's champion picks (groupId -> team).
      const champByGroup: Record<string, string> = {};
      champsSnapshot.forEach((doc) => {
        const c = parseDoc(championSchema, doc);
        if (c && c.groupId && c.champion) champByGroup[c.groupId] = c.champion;
      });
      setChampionsByGroup(champByGroup);

      if (groupsData.length > 0) {
        const first = groupsData[0];
        setSelectedGroup(first);
        setSelectedChampion(champByGroup[first.id] || "");
        setChampionSaved(!!champByGroup[first.id]);
        // Lazy: the leaderboard needs extra reads (members + per-group preds/
        // champions). Don't block the initial render on them — the dashboard
        // shows now and the table fills in a moment later.
        void loadGroupLeaderboard(first, matchesData);
      }

      // Resolve a pending group invite (?join=CODE wins, else the admitting
      // invite). Fire-and-forget: it only drives the optional "join this group?"
      // card, so it must not delay the dashboard.
      const joinCode =
        new URLSearchParams(window.location.search).get("join")?.trim() ||
        (userData?.inviteId as string | undefined) ||
        null;
      if (joinCode) {
        getDoc(doc(db, "invites", joinCode))
          .then((invSnap) => {
            if (!invSnap.exists()) return;
            const inv = invSnap.data();
            const gid = (inv.groupId as string | null) ?? null;
            if (gid && !groupsData.some((g) => g.id === gid)) {
              setPendingInvite({ code: joinCode, groupId: gid, groupName: (inv.groupName as string) || "tu grupo" });
            }
          })
          .catch((e) => console.error("Error resolving pending invite:", e));
      }

    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }

  // Auth gate + initial load + notifications listener. Declared after
  // loadAllData so the listener can call it (and so it isn't referenced before
  // its declaration). Runs once on mount.
  useEffect(() => {
    let unsubscribeNotifs: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/");
        return;
      }
      setUser(currentUser);
      await loadAllData(currentUser.uid);

      // Listen to notifications in real-time
      const notifsQuery = collection(db, "users", currentUser.uid, "notifications");
      unsubscribeNotifs = onSnapshot(notifsQuery, (snapshot) => {
        const notifsData = parseDocs(notificationSchema, snapshot);
        notifsData.sort((a, b) => {
          const timeA = toMs(a.timestamp);
          const timeB = toMs(b.timestamp);
          return timeB - timeA; // Descending
        });
        setNotifications(notifsData);
      }, (err) => {
        console.error("Error listening to notifications:", err);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeNotifs) unsubscribeNotifs();
    };
    // Mount-once auth listener: subscribe exactly once so re-renders (e.g. the
    // `now` ticking clock) never tear down and re-create the listener + the
    // notifications onSnapshot. `router` and loadAllData are captured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watchdog: if the initial load hasn't finished after 15s, stop the spinner
  // and offer a retry instead of hanging forever.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      console.warn("[dashboard] la carga inicial superó 15s — posible read de Firestore colgado");
      setLoadError(true);
    }, 15000);
    return () => clearTimeout(t);
  }, [loading]);

  // Fetch a group's leaderboard inputs. All reads run in PARALLEL (member chunks
  // + predictions + champions) — they were serial before, which stacked up on
  // big groups. The result is cached for instant re-display on switch.
  async function fetchGroupLeaderboardRaw(group: Group): Promise<GroupLeaderboardRaw> {
    const chunks: string[][] = [];
    for (let i = 0; i < group.members.length; i += 10) {
      chunks.push(group.members.slice(i, i + 10));
    }

    const [memberSnaps, pSnapshot, cSnapshot] = await Promise.all([
      Promise.all(
        chunks.map((chunk) => getDocs(query(collection(db, "users"), where("uid", "in", chunk)))),
      ),
      getDocs(query(collection(db, "predictions"), where("groupId", "==", group.id))),
      getDocs(query(collection(db, "champions"), where("groupId", "==", group.id))),
    ]);

    const members = memberSnaps.flatMap((s) => parseDocs(userSchema, s));
    const predictions = parseDocs(predictionSchema, pSnapshot);
    const champions: Record<string, string> = {};
    cSnapshot.forEach((doc) => {
      const c = parseDoc(championSchema, doc);
      if (c && c.userId && c.champion) champions[c.userId] = c.champion;
    });

    const raw: GroupLeaderboardRaw = { members, predictions, champions };
    leaderboardCacheRef.current[group.id] = raw;
    return raw;
  }

  // Compute the standings from raw inputs + the CURRENT matches and push to
  // state. Pure/synchronous — scores never come from the cache, only the reads
  // do, so a fresh result reflects as soon as `matches` updates.
  function applyGroupLeaderboard(group: Group, raw: GroupLeaderboardRaw, matchesList?: Match[]) {
    setMemberChampions(raw.champions);

    const activeRules = group.rules || DEFAULT_GROUP_RULES;
    // Use freshly-fetched matches when provided (during initial load the `matches`
    // state is still empty here), otherwise fall back to the current state.
    const matchesForScoring = matchesList ?? matches;
    const calculatedScores = calculateGroupScores(group.id, group.members, matchesForScoring, raw.predictions, activeRules);
    setGroupScores(calculatedScores);

    // Sort by dynamic group-specific totalPoints desc, then exactGuesses desc
    const sorted = [...raw.members].sort((a, b) => {
      const scoreA = calculatedScores[a.uid] || { totalPoints: 0, exactGuesses: 0 };
      const scoreB = calculatedScores[b.uid] || { totalPoints: 0, exactGuesses: 0 };
      if (scoreB.totalPoints !== scoreA.totalPoints) return scoreB.totalPoints - scoreA.totalPoints;
      return scoreB.exactGuesses - scoreA.exactGuesses;
    });
    setGroupMembers(sorted);
  }

  // Fetch + apply (used on initial load).
  async function loadGroupLeaderboard(group: Group, matchesList?: Match[]) {
    try {
      const raw = await fetchGroupLeaderboardRaw(group);
      applyGroupLeaderboard(group, raw, matchesList);
    } catch (err) {
      console.error("Error loading leaderboard:", err);
    }
  }

  const handleGroupChange = async (groupId: string) => {
    const selected = groups.find(g => g.id === groupId);
    if (!selected) return;
    setSelectedGroup(selected);
    selectedGroupIdRef.current = selected.id;
    // Champion is per-group: reflect the pick saved for this group.
    setSelectedChampion(championsByGroup[selected.id] || "");
    setChampionSaved(!!championsByGroup[selected.id]);

    const cached = leaderboardCacheRef.current[selected.id];
    if (cached) {
      // Show the cached standings instantly (no spinner)…
      applyGroupLeaderboard(selected, cached);
      // …then revalidate in the background so others' predictions and fresh
      // results update without making the user wait. Guarded so a slow response
      // never overwrites the table after the user switched away again.
      fetchGroupLeaderboardRaw(selected)
        .then((raw) => {
          if (selectedGroupIdRef.current === selected.id) applyGroupLeaderboard(selected, raw);
        })
        .catch((err) => console.error("Error revalidating leaderboard:", err));
    } else {
      await loadGroupLeaderboard(selected);
    }
  };

  // Live match results: a score entered by an admin propagates here immediately
  // (real-time, no polling, no reload). The initial paint still comes from the
  // cached /api/matches; this keeps the list live afterwards. With
  // persistentLocalCache the first emission is served from IndexedDB instantly.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      collection(db, "matches"),
      (snap) => {
        const live = parseDocs(matchSchema, snap);
        live.sort((a, b) => toMs(a.kickoffTime) - toMs(b.kickoffTime));
        setMatches(live);
      },
      (err) => console.error("Error listening to matches:", err),
    );
    return () => unsub();
  }, [user]);

  // Recompute the visible leaderboard whenever matches change (e.g. a live result
  // just came in) — reuses the cached raw reads, so it's instant and fetch-free.
  useEffect(() => {
    if (!selectedGroup) return;
    const cached = leaderboardCacheRef.current[selectedGroup.id];
    if (cached) applyGroupLeaderboard(selectedGroup, cached, matches);
    // applyGroupLeaderboard is a local recompute; matches + selectedGroup are the
    // real triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, selectedGroup]);

  const handleSaveChampion = async () => {
    if (!selectedChampion || !user) return;
    if (!selectedGroup) {
      await showAlert("Debes seleccionar un grupo para elegir tu campeón.");
      return;
    }
    if (isChampionLocked()) {
      await showAlert("El plazo para elegir o cambiar de campeón ya finalizó.");
      return;
    }
    try {
      // Champion is per-group: one pick per (user, group).
      const champId = `${user.uid}_${selectedGroup.id}`;
      await setDoc(doc(db, "champions", champId), {
        id: champId,
        userId: user.uid,
        groupId: selectedGroup.id,
        champion: selectedChampion,
        timestamp: new Date(),
      });
      setChampionSaved(true);
      setChampionsByGroup(prev => ({ ...prev, [selectedGroup.id]: selectedChampion }));
      setMemberChampions(prev => ({ ...prev, [user.uid]: selectedChampion }));
      await showAlert("¡Campeón guardado con éxito!");
    } catch (err) {
      console.error(err);
      await showAlert("Error al guardar el campeón.");
    }
  };

  // Reset pagination when any prediction filter changes, and drop the group-
  // letter sub-filter when the phase changes. Done by comparing the previous
  // value during render — React's recommended alternative to a state-syncing
  // effect (no extra render pass, no setState-in-effect).
  const filterSignature = `${predictionFilter}|${predictionStatusFilter}|${groupLetterFilter}`;
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setPredictionPage(1);
  }
  const [prevPredictionFilter, setPrevPredictionFilter] = useState(predictionFilter);
  if (predictionFilter !== prevPredictionFilter) {
    setPrevPredictionFilter(predictionFilter);
    setGroupLetterFilter("all");
  }

  // The prediction to show for a match in the currently selected group: the one
  // saved for this group if it exists, otherwise an editable prefill copied from
  // another group the user belongs to (not yet saved here — no id, no points).
  // Returns undefined when the user has no prediction for this match anywhere.
  const getDisplayPrediction = (matchId: string): Prediction | undefined => {
    const gid = selectedGroup?.id;
    if (!gid || !user) return undefined;
    const own = predictionsByGroup[gid]?.[matchId];
    if (own) return own;
    // Cross-group prefill is only a convenience for editing before kickoff. Once
    // the match is locked/finished, a prefill that was never explicitly saved in
    // this group must not be shown (and must not count) — only `own` predictions do.
    const match = matches.find((m) => m.id === matchId);
    if (match) {
      const kickoffMs = toMs(match.kickoffTime);
      const isLocked = now >= kickoffMs || match.status === "locked" || match.status === "finished";
      if (isLocked) return undefined;
    }
    for (const [g, byMatch] of Object.entries(predictionsByGroup)) {
      if (g !== gid && byMatch[matchId]) {
        const src = byMatch[matchId];
        // Prefill: copy the scores, but scope to this group and clear identity/points.
        // Empty id marks it as not-yet-saved here; submitPrediction assigns the real id.
        return {
          ...src,
          id: "",
          groupId: gid,
          userId: user.uid,
          pointsEarned: null,
        };
      }
    }
    return undefined;
  };

  const handlePredictionChange = (matchId: string, team: "home" | "away", scoreStr: string) => {
    const gid = selectedGroup?.id;
    if (!gid || !user) return;
    // Keep only digits and allow an empty value so the field can be cleared.
    const sanitized = scoreStr.replace(/\D/g, "").slice(0, 2);

    // Any edit makes the shown prediction diverge from what's saved.
    setSavedPredictions((prev) => ({ ...prev, [`${gid}_${matchId}`]: false }));

    setPredictionsByGroup((prev) => {
      const groupPreds = prev[gid] || {};
      const existing = groupPreds[matchId] || getDisplayPrediction(matchId) || ({
        matchId,
        userId: user.uid,
        groupId: gid,
        predictedHomeScore: "",
        predictedAwayScore: "",
        pointsEarned: null,
      } as unknown as Prediction);

      return {
        ...prev,
        [gid]: {
          ...groupPreds,
          [matchId]: {
            ...existing,
            groupId: gid,
            [team === "home" ? "predictedHomeScore" : "predictedAwayScore"]: sanitized,
          } as Prediction,
        },
      };
    });
  };

  const submitPrediction = async (matchId: string) => {
    if (!user) return;
    // Block if user is in 0 groups
    if (groups.length === 0) {
      await showAlert("Para ingresar pronósticos debes unirte a un grupo primero.");
      return;
    }
    if (!selectedGroup) {
      await showAlert("Selecciona un grupo para guardar tu pronóstico.");
      return;
    }
    const gid = selectedGroup.id;

    const prediction = predictionsByGroup[gid]?.[matchId] || getDisplayPrediction(matchId);
    if (!prediction) return;

    // Both scores must be filled in before saving.
    const homeRaw = `${prediction.predictedHomeScore}`;
    const awayRaw = `${prediction.predictedAwayScore}`;
    if (homeRaw === "" || awayRaw === "") {
      await showAlert("Ingresa ambos marcadores antes de guardar.");
      return;
    }
    const parsedScores = predictionInputSchema.safeParse({
      predictedHomeScore: homeRaw,
      predictedAwayScore: awayRaw,
    });
    if (!parsedScores.success) {
      await showAlert(firstError(parsedScores.error));
      return;
    }
    const { predictedHomeScore: home, predictedAwayScore: away } = parsedScores.data;

    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

    const kickoffMs = toMs(match.kickoffTime);
    if (now >= kickoffMs || match.status === "locked" || match.status === "finished") {
      await showAlert("¡Este partido ya está cerrado!");
      return;
    }

    setSavingPrediction(prev => ({ ...prev, [matchId]: true }));
    try {
      // One prediction per (user, group, match).
      const predId = `${user.uid}_${gid}_${matchId}`;
      const payload: Prediction = {
        ...prediction,
        id: predId,
        userId: user.uid,
        groupId: gid,
        matchId,
        predictedHomeScore: home,
        predictedAwayScore: away,
        pointsEarned: prediction.pointsEarned ?? null,
        timestamp: new Date(),
      };

      await setDoc(doc(db, "predictions", predId), payload);
      setPredictionsByGroup(prev => ({
        ...prev,
        [gid]: { ...(prev[gid] || {}), [matchId]: payload },
      }));
      setSavedPredictions(prev => ({ ...prev, [`${gid}_${matchId}`]: true }));
      // This group's cached leaderboard predictions are now stale — drop it so
      // the next visit re-fetches fresh.
      delete leaderboardCacheRef.current[gid];
    } catch (err) {
      console.error("Error saving prediction:", err);
      await showAlert("Error al guardar el pronóstico.");
    } finally {
      setSavingPrediction(prev => ({ ...prev, [matchId]: false }));
    }
  };

  // Add ourselves to a group and bring local state in sync: re-read the group
  // (now readable as a member), merge it into `groups` (deduped — arrayUnion is
  // idempotent server-side but the local array is not), select it, and recompute
  // its leaderboard. Throws if the membership write is rejected (e.g. group full),
  // letting callers map the error to their own UI.
  const joinGroupById = async (groupId: string): Promise<Group> => {
    if (!user) throw new Error("Debes iniciar sesión para unirte a un grupo.");
    await updateDoc(doc(db, "groups", groupId), {
      members: arrayUnion(user.uid),
    });
    const groupSnap = await getDoc(doc(db, "groups", groupId));
    const joined = parseDoc(groupSchema, groupSnap);
    if (!joined) throw new Error("No se pudo leer el grupo recién unido.");
    setGroups((prev) => (prev.some((g) => g.id === joined.id) ? prev : [...prev, joined]));
    setSelectedGroup(joined);
    await loadGroupLeaderboard(joined);
    return joined;
  };

  // Confirm joining the group offered by the invite link. Adding only our own
  // uid is permitted by the rules (and capped by the global member limit); a
  // rejection here means the group is full.
  const handleConfirmJoin = async () => {
    if (!pendingInvite || !user) return;
    setJoiningPending(true);
    setGroupError("");

    try {
      await joinGroupById(pendingInvite.groupId);
      setPendingInvite(null);
      router.replace("/dashboard"); // drop the ?join= param
      setActiveTab("table");
    } catch (err: unknown) {
      console.error(err);
      setGroupError("No pudimos unirte a este grupo. Es posible que ya esté lleno.");
    } finally {
      setJoiningPending(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = inviteCode.trim().toUpperCase();
    if (!cleanCode || !user) return;
    setJoinLoading(true);
    setGroupFormError("");

    try {
      const codeSnap = await getDoc(doc(db, "invites", cleanCode));
      const groupId = codeSnap.exists() ? (codeSnap.data().groupId as string | null) : null;
      if (!groupId) {
        setGroupFormError("Código de invitación inválido. Grupo no encontrado.");
        setJoinLoading(false);
        return;
      }

      try {
        await joinGroupById(groupId);
      } catch {
        setGroupFormError("Este grupo ya está lleno.");
        setJoinLoading(false);
        return;
      }

      // If we just joined the group a pending invite was offering, dismiss it.
      if (pendingInvite?.groupId === groupId) setPendingInvite(null);
      setInviteCode("");
      setActiveTab("table");
    } catch (err: unknown) {
      console.error(err);
      setGroupFormError("Error al unirse al grupo. Por favor, inténtalo de nuevo.");
    } finally {
      setJoinLoading(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !user) return;
    setCreateLoading(true);
    setGroupFormError("");

    try {
      const rulesParsed = groupRulesInputSchema.safeParse({
        exactScorePoints, correctOutcomePoints, uniquePredictionPoints,
        quarterFinalsBonus, semiFinalsBonus, finalsBonus,
      });
      const prizeParsed = prizeInputSchema.safeParse({
        firstPlacePercent, secondPlacePercent, thirdPlacePercent,
      });
      if (!rulesParsed.success) {
        setGroupFormError(firstError(rulesParsed.error));
        setCreateLoading(false);
        return;
      }
      if (!prizeParsed.success) {
        setGroupFormError(firstError(prizeParsed.error));
        setCreateLoading(false);
        return;
      }

      const groupId = `group_${Date.now()}`;
      // Snapshot the global member cap as the invite's maxUses (rules require
      // maxUses to equal the live cap, so read it right before writing).
      const cap = await getMaxMembersPerGroup();

      // Generate a unique-ish 6-character uppercase alphanumeric code
      const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      // Ensure the invite code is unique (it is the doc id in /invites).
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await getDoc(doc(db, "invites", code));
        if (!existing.exists()) break;
        code = "";
        for (let i = 0; i < 6; i++) {
          code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
      }

      const newGroup: Group = {
        id: groupId,
        name: newGroupName.trim(),
        creatorId: user.uid,
        inviteCode: code,
        members: [user.uid],
        createdAt: new Date(),
        entryFee: Number(entryFee),
        rules: rulesParsed.data,
        prizeDistribution: prizeParsed.data,
      };

      const groupInvite: Invite = {
        code,
        type: "group",
        groupId,
        groupName: newGroup.name,
        maxUses: cap,
        uses: 0,
        consumedBy: [],
        expiresAt: null,
        active: true,
        createdBy: user.uid,
        createdAt: new Date(),
      };

      const batch = writeBatch(db);
      batch.set(doc(db, "groups", groupId), newGroup);
      batch.set(doc(db, "invites", code), groupInvite);
      await batch.commit();

      // Pre-seed local state so returning from the detail page needs no refetch.
      setGroups([...groups, newGroup]);
      setSelectedGroup(newGroup);
      await loadGroupLeaderboard(newGroup);

      setNewGroupName("");
      setEntryFee(0);
      setExactScorePoints(3);
      setCorrectOutcomePoints(1);
      setUniquePredictionPoints(0);
      setQuarterFinalsBonus(0);
      setSemiFinalsBonus(0);
      setFinalsBonus(0);
      setFirstPlacePercent(50);
      setSecondPlacePercent(30);
      setThirdPlacePercent(20);

      // The detail page owns the "¡Grupo Creado!" success modal + WhatsApp share.
      router.push(`/groups/${groupId}?created=true`);
    } catch (err: unknown) {
      console.error(err);
      setGroupFormError("Error al crear el grupo. Por favor, inténtalo de nuevo.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white font-sans px-6">
        {loadError ? (
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <span className="text-gray-300 text-sm">
              La carga está tardando demasiado. Puede ser un problema de conexión con la base de datos.
            </span>
            <button
              onClick={() => window.location.reload()}
              className="min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 text-sm font-bold text-white transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-400 text-sm">Cargando Polla 2026...</span>
          </div>
        )}
      </div>
    );
  }

  // Calculate stats for home view countdowns
  const kickoffMsOf = (m: Match) => toMs(m.kickoffTime);

  // A match is "closed" (no longer predictable) once it has kicked off, locked,
  // or finished. Drives the predictions status filter, the read-only card variant,
  // and the cross-group prefill guard.
  const isMatchClosed = (m: Match) =>
    now >= kickoffMsOf(m) || m.status === "locked" || m.status === "finished";

  const nextMatch = matches.find(m => m.status === "upcoming");
  let countdownText = "";
  if (nextMatch) {
    const diff = kickoffMsOf(nextMatch) - now;
    if (diff > 0) {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      countdownText = `Cierra en ${days}d ${hours}h`;
    }
  }

  // Home tab match sections: today's matches (any status) get full cards, and the
  // next 3 matches kicking off after today get smaller cards below. `matches` is
  // already sorted by kickoff ascending, so filtering/slicing keeps chronological order.
  const startOfToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const startOfTomorrow = startOfToday + 24 * 60 * 60 * 1000;
  const todaysMatches = matches.filter(m => {
    const ms = kickoffMsOf(m);
    return ms >= startOfToday && ms < startOfTomorrow;
  });
  const upcomingMatches = matches.filter(m => kickoffMsOf(m) >= startOfTomorrow).slice(0, 3);
  // Home tab "Resultados recientes": the 3 most recently finished matches
  // (matches is sorted ascending, so take the tail and reverse to newest-first).
  const recentResults = matches.filter(m => m.status === "finished").slice(-3).reverse();

  // Real-time "starting soon" + missing-prediction alerts for the currently
  // selected group (predictions are per-group, so "missing" means not yet saved
  // in this group). These are ephemeral, computed in-memory from `matches` —
  // Phase A has no backend to fan out reminder docs, so they only show while the
  // app is open. The scheduled push (Phase B) will own the real, on-time send.
  const currentGroupPreds = selectedGroup ? (predictionsByGroup[selectedGroup.id] || {}) : {};

  // Matches kicking off within the next hour (any prediction state). The card
  // flags whether you still owe a prediction in the selected group.
  const startingSoonMatches = matches
    .filter(m => {
      if (m.status !== "upcoming") return false;
      const diffMin = (kickoffMsOf(m) - now) / (1000 * 60);
      return diffMin > 0 && diffMin <= SOON_WINDOW_MIN;
    })
    .map(m => ({ match: m, hasPred: currentGroupPreds[m.id] !== undefined }));
  const startingSoonIds = new Set(startingSoonMatches.map(s => s.match.id));

  // Unpredicted matches inside the next 24h, excluding those already surfaced as
  // "starting soon" so a soon-and-unpredicted match shows a single, urgent card.
  const missingPredictions24h = matches.filter(m => {
    if (m.status !== "upcoming" || startingSoonIds.has(m.id)) return false;
    const diffHours = (kickoffMsOf(m) - now) / (1000 * 60 * 60);
    const hasPred = currentGroupPreds[m.id] !== undefined;
    return diffHours > 0 && diffHours <= 24 && !hasPred;
  });

  const unreadCount = notifications.filter(n => !n.read).length
    + startingSoonMatches.length + missingPredictions24h.length;

  // Paginate the predictions list so the bottom of the page stays reachable.
  // Group letters present among the group-stage matches, e.g. ["A","B",...],
  // used to build the per-group sub-filter pills shown under "Grupos".
  const groupLetters = Array.from(
    new Set(
      matches
        .filter(m => m.phase === "group")
        .map(getMatchGroupLetter)
        .filter((l): l is string => l !== null)
    )
  ).sort();
  const filteredPredictionMatches = matches.filter(m => {
    if (predictionStatusFilter === "abiertos" && isMatchClosed(m)) return false;
    if (predictionStatusFilter === "finalizados" && !isMatchClosed(m)) return false;
    if (predictionFilter !== "all" && m.phase !== predictionFilter) return false;
    if (predictionFilter === "group" && groupLetterFilter !== "all" && getMatchGroupLetter(m) !== groupLetterFilter) return false;
    return true;
  });
  const totalPredictionPages = Math.max(1, Math.ceil(filteredPredictionMatches.length / PREDICTIONS_PER_PAGE));
  const safePredictionPage = Math.min(predictionPage, totalPredictionPages);
  const pagedPredictionMatches = filteredPredictionMatches.slice(
    (safePredictionPage - 1) * PREDICTIONS_PER_PAGE,
    safePredictionPage * PREDICTIONS_PER_PAGE
  );

  return (
    <div className="min-h-screen bg-black flex justify-center text-white font-sans antialiased selection:bg-emerald-500/30">
      
      {/* Centered Mobile-First App Container */}
      <div className="max-w-md w-full min-h-screen bg-neutral-950 flex flex-col justify-between border-x border-white/5 relative pb-20 shadow-2xl">
        
        {/* Unified Sticky Header */}
        <header className="sticky top-0 bg-neutral-950/80 backdrop-blur-md border-b border-white/5 p-4 flex justify-between items-center z-50">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-bold text-black">⚽</span>
            <span className="font-bold text-lg tracking-tight">La Polla 2026</span>
          </div>
          
          <div className="flex items-center gap-2">
            {dbUser?.isAdmin && (
              <button 
                onClick={() => router.push("/admin")} 
                className="px-2 py-1 bg-white/10 hover:bg-white/20 text-xs rounded border border-white/5 font-semibold text-gray-300 transition-all"
              >
                Admin
              </button>
            )}
            <button 
              onClick={handleOpenNotifDrawer}
              className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg border border-white/5 transition-all relative flex items-center justify-center"
              title="Notificaciones"
            >
              <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1-1.5-1s-1.5.17-1.5 1v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-600 text-[8px] font-black text-white rounded-full flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            <button 
              onClick={handleLogout}
              className="px-2 py-1 bg-red-600/10 hover:bg-red-600/20 text-xs rounded border border-red-500/10 font-semibold text-red-400 transition-all"
            >
              Salir
            </button>
          </div>
        </header>

        {/* Dynamic Tab Body */}
        <main className="flex-1 p-4 overflow-y-auto space-y-6">
          
          {/* TAB 1: INICIO (HOME) */}
          {activeTab === "home" && (
            <div className="space-y-6">

              {/* Active group selector — shared across Inicio, Pronósticos y Tabla */}
              <GroupSelector
                groups={groups}
                selectedGroup={selectedGroup}
                onChange={handleGroupChange}
                label="Grupo Activo"
              />

              {/* Champion Card */}
              <div className="p-6 bg-gradient-to-br from-emerald-600 to-indigo-900 rounded-2xl border border-white/10 shadow-lg space-y-4">
                <div>
                  <span className="text-[10px] tracking-wider font-extrabold uppercase text-emerald-300">
                    TU CAMPEÓN{selectedGroup ? ` · ${selectedGroup.name}` : ""}
                  </span>
                  {!selectedGroup ? (
                    <p className="mt-2 text-xs text-white/80 font-medium">
                      Únete a un grupo para elegir tu campeón.
                    </p>
                  ) : isChampionLocked() ? (
                    championSaved ? (
                      <div className="mt-1 flex items-center justify-between">
                        <h2 className="text-3xl font-black text-white tracking-tight">
                          <span className="mr-2">{getFlag(selectedChampion)}</span>{selectedChampion}
                        </h2>
                        <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold rounded-full uppercase">
                          ✓ Guardado
                        </span>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-white/80 font-medium">
                        El plazo para elegir campeón ya finalizó.
                      </p>
                    )
                  ) : (
                    <div className="space-y-3 mt-2">
                      {championSaved && (
                        <div className="flex items-center justify-between">
                          <h2 className="text-3xl font-black text-white tracking-tight">
                            <span className="mr-2">{getFlag(championsByGroup[selectedGroup.id])}</span>{championsByGroup[selectedGroup.id]}
                          </h2>
                          <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold rounded-full uppercase">
                            ✓ Guardado
                          </span>
                        </div>
                      )}
                      <select
                        value={selectedChampion}
                        onChange={(e) => setSelectedChampion(e.target.value)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      >
                        <option value="">Selecciona tu campeón...</option>
                        {WORLD_CUP_TEAMS.map(team => <option key={team} value={team}>{getFlag(team)} {team}</option>)}
                      </select>
                      <button
                        onClick={handleSaveChampion}
                        disabled={!selectedChampion || selectedChampion === championsByGroup[selectedGroup.id]}
                        className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold rounded-xl transition-all"
                      >
                        {championSaved ? "Actualizar Campeón" : "Guardar Elección"}
                      </button>
                    </div>
                  )}
                </div>
                {selectedGroup && !isChampionLocked() && (
                  <p className="text-[10px] text-emerald-300/80 italic font-medium border-t border-white/5 pt-2">
                    Puedes elegir o cambiar tu campeón hasta el 4 de julio.
                  </p>
                )}
              </div>

              {/* Confirm-join card — appears when arriving via an invite link */}
              {pendingInvite && !pendingDismissed && (
                <div className="p-6 bg-gradient-to-br from-neutral-900 via-neutral-900 to-emerald-950/30 border border-emerald-500/30 rounded-2xl space-y-4 shadow-xl text-left relative">
                  <button
                    onClick={() => setPendingDismissed(true)}
                    className="absolute top-3 right-3 h-7 w-7 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-xs text-gray-400"
                    aria-label="Descartar invitación"
                  >
                    ✕
                  </button>
                  <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                    <span className="text-2xl">🎉</span>
                    <div>
                      <h4 className="font-black text-emerald-300 text-xs tracking-wide uppercase">Invitación a un grupo</h4>
                      <p className="text-[9px] text-gray-400 font-medium">Confirma para unirte y empezar a competir por el pozo.</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-300">
                    Te invitaron a unirte a <span className="font-bold text-white">{pendingInvite.groupName}</span>.
                  </p>
                  {groupError && (
                    <p className="text-[11px] text-red-300">{groupError}</p>
                  )}
                  <button
                    onClick={handleConfirmJoin}
                    disabled={joiningPending}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] rounded-xl transition-all uppercase tracking-wider text-center disabled:opacity-50"
                  >
                    {joiningPending ? "Uniéndote..." : `Confirmar y unirme a ${pendingInvite.groupName}`}
                  </button>
                </div>
              )}

              {/* Missing Predictions Reminder Banner */}
              {missingPredictions24h.length > 0 && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 shadow-lg">
                  <span className="text-lg">⚠️</span>
                  <div className="space-y-1 text-left flex-1">
                    <h4 className="font-bold text-red-400 text-[10px] uppercase tracking-wider">¡Pronósticos Pendientes!</h4>
                    <p className="text-[11px] text-gray-300">
                      Tienes {missingPredictions24h.length} {missingPredictions24h.length === 1 ? "partido" : "partidos"} por iniciar en las próximas 24 horas sin pronósticos.
                    </p>
                    <div className="pt-1.5">
                      <button 
                        onClick={() => setActiveTab("predictions")}
                        className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-200 text-[10px] font-bold rounded-lg transition-all"
                      >
                        Ingresar Pronósticos
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Onboarding Wizard for First-Time Users */}
              {groups.length === 0 && (
                <div className="p-6 bg-gradient-to-br from-neutral-900 via-neutral-900 to-purple-950/30 border border-purple-500/20 rounded-2xl space-y-4 shadow-xl text-left">
                  <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                    <span className="text-2xl animate-bounce">👋</span>
                    <div>
                      <h4 className="font-black text-purple-300 text-xs tracking-wide uppercase">¡Bienvenido a La Polla 2026!</h4>
                      <p className="text-[9px] text-gray-400 font-medium">Sigue estos pasos para comenzar tu competencia.</p>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="flex gap-3">
                      <span className="h-5 w-5 bg-purple-500/20 border border-purple-500/30 rounded-full flex items-center justify-center text-[10px] text-purple-300 font-extrabold shrink-0">1</span>
                      <p className="text-gray-300 text-[11px] leading-relaxed">
                        <strong className="text-white">Explora el Calendario:</strong> Abajo puedes ver la programación de partidos oficiales del torneo.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <span className="h-5 w-5 bg-purple-500/20 border border-purple-500/30 rounded-full flex items-center justify-center text-[10px] text-purple-300 font-extrabold shrink-0">2</span>
                      <p className="text-gray-300 text-[11px] leading-relaxed">
                        <strong className="text-purple-300 font-bold">Activa tus Pronósticos:</strong> Para apostar y sumar puntos, crea un grupo privado o únete con el enlace de invitación de un amigo.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <span className="h-5 w-5 bg-purple-500/20 border border-purple-500/30 rounded-full flex items-center justify-center text-[10px] text-purple-300 font-extrabold shrink-0">3</span>
                      <p className="text-gray-300 text-[11px] leading-relaxed">
                        <strong className="text-white">¡Compite en el Podio!:</strong> Ingresa tus pronósticos antes de cada inicio, acumula puntos y gana el pozo grupal.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5">
                    <button
                      onClick={() => setActiveTab("groups")}
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-[10px] rounded-xl transition-all uppercase tracking-wider text-center"
                    >
                      👥 Crear o Unirse a un Grupo
                    </button>
                  </div>
                </div>
              )}

              {/* Today's Matches Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wider">Partidos de Hoy</h3>
                  {countdownText && (
                    <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded">
                      {countdownText}
                    </span>
                  )}
                </div>

                {todaysMatches.length > 0 ? (
                  todaysMatches.map(match => {
                    const kickoffMs = kickoffMsOf(match);
                    const timeStr = formatKickoffTime(kickoffMs);
                    return (
                      <div key={match.id} className="p-5 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center gap-4">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                          <span className="text-emerald-400">{(PHASE_TRANSLATIONS[match.phase] || match.phase).toUpperCase()}</span>
                          <span className="text-gray-600">·</span>
                          <span className="text-gray-400">
                            {match.status === "finished" ? "Final" : match.status === "locked" ? "En juego" : timeStr}
                          </span>
                        </div>
                        <div className="flex items-center justify-between w-full text-center gap-2">
                          <div className="flex-1 flex flex-col items-center gap-0.5">
                            <span className="text-2xl">{getFlag(match.homeTeam)}</span>
                            <span className="font-bold text-xs truncate">{match.homeTeam}</span>
                          </div>
                          {match.status === "finished" ? (
                            <span className="text-lg font-black shrink-0">{match.homeScore} - {match.awayScore}</span>
                          ) : (
                            <span className="text-xs text-gray-500 font-bold shrink-0">vs</span>
                          )}
                          <div className="flex-1 flex flex-col items-center gap-0.5">
                            <span className="text-2xl">{getFlag(match.awayTeam)}</span>
                            <span className="font-bold text-xs truncate">{match.awayTeam}</span>
                          </div>
                        </div>
                        <div className="text-center text-[10px] text-gray-500">
                          {match.stadiumName}, {match.city}
                        </div>
                        {match.status === "upcoming" && (
                          <button
                            onClick={() => setActiveTab("predictions")}
                            className="w-full py-2.5 bg-white/10 hover:bg-white/20 border border-white/5 text-xs font-bold rounded-xl transition-all"
                          >
                            → Ir a Pronósticos
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-gray-500 text-xs bg-white/5 border border-white/5 rounded-2xl">
                    No hay partidos programados para hoy.
                  </div>
                )}
              </div>

              {/* Next Matches Section (smaller cards) */}
              {upcomingMatches.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wider">Próximos Partidos</h3>
                  {upcomingMatches.map(match => {
                    const kickoffMs = kickoffMsOf(match);
                    const dateStr = formatKickoffDate(kickoffMs);
                    const timeStr = formatKickoffTime(kickoffMs);
                    return (
                      <div key={match.id} className="p-3 bg-white/5 border border-white/5 rounded-xl flex items-center gap-3">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className="text-base shrink-0">{getFlag(match.homeTeam)}</span>
                          <span className="font-semibold text-[11px] truncate">{match.homeTeam}</span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-bold shrink-0">vs</span>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                          <span className="font-semibold text-[11px] truncate text-right">{match.awayTeam}</span>
                          <span className="text-base shrink-0">{getFlag(match.awayTeam)}</span>
                        </div>
                        <div className="shrink-0 text-right border-l border-white/5 pl-3 leading-tight">
                          <div className="text-[9px] text-gray-400 font-semibold capitalize">{dateStr}</div>
                          <div className="text-[9px] text-emerald-400 font-bold">{timeStr}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Resultados recientes: last 3 finished matches, with a jump into
                  the predictions tab filtered to Finalizados for the full list. */}
              {recentResults.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wider">Resultados Recientes</h3>
                    <button
                      onClick={() => { setActiveTab("predictions"); setPredictionStatusFilter("finalizados"); }}
                      className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-wider"
                    >
                      Ver todos →
                    </button>
                  </div>
                  {recentResults.map(match => {
                    const pred = getDisplayPrediction(match.id);
                    return (
                      <div key={match.id} className="p-3 bg-white/5 border border-white/5 rounded-xl">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                            <span className="font-semibold text-[11px] truncate text-right">{match.homeTeam}</span>
                            <span className="text-base shrink-0">{getFlag(match.homeTeam)}</span>
                          </div>
                          <span className="shrink-0 px-2 text-sm font-black tabular-nums">{match.homeScore} - {match.awayScore}</span>
                          <div className="flex-1 flex items-center gap-1.5 min-w-0">
                            <span className="text-base shrink-0">{getFlag(match.awayTeam)}</span>
                            <span className="font-semibold text-[11px] truncate">{match.awayTeam}</span>
                          </div>
                        </div>
                        {pred && pred.pointsEarned !== null && (
                          <div className="flex items-center justify-center gap-2 mt-1.5">
                            <span className="text-[9px] text-gray-400">Tu pronóstico: <span className="text-gray-200 font-bold">{pred.predictedHomeScore}-{pred.predictedAwayScore}</span></span>
                            <span className={`text-[9px] font-black uppercase ${pred.pointsEarned === 3 ? "text-yellow-400" : pred.pointsEarned === 1 ? "text-emerald-400" : "text-red-400"}`}>
                              {pred.pointsEarned === 3 ? "+3 Pts" : pred.pointsEarned === 1 ? "+1 Pt" : "0 Pts"}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}

          {/* TAB 2: PRONÓSTICOS */}
          {activeTab === "predictions" && (
            <div className="space-y-4">

              {/* Active group selector — pronósticos are saved per group */}
              <GroupSelector
                groups={groups}
                selectedGroup={selectedGroup}
                onChange={handleGroupChange}
                label="Grupo Activo"
              />

              {/* Filter Pills */}
              <div className="border-b border-white/5 pb-4 space-y-2">
                {/* Status filter: open (editable) vs finished (read-only) vs all */}
                <div className="flex flex-wrap items-center gap-1.5 justify-center">
                  <button
                    onClick={() => setPredictionStatusFilter("abiertos")}
                    className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all uppercase tracking-wider ${predictionStatusFilter === "abiertos" ? "bg-amber-500 text-black" : "bg-white/5 text-gray-400 hover:text-white"}`}
                  >
                    Abiertos
                  </button>
                  <button
                    onClick={() => setPredictionStatusFilter("finalizados")}
                    className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all uppercase tracking-wider ${predictionStatusFilter === "finalizados" ? "bg-amber-500 text-black" : "bg-white/5 text-gray-400 hover:text-white"}`}
                  >
                    Finalizados
                  </button>
                  <button
                    onClick={() => setPredictionStatusFilter("todos")}
                    className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all uppercase tracking-wider ${predictionStatusFilter === "todos" ? "bg-amber-500 text-black" : "bg-white/5 text-gray-400 hover:text-white"}`}
                  >
                    Todos
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 justify-center">
                <button
                  onClick={() => setPredictionFilter("all")}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all uppercase tracking-wider ${predictionFilter === "all" ? "bg-emerald-500 text-black" : "bg-white/5 text-gray-400 hover:text-white"}`}
                >
                  Todos
                </button>
                <button 
                  onClick={() => setPredictionFilter("group")}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all uppercase tracking-wider ${predictionFilter === "group" ? "bg-emerald-500 text-black" : "bg-white/5 text-gray-400 hover:text-white"}`}
                >
                  Grupos
                </button>
                <button 
                  onClick={() => setPredictionFilter("round_of_16")}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all uppercase tracking-wider ${predictionFilter === "round_of_16" ? "bg-emerald-500 text-black" : "bg-white/5 text-gray-400 hover:text-white"}`}
                >
                  8vos
                </button>
                <button 
                  onClick={() => setPredictionFilter("quarter_finals")}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all uppercase tracking-wider ${predictionFilter === "quarter_finals" ? "bg-emerald-500 text-black" : "bg-white/5 text-gray-400 hover:text-white"}`}
                >
                  Cuartos
                </button>
                <button 
                  onClick={() => setPredictionFilter("semi_finals")}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all uppercase tracking-wider ${predictionFilter === "semi_finals" ? "bg-emerald-500 text-black" : "bg-white/5 text-gray-400 hover:text-white"}`}
                >
                  Semifinales
                </button>
                <button 
                  onClick={() => setPredictionFilter("finals")}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all uppercase tracking-wider ${predictionFilter === "finals" ? "bg-emerald-500 text-black" : "bg-white/5 text-gray-400 hover:text-white"}`}
                >
                  Final
                </button>
                </div>

                {/* Per-group sub-filter (only under the "Grupos" phase) */}
                {predictionFilter === "group" && groupLetters.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 justify-center">
                    <button
                      onClick={() => setGroupLetterFilter("all")}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all uppercase tracking-wider ${groupLetterFilter === "all" ? "bg-indigo-500 text-white" : "bg-white/5 text-gray-400 hover:text-white"}`}
                    >
                      Todos
                    </button>
                    {groupLetters.map(letter => (
                      <button
                        key={letter}
                        onClick={() => setGroupLetterFilter(letter)}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all uppercase tracking-wider ${groupLetterFilter === letter ? "bg-indigo-500 text-white" : "bg-white/5 text-gray-400 hover:text-white"}`}
                      >
                        Grupo {letter}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Group block alert */}
              {groups.length === 0 && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl text-center text-xs">
                  ⚠️ Debes estar unido a un grupo para poder guardar tus pronósticos.
                </div>
              )}

              {/* Match predictions list */}
              <div className="space-y-4">
                {pagedPredictionMatches
                  .map(match => {
                    const kickoffMs = kickoffMsOf(match);
                    const isLocked = isMatchClosed(match);
                    const pred: Prediction = getDisplayPrediction(match.id) || ({ predictedHomeScore: "", predictedAwayScore: "" } as unknown as Prediction);
                    // Saved/dirty state for this match in the selected group.
                    const isSaved = !!selectedGroup && !!savedPredictions[`${selectedGroup.id}_${match.id}`];
                    const hasBothScores = `${pred.predictedHomeScore ?? ""}` !== "" && `${pred.predictedAwayScore ?? ""}` !== "";

                    // Closed/played matches render as a compact, read-only card:
                    // result + your prediction + points, no inputs.
                    if (isLocked) {
                      return (
                        <div key={match.id} className="p-3 bg-white/5 border border-white/10 rounded-xl">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-[8px] text-emerald-400 font-bold uppercase">{(PHASE_TRANSLATIONS[match.phase] || match.phase).toUpperCase()}</span>
                            <span className="text-[8px] text-gray-600">·</span>
                            <span className="text-[8px] text-gray-500">{formatKickoffDate(kickoffMs)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                              <span className="font-semibold text-[11px] truncate text-right">{match.homeTeam}</span>
                              <span className="text-base shrink-0">{getFlag(match.homeTeam)}</span>
                            </div>
                            <div className="shrink-0 px-2 text-center">
                              {match.status === "finished"
                                ? <span className="text-sm font-black tabular-nums">{match.homeScore} - {match.awayScore}</span>
                                : <span className="text-[10px] text-gray-500 font-bold uppercase">En juego</span>}
                            </div>
                            <div className="flex-1 flex items-center gap-1.5 min-w-0">
                              <span className="text-base shrink-0">{getFlag(match.awayTeam)}</span>
                              <span className="font-semibold text-[11px] truncate">{match.awayTeam}</span>
                            </div>
                          </div>
                          {(hasBothScores || pred.pointsEarned !== null) && (
                            <div className="flex items-center justify-center gap-2 mt-1.5">
                              {hasBothScores && (
                                <span className="text-[9px] text-gray-400">Tu pronóstico: <span className="text-gray-200 font-bold">{pred.predictedHomeScore}-{pred.predictedAwayScore}</span></span>
                              )}
                              {pred.pointsEarned !== null && (
                                <span className={`text-[9px] font-black uppercase ${pred.pointsEarned === 3 ? "text-yellow-400" : pred.pointsEarned === 1 ? "text-emerald-400" : "text-red-400"}`}>
                                  {pred.pointsEarned === 3 ? "+3 Pts (Exacto)" : pred.pointsEarned === 1 ? "+1 Pt (Ganador)" : "0 Pts"}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={match.id} className="p-4 bg-white/5 border border-white/10 rounded-2xl relative overflow-hidden">
                        {isLocked && (
                          <div className="absolute top-0 right-0 bg-red-500/20 border-l border-b border-red-500/30 text-red-400 text-[8px] px-2 py-0.5 rounded-bl font-extrabold uppercase">
                            Cerrado
                          </div>
                        )}

                        {/* Phase + date header */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[9px] text-emerald-400 font-bold uppercase">{(PHASE_TRANSLATIONS[match.phase] || match.phase).toUpperCase()}</span>
                          <span className="text-[9px] text-gray-500">·</span>
                          <span className="text-[9px] text-gray-400">{formatKickoffDateTime(kickoffMs)}</span>
                        </div>

                        {/* Teams + inputs side by side */}
                        <div className="flex items-center gap-2">
                          {/* Home team */}
                          <div className="flex-1 flex flex-col items-end gap-0.5">
                            <span className="text-xl">{getFlag(match.homeTeam)}</span>
                            <div className="font-bold text-xs truncate text-right">{match.homeTeam}</div>
                            {match.status === "finished" && <div className="text-purple-400 text-[10px]">({match.homeScore})</div>}
                          </div>

                          {/* Score inputs */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={2}
                              value={pred.predictedHomeScore ?? ""}
                              onChange={(e) => handlePredictionChange(match.id, "home", e.target.value)}
                              disabled={isLocked || groups.length === 0}
                              className="w-10 h-10 text-center bg-black/40 border border-white/15 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                              placeholder="-"
                            />
                            <span className="text-gray-500 text-xs font-bold">-</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={2}
                              value={pred.predictedAwayScore ?? ""}
                              onChange={(e) => handlePredictionChange(match.id, "away", e.target.value)}
                              disabled={isLocked || groups.length === 0}
                              className="w-10 h-10 text-center bg-black/40 border border-white/15 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                              placeholder="-"
                            />
                          </div>

                          {/* Away team */}
                          <div className="flex-1 flex flex-col items-start gap-0.5">
                            <span className="text-xl">{getFlag(match.awayTeam)}</span>
                            <div className="font-bold text-xs truncate">{match.awayTeam}</div>
                            {match.status === "finished" && <div className="text-purple-400 text-[10px]">({match.awayScore})</div>}
                          </div>
                        </div>

                        {/* Save button + points below, centered */}
                        {(!isLocked && groups.length > 0) || pred.pointsEarned !== null ? (
                          <div className="flex flex-col items-center gap-1 mt-2">
                            {!isLocked && groups.length > 0 && (
                              <>
                                <button
                                  onClick={() => submitPrediction(match.id)}
                                  disabled={savingPrediction[match.id] || isSaved}
                                  className={`px-6 py-1 text-[10px] font-bold rounded-lg transition-all ${
                                    isSaved
                                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default"
                                      : "bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800"
                                  }`}
                                >
                                  {savingPrediction[match.id] ? "Guardando..." : isSaved ? "✓ Guardado" : "✓ Guardar"}
                                </button>
                                {/* Tell the user, persistently, whether what they see is saved. */}
                                {isSaved ? (
                                  <span className="text-[9px] text-emerald-300/80 font-medium">Tu pronóstico está guardado</span>
                                ) : hasBothScores && !savingPrediction[match.id] ? (
                                  <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">Cambios sin guardar</span>
                                ) : null}
                              </>
                            )}
                            {pred.pointsEarned !== null && (
                              <span className={`text-[9px] font-black uppercase ${pred.pointsEarned === 3 ? "text-yellow-400" : pred.pointsEarned === 1 ? "text-emerald-400" : "text-red-400"}`}>
                                {pred.pointsEarned === 3 ? "+3 Pts (Exacto)" : pred.pointsEarned === 1 ? "+1 Pt (Ganador)" : "0 Pts"}
                              </span>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                {filteredPredictionMatches.length === 0 && (
                  <p className="text-center text-xs text-gray-500 py-8">No hay partidos en esta categoría.</p>
                )}
              </div>

              {/* Pagination controls */}
              {totalPredictionPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setPredictionPage(p => Math.max(1, p - 1))}
                    disabled={safePredictionPage <= 1}
                    className="px-3 py-1.5 text-[10px] font-bold rounded-full bg-white/5 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider transition-all"
                  >
                    ← Anterior
                  </button>
                  <span className="text-[11px] text-gray-400 font-medium tabular-nums">
                    {safePredictionPage} / {totalPredictionPages}
                  </span>
                  <button
                    onClick={() => setPredictionPage(p => Math.min(totalPredictionPages, p + 1))}
                    disabled={safePredictionPage >= totalPredictionPages}
                    className="px-3 py-1.5 text-[10px] font-bold rounded-full bg-white/5 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider transition-all"
                  >
                    Siguiente →
                  </button>
                </div>
              )}

            </div>
          )}

          {/* TAB 3: TABLA (LEADERBOARD) */}
          {activeTab === "table" && (
            <div className="space-y-4">
              
              {/* Group Selector Dropdown */}
              <GroupSelector
                groups={groups}
                selectedGroup={selectedGroup}
                onChange={handleGroupChange}
                label="Grupo de Posiciones"
              />

              {selectedGroup && (
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3 text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <div>
                      <span className="text-gray-400">Inscripción al Pozo:</span>
                      <div className="font-bold text-sm text-emerald-400">
                        {selectedGroup.entryFee ? `$${selectedGroup.entryFee.toLocaleString()}` : "Gratis"}
                      </div>
                    </div>
                    {selectedGroup.entryFee && selectedGroup.entryFee > 0 ? (
                      <div className="text-right">
                        <span className="text-gray-400">Pozo Estimado:</span>
                        <div className="font-bold text-sm text-yellow-400">
                          {`$${(groupMembers.length * selectedGroup.entryFee).toLocaleString()}`}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  
                  {selectedGroup.entryFee && selectedGroup.entryFee > 0 && selectedGroup.prizeDistribution ? (
                    <div className="space-y-1">
                      <span className="text-gray-500 font-semibold uppercase tracking-wider text-[9px]">Distribución del Pozo</span>
                      <div className="flex gap-2 justify-between text-gray-300">
                        <span>1º: {selectedGroup.prizeDistribution.firstPlacePercent}% (${((groupMembers.length * selectedGroup.entryFee) * selectedGroup.prizeDistribution.firstPlacePercent / 100).toLocaleString()})</span>
                        <span>2º: {selectedGroup.prizeDistribution.secondPlacePercent}% (${((groupMembers.length * selectedGroup.entryFee) * selectedGroup.prizeDistribution.secondPlacePercent / 100).toLocaleString()})</span>
                        <span>3º: {selectedGroup.prizeDistribution.thirdPlacePercent}% (${((groupMembers.length * selectedGroup.entryFee) * selectedGroup.prizeDistribution.thirdPlacePercent / 100).toLocaleString()})</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1 border-t border-white/5 pt-2">
                    <span className="text-gray-500 font-semibold uppercase tracking-wider text-[9px]">Reglas de Puntos del Grupo</span>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-300">
                      <div>Marcador Exacto: <span className="text-emerald-400 font-bold">{selectedGroup.rules?.exactScorePoints ?? 3} pts</span></div>
                      <div>Acertar al Ganador: <span className="text-emerald-400 font-bold">{selectedGroup.rules?.correctOutcomePoints ?? 1} pts</span></div>
                      {selectedGroup.rules?.uniquePredictionPoints ? (
                        <div className="col-span-2">Bono Predicción Única: <span className="text-yellow-400 font-bold">+{selectedGroup.rules.uniquePredictionPoints} pts</span></div>
                      ) : null}
                      {selectedGroup.rules?.quarterFinalsBonus ? (
                        <div>Bono Cuartos: <span className="text-yellow-400 font-bold">+{selectedGroup.rules.quarterFinalsBonus} pts</span></div>
                      ) : null}
                      {selectedGroup.rules?.semiFinalsBonus ? (
                        <div>Bono Semis: <span className="text-yellow-400 font-bold">+{selectedGroup.rules.semiFinalsBonus} pts</span></div>
                      ) : null}
                      {selectedGroup.rules?.finalsBonus ? (
                        <div>Bono Final: <span className="text-yellow-400 font-bold">+{selectedGroup.rules.finalsBonus} pts</span></div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-white/5 mt-2">
                    <a 
                      href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                        `¡Únete a mi grupo de apuestas en La Polla Mundial 2026! ⚽🏆\n\nGrupo: *${selectedGroup.name}*\nCódigo de Invitación: *${selectedGroup.inviteCode}*\nInscripción: *${selectedGroup.entryFee ? `$${selectedGroup.entryFee.toLocaleString()}` : "Gratis"}*\n\nRegístrate e ingresa tus pronósticos aquí: ${typeof window !== 'undefined' ? window.location.origin : ''}/?invite=${selectedGroup.inviteCode}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/20 text-[#25D366] font-bold text-[10px] rounded-lg flex items-center justify-center gap-1.5 transition-all uppercase tracking-wider"
                    >
                      💬 Compartir en WhatsApp
                    </a>
                  </div>
                </div>
              )}

              {groups.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500 bg-white/5 border border-white/5 rounded-2xl">
                  No estás en ningún grupo. Únete a uno en el Perfil para ver tablas de posiciones.
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  
                  {/* Search Bar */}
                  <input 
                    type="text"
                    placeholder="🔍 Buscar participante..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                  />

                  {/* Leaderboard Table List */}
                  <div className="space-y-3">
                    {groupMembers
                      .filter(m => m.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((member, index) => {
                        const rank = index + 1;
                        const isSelf = member.uid === user?.uid;
                        
                        let badgeColor = "bg-neutral-800 border-neutral-700 text-gray-400";
                        if (rank === 1) badgeColor = "bg-yellow-500/20 border-yellow-500/30 text-yellow-300";
                        else if (rank === 2) badgeColor = "bg-slate-300/20 border-slate-300/30 text-slate-300";
                        else if (rank === 3) badgeColor = "bg-amber-700/20 border-amber-600/30 text-amber-300";

                        return (
                          <div 
                            key={member.uid}
                            className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                              isSelf ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-300" : "bg-white/5 border-white/5"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`h-8 w-8 rounded-full border flex items-center justify-center font-bold text-xs ${badgeColor}`}>
                                #{rank}
                              </span>
                              <div>
                                <h4 className="font-bold text-sm">
                                  {member.displayName} {isSelf && "(Tú)"}
                                </h4>
                                <span className="text-[10px] text-gray-500 font-medium">
                                  Campeón: <span className="text-gray-300 font-semibold">{memberChampions[member.uid] ? `${getFlag(memberChampions[member.uid])} ${memberChampions[member.uid]}` : "Pendiente"}</span>
                                </span>
                              </div>
                            </div>
                            
                            <div className="text-right">
                               <div className="text-sm font-black font-mono">{(groupScores[member.uid]?.totalPoints || 0)} pts</div>
                               <div className="text-[9px] text-gray-500 font-mono">Exactos: {(groupScores[member.uid]?.exactGuesses || 0)}</div>
                             </div>
                          </div>
                        );
                      })}
                  </div>

                </div>
              )}

            </div>
          )}

          {/* TAB 4: GRUPOS */}
          {activeTab === "groups" && (
            <div className="space-y-6">

              <div className="space-y-1">
                <h2 className="font-bold text-sm text-gray-400 uppercase tracking-wider">Mis Grupos ({groups.length})</h2>
                {selectedGroup && (
                  <p className="text-[10px] text-gray-500">
                    Grupo activo: <span className="font-bold text-emerald-400">{selectedGroup.name}</span> · se usa en Inicio, Pronósticos y Tabla.
                  </p>
                )}
              </div>

              {groupFormError && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl text-xs">
                  {groupFormError}
                </div>
              )}

              {/* Groups list */}
              {groups.length === 0 ? (
                <p className="text-gray-500 text-xs italic">Aún no perteneces a ningún grupo. Únete con un código o crea uno nuevo abajo.</p>
              ) : (
                <div className="space-y-2">
                  {groups.map((group) => {
                    const isActive = selectedGroup?.id === group.id;
                    return (
                    <div
                      key={group.id}
                      className={`p-4 rounded-2xl space-y-3 text-xs border ${
                        isActive
                          ? "bg-emerald-500/5 border-emerald-500/30 ring-1 ring-emerald-500/20"
                          : "bg-white/5 border-white/10"
                      }`}
                    >
                      <div
                        onClick={() => router.push(`/groups/${group.id}`)}
                        className="flex justify-between items-center cursor-pointer group"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors">{group.name}</h3>
                            {isActive && (
                              <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[8px] font-black rounded-full uppercase tracking-wider shrink-0">
                                ✓ Activo
                              </span>
                            )}
                          </div>
                          <div className="text-gray-500 text-[10px] mt-1">
                            {group.members.length} / {maxMembers} miembros • Código: <span className="font-mono text-purple-400 font-bold">{group.inviteCode}</span>
                          </div>
                        </div>
                        <div className="h-8 w-8 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-emerald-600 transition-colors text-white font-bold shrink-0">
                          →
                        </div>
                      </div>
                      {!isActive && (
                        <button
                          onClick={() => handleGroupChange(group.id)}
                          className="w-full py-2 bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 text-gray-300 hover:text-emerald-300 font-bold rounded-lg transition-all text-[11px] uppercase tracking-wider"
                        >
                          Marcar como grupo activo
                        </button>
                      )}
                      <a
                        onClick={(e) => e.stopPropagation()}
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                          `¡Únete a mi grupo de apuestas en La Polla Mundial 2026! ⚽🏆\n\nGrupo: *${group.name}*\nCódigo de Invitación: *${group.inviteCode}*\nInscripción: *${group.entryFee ? `$${group.entryFee.toLocaleString()}` : "Gratis"}*\n\nRegístrate e ingresa tus pronósticos aquí: ${typeof window !== 'undefined' ? window.location.origin : ''}/?invite=${group.inviteCode}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2 bg-[#25D366] hover:bg-[#1ebe5b] text-black font-bold rounded-lg transition-all text-[11px]"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                          <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.477-.911zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                        </svg>
                        Compartir por WhatsApp
                      </a>
                    </div>
                    );
                  })}
                </div>
              )}

              {/* Join Group */}
              <div className="p-5 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider">Unirse a un Grupo</h3>
                <p className="text-[11px] text-gray-400">Ingresa el código de 6 caracteres compartido por un amigo para unirte a su grupo.</p>
                <form onSubmit={handleJoinGroup} className="space-y-3">
                  <input
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    maxLength={6}
                    placeholder="CÓDIGO DE INVITACIÓN"
                    className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase tracking-widest text-center font-mono font-bold text-sm"
                  />
                  <button
                    type="submit"
                    disabled={joinLoading}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-semibold transition-colors disabled:opacity-50 text-sm"
                  >
                    {joinLoading ? "Uniéndose..." : "Unirse al Grupo"}
                  </button>
                </form>
              </div>

              {/* Create Group */}
              <div className="p-5 bg-white/5 border border-white/10 rounded-2xl space-y-4">
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Crear un Grupo</h3>
                <p className="text-[11px] text-gray-400">Crea un grupo de apuestas privado y configura sus tarifas, reglas y premios.</p>
                <form onSubmit={handleCreateGroup} className="space-y-4">
                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Nombre del Grupo</label>
                    <input
                      type="text"
                      required
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Nombre del Grupo"
                      className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Inscripción ($)</label>
                      <input
                        type="number"
                        min="0"
                        value={entryFee}
                        onChange={(e) => setEntryFee(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-bold text-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Marcador Exacto (pts)</label>
                      <input
                        type="number"
                        min="0"
                        value={exactScorePoints}
                        onChange={(e) => setExactScorePoints(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Acertar Ganador (pts)</label>
                      <input
                        type="number"
                        min="0"
                        value={correctOutcomePoints}
                        onChange={(e) => setCorrectOutcomePoints(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Bono Predicción Única (pts)</label>
                      <input
                        type="number"
                        min="0"
                        value={uniquePredictionPoints}
                        onChange={(e) => setUniquePredictionPoints(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                      />
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-2 space-y-2">
                    <span className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider">Bonos de Fases (pts)</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Cuartos</label>
                        <input
                          type="number"
                          min="0"
                          value={quarterFinalsBonus}
                          onChange={(e) => setQuarterFinalsBonus(Number(e.target.value))}
                          className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Semis</label>
                        <input
                          type="number"
                          min="0"
                          value={semiFinalsBonus}
                          onChange={(e) => setSemiFinalsBonus(Number(e.target.value))}
                          className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Final</label>
                        <input
                          type="number"
                          min="0"
                          value={finalsBonus}
                          onChange={(e) => setFinalsBonus(Number(e.target.value))}
                          className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-2 space-y-2">
                    <span className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider">Distribución del Pozo (%)</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[8px] text-gray-400 uppercase mb-0.5">1º Lugar</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={firstPlacePercent}
                          onChange={(e) => setFirstPlacePercent(Number(e.target.value))}
                          className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs font-bold text-yellow-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] text-gray-400 uppercase mb-0.5">2º Lugar</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={secondPlacePercent}
                          onChange={(e) => setSecondPlacePercent(Number(e.target.value))}
                          className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] text-gray-400 uppercase mb-0.5">3º Lugar</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={thirdPlacePercent}
                          onChange={(e) => setThirdPlacePercent(Number(e.target.value))}
                          className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={createLoading}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold transition-colors disabled:opacity-50 text-sm"
                  >
                    {createLoading ? "Creando..." : "Crear Grupo"}
                  </button>
                </form>
              </div>

            </div>
          )}

          {/* TAB 5: PERFIL */}
          {activeTab === "profile" && (
            <div className="space-y-6">
              
              {/* Profile Card */}
              <div className="p-5 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                <h3 className="font-bold text-sm text-emerald-400 uppercase tracking-wider">Mi Perfil</h3>
                <div className="space-y-1 text-xs">
                  <div>Nombre: <span className="font-bold text-white">{dbUser?.displayName}</span></div>
                  <div>Email: <span className="font-mono text-gray-400">{user?.email}</span></div>
                  <div>Ubicación: <span className="font-medium text-white">{dbUser?.city ? `${dbUser.city}, ${dbUser.neighborhood || ""}` : "No registrada"}</span></div>
                  <div>Edad: <span className="font-bold text-white">{dbUser?.age ? `${dbUser.age} años` : "No registrada"}</span></div>
                </div>
              </div>

              {/* Push notifications enrollment */}
              <div className="p-5 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                <h3 className="font-bold text-sm text-emerald-400 uppercase tracking-wider">Notificaciones</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Recibe un aviso en tu teléfono cuando un partido está por comenzar y cuando se
                  actualiza un marcador, aunque no tengas la app abierta.
                </p>

                {pushState === "granted" ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <span>✅</span>
                    <span>Activadas en este dispositivo</span>
                    <button
                      onClick={handleEnablePush}
                      className="ml-auto text-[10px] text-gray-400 underline hover:text-gray-200"
                    >
                      Re-registrar
                    </button>
                  </div>
                ) : pushState === "denied" ? (
                  <p className="text-xs text-amber-400 leading-relaxed">
                    Has bloqueado las notificaciones. Actívalas desde los ajustes de tu navegador
                    para este sitio y vuelve a intentar.
                  </p>
                ) : pushState === "unsupported" ? (
                  <p className="text-xs text-amber-400 leading-relaxed">
                    Tu navegador no soporta notificaciones push. En iPhone, agrega la app a tu
                    pantalla de inicio (Compartir → “Agregar a inicio”) y vuelve a abrirla desde ahí.
                  </p>
                ) : pushState === "no-vapid" ? (
                  <p className="text-xs text-amber-400 leading-relaxed">
                    Las notificaciones aún no están configuradas. Inténtalo más tarde.
                  </p>
                ) : (
                  <button
                    onClick={handleEnablePush}
                    disabled={pushState === "working"}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black rounded-xl font-bold text-xs transition-all"
                  >
                    {pushState === "working" ? "Activando…" : "🔔 Activar notificaciones push"}
                  </button>
                )}

                {pushState === "error" && (
                  <p className="text-xs text-red-400">No se pudo activar. Intenta de nuevo.</p>
                )}
              </div>

              {/* Shortcut to the Grupos tab */}
              <button
                onClick={() => setActiveTab("groups")}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-xs text-emerald-400 transition-all"
              >
                👥 Gestionar mis grupos →
              </button>

            </div>
          )}

        </main>

        {/* Sticky Mobile Navigation Bar */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md h-16 bg-neutral-950/90 backdrop-blur-md border-t border-white/5 flex justify-around items-center z-50">
          
          <button 
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "home" ? "text-emerald-400 font-bold" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className="text-lg">🏠</span>
            <span className="text-[9px] uppercase tracking-wider">Inicio</span>
          </button>

          <button 
            onClick={() => setActiveTab("predictions")}
            className={`flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "predictions" ? "text-emerald-400 font-bold" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className="text-lg">📋</span>
            <span className="text-[9px] uppercase tracking-wider">Pronósticos</span>
          </button>

          <button 
            onClick={() => setActiveTab("table")}
            className={`flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "table" ? "text-emerald-400 font-bold" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className="text-lg">📊</span>
            <span className="text-[9px] uppercase tracking-wider">Tabla</span>
          </button>

          <button
            onClick={() => setActiveTab("groups")}
            className={`flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "groups" ? "text-emerald-400 font-bold" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className="text-lg">👥</span>
            <span className="text-[9px] uppercase tracking-wider">Grupos</span>
          </button>

          <button
            onClick={() => setActiveTab("profile")}
            className={`flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "profile" ? "text-emerald-400 font-bold" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className="text-lg">👤</span>
            <span className="text-[9px] uppercase tracking-wider">Perfil</span>
          </button>

        </nav>

        {/* Notifications Drawer Overlay */}
        {showNotifDrawer && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-end z-[100]">
            <div className="max-w-xs w-full h-full bg-neutral-900 border-l border-white/10 p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-350 text-white">
              
              {/* Header */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🔔</span>
                    <h3 className="text-md font-extrabold tracking-tight">Notificaciones</h3>
                  </div>
                  <button 
                    onClick={() => setShowNotifDrawer(false)}
                    className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center font-bold text-xs transition-all"
                  >
                    ✕
                  </button>
                </div>

                {/* Notifications list */}
                <div className="overflow-y-auto max-h-[75vh] pr-1 space-y-3 scrollbar-thin">

                  {/* Injected client-side "match starting soon" alerts (ephemeral) */}
                  {startingSoonMatches.map(({ match: m, hasPred }) => {
                    const minsLeft = Math.max(0, Math.round((kickoffMsOf(m) - now) / (1000 * 60)));
                    return (
                      <div
                        key={`soon_${m.id}`}
                        className={`p-3.5 rounded-xl space-y-1 relative cursor-pointer transition-all border ${
                          hasPred
                            ? "bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15"
                            : "bg-red-500/10 border-red-500/20 hover:bg-red-500/15"
                        }`}
                        onClick={() => {
                          setShowNotifDrawer(false);
                          setActiveTab("predictions");
                        }}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className={`text-[10px] font-black uppercase tracking-wider ${hasPred ? "text-amber-400" : "text-red-400"}`}>
                            {hasPred ? "Comienza pronto ⏰" : "¡Comienza pronto! ⏰"}
                          </span>
                          <span className={`h-1.5 w-1.5 rounded-full ${hasPred ? "bg-amber-500" : "bg-red-500"}`}></span>
                        </div>
                        <p className="text-xs font-semibold text-white leading-relaxed">
                          {hasPred
                            ? `El partido ${m.homeTeam} vs ${m.awayTeam} comienza pronto.`
                            : `No has ingresado pronóstico para ${m.homeTeam} vs ${m.awayTeam}, ¡y comienza pronto!`}
                        </p>
                        <span className="block text-[8px] text-gray-400 font-medium">
                          {minsLeft <= 1 ? "Comienza en menos de 1 min" : `Comienza en ${minsLeft} min`}
                        </span>
                      </div>
                    );
                  })}

                  {/* Injected client-side missing prediction alerts */}
                  {missingPredictions24h.map((m) => (
                    <div 
                      key={`missing_${m.id}`}
                      className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl space-y-1 relative cursor-pointer hover:bg-red-500/15 transition-all"
                      onClick={() => {
                        setShowNotifDrawer(false);
                        setActiveTab("predictions");
                      }}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">¡Recordatorio! ⏰</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                      </div>
                      <p className="text-xs font-semibold text-white leading-relaxed">
                        No has ingresado pronóstico para el partido {m.homeTeam} vs {m.awayTeam} que inicia pronto.
                      </p>
                      <span className="block text-[8px] text-gray-400 font-medium">Inicia en menos de 24 horas</span>
                    </div>
                  ))}

                  {/* Standard stored Firestore notifications */}
                  {notifications.length === 0 && missingPredictions24h.length === 0 && startingSoonMatches.length === 0 ? (
                    <div className="py-12 text-center text-xs text-gray-500 italic">
                      No tienes notificaciones en este momento.
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const notifTime = toMs(n.timestamp) || now;
                      
                      return (
                        <div 
                          key={n.id}
                          className={`p-3.5 bg-white/5 border border-white/5 rounded-xl space-y-1 relative transition-all ${
                            !n.read ? 'border-emerald-500/20 bg-emerald-500/5' : ''
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                              {n.title || "Notificación 🔔"}
                            </span>
                            {!n.read && (
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                            )}
                          </div>
                          <p className="text-xs text-gray-300 leading-relaxed font-medium">
                            {n.message}
                          </p>
                          <span className="block text-[8px] text-gray-500 font-medium">
                            {new Date(notifTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(notifTime).toLocaleDateString()}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Drawer footer close button */}
              <div className="border-t border-white/5 pt-4">
                <button 
                  onClick={() => setShowNotifDrawer(false)}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold text-xs rounded-xl transition-all"
                >
                  Cerrar Panel
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
