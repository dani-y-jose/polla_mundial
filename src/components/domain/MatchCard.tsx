import { Card, Button, cn } from "@/components/ui";
import type { MatchStatus } from "@/types";
import { MatchTeams } from "./MatchTeams";
import { PhaseLabel } from "./PhaseLabel";
import { MatchStatusBadge } from "./MatchStatusBadge";
import { ScoreInput } from "./ScoreInput";
import { ScoreBadge } from "./ScoreBadge";

// Card de partido state-driven: según el estado del partido y la predicción del
// usuario, renderiza el bloque correcto:
//   • editable (abierto)      → ScoreInput + botón Guardar/Actualizar
//   • cerrado (locked/en vivo)→ predicción del user en solo lectura
//   • finalizado              → resultado real + tu predicción + ScoreBadge
//   • abierto NO editable     → solo equipos (preview, p. ej. hero "Hoy")
// El header (fase + kickoff + estado) es común. `layout` controla los equipos
// ("row" horizontal / "stacked" apilados). `footer` es contenido extra opcional
// (CTA, estadio, etc.) debajo del cuerpo.

export type MatchScore = { home: number; away: number };
export type PredictionScore = { home: number | null; away: number | null };

export type MatchCardProps = {
  homeTeam: string;
  awayTeam: string;
  phase?: string;
  status?: MatchStatus;
  kickoffLabel?: string;
  layout?: "row" | "stacked";
  prediction?: PredictionScore | null;
  result?: MatchScore | null;
  pointsEarned?: number | null;
  resolutionLabel?: string;
  editable?: boolean;
  onPredictionChange?: (next: MatchScore) => void;
  onSave?: () => void;
  saving?: boolean;
  footer?: React.ReactNode;
  tilt?: boolean;
  className?: string;
};

function BigScore({ home, away }: MatchScore) {
  return (
    <span className="font-display text-2xl font-extrabold tabular-nums leading-none text-ink">
      {home} - {away}
    </span>
  );
}

const Vs = () => <span className="text-[11px] font-bold uppercase text-ink-faint">vs</span>;

export function MatchCard({
  homeTeam,
  awayTeam,
  phase,
  status = "upcoming",
  kickoffLabel,
  layout = "row",
  prediction,
  result,
  pointsEarned,
  resolutionLabel,
  editable = false,
  onPredictionChange,
  onSave,
  saving = false,
  footer,
  tilt,
  className,
}: MatchCardProps) {
  const hasPrediction =
    !!prediction && prediction.home !== null && prediction.away !== null;
  const finished = status === "finished";
  const exactHit =
    hasPrediction && !!result && prediction!.home === result.home && prediction!.away === result.away;

  return (
    <Card padding="md" className={cn("space-y-3", tilt && "tilt-l", className)}>
      <div className="flex items-center justify-between gap-2">
        {phase ? <PhaseLabel phase={phase} /> : <span />}
        <div className="flex items-center gap-2">
          {kickoffLabel && (
            <span className="text-[11px] font-medium text-ink-muted tabular-nums">{kickoffLabel}</span>
          )}
          <MatchStatusBadge status={status} />
        </div>
      </div>

      {editable ? (
        <>
          <MatchTeams homeTeam={homeTeam} awayTeam={awayTeam} center={<Vs />} direction={layout} />
          <ScoreInput
            home={prediction?.home ?? null}
            away={prediction?.away ?? null}
            disabled={saving}
            onHomeChange={(h) => onPredictionChange?.({ home: h, away: prediction?.away ?? 0 })}
            onAwayChange={(a) => onPredictionChange?.({ home: prediction?.home ?? 0, away: a })}
          />
          <Button fullWidth onClick={onSave} disabled={saving || !hasPrediction}>
            {saving ? "Guardando…" : hasPrediction ? "Actualizar predicción" : "Guardar predicción"}
          </Button>
        </>
      ) : finished ? (
        <>
          <MatchTeams
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            direction={layout}
            center={result ? <BigScore home={result.home} away={result.away} /> : <Vs />}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-muted">
              {hasPrediction ? `Tu predicción: ${prediction!.home} - ${prediction!.away}` : "No predijiste"}
              {resolutionLabel ? ` · ${resolutionLabel}` : ""}
            </span>
            <ScoreBadge points={pointsEarned ?? 0} exact={exactHit} />
          </div>
        </>
      ) : (
        <>
          <MatchTeams
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            direction={layout}
            center={hasPrediction ? <BigScore home={prediction!.home!} away={prediction!.away!} /> : <Vs />}
          />
          {status === "locked" && (
            <p className="text-center text-[11px] text-ink-muted">
              {hasPrediction ? "Tu predicción · cerrada" : "Predicciones cerradas"}
            </p>
          )}
        </>
      )}

      {footer && <div>{footer}</div>}
    </Card>
  );
}
