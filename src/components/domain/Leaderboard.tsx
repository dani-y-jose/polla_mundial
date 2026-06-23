import { cn } from "@/components/ui";
import { LeaderboardRow } from "./LeaderboardRow";

// Lista de posiciones: mapea entradas YA calculadas a LeaderboardRow. El cálculo
// de puntos vive afuera (calculateGroupScores) — este componente sólo pinta.
// `card` = podio pintado (dashboard) / `row` = tabla densa con divisores.
export type LeaderboardEntry = {
  rank: number;
  name: string;
  points: number;
  you?: boolean;
};

export type LeaderboardProps = {
  entries: LeaderboardEntry[];
  variant?: "card" | "row";
  className?: string;
};

export function Leaderboard({ entries, variant = "card", className }: LeaderboardProps) {
  return (
    <div className={cn(variant === "card" && "space-y-2", className)}>
      {entries.map((e) => (
        <LeaderboardRow key={e.rank} variant={variant} rank={e.rank} name={e.name} points={e.points} you={e.you} />
      ))}
    </div>
  );
}
