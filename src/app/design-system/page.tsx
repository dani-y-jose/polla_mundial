"use client";

// Dev-only Design System reference: foundations (colors, typography) + a tabbed
// gallery of every primitive and domain component. 404s in production.
//
// Fase 6b: primitivos re-skineados desde tokens (regla de bordes `.edge`, sin
// glassmorphism, podio metálico). Fase 6c: dominio re-skineado sobre tokens —
// banderas tipo figurita (marco sticker, responsive), match cards y tabla con
// jerarquía y deleite (sello "la dorada" al clavar el marcador exacto).

import { useState, useEffect } from "react";
import { notFound } from "next/navigation";
import {
  cn,
  Button,
  IconButton,
  Input,
  Select,
  Card,
  Badge,
  AlertBanner,
  FilterPill,
  FormLabel,
  Spinner,
  EmptyState,
} from "@/components/ui";
import {
  TeamLabel,
  TeamFlag,
  MatchTeams,
  PhaseLabel,
  RankBadge,
  ScoreBadge,
  GroupSelector,
  WhatsAppShareButton,
  MatchStatusBadge,
  ScoreInput,
  PointsDisplay,
  MatchCard,
  LeaderboardRow,
  MatchPredictionRow,
  ChampionPick,
  PageHeader,
} from "@/components/domain";
import type { Group } from "@/types";
import { WORLD_CUP_TEAMS } from "@/lib/flags";

type Tab = "colores" | "tipografia" | "primitivos" | "dominio";

const TABS: { id: Tab; label: string }[] = [
  { id: "colores", label: "Colores" },
  { id: "tipografia", label: "Tipografía" },
  { id: "primitivos", label: "Primitivos" },
  { id: "dominio", label: "Dominio" },
];

// ── Theme toggle (data-theme on <html>; JS resolves system → light/dark) ──────
type ThemeChoice = "system" | "light" | "dark";

function applyTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem("theme", choice);
  } catch {}
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const resolved = dark ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    let c: ThemeChoice = "system";
    try {
      c = (localStorage.getItem("theme") as ThemeChoice) || "system";
    } catch {}
    // Leemos localStorage post-montaje para reflejar el tema elegido sin provocar
    // un mismatch de hidratación (el server no conoce localStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(c);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let cur: ThemeChoice = "system";
      try {
        cur = (localStorage.getItem("theme") as ThemeChoice) || "system";
      } catch {}
      if (cur === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const opts: { id: ThemeChoice; label: string }[] = [
    { id: "system", label: "Sistema" },
    { id: "light", label: "Claro" },
    { id: "dark", label: "Oscuro" },
  ];
  return (
    <div className="inline-flex gap-0.5 rounded-full bg-surface p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => {
            applyTheme(o.id);
            setChoice(o.id);
          }}
          aria-pressed={choice === o.id}
          className={cn(
            "edge rounded-full px-3 py-1 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            choice === o.id ? "bg-primary text-[var(--on-primary)]" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Color data ───────────────────────────────────────────────────────────────
const VIOLET_RAMP = [
  { step: "50", hex: "#f3edfd" },
  { step: "100", hex: "#e7d8fa" },
  { step: "200", hex: "#bf99f2" },
  { step: "300", hex: "#a56fdf" },
  { step: "400", hex: "#8c46cb" },
  { step: "500", hex: "#721cb8" },
  { step: "600", hex: "#681ba8" },
  { step: "700", hex: "#5f1a98" },
  { step: "800", hex: "#551a89" },
  { step: "900", hex: "#4c1979" },
  { step: "950", hex: "#421869" },
];

const ACCENTS: { v: string; l: string; s: string }[] = [
  { v: "--accent", l: "accent", s: "realce · lime (osc #9cf945 / clr #2c6207)" },
  { v: "--danger", l: "danger", s: "error · coral" },
  { v: "--warning", l: "warning", s: "aviso · naranja" },
  { v: "--gold", l: "gold", s: "1º puesto" },
  { v: "--silver", l: "silver", s: "2º puesto" },
  { v: "--bronze", l: "bronze", s: "3º puesto" },
];

const SEMANTIC: { v: string; l: string; s: string }[] = [
  { v: "--bg", l: "bg", s: "fondo de página" },
  { v: "--surface", l: "surface", s: "card" },
  { v: "--surface-2", l: "surface-2", s: "card elevado" },
  { v: "--ink", l: "ink", s: "texto" },
  { v: "--ink-muted", l: "ink-muted", s: "texto 2º" },
  { v: "--accent", l: "accent", s: "realce interacción" },
  { v: "--primary", l: "primary", s: "acción" },
];

const SIZES = ["text-4xl", "text-3xl", "text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-xs"];
const WEIGHTS = [
  { cls: "font-normal", label: "normal · 400" },
  { cls: "font-medium", label: "medium · 500" },
  { cls: "font-semibold", label: "semibold · 600" },
  { cls: "font-bold", label: "bold · 700" },
  { cls: "font-extrabold", label: "extrabold · 800" },
];

const MOCK_GROUPS = [
  { id: "g1", name: "Los Cracks", inviteCode: "ABC123" },
  { id: "g2", name: "Oficina FC", inviteCode: "XYZ789" },
] as unknown as Group[];

// ── Layout helpers ───────────────────────────────────────────────────────────
function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-surface p-6", className)}>{children}</div>;
}

function TokenSwatch({ v, l, s }: { v: string; l: string; s: string }) {
  return (
    <div className="space-y-1.5">
      <div className="h-16 w-full rounded-xl border border-[var(--hairline)]" style={{ background: `var(${v})` }} />
      <div>
        <p className="text-xs font-bold text-ink">{l}</p>
        <p className="text-[11px] text-ink-muted">{s}</p>
      </div>
    </div>
  );
}

function Demo({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-widest text-ink-muted">{title}</h3>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">{children}</div>;
}

const bell = (
  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1-1.5-1s-1.5.17-1.5 1v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);

export default function DesignSystemPage() {
  const [tab, setTab] = useState<Tab>("colores");
  const [filter, setFilter] = useState("abiertos");
  const [selGroup, setSelGroup] = useState<Group | null>(MOCK_GROUPS[0]);
  const [pred, setPred] = useState<{ home: number | null; away: number | null }>({ home: 2, away: 1 });

  // Dev-only: 404 in production builds.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="max-w-4xl mx-auto px-6 pb-20">
        <header className="pt-10 pb-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Design System</h1>
            <p className="text-sm text-ink-muted">
              Polla Mundial · monocromo violeta <span className="text-ink-faint">(solo dev)</span>
            </p>
          </div>
          <ThemeToggle />
        </header>

        {/* Tabs */}
        <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-bg border-b border-[var(--hairline)] flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cn(
                "edge px-4 py-2 rounded-full text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                tab === t.id
                  ? "bg-primary text-[var(--on-primary)]"
                  : "bg-surface text-ink-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <main className="pt-8 space-y-10">
          {/* ── COLORES ──────────────────────────────────────────────────── */}
          {tab === "colores" && (
            <>
              <section className="space-y-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-ink">Primaria · Violeta</h2>
                  <p className="text-xs text-ink-muted">
                    Anclas <strong className="font-bold text-ink">200 / 500 / 950</strong> exactas; el resto interpolado. Es la <strong className="font-bold text-ink">única familia</strong> — el tema se invierte para claro/oscuro.
                  </p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-[var(--hairline)]">
                  <div className="flex">
                    {VIOLET_RAMP.map((t) => (
                      <div key={t.step} className="h-20 flex-1" style={{ background: t.hex }} title={`violet-${t.step}`} />
                    ))}
                  </div>
                </div>
                <div className="flex">
                  {VIOLET_RAMP.map((t) => (
                    <div key={t.step} className="flex-1 px-0.5 text-center">
                      <div className="text-[11px] font-bold text-ink">{t.step}</div>
                      <div className="text-[10px] font-mono text-ink-muted">{t.hex}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-ink">Accents</h2>
                  <p className="text-xs text-ink-muted">
                    Variantes que marcan contraste. <code className="font-mono text-[var(--accent)]">lime</code> (realce), <code className="font-mono text-danger">coral</code> (error) y <code className="font-mono text-warning">naranja</code> (aviso) son no-violeta. El podio usa metálicos representativos.
                  </p>
                </div>
                <Grid>
                  {ACCENTS.map((t) => (
                    <TokenSwatch key={t.l} {...t} />
                  ))}
                </Grid>
              </section>

              <section className="space-y-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-ink">Tokens semánticos</h2>
                  <p className="text-xs text-ink-muted">Prueba el toggle de arriba — un token, dos temas (invertido).</p>
                </div>
                <Grid>
                  {SEMANTIC.map((t) => (
                    <TokenSwatch key={t.l} {...t} />
                  ))}
                </Grid>
              </section>
            </>
          )}

          {/* ── TIPOGRAFÍA ───────────────────────────────────────────────── */}
          {tab === "tipografia" && (
            <>
              <section className="space-y-4">
                <h2 className="font-display text-xl font-bold text-ink">Familias</h2>
                <Panel className="space-y-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-1">font-display · Bricolage Grotesque</p>
                    <p className="font-display text-3xl font-extrabold text-ink">Apuesta. Compite. Gana la Gloria.</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-1">font-body · Hanken Grotesk</p>
                    <p className="font-body text-xl text-ink">Predice los marcadores del Mundial 2026 y compite con tus amigos.</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-1">
                      font-mono · sistema <span className="text-ink-faint">(códigos, no marcadores)</span>
                    </p>
                    <p className="font-mono text-xl text-ink tabular-nums">ABC123 · 2 - 1 · 0123456789</p>
                  </div>
                </Panel>
              </section>

              <section className="space-y-4">
                <h2 className="font-display text-xl font-bold text-ink">Escala de tamaños</h2>
                <Panel className="space-y-2">
                  {SIZES.map((s) => (
                    <div key={s} className="flex items-baseline gap-4 border-b border-[var(--hairline)] pb-2 last:border-0">
                      <span className="w-16 shrink-0 text-[11px] font-mono text-ink-muted">{s.replace("text-", "")}</span>
                      <span className={cn("truncate font-display font-bold text-ink", s)}>Polla Mundial 2026</span>
                    </div>
                  ))}
                </Panel>
              </section>

              <section className="space-y-4">
                <h2 className="font-display text-xl font-bold text-ink">Pesos</h2>
                <Panel className="space-y-2">
                  {WEIGHTS.map((w) => (
                    <div key={w.cls} className="flex items-baseline gap-4 border-b border-[var(--hairline)] pb-2 last:border-0">
                      <span className="w-28 shrink-0 text-[11px] font-mono text-ink-muted">{w.label}</span>
                      <span className={cn("font-body text-lg text-ink", w.cls)}>Gana la Gloria</span>
                    </div>
                  ))}
                </Panel>
              </section>
            </>
          )}

          {/* ── PRIMITIVOS (re-skineados, sobre el tema actual) ───────────── */}
          {tab === "primitivos" && (
            <div className="space-y-8">
              <Demo title="Button · variants">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="ghost">Ghost</Button>
                <Button disabled>Disabled</Button>
              </Demo>
              <Demo title="Button · sizes">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </Demo>
              <Demo title="Button · fullWidth + IconButton">
                <div className="w-full"><Button fullWidth>Full width</Button></div>
                <IconButton aria-label="Notificaciones">{bell}</IconButton>
                <IconButton aria-label="Cerrar" variant="secondary">✕</IconButton>
              </Demo>

              <Demo title="Input / Select / FormLabel">
                <div className="w-full grid sm:grid-cols-2 gap-4">
                  <div><FormLabel htmlFor="ds-a">Label micro</FormLabel><Input id="ds-a" className="w-full" placeholder="usuario@ejemplo.com" /></div>
                  <div><FormLabel variant="default" htmlFor="ds-b">Label default · error</FormLabel><Input id="ds-b" className="w-full" invalid defaultValue="mal" /></div>
                  <div><FormLabel htmlFor="ds-c">Select</FormLabel><Select id="ds-c" className="w-full"><option className="bg-surface">Grupos</option><option className="bg-surface">Octavos</option></Select></div>
                </div>
              </Demo>

              <Demo title="Badge · tones">
                <Badge tone="primary">✓ Guardado</Badge>
                <Badge tone="danger">Cerrado</Badge>
                <Badge tone="warning">Pronto</Badge>
                <Badge tone="neutral">Neutral</Badge>
                <Badge tone="gold">1º</Badge>
                <Badge tone="silver">2º</Badge>
                <Badge tone="bronze">3º</Badge>
              </Demo>

              <Demo title="AlertBanner · tones">
                <div className="w-full space-y-2">
                  <AlertBanner tone="error">Correo o contraseña incorrectos.</AlertBanner>
                  <AlertBanner tone="success">Invitación válida.</AlertBanner>
                  <AlertBanner tone="warning">El registro es solo por invitación.</AlertBanner>
                  <AlertBanner tone="neutral">Validando invitación…</AlertBanner>
                </div>
              </Demo>

              <Demo title="FilterPill · accents (toggle)">
                {["abiertos", "finalizados", "todos"].map((f) => (
                  <FilterPill key={f} active={filter === f} accent="warning" onClick={() => setFilter(f)}>{f}</FilterPill>
                ))}
                <FilterPill accent="primary" active>Grupos</FilterPill>
                <FilterPill accent="indigo" active>A</FilterPill>
              </Demo>

              <Demo title="Card">
                <Card padding="lg" className="w-full"><p className="text-sm text-ink-muted">Card estándar — bg-surface, sin borde en reposo, rounded-2xl.</p></Card>
                <Card padding="lg" interactive className="w-full"><p className="text-sm text-ink-muted">Card interactive — borde y realce al hover/focus.</p></Card>
              </Demo>

              <Demo title="Spinner · sizes">
                <Spinner size="sm" /><Spinner size="md" /><Spinner size="lg" />
              </Demo>

              <Demo title="EmptyState">
                <EmptyState className="w-full" icon="⚽" title="Sin partidos">No hay partidos para mostrar todavía.</EmptyState>
              </Demo>
            </div>
          )}

          {/* ── DOMINIO (re-skineado sobre tokens · figuritas) ── */}
          {tab === "dominio" && (
            <div className="space-y-8">
              <Demo title="TeamFlag · tamaños (figurita · responsive)">
                {(["xs", "sm", "md", "lg", "xl"] as const).map((s) => (
                  <div key={s} className="flex flex-col items-center gap-1.5">
                    <TeamFlag team="Argentina" size={s} />
                    <span className="font-mono text-[10px] text-ink-muted">{s}</span>
                  </div>
                ))}
                <div className="flex flex-col items-center gap-1.5">
                  <TeamFlag team="Japón" size="lg" />
                  <span className="font-mono text-[10px] text-ink-muted">blanco</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <TeamFlag team="—" size="lg" />
                  <span className="font-mono text-[10px] text-ink-muted">s/país</span>
                </div>
              </Demo>

              <Demo title="PhaseLabel">
                <PhaseLabel phase="group" />
                <PhaseLabel phase="round_of_16" />
                <PhaseLabel phase="finals" className="text-sm" />
              </Demo>

              <Demo title="ScoreBadge · por tier (exacto / resultado / errado)">
                <ScoreBadge points={3} />
                <ScoreBadge points={1} />
                <ScoreBadge points={0} />
                <ScoreBadge points={5} exact />
                <ScoreBadge points={2} />
              </Demo>

              <Demo title="TeamLabel · row (align) / stacked">
                <Card className="w-40"><TeamLabel team="Argentina" align="left" /></Card>
                <Card className="w-40"><TeamLabel team="Brasil" align="right" /></Card>
                <Card className="w-28"><TeamLabel team="México" direction="stacked" /></Card>
              </Demo>

              <Demo title="MatchTeams · row / stacked">
                <Card className="w-full"><MatchTeams homeTeam="Argentina" awayTeam="México" center={<span className="text-sm font-black tabular-nums">2 - 1</span>} /></Card>
                <Card className="w-full"><MatchTeams homeTeam="España" awayTeam="Alemania" center={<span className="text-[11px] text-ink-faint font-bold uppercase">vs</span>} /></Card>
                <Card className="w-full"><MatchTeams direction="stacked" homeTeam="Argentina" awayTeam="México" center={<span className="font-display text-lg font-extrabold tabular-nums text-ink">2 - 1</span>} /></Card>
              </Demo>

              <Demo title="RankBadge · circle / pill">
                {[1, 2, 3, 4].map((r) => <RankBadge key={`c${r}`} rank={r} variant="circle" />)}
                {[1, 2, 3, 4].map((r) => <RankBadge key={`p${r}`} rank={r} variant="pill" />)}
              </Demo>

              <Demo title="GroupSelector">
                <div className="w-full max-w-xs">
                  <GroupSelector groups={MOCK_GROUPS} selectedGroup={selGroup} onChange={(id) => setSelGroup(MOCK_GROUPS.find((g) => g.id === id) ?? null)} label="Grupo Activo" />
                </div>
              </Demo>

              <Demo title="WhatsAppShareButton">
                <div className="w-full max-w-xs"><WhatsAppShareButton message="¡Únete a mi grupo! Código: ABC123" /></div>
              </Demo>

              <Demo title="MatchStatusBadge">
                <MatchStatusBadge status="upcoming" />
                <MatchStatusBadge status="locked" />
                <MatchStatusBadge status="finished" />
              </Demo>

              <Demo title="PointsDisplay · sizes">
                <PointsDisplay value={128} label="puntos" />
                <PointsDisplay value="3" label="puesto" size="sm" />
                <PointsDisplay value={42} label="aciertos" size="lg" />
              </Demo>

              <Demo title="ScoreInput · entrada de predicción (interactivo)">
                <div className="w-full">
                  <ScoreInput
                    home={pred.home}
                    away={pred.away}
                    onHomeChange={(n) => setPred((p) => ({ ...p, home: n }))}
                    onAwayChange={(n) => setPred((p) => ({ ...p, away: n }))}
                  />
                </div>
              </Demo>

              <Demo title="MatchCard · estados (abierto / cerrado / finalizado)">
                <MatchCard
                  className="w-full"
                  phase="round_of_16"
                  status="upcoming"
                  kickoffLabel="Hoy 21:00"
                  homeTeam="Argentina"
                  awayTeam="México"
                  editable
                  prediction={pred}
                  onPredictionChange={(n) => setPred(n)}
                  onSave={() => {}}
                />
                <MatchCard
                  className="w-full"
                  phase="quarter_finals"
                  status="locked"
                  homeTeam="Brasil"
                  awayTeam="Croacia"
                  prediction={{ home: 2, away: 0 }}
                />
                <MatchCard
                  className="w-full"
                  phase="finals"
                  status="finished"
                  homeTeam="Argentina"
                  awayTeam="Francia"
                  result={{ home: 3, away: 2 }}
                  prediction={{ home: 3, away: 2 }}
                  pointsEarned={5}
                  resolutionLabel="Penales"
                />
                <MatchCard
                  className="w-full"
                  phase="finals"
                  status="finished"
                  homeTeam="España"
                  awayTeam="Alemania"
                  result={{ home: 1, away: 1 }}
                  pointsEarned={0}
                />
                <MatchCard
                  className="w-full"
                  layout="stacked"
                  tilt
                  phase="group"
                  status="upcoming"
                  kickoffLabel="Hoy 21:00"
                  homeTeam="Argentina"
                  awayTeam="México"
                  footer={
                    <div className="flex flex-col gap-2">
                      <Button fullWidth size="sm">Cargar mi pronóstico</Button>
                      <Button fullWidth size="sm" variant="ghost">Ver pronósticos del grupo</Button>
                    </div>
                  }
                />
              </Demo>

              <Demo title="LeaderboardRow · card / row">
                <div className="w-full space-y-2">
                  <LeaderboardRow variant="card" rank={1} name="Marce" points={128} />
                  <LeaderboardRow variant="card" rank={2} name="Jorge" points={119} you />
                  <LeaderboardRow variant="card" rank={3} name="Sofi" points={112} />
                </div>
                <div className="w-full">
                  <LeaderboardRow variant="row" rank={4} name="Caro" points={98} />
                  <LeaderboardRow variant="row" rank={5} name="Tú" points={95} you />
                  <LeaderboardRow variant="row" rank={6} name="Tomi" points={88} />
                </div>
              </Demo>

              <Demo title="MatchPredictionRow · pronósticos del grupo por partido">
                <div className="w-full space-y-4">
                  {/* Revelado — el partido terminó: marcador de cada quien + puntos */}
                  <Card padding="sm" className="w-full">
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <PhaseLabel phase="finals" />
                      <MatchStatusBadge status="finished" />
                    </div>
                    <MatchTeams
                      homeTeam="Argentina"
                      awayTeam="Francia"
                      center={<span className="font-display text-lg font-extrabold tabular-nums text-ink">3 - 2</span>}
                    />
                    <div className="mt-2">
                      <MatchPredictionRow name="Marce" prediction={{ home: 3, away: 2 }} pointsEarned={5} exact />
                      <MatchPredictionRow name="Tú" you prediction={{ home: 2, away: 1 }} pointsEarned={1} />
                      <MatchPredictionRow name="Sofi" prediction={{ home: 0, away: 0 }} pointsEarned={0} />
                      <MatchPredictionRow name="Caro" />
                    </div>
                  </Card>

                  {/* Oculto — el partido aún no empieza: la regla esconde los pronósticos */}
                  <Card padding="sm" className="w-full">
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <PhaseLabel phase="group" />
                      <MatchStatusBadge status="upcoming" />
                    </div>
                    <EmptyState icon="🔒" title="Pronósticos ocultos">
                      Se revelan cuando empiece el partido.
                    </EmptyState>
                  </Card>
                </div>
              </Demo>

              <Demo title="ChampionPick · tu campeón (alto compacto · ocupa el ancho del padre)">
                <div className="grid w-full gap-3 sm:grid-cols-2">
                  <ChampionPick champion="Brasil" teams={WORLD_CUP_TEAMS} deadlineLabel="4 de julio" onSave={() => {}} />
                  <ChampionPick champion={null} teams={WORLD_CUP_TEAMS} deadlineLabel="4 de julio" onSave={() => {}} />
                  <ChampionPick champion="Argentina" teams={WORLD_CUP_TEAMS} locked />
                  <ChampionPick teams={WORLD_CUP_TEAMS} hint="Únete a un grupo para elegir tu campeón." />
                </div>
              </Demo>

              <Demo title="PageHeader">
                <div className="w-full">
                  <PageHeader title="Mis predicciones" subtitle="Octavos de final · 8 partidos" action={<Button size="sm">Compartir</Button>} />
                </div>
              </Demo>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
