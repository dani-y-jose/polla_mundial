import { cn } from "@/components/ui";
import { RankBadge } from "./RankBadge";

// Fila de tabla: puesto + jugador + puntos. `variant="card"` (dashboard, fila
// como tarjeta) o `"row"` (groups, fila de tabla con divisor). `you` resalta la
// fila del usuario actual.
export type LeaderboardRowProps = {
  rank: number;
  name: string;
  points: number;
  you?: boolean;
  variant?: "card" | "row";
  className?: string;
};

export function LeaderboardRow({
  rank,
  name,
  points,
  you = false,
  variant = "row",
  className,
}: LeaderboardRowProps) {
  const inner = (
    <>
      <RankBadge rank={rank} variant={variant === "card" ? "circle" : "pill"} />
      <span className="flex-1 min-w-0 truncate font-semibold text-ink">
        {name}
        {you && <span className="ml-1.5 text-[11px] font-bold text-[var(--accent)]">vos</span>}
      </span>
      <span className="font-display text-lg font-extrabold tabular-nums text-ink">{points}</span>
    </>
  );

  if (variant === "card") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl p-3",
          you ? "bg-surface-2" : "bg-surface",
          className,
        )}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2.5 border-b border-[var(--hairline)] last:border-0",
        you && "rounded-lg bg-surface-2 px-2",
        className,
      )}
    >
      {inner}
    </div>
  );
}
