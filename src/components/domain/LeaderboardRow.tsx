import { cn } from "@/components/ui";
import { RankBadge } from "./RankBadge";

// Fila de tabla: puesto + jugador + puntos. `variant="card"` (dashboard, fila
// como tarjeta; el podio 1-3 se pinta ENTERO con su medalla) o `"row"` (groups,
// fila de tabla densa con divisor). `you` resalta la fila del usuario actual.
export type LeaderboardRowProps = {
  rank: number;
  name: string;
  points: number;
  you?: boolean;
  variant?: "card" | "row";
  className?: string;
};

// Podio (1-3): la card se pinta entera con el metálico SÓLIDO. Tinta oscura
// legible (mismos pares que Badge/RankBadge), disco oscuro para el puesto / chip
// "tú" y un velo tenue para el monograma. Los metálicos son claros en ambos
// temas, así la tinta oscura sirve para light y dark.
const MEDAL: Record<number, { bg: string; ink: string; disc: string; mono: string }> = {
  1: { bg: "bg-gold", ink: "text-[#2e2200]", disc: "bg-[#2e2200] text-gold", mono: "bg-[#2e2200]/14" },
  2: { bg: "bg-silver", ink: "text-[#1b2226]", disc: "bg-[#1b2226] text-silver", mono: "bg-[#1b2226]/14" },
  3: { bg: "bg-bronze", ink: "text-[#2a1606]", disc: "bg-[#2a1606] text-bronze", mono: "bg-[#2a1606]/16" },
};

export function LeaderboardRow({
  rank,
  name,
  points,
  you = false,
  variant = "row",
  className,
}: LeaderboardRowProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const medal = MEDAL[rank];

  // ── Podio en card: componente entero pintado con la medalla ────────────────
  if (variant === "card" && medal) {
    return (
      <div className={cn("flex items-center gap-2.5 sm:gap-3 rounded-2xl p-2.5 sm:p-3", medal.bg, className)}>
        <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold tabular-nums", medal.disc)}>
          {rank}
        </span>
        <span
          aria-hidden
          className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold", medal.mono, medal.ink)}
        >
          {initial}
        </span>
        <span className={cn("flex-1 min-w-0 truncate font-semibold", medal.ink)}>
          {name}
          {you && (
            <span className={cn("ml-1.5 inline-flex items-center rounded-full px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide", medal.disc)}>
              tú
            </span>
          )}
        </span>
        <span className={cn("font-display text-xl sm:text-2xl font-extrabold tabular-nums", medal.ink)}>{points}</span>
      </div>
    );
  }

  // ── Resto: chip "tú" de acento, compartido por card y row ─────────────────
  const youChip = you ? (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-accent/15 px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-accent">
      tú
    </span>
  ) : null;

  if (variant === "card") {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 sm:gap-3 rounded-2xl p-2.5 sm:p-3",
          you ? "bg-surface-2 ring-1 ring-accent/40" : "bg-surface",
          className,
        )}
      >
        <RankBadge rank={rank} variant="circle" />
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/8 font-display text-xs font-bold text-ink ring-1 ring-[var(--hairline)]"
        >
          {initial}
        </span>
        <span className="flex-1 min-w-0 truncate font-semibold text-ink">
          {name}
          {youChip}
        </span>
        <span className="font-display text-xl sm:text-2xl font-extrabold tabular-nums text-ink">{points}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2.5 border-b border-[var(--hairline)] last:border-0",
        you && "rounded-lg bg-surface-2 px-2 ring-1 ring-accent/30",
        className,
      )}
    >
      <RankBadge rank={rank} variant="pill" />
      <span className="flex-1 min-w-0 truncate font-semibold text-ink">
        {name}
        {youChip}
      </span>
      <span className="font-display text-lg sm:text-xl font-extrabold tabular-nums text-ink">{points}</span>
    </div>
  );
}
