import { Badge, Card, cn } from "@/components/ui";
import type { Group } from "@/types";
import { DEFAULT_GROUP_RULES } from "@/lib/constants";

// Resumen del grupo: el pozo (inscripción + estimado + reparto 1º/2º/3º) y las
// reglas de puntos. El pozo estimado = miembros × inscripción. Las medallas usan
// Badge sólido (no texto dorado — el dorado sobre claro no contrasta).
export type GroupSummaryProps = {
  group: Group;
  memberCount: number;
  className?: string;
};

const money = (n: number) => `$${n.toLocaleString("es")}`;

function Rule({ label, pts, bonus }: { label: string; pts: number; bonus?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-muted">{label}</span>
      <span className="shrink-0 font-bold tabular-nums text-ink">
        {bonus ? `+${pts}` : pts} {pts === 1 ? "pt" : "pts"}
      </span>
    </div>
  );
}

export function GroupSummary({ group, memberCount, className }: GroupSummaryProps) {
  const fee = group.entryFee ?? 0;
  const paid = fee > 0;
  const pool = memberCount * fee;
  const dist = group.prizeDistribution;
  const rules = group.rules ?? DEFAULT_GROUP_RULES;

  const medals = [
    { tone: "gold", label: "1º", pct: dist?.firstPlacePercent ?? 0 },
    { tone: "silver", label: "2º", pct: dist?.secondPlacePercent ?? 0 },
    { tone: "bronze", label: "3º", pct: dist?.thirdPlacePercent ?? 0 },
  ] as const;

  return (
    <Card padding="md" className={cn("space-y-3", className)}>
      {/* Pozo */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Inscripción</p>
          <p className="font-display text-lg font-extrabold text-ink">{paid ? money(fee) : "Gratis"}</p>
        </div>
        {paid && (
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Pozo estimado</p>
            <p className="font-display text-lg font-extrabold tabular-nums text-ink">🏆 {money(pool)}</p>
          </div>
        )}
      </div>

      {/* Reparto del pozo */}
      {paid && dist && (
        <div className="flex gap-2 border-t border-[var(--hairline)] pt-3">
          {medals.map((m) => (
            <div key={m.label} className="flex flex-1 flex-col items-center gap-1 rounded-lg bg-surface-2 p-2 text-center">
              <Badge tone={m.tone}>{m.label}</Badge>
              <span className="font-display text-sm font-extrabold tabular-nums text-ink">{money((pool * m.pct) / 100)}</span>
              <span className="text-[10px] tabular-nums text-ink-faint">{m.pct}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Reglas de puntos */}
      <div className="border-t border-[var(--hairline)] pt-3">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">Reglas de puntos</p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <Rule label="Marcador exacto" pts={rules.exactScorePoints} />
          <Rule label="Acertar al ganador" pts={rules.correctOutcomePoints} />
          {rules.uniquePredictionPoints > 0 && <Rule label="Bono predicción única" pts={rules.uniquePredictionPoints} bonus />}
          {rules.quarterFinalsBonus > 0 && <Rule label="Bono cuartos" pts={rules.quarterFinalsBonus} bonus />}
          {rules.semiFinalsBonus > 0 && <Rule label="Bono semis" pts={rules.semiFinalsBonus} bonus />}
          {rules.finalsBonus > 0 && <Rule label="Bono final" pts={rules.finalsBonus} bonus />}
        </div>
      </div>
    </Card>
  );
}
