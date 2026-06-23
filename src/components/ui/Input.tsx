import { cn } from "./cn";

// Campo de formulario. Relleno (`surface-2`) sin borde en reposo; el borde
// (`--outline`) aparece en hover/focus, más el ring de foco. `invalid` muestra
// borde coral PERSISTENTE (un error tiene que verse siempre) + aria-invalid.
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full px-4 py-2.5 rounded-xl text-sm bg-surface-2 text-ink placeholder:text-ink-faint",
        "border-2 transition-colors focus:outline-none focus-visible:ring-2",
        invalid
          ? "border-[var(--danger)] focus-visible:ring-[var(--danger)]"
          : "border-transparent hover:border-[var(--accent)] focus:border-[var(--accent)] focus-visible:ring-[var(--accent)]",
        className,
      )}
      {...props}
    />
  );
}
