import { cn } from "@/components/ui";
import { TeamLabel } from "./TeamLabel";

// La fila local — centro — visitante del corazón de toda match card. `center`
// es lo que va entre los equipos: un marcador ("2 - 1"), un "vs", o un label.
// `direction="row"` (default): equipos horizontales (home a la derecha, away a
// la izquierda). `direction="stacked"`: equipos apilados y centrados (hero).
export type MatchTeamsProps = {
  homeTeam: string;
  awayTeam: string;
  center?: React.ReactNode;
  direction?: "row" | "stacked";
  className?: string;
};

export function MatchTeams({ homeTeam, awayTeam, center, direction = "row", className }: MatchTeamsProps) {
  if (direction === "stacked") {
    return (
      <div className={cn("flex items-center justify-between gap-2", className)}>
        <TeamLabel team={homeTeam} direction="stacked" className="flex-1" />
        <div className="shrink-0 px-2 text-center">{center}</div>
        <TeamLabel team={awayTeam} direction="stacked" className="flex-1" />
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <TeamLabel team={homeTeam} align="right" className="flex-1" />
      <div className="shrink-0 px-2 text-center">{center}</div>
      <TeamLabel team={awayTeam} align="left" className="flex-1" />
    </div>
  );
}
