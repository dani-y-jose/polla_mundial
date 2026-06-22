import { cn } from "@/components/ui";

// Indicador de puesto en la tabla. `pill` = chip del podio ("1º"); `circle` =
// medallón numerado. Puestos 1-3 usan el metálico (oro/plata/bronce); del 4º en
// adelante, neutro. El color metálico ES la medalla (sin emoji).
const PODIUM: Record<number, string> = {
  1: "bg-gold text-[#2e2200]",
  2: "bg-silver text-[#1b2226]",
  3: "bg-bronze text-[#2a1606]",
};
const NEUTRAL = "bg-ink/8 text-ink-muted";

export type RankBadgeProps = {
  rank: number; // 1-based standing
  variant?: "pill" | "circle";
  className?: string;
};

export function RankBadge({ rank, variant = "circle", className }: RankBadgeProps) {
  const s = PODIUM[rank] ?? NEUTRAL;

  if (variant === "pill") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
          s,
          className,
        )}
      >
        {rank}º
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold tabular-nums",
        s,
        className,
      )}
    >
      {rank}
    </span>
  );
}
