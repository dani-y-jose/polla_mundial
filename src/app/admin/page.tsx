"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, getDoc, updateDoc, query, where, writeBatch } from "firebase/firestore";
import { Match, MatchPhase, ResolutionMethod, User } from "@/types";
import { matchSchema, userSchema, predictionSchema } from "@/lib/schemas";
import { parseDoc, parseDocs } from "@/lib/parse";
import { maxMembersInputSchema, matchInputSchema, firstError } from "@/lib/form-schemas";
import { calculatePoints } from "@/lib/scoring";
import { getMaxMembersPerGroup, DEFAULT_MAX_MEMBERS_PER_GROUP } from "@/lib/config";
import { formatKickoffDateTime, toMs } from "@/lib/dates";
import { useDialog } from "@/components/DialogProvider";
import { PHASE_TRANSLATIONS, RESOLUTION_TRANSLATIONS } from "@/lib/constants";
import { Button, Input, Select, FormLabel } from "@/components/ui";
import { PhaseLabel } from "@/components/domain";

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  // Id of the match currently being deleted (disables that card's button).
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Free-text filter for the "Gestionar Partidos" list (matches team/city).
  const [matchSearch, setMatchSearch] = useState("");

  // Global config (admin-only): max members per group.
  const [maxMembers, setMaxMembers] = useState(DEFAULT_MAX_MEMBERS_PER_GROUP);
  const [maxMembersInput, setMaxMembersInput] = useState(String(DEFAULT_MAX_MEMBERS_PER_GROUP));
  const [configLoading, setConfigLoading] = useState(false);
  // Transient "saved" confirmations shown inline next to their buttons.
  const [configSaved, setConfigSaved] = useState(false);
  const [matchCreated, setMatchCreated] = useState(false);

  // New Match Form State
  const [createLoading, setCreateLoading] = useState(false);
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [kickoffTime, setKickoffTime] = useState("");
  const [phase, setPhase] = useState<MatchPhase>("group");
  const [city, setCity] = useState("");
  const [stadiumName, setStadiumName] = useState("");
  const [refereeName, setRefereeName] = useState("");
  const [refereeCountry, setRefereeCountry] = useState("");

  const router = useRouter();
  const { alert: showAlert, confirm: showConfirm } = useDialog();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
        return;
      }
      
      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        const u = parseDoc(userSchema, userDoc);
        if (u && u.isAdmin) {
          setUser(u);
        } else {
          router.push("/dashboard");
          return;
        }

        // Fetch Matches
        const matchesSnapshot = await getDocs(collection(db, "matches"));
        const matchesData = parseDocs(matchSchema, matchesSnapshot);
        
        matchesData.sort((a, b) => {
          const timeA = toMs(a.kickoffTime);
          const timeB = toMs(b.kickoffTime);
          return timeB - timeA; // Descending
        });
        setMatches(matchesData);

        const cap = await getMaxMembersPerGroup();
        setMaxMembers(cap);
        setMaxMembersInput(String(cap));

      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Auto-Lock Scheduler
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
            console.log(`[Auto-Lock] Match ${m.homeTeam} vs ${m.awayTeam} locked successfully.`);
          } catch (err) {
            console.error("Error auto-locking match:", err);
          }
        }
      }

      if (updatedSome) {
        setMatches(updatedMatches);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [matches]);

  // Persist the global, admin-only member cap.
  const handleSaveMaxMembers = async () => {
    const parsed = maxMembersInputSchema.safeParse(maxMembersInput);
    if (!parsed.success) {
      await showAlert(firstError(parsed.error));
      return;
    }
    const value = parsed.data;
    setConfigLoading(true);
    try {
      await setDoc(doc(db, "config", "app"), { maxMembersPerGroup: value }, { merge: true });
      setMaxMembers(value);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (err) {
      console.error(err);
      await showAlert("Error al guardar la configuración.");
    } finally {
      setConfigLoading(false);
    }
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = matchInputSchema.safeParse({ homeTeam, awayTeam, kickoffTime });
    if (!parsed.success) {
      await showAlert(firstError(parsed.error));
      return;
    }
    setCreateLoading(true);
    try {
      const matchId = `match_${Date.now()}`;
      const payload: Match = {
        id: matchId,
        homeTeam: parsed.data.homeTeam,
        awayTeam: parsed.data.awayTeam,
        kickoffTime: new Date(parsed.data.kickoffTime),
        status: "upcoming",
        homeScore: null,
        awayScore: null,
        phase,
        city,
        stadiumName,
        refereeName,
        refereeCountry,
        resolutionMethod: null
      };

      await setDoc(doc(db, "matches", matchId), payload);
      setMatches([payload, ...matches]);
      // Reset form
      setHomeTeam(""); setAwayTeam(""); setKickoffTime(""); setCity(""); setStadiumName(""); setRefereeName(""); setRefereeCountry("");
      setMatchCreated(true);
      setTimeout(() => setMatchCreated(false), 3000);
    } catch (err) {
      console.error(err);
      await showAlert("Error al crear el partido.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUpdateScore = async (matchId: string, homeScore: string, awayScore: string, resolutionMethod: ResolutionMethod) => {
    const hScore = parseInt(homeScore, 10);
    const aScore = parseInt(awayScore, 10);

    if (isNaN(hScore) || isNaN(aScore)) return;

    try {
      // 1. Update Match
      const matchRef = doc(db, "matches", matchId);
      await updateDoc(matchRef, {
        homeScore: hScore,
        awayScore: aScore,
        status: "finished",
        resolutionMethod
      });

      // 2. Cache the fixed 3/1/0 points on each prediction for this match (used
      // for the per-match badge in the predictions tab). The leaderboard itself
      // recomputes per-group with each group's own rules, so these per-doc values
      // are not authoritative for standings.
      const q = query(collection(db, "predictions"), where("matchId", "==", matchId));
      const predsSnapshot = await getDocs(q);

      const batch = writeBatch(db);
      predsSnapshot.forEach((predDoc) => {
        const predData = parseDoc(predictionSchema, predDoc);
        if (!predData) return;
        const points = calculatePoints(predData.predictedHomeScore, predData.predictedAwayScore, hScore, aScore);

        const pRef = doc(db, "predictions", predDoc.id);
        batch.update(pRef, { pointsEarned: points });
      });

      await batch.commit();

      // 3. Notifications (in-app doc + web push) are sent server-side by the
      // onMatchScored Cloud Function, which fires on the status -> "finished"
      // write above and notifies exactly the users who predicted this match.

      setMatches(matches.map(m => m.id === matchId ? { ...m, homeScore: hScore, awayScore: aScore, status: "finished", resolutionMethod } : m));
      await showAlert("¡Marcador actualizado y puntos recalculados!");

    } catch (err) {
      console.error(err);
      await showAlert("Error al actualizar el marcador.");
    }
  };

  // Cascade-delete a match and every prediction tied to it. Mirrors the CLI's
  // `matches:delete`: points totals aren't stored (leaderboards recompute live
  // from raw predictions + matches), so removing the predictions is enough —
  // nothing to recompute. Only `matches` + `predictions` are touched; champions
  // (per-tournament, not per-match) and notifications are unaffected.
  const handleDeleteMatch = async (match: Match) => {
    try {
      // Fetch first so the confirmation can state the blast radius.
      const q = query(collection(db, "predictions"), where("matchId", "==", match.id));
      const predsSnapshot = await getDocs(q);
      const ok = await showConfirm(
        `¿Eliminar "${match.homeTeam} vs ${match.awayTeam}" y sus ${predsSnapshot.size} pronóstico(s)? Esta acción no se puede deshacer.`,
        { title: "Eliminar partido", confirmText: "Eliminar", tone: "danger" }
      );
      if (!ok) return;

      setDeletingId(match.id);

      // Cascade predictions, then the match doc, chunking batches well under
      // Firestore's 500-op limit (same 400 margin the CLI uses).
      let batch = writeBatch(db);
      let n = 0;
      for (const predDoc of predsSnapshot.docs) {
        batch.delete(doc(db, "predictions", predDoc.id));
        if (++n % 400 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      batch.delete(doc(db, "matches", match.id));
      await batch.commit();

      setMatches(prev => prev.filter(m => m.id !== match.id));
      await showAlert(`✓ Partido eliminado junto con ${predsSnapshot.size} pronóstico(s).`);
    } catch (err) {
      console.error(err);
      await showAlert("Error al eliminar el partido.");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Cargando...</div>;
  if (!user) return null;

  // Accent-insensitive filter for the match list (so "mexico" matches "México").
  const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const matchQuery = normalize(matchSearch.trim());
  const filteredMatches = matchQuery
    ? matches.filter(m => normalize(`${m.homeTeam} ${m.awayTeam} ${m.city ?? ""}`).includes(matchQuery))
    : matches;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Panel de Administración</h1>
          <Button onClick={() => router.push("/dashboard")} className="shrink-0">
            <span aria-hidden="true">←</span> Volver al Tablero
          </Button>
        </div>

        {/* Global Config: Max members per group */}
        <section className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-emerald-400">Configuración Global</h2>
            <p className="text-xs text-gray-400 mt-1">
              Máximo de miembros por grupo. Aplica a todos los grupos (las invitaciones nuevas usan este valor y los grupos no pueden superarlo). Solo los administradores pueden cambiarlo. Actual: <span className="font-bold text-white">{maxMembers}</span>.
            </p>
          </div>
          <div className="flex gap-3 items-end">
            <div>
              <label className="text-sm text-gray-400">Máx. miembros por grupo</label>
              <input
                type="number"
                min="1"
                value={maxMembersInput}
                onChange={(e) => setMaxMembersInput(e.target.value)}
                className="w-32 mt-1 px-3 py-2 bg-black/50 border border-white/10 rounded"
              />
            </div>
            <div className="flex flex-col items-start gap-1">
              <button
                onClick={handleSaveMaxMembers}
                disabled={configLoading}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                {configLoading ? "Guardando..." : "Guardar"}
              </button>
              {configSaved && <span className="text-xs text-emerald-400 font-bold">✓ Guardado</span>}
            </div>
          </div>
        </section>

        {/* Create Match Form */}
        <section className="bg-white/5 p-6 rounded-xl border border-white/10">
          <h2 className="text-xl font-semibold mb-6">Crear Nuevo Partido</h2>
          <form onSubmit={handleCreateMatch} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><FormLabel variant="default" htmlFor="m-home">Equipo Local</FormLabel><Input id="m-home" required value={homeTeam} onChange={e=>setHomeTeam(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-away">Equipo Visitante</FormLabel><Input id="m-away" required value={awayTeam} onChange={e=>setAwayTeam(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-kick">Hora de Inicio</FormLabel><Input id="m-kick" type="datetime-local" required value={kickoffTime} onChange={e=>setKickoffTime(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-phase">Fase</FormLabel>
              <Select id="m-phase" value={phase} onChange={e=>setPhase(e.target.value as MatchPhase)}>
                {Object.entries(PHASE_TRANSLATIONS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div><FormLabel variant="default" htmlFor="m-city">Ciudad</FormLabel><Input id="m-city" required value={city} onChange={e=>setCity(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-stadium">Estadio</FormLabel><Input id="m-stadium" required value={stadiumName} onChange={e=>setStadiumName(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-ref">Nombre del Árbitro</FormLabel><Input id="m-ref" required value={refereeName} onChange={e=>setRefereeName(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-refc">País del Árbitro</FormLabel><Input id="m-refc" required value={refereeCountry} onChange={e=>setRefereeCountry(e.target.value)} /></div>
            <div className="md:col-span-2 pt-4 flex items-center gap-3">
              <Button type="submit" disabled={createLoading}>{createLoading ? "Agregando..." : "Agregar Partido"}</Button>
              {matchCreated && <span className="text-sm text-emerald-400 font-bold">✓ Partido creado con éxito</span>}
            </div>
          </form>
        </section>

        {/* Manage Matches */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <h2 className="text-xl font-semibold">Gestionar Partidos</h2>
            <input
              type="search"
              value={matchSearch}
              onChange={e => setMatchSearch(e.target.value)}
              placeholder="Buscar por equipo o ciudad..."
              className="w-full sm:w-72 px-3 py-2 bg-black/50 border border-white/10 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-4">
            {filteredMatches.length === 0 && (
              <div className="text-sm text-gray-500 py-4">
                {matchSearch.trim()
                  ? `No hay partidos que coincidan con "${matchSearch}".`
                  : "No hay partidos."}
              </div>
            )}
            {filteredMatches.map(match => (
              <div key={match.id} className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col md:flex-row gap-6 items-center">
                <div className="flex-1">
                  <PhaseLabel phase={match.phase} className="block text-sm" />
                  <div className="text-lg font-bold">{match.homeTeam} vs {match.awayTeam}</div>
                  <div className="text-sm text-gray-400">{formatKickoffDateTime(match.kickoffTime)}</div>
                </div>
                
                {match.status !== 'finished' ? (
                  <MatchScoreUpdater match={match} onUpdate={handleUpdateScore} />
                ) : (
                  <div className="text-center px-6 py-3 bg-white/10 rounded-lg">
                    <div className="text-xs text-gray-400 mb-1">RESULTADO FINAL</div>
                    <div className="text-2xl font-bold">{match.homeScore} - {match.awayScore}</div>
                    <div className="text-xs text-gray-500 mt-1">{match.resolutionMethod ? RESOLUTION_TRANSLATIONS[match.resolutionMethod] || match.resolutionMethod : ""}</div>
                  </div>
                )}

                {/* Cascade-delete: removes the match and all its predictions.
                    Kept visually separate from "Actualizar" to avoid mis-taps. */}
                <button
                  onClick={() => handleDeleteMatch(match)}
                  disabled={deletingId === match.id}
                  title="Eliminar partido y todos sus pronósticos"
                  className="h-10 px-4 bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/40 disabled:opacity-50 rounded text-sm font-medium shrink-0"
                >
                  {deletingId === match.id ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function MatchScoreUpdater({ match, onUpdate }: { match: Match, onUpdate: (id: string, hs: string, as: string, res: ResolutionMethod) => Promise<void> }) {
  const [hScore, setHScore] = useState(match.homeScore?.toString() || "");
  const [aScore, setAScore] = useState(match.awayScore?.toString() || "");
  const [res, setRes] = useState<ResolutionMethod>("normal");
  const [saving, setSaving] = useState(false);

  // Await the update so the button reflects the in-flight write (scoring + the
  // notification batch take a moment) and can't be double-fired.
  const handleClick = async () => {
    setSaving(true);
    try {
      await onUpdate(match.id, hScore, aScore, res);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-black/40 p-4 rounded-lg border border-white/5">
      <input type="number" min="0" value={hScore} onChange={e=>setHScore(e.target.value)} className="w-16 h-10 text-center bg-white/10 rounded" placeholder="L" />
      <span>-</span>
      <input type="number" min="0" value={aScore} onChange={e=>setAScore(e.target.value)} className="w-16 h-10 text-center bg-white/10 rounded" placeholder="V" />
      <select value={res || "normal"} onChange={e=>setRes(e.target.value as ResolutionMethod)} className="h-10 px-2 bg-white/10 rounded text-sm max-w-[100px]">
        <option value="normal">90 Minutos</option>
        <option value="extra_time">Tiempo Extra</option>
        <option value="penalties">Penales</option>
      </select>
      <button onClick={handleClick} disabled={saving} className="h-10 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded text-sm font-medium">{saving ? "Actualizando..." : "Actualizar"}</button>
    </div>
  );
}
