import { cn } from "./cn";

// Barra de progreso genérica. Track = surface-2, relleno = primary / accent /
// gold. `value`/`max` se normalizan a 0–100 (clamp). role=progressbar con
// aria-values. Extras opt-in para el álbum: `texture` = trama de impresión
// (.halftone) sobre el relleno; `shine` = una pasada de brillo tipo foil cuando
// está al 100% (celebración, motion-safe). El ancho anima al cambiar el valor.
export type ProgressBarTone = "primary" | "accent" | "gold";

export type ProgressBarProps = {
  value: number;
  max?: number;
  tone?: ProgressBarTone;
  texture?: boolean;
  shine?: boolean;
  className?: string;
};

const FILL: Record<ProgressBarTone, string> = {
  primary: "bg-primary",
  accent: "bg-[var(--accent)]",
  gold: "bg-gold",
};

export function ProgressBar({
  value,
  max = 100,
  tone = "primary",
  texture = false,
  shine = false,
  className,
}: ProgressBarProps) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div
        className={cn(
          "relative h-full overflow-hidden rounded-full transition-[width] duration-500 ease-out",
          FILL[tone],
          texture && "halftone",
        )}
        style={{ width: `${pct}%` }}
      >
        {shine && pct >= 100 && (
          <span
            aria-hidden
            className="album-shine pointer-events-none absolute inset-y-0 left-0 w-1/3"
            style={{
              background:
                "linear-gradient(100deg, transparent, color-mix(in srgb, var(--on-primary) 60%, transparent), transparent)",
            }}
          />
        )}
      </div>
    </div>
  );
}
