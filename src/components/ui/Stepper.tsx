import { cn } from "./cn";

// Stepper de un valor (− N +), táctil y compacto. Más práctico que tipear en
// campos chicos. Controlado; clampa a [min, max]. `suffix` opcional ("pts", "%").
export type StepperProps = {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  suffix?: string;
  className?: string;
};

export function Stepper({ value, onChange, min = 0, max = 999, step = 1, label, suffix, className }: StepperProps) {
  const btn =
    "edge inline-flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-surface-2 text-lg font-bold leading-none text-ink transition-colors hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";
  return (
    <div className={className}>
      {label && <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>}
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={btn} disabled={value <= min} aria-label={`Restar ${label ?? ""}`.trim()} onClick={() => onChange(Math.max(min, value - step))}>
          −
        </button>
        <span className="font-display text-base font-extrabold tabular-nums text-ink">
          {value}
          {suffix && <span className="ml-0.5 text-[11px] font-bold text-ink-faint">{suffix}</span>}
        </span>
        <button type="button" className={btn} disabled={value >= max} aria-label={`Sumar ${label ?? ""}`.trim()} onClick={() => onChange(Math.min(max, value + step))}>
          +
        </button>
      </div>
    </div>
  );
}
