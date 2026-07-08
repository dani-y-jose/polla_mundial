"use client";

import { useState } from "react";
import { Badge, Card, cn } from "@/components/ui";
import type { Group } from "@/types";
import { CHAMPION_POINTS, DEFAULT_GROUP_RULES, PHASE_TRANSLATIONS, QUALIFIER_POINTS } from "@/lib/constants";

// Resumen del grupo: el pozo (inscripción + estimado + reparto 1º/2º/3º) y las
// reglas de puntos. El pozo estimado = miembros × inscripción. Las medallas usan
// Badge sólido (no texto dorado — el dorado sobre claro no contrasta).
export type GroupSummaryProps = {
  group: Group;
  memberCount: number;
  className?: string;
};

const money = (n: number) => `$${n.toLocaleString("es")}`;
const points = (n: number) => (n === 1 ? "1 punto" : `${n} puntos`);

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
  const [infoOpen, setInfoOpen] = useState(false);
  const fee = group.entryFee ?? 0;
  const paid = fee > 0;
  const exemptCount = group.feeExemptMembers?.filter((uid) => group.members.includes(uid)).length ?? 0;
  const pool = Math.max(0, memberCount - exemptCount) * fee;
  const dist = group.prizeDistribution;
  const rules = group.rules ?? DEFAULT_GROUP_RULES;
  const hasPhaseBonus =
    rules.quarterFinalsBonus > 0 || rules.semiFinalsBonus > 0 || rules.finalsBonus > 0;

  const medals = [
    { tone: "gold", label: "1º", pct: dist?.firstPlacePercent ?? 0 },
    { tone: "silver", label: "2º", pct: dist?.secondPlacePercent ?? 0 },
    { tone: "bronze", label: "3º", pct: dist?.thirdPlacePercent ?? 0 },
  ] as const;

  return (
    <Card padding="md" className={cn("space-y-3", className)}>
      {/* Fase de arranque — solo si el grupo no juega todo el torneo */}
      {group.startPhase && group.startPhase !== "group" && (
        <div className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2">
          <span className="text-sm">🎯</span>
          <p className="text-xs font-bold text-ink">
            Arranca en {PHASE_TRANSLATIONS[group.startPhase] ?? group.startPhase}
          </p>
        </div>
      )}

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
            {exemptCount > 0 && (
              <p className="text-[10px] text-ink-faint">
                {exemptCount === 1 ? "1 integrante exento" : `${exemptCount} integrantes exentos`} de inscripción
              </p>
            )}
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
        <div className="mb-1.5 flex items-center gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Reglas de puntos</p>
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            aria-expanded={infoOpen}
            aria-label="Cómo se calculan los puntos y bonos"
            className={cn(
              "grid size-4 place-items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              infoOpen ? "text-[var(--accent)]" : "text-ink-faint hover:text-ink",
            )}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5" />
              <path d="M12 7.5h.01" />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <Rule label="Marcador exacto" pts={rules.exactScorePoints} />
          <Rule label="Acertar al ganador" pts={rules.correctOutcomePoints} />
          {rules.uniquePredictionPoints > 0 && <Rule label="Bono predicción única" pts={rules.uniquePredictionPoints} bonus />}
          {rules.quarterFinalsBonus > 0 && <Rule label="Bono cuartos" pts={rules.quarterFinalsBonus} bonus />}
          {rules.semiFinalsBonus > 0 && <Rule label="Bono semis" pts={rules.semiFinalsBonus} bonus />}
          {rules.finalsBonus > 0 && <Rule label="Bono final" pts={rules.finalsBonus} bonus />}
        </div>

        {infoOpen && (
          <div className="mt-2 space-y-2 rounded-lg bg-surface-2 p-3 text-[11px] leading-snug text-ink-muted">
            <p>
              <strong className="text-ink">Marcador exacto:</strong> aciertas el resultado tal cual (ej. 2-1).
            </p>
            <p>
              <strong className="text-ink">Acertar al ganador:</strong> aciertas quién gana o el empate, aunque el marcador no sea exacto.
            </p>
            {rules.uniquePredictionPoints > 0 && (
              <p>
                <strong className="text-ink">Bono predicción única:</strong> si eres el único del grupo que acierta el marcador exacto de un partido, sumas este extra.
              </p>
            )}
            <p>
              <strong className="text-ink">Clasifica (+{QUALIFIER_POINTS}):</strong> en eliminatorias, acertar quién avanza suma {points(QUALIFIER_POINTS)} extra, solo si el partido se define por penales.
            </p>
            <p>
              <strong className="text-ink">Campeón (+{CHAMPION_POINTS}):</strong> acertar el campeón del torneo suma {points(CHAMPION_POINTS)}, cuando termina la final.
            </p>
            {hasPhaseBonus && (
              <div className="space-y-1 border-t border-[var(--hairline)] pt-2">
                <p>
                  <strong className="text-ink">Bonos por ronda:</strong> se ganan acertando el ganador (o empate) de{" "}
                  <strong className="text-ink">todos</strong> los partidos de una ronda. Se pagan una sola vez, cuando la ronda termina completa.
                </p>
                <ul className="ml-3 list-disc space-y-0.5">
                  {rules.quarterFinalsBonus > 0 && (
                    <li>
                      <strong className="text-ink">Bono cuartos:</strong> acertar los 8 octavos.
                    </li>
                  )}
                  {rules.semiFinalsBonus > 0 && (
                    <li>
                      <strong className="text-ink">Bono semis:</strong> acertar los 4 cuartos.
                    </li>
                  )}
                  {rules.finalsBonus > 0 && (
                    <li>
                      <strong className="text-ink">Bono final:</strong> acertar las 2 semis.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
