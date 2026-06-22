import { getFlag } from "@/lib/flags";
import { cn } from "@/components/ui";

// Flag + team name — the most-repeated pairing in the app (~80× in the dashboard
// alone). align="right" puts the name before the flag (home side); "left" puts
// the flag first (away side). The name truncates so long names never break the
// row layout.
export type TeamLabelProps = {
  team: string;
  align?: "left" | "right";
  className?: string;
  nameClassName?: string;
  flagClassName?: string;
};

export function TeamLabel({
  team,
  align = "left",
  className,
  nameClassName,
  flagClassName,
}: TeamLabelProps) {
  const flag = <span className={cn("text-base shrink-0", flagClassName)}>{getFlag(team)}</span>;
  const name = (
    <span className={cn("font-semibold text-[11px] truncate", align === "right" && "text-right", nameClassName)}>
      {team}
    </span>
  );
  return (
    <span className={cn("flex items-center gap-1.5 min-w-0", align === "right" && "justify-end", className)}>
      {align === "right" ? (
        <>
          {name}
          {flag}
        </>
      ) : (
        <>
          {flag}
          {name}
        </>
      )}
    </span>
  );
}
