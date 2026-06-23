import { cn } from "./cn";

// El botón de la app, en las cuatro formas que aparecen en las rutas. Colores
// desde tokens. Sin borde en reposo: `.edge` pinta el borde (`--outline`) sólo
// en hover/focus (afordancia de interacción). min-h por tamaño = touch 44px.

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  // primary es el INVERSO de secondary: el texto de secondary (ink) pasa a ser
  // el fondo, y el fondo de secondary (surface) pasa a ser el texto. El borde de
  // hover usa una variante de primary (`--edge`), que sí contrasta sobre el fondo.
  primary: "bg-ink text-surface hover:bg-[var(--ink-muted)] [--edge:var(--primary)]",
  secondary: "bg-surface text-ink hover:bg-surface-2",
  danger: "bg-danger text-white hover:bg-danger-hover",
  ghost: "bg-transparent text-ink-muted hover:text-ink hover:bg-surface",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-[36px] px-3 text-xs",
  md: "min-h-[44px] px-5 text-sm",
  lg: "min-h-[52px] px-6 text-base",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  // Default to "button" so a button inside a <form> never submits by accident —
  // submit buttons opt in with type="submit".
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "edge inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
}

// Square, icon-only button (notification bell, close ×). aria-label is required
// because there's no visible text to name it for screen readers.
export type IconButtonProps = Omit<ButtonProps, "size" | "fullWidth"> & {
  "aria-label": string;
};

export function IconButton({ variant = "ghost", className, ...props }: IconButtonProps) {
  return (
    <Button
      variant={variant}
      className={cn("min-h-0 h-9 w-9 p-0 rounded-lg", className)}
      {...props}
    />
  );
}
