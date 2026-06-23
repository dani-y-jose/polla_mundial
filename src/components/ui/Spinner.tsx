import { cn } from "./cn";

// Loading spinner. role="status" + aria-label so screen readers announce the
// loading state instead of silence.
const SIZES = {
  sm: "h-5 w-5 border-2",
  md: "h-8 w-8 border-[3px]",
  lg: "h-10 w-10 border-4",
} as const;

export type SpinnerProps = React.HTMLAttributes<HTMLDivElement> & {
  size?: keyof typeof SIZES;
  label?: string;
};

export function Spinner({ size = "md", label = "Cargando", className, ...props }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "rounded-full border-primary border-t-transparent animate-spin",
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
