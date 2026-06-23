import { cn } from "@/components/ui";
import { TeamLabel, type TeamLabelSize } from "./TeamLabel";

// La fila local — centro — visitante del corazón de toda match card. `center`
// es lo que va entre los equipos: un marcador ("2 - 1"), un "vs", o un label.
// `direction="row"` (default): equipos horizontales (home a la derecha, away a
// la izquierda). `direction="stacked"`: equipos apilados y centrados (hero).
// `size` escala banderas + nombres (default lo decide TeamLabel según direction).
export type MatchTeamsProps = {
  homeTeam: string;
  awayTeam: string;
  center?: React.ReactNode;
  direction?: "row" | "stacked";
  size?: TeamLabelSize;
  className?: string;
};

export function MatchTeams({ homeTeam, awayTeam, center, direction = "row", size, className }: MatchTeamsProps) {
  if (direction === "stacked") {
    return (
      <div className={cn("flex items-center justify-between gap-2 sm:gap-3", className)}>
        <TeamLabel team={homeTeam} direction="stacked" size={size} className="flex-1" />
        <div className="shrink-0 px-1.5 sm:px-2 text-center">{center}</div>
        <TeamLabel team={awayTeam} direction="stacked" size={size} className="flex-1" />
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-2 sm:gap-3", className)}>
      <TeamLabel team={homeTeam} align="right" size={size} className="flex-1" />
      <div className="shrink-0 px-1.5 sm:px-2 text-center">{center}</div>
      <TeamLabel team={awayTeam} align="left" size={size} className="flex-1" />
    </div>
  );
}
