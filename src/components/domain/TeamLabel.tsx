import { cn } from "@/components/ui";
import { TeamFlag } from "./TeamFlag";

// Bandera + nombre de equipo. `direction="row"` (default): horizontal, con
// `align` left/right (left = bandera primero / away; right = nombre primero /
// home). `direction="stacked"`: bandera arriba, nombre abajo, centrado (bloque
// "Hoy" del dashboard). El nombre trunca para no romper el layout.
export type TeamLabelProps = {
  team: string;
  align?: "left" | "right";
  direction?: "row" | "stacked";
  className?: string;
  nameClassName?: string;
  flagClassName?: string;
};

export function TeamLabel({
  team,
  align = "left",
  direction = "row",
  className,
  nameClassName,
  flagClassName,
}: TeamLabelProps) {
  if (direction === "stacked") {
    return (
      <span className={cn("flex flex-col items-center gap-1 min-w-0 text-center", className)}>
        <TeamFlag team={team} size="md" className={flagClassName} />
        <span className={cn("font-bold text-xs truncate max-w-full", nameClassName)}>{team}</span>
      </span>
    );
  }

  const flag = <TeamFlag team={team} size="sm" className={flagClassName} />;
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
