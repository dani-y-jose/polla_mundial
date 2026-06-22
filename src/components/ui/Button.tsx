import { cn } from "./cn";

// The app's button, in the four shapes that actually appear across the routes.
// Brand colors come from the design tokens (bg-primary / bg-danger) so a
// redesign re-skins from globals.css. min-h on every size keeps the 44px touch
// target the DialogProvider already used.

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary hover:bg-primary-hover text-white",
  secondary: "bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white",
  danger: "bg-danger hover:bg-danger-hover text-white",
  ghost: "bg-transparent hover:bg-white/10 text-gray-300 hover:text-white",
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
        "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black",
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
