"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc, query, where, updateDoc } from "firebase/firestore";
import { Group, User, Match, Prediction } from "@/types";
import { calculateGroupScores, getOutcome } from "@/lib/scoring";

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

export default function GroupDetailPage() {
  const params = useParams();
  const groupId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [creatorName, setCreatorName] = useState("");
  const [members, setMembers] = useState<User[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allPredictions, setAllPredictions] = useState<Prediction[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [groupScores, setGroupScores] = useState<Record<string, { totalPoints: number; exactGuesses: number }>>({});

  // Group Settings Editor States
  const [editEntryFee, setEditEntryFee] = useState(0);
  const [editExactScorePoints, setEditExactScorePoints] = useState(3);
  const [editCorrectOutcomePoints, setEditCorrectOutcomePoints] = useState(1);
  const [editUniquePredictionPoints, setEditUniquePredictionPoints] = useState(0);
  const [editQuarterFinalsBonus, setEditQuarterFinalsBonus] = useState(0);
  const [editSemiFinalsBonus, setEditSemiFinalsBonus] = useState(0);
  const [editFinalsBonus, setEditFinalsBonus] = useState(0);
  const [editFirstPlacePercent, setEditFirstPlacePercent] = useState(50);
  const [editSecondPlacePercent, setEditSecondPlacePercent] = useState(30);
  const [editThirdPlacePercent, setEditThirdPlacePercent] = useState(20);
  const [editLoading, setEditLoading] = useState(false);
  const [editSuccess, setEditSuccess] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("created") === "true") {
        setShowSuccessModal(true);
        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: cleanUrl }, "", cleanUrl);
      }
    }
  }, []);

  useEffect(() => {
    if (!groupId) return;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
        return;
      }
      setUser(currentUser);

      try {
        // 1. Fetch Group Details
        const groupDoc = await getDoc(doc(db, "groups", groupId));
        if (!groupDoc.exists()) {
          setError("Grupo no encontrado.");
          setLoading(false);
          return;
        }

        const groupData = { id: groupDoc.id, ...groupDoc.data() } as Group;
        setGroup(groupData);

        // Fetch Creator's Display Name
        const creatorDoc = await getDoc(doc(db, "users", groupData.creatorId));
        if (creatorDoc.exists()) {
          setCreatorName((creatorDoc.data() as User).displayName);
        } else {
          setCreatorName("Desconocido");
        }

        // Verify membership
        if (!groupData.members.includes(currentUser.uid)) {
          setError("No eres miembro de este grupo.");
          setLoading(false);
          return;
        }

        // Initialize edit states
        setEditEntryFee(groupData.entryFee || 0);
        setEditExactScorePoints(groupData.rules?.exactScorePoints ?? 3);
        setEditCorrectOutcomePoints(groupData.rules?.correctOutcomePoints ?? 1);
        setEditUniquePredictionPoints(groupData.rules?.uniquePredictionPoints ?? 0);
        setEditQuarterFinalsBonus(groupData.rules?.quarterFinalsBonus ?? 0);
        setEditSemiFinalsBonus(groupData.rules?.semiFinalsBonus ?? 0);
        setEditFinalsBonus(groupData.rules?.finalsBonus ?? 0);
        setEditFirstPlacePercent(groupData.prizeDistribution?.firstPlacePercent ?? 50);
        setEditSecondPlacePercent(groupData.prizeDistribution?.secondPlacePercent ?? 30);
        setEditThirdPlacePercent(groupData.prizeDistribution?.thirdPlacePercent ?? 20);

        // 2. Fetch Group Members' User profiles
        // Note: Firestore 'in' query allows up to 30 items
        const membersData: User[] = [];
        const chunks = [];
        for (let i = 0; i < groupData.members.length; i += 10) {
          chunks.push(groupData.members.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const uQuery = query(collection(db, "users"), where("uid", "in", chunk));
          const uSnapshot = await getDocs(uQuery);
          uSnapshot.forEach((doc) => {
            membersData.push({ uid: doc.id, ...doc.data() } as User);
          });
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

        // 4. Fetch Predictions made by any of the group members
        const predsData: Prediction[] = [];
        for (const chunk of chunks) {
          const pQuery = query(collection(db, "predictions"), where("userId", "in", chunk));
          const pSnapshot = await getDocs(pQuery);
          pSnapshot.forEach((doc) => {
            predsData.push({ id: doc.id, ...doc.data() } as Prediction);
          });
        }
        setAllPredictions(predsData);

        // 5. Calculate scores dynamically per group rules
        const defaultRules = {
          exactScorePoints: 3,
          correctOutcomePoints: 1,
          uniquePredictionPoints: 0,
          quarterFinalsBonus: 0,
          semiFinalsBonus: 0,
          finalsBonus: 0
        };
        const activeRules = groupData.rules || defaultRules;
        const calculatedScores = calculateGroupScores(groupData.members, matchesData, predsData, activeRules);
        setGroupScores(calculatedScores);

        // Sort members dynamically
        membersData.sort((a, b) => {
          const scoreA = calculatedScores[a.uid] || { totalPoints: 0, exactGuesses: 0 };
          const scoreB = calculatedScores[b.uid] || { totalPoints: 0, exactGuesses: 0 };
          if (scoreB.totalPoints !== scoreA.totalPoints) return scoreB.totalPoints - scoreA.totalPoints;
          return scoreB.exactGuesses - scoreA.exactGuesses;
        });
        setMembers(membersData);

      } catch (err) {
        console.error("Error loading group details:", err);
        setError("Error al cargar los detalles del grupo.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [groupId, router]);

  const copyInviteCode = () => {
    if (!group) return;
    navigator.clipboard.writeText(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpdateGroupSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group) return;
    setEditLoading(true);
    setEditSuccess("");

    if (editFirstPlacePercent + editSecondPlacePercent + editThirdPlacePercent !== 100) {
      alert("La distribución de premios debe sumar exactamente 100%.");
      setEditLoading(false);
      return;
    }

    try {
      const groupRef = doc(db, "groups", group.id);
      const updatedRules = {
        exactScorePoints: Number(editExactScorePoints),
        correctOutcomePoints: Number(editCorrectOutcomePoints),
        uniquePredictionPoints: Number(editUniquePredictionPoints),
        quarterFinalsBonus: Number(editQuarterFinalsBonus),
        semiFinalsBonus: Number(editSemiFinalsBonus),
        finalsBonus: Number(editFinalsBonus),
      };
      const updatedPrize = {
        firstPlacePercent: Number(editFirstPlacePercent),
        secondPlacePercent: Number(editSecondPlacePercent),
        thirdPlacePercent: Number(editThirdPlacePercent),
      };

      await updateDoc(groupRef, {
        entryFee: Number(editEntryFee),
        rules: updatedRules,
        prizeDistribution: updatedPrize
      });

      const updatedGroup = {
        ...group,
        entryFee: Number(editEntryFee),
        rules: updatedRules,
        prizeDistribution: updatedPrize
      };

      setGroup(updatedGroup);

      // Recalculate dynamic leaderboard scores in real time
      const calculatedScores = calculateGroupScores(group.members, matches, allPredictions, updatedRules);
      setGroupScores(calculatedScores);

      // Resort members
      const resorted = [...members];
      resorted.sort((a, b) => {
        const scoreA = calculatedScores[a.uid] || { totalPoints: 0, exactGuesses: 0 };
        const scoreB = calculatedScores[b.uid] || { totalPoints: 0, exactGuesses: 0 };
        if (scoreB.totalPoints !== scoreA.totalPoints) return scoreB.totalPoints - scoreA.totalPoints;
        return scoreB.exactGuesses - scoreA.exactGuesses;
      });
      setMembers(resorted);

      setEditSuccess("¡Configuración del grupo actualizada con éxito!");
    } catch (err) {
      console.error(err);
      alert("Error al actualizar la configuración del grupo.");
    } finally {
      setEditLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-white">Cargando detalles del grupo...</div>;
  }

  if (error || !group) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-400">Error</h1>
          <p className="text-gray-400">{error || "Algo salió mal."}</p>
          <button onClick={() => router.push("/dashboard")} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-semibold transition-all">
            Volver a Mis Grupos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-5xl mx-auto space-y-12">
        
        {/* Navigation Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{group.name}</h1>
              <span className="px-3 py-1 bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs font-bold rounded-full font-mono tracking-wider">
                GRUPO DE APUESTAS
              </span>
            </div>
            <p className="text-sm text-gray-400">
              Administrador: <span className="text-emerald-400 font-semibold">{creatorName}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-gray-400 hover:text-emerald-400 transition-colors font-medium text-sm"
            >
              ← Mis Grupos
            </button>
            <button 
              onClick={() => router.push("/dashboard")} 
              className="text-gray-400 hover:text-emerald-400 transition-colors font-medium text-sm"
            >
              Tablero
            </button>
          </div>
        </div>

        {/* Top Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Invite Code Share Card */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-between space-y-4 backdrop-blur-xl">
            <div>
              <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Invitar Amigos</h3>
              <p className="text-xs text-gray-400 mt-1">Comparte este código de invitación con otros para que se unan a este grupo.</p>
            </div>
            <div className="space-y-3">
              <div className="bg-black/50 p-4 rounded-xl border border-white/5 flex items-center justify-between font-mono">
                <span className="text-xl font-bold tracking-widest text-white">{group.inviteCode}</span>
                <button 
                  onClick={copyInviteCode}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 text-xs font-medium rounded-lg transition-all"
                >
                  {copied ? "¡Copiado!" : "Copiar"}
                </button>
              </div>
              <a 
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `¡Únete a mi grupo de apuestas en La Polla Mundial 2026! ⚽🏆\n\nGrupo: *${group.name}*\nCódigo de Invitación: *${group.inviteCode}*\nInscripción: *${group.entryFee ? `$${group.entryFee.toLocaleString()}` : "Gratis"}*\n\nRegístrate e ingresa tus pronósticos aquí: ${typeof window !== 'undefined' ? window.location.origin : ''}/login?invite=${group.inviteCode}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 bg-[#25D366] hover:bg-[#20ba56] text-black font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-2 transition-all font-sans uppercase tracking-wider"
              >
                <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12.012 1.985c-5.522 0-10 4.478-10 10 0 1.772.463 3.518 1.342 5.062L2.012 22.015l5.127-1.342a9.92 9.92 0 0 0 4.873 1.28c5.522 0 10-4.478 10-10 0-5.522-4.478-10-10-10zm-.012 1.5c4.687 0 8.5 3.813 8.5 8.5s-3.813 8.5-8.5 8.5a8.423 8.423 0 0 1-4.14-1.09l-.297-.176-3.08.808.82-3.003-.193-.307A8.441 8.441 0 0 1 3.5 11.985c0-4.687 3.813-8.5 8.5-8.5zm-3.666 3.86a.916.916 0 0 0-.646.3c-.22.235-.58.643-.58 1.488s.614 1.666.7 1.784c.086.117 1.18 1.91 2.937 2.585.418.16.744.256.998.337.42.13.8.113 1.102.068.337-.05 1.037-.425 1.182-.835s.145-.765.1-.835c-.045-.07-.164-.117-.344-.207s-1.037-.512-1.197-.57-.275-.086-.39.085c-.117.17-.45.57-.55.683-.1.117-.2.13-.38.04-1.74-.87-2.316-1.782-2.52-2.13-.086-.152-.01-.235.066-.31.068-.068.152-.178.228-.266.075-.09.1-.152.152-.255a.35.35 0 0 0-.018-.344c-.045-.09-.39-.938-.535-1.287-.14-.34-.296-.29-.406-.296-.105-.005-.226-.005-.347-.005z"/>
                </svg>
                Compartir en WhatsApp
              </a>
            </div>
          </div>

          {/* Group Stats Card */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-between space-y-4 backdrop-blur-xl">
            <div>
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Inscripción y Premios</h3>
              <p className="text-xs text-gray-400 mt-1">Estimación del pozo total acumulado por inscripciones.</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center bg-black/40 px-4 py-2.5 rounded-xl border border-white/5">
                <span className="text-xs text-gray-400">Inscripción:</span>
                <span className="text-sm font-bold text-emerald-400">{group.entryFee ? `$${group.entryFee.toLocaleString()}` : "Gratis"}</span>
              </div>
              {group.entryFee && group.entryFee > 0 ? (
                <div className="space-y-1">
                  <div className="flex justify-between items-center bg-black/40 px-4 py-2.5 rounded-xl border border-white/5">
                    <span className="text-xs text-gray-400">Pozo Total Est.:</span>
                    <span className="text-sm font-extrabold text-yellow-400">{`$${(members.length * group.entryFee).toLocaleString()}`}</span>
                  </div>
                  {group.prizeDistribution && (
                    <div className="text-[10px] text-gray-400 flex justify-between px-2 pt-1 font-medium">
                      <span>1º: {group.prizeDistribution.firstPlacePercent}% (${((members.length * group.entryFee) * group.prizeDistribution.firstPlacePercent / 100).toLocaleString()})</span>
                      <span>2º: {group.prizeDistribution.secondPlacePercent}% (${((members.length * group.entryFee) * group.prizeDistribution.secondPlacePercent / 100).toLocaleString()})</span>
                      <span>3º: {group.prizeDistribution.thirdPlacePercent}% (${((members.length * group.entryFee) * group.prizeDistribution.thirdPlacePercent / 100).toLocaleString()})</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500 italic text-center pt-2">Grupo recreativo sin pozo económico.</div>
              )}
            </div>
          </div>

          {/* Group Rules Card */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-between space-y-4 backdrop-blur-xl">
            <div>
              <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Reglas del Grupo</h3>
              <p className="text-xs text-gray-400 mt-1">Estadísticas de participación y reglas de puntuación.</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs text-gray-300">
                <span>Jugadores: <strong className="text-white">{members.length}</strong></span>
                <span>Puntos: <strong className="text-white">{members.reduce((acc, curr) => acc + (groupScores[curr.uid]?.totalPoints || 0), 0)}</strong></span>
                <span>Exactos: <strong className="text-white">{members.reduce((acc, curr) => acc + (groupScores[curr.uid]?.exactGuesses || 0), 0)}</strong></span>
              </div>
              <div className="border-t border-white/5 pt-2 text-[10px] text-gray-400 space-y-1">
                <div className="flex justify-between"><span>Marcador Exacto:</span><span className="font-bold text-white">{(group.rules?.exactScorePoints ?? 3)} pts</span></div>
                <div className="flex justify-between"><span>Acertar Ganador:</span><span className="font-bold text-white">{(group.rules?.correctOutcomePoints ?? 1)} pts</span></div>
                {group.rules?.uniquePredictionPoints ? (
                  <div className="flex justify-between text-yellow-400"><span>Bono Marcador Único:</span><span className="font-bold">+{group.rules.uniquePredictionPoints} pts</span></div>
                ) : null}
                {group.rules?.quarterFinalsBonus || group.rules?.semiFinalsBonus || group.rules?.finalsBonus ? (
                  <div className="pt-1 border-t border-white/5 mt-1 flex gap-2 justify-between">
                    {group.rules.quarterFinalsBonus ? <span>Cuartos: +{group.rules.quarterFinalsBonus}</span> : null}
                    {group.rules.semiFinalsBonus ? <span>Semis: +{group.rules.semiFinalsBonus}</span> : null}
                    {group.rules.finalsBonus ? <span>Final: +{group.rules.finalsBonus}</span> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

        </div>

        {/* Leaderboard Table */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-200">Tabla de Posiciones del Grupo</h2>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/15 border-b border-white/10 text-xs text-gray-400 uppercase font-semibold">
                    <th className="px-6 py-4">Puesto</th>
                    <th className="px-6 py-4">Jugador</th>
                    <th className="px-6 py-4">Ubicación</th>
                    <th className="px-6 py-4 text-center">Aciertos Exactos</th>
                    <th className="px-6 py-4 text-right">Puntos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {members.map((member, index) => {
                    const rank = index + 1;
                    
                    // Podiums badges formatting
                    let rankBadge = <span className="font-bold text-gray-400">{rank}</span>;
                    if (rank === 1) {
                      rankBadge = <span className="px-2.5 py-1 bg-yellow-500/20 border border-yellow-500/50 text-yellow-200 text-xs font-bold rounded-full">1º 🏆</span>;
                    } else if (rank === 2) {
                      rankBadge = <span className="px-2.5 py-1 bg-slate-300/20 border border-slate-300/50 text-slate-200 text-xs font-bold rounded-full">2º 🥈</span>;
                    } else if (rank === 3) {
                      rankBadge = <span className="px-2.5 py-1 bg-amber-700/20 border border-amber-600/50 text-amber-200 text-xs font-bold rounded-full">3º 🥉</span>;
                    }

                    const isCurrentUser = member.uid === user?.uid;

                    return (
                      <tr 
                        key={member.uid}
                        className={`hover:bg-white/10 transition-colors ${isCurrentUser ? 'bg-emerald-500/5 font-semibold text-emerald-300' : ''}`}
                      >
                        <td className="px-6 py-4">{rankBadge}</td>
                        <td className="px-6 py-4">
                          <div>
                            {member.displayName} {isCurrentUser && <span className="text-xs text-emerald-400">(Tú)</span>}
                          </div>
                          <div className="text-xs text-gray-400 font-normal">{member.email}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400">
                          {member.city ? `${member.city}${member.neighborhood ? `, ${member.neighborhood}` : ""}` : "No registrado"}
                        </td>
                        <td className="px-6 py-4 text-center font-mono">{groupScores[member.uid]?.exactGuesses || 0}</td>
                        <td className="px-6 py-4 text-right text-lg font-bold font-mono">{groupScores[member.uid]?.totalPoints || 0} pts</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Group Predictions Social View */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-200">Pronósticos del Grupo (Burlas Sociales)</h2>
          <p className="text-xs text-gray-400 -mt-4">Los pronósticos de tus rivales están ocultos hasta que el partido se cierre (hora de inicio) para garantizar el juego limpio.</p>
          
          <div className="grid gap-6">
            {matches.length === 0 ? (
              <div className="p-8 bg-white/5 border border-white/10 rounded-2xl text-center text-gray-500">
                Aún no hay partidos del torneo programados.
              </div>
            ) : (
              matches.map((match) => {
                const kickoffMs = match.kickoffTime instanceof Date ? match.kickoffTime.getTime() : (match.kickoffTime as any).toMillis();
                const isLocked = Date.now() >= kickoffMs || match.status === 'locked' || match.status === 'finished';

                return (
                  <div key={match.id} className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-4">
                    
                    {/* Match Overview Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
                      <div>
                        <span className="text-xs text-emerald-400 font-semibold tracking-wider uppercase">{(PHASE_TRANSLATIONS[match.phase] || match.phase).toUpperCase()}</span>
                        <div className="text-lg font-bold mt-0.5">{match.homeTeam} vs {match.awayTeam}</div>
                      </div>
                      <div className="text-right text-xs text-gray-400">
                        {new Date(kickoffMs).toLocaleString()}
                        {match.status === 'finished' && (
                          <div className="mt-1 text-sm font-bold text-purple-400">
                            Resultado: {match.homeScore} - {match.awayScore} ({match.resolutionMethod ? RESOLUTION_TRANSLATIONS[match.resolutionMethod] || match.resolutionMethod : ""})
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Member Predictions Grid */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pronósticos del Grupo:</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {members.map(member => {
                          const pred = allPredictions.find(p => p.userId === member.uid && p.matchId === match.id);
                          const isSelf = member.uid === user?.uid;

                          let displayPrediction = "Sin pronóstico";
                          let highlightClass = "text-gray-500";

                          if (pred) {
                            if (isSelf || isLocked) {
                                  const exactPts = group.rules?.exactScorePoints ?? 3;
                                  const outcomePts = group.rules?.correctOutcomePoints ?? 1;

                                  const actualHome = match.homeScore!;
                                  const actualAway = match.awayScore!;
                                  const actualOutcome = getOutcome(actualHome, actualAway);
                                  const predHome = pred.predictedHomeScore;
                                  const predAway = pred.predictedAwayScore;
                                  const predOutcome = getOutcome(predHome, predAway);

                                  if (predHome === actualHome && predAway === actualAway) {
                                    displayPrediction = `${pred.predictedHomeScore} - ${pred.predictedAwayScore} (${exactPts} pts - ¡Exacto! 🏆)`;
                                    highlightClass = "text-yellow-400 font-bold font-mono";
                                  } else if (predOutcome === actualOutcome) {
                                    displayPrediction = `${pred.predictedHomeScore} - ${pred.predictedAwayScore} (${outcomePts} pt - Ganador)`;
                                    highlightClass = "text-emerald-400 font-bold font-mono";
                                  } else {
                                    displayPrediction = `${pred.predictedHomeScore} - ${pred.predictedAwayScore} (0 pts)`;
                                    highlightClass = "text-red-400/80 font-mono";
                                  }
                            } else {
                              displayPrediction = "🔒 Oculto hasta el inicio";
                              highlightClass = "text-purple-400/60 text-xs italic";
                            }
                          }

                          return (
                            <div 
                              key={member.uid} 
                              className={`p-3 rounded-xl border flex items-center justify-between text-sm ${
                                isSelf ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-black/20 border-white/5'
                              }`}
                            >
                              <span className="text-gray-400 font-medium truncate max-w-[120px]">
                                {member.displayName} {isSelf && "(Tú)"}
                              </span>
                              <span className={highlightClass}>
                                {displayPrediction}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Admin Settings Panel */}
        {group.creatorId === user?.uid && (
          <section className="space-y-4 bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl">
            <div className="border-b border-white/5 pb-3">
              <h2 className="text-xl font-bold text-emerald-400">Configuración del Grupo (Solo Administrador)</h2>
              <p className="text-xs text-gray-400 mt-1">Como administrador del grupo, puedes ajustar la inscripción, las reglas de puntuación y los premios.</p>
            </div>
            
            {editSuccess && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 rounded-xl text-xs font-semibold">
                {editSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateGroupSettings} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Inscripción al Pozo ($)</label>
                  <input 
                    type="number"
                    min="0"
                    value={editEntryFee}
                    onChange={(e) => setEditEntryFee(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-bold text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Marcador Exacto (pts)</label>
                  <input 
                    type="number"
                    min="0"
                    value={editExactScorePoints}
                    onChange={(e) => setEditExactScorePoints(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Acertar Ganador (pts)</label>
                  <input 
                    type="number"
                    min="0"
                    value={editCorrectOutcomePoints}
                    onChange={(e) => setEditCorrectOutcomePoints(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Bono Predicción Única (pts)</label>
                  <input 
                    type="number"
                    min="0"
                    value={editUniquePredictionPoints}
                    onChange={(e) => setEditUniquePredictionPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                  />
                </div>
              </div>

              <div className="border-t border-white/5 pt-3 space-y-2">
                <span className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider">Bonos por Rondas Completas (pts)</span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Cuartos</label>
                    <input 
                      type="number"
                      min="0"
                      value={editQuarterFinalsBonus}
                      onChange={(e) => setEditQuarterFinalsBonus(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Semis</label>
                    <input 
                      type="number"
                      min="0"
                      value={editSemiFinalsBonus}
                      onChange={(e) => setEditSemiFinalsBonus(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Final</label>
                    <input 
                      type="number"
                      min="0"
                      value={editFinalsBonus}
                      onChange={(e) => setEditFinalsBonus(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-white/5 pt-3 space-y-2">
                <span className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider">Distribución del Pozo (%)</span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[8px] text-gray-400 uppercase mb-0.5">1º Puesto (%)</label>
                    <input 
                      type="number"
                      min="0"
                      max="100"
                      value={editFirstPlacePercent}
                      onChange={(e) => setEditFirstPlacePercent(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs font-bold text-yellow-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] text-gray-400 uppercase mb-0.5">2º Puesto (%)</label>
                    <input 
                      type="number"
                      min="0"
                      max="100"
                      value={editSecondPlacePercent}
                      onChange={(e) => setEditSecondPlacePercent(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] text-gray-400 uppercase mb-0.5">3º Puesto (%)</label>
                    <input 
                      type="number"
                      min="0"
                      max="100"
                      value={editThirdPlacePercent}
                      onChange={(e) => setEditThirdPlacePercent(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs"
                    />
                  </div>
                </div>
              </div>

              <button 
                type="submit"
                disabled={editLoading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
              >
                {editLoading ? "Guardando..." : "Guardar Configuración"}
              </button>
            </form>
          </section>
        )}

        {/* Success Creation Modal with WhatsApp Link */}
        {showSuccessModal && group && (
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
                  <span className="font-bold text-white">{group.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Código:</span>
                  <span className="font-mono font-bold text-purple-400 text-sm tracking-wider">{group.inviteCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Inscripción:</span>
                  <span className="font-bold text-emerald-400">
                    {group.entryFee ? `$${group.entryFee.toLocaleString()}` : "Gratis"}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <a 
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `¡Únete a mi grupo de apuestas en La Polla Mundial 2026! ⚽🏆\n\nGrupo: *${group.name}*\nCódigo de Invitación: *${group.inviteCode}*\nInscripción: *${group.entryFee ? `$${group.entryFee.toLocaleString()}` : "Gratis"}*\n\nRegístrate e ingresa tus pronósticos aquí: ${typeof window !== 'undefined' ? window.location.origin : ''}/login?invite=${group.inviteCode}`
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
                  onClick={() => setShowSuccessModal(false)}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold text-[10px] rounded-xl transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
