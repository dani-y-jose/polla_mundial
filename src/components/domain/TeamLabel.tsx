import { cn } from "@/components/ui";
import { TeamFlag, type TeamFlagSize } from "./TeamFlag";

// Bandera + nombre de equipo. `direction="row"` (default): horizontal, con
// `align` left/right (left = bandera primero / away; right = nombre primero /
// home). `direction="stacked"`: bandera arriba, nombre abajo, centrado (bloque
// "Hoy" del dashboard). `size` escala bandera + nombre a la vez (default: lg en
// stacked, md en row). El nombre trunca para no romper el layout.
export type TeamLabelSize = "sm" | "md" | "lg" | "xl";

export type TeamLabelProps = {
  team: string;
  align?: "left" | "right";
  direction?: "row" | "stacked";
  size?: TeamLabelSize;
  className?: string;
  nameClassName?: string;
  flagClassName?: string;
};

const FLAG_FOR: Record<TeamLabelSize, TeamFlagSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
};
const ROW_NAME: Record<TeamLabelSize, string> = {
  sm: "text-[11px] sm:text-xs",
  md: "text-xs sm:text-sm",
  lg: "text-sm sm:text-base",
  xl: "text-base sm:text-lg",
};
const STACK_NAME: Record<TeamLabelSize, string> = {
  sm: "text-[11px]",
  md: "text-xs sm:text-sm",
  lg: "text-sm sm:text-base",
  xl: "text-base sm:text-lg",
};

export function TeamLabel({
  team,
  align = "left",
  direction = "row",
  size,
  className,
  nameClassName,
  flagClassName,
}: TeamLabelProps) {
  const sz: TeamLabelSize = size ?? (direction === "stacked" ? "lg" : "md");

  if (direction === "stacked") {
    return (
      <span className={cn("flex flex-col items-center gap-1.5 min-w-0 text-center", className)}>
        <TeamFlag team={team} size={FLAG_FOR[sz]} className={flagClassName} />
        <span className={cn("font-bold leading-tight truncate max-w-full text-ink", STACK_NAME[sz], nameClassName)}>
          {team}
        </span>
      </span>
    );
  }

  const flag = <TeamFlag team={team} size={FLAG_FOR[sz]} className={flagClassName} />;
  const name = (
    <span className={cn("font-semibold truncate text-ink", ROW_NAME[sz], align === "right" && "text-right", nameClassName)}>
      {team}
    </span>
  );
  return (
    <span className={cn("flex items-center gap-1.5 sm:gap-2 min-w-0", align === "right" && "justify-end", className)}>
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
