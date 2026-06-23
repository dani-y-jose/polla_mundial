"use client";

// Grupos — gestión de grupos sobre el design system (Fase 6d). Lista compacta de
// mis grupos + unirse por código + crear (form práctico: inscripción con chips,
// reglas con steppers, reparto con presets + suma en vivo). El detalle por grupo
// vive en /grupos/[id]. La versión vieja (tab del dashboard) está en /dashboard_old.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, getDoc, doc, updateDoc, query, where, arrayUnion, writeBatch } from "firebase/firestore";
import { parseDoc, parseDocs } from "@/lib/parse";
import { groupSchema } from "@/lib/schemas";
import type { Group, Invite } from "@/types";
import { getMaxMembersPerGroup } from "@/lib/config";
import { groupRulesInputSchema, prizeInputSchema, entryFeeSchema, firstError } from "@/lib/form-schemas";
import { getActiveGroupId, setActiveGroupId } from "@/lib/active-group";
import { Button, Card, Input, FormLabel, AlertBanner, Spinner, EmptyState, Badge, Stepper, CopyButton, cn } from "@/components/ui";
import { WhatsAppShareButton, PageHeader } from "@/components/domain";
import {
  AppShell,
  ThemeToggle,
  HomeIcon,
  PredictionsIcon,
  TableIcon,
  GroupsIcon,
  ProfileIcon,
  type NavItem,
} from "@/components/shell";

const Brand = () => (
  <span className="font-display text-lg font-extrabold tracking-tight text-ink">
    Polla <span className="text-[var(--accent)]">2026</span>
  </span>
);

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function randomCode() {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

const money = (n?: number) => (n && n > 0 ? `$${n.toLocaleString("es")}` : "Gratis");
const PRIZE_PRESETS: [number, number, number][] = [
  [50, 30, 20],
  [60, 30, 10],
  [100, 0, 0],
];

export default function GruposPage() {
  const router = useRouter();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(null);

  // Unirse
  const [inviteCode, setInviteCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");

  // Crear
  const [createOpen, setCreateOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [name, setName] = useState("");
  const [fee, setFee] = useState(0);
  const [exact, setExact] = useState(3);
  const [outcome, setOutcome] = useState(1);
  const [unique, setUnique] = useState(0);
  const [qf, setQf] = useState(0);
  const [sf, setSf] = useState(0);
  const [fin, setFin] = useState(0);
  const [p1, setP1] = useState(50);
  const [p2, setP2] = useState(30);
  const [p3, setP3] = useState(20);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/");
        return;
      }
      setUser(u);
      try {
        const snap = await getDocs(query(collection(db, "groups"), where("members", "array-contains", u.uid)));
        setGroups(parseDocs(groupSchema, snap));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    setActiveGroupIdState(getActiveGroupId());
  }, []);

  function nav(key: string) {
    if (key === "groups") return;
    router.push(`/dashboard?tab=${key}`);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = inviteCode.trim().toUpperCase();
    if (!code || !user) return;
    setJoinLoading(true);
    setJoinError("");
    try {
      const inv = await getDoc(doc(db, "invites", code));
      const gid = inv.exists() ? (inv.data().groupId as string | null) : null;
      if (!gid) {
        setJoinError("Código inválido. No encontramos ese grupo.");
        setJoinLoading(false);
        return;
      }
      try {
        await updateDoc(doc(db, "groups", gid), { members: arrayUnion(user.uid) });
      } catch {
        setJoinError("Este grupo ya está lleno.");
        setJoinLoading(false);
        return;
      }
      const gSnap = await getDoc(doc(db, "groups", gid));
      const joined = parseDoc(groupSchema, gSnap);
      if (joined) setGroups((prev) => (prev.some((g) => g.id === joined.id) ? prev : [...prev, joined]));
      setInviteCode("");
    } catch (err) {
      console.error(err);
      setJoinError("No pudimos unirte. Inténtalo de nuevo.");
    } finally {
      setJoinLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !user) return;
    setCreateLoading(true);
    setCreateError("");
    try {
      const feeParsed = entryFeeSchema.safeParse(fee);
      const rulesParsed = groupRulesInputSchema.safeParse({
        exactScorePoints: exact,
        correctOutcomePoints: outcome,
        uniquePredictionPoints: unique,
        quarterFinalsBonus: qf,
        semiFinalsBonus: sf,
        finalsBonus: fin,
      });
      const prizeParsed = prizeInputSchema.safeParse({ firstPlacePercent: p1, secondPlacePercent: p2, thirdPlacePercent: p3 });
      if (!feeParsed.success) {
        setCreateError(firstError(feeParsed.error));
        setCreateLoading(false);
        return;
      }
      if (!rulesParsed.success) {
        setCreateError(firstError(rulesParsed.error));
        setCreateLoading(false);
        return;
      }
      if (!prizeParsed.success) {
        setCreateError(firstError(prizeParsed.error));
        setCreateLoading(false);
        return;
      }

      const groupId = `group_${Date.now()}`;
      const cap = await getMaxMembersPerGroup();
      let code = randomCode();
      for (let i = 0; i < 5; i++) {
        const ex = await getDoc(doc(db, "invites", code));
        if (!ex.exists()) break;
        code = randomCode();
      }

      const newGroup: Group = {
        id: groupId,
        name: name.trim(),
        creatorId: user.uid,
        inviteCode: code,
        members: [user.uid],
        createdAt: new Date(),
        entryFee: feeParsed.data,
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

      setGroups((prev) => [...prev, newGroup]);
      setName("");
      setFee(0);
      setExact(3);
      setOutcome(1);
      setUnique(0);
      setQf(0);
      setSf(0);
      setFin(0);
      setP1(50);
      setP2(30);
      setP3(20);
      setCreateOpen(false);
      setShowAdvanced(false);
    } catch (err) {
      console.error(err);
      setCreateError("Error al crear el grupo. Inténtalo de nuevo.");
    } finally {
      setCreateLoading(false);
    }
  }

  const inviteMessage = (g: Group) =>
    `¡Únete a mi grupo en Polla 2026! ⚽\n\nGrupo: ${g.name}\nCódigo: ${g.inviteCode}\n\nEntra acá: ${typeof window !== "undefined" ? window.location.origin : ""}/?invite=${g.inviteCode}`;

  const chip = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
      active ? "bg-primary text-[var(--on-primary)]" : "bg-surface-2 text-ink-muted hover:text-ink",
    );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  const navItems: NavItem[] = [
    { key: "home", label: "Inicio", icon: <HomeIcon /> },
    { key: "predictions", label: "Pronósticos", icon: <PredictionsIcon /> },
    { key: "table", label: "Tabla", icon: <TableIcon /> },
    { key: "groups", label: "Grupos", icon: <GroupsIcon /> },
    { key: "profile", label: "Perfil", icon: <ProfileIcon /> },
  ];

  const prizeSum = p1 + p2 + p3;
  const prizeOk = fee === 0 || prizeSum === 100;
  const effectiveActive = activeGroupId ?? groups[0]?.id ?? null;

  return (
    <AppShell
      items={navItems}
      activeKey="groups"
      onSelect={nav}
      brand={<Brand />}
      sidebarFooter={<ThemeToggle className="w-full justify-center" />}
    >
      <div className="space-y-6">
        <PageHeader title="Grupos" subtitle="Crea o únete a un grupo para competir." />

        {/* ── Mis grupos ─────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="font-display text-base font-bold text-ink">Mis grupos</h2>
          {groups.length === 0 ? (
            <Card padding="lg" className="w-full">
              <EmptyState icon="👥" title="Todavía no estás en ningún grupo">
                Únete con un código o crea el tuyo abajo.
              </EmptyState>
            </Card>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const isActive = effectiveActive === g.id;
                return (
                  <Card key={g.id} padding="md" className={cn("space-y-2.5", isActive && "ring-1 ring-accent/50")}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate font-display text-lg font-extrabold text-ink">{g.name}</p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isActive && (
                          <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                            Activo
                          </span>
                        )}
                        {g.creatorId === user?.uid && <Badge tone="primary">Admin</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs text-ink-muted">
                        {g.members.length} {g.members.length === 1 ? "integrante" : "integrantes"} · {money(g.entryFee)}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="font-mono text-sm font-bold tracking-wider text-ink">{g.inviteCode}</span>
                        <CopyButton value={g.inviteCode} label="Copiar código de invitación" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          setActiveGroupId(g.id);
                          setActiveGroupIdState(g.id);
                          router.push(`/dashboard?tab=table&group=${g.id}`);
                        }}
                      >
                        Ver tabla
                      </Button>
                      <WhatsAppShareButton fullWidth={false} message={inviteMessage(g)}>
                        Compartir
                      </WhatsAppShareButton>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Unirse ─────────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="font-display text-base font-bold text-ink">Unirse a un grupo</h2>
          <Card padding="md" className="space-y-2">
            <form onSubmit={handleJoin} className="flex gap-2">
              <Input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Código de invitación"
                maxLength={6}
                aria-label="Código de invitación"
                className="flex-1 font-mono tracking-wider"
              />
              <Button type="submit" disabled={joinLoading || !inviteCode.trim()}>
                {joinLoading ? "…" : "Unirme"}
              </Button>
            </form>
            {joinError && <AlertBanner tone="error">{joinError}</AlertBanner>}
          </Card>
        </section>

        {/* ── Crear ──────────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="font-display text-base font-bold text-ink">Crear un grupo</h2>
          {!createOpen ? (
            <Button variant="secondary" fullWidth onClick={() => setCreateOpen(true)}>
              Crear un grupo nuevo
            </Button>
          ) : (
            <Card padding="md">
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <FormLabel htmlFor="gname">Nombre del grupo</FormLabel>
                  <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Los Cracks" className="w-full" />
                </div>

                <div>
                  <FormLabel htmlFor="fee">Inscripción al pozo</FormLabel>
                  <div className="flex items-center gap-2 rounded-xl border-2 border-transparent bg-surface-2 px-3 transition-colors focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
                    <span className="text-sm font-bold text-ink-faint">$</span>
                    <input
                      id="fee"
                      type="number"
                      min="0"
                      value={fee}
                      onChange={(e) => setFee(Math.max(0, Number(e.target.value) || 0))}
                      aria-label="Inscripción al pozo"
                      className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink focus:outline-none"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[0, 10, 20, 50].map((amt) => (
                      <button key={amt} type="button" onClick={() => setFee(amt)} className={chip(fee === amt)}>
                        {amt === 0 ? "Gratis" : `$${amt}`}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs font-bold text-[var(--accent)] transition-opacity hover:opacity-70"
                >
                  {showAdvanced ? "Ocultar reglas y premios" : "Personalizar reglas y premios"}
                </button>

                {showAdvanced && (
                  <div className="space-y-4 border-t border-[var(--hairline)] pt-4">
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">Reglas de puntos</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <Stepper label="Marcador exacto" value={exact} onChange={setExact} max={20} suffix="pts" />
                        <Stepper label="Acertar ganador" value={outcome} onChange={setOutcome} max={20} suffix="pts" />
                        <Stepper label="Bono única" value={unique} onChange={setUnique} max={20} suffix="pts" />
                        <Stepper label="Bono cuartos" value={qf} onChange={setQf} max={20} suffix="pts" />
                        <Stepper label="Bono semis" value={sf} onChange={setSf} max={20} suffix="pts" />
                        <Stepper label="Bono final" value={fin} onChange={setFin} max={20} suffix="pts" />
                      </div>
                    </div>

                    {fee > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">Reparto del pozo</p>
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {PRIZE_PRESETS.map(([a, b, c]) => (
                            <button
                              key={`${a}-${b}-${c}`}
                              type="button"
                              onClick={() => {
                                setP1(a);
                                setP2(b);
                                setP3(c);
                              }}
                              className={chip(p1 === a && p2 === b && p3 === c)}
                            >
                              {a}·{b}·{c}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <Stepper label="1º %" value={p1} onChange={setP1} max={100} step={5} suffix="%" />
                          <Stepper label="2º %" value={p2} onChange={setP2} max={100} step={5} suffix="%" />
                          <Stepper label="3º %" value={p3} onChange={setP3} max={100} step={5} suffix="%" />
                        </div>
                        <p className={cn("mt-2 text-[11px] font-bold", prizeOk ? "text-[var(--primary-strong)]" : "text-[var(--danger)]")}>
                          Suma: {prizeSum}% {prizeOk ? "✓" : "— debe ser 100%"}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {createError && <AlertBanner tone="error">{createError}</AlertBanner>}
                <div className="flex gap-2">
                  <Button type="submit" fullWidth disabled={createLoading || !name.trim() || !prizeOk}>
                    {createLoading ? "Creando…" : "Crear grupo"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}
