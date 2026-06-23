import { PHASE_TRANSLATIONS } from "@/lib/constants";
import { cn } from "@/components/ui";

// Match phase as an uppercase accent caption (lime en oscuro / verde profundo
// en claro) — centraliza el patrón `(PHASE_TRANSLATIONS[phase] || phase)
// .toUpperCase()` repetido en dashboard/admin/groups. El tamaño lo decide el
// caller (usos van de text-[8px] a text-sm), vía className.
export type PhaseLabelProps = React.HTMLAttributes<HTMLSpanElement> & {
  phase: string;
};

export function PhaseLabel({ phase, className, ...props }: PhaseLabelProps) {
  return (
    <span
      className={cn("text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]", className)}
      {...props}
    >
      {(PHASE_TRANSLATIONS[phase] || phase).toUpperCase()}
    </span>
  );
}
