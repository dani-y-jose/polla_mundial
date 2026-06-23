import { cn } from "@/components/ui";

// Número grande de puntos / posición (perfil, header de tabla). Display font +
// tabular. `label` es la leyenda chica de abajo ("pts", "puesto", etc.).
export type PointsDisplayProps = {
  value: number | string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES: Record<NonNullable<PointsDisplayProps["size"]>, string> = {
  sm: "text-2xl",
  md: "text-4xl",
  lg: "text-5xl",
};

export function PointsDisplay({ value, label, size = "md", className }: PointsDisplayProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <span className={cn("font-display font-extrabold tabular-nums leading-none text-ink", SIZES[size])}>
        {value}
      </span>
      {label && (
        <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      )}
    </div>
  );
}
