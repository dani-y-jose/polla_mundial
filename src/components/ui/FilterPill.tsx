import { cn } from "./cn";

// Pastilla toggle (filtros de predicciones: estado / fase / letra de grupo).
// Activa = relleno sólido; inactiva = surface con borde de hover (`.edge`).
// aria-pressed expone el estado on/off a tecnología asistiva.
export type FilterPillAccent = "primary" | "warning" | "indigo";

const ACTIVE: Record<FilterPillAccent, string> = {
  primary: "bg-primary text-[var(--on-primary)]",
  warning: "bg-warning text-[#3a2700]",
  // "indigo" no existe en la paleta monocromo → se mapea al accent.
  indigo: "bg-[var(--accent)] text-[var(--bg)]",
};

export type FilterPillProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  accent?: FilterPillAccent;
};

export function FilterPill({
  active = false,
  accent = "primary",
  className,
  type = "button",
  ...props
}: FilterPillProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        "edge px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        active ? ACTIVE[accent] : "bg-surface text-ink-muted hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}
