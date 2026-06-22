import { cn } from "@/components/ui";
import { TeamLabel } from "./TeamLabel";

// The home — center — away row at the heart of every match card. `center` is
// whatever belongs between the teams in context: a final score ("2 - 1"), a
// "vs", a live label, or the prediction score inputs.
export type MatchTeamsProps = {
  homeTeam: string;
  awayTeam: string;
  center?: React.ReactNode;
  className?: string;
};

export function MatchTeams({ homeTeam, awayTeam, center, className }: MatchTeamsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <TeamLabel team={homeTeam} align="right" className="flex-1" />
      <div className="shrink-0 px-2 text-center">{center}</div>
      <TeamLabel team={awayTeam} align="left" className="flex-1" />
    </div>
  );
}
