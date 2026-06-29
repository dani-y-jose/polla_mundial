"use client";

// Panel de administración — migrado al design system (Fase 6d). Solo accesible
// para usuarios con isAdmin. Layout enfocado (no usa la AppShell de tabs porque
// admin no es una pestaña): cabecera + secciones en Cards sobre tokens.
// La lógica (gating, auto-lock, config, crear/puntuar/eliminar) se conserva.

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
import { PHASE_TRANSLATIONS, RESOLUTION_TRANSLATIONS, QUALIFIER_POINTS, isKnockoutPhase } from "@/lib/constants";
import { Button, Input, Select, FormLabel, Card, Badge, Spinner } from "@/components/ui";
import { PhaseLabel, MatchStatusBadge, PageHeader } from "@/components/domain";

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
        router.push("/");
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
        resolutionMethod: null,
        qualifier: null
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

  const handleUpdateScore = async (matchId: string, homeScore: string, awayScore: string, resolutionMethod: ResolutionMethod, qualifier: Match["qualifier"]) => {
    const hScore = parseInt(homeScore, 10);
    const aScore = parseInt(awayScore, 10);

    if (isNaN(hScore) || isNaN(aScore)) return;

    // The "clasifica" winner is only meaningful (and only scored) when the match
    // was decided by penalties; clear it otherwise so a stale pick can't linger.
    const finalQualifier = resolutionMethod === "penalties" ? qualifier : null;

    try {
      // 1. Update Match
      const matchRef = doc(db, "matches", matchId);
      await updateDoc(matchRef, {
        homeScore: hScore,
        awayScore: aScore,
        status: "finished",
        resolutionMethod,
        qualifier: finalQualifier
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
        let points = calculatePoints(predData.predictedHomeScore, predData.predictedAwayScore, hScore, aScore);
        // Mirror the leaderboard's "clasifica" bonus on the cached badge: the
        // qualifier point is a fixed value (not per-group), so adding it here
        // keeps the per-match badge exact for penalty-decided matches.
        if (finalQualifier && predData.predictedQualifier === finalQualifier) {
          points += QUALIFIER_POINTS;
        }

        const pRef = doc(db, "predictions", predDoc.id);
        batch.update(pRef, { pointsEarned: points });
      });

      await batch.commit();

      // 3. Notifications (in-app doc + web push) are sent server-side by the
      // onMatchScored Cloud Function, which fires on the status -> "finished"
      // write above and notifies exactly the users who predicted this match.

      setMatches(matches.map(m => m.id === matchId ? { ...m, homeScore: hScore, awayScore: aScore, status: "finished", resolutionMethod, qualifier: finalQualifier } : m));
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!user) return null;

  // Accent-insensitive filter for the match list (so "mexico" matches "México").
  const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const matchQuery = normalize(matchSearch.trim());
  const filteredMatches = matchQuery
    ? matches.filter(m => normalize(`${m.homeTeam} ${m.awayTeam} ${m.city ?? ""}`).includes(matchQuery))
    : matches;

  return (
    <div className="min-h-screen text-ink">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
        <PageHeader
          title="Panel de administración"
          subtitle="Partidos, marcadores y configuración del torneo."
          action={
            <Button variant="secondary" onClick={() => router.push("/dashboard")}>
              <span aria-hidden="true">←</span> Volver al tablero
            </Button>
          }
        />

        {/* Configuración global: máx. miembros por grupo */}
        <Card padding="lg" className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold text-ink">Configuración global</h2>
            <p className="mt-1 max-w-prose text-sm text-ink-muted">
              Máximo de miembros por grupo. Aplica a todos los grupos (las invitaciones nuevas usan
              este valor y los grupos no pueden superarlo). Actual:{" "}
              <span className="font-bold text-ink">{maxMembers}</span>.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="w-28">
              <FormLabel variant="default" htmlFor="cfg-max">Máx. por grupo</FormLabel>
              <Input
                id="cfg-max"
                type="number"
                min="1"
                value={maxMembersInput}
                onChange={(e) => setMaxMembersInput(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSaveMaxMembers} disabled={configLoading}>
                {configLoading ? "Guardando…" : "Guardar"}
              </Button>
              {configSaved && <Badge tone="primary">✓ Guardado</Badge>}
            </div>
          </div>
        </Card>

        {/* Crear nuevo partido */}
        <Card padding="lg">
          <h2 className="mb-6 font-display text-lg font-bold text-ink">Crear nuevo partido</h2>
          <form onSubmit={handleCreateMatch} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><FormLabel variant="default" htmlFor="m-home">Equipo local</FormLabel><Input id="m-home" required value={homeTeam} onChange={e=>setHomeTeam(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-away">Equipo visitante</FormLabel><Input id="m-away" required value={awayTeam} onChange={e=>setAwayTeam(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-kick">Hora de inicio</FormLabel><Input id="m-kick" type="datetime-local" required value={kickoffTime} onChange={e=>setKickoffTime(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-phase">Fase</FormLabel>
              <Select id="m-phase" value={phase} onChange={e=>setPhase(e.target.value as MatchPhase)}>
                {Object.entries(PHASE_TRANSLATIONS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div><FormLabel variant="default" htmlFor="m-city">Ciudad</FormLabel><Input id="m-city" required value={city} onChange={e=>setCity(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-stadium">Estadio</FormLabel><Input id="m-stadium" required value={stadiumName} onChange={e=>setStadiumName(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-ref">Nombre del árbitro</FormLabel><Input id="m-ref" required value={refereeName} onChange={e=>setRefereeName(e.target.value)} /></div>
            <div><FormLabel variant="default" htmlFor="m-refc">País del árbitro</FormLabel><Input id="m-refc" required value={refereeCountry} onChange={e=>setRefereeCountry(e.target.value)} /></div>
            <div className="flex items-center gap-3 pt-2 md:col-span-2">
              <Button type="submit" disabled={createLoading}>{createLoading ? "Agregando…" : "Agregar partido"}</Button>
              {matchCreated && <Badge tone="primary">✓ Partido creado</Badge>}
            </div>
          </form>
        </Card>

        {/* Gestionar partidos */}
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Gestionar partidos</h2>
            <div className="w-full sm:w-72">
              <Input
                type="search"
                value={matchSearch}
                onChange={e => setMatchSearch(e.target.value)}
                placeholder="Buscar por equipo o ciudad…"
              />
            </div>
          </div>

          {filteredMatches.length === 0 ? (
            <Card padding="lg">
              <p className="text-center text-sm text-ink-muted">
                {matchSearch.trim()
                  ? `No hay partidos que coincidan con "${matchSearch}".`
                  : "No hay partidos todavía."}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredMatches.map(match => (
                <Card key={match.id} padding="md" className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <PhaseLabel phase={match.phase} className="text-xs" />
                      <MatchStatusBadge status={match.status} />
                    </div>
                    <div className="mt-1 truncate font-display text-base font-bold text-ink">
                      {match.homeTeam} <span className="text-ink-faint">vs</span> {match.awayTeam}
                    </div>
                    <div className="text-sm text-ink-muted">{formatKickoffDateTime(match.kickoffTime)}</div>
                  </div>

                  {match.status !== "finished" ? (
                    <MatchScoreUpdater match={match} onUpdate={handleUpdateScore} />
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
                      <div className="text-2xl font-extrabold tabular-nums text-ink">
                        {match.homeScore}<span className="px-1 text-ink-faint">–</span>{match.awayScore}
                      </div>
                      {match.resolutionMethod && match.resolutionMethod !== "normal" && (
                        <Badge tone="neutral">
                          {RESOLUTION_TRANSLATIONS[match.resolutionMethod] ?? match.resolutionMethod}
                        </Badge>
                      )}
                      {match.qualifier && (
                        <Badge tone="accent">
                          Clasifica: {match.qualifier === "home" ? match.homeTeam : match.awayTeam}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Cascade-delete: removes the match and all its predictions.
                      Kept visually separate from "Actualizar" to avoid mis-taps. */}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteMatch(match)}
                    disabled={deletingId === match.id}
                    title="Eliminar partido y todos sus pronósticos"
                    className="shrink-0"
                  >
                    {deletingId === match.id ? "Eliminando…" : "Eliminar"}
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MatchScoreUpdater({ match, onUpdate }: { match: Match, onUpdate: (id: string, hs: string, as: string, res: ResolutionMethod, qualifier: Match["qualifier"]) => Promise<void> }) {
  const [hScore, setHScore] = useState(match.homeScore?.toString() || "");
  const [aScore, setAScore] = useState(match.awayScore?.toString() || "");
  const [res, setRes] = useState<ResolutionMethod>("normal");
  const [qual, setQual] = useState<Match["qualifier"]>(match.qualifier ?? null);
  const [saving, setSaving] = useState(false);

  // The "clasifica" winner is only needed when a knockout match goes to
  // penalties (the 120' score is a draw, so the qualifier can't be derived).
  const needsQualifier = isKnockoutPhase(match.phase) && res === "penalties";

  // Await the update so the button reflects the in-flight write (scoring + the
  // notification batch take a moment) and can't be double-fired.
  const handleClick = async () => {
    setSaving(true);
    try {
      await onUpdate(match.id, hScore, aScore, res, qual);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-3">
      <div className="w-16">
        <Input type="number" min="0" value={hScore} onChange={e=>setHScore(e.target.value)} className="text-center" placeholder="L" aria-label="Goles local" />
      </div>
      <span className="text-ink-faint">–</span>
      <div className="w-16">
        <Input type="number" min="0" value={aScore} onChange={e=>setAScore(e.target.value)} className="text-center" placeholder="V" aria-label="Goles visitante" />
      </div>
      <div className="w-[150px]">
        <Select value={res || "normal"} onChange={e=>setRes(e.target.value as ResolutionMethod)}>
          <option value="normal">90 minutos</option>
          <option value="extra_time">Tiempo extra</option>
          <option value="penalties">Penales</option>
        </Select>
      </div>
      {needsQualifier && (
        <div className="w-[170px]">
          <Select
            value={qual ?? ""}
            onChange={e=>setQual((e.target.value || null) as Match["qualifier"])}
            aria-label="Equipo que clasifica"
          >
            <option value="">¿Quién clasifica?</option>
            <option value="home">{match.homeTeam}</option>
            <option value="away">{match.awayTeam}</option>
          </Select>
        </div>
      )}
      <Button size="sm" onClick={handleClick} disabled={saving || (needsQualifier && !qual)}>{saving ? "Actualizando…" : "Actualizar"}</Button>
    </div>
  );
}
