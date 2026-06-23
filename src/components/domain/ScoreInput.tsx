import { cn } from "@/components/ui";

// Entrada de predicción: dos steppers (local – visitante) con +/− y números
// tabulares grandes. Controlado: pasá `home`/`away` (null = sin cargar) y los
// handlers. Clampa a 0..max. Touch targets de 36px.
export type ScoreInputProps = {
  home: number | null;
  away: number | null;
  onHomeChange: (n: number) => void;
  onAwayChange: (n: number) => void;
  disabled?: boolean;
  max?: number;
  className?: string;
};

function Stepper({
  value,
  onChange,
  disabled,
  max,
  side,
}: {
  value: number | null;
  onChange: (n: number) => void;
  disabled?: boolean;
  max: number;
  side: "local" | "visitante";
}) {
  const v = value ?? 0;
  const btn =
    "edge h-9 w-9 shrink-0 rounded-full bg-surface-2 text-[var(--accent)] text-xl font-bold leading-none flex items-center justify-center select-none disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={btn}
        disabled={disabled || v <= 0}
        aria-label={`Restar gol ${side}`}
        onClick={() => onChange(Math.max(0, v - 1))}
      >
        −
      </button>
      <span className="w-10 text-center font-display text-4xl font-extrabold tabular-nums leading-none text-ink">
        {value ?? "–"}
      </span>
      <button
        type="button"
        className={btn}
        disabled={disabled || v >= max}
        aria-label={`Sumar gol ${side}`}
        onClick={() => onChange(Math.min(max, v + 1))}
      >
        +
      </button>
    </div>
  );
}

export function ScoreInput({
  home,
  away,
  onHomeChange,
  onAwayChange,
  disabled,
  max = 20,
  className,
}: ScoreInputProps) {
  return (
    <div className={cn("flex items-center justify-center gap-3", className)}>
      <Stepper value={home} onChange={onHomeChange} disabled={disabled} max={max} side="local" />
      <span className="font-display text-2xl font-bold text-ink-faint" aria-hidden>
        –
      </span>
      <Stepper value={away} onChange={onAwayChange} disabled={disabled} max={max} side="visitante" />
    </div>
  );
}
