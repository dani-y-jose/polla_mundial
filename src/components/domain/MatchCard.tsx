import { Card, Button, Badge, cn } from "@/components/ui";
import type { MatchStatus } from "@/types";
import { MatchTeams } from "./MatchTeams";
import { PhaseLabel } from "./PhaseLabel";
import { MatchStatusBadge } from "./MatchStatusBadge";
import { ScoreInput } from "./ScoreInput";
import { ScoreBadge } from "./ScoreBadge";

// Card de partido state-driven: según el estado del partido y la predicción del
// usuario, renderiza el bloque correcto:
//   • editable (abierto)      → ScoreInput + botón Guardar/Actualizar
//   • no editable             → centro = resultado oficial (o "–", nunca la
//                               predicción); abajo tu predicción si la tenés, y
//                               si finalizó: ScoreBadge + sello "la dorada".
// El header (fase + kickoff + estado) es común. `layout` controla los equipos
// ("row" horizontal / "stacked" apilados, banderas más grandes). `footer` es
// contenido extra opcional (CTA, estadio, etc.) debajo del cuerpo. Clavar el
// marcador exacto ("la dorada") corona la card finalizada con un sello dorado.

export type MatchScore = { home: number; away: number };
export type PredictionScore = { home: number | null; away: number | null };
export type Qualifier = "home" | "away";

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
  // Feedback transitorio post-guardado (lo maneja el padre): confirmación de
  // éxito y/o mensaje de error, mostrados bajo el botón Guardar. Acompaña al
  // toast global con una marca en la propia card.
  justSaved?: boolean;
  error?: string | null;
  // "Clasifica" pick (knockout matches): which team the user thinks advances.
  // When `showQualifier`, a required toggle is shown while editing; on a
  // finished match the user's `qualifier` is compared against `actualQualifier`.
  showQualifier?: boolean;
  qualifier?: Qualifier | null;
  onQualifierChange?: (next: Qualifier) => void;
  actualQualifier?: Qualifier | null;
  footer?: React.ReactNode;
  tilt?: boolean;
  className?: string;
};

function BigScore({ home, away }: MatchScore) {
  return (
    <span className="font-display text-2xl sm:text-3xl font-extrabold tabular-nums leading-none whitespace-nowrap text-ink">
      {home}
      <span className="px-1 text-ink-faint">-</span>
      {away}
    </span>
  );
}

const Vs = () => <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">vs</span>;

const NoScore = () => (
  <span className="font-display text-2xl sm:text-3xl font-extrabold leading-none text-ink-faint" aria-label="Sin resultado">
    –
  </span>
);

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
  justSaved = false,
  error,
  showQualifier = false,
  qualifier,
  onQualifierChange,
  actualQualifier,
  footer,
  tilt,
  className,
}: MatchCardProps) {
  const hasPrediction =
    !!prediction && prediction.home !== null && prediction.away !== null;
  const finished = status === "finished";
  const exactHit =
    hasPrediction && !!result && prediction!.home === result.home && prediction!.away === result.away;
  // A knockout pick must be made before saving; the actual qualifier is only
  // known once the match finished and went to penalties.
  const needsQualifier = showQualifier && !qualifier;

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
          {showQualifier && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                ¿Quién clasifica?
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(["home", "away"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    disabled={saving}
                    onClick={() => onQualifierChange?.(side)}
                    aria-pressed={qualifier === side}
                    className={cn(
                      "truncate rounded-lg px-3 py-2 text-sm font-bold transition-colors",
                      qualifier === side
                        ? "bg-primary text-[var(--on-primary)]"
                        : "bg-surface-2 text-ink-muted hover:text-ink",
                    )}
                  >
                    {side === "home" ? homeTeam : awayTeam}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button fullWidth onClick={onSave} disabled={saving || !hasPrediction || needsQualifier}>
            {saving ? "Guardando…" : hasPrediction ? "Actualizar predicción" : "Guardar predicción"}
          </Button>
          {error ? (
            <p className="text-center text-[11px] font-medium text-danger" role="alert">
              {error}
            </p>
          ) : justSaved ? (
            <p
              className="flex items-center justify-center gap-1 text-[11px] font-bold text-[var(--accent)] motion-safe:animate-[fadeIn_180ms_ease-out]"
              role="status"
            >
              ✓ Predicción guardada
            </p>
          ) : null}
        </>
      ) : (
        <>
          <MatchTeams
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            direction={layout}
            center={result ? <BigScore home={result.home} away={result.away} /> : <NoScore />}
          />
          {hasPrediction || finished ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {hasPrediction ? (
                <span className="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Tu pronóstico</span>
                  <span className="font-display text-base font-extrabold tabular-nums leading-none text-ink">
                    {prediction!.home}
                    <span className="px-1 text-ink-faint">-</span>
                    {prediction!.away}
                  </span>
                </span>
              ) : (
                <span className="text-[11px] font-medium text-ink-faint">No predijiste</span>
              )}
              {finished && (
                <div className="flex shrink-0 items-center gap-1.5">
                  {resolutionLabel && <span className="text-[10px] text-ink-faint">{resolutionLabel}</span>}
                  {exactHit && <Badge tone="gold">✦ La dorada</Badge>}
                  <ScoreBadge points={pointsEarned ?? 0} exact={exactHit} />
                </div>
              )}
            </div>
          ) : null}
          {/* Clasifica outcome: only relevant once a knockout match was decided
              by penalties (then `actualQualifier` is set). Shows whether the
              user's pick advanced. */}
          {finished && showQualifier && actualQualifier && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-ink-muted">
                Clasificó:{" "}
                <span className="font-bold text-ink">
                  {actualQualifier === "home" ? homeTeam : awayTeam}
                </span>
              </span>
              {qualifier && (
                <span className={cn("font-bold", qualifier === actualQualifier ? "text-[var(--accent)]" : "text-ink-faint")}>
                  {qualifier === actualQualifier ? "✓ Acertaste" : "✗ Fallaste"}
                </span>
              )}
            </div>
          )}
          {!hasPrediction && !finished && status === "locked" ? (
            <p className="text-center text-[11px] text-ink-muted">Predicciones cerradas</p>
          ) : null}
        </>
      )}

      {footer && <div>{footer}</div>}
    </Card>
  );
}
