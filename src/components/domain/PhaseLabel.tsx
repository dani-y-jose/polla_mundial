import { PHASE_TRANSLATIONS } from "@/lib/constants";
import { cn } from "@/components/ui";

// Match phase as an uppercase emerald caption — centralizes the
// `(PHASE_TRANSLATIONS[phase] || phase).toUpperCase()` pattern repeated across
// dashboard/admin/groups. Size is left to the caller (usages range from
// text-[8px] to text-sm), passed via className.
export type PhaseLabelProps = React.HTMLAttributes<HTMLSpanElement> & {
  phase: string;
};

export function PhaseLabel({ phase, className, ...props }: PhaseLabelProps) {
  return (
    <span
      className={cn("text-[10px] font-bold uppercase tracking-wider text-primary-soft", className)}
      {...props}
    >
      {(PHASE_TRANSLATIONS[phase] || phase).toUpperCase()}
    </span>
  );
}
