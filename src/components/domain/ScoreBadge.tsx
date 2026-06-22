import { cn } from "@/components/ui";

// Puntos ganados por una predicción ya cerrada. El color encoda el TIER, no el
// valor crudo (las GroupRules son configurables: exactScorePoints puede no ser 3):
//   • exacto ("la dorada") → oro
//   • resultado correcto   → teal
//   • errado (0)           → neutro
// `exact` lo sabe el caller (predicción === resultado); si se omite, se infiere
// de points >= 3 (compat con el 3/1/0 base de calculatePoints).
export type ScoreBadgeProps = {
  points: number;
  exact?: boolean;
  className?: string;
};

export function ScoreBadge({ points, exact, className }: ScoreBadgeProps) {
  const isExact = exact ?? points >= 3;
  const style = isExact
    ? "bg-gold text-[#2e2200]"
    : points > 0
      ? "bg-primary/18 text-[var(--primary-strong)]"
      : "bg-ink/8 text-ink-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
        style,
        className,
      )}
    >
      +{points}
    </span>
  );
}
