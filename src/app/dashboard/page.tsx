"use client";

// Dashboard — reescritura limpia sobre el design system (Fase 6d).
// Shell responsiva (sidebar ≥lg / bottom-bar mobile) + Inicio (tu campeón, En
// vivo con pronósticos del grupo, Hoy, Próximos) + Pronósticos (carga/edición
// con filtros) + Perfil. Tabla se reescribe en la próxima parte. La versión
// anterior, intacta, vive en /dashboard_old.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, query, where, onSnapshot, writeBatch, arrayUnion } from "firebase/firestore";
import { parseDoc, parseDocs } from "@/lib/parse";
import { userSchema, groupSchema, predictionSchema, notificationSchema, championSchema, matchSchema } from "@/lib/schemas";
import { calculateGroupScores } from "@/lib/scoring";
import { WORLD_CUP_TEAMS } from "@/lib/flags";
import { isChampionLocked } from "@/lib/config";
import { RESOLUTION_TRANSLATIONS, DEFAULT_GROUP_RULES, isKnockoutPhase, MATCH_MAX_DURATION_MIN, matchInGroupScope, phaseIndex, groupStartPhase } from "@/lib/constants";
import { getActiveGroupId, setActiveGroupId } from "@/lib/active-group";
import { enablePushNotifications, pushIsSupported } from "@/lib/messaging";
import { toMs, formatKickoffDateTime } from "@/lib/dates";
import type { User, Group, Match, Prediction } from "@/types";
import { Button, Card, Input, FormLabel, AlertBanner, Badge, Spinner, EmptyState, Select, Toast, cn } from "@/components/ui";
import {
  GroupSelector,
  MatchCard,
  MatchTeams,
  PhaseLabel,
  MatchStatusBadge,
  MatchPredictionRow,
  PageHeader,
  ChampionPick,
  Leaderboard,
  GroupSummary,
  KnockoutScoringCard,
} from "@/components/domain";
import {
  AppShell,
  ThemeToggle,
  NotificationsBell,
  RefreshButton,
  HomeIcon,
  PredictionsIcon,
  TableIcon,
  GroupsIcon,
  ProfileIcon,
  AlbumIcon,
  type NavItem,
} from "@/components/shell";

type Tab = "home" | "predictions" | "table" | "profile";
type PredStatus = "abiertos" | "jugados" | "todos";

const Brand = () => (
  <span className="font-display text-lg font-extrabold tracking-tight text-ink">
    Polla <span className="text-[var(--accent)]">2026</span>
  </span>
);

const Section = ({ title, live, children }: { title: string; live?: boolean; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
      {live && <span className="inline-block h-2 w-2 rounded-full bg-danger motion-safe:animate-pulse" aria-hidden />}
      {title}
    </h2>
    {children}
  </section>
);

function sameDay(a: number, b: number) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

// Letra de grupo a partir del id del partido (wc26_a_… → "A").
const groupLetterOf = (m: Match): string | null => {
  const r = /^wc26_([a-l])_/i.exec(m.id);
  return r ? r[1].toUpperCase() : null;
};

const PRED_PHASES: { key: string; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "group", label: "Grupos" },
  { key: "round_of_16", label: "Octavos" },
  { key: "quarter_finals", label: "Cuartos" },
  { key: "semi_finals", label: "Semis" },
  { key: "finals", label: "Final" },
];

// Normaliza para buscar sin tildes ni mayúsculas (méxico ↔ mexico).
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Frase motivacional según la posición en la tabla (tú, paceño).
function rankPhrase(rank: number, total: number): string {
  if (rank === 1) return "Vas primero";
  if (rank <= 3) return "Estás en el podio";
  if (rank <= Math.ceil(total / 2)) return "Vas muy bien";
  if (rank === total) return "A no aflojar";
  return "A remontar";
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<User | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  // Tus pronósticos por grupo: [groupId][matchId] -> Prediction.
  const [predictionsByGroup, setPredictionsByGroup] = useState<Record<string, Record<string, Prediction>>>({});
  // Campeón elegido por grupo (groupId -> equipo).
  const [championsByGroup, setChampionsByGroup] = useState<Record<string, string>>({});
  const [savingChampion, setSavingChampion] = useState(false);
  // Pronósticos de TODO el grupo activo, para "En vivo": matchId -> uid -> Prediction.
  const [groupPreds, setGroupPreds] = useState<Record<string, Record<string, Prediction>>>({});
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; read: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("home");

  // Perfil: estado de notificaciones push + form de edición.
  const [pushState, setPushState] = useState<
    "idle" | "working" | "granted" | "denied" | "unsupported" | "no-vapid" | "error"
  >("idle");
  const [editName, setEditName] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editBarrio, setEditBarrio] = useState("");
  const [editAge, setEditAge] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Tab Pronósticos: borradores en edición + estado de guardado + filtros.
  // El borrador incluye `qualifier` (pick "clasifica") para partidos de eliminación.
  const [predDrafts, setPredDrafts] = useState<Record<string, { home: number | null; away: number | null; qualifier: "home" | "away" | null }>>({});
  const [savingPred, setSavingPred] = useState<Record<string, boolean>>({});
  // Marca inline por partido (bajo el botón de la card): flash de éxito que se
  // auto-oculta, y error que persiste hasta el siguiente intento.
  const [savedPred, setSavedPred] = useState<Record<string, boolean>>({});
  const [predError, setPredError] = useState<Record<string, string | null>>({});
  // Toast global de feedback al guardar/actualizar una predicción. Un solo
  // timer: guardar varias seguidas reinicia el auto-cierre, no lo corta.
  const [toast, setToast] = useState<{ tone: "success" | "error"; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Botón "Actualizar tabla": re-lee el doc del grupo (miembros + reglas).
  const [refreshing, setRefreshing] = useState(false);
  const [predStatus, setPredStatus] = useState<PredStatus>("abiertos");
  const [predPhase, setPredPhase] = useState<string>("all");
  const [predLetter, setPredLetter] = useState<string>("all");
  const [predLimit, setPredLimit] = useState(10);
  const [predSearch, setPredSearch] = useState("");
  // Partidos jugados con el panel de "pronósticos del grupo" abierto (set de matchId).
  const [openGroupPreds, setOpenGroupPreds] = useState<Set<string>>(() => new Set());

  // Invitación pendiente por confirmar — viene de ?join=CODE (link seguido ya
  // logueado o justo tras el registro) o, como respaldo, del código que admitió
  // esta cuenta (inviteId). El registro NO une al grupo: eso se confirma aquí.
  const [pendingInvite, setPendingInvite] = useState<{ code: string; groupId: string; groupName: string } | null>(null);
  const [joiningPending, setJoiningPending] = useState(false);
  const [pendingDismissed, setPendingDismissed] = useState(false);
  const [pendingError, setPendingError] = useState("");

  // Reloj liviano (30s) para clasificar partidos en vivo / hoy / próximos.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Deep-link de tab desde otra ruta (p. ej. /grupos → /dashboard?tab=table).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "home" || t === "predictions" || t === "table" || t === "profile") setTab(t);
  }, []);

  // Capacidad/permiso de push de este dispositivo (estado para el Perfil).
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

  // Sembrar el form de edición cuando carga/cambia el perfil.
  useEffect(() => {
    if (!dbUser) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditName(dbUser.displayName ?? "");
    setEditCity(dbUser.city ?? "");
    setEditBarrio(dbUser.neighborhood ?? "");
    setEditAge(dbUser.age != null ? String(dbUser.age) : "");
  }, [dbUser]);

  // Auth + carga inicial (perfil, grupos, partidos, tus pronósticos, tu campeón).
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/");
        return;
      }
      setUser(u);
      try {
        const [userDoc, groupSnap, predsSnap, champsSnap] = await Promise.all([
          getDoc(doc(db, "users", u.uid)),
          getDocs(query(collection(db, "groups"), where("members", "array-contains", u.uid))),
          getDocs(query(collection(db, "predictions"), where("userId", "==", u.uid))),
          getDocs(query(collection(db, "champions"), where("userId", "==", u.uid))),
        ]);
        setDbUser(parseDoc(userSchema, userDoc));
        const gs = parseDocs(groupSchema, groupSnap);
        setGroups(gs);
        const wantedGroup = new URLSearchParams(window.location.search).get("group") ?? getActiveGroupId();
        const chosen = gs.find((g) => g.id === wantedGroup) ?? gs[0] ?? null;
        setSelectedGroup(chosen);
        if (chosen) setActiveGroupId(chosen.id);

        // Resolver una invitación pendiente: ?join=CODE gana; si no, el código
        // que admitió la cuenta (inviteId). Dispara la tarjeta "confirmar y
        // unirme" solo si aún no eres miembro del grupo que ofrece. Fire-and-
        // forget: no debe demorar el render del dashboard.
        const joinCode =
          new URLSearchParams(window.location.search).get("join")?.trim() ||
          (userDoc.data()?.inviteId as string | undefined) ||
          null;
        if (joinCode) {
          getDoc(doc(db, "invites", joinCode))
            .then((invSnap) => {
              if (!invSnap.exists()) return;
              const inv = invSnap.data();
              const gid = (inv.groupId as string | null) ?? null;
              if (gid && !gs.some((g) => g.id === gid)) {
                setPendingInvite({ code: joinCode, groupId: gid, groupName: (inv.groupName as string) || "tu grupo" });
              }
            })
            .catch((e) => console.error("Error resolviendo invitación pendiente:", e));
        }
        // OJO: `matches` NO se carga acá. Viene SOLO del onSnapshot (más abajo).
        // Antes esto hacía `setMatches(await getMatches())`, pero ese fetch a
        // /api/matches es lento (~1.5s) y a veces stale, y pisaba el dato fresco
        // que el listener ya había emitido → partidos "cacheados" hasta recargar.
        const byGroup: Record<string, Record<string, Prediction>> = {};
        parseDocs(predictionSchema, predsSnap).forEach((p) => {
          if (p.groupId) (byGroup[p.groupId] ??= {})[p.matchId] = p;
        });
        setPredictionsByGroup(byGroup);
        const champByGroup: Record<string, string> = {};
        parseDocs(championSchema, champsSnap).forEach((c) => {
          if (c.groupId && c.champion) champByGroup[c.groupId] = c.champion;
        });
        setChampionsByGroup(champByGroup);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  // Notificaciones en vivo (subcolección del usuario). El unsub se guarda en un
  // ref para poder desmontar el listener ANTES de cerrar sesión: si no, al
  // revocar el token de auth el listener sigue adjunto y Firestore dispara
  // "permission-denied" (FirebaseError: Missing or insufficient permissions).
  const notifUnsubRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      collection(db, "users", user.uid, "notifications"),
      (snap) => {
        const items = parseDocs(notificationSchema, snap);
        items.sort((a, b) => (b.timestamp ? toMs(b.timestamp) : 0) - (a.timestamp ? toMs(a.timestamp) : 0));
        setNotifications(items.map((n) => ({ id: n.id, title: n.title, message: n.message, read: n.read })));
      },
      // permission-denied aquí solo ocurre cuando el token ya se revocó (cierre
      // de sesión / desmontaje): es esperado y benigno, no lo registramos.
      (err) => {
        if ((err as { code?: string }).code === "permission-denied") return;
        console.error(err);
      },
    );
    notifUnsubRef.current = unsub;
    return () => {
      unsub();
      notifUnsubRef.current = null;
    };
  }, [user]);

  // Partidos: este onSnapshot es la ÚNICA fuente de `matches`. Con
  // persistentLocalCache la 1ª emisión sale de IndexedDB al instante (paint
  // rápido) y luego sincroniza del server, así que cuando el admin carga un
  // resultado o se bloquea un partido se refleja solo, sin recargar. No usamos
  // getMatches()/api/matches acá: ese fetch lento y a veces stale pisaba el dato
  // fresco del listener → "partidos cacheados". El unsub va en un ref para
  // desmontarlo ANTES de signOut (si no, Firestore dispara permission-denied).
  const matchesUnsubRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      collection(db, "matches"),
      (snap) => {
        const live = parseDocs(matchSchema, snap);
        live.sort((a, b) => toMs(a.kickoffTime) - toMs(b.kickoffTime));
        setMatches(live);
      },
      (err) => {
        if ((err as { code?: string }).code === "permission-denied") return;
        console.error("Error al escuchar partidos:", err);
      },
    );
    matchesUnsubRef.current = unsub;
    return () => {
      unsub();
      matchesUnsubRef.current = null;
    };
  }, [user]);

  // Pronósticos de TODO el grupo activo, VIVOS (para la tabla y "En vivo"): un
  // onSnapshot mantiene groupPreds fresco cuando cualquier integrante carga o
  // cambia un pronóstico, así la tabla no queda con una foto vieja. Unsub en un
  // ref para desmontarlo antes de signOut (evita permission-denied). Se
  // re-suscribe solo al cambiar de grupo (clave = id), no al refrescar el doc.
  const selectedGroupId = selectedGroup?.id;
  const groupPredsUnsubRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    // Sin grupo no adjuntamos listener; groupPreds se limpia en el efecto de
    // nombres (corre en el mismo cambio de selectedGroup). Al cambiar de grupo,
    // el nuevo onSnapshot reemplaza groupPreds al instante (cache).
    if (!selectedGroupId) return;
    const unsub = onSnapshot(
      query(collection(db, "predictions"), where("groupId", "==", selectedGroupId)),
      (snap) => {
        const byMatch: Record<string, Record<string, Prediction>> = {};
        parseDocs(predictionSchema, snap).forEach((p) => {
          (byMatch[p.matchId] ??= {})[p.userId] = p;
        });
        setGroupPreds(byMatch);
      },
      (err) => {
        if ((err as { code?: string }).code === "permission-denied") return;
        console.error("Error al escuchar pronósticos del grupo:", err);
      },
    );
    groupPredsUnsubRef.current = unsub;
    return () => {
      unsub();
      groupPredsUnsubRef.current = null;
    };
  }, [selectedGroupId]);

  // Nombres de integrantes (para la tabla y "En vivo"). Lectura puntual: cambian
  // poco; se recargan al cambiar de grupo o al tocar "Actualizar" (que re-lee el
  // doc del grupo → nuevo selectedGroup → este efecto corre de nuevo).
  useEffect(() => {
    const members = selectedGroup?.members;
    if (!members || members.length === 0) {
      setMemberNames({});
      setGroupPreds({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const docs = await Promise.all(members.map((uid) => getDoc(doc(db, "users", uid))));
        if (cancelled) return;
        const names: Record<string, string> = {};
        docs.forEach((d) => {
          const u = parseDoc(userSchema, d);
          names[d.id] = u?.displayName || "—";
        });
        setMemberNames(names);
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedGroup]);

  // Partidos que este grupo juega: se ocultan (de la vista, el pronóstico y la
  // tabla) los partidos anteriores a su fase de arranque. Un grupo "desde
  // cuartos" nunca ve grupos/octavos. Grupos sin startPhase juegan todo.
  const visibleMatches = useMemo(
    () => (selectedGroup ? matches.filter((m) => matchInGroupScope(m, selectedGroup)) : matches),
    [matches, selectedGroup],
  );

  // Tabla: posiciones del grupo, recalculadas desde predicciones + resultados
  // (calculateGroupScores honra las reglas del grupo). Ordena por puntos, luego
  // doradas, luego nombre.
  const standings = useMemo(() => {
    if (!selectedGroup) return [];
    const preds = Object.values(groupPreds).flatMap((byUid) => Object.values(byUid));
    const rules = selectedGroup.rules ?? DEFAULT_GROUP_RULES;
    const scores = calculateGroupScores(selectedGroup.id, selectedGroup.members, visibleMatches, preds, rules);
    return selectedGroup.members
      .map((uid) => {
        const s = scores[uid] ?? { totalPoints: 0, exactGuesses: 0 };
        return { uid, name: memberNames[uid] ?? "—", points: s.totalPoints, exact: s.exactGuesses };
      })
      .sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name));
  }, [selectedGroup, groupPreds, visibleMatches, memberNames]);

  const name = dbUser?.displayName || user?.displayName || user?.email?.split("@")[0] || "jugador";

  const nav: NavItem[] = [
    { key: "home", label: "Inicio", icon: <HomeIcon /> },
    { key: "predictions", label: "Pronósticos", icon: <PredictionsIcon /> },
    { key: "table", label: "Tabla", icon: <TableIcon /> },
    { key: "album", label: "Álbum", icon: <AlbumIcon /> },
    { key: "groups", label: "Grupos", icon: <GroupsIcon /> },
    { key: "profile", label: "Perfil", icon: <ProfileIcon /> },
  ];

  function handleNav(key: string) {
    if (key === "album") {
      router.push("/album");
      return;
    }
    if (key === "groups") {
      router.push("/grupos");
      return;
    }
    setTab(key as Tab);
  }

  const onGroup = (id: string) => {
    setSelectedGroup(groups.find((g) => g.id === id) ?? null);
    setActiveGroupId(id);
    setPredDrafts({});
    // El nuevo grupo puede no jugar la fase filtrada actual (p. ej. venías de un
    // grupo con "Octavos" seleccionado y este arranca en cuartos). Reset a "Todas".
    setPredPhase("all");
    setPredLetter("all");
  };

  async function handleSignOut() {
    // Desmontar los listeners (notificaciones + partidos + pronósticos del
    // grupo) ANTES de revocar el token, para evitar el "permission-denied" que
    // dispara Firestore si siguen adjuntos.
    notifUnsubRef.current?.();
    notifUnsubRef.current = null;
    matchesUnsubRef.current?.();
    matchesUnsubRef.current = null;
    groupPredsUnsubRef.current?.();
    groupPredsUnsubRef.current = null;
    await signOut(auth);
    router.replace("/");
  }

  // "Actualizar": re-lee de una lo que NO es vivo — grupos, TUS pronósticos y tu
  // campeón (los partidos y los pronósticos del grupo ya vienen por onSnapshot).
  // Refresca miembros/reglas del grupo activo y recalcula la tabla. Se usa en
  // Inicio, Pronósticos y Tabla. Feedback con toast.
  async function refresh() {
    if (!user) return;
    setRefreshing(true);
    try {
      const [groupSnap, predsSnap, champsSnap] = await Promise.all([
        getDocs(query(collection(db, "groups"), where("members", "array-contains", user.uid))),
        getDocs(query(collection(db, "predictions"), where("userId", "==", user.uid))),
        getDocs(query(collection(db, "champions"), where("userId", "==", user.uid))),
      ]);
      const gs = parseDocs(groupSchema, groupSnap);
      setGroups(gs);
      // Mantener el grupo activo (con su doc fresco: miembros/reglas); si ya no
      // soy miembro, caer al primero.
      setSelectedGroup((prev) => gs.find((g) => g.id === prev?.id) ?? gs[0] ?? null);
      const byGroup: Record<string, Record<string, Prediction>> = {};
      parseDocs(predictionSchema, predsSnap).forEach((p) => {
        if (p.groupId) (byGroup[p.groupId] ??= {})[p.matchId] = p;
      });
      setPredictionsByGroup(byGroup);
      const champByGroup: Record<string, string> = {};
      parseDocs(championSchema, champsSnap).forEach((c) => {
        if (c.groupId && c.champion) champByGroup[c.groupId] = c.champion;
      });
      setChampionsByGroup(champByGroup);
      showToast("success", "Actualizado");
    } catch (err) {
      console.error(err);
      showToast("error", "No se pudo actualizar. Revisa tu conexión.");
    } finally {
      setRefreshing(false);
    }
  }

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
            : "error",
    );
  };

  async function handleSaveProfile() {
    if (!user) return;
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      const ageNum = parseInt(editAge, 10);
      const hasAge = editAge.trim() !== "" && !Number.isNaN(ageNum);
      const patch: Record<string, unknown> = {
        displayName: editName.trim() || (dbUser?.displayName ?? "Usuario"),
        city: editCity.trim(),
        neighborhood: editBarrio.trim(),
      };
      if (hasAge) patch.age = ageNum;
      await updateDoc(doc(db, "users", user.uid), patch);
      setDbUser((prev) =>
        prev
          ? {
              ...prev,
              displayName: editName.trim() || prev.displayName,
              city: editCity.trim(),
              neighborhood: editBarrio.trim(),
              age: hasAge ? ageNum : prev.age,
            }
          : prev,
      );
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingProfile(false);
    }
  }

  async function markAllRead() {
    if (!user) return;
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(doc(db, "users", user.uid, "notifications", n.id), { read: true }));
    await batch.commit().catch((e) => console.error(e));
  }

  async function handleSaveChampion(team: string) {
    if (!user || !selectedGroup || isChampionLocked()) return;
    setSavingChampion(true);
    try {
      const champId = `${user.uid}_${selectedGroup.id}`;
      await setDoc(doc(db, "champions", champId), {
        id: champId,
        userId: user.uid,
        groupId: selectedGroup.id,
        champion: team,
        timestamp: new Date(),
      });
      setChampionsByGroup((prev) => ({ ...prev, [selectedGroup.id]: team }));
    } catch (err) {
      console.error(err);
    } finally {
      setSavingChampion(false);
    }
  }

  // Confirmar la unión al grupo que ofrece la invitación. Agregar solo tu propio
  // uid está permitido por las reglas (y topado por el límite de miembros); un
  // rechazo aquí significa que el grupo está lleno. Al unirte, seleccionamos el
  // grupo, saltamos a la tabla y soltamos el ?join= de la URL.
  const handleConfirmJoin = async () => {
    if (!pendingInvite || !user) return;
    setJoiningPending(true);
    setPendingError("");
    try {
      await updateDoc(doc(db, "groups", pendingInvite.groupId), { members: arrayUnion(user.uid) });
      const gSnap = await getDoc(doc(db, "groups", pendingInvite.groupId));
      const joined = parseDoc(groupSchema, gSnap);
      if (joined) {
        setGroups((prev) => (prev.some((g) => g.id === joined.id) ? prev : [...prev, joined]));
        setSelectedGroup(joined);
        setActiveGroupId(joined.id);
      }
      setPendingInvite(null);
      router.replace("/dashboard"); // suelta el ?join=
      setTab("table");
    } catch (err) {
      console.error(err);
      setPendingError("No pudimos unirte a este grupo. Es posible que ya esté lleno.");
    } finally {
      setJoiningPending(false);
    }
  };

  // Valor a mostrar/editar en el ScoreInput: borrador > guardado > vacío.
  const predValue = (matchId: string): { home: number | null; away: number | null; qualifier: "home" | "away" | null } => {
    if (predDrafts[matchId]) return predDrafts[matchId];
    const saved = selectedGroup ? predictionsByGroup[selectedGroup.id]?.[matchId] : undefined;
    return saved
      ? { home: saved.predictedHomeScore, away: saved.predictedAwayScore, qualifier: saved.predictedQualifier }
      : { home: null, away: null, qualifier: null };
  };

  // Score and qualifier edits each merge into the draft, preserving the other.
  const onPredChange = (matchId: string, next: { home: number; away: number }) =>
    setPredDrafts((prev) => ({ ...prev, [matchId]: { ...predValue(matchId), ...next } }));

  const onQualifierChange = (matchId: string, qualifier: "home" | "away") =>
    setPredDrafts((prev) => ({ ...prev, [matchId]: { ...predValue(matchId), qualifier } }));

  // Muestra el toast y (re)programa su auto-cierre a los 3s.
  function showToast(tone: "success" | "error", msg: string) {
    setToast({ tone, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  async function savePrediction(matchId: string) {
    if (!user || !selectedGroup) return;
    const gid = selectedGroup.id;
    const val = predValue(matchId);
    if (val.home == null || val.away == null) return;
    if (val.home < 0 || val.home > 99 || val.away < 0 || val.away > 99) return;
    const m = matches.find((x) => x.id === matchId);
    if (!m || !matchInGroupScope(m, selectedGroup)) return;
    if (toMs(m.kickoffTime) <= Date.now() || m.status === "locked" || m.status === "finished") return;
    // Knockout matches require a "clasifica" pick (the MatchCard Save button is
    // already disabled until one is chosen; this guards the data layer too).
    const knockout = isKnockoutPhase(m.phase);
    if (knockout && !val.qualifier) return;
    setSavingPred((p) => ({ ...p, [matchId]: true }));
    setPredError((p) => ({ ...p, [matchId]: null }));
    try {
      const predId = `${user.uid}_${gid}_${matchId}`;
      const payload: Prediction = {
        id: predId,
        userId: user.uid,
        groupId: gid,
        matchId,
        predictedHomeScore: val.home,
        predictedAwayScore: val.away,
        predictedQualifier: knockout ? val.qualifier : null,
        pointsEarned: null,
        timestamp: new Date(),
      };
      await setDoc(doc(db, "predictions", predId), payload);
      setPredictionsByGroup((prev) => ({ ...prev, [gid]: { ...(prev[gid] || {}), [matchId]: payload } }));
      setPredDrafts((prev) => {
        const n = { ...prev };
        delete n[matchId];
        return n;
      });
      // Confirmación doble: toast flotante prominente + marca inline en la card.
      showToast("success", "Predicción guardada");
      setSavedPred((p) => ({ ...p, [matchId]: true }));
      setTimeout(() => setSavedPred((p) => ({ ...p, [matchId]: false })), 2500);
    } catch (err) {
      console.error(err);
      showToast("error", "No se pudo guardar. Revisa tu conexión.");
      setPredError((p) => ({
        ...p,
        [matchId]: "No se pudo guardar tu predicción. Revisa tu conexión e inténtalo de nuevo.",
      }));
    } finally {
      setSavingPred((p) => ({ ...p, [matchId]: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  const hasGroups = groups.length > 0;

  // Acciones comunes del header, iguales en Inicio, Pronósticos y Tabla para que
  // se vean uniformes: botón de actualizar (icono circular, solo si hay grupo) +
  // campana de notificaciones. Ambos con el mismo look de icono redondo.
  const headerActions = (
    <div className="flex items-center gap-2">
      {hasGroups && <RefreshButton onClick={refresh} refreshing={refreshing} />}
      <NotificationsBell items={notifications} onOpen={markAllRead} />
    </div>
  );

  // Subtítulo común del PageHeader: el selector de grupo (dropdown) en mobile;
  // en ≥lg vive en la sidebar, así que acá va oculto para no duplicar.
  const groupSubtitle = (empty: string) =>
    hasGroups ? (
      <div className="lg:hidden">
        <GroupSelector groups={groups} selectedGroup={selectedGroup} onChange={onGroup} label="Grupo activo" compact />
      </div>
    ) : (
      empty
    );

  // Estado efectivo para display: post-kickoff y sin resultado = "en vivo"
  // (aunque el doc siga en 'upcoming' si el auto-lock todavía no corrió). Pero
  // acotado: pasado MATCH_MAX_DURATION_MIN desde el kickoff sin resultado, ya no
  // está "en vivo" sino "esperando resultado" (el admin no cargó el marcador).
  const effStatus = (m: Match): "live" | "awaiting" | "upcoming" | "finished" => {
    if (m.status === "finished") return "finished";
    const kickoff = toMs(m.kickoffTime);
    if (kickoff > now) return "upcoming";
    return now - kickoff <= MATCH_MAX_DURATION_MIN * 60_000 ? "live" : "awaiting";
  };

  // Estado efectivo → prop del badge/MatchCard: "live" se pinta como "locked"
  // (En vivo, con pulso); el resto ("awaiting"/"upcoming"/"finished") pasa igual.
  const badgeStatus = (m: Match) => {
    const eff = effStatus(m);
    return eff === "live" ? "locked" : eff;
  };

  const predForMatch = (m: Match) => {
    const p = selectedGroup ? predictionsByGroup[selectedGroup.id]?.[m.id] : undefined;
    return p ? { home: p.predictedHomeScore, away: p.predictedAwayScore } : undefined;
  };

  const liveMatches = visibleMatches.filter((m) => effStatus(m) === "live");
  // "Hoy" = todo lo de hoy que NO está en vivo (incluye los ya jugados de hoy).
  const todayMatches = visibleMatches.filter((m) => effStatus(m) !== "live" && sameDay(toMs(m.kickoffTime), now));
  const upcomingMatches = visibleMatches
    .filter((m) => effStatus(m) === "upcoming" && !sameDay(toMs(m.kickoffTime), now))
    .slice(0, 8);

  const renderMatches = (list: Match[]) => (
    <div className="space-y-3">
      {list.map((m) => {
        const result = m.homeScore != null && m.awayScore != null ? { home: m.homeScore, away: m.awayScore } : null;
        return (
          <MatchCard
            key={m.id}
            homeTeam={m.homeTeam}
            awayTeam={m.awayTeam}
            phase={m.phase}
            status={badgeStatus(m)}
            kickoffLabel={formatKickoffDateTime(m.kickoffTime)}
            prediction={predForMatch(m)}
            result={result}
            pointsEarned={selectedGroup ? predictionsByGroup[selectedGroup.id]?.[m.id]?.pointsEarned : undefined}
          />
        );
      })}
    </div>
  );

  const toggleGroupPreds = (matchId: string) =>
    setOpenGroupPreds((prev) => {
      const next = new Set(prev);
      next.has(matchId) ? next.delete(matchId) : next.add(matchId);
      return next;
    });

  // Card de "pronósticos del grupo" para un partido ya jugado: resultado al centro
  // + el marcador que predijo cada integrante (mismo bloque que el de "En vivo").
  const renderGroupPredsCard = (m: Match) => {
    const preds = groupPreds[m.id] ?? {};
    const result = m.homeScore != null && m.awayScore != null ? { home: m.homeScore, away: m.awayScore } : null;
    return (
      <Card key={m.id} padding="md" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <PhaseLabel phase={m.phase} />
          <MatchStatusBadge status={badgeStatus(m)} />
        </div>
        <MatchTeams
          homeTeam={m.homeTeam}
          awayTeam={m.awayTeam}
          center={
            result ? (
              <span className="font-display text-2xl font-extrabold tabular-nums leading-none text-ink whitespace-nowrap">
                {result.home}
                <span className="px-1 text-ink-faint">-</span>
                {result.away}
              </span>
            ) : (
              <span className="font-display text-2xl font-extrabold leading-none text-ink-faint">–</span>
            )
          }
        />
        <div>
          {(selectedGroup?.members ?? []).map((uid) => {
            const p = preds[uid];
            return (
              <MatchPredictionRow
                key={uid}
                name={memberNames[uid] ?? "—"}
                you={uid === user?.uid}
                prediction={p ? { home: p.predictedHomeScore, away: p.predictedAwayScore } : null}
                pointsEarned={p?.pointsEarned}
                exact={
                  result && p
                    ? p.predictedHomeScore === result.home && p.predictedAwayScore === result.away
                    : undefined
                }
              />
            );
          })}
        </div>
        <button
          onClick={() => toggleGroupPreds(m.id)}
          className="w-full text-center text-[11px] font-bold text-[var(--accent)] transition-opacity hover:opacity-70"
        >
          Ocultar pronósticos
        </button>
      </Card>
    );
  };

  const emptyHome = liveMatches.length === 0 && todayMatches.length === 0 && upcomingMatches.length === 0;

  // Tabla: entradas para el componente Leaderboard + si ya hay resultados.
  const standingEntries = standings.map((s, i) => ({
    rank: i + 1,
    name: s.name,
    points: s.points,
    you: s.uid === user?.uid,
  }));
  const hasResults = visibleMatches.some((m) => m.status === "finished");
  const myRank = standings.findIndex((s) => s.uid === user?.uid) + 1;
  const firstName = name.split(" ")[0];

  // ── Pronósticos: cierre + filtros ──────────────────────────────────────────
  const isClosed = (m: Match) => toMs(m.kickoffTime) <= now || m.status === "locked" || m.status === "finished";
  const groupLetters = Array.from(
    new Set(
      visibleMatches
        .filter((m) => m.phase === "group")
        .map(groupLetterOf)
        .filter((l): l is string => l !== null),
    ),
  );
  // Pestañas de fase visibles: solo las que este grupo juega (una polla "desde
  // cuartos" no muestra Grupos ni Octavos).
  const startIdx = phaseIndex(groupStartPhase(selectedGroup ?? {}));
  const visiblePredPhases = PRED_PHASES.filter(
    (p) => p.key === "all" || phaseIndex(p.key) >= startIdx,
  );
  // Partidos que pasan TODO menos el filtro de estado — base para los contadores
  // por pestaña (Abiertos / Jugados / Todos).
  const matchesForCounts = visibleMatches.filter((m) => {
    if (predPhase !== "all" && m.phase !== predPhase) return false;
    if (predPhase === "group" && predLetter !== "all" && groupLetterOf(m) !== predLetter) return false;
    if (predSearch.trim() && !norm(`${m.homeTeam} ${m.awayTeam}`).includes(norm(predSearch.trim()))) return false;
    return true;
  });
  const counts: Record<PredStatus, number> = {
    abiertos: matchesForCounts.filter((m) => !isClosed(m)).length,
    jugados: matchesForCounts.filter((m) => isClosed(m)).length,
    todos: matchesForCounts.length,
  };
  const filteredPred = matchesForCounts.filter((m) =>
    predStatus === "abiertos" ? !isClosed(m) : predStatus === "jugados" ? isClosed(m) : true,
  );
  const visiblePred = filteredPred.slice(0, predLimit);
  const filtersActive =
    predStatus !== "abiertos" || predPhase !== "all" || predLetter !== "all" || predSearch.trim() !== "";

  const clearFilters = () => {
    setPredStatus("abiertos");
    setPredPhase("all");
    setPredLetter("all");
    setPredSearch("");
    setPredLimit(10);
  };

  return (
    <>
    <AppShell
      items={nav}
      activeKey={tab}
      onSelect={handleNav}
      brand={<Brand />}
      groupSelector={
        hasGroups ? (
          <GroupSelector groups={groups} selectedGroup={selectedGroup} onChange={onGroup} label="Grupo activo" />
        ) : undefined
      }
      sidebarFooter={<ThemeToggle className="w-full justify-center" />}
    >
      {/* ── Inicio ─────────────────────────────────────────────────────────── */}
      {tab === "home" && (
        <div className="space-y-6">
          <PageHeader
            title={`¡Hola, ${name}!`}
            subtitle={groupSubtitle("Todavía no estás en ningún grupo")}
            action={headerActions}
          />

          {pendingInvite && !pendingDismissed && (
            <Card padding="lg" className="relative space-y-4 border-[var(--accent)]/40">
              <button
                onClick={() => setPendingDismissed(true)}
                className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface hover:text-ink"
                aria-label="Descartar invitación"
              >
                ✕
              </button>
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎉</span>
                <div>
                  <h4 className="font-display text-sm font-extrabold text-ink">Invitación a un grupo</h4>
                  <p className="text-xs text-ink-muted">
                    Te invitaron a unirte a <span className="font-bold text-ink">{pendingInvite.groupName}</span>.
                  </p>
                </div>
              </div>
              {pendingError && <AlertBanner tone="error">{pendingError}</AlertBanner>}
              <Button fullWidth onClick={handleConfirmJoin} disabled={joiningPending}>
                {joiningPending ? "Uniéndote..." : `Confirmar y unirme a ${pendingInvite.groupName}`}
              </Button>
            </Card>
          )}

          {selectedGroup && (
            <ChampionPick
              champion={championsByGroup[selectedGroup.id] ?? null}
              teams={WORLD_CUP_TEAMS}
              locked={isChampionLocked()}
              deadlineLabel="4 de julio"
              saving={savingChampion}
              onSave={handleSaveChampion}
            />
          )}

          {!hasGroups ? (
            <Card padding="lg" className="space-y-4">
              <EmptyState icon="👥" title="Todavía no tienes grupo">
                Únete a un grupo o crea el tuyo para empezar a competir.
              </EmptyState>
              <div className="flex justify-center">
                <Button onClick={() => router.push("/grupos")}>Ir a grupos</Button>
              </div>
            </Card>
          ) : emptyHome ? (
            <Card padding="lg" className="w-full">
              <EmptyState icon="⚽" title="Sin partidos">Cuando se programen, aparecerán aquí.</EmptyState>
            </Card>
          ) : (
            <>
              {liveMatches.length > 0 && (
                <Section title="En vivo" live>
                  <div className="space-y-3">
                    {liveMatches.map((m) => {
                      const preds = groupPreds[m.id] ?? {};
                      const result =
                        m.homeScore != null && m.awayScore != null ? { home: m.homeScore, away: m.awayScore } : null;
                      return (
                        <Card key={m.id} padding="md" className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <PhaseLabel phase={m.phase} />
                            <MatchStatusBadge status="locked" />
                          </div>
                          <MatchTeams
                            homeTeam={m.homeTeam}
                            awayTeam={m.awayTeam}
                            center={
                              result ? (
                                <span className="font-display text-2xl font-extrabold tabular-nums leading-none text-ink whitespace-nowrap">
                                  {result.home}
                                  <span className="px-1 text-ink-faint">-</span>
                                  {result.away}
                                </span>
                              ) : (
                                <span className="font-display text-2xl font-extrabold leading-none text-ink-faint">–</span>
                              )
                            }
                          />
                          <div>
                            {(selectedGroup?.members ?? []).map((uid) => {
                              const p = preds[uid];
                              return (
                                <MatchPredictionRow
                                  key={uid}
                                  name={memberNames[uid] ?? "—"}
                                  you={uid === user?.uid}
                                  prediction={p ? { home: p.predictedHomeScore, away: p.predictedAwayScore } : null}
                                  pointsEarned={p?.pointsEarned}
                                  exact={
                                    result && p
                                      ? p.predictedHomeScore === result.home && p.predictedAwayScore === result.away
                                      : undefined
                                  }
                                />
                              );
                            })}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </Section>
              )}
              {todayMatches.length > 0 && <Section title="Partidos de hoy">{renderMatches(todayMatches)}</Section>}
              {upcomingMatches.length > 0 && <Section title="Próximos partidos">{renderMatches(upcomingMatches)}</Section>}
            </>
          )}
        </div>
      )}

      {/* ── Pronósticos ────────────────────────────────────────────────────── */}
      {tab === "predictions" && (
        <div className="space-y-5">
          <PageHeader title="Pronósticos" subtitle={groupSubtitle("Sin grupo")} action={headerActions} />

          {!hasGroups ? (
            <Card padding="lg" className="space-y-4">
              <EmptyState icon="👥" title="Todavía no tienes grupo">
                Únete a un grupo para cargar tus pronósticos.
              </EmptyState>
              <div className="flex justify-center">
                <Button onClick={() => router.push("/grupos")}>Ir a grupos</Button>
              </div>
            </Card>
          ) : (
            <>
              {/* Explicación de puntuación para fases de eliminación (16avos+). */}
              <KnockoutScoringCard />

              <div className="flex items-center gap-2 rounded-xl border-2 border-transparent bg-surface-2 px-3 transition-colors hover:border-[var(--accent)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-faint" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  value={predSearch}
                  onChange={(e) => {
                    setPredSearch(e.target.value);
                    setPredLimit(10);
                  }}
                  placeholder="Buscar país…"
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                />
                {predSearch && (
                  <button
                    onClick={() => setPredSearch("")}
                    aria-label="Limpiar búsqueda"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface hover:text-ink"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {/* Estado: control segmentado (un riel, segmento activo resaltado). */}
              <div className="inline-flex w-full rounded-full bg-surface-2 p-0.5">
                {(["abiertos", "jugados", "todos"] as PredStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setPredStatus(s);
                      setPredLimit(10);
                    }}
                    aria-pressed={predStatus === s}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                      predStatus === s ? "bg-primary text-[var(--on-primary)]" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {s === "abiertos" ? "Por jugar" : s === "jugados" ? "Jugados" : "Todos"}
                    <span className="tabular-nums opacity-70">{counts[s]}</span>
                  </button>
                ))}
              </div>

              {/* Fase + (letra de grupo): menús desplegables. */}
              <div className="flex gap-2">
                <Select
                  value={predPhase}
                  onChange={(e) => {
                    setPredPhase(e.target.value);
                    setPredLetter("all");
                    setPredLimit(10);
                  }}
                  aria-label="Fase"
                  className="flex-1"
                >
                  {visiblePredPhases.map((p) => (
                    <option key={p.key} value={p.key} className="bg-surface">
                      {p.label}
                    </option>
                  ))}
                </Select>
                {predPhase === "group" && groupLetters.length > 0 && (
                  <Select
                    value={predLetter}
                    onChange={(e) => {
                      setPredLetter(e.target.value);
                      setPredLimit(10);
                    }}
                    aria-label="Grupo"
                    className="flex-1"
                  >
                    <option value="all" className="bg-surface">
                      Todos los grupos
                    </option>
                    {groupLetters.map((l) => (
                      <option key={l} value={l} className="bg-surface">
                        Grupo {l}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-ink-muted tabular-nums">
                  {filteredPred.length} {filteredPred.length === 1 ? "partido" : "partidos"}
                </p>
                {filtersActive && (
                  <button onClick={clearFilters} className="text-[11px] font-bold text-[var(--accent)] transition-opacity hover:opacity-70">
                    Limpiar filtros
                  </button>
                )}
              </div>

              {visiblePred.length === 0 ? (
                <Card padding="lg" className="w-full">
                  <EmptyState icon="🔍" title="No encontramos partidos">Prueba con otro filtro o país.</EmptyState>
                </Card>
              ) : (
                <div
                  key={`${predStatus}-${predPhase}-${predLetter}`}
                  className="space-y-3 motion-safe:animate-[fadeIn_180ms_ease-out]"
                >
                  {visiblePred.map((m) => {
                    const saved = selectedGroup ? predictionsByGroup[selectedGroup.id]?.[m.id] : undefined;
                    if (!isClosed(m)) {
                      return (
                        <MatchCard
                          key={m.id}
                          editable
                          homeTeam={m.homeTeam}
                          awayTeam={m.awayTeam}
                          phase={m.phase}
                          status="upcoming"
                          kickoffLabel={formatKickoffDateTime(m.kickoffTime)}
                          prediction={predValue(m.id)}
                          saving={savingPred[m.id]}
                          justSaved={savedPred[m.id]}
                          error={predError[m.id]}
                          onPredictionChange={(next) => onPredChange(m.id, next)}
                          onSave={() => savePrediction(m.id)}
                          showQualifier={isKnockoutPhase(m.phase)}
                          qualifier={predValue(m.id).qualifier}
                          onQualifierChange={(q) => onQualifierChange(m.id, q)}
                        />
                      );
                    }
                    if (openGroupPreds.has(m.id)) return renderGroupPredsCard(m);
                    const result = m.homeScore != null && m.awayScore != null ? { home: m.homeScore, away: m.awayScore } : null;
                    return (
                      <MatchCard
                        key={m.id}
                        homeTeam={m.homeTeam}
                        awayTeam={m.awayTeam}
                        phase={m.phase}
                        status={badgeStatus(m)}
                        kickoffLabel={formatKickoffDateTime(m.kickoffTime)}
                        result={result}
                        prediction={saved ? { home: saved.predictedHomeScore, away: saved.predictedAwayScore } : undefined}
                        pointsEarned={saved?.pointsEarned}
                        resolutionLabel={
                          m.status === "finished" && m.resolutionMethod ? RESOLUTION_TRANSLATIONS[m.resolutionMethod] : undefined
                        }
                        showQualifier={isKnockoutPhase(m.phase)}
                        qualifier={saved?.predictedQualifier ?? undefined}
                        actualQualifier={m.qualifier ?? undefined}
                        footer={
                          <button
                            onClick={() => toggleGroupPreds(m.id)}
                            className="w-full text-center text-[11px] font-bold text-[var(--accent)] transition-opacity hover:opacity-70"
                          >
                            Ver pronósticos del grupo
                          </button>
                        }
                      />
                    );
                  })}
                  {filteredPred.length > visiblePred.length && (
                    <div className="flex justify-center pt-1">
                      <Button variant="secondary" onClick={() => setPredLimit((n) => n + 10)}>
                        Mostrar más
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tabla ──────────────────────────────────────────────────────────── */}
      {tab === "table" && (
        <div className="space-y-5">
          <PageHeader
            title={hasResults && myRank > 0 ? `¡${rankPhrase(myRank, standings.length)}, ${firstName}!` : "Tabla"}
            action={headerActions}
            subtitle={
              !hasGroups ? (
                "Sin grupo"
              ) : (
                <div className="space-y-1.5">
                  {hasResults && myRank > 0 && (
                    <p>
                      Estás en la posición {myRank} de {standings.length}
                    </p>
                  )}
                  <div className="lg:hidden">
                    <GroupSelector
                      groups={groups}
                      selectedGroup={selectedGroup}
                      onChange={onGroup}
                      label="Grupo activo"
                      compact
                    />
                  </div>
                </div>
              )
            }
          />
          {!hasGroups ? (
            <Card padding="lg" className="space-y-4">
              <EmptyState icon="👥" title="Todavía no tienes grupo">
                Únete a un grupo para ver la tabla.
              </EmptyState>
              <div className="flex justify-center">
                <Button onClick={() => router.push("/grupos")}>Ir a grupos</Button>
              </div>
            </Card>
          ) : (
            <>
              {selectedGroup && <GroupSummary group={selectedGroup} memberCount={selectedGroup.members.length} />}
              {!hasResults ? (
                <Card padding="lg" className="w-full">
                  <EmptyState icon="📊" title="La tabla arranca pronto">
                    Cuando termine el primer partido, acá aparece el ranking del grupo.
                  </EmptyState>
                </Card>
              ) : (
                <Leaderboard entries={standingEntries} variant="card" />
              )}
            </>
          )}
        </div>
      )}

      {/* ── Perfil ─────────────────────────────────────────────────────────── */}
      {tab === "profile" && (
        <div className="space-y-5">
          <PageHeader title="Perfil" subtitle={user?.email ?? undefined} />

          {/* Tus datos (editable) */}
          <Card padding="lg" className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Tus datos</p>
            <div>
              <FormLabel htmlFor="pf-name">Nombre</FormLabel>
              <Input id="pf-name" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel htmlFor="pf-city">Ciudad</FormLabel>
                <Input id="pf-city" value={editCity} onChange={(e) => setEditCity(e.target.value)} className="w-full" />
              </div>
              <div>
                <FormLabel htmlFor="pf-age">Edad</FormLabel>
                <Input id="pf-age" type="number" min="1" value={editAge} onChange={(e) => setEditAge(e.target.value)} className="w-full" />
              </div>
            </div>
            <div>
              <FormLabel htmlFor="pf-barrio">Barrio</FormLabel>
              <Input id="pf-barrio" value={editBarrio} onChange={(e) => setEditBarrio(e.target.value)} className="w-full" />
            </div>
            {profileSaved && <AlertBanner tone="success">Datos guardados.</AlertBanner>}
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? "Guardando…" : "Guardar cambios"}
            </Button>
          </Card>

          {/* Notificaciones push */}
          <Card padding="lg" className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Notificaciones</p>
            {pushState === "granted" ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-ink-muted">Activadas en este dispositivo.</p>
                <Badge tone="primary">✓ Activas</Badge>
              </div>
            ) : pushState === "denied" ? (
              <AlertBanner tone="warning">
                Bloqueaste las notificaciones. Habilítalas desde los ajustes del navegador.
              </AlertBanner>
            ) : pushState === "unsupported" ? (
              <p className="text-sm text-ink-muted">Este dispositivo no soporta notificaciones push.</p>
            ) : pushState === "no-vapid" ? (
              <p className="text-sm text-ink-muted">Las notificaciones aún no están configuradas.</p>
            ) : (
              <Button variant="secondary" onClick={handleEnablePush} disabled={pushState === "working"}>
                {pushState === "working" ? "Activando…" : "Activar notificaciones"}
              </Button>
            )}
            {pushState === "error" && (
              <AlertBanner tone="error">No pudimos activarlas. Inténtalo de nuevo.</AlertBanner>
            )}
          </Card>

          {/* Tema */}
          <Card padding="lg" className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Tema</p>
            <ThemeToggle />
          </Card>

          {/* Administración (solo admins) */}
          {dbUser?.isAdmin && (
            <Card padding="lg" className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Administración</p>
              <p className="text-sm text-ink-muted">Crear y puntuar partidos, configurar el torneo.</p>
              <Button variant="secondary" onClick={() => router.push("/admin")}>
                Abrir panel de administración
              </Button>
            </Card>
          )}

          <Button variant="danger" onClick={handleSignOut}>
            Cerrar sesión
          </Button>
        </div>
      )}
    </AppShell>
    <Toast open={!!toast} tone={toast?.tone ?? "success"} onDismiss={() => setToast(null)}>
      {toast?.msg}
    </Toast>
    </>
  );
}
