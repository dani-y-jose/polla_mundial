import { Card } from "@/components/ui";

// Explica cómo puntúan las fases de eliminación (16avos+). Reemplaza los emojis
// de colores por iconos lineales monocromo (mismo trazo que la navegación),
// realzados en `--accent` (AA sobre superficies en claro/oscuro) para encajar
// en el DS monocromo violeta + lime.

function RuleIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-px grid size-6 shrink-0 place-items-center rounded-lg bg-accent/12 text-[var(--accent)]">
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </span>
  );
}

export function KnockoutScoringCard() {
  return (
    <Card padding="md" className="space-y-3 border border-accent/25 bg-accent/[0.06]">
      <div className="flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px] shrink-0 text-[var(--accent)]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 7.5h.01" />
        </svg>
        <h3 className="font-display text-sm font-bold text-ink">Cómo puntúan las eliminatorias</h3>
      </div>

      <ul className="space-y-2.5 text-[13px] leading-snug text-ink-muted">
        <li className="flex items-start gap-2.5">
          <RuleIcon>
            {/* Cronómetro: el marcador cuenta hasta el minuto 120. */}
            <path d="M9 2.5h6" />
            <path d="M12 2.5v2" />
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9.5V13l2.5 1.5" />
          </RuleIcon>
          <span>
            El marcador y el ganador se cuentan <strong className="text-ink">hasta el minuto 120</strong>{" "}
            (con tiempo extra). Si termina en empate, ese empate es el que puntúa.
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <RuleIcon>
            {/* Diana: acertar quién clasifica. */}
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="12" cy="12" r="1" />
          </RuleIcon>
          <span>
            Acertar <strong className="text-ink">quién clasifica</strong> suma{" "}
            <strong className="text-ink">1 punto extra</strong>, solo si el partido se define por penales.
          </span>
        </li>
      </ul>
    </Card>
  );
}
