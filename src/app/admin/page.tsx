"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, getDoc, updateDoc, query, where, writeBatch } from "firebase/firestore";
import { Match, MatchPhase, ResolutionMethod, User, Prediction } from "@/types";
import { calculatePoints } from "@/lib/scoring";

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

const WC2026_GROUP_MATCHES = [
  // Grupo A
  { id: "wc26_a_mexico_vs_sudafrica",           homeTeam: "México",                  awayTeam: "Sudáfrica",           kickoffISO: "2026-06-11T20:00:00Z", city: "Ciudad de México",  stadiumName: "Estadio Azteca" },
  { id: "wc26_a_corea_vs_chequia",              homeTeam: "Corea del Sur",           awayTeam: "Chequia",             kickoffISO: "2026-06-12T03:00:00Z", city: "Guadalajara",       stadiumName: "Estadio Akron" },
  { id: "wc26_a_chequia_vs_sudafrica",          homeTeam: "Chequia",                 awayTeam: "Sudáfrica",           kickoffISO: "2026-06-18T16:00:00Z", city: "Atlanta",           stadiumName: "Mercedes-Benz Stadium" },
  { id: "wc26_a_mexico_vs_corea",              homeTeam: "México",                  awayTeam: "Corea del Sur",       kickoffISO: "2026-06-19T01:00:00Z", city: "Guadalajara",       stadiumName: "Estadio Akron" },
  { id: "wc26_a_chequia_vs_mexico",            homeTeam: "Chequia",                 awayTeam: "México",              kickoffISO: "2026-06-25T01:00:00Z", city: "Ciudad de México",  stadiumName: "Estadio Azteca" },
  { id: "wc26_a_sudafrica_vs_corea",           homeTeam: "Sudáfrica",               awayTeam: "Corea del Sur",       kickoffISO: "2026-06-25T01:00:00Z", city: "Monterrey",         stadiumName: "Estadio BBVA" },
  // Grupo B
  { id: "wc26_b_canada_vs_bosnia",             homeTeam: "Canadá",                  awayTeam: "Bosnia y Herzegovina",kickoffISO: "2026-06-12T19:00:00Z", city: "Toronto",           stadiumName: "BMO Field" },
  { id: "wc26_b_catar_vs_suiza",               homeTeam: "Catar",                   awayTeam: "Suiza",               kickoffISO: "2026-06-13T19:00:00Z", city: "Santa Clara",       stadiumName: "Levi's Stadium" },
  { id: "wc26_b_suiza_vs_bosnia",              homeTeam: "Suiza",                   awayTeam: "Bosnia y Herzegovina",kickoffISO: "2026-06-18T19:00:00Z", city: "Inglewood",         stadiumName: "SoFi Stadium" },
  { id: "wc26_b_canada_vs_catar",              homeTeam: "Canadá",                  awayTeam: "Catar",               kickoffISO: "2026-06-18T22:00:00Z", city: "Vancouver",         stadiumName: "BC Place" },
  { id: "wc26_b_suiza_vs_canada",              homeTeam: "Suiza",                   awayTeam: "Canadá",              kickoffISO: "2026-06-24T19:00:00Z", city: "Vancouver",         stadiumName: "BC Place" },
  { id: "wc26_b_bosnia_vs_catar",              homeTeam: "Bosnia y Herzegovina",    awayTeam: "Catar",               kickoffISO: "2026-06-24T19:00:00Z", city: "Seattle",           stadiumName: "Lumen Field" },
  // Grupo C
  { id: "wc26_c_brasil_vs_marruecos",          homeTeam: "Brasil",                  awayTeam: "Marruecos",           kickoffISO: "2026-06-13T22:00:00Z", city: "East Rutherford",   stadiumName: "MetLife Stadium" },
  { id: "wc26_c_haiti_vs_escocia",             homeTeam: "Haití",                   awayTeam: "Escocia",             kickoffISO: "2026-06-14T01:00:00Z", city: "Foxborough",        stadiumName: "Gillette Stadium" },
  { id: "wc26_c_escocia_vs_marruecos",         homeTeam: "Escocia",                 awayTeam: "Marruecos",           kickoffISO: "2026-06-19T22:00:00Z", city: "Foxborough",        stadiumName: "Gillette Stadium" },
  { id: "wc26_c_brasil_vs_haiti",              homeTeam: "Brasil",                  awayTeam: "Haití",               kickoffISO: "2026-06-20T00:30:00Z", city: "Philadelphia",      stadiumName: "Lincoln Financial Field" },
  { id: "wc26_c_escocia_vs_brasil",            homeTeam: "Escocia",                 awayTeam: "Brasil",              kickoffISO: "2026-06-25T22:00:00Z", city: "Miami",             stadiumName: "Hard Rock Stadium" },
  { id: "wc26_c_marruecos_vs_haiti",           homeTeam: "Marruecos",               awayTeam: "Haití",               kickoffISO: "2026-06-25T22:00:00Z", city: "Atlanta",           stadiumName: "Mercedes-Benz Stadium" },
  // Grupo D
  { id: "wc26_d_eeuu_vs_paraguay",             homeTeam: "Estados Unidos",          awayTeam: "Paraguay",            kickoffISO: "2026-06-12T21:00:00Z", city: "Inglewood",         stadiumName: "SoFi Stadium" },
  { id: "wc26_d_australia_vs_turquia",         homeTeam: "Australia",               awayTeam: "Turquía",             kickoffISO: "2026-06-13T04:00:00Z", city: "Vancouver",         stadiumName: "BC Place" },
  { id: "wc26_d_eeuu_vs_australia",            homeTeam: "Estados Unidos",          awayTeam: "Australia",           kickoffISO: "2026-06-19T19:00:00Z", city: "Seattle",           stadiumName: "Lumen Field" },
  { id: "wc26_d_turquia_vs_paraguay",          homeTeam: "Turquía",                 awayTeam: "Paraguay",            kickoffISO: "2026-06-20T03:00:00Z", city: "Santa Clara",       stadiumName: "Levi's Stadium" },
  { id: "wc26_d_turquia_vs_eeuu",              homeTeam: "Turquía",                 awayTeam: "Estados Unidos",      kickoffISO: "2026-06-25T02:00:00Z", city: "Inglewood",         stadiumName: "SoFi Stadium" },
  { id: "wc26_d_paraguay_vs_australia",        homeTeam: "Paraguay",                awayTeam: "Australia",           kickoffISO: "2026-06-25T02:00:00Z", city: "Santa Clara",       stadiumName: "Levi's Stadium" },
  // Grupo E
  { id: "wc26_e_alemania_vs_curazao",          homeTeam: "Alemania",                awayTeam: "Curazao",             kickoffISO: "2026-06-14T17:00:00Z", city: "Houston",           stadiumName: "NRG Stadium" },
  { id: "wc26_e_ecuador_vs_costademarfil",     homeTeam: "Ecuador",                 awayTeam: "Costa de Marfil",     kickoffISO: "2026-06-14T20:00:00Z", city: "Kansas City",       stadiumName: "Arrowhead Stadium" },
  { id: "wc26_e_alemania_vs_costademarfil",    homeTeam: "Alemania",                awayTeam: "Costa de Marfil",     kickoffISO: "2026-06-20T20:00:00Z", city: "Toronto",           stadiumName: "BMO Field" },
  { id: "wc26_e_ecuador_vs_curazao",           homeTeam: "Ecuador",                 awayTeam: "Curazao",             kickoffISO: "2026-06-21T00:00:00Z", city: "Kansas City",       stadiumName: "Arrowhead Stadium" },
  { id: "wc26_e_curazao_vs_costademarfil",     homeTeam: "Curazao",                 awayTeam: "Costa de Marfil",     kickoffISO: "2026-06-25T20:00:00Z", city: "Philadelphia",      stadiumName: "Lincoln Financial Field" },
  { id: "wc26_e_ecuador_vs_alemania",          homeTeam: "Ecuador",                 awayTeam: "Alemania",            kickoffISO: "2026-06-25T20:00:00Z", city: "East Rutherford",   stadiumName: "MetLife Stadium" },
  // Grupo F
  { id: "wc26_f_paisesbajos_vs_japon",         homeTeam: "Países Bajos",            awayTeam: "Japón",               kickoffISO: "2026-06-14T20:00:00Z", city: "Arlington",         stadiumName: "AT&T Stadium" },
  { id: "wc26_f_suecia_vs_tunez",              homeTeam: "Suecia",                  awayTeam: "Túnez",               kickoffISO: "2026-06-15T02:00:00Z", city: "Monterrey",         stadiumName: "Estadio BBVA" },
  { id: "wc26_f_paisesbajos_vs_suecia",        homeTeam: "Países Bajos",            awayTeam: "Suecia",              kickoffISO: "2026-06-20T17:00:00Z", city: "Houston",           stadiumName: "NRG Stadium" },
  { id: "wc26_f_tunez_vs_japon",               homeTeam: "Túnez",                   awayTeam: "Japón",               kickoffISO: "2026-06-21T04:00:00Z", city: "Monterrey",         stadiumName: "Estadio BBVA" },
  { id: "wc26_f_japon_vs_suecia",              homeTeam: "Japón",                   awayTeam: "Suecia",              kickoffISO: "2026-06-25T23:00:00Z", city: "Arlington",         stadiumName: "AT&T Stadium" },
  { id: "wc26_f_tunez_vs_paisesbajos",         homeTeam: "Túnez",                   awayTeam: "Países Bajos",        kickoffISO: "2026-06-25T23:00:00Z", city: "Kansas City",       stadiumName: "Arrowhead Stadium" },
  // Grupo G
  { id: "wc26_g_belgica_vs_egipto",            homeTeam: "Bélgica",                 awayTeam: "Egipto",              kickoffISO: "2026-06-15T19:00:00Z", city: "Seattle",           stadiumName: "Lumen Field" },
  { id: "wc26_g_iran_vs_nuevazelanda",         homeTeam: "Irán",                    awayTeam: "Nueva Zelanda",       kickoffISO: "2026-06-16T01:00:00Z", city: "Inglewood",         stadiumName: "SoFi Stadium" },
  { id: "wc26_g_belgica_vs_iran",              homeTeam: "Bélgica",                 awayTeam: "Irán",                kickoffISO: "2026-06-21T19:00:00Z", city: "Inglewood",         stadiumName: "SoFi Stadium" },
  { id: "wc26_g_nuevazelanda_vs_egipto",       homeTeam: "Nueva Zelanda",           awayTeam: "Egipto",              kickoffISO: "2026-06-22T01:00:00Z", city: "Vancouver",         stadiumName: "BC Place" },
  { id: "wc26_g_egipto_vs_iran",               homeTeam: "Egipto",                  awayTeam: "Irán",                kickoffISO: "2026-06-26T03:00:00Z", city: "Seattle",           stadiumName: "Lumen Field" },
  { id: "wc26_g_nuevazelanda_vs_belgica",      homeTeam: "Nueva Zelanda",           awayTeam: "Bélgica",             kickoffISO: "2026-06-26T03:00:00Z", city: "Vancouver",         stadiumName: "BC Place" },
  // Grupo H
  { id: "wc26_h_espana_vs_caboverde",          homeTeam: "España",                  awayTeam: "Cabo Verde",          kickoffISO: "2026-06-15T16:00:00Z", city: "Atlanta",           stadiumName: "Mercedes-Benz Stadium" },
  { id: "wc26_h_arabiasaudita_vs_uruguay",     homeTeam: "Arabia Saudita",          awayTeam: "Uruguay",             kickoffISO: "2026-06-15T22:00:00Z", city: "Miami",             stadiumName: "Hard Rock Stadium" },
  { id: "wc26_h_espana_vs_arabiasaudita",      homeTeam: "España",                  awayTeam: "Arabia Saudita",      kickoffISO: "2026-06-21T16:00:00Z", city: "Atlanta",           stadiumName: "Mercedes-Benz Stadium" },
  { id: "wc26_h_uruguay_vs_caboverde",         homeTeam: "Uruguay",                 awayTeam: "Cabo Verde",          kickoffISO: "2026-06-21T22:00:00Z", city: "Miami",             stadiumName: "Hard Rock Stadium" },
  { id: "wc26_h_caboverde_vs_arabiasaudita",   homeTeam: "Cabo Verde",              awayTeam: "Arabia Saudita",      kickoffISO: "2026-06-26T00:00:00Z", city: "Houston",           stadiumName: "NRG Stadium" },
  { id: "wc26_h_uruguay_vs_espana",            homeTeam: "Uruguay",                 awayTeam: "España",              kickoffISO: "2026-06-26T00:00:00Z", city: "Guadalajara",       stadiumName: "Estadio Akron" },
  // Grupo I
  { id: "wc26_i_francia_vs_senegal",           homeTeam: "Francia",                 awayTeam: "Senegal",             kickoffISO: "2026-06-16T19:00:00Z", city: "East Rutherford",   stadiumName: "MetLife Stadium" },
  { id: "wc26_i_irak_vs_noruega",              homeTeam: "Irak",                    awayTeam: "Noruega",             kickoffISO: "2026-06-16T22:00:00Z", city: "Foxborough",        stadiumName: "Gillette Stadium" },
  { id: "wc26_i_francia_vs_irak",              homeTeam: "Francia",                 awayTeam: "Irak",                kickoffISO: "2026-06-22T21:00:00Z", city: "Philadelphia",      stadiumName: "Lincoln Financial Field" },
  { id: "wc26_i_noruega_vs_senegal",           homeTeam: "Noruega",                 awayTeam: "Senegal",             kickoffISO: "2026-06-23T00:00:00Z", city: "East Rutherford",   stadiumName: "MetLife Stadium" },
  { id: "wc26_i_noruega_vs_francia",           homeTeam: "Noruega",                 awayTeam: "Francia",             kickoffISO: "2026-06-27T19:00:00Z", city: "Foxborough",        stadiumName: "Gillette Stadium" },
  { id: "wc26_i_senegal_vs_irak",              homeTeam: "Senegal",                 awayTeam: "Irak",                kickoffISO: "2026-06-27T19:00:00Z", city: "Toronto",           stadiumName: "BMO Field" },
  // Grupo J
  { id: "wc26_j_argentina_vs_argelia",         homeTeam: "Argentina",               awayTeam: "Argelia",             kickoffISO: "2026-06-17T01:00:00Z", city: "Kansas City",       stadiumName: "Arrowhead Stadium" },
  { id: "wc26_j_austria_vs_jordania",          homeTeam: "Austria",                 awayTeam: "Jordania",            kickoffISO: "2026-06-17T04:00:00Z", city: "Santa Clara",       stadiumName: "Levi's Stadium" },
  { id: "wc26_j_argentina_vs_austria",         homeTeam: "Argentina",               awayTeam: "Austria",             kickoffISO: "2026-06-22T17:00:00Z", city: "Arlington",         stadiumName: "AT&T Stadium" },
  { id: "wc26_j_jordania_vs_argelia",          homeTeam: "Jordania",                awayTeam: "Argelia",             kickoffISO: "2026-06-23T03:00:00Z", city: "Santa Clara",       stadiumName: "Levi's Stadium" },
  { id: "wc26_j_jordania_vs_argentina",        homeTeam: "Jordania",                awayTeam: "Argentina",           kickoffISO: "2026-06-27T02:00:00Z", city: "Arlington",         stadiumName: "AT&T Stadium" },
  { id: "wc26_j_argelia_vs_austria",           homeTeam: "Argelia",                 awayTeam: "Austria",             kickoffISO: "2026-06-27T02:00:00Z", city: "Kansas City",       stadiumName: "Arrowhead Stadium" },
  // Grupo K
  { id: "wc26_k_portugal_vs_rdcongo",          homeTeam: "Portugal",                awayTeam: "R.D. Congo",          kickoffISO: "2026-06-17T17:00:00Z", city: "Houston",           stadiumName: "NRG Stadium" },
  { id: "wc26_k_uzbekistan_vs_colombia",       homeTeam: "Uzbekistán",              awayTeam: "Colombia",            kickoffISO: "2026-06-18T02:00:00Z", city: "Ciudad de México",  stadiumName: "Estadio Azteca" },
  { id: "wc26_k_portugal_vs_uzbekistan",       homeTeam: "Portugal",                awayTeam: "Uzbekistán",          kickoffISO: "2026-06-23T17:00:00Z", city: "Houston",           stadiumName: "NRG Stadium" },
  { id: "wc26_k_colombia_vs_rdcongo",          homeTeam: "Colombia",                awayTeam: "R.D. Congo",          kickoffISO: "2026-06-24T02:00:00Z", city: "Guadalajara",       stadiumName: "Estadio Akron" },
  { id: "wc26_k_colombia_vs_portugal",         homeTeam: "Colombia",                awayTeam: "Portugal",            kickoffISO: "2026-06-27T23:30:00Z", city: "Miami",             stadiumName: "Hard Rock Stadium" },
  { id: "wc26_k_rdcongo_vs_uzbekistan",        homeTeam: "R.D. Congo",              awayTeam: "Uzbekistán",          kickoffISO: "2026-06-27T23:30:00Z", city: "Atlanta",           stadiumName: "Mercedes-Benz Stadium" },
  // Grupo L
  { id: "wc26_l_inglaterra_vs_croacia",        homeTeam: "Inglaterra",              awayTeam: "Croacia",             kickoffISO: "2026-06-17T20:00:00Z", city: "Arlington",         stadiumName: "AT&T Stadium" },
  { id: "wc26_l_ghana_vs_panama",              homeTeam: "Ghana",                   awayTeam: "Panamá",              kickoffISO: "2026-06-17T23:00:00Z", city: "Toronto",           stadiumName: "BMO Field" },
  { id: "wc26_l_inglaterra_vs_ghana",          homeTeam: "Inglaterra",              awayTeam: "Ghana",               kickoffISO: "2026-06-23T20:00:00Z", city: "Foxborough",        stadiumName: "Gillette Stadium" },
  { id: "wc26_l_panama_vs_croacia",            homeTeam: "Panamá",                  awayTeam: "Croacia",             kickoffISO: "2026-06-23T23:00:00Z", city: "Toronto",           stadiumName: "BMO Field" },
  { id: "wc26_l_inglaterra_vs_panama",         homeTeam: "Inglaterra",              awayTeam: "Panamá",              kickoffISO: "2026-06-27T21:00:00Z", city: "East Rutherford",   stadiumName: "MetLife Stadium" },
  { id: "wc26_l_croacia_vs_ghana",             homeTeam: "Croacia",                 awayTeam: "Ghana",               kickoffISO: "2026-06-27T21:00:00Z", city: "Philadelphia",      stadiumName: "Lincoln Financial Field" },
];

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncLoading, setSyncLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  
  // New Match Form State
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [kickoffTime, setKickoffTime] = useState("");
  const [phase, setPhase] = useState<MatchPhase>("group");
  const [city, setCity] = useState("");
  const [stadiumName, setStadiumName] = useState("");
  const [refereeName, setRefereeName] = useState("");
  const [refereeCountry, setRefereeCountry] = useState("");

  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
        return;
      }
      
      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          const u = userDoc.data() as User;
          if (!u.isAdmin) {
            router.push("/dashboard");
            return;
          }
          setUser(u);
        } else {
          router.push("/dashboard");
          return;
        }

        // Fetch Matches
        const matchesSnapshot = await getDocs(collection(db, "matches"));
        const matchesData: Match[] = [];
        matchesSnapshot.forEach((doc) => {
          matchesData.push({ id: doc.id, ...doc.data() } as Match);
        });
        
        matchesData.sort((a, b) => {
          const timeA = a.kickoffTime instanceof Date ? a.kickoffTime.getTime() : (a.kickoffTime as any).toMillis();
          const timeB = b.kickoffTime instanceof Date ? b.kickoffTime.getTime() : (b.kickoffTime as any).toMillis();
          return timeB - timeA; // Descending
        });
        setMatches(matchesData);

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
        const kickoffMs = m.kickoffTime instanceof Date ? m.kickoffTime.getTime() : (m.kickoffTime as any).toMillis();
        
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

  const handleSyncMatchesFromAPI = async () => {
    const existingIds = new Set(matches.map(m => m.id));
    const toInsert = WC2026_GROUP_MATCHES.filter(m => !existingIds.has(m.id));

    if (toInsert.length === 0) {
      alert("Todos los partidos de la fase de grupos ya están en la base de datos.");
      return;
    }

    if (!confirm(`Se agregarán ${toInsert.length} partidos del Mundial 2026 (fase de grupos). ¿Continuar?`)) return;

    setSyncLoading(true);
    try {
      const batch = writeBatch(db);
      const newMatchesData: Match[] = [];

      toInsert.forEach((m) => {
        const kickoff = new Date(m.kickoffISO);
        const now = new Date();
        const status: Match["status"] = kickoff <= now ? "locked" : "upcoming";

        const matchPayload: Match = {
          id: m.id,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          kickoffTime: kickoff,
          status,
          homeScore: null,
          awayScore: null,
          phase: "group",
          city: m.city,
          stadiumName: m.stadiumName,
          refereeName: "Por Definir",
          refereeCountry: "",
          resolutionMethod: null,
        };

        batch.set(doc(db, "matches", m.id), matchPayload);
        newMatchesData.push(matchPayload);
      });

      await batch.commit();

      const combined = [...newMatchesData, ...matches];
      combined.sort((a, b) => {
        const timeA = a.kickoffTime instanceof Date ? a.kickoffTime.getTime() : (a.kickoffTime as any).toMillis();
        const timeB = b.kickoffTime instanceof Date ? b.kickoffTime.getTime() : (b.kickoffTime as any).toMillis();
        return timeB - timeA;
      });
      setMatches(combined);
      alert(`¡${toInsert.length} partidos de la Fase de Grupos del Mundial 2026 importados con éxito!`);
    } catch (err) {
      console.error(err);
      alert("Error al importar el calendario.");
    } finally {
      setSyncLoading(false);
    }
  };

  // One-time migration: backfill the public inviteCodes/{CODE} -> { groupId }
  // lookup for groups that were created before the lookup collection existed.
  // Safe to run repeatedly (only writes missing codes).
  const handleBackfillInviteCodes = async () => {
    setBackfillLoading(true);
    try {
      const groupsSnapshot = await getDocs(collection(db, "groups"));
      const batch = writeBatch(db);
      let toWrite = 0;

      for (const groupDoc of groupsSnapshot.docs) {
        const code = (groupDoc.data().inviteCode as string | undefined)?.toUpperCase();
        if (!code) continue;
        const codeSnap = await getDoc(doc(db, "inviteCodes", code));
        if (codeSnap.exists()) continue;
        batch.set(doc(db, "inviteCodes", code), { code, groupId: groupDoc.id });
        toWrite++;
      }

      if (toWrite === 0) {
        alert("No hay códigos pendientes. Todos los grupos ya tienen su código de invitación registrado.");
        return;
      }

      await batch.commit();
      alert(`Migración completada: se registraron ${toWrite} código(s) de invitación.`);
    } catch (err) {
      console.error(err);
      alert("Error al migrar los códigos de invitación.");
    } finally {
      setBackfillLoading(false);
    }
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const matchId = `match_${Date.now()}`;
      const payload: Match = {
        id: matchId,
        homeTeam,
        awayTeam,
        kickoffTime: new Date(kickoffTime),
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
      alert("¡Partido creado con éxito!");
      // Reset form
      setHomeTeam(""); setAwayTeam(""); setKickoffTime(""); setCity(""); setStadiumName(""); setRefereeName(""); setRefereeCountry("");
    } catch (err) {
      console.error(err);
      alert("Error al crear el partido.");
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

      // 2. Calculate points for all predictions for this match
      const q = query(collection(db, "predictions"), where("matchId", "==", matchId));
      const predsSnapshot = await getDocs(q);
      
      const userIds = new Set<string>();
      const batch = writeBatch(db);
      predsSnapshot.forEach((predDoc) => {
        const predData = predDoc.data() as Prediction;
        userIds.add(predData.userId);
        const points = calculatePoints(predData.predictedHomeScore, predData.predictedAwayScore, hScore, aScore);
        
        const pRef = doc(db, "predictions", predDoc.id);
        batch.update(pRef, { pointsEarned: points });
      });

      await batch.commit();

      // 3. Recalculate global totalPoints and exactGuesses for each affected user
      for (const userId of userIds) {
        const userPredsQuery = query(collection(db, "predictions"), where("userId", "==", userId));
        const userPredsSnapshot = await getDocs(userPredsQuery);
        
        let totalPoints = 0;
        let exactGuesses = 0;
        
        userPredsSnapshot.forEach((doc) => {
          const pred = doc.data() as Prediction;
          let points = pred.pointsEarned;
          
          // Override with current score calculation to avoid write-propagation latency
          if (pred.matchId === matchId) {
            points = calculatePoints(pred.predictedHomeScore, pred.predictedAwayScore, hScore, aScore);
          }
          
          if (points !== null) {
            totalPoints += points;
            if (points === 3) {
              exactGuesses += 1;
            }
          }
        });
        
        await updateDoc(doc(db, "users", userId), {
          totalPoints,
          exactGuesses
        });
      }

      // 4. Send automatic score update notification to ALL registered users
      try {
        const currentMatch = matches.find(m => m.id === matchId);
        const homeTeamName = currentMatch?.homeTeam || "Equipo Local";
        const awayTeamName = currentMatch?.awayTeam || "Equipo Visitante";

        const usersSnapshot = await getDocs(collection(db, "users"));
        const notifBatch = writeBatch(db);

        usersSnapshot.forEach((userDoc) => {
          const uId = userDoc.id;
          const notifId = `notif_score_${matchId}_${Date.now()}`;
          const notifRef = doc(db, "users", uId, "notifications", notifId);

          notifBatch.set(notifRef, {
            id: notifId,
            userId: uId,
            title: "Marcador Actualizado ⚽",
            message: `El partido ${homeTeamName} vs ${awayTeamName} finalizó ${hScore} - ${aScore}. ¡Ingresa a revisar tus puntos!`,
            timestamp: new Date(),
            read: false,
            type: "score_update"
          });
        });

        await notifBatch.commit();
      } catch (notifErr) {
        console.error("Error creating score finalization notifications:", notifErr);
      }

      setMatches(matches.map(m => m.id === matchId ? { ...m, homeScore: hScore, awayScore: aScore, status: "finished", resolutionMethod } : m));
      alert("¡Marcador actualizado, puntos recalculados y notificaciones enviadas con éxito!");

    } catch (err) {
      console.error(err);
      alert("Error al actualizar el marcador.");
    }
  };

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Cargando...</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Panel de Administración</h1>
          <button onClick={() => router.push("/dashboard")} className="text-emerald-400 hover:text-emerald-300">Volver al Tablero</button>
        </div>

        {/* Sync API Section */}
        <section className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-xl font-semibold text-emerald-400">Automatización del Calendario</h2>
            <p className="text-xs text-gray-400 mt-1">Importa los 72 partidos oficiales de la Fase de Grupos del Mundial 2026 en Firestore (evita creación manual). Solo agrega los que falten.</p>
          </div>
          <button
            onClick={handleSyncMatchesFromAPI}
            disabled={syncLoading}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all"
          >
            {syncLoading ? "Sincronizando..." : "Sincronizar Calendario ⚽"}
          </button>
        </section>

        {/* Invite Codes Migration Section */}
        <section className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-xl font-semibold text-indigo-400">Migración: Códigos de Invitación</h2>
            <p className="text-xs text-gray-400 mt-1">Registra el código de cada grupo existente en la tabla pública de búsqueda (necesario para unirse por código con las reglas reforzadas). Solo se ejecuta una vez; es seguro repetirlo.</p>
          </div>
          <button
            onClick={handleBackfillInviteCodes}
            disabled={backfillLoading}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all"
          >
            {backfillLoading ? "Migrando..." : "Sincronizar Códigos 🔑"}
          </button>
        </section>

        {/* Create Match Form */}
        <section className="bg-white/5 p-6 rounded-xl border border-white/10">
          <h2 className="text-xl font-semibold mb-6">Crear Nuevo Partido</h2>
          <form onSubmit={handleCreateMatch} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="text-sm text-gray-400">Equipo Local</label><input required value={homeTeam} onChange={e=>setHomeTeam(e.target.value)} className="w-full mt-1 px-3 py-2 bg-black/50 border border-white/10 rounded" /></div>
            <div><label className="text-sm text-gray-400">Equipo Visitante</label><input required value={awayTeam} onChange={e=>setAwayTeam(e.target.value)} className="w-full mt-1 px-3 py-2 bg-black/50 border border-white/10 rounded" /></div>
            <div><label className="text-sm text-gray-400">Hora de Inicio</label><input type="datetime-local" required value={kickoffTime} onChange={e=>setKickoffTime(e.target.value)} className="w-full mt-1 px-3 py-2 bg-black/50 border border-white/10 rounded" /></div>
            <div><label className="text-sm text-gray-400">Fase</label>
              <select value={phase} onChange={e=>setPhase(e.target.value as MatchPhase)} className="w-full mt-1 px-3 py-2 bg-black/50 border border-white/10 rounded">
                <option value="group">Fase de Grupos</option>
                <option value="round_of_16">Octavos de Final</option>
                <option value="quarter_finals">Cuartos de Final</option>
                <option value="semi_finals">Semifinales</option>
                <option value="finals">Gran Final</option>
              </select>
            </div>
            <div><label className="text-sm text-gray-400">Ciudad</label><input required value={city} onChange={e=>setCity(e.target.value)} className="w-full mt-1 px-3 py-2 bg-black/50 border border-white/10 rounded" /></div>
            <div><label className="text-sm text-gray-400">Estadio</label><input required value={stadiumName} onChange={e=>setStadiumName(e.target.value)} className="w-full mt-1 px-3 py-2 bg-black/50 border border-white/10 rounded" /></div>
            <div><label className="text-sm text-gray-400">Nombre del Árbitro</label><input required value={refereeName} onChange={e=>setRefereeName(e.target.value)} className="w-full mt-1 px-3 py-2 bg-black/50 border border-white/10 rounded" /></div>
            <div><label className="text-sm text-gray-400">País del Árbitro</label><input required value={refereeCountry} onChange={e=>setRefereeCountry(e.target.value)} className="w-full mt-1 px-3 py-2 bg-black/50 border border-white/10 rounded" /></div>
            <div className="md:col-span-2 pt-4">
              <button type="submit" className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded font-medium">Agregar Partido</button>
            </div>
          </form>
        </section>

        {/* Manage Matches */}
        <section>
          <h2 className="text-xl font-semibold mb-6">Gestionar Partidos</h2>
          <div className="space-y-4">
            {matches.map(match => (
              <div key={match.id} className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col md:flex-row gap-6 items-center">
                <div className="flex-1">
                  <div className="text-sm text-emerald-400">{(PHASE_TRANSLATIONS[match.phase] || match.phase).toUpperCase()}</div>
                  <div className="text-lg font-bold">{match.homeTeam} vs {match.awayTeam}</div>
                  <div className="text-sm text-gray-400">{new Date(match.kickoffTime instanceof Date ? match.kickoffTime : (match.kickoffTime as any).toMillis()).toLocaleString()}</div>
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
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function MatchScoreUpdater({ match, onUpdate }: { match: Match, onUpdate: (id: string, hs: string, as: string, res: ResolutionMethod) => void }) {
  const [hScore, setHScore] = useState(match.homeScore?.toString() || "");
  const [aScore, setAScore] = useState(match.awayScore?.toString() || "");
  const [res, setRes] = useState<ResolutionMethod>("normal");

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
      <button onClick={() => onUpdate(match.id, hScore, aScore, res)} className="h-10 px-4 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium">Actualizar</button>
    </div>
  );
}
