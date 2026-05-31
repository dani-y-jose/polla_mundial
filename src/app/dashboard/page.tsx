"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
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
import { Match, Prediction, User, Group } from "@/types";
import { calculateGroupScores } from "@/lib/scoring";
import { getFlag } from "@/lib/flags";
import { isChampionLocked } from "@/lib/config";

type Tab = "home" | "predictions" | "table" | "profile";

const WORLD_CUP_TEAMS = [
  "Argentina", "Brasil", "Canadá", "Estados Unidos", "México", "España", "Francia", 
  "Alemania", "Inglaterra", "Italia", "Portugal", "Países Bajos", "Uruguay", "Colombia",
  "Ecuador", "Chile", "Marruecos", "Japón", "Bélgica", "Croacia", "Senegal"
].sort();

const PHASE_TRANSLATIONS: Record<string, string> = {
  group: "Fase de Grupos",
  round_of_16: "Octavos de Final",
  quarter_finals: "Cuartos de Final",
  semi_finals: "Semifinales",
  finals: "Gran Final"
};

const RESOLUTION_TRANSLATIONS: Record<string, string> = {
  normal: "90 Minutos",
  extra_time: "Tiempo Extra",
  penalties: "Penales"
};

export default function UnifiedDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  
  // Data State
  const [user, setUser] = useState<any>(null);
  const [dbUser, setDbUser] = useState<any>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<User[]>([]);
  
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  
  // Form/Local States
  const [loading, setLoading] = useState(true);
  const [savingPrediction, setSavingPrediction] = useState<Record<string, boolean>>({});
  const [selectedChampion, setSelectedChampion] = useState("");
  const [championSaved, setChampionSaved] = useState(false);
  const [predictionFilter, setPredictionFilter] = useState<"all" | "group" | "round_of_16" | "quarter_finals" | "semi_finals" | "finals">("all");
  const [predictionPage, setPredictionPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Group Management States
  const [newGroupName, setNewGroupName] = useState("");
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [groupActionLoading, setGroupActionLoading] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [groupScores, setGroupScores] = useState<Record<string, { totalPoints: number; exactGuesses: number }>>({});
  const [createdGroup, setCreatedGroup] = useState<Group | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);

  // New Group Config States
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

  const router = useRouter();

  useEffect(() => {
    let unsubscribeNotifs: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
        return;
      }
      setUser(currentUser);
      await loadAllData(currentUser.uid);

      // Listen to notifications in real-time
      const notifsQuery = collection(db, "users", currentUser.uid, "notifications");
      unsubscribeNotifs = onSnapshot(notifsQuery, (snapshot) => {
        const notifsData: any[] = [];
        snapshot.forEach((doc) => {
          notifsData.push({ id: doc.id, ...doc.data() });
        });
        notifsData.sort((a, b) => {
          const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : (a.timestamp ? (a.timestamp as any).toMillis?.() || new Date(a.timestamp).getTime() : 0);
          const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : (b.timestamp ? (b.timestamp as any).toMillis?.() || new Date(b.timestamp).getTime() : 0);
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
  }, [router]);

  // Auto-Lock Scheduler for User Dashboard
  useEffect(() => {
    if (matches.length === 0) return;

    const interval = setInterval(async () => {
      const now = Date.now();
      let updatedSome = false;
      const updatedMatches = [...matches];

      for (let i = 0; i < updatedMatches.length; i++) {
        const m = updatedMatches[i];
        const kickoffMs = m.kickoffTime instanceof Date ? m.kickoffTime.getTime() : (m.kickoffTime as any).toMillis();
        
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
  const loadAllData = async (uid: string) => {
    try {
      setLoading(true);

      // 1. Fetch User profile document
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setDbUser(userData);
        if (userData.champion) {
          setSelectedChampion(userData.champion);
          setChampionSaved(true);
        }
      }

      // 2. Fetch User's Groups
      const groupQuery = query(collection(db, "groups"), where("members", "array-contains", uid));
      const groupSnapshot = await getDocs(groupQuery);
      const groupsData: Group[] = [];
      groupSnapshot.forEach((doc) => {
        groupsData.push({ id: doc.id, ...doc.data() } as Group);
      });
      setGroups(groupsData);
      
      if (groupsData.length > 0) {
        // Default to first group
        setSelectedGroup(groupsData[0]);
        await loadGroupLeaderboard(groupsData[0]);
      }

      // 3. Fetch Matches
      const matchesSnapshot = await getDocs(collection(db, "matches"));
      const matchesData: Match[] = [];
      matchesSnapshot.forEach((doc) => {
        matchesData.push({ id: doc.id, ...doc.data() } as Match);
      });
      matchesData.sort((a, b) => {
        const timeA = a.kickoffTime instanceof Date ? a.kickoffTime.getTime() : (a.kickoffTime as any).toMillis();
        const timeB = b.kickoffTime instanceof Date ? b.kickoffTime.getTime() : (b.kickoffTime as any).toMillis();
        return timeA - timeB;
      });
      setMatches(matchesData);

      // 4. Fetch User's Predictions
      const predsQuery = query(collection(db, "predictions"), where("userId", "==", uid));
      const predsSnapshot = await getDocs(predsQuery);
      const predsData: Record<string, Prediction> = {};
      predsSnapshot.forEach((doc) => {
        const data = doc.data() as Prediction;
        predsData[data.matchId] = data;
      });
      setPredictions(predsData);

    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load member profiles for leaderboard
  const loadGroupLeaderboard = async (group: Group) => {
    try {
      const membersData: User[] = [];
      // Fetch members in chunks of 10 (Firestore limitations)
      for (let i = 0; i < group.members.length; i += 10) {
        const chunk = group.members.slice(i, i + 10);
        const uQuery = query(collection(db, "users"), where("uid", "in", chunk));
        const uSnapshot = await getDocs(uQuery);
        uSnapshot.forEach((doc) => {
          membersData.push({ uid: doc.id, ...doc.data() } as User);
        });
      }

      // Fetch Predictions made by any of the group members
      const predsData: Prediction[] = [];
      for (let i = 0; i < group.members.length; i += 10) {
        const chunk = group.members.slice(i, i + 10);
        const pQuery = query(collection(db, "predictions"), where("userId", "in", chunk));
        const pSnapshot = await getDocs(pQuery);
        pSnapshot.forEach((doc) => {
          predsData.push({ id: doc.id, ...doc.data() } as Prediction);
        });
      }

      // Default Group scoring rules
      const defaultRules = {
        exactScorePoints: 3,
        correctOutcomePoints: 1,
        uniquePredictionPoints: 0,
        quarterFinalsBonus: 0,
        semiFinalsBonus: 0,
        finalsBonus: 0
      };
      const activeRules = group.rules || defaultRules;
      const calculatedScores = calculateGroupScores(group.members, matches, predsData, activeRules);
      setGroupScores(calculatedScores);

      // Sort by dynamic group-specific totalPoints desc, then exactGuesses desc
      membersData.sort((a, b) => {
        const scoreA = calculatedScores[a.uid] || { totalPoints: 0, exactGuesses: 0 };
        const scoreB = calculatedScores[b.uid] || { totalPoints: 0, exactGuesses: 0 };
        if (scoreB.totalPoints !== scoreA.totalPoints) return scoreB.totalPoints - scoreA.totalPoints;
        return scoreB.exactGuesses - scoreA.exactGuesses;
      });
      setGroupMembers(membersData);
    } catch (err) {
      console.error("Error loading leaderboard:", err);
    }
  };

  const handleGroupChange = async (groupId: string) => {
    const selected = groups.find(g => g.id === groupId);
    if (selected) {
      setSelectedGroup(selected);
      await loadGroupLeaderboard(selected);
    }
  };

  const handleSaveChampion = async () => {
    if (!selectedChampion || !user) return;
    if (isChampionLocked()) {
      alert("El plazo para elegir o cambiar de campeón ya finalizó.");
      return;
    }
    try {
      await updateDoc(doc(db, "users", user.uid), {
        champion: selectedChampion
      });
      setChampionSaved(true);
      setDbUser((prev: any) => ({ ...prev, champion: selectedChampion }));
      alert("¡Campeón guardado con éxito!");
    } catch (err) {
      console.error(err);
      alert("Error al guardar el campeón.");
    }
  };

  // Reset to the first page whenever the phase filter changes.
  useEffect(() => {
    setPredictionPage(1);
  }, [predictionFilter]);

  const handlePredictionChange = (matchId: string, team: "home" | "away", scoreStr: string) => {
    // Keep only digits and allow an empty value so the field can be cleared.
    const sanitized = scoreStr.replace(/\D/g, "").slice(0, 2);

    setPredictions((prev) => {
      const existing = prev[matchId] || {
        matchId,
        userId: user.uid,
        predictedHomeScore: "",
        predictedAwayScore: "",
        pointsEarned: null,
      };

      return {
        ...prev,
        [matchId]: {
          ...existing,
          [team === "home" ? "predictedHomeScore" : "predictedAwayScore"]: sanitized,
        },
      };
    });
  };

  const submitPrediction = async (matchId: string) => {
    // Block if user is in 0 groups
    if (groups.length === 0) {
      alert("Para ingresar pronósticos debes unirte a un grupo primero.");
      return;
    }

    const prediction = predictions[matchId];
    if (!prediction) return;

    // Both scores must be filled in before saving.
    const homeRaw = `${prediction.predictedHomeScore}`;
    const awayRaw = `${prediction.predictedAwayScore}`;
    if (homeRaw === "" || awayRaw === "") {
      alert("Ingresa ambos marcadores antes de guardar.");
      return;
    }
    const home = Number(homeRaw);
    const away = Number(awayRaw);

    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

    const kickoffMs = match.kickoffTime instanceof Date ? match.kickoffTime.getTime() : (match.kickoffTime as any).toMillis();
    if (Date.now() >= kickoffMs || match.status === "locked" || match.status === "finished") {
      alert("¡Este partido ya está cerrado!");
      return;
    }

    setSavingPrediction(prev => ({ ...prev, [matchId]: true }));
    try {
      const predId = prediction.id || `${user.uid}_${matchId}`;
      const payload: Prediction = {
        ...prediction,
        predictedHomeScore: home,
        predictedAwayScore: away,
        id: predId,
        timestamp: new Date(),
      };
      
      await setDoc(doc(db, "predictions", predId), payload);
      setPredictions(prev => ({ ...prev, [matchId]: payload }));
    } catch (err) {
      console.error("Error saving prediction:", err);
      alert("Error al guardar el pronóstico.");
    } finally {
      setSavingPrediction(prev => ({ ...prev, [matchId]: false }));
    }
  };

  // Group creation/joining inside the app shell
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !user) return;
    setGroupActionLoading(true);
    setGroupError("");

    try {
      if (firstPlacePercent + secondPlacePercent + thirdPlacePercent !== 100) {
        setGroupError("La distribución de premios debe sumar exactamente 100%.");
        setGroupActionLoading(false);
        return;
      }

      const groupId = `group_${Date.now()}`;
      const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      const newGroup: Group = {
        id: groupId,
        name: newGroupName.trim(),
        creatorId: user.uid,
        inviteCode: code,
        members: [user.uid],
        createdAt: new Date(),
        entryFee: Number(entryFee),
        rules: {
          exactScorePoints: Number(exactScorePoints),
          correctOutcomePoints: Number(correctOutcomePoints),
          uniquePredictionPoints: Number(uniquePredictionPoints),
          quarterFinalsBonus: Number(quarterFinalsBonus),
          semiFinalsBonus: Number(semiFinalsBonus),
          finalsBonus: Number(finalsBonus),
        },
        prizeDistribution: {
          firstPlacePercent: Number(firstPlacePercent),
          secondPlacePercent: Number(secondPlacePercent),
          thirdPlacePercent: Number(thirdPlacePercent),
        }
      };

      const batch = writeBatch(db);
      batch.set(doc(db, "groups", groupId), newGroup);
      batch.set(doc(db, "inviteCodes", code), { code, groupId });
      await batch.commit();
      const updatedGroups = [...groups, newGroup];
      setGroups(updatedGroups);
      setSelectedGroup(newGroup);
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
      await loadGroupLeaderboard(newGroup);
      setActiveTab("table"); // Switch to Leaderboard tab
      setCreatedGroup(newGroup);
    } catch (err: any) {
      console.error(err);
      setGroupError("Error al crear el grupo.");
    } finally {
      setGroupActionLoading(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinInviteCode.trim().toUpperCase();
    if (!cleanCode || !user) return;
    setGroupActionLoading(true);
    setGroupError("");

    try {
      const codeSnap = await getDoc(doc(db, "inviteCodes", cleanCode));
      if (!codeSnap.exists()) {
        setGroupError("Código de invitación inválido.");
        setGroupActionLoading(false);
        return;
      }

      const { groupId } = codeSnap.data() as { groupId: string };

      // Already a member? Just open it.
      const alreadyMember = groups.find((g) => g.id === groupId);
      if (alreadyMember) {
        setSelectedGroup(alreadyMember);
        await loadGroupLeaderboard(alreadyMember);
        setActiveTab("table");
        setJoinInviteCode("");
        return;
      }

      // Adding only ourselves is permitted before we can read the group.
      await updateDoc(doc(db, "groups", groupId), {
        members: arrayUnion(user.uid),
      });

      // Now that we are a member we can read the full group document.
      const groupSnap = await getDoc(doc(db, "groups", groupId));
      const updatedGroup = { id: groupSnap.id, ...groupSnap.data() } as Group;
      setGroups([...groups, updatedGroup]);
      setSelectedGroup(updatedGroup);
      await loadGroupLeaderboard(updatedGroup);
      setActiveTab("table");
      setJoinInviteCode("");
      alert(`¡Te has unido a "${updatedGroup.name}"!`);
    } catch (err: any) {
      console.error(err);
      setGroupError("Error al unirse al grupo.");
    } finally {
      setGroupActionLoading(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-gray-400 text-sm">Cargando Polla 2026...</span>
        </div>
      </div>
    );
  }

  // Calculate stats for home view countdowns
  const nextMatch = matches.find(m => m.status === "upcoming");
  let countdownText = "";
  if (nextMatch) {
    const kickoffMs = nextMatch.kickoffTime instanceof Date ? nextMatch.kickoffTime.getTime() : (nextMatch.kickoffTime as any).toMillis();
    const diff = kickoffMs - Date.now();
    if (diff > 0) {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      countdownText = `Cierra en ${days}d ${hours}h`;
    }
  }

  // Real-time missing prediction calculations inside the next 24 hours
  const missingPredictions24h = matches.filter(m => {
    if (m.status !== "upcoming") return false;
    const kickoffMs = m.kickoffTime instanceof Date ? m.kickoffTime.getTime() : (m.kickoffTime as any).toMillis();
    const diffHours = (kickoffMs - Date.now()) / (1000 * 60 * 60);
    const hasPred = predictions[m.id] !== undefined;
    return diffHours > 0 && diffHours <= 24 && !hasPred;
  });

  const unreadCount = notifications.filter(n => !n.read).length + missingPredictions24h.length;

  // Paginate the predictions list so the bottom of the page stays reachable.
  const PREDICTIONS_PER_PAGE = 10;
  const filteredPredictionMatches = matches.filter(m =>
    predictionFilter === "all" ? true : m.phase === predictionFilter
  );
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
              
              {/* Champion Card */}
              <div className="p-6 bg-gradient-to-br from-emerald-600 to-indigo-900 rounded-2xl border border-white/10 shadow-lg space-y-4">
                <div>
                  <span className="text-[10px] tracking-wider font-extrabold uppercase text-emerald-300">TU CAMPEÓN</span>
                  {championSaved ? (
                    <div className="mt-1 flex items-center justify-between">
                      <h2 className="text-3xl font-black text-white tracking-tight">{selectedChampion}</h2>
                      <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold rounded-full uppercase">
                        ✓ Guardado
                      </span>
                    </div>
                  ) : isChampionLocked() ? (
                    <p className="mt-2 text-xs text-white/80 font-medium">
                      El plazo para elegir campeón ya finalizó.
                    </p>
                  ) : (
                    <div className="space-y-3 mt-2">
                      <select
                        value={selectedChampion}
                        onChange={(e) => setSelectedChampion(e.target.value)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      >
                        <option value="">Selecciona tu campeón...</option>
                        {WORLD_CUP_TEAMS.map(team => <option key={team} value={team}>{team}</option>)}
                      </select>
                      <button
                        onClick={handleSaveChampion}
                        disabled={!selectedChampion}
                        className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold rounded-xl transition-all"
                      >
                        Guardar Elección
                      </button>
                    </div>
                  )}
                </div>
                {championSaved && (
                  <p className="text-[10px] text-emerald-300/80 italic font-medium border-t border-white/5 pt-2">
                    Las predicciones de campeón quedan guardadas y bloqueadas.
                  </p>
                )}
              </div>

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
                        <strong className="text-purple-300 font-bold">Activa tus Pronósticos:</strong> Para apostar y sumar puntos, debes crear un nuevo grupo privado o unirte al de un amigo.
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
                      onClick={() => setActiveTab("profile")}
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-[10px] rounded-xl transition-all uppercase tracking-wider text-center"
                    >
                      👥 Crear o Unirse a un Grupo
                    </button>
                  </div>
                </div>
              )}

              {/* Today's Match Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wider">Partidos Destacados</h3>
                  {countdownText && (
                    <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded">
                      {countdownText}
                    </span>
                  )}
                </div>

                {nextMatch ? (
                  <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center gap-4">
                    <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">{(PHASE_TRANSLATIONS[nextMatch.phase] || nextMatch.phase).toUpperCase()}</div>
                    <div className="flex items-center justify-between w-full text-center gap-2">
                      <div className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-2xl">{getFlag(nextMatch.homeTeam)}</span>
                        <span className="font-bold text-xs truncate">{nextMatch.homeTeam}</span>
                      </div>
                      <span className="text-xs text-gray-500 font-bold shrink-0">vs</span>
                      <div className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-2xl">{getFlag(nextMatch.awayTeam)}</span>
                        <span className="font-bold text-xs truncate">{nextMatch.awayTeam}</span>
                      </div>
                    </div>
                    <div className="text-center text-[10px] text-gray-500">
                      {nextMatch.stadiumName}, {nextMatch.city}
                    </div>
                    <button 
                      onClick={() => setActiveTab("predictions")}
                      className="w-full py-2.5 bg-white/10 hover:bg-white/20 border border-white/5 text-xs font-bold rounded-xl transition-all"
                    >
                      → Ir a Pronósticos
                    </button>
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500 text-xs bg-white/5 border border-white/5 rounded-2xl">
                    No hay próximos partidos programados.
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: PRONÓSTICOS */}
          {activeTab === "predictions" && (
            <div className="space-y-4">
              
              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 justify-center border-b border-white/5 pb-4">
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
                    const kickoffMs = match.kickoffTime instanceof Date ? match.kickoffTime.getTime() : (match.kickoffTime as any).toMillis();
                    const isLocked = Date.now() >= kickoffMs || match.status === "locked" || match.status === "finished";
                    const pred = predictions[match.id] || { predictedHomeScore: "", predictedAwayScore: "" };

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
                          <span className="text-[9px] text-gray-400">{new Date(kickoffMs).toLocaleString()}</span>
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
                              <button
                                onClick={() => submitPrediction(match.id)}
                                disabled={savingPrediction[match.id]}
                                className="px-6 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 text-[10px] font-bold rounded-lg transition-all"
                              >
                                {savingPrediction[match.id] ? "..." : "✓ Guardar"}
                              </button>
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
              {groups.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Grupo de Posiciones</label>
                  <select 
                    value={selectedGroup?.id || ""} 
                    onChange={(e) => handleGroupChange(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold text-emerald-400"
                  >
                    {groups.map(group => (
                      <option key={group.id} value={group.id} className="bg-neutral-950 text-white">
                        {group.name} ({group.inviteCode})
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                        `¡Únete a mi grupo de apuestas en La Polla Mundial 2026! ⚽🏆\n\nGrupo: *${selectedGroup.name}*\nCódigo de Invitación: *${selectedGroup.inviteCode}*\nInscripción: *${selectedGroup.entryFee ? `$${selectedGroup.entryFee.toLocaleString()}` : "Gratis"}*\n\nRegístrate e ingresa tus pronósticos aquí: ${typeof window !== 'undefined' ? window.location.origin : ''}/login?gcode=${selectedGroup.inviteCode}`
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
                        const isSelf = member.uid === user.uid;
                        
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
                                  Campeón: <span className="text-gray-300 font-semibold">{member.champion || "Pendiente"}</span>
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

          {/* TAB 4: PERFIL & GROUPS */}
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

              {/* Group Management Errors */}
              {groupError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl text-xs">
                  {groupError}
                </div>
              )}

              {/* Groups call-to-action header */}
              <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-white tracking-tight">⚽ Juega con tus amigos</h2>
                <p className="text-[11px] text-gray-400">Únete a un grupo con un código o crea el tuyo para competir por el pozo.</p>
              </div>

              {/* Create/Join Panels */}
              <div className="grid grid-cols-1 gap-4">

                {/* Join Group Card */}
                <div className="p-5 bg-gradient-to-br from-purple-600/20 to-purple-900/10 border border-purple-500/30 rounded-2xl space-y-3 shadow-lg">
                  <h3 className="flex items-center gap-2 font-extrabold text-base text-purple-300">
                    <span className="text-xl">🔑</span> Unirse a un Grupo
                  </h3>
                  <form onSubmit={handleJoinGroup} className="flex gap-2">
                    <input 
                      type="text"
                      required
                      value={joinInviteCode}
                      onChange={(e) => setJoinInviteCode(e.target.value)}
                      maxLength={6}
                      placeholder="CÓDIGO"
                      className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500 uppercase tracking-widest text-center font-mono font-bold text-sm"
                    />
                    <button 
                      type="submit"
                      disabled={groupActionLoading}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
                    >
                      Unirse
                    </button>
                  </form>
                </div>

                {/* Create Group Card */}
                <div className="p-5 bg-gradient-to-br from-emerald-600/20 to-emerald-900/10 border border-emerald-500/30 rounded-2xl space-y-3 shadow-lg">
                  <h3 className="flex items-center gap-2 font-extrabold text-base text-emerald-300">
                    <span className="text-xl">➕</span> Crear un Grupo
                  </h3>
                  <form onSubmit={handleCreateGroup} className="space-y-4">
                    <div>
                      <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Nombre del Grupo</label>
                      <input 
                        type="text"
                        required
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Nombre de tu Polla"
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Inscripción al Pozo ($)</label>
                        <input 
                          type="number"
                          min="0"
                          value={entryFee}
                          onChange={(e) => setEntryFee(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-bold text-emerald-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Marcador Exacto (pts)</label>
                        <input 
                          type="number"
                          min="0"
                          value={exactScorePoints}
                          onChange={(e) => setExactScorePoints(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Acertar Ganador (pts)</label>
                        <input 
                          type="number"
                          min="0"
                          value={correctOutcomePoints}
                          onChange={(e) => setCorrectOutcomePoints(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Bono Predicción Única (pts)</label>
                        <input 
                          type="number"
                          min="0"
                          value={uniquePredictionPoints}
                          onChange={(e) => setUniquePredictionPoints(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                        />
                      </div>
                    </div>

                    <div className="border-t border-white/5 pt-2 space-y-2">
                      <span className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider">Bonos por Rondas Completas</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Cuartos</label>
                          <input 
                            type="number"
                            min="0"
                            value={quarterFinalsBonus}
                            onChange={(e) => setQuarterFinalsBonus(Number(e.target.value))}
                            className="w-full px-2 py-1 bg-black/40 border border-white/10 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Semis</label>
                          <input 
                            type="number"
                            min="0"
                            value={semiFinalsBonus}
                            onChange={(e) => setSemiFinalsBonus(Number(e.target.value))}
                            className="w-full px-2 py-1 bg-black/40 border border-white/10 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Final</label>
                          <input 
                            type="number"
                            min="0"
                            value={finalsBonus}
                            onChange={(e) => setFinalsBonus(Number(e.target.value))}
                            className="w-full px-2 py-1 bg-black/40 border border-white/10 rounded-lg text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-white/5 pt-2 space-y-2">
                      <span className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider">Distribución del Pozo</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[8px] text-gray-400 uppercase mb-0.5">1º Puesto (%)</label>
                          <input 
                            type="number"
                            min="0"
                            max="100"
                            value={firstPlacePercent}
                            onChange={(e) => setFirstPlacePercent(Number(e.target.value))}
                            className="w-full px-2 py-1 bg-black/40 border border-white/10 rounded-lg text-xs font-bold text-yellow-400"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] text-gray-400 uppercase mb-0.5">2º Puesto (%)</label>
                          <input 
                            type="number"
                            min="0"
                            max="100"
                            value={secondPlacePercent}
                            onChange={(e) => setSecondPlacePercent(Number(e.target.value))}
                            className="w-full px-2 py-1 bg-black/40 border border-white/10 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] text-gray-400 uppercase mb-0.5">3º Puesto (%)</label>
                          <input 
                            type="number"
                            min="0"
                            max="100"
                            value={thirdPlacePercent}
                            onChange={(e) => setThirdPlacePercent(Number(e.target.value))}
                            className="w-full px-2 py-1 bg-black/40 border border-white/10 rounded-lg text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={groupActionLoading}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
                    >
                      {groupActionLoading ? "Creando..." : "Crear Grupo de Apuestas"}
                    </button>
                  </form>
                </div>

              </div>

              {/* List of my groups in profile */}
              <div className="space-y-3">
                <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wider">Mis Grupos Activos</h3>
                {groups.length === 0 ? (
                  <p className="text-gray-500 text-xs italic">Aún no perteneces a ningún grupo.</p>
                ) : (
                  <div className="space-y-2">
                    {groups.map(g => (
                      <div
                        key={g.id}
                        className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-3 text-xs"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-bold text-white text-sm">{g.name}</span>
                            <div className="text-gray-500 text-[10px] mt-1">{g.members.length} miembros</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-gray-500">CÓDIGO DE INVITACIÓN</div>
                            <div className="font-mono font-bold text-purple-400 text-sm tracking-wider">{g.inviteCode}</div>
                          </div>
                        </div>
                        <a
                          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                            `¡Únete a mi grupo de apuestas en La Polla Mundial 2026! ⚽🏆\n\nGrupo: *${g.name}*\nCódigo de Invitación: *${g.inviteCode}*\nInscripción: *${g.entryFee ? `$${g.entryFee.toLocaleString()}` : "Gratis"}*\n\nRegístrate e ingresa tus pronósticos aquí: ${typeof window !== 'undefined' ? window.location.origin : ''}/login?gcode=${g.inviteCode}`
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
                    ))}
                  </div>
                )}
              </div>

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
            onClick={() => setActiveTab("profile")}
            className={`flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "profile" ? "text-emerald-400 font-bold" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className="text-lg">👤</span>
            <span className="text-[9px] uppercase tracking-wider">Perfil</span>
          </button>

        </nav>

        {/* Success Creation Modal with WhatsApp Link */}
        {createdGroup && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="max-w-sm w-full bg-neutral-900 border border-white/10 p-6 rounded-2xl space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-white">
              <div className="text-center space-y-2">
                <span className="text-4xl">🏆</span>
                <h3 className="text-lg font-bold text-emerald-400">¡Grupo Creado!</h3>
                <p className="text-xs text-gray-400">Comparte tu grupo de apuestas en WhatsApp para invitar a tus amigos.</p>
              </div>

              <div className="bg-black/40 p-4 rounded-xl border border-white/5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Grupo:</span>
                  <span className="font-bold text-white">{createdGroup.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Código:</span>
                  <span className="font-mono font-bold text-purple-400 text-sm tracking-wider">{createdGroup.inviteCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Inscripción:</span>
                  <span className="font-bold text-emerald-400">
                    {createdGroup.entryFee ? `$${createdGroup.entryFee.toLocaleString()}` : "Gratis"}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <a 
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `¡Únete a mi grupo de apuestas en La Polla Mundial 2026! ⚽🏆\n\nGrupo: *${createdGroup.name}*\nCódigo de Invitación: *${createdGroup.inviteCode}*\nInscripción: *${createdGroup.entryFee ? `$${createdGroup.entryFee.toLocaleString()}` : "Gratis"}*\n\nRegístrate e ingresa tus pronósticos aquí: ${typeof window !== 'undefined' ? window.location.origin : ''}/login?gcode=${createdGroup.inviteCode}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-[#25D366] hover:bg-[#20ba56] text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all font-sans"
                >
                  <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                    <path d="M12.012 1.985c-5.522 0-10 4.478-10 10 0 1.772.463 3.518 1.342 5.062L2.012 22.015l5.127-1.342a9.92 9.92 0 0 0 4.873 1.28c5.522 0 10-4.478 10-10 0-5.522-4.478-10-10-10zm-.012 1.5c4.687 0 8.5 3.813 8.5 8.5s-3.813 8.5-8.5 8.5a8.423 8.423 0 0 1-4.14-1.09l-.297-.176-3.08.808.82-3.003-.193-.307A8.441 8.441 0 0 1 3.5 11.985c0-4.687 3.813-8.5 8.5-8.5zm-3.666 3.86a.916.916 0 0 0-.646.3c-.22.235-.58.643-.58 1.488s.614 1.666.7 1.784c.086.117 1.18 1.91 2.937 2.585.418.16.744.256.998.337.42.13.8.113 1.102.068.337-.05 1.037-.425 1.182-.835s.145-.765.1-.835c-.045-.07-.164-.117-.344-.207s-1.037-.512-1.197-.57-.275-.086-.39.085c-.117.17-.45.57-.55.683-.1.117-.2.13-.38.04-1.74-.87-2.316-1.782-2.52-2.13-.086-.152-.01-.235.066-.31.068-.068.152-.178.228-.266.075-.09.1-.152.152-.255a.35.35 0 0 0-.018-.344c-.045-.09-.39-.938-.535-1.287-.14-.34-.296-.29-.406-.296-.105-.005-.226-.005-.347-.005z"/>
                  </svg>
                  Compartir en WhatsApp
                </a>
                
                <button 
                  onClick={() => setCreatedGroup(null)}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold text-[10px] rounded-xl transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

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
                  {notifications.length === 0 && missingPredictions24h.length === 0 ? (
                    <div className="py-12 text-center text-xs text-gray-500 italic">
                      No tienes notificaciones en este momento.
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const notifTime = n.timestamp instanceof Date ? n.timestamp : (n.timestamp ? (n.timestamp as any).toMillis?.() || new Date(n.timestamp).getTime() : Date.now());
                      
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
