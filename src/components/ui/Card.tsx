import { cn } from "./cn";

// Superficie contenedora: `bg-surface` + esquinas redondeadas. SIN borde en
// reposo (la separación sale del fill: surface es más claro que el bg). Una card
// interactiva (clickeable) opta por `interactive`, que agrega borde de hover/focus
// (`.edge`) y un realce de superficie. `padding` cubre los pasos comunes.
export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
  /** @deprecated Glassmorphism eliminado — se acepta por compat, sin efecto. */
  blur?: boolean;
};

const PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function Card({ padding = "md", interactive = false, blur, className, ...props }: CardProps) {
  void blur;
  return (
    <div
      className={cn(
        "bg-surface rounded-2xl",
        PADDING[padding],
        interactive && "edge cursor-pointer transition-colors hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}
