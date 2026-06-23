import { cn } from "@/components/ui";
import { ScoreBadge } from "./ScoreBadge";

// Fila de "pronósticos del grupo" para UN partido: el marcador que predijo cada
// integrante. Pensada para revelarse recién cuando el partido empieza (regla del
// juego — antes, el contenedor muestra el estado oculto). Si el partido ya tiene
// puntos (terminó), suma el ScoreBadge (y la dorada si clavó el exacto).
export type MatchPredictionRowProps = {
  name: string;
  prediction?: { home: number; away: number } | null;
  pointsEarned?: number | null;
  exact?: boolean;
  you?: boolean;
  className?: string;
};

export function MatchPredictionRow({
  name,
  prediction,
  pointsEarned,
  exact,
  you = false,
  className,
}: MatchPredictionRowProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const hasPred = !!prediction;
  const scored = pointsEarned != null;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 sm:gap-3 py-2.5 border-b border-[var(--hairline)] last:border-0",
        you && "rounded-lg bg-surface-2 px-2 ring-1 ring-accent/30",
        className,
      )}
    >
      <span
        aria-hidden
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/8 font-display text-xs font-bold text-ink ring-1 ring-[var(--hairline)]"
      >
        {initial}
      </span>
      <span className="flex-1 min-w-0 truncate font-semibold text-ink">
        {name}
        {you && (
          <span className="ml-1.5 inline-flex items-center rounded-full bg-accent/15 px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-accent">
            tú
          </span>
        )}
      </span>
      {hasPred ? (
        <span className="font-display text-base sm:text-lg font-bold tabular-nums text-ink whitespace-nowrap">
          {prediction!.home}
          <span className="px-1 text-ink-faint">-</span>
          {prediction!.away}
        </span>
      ) : (
        <span className="text-[11px] font-medium text-ink-faint">sin pronóstico</span>
      )}
      {scored && hasPred && <ScoreBadge points={pointsEarned ?? 0} exact={exact} />}
    </div>
  );
}
