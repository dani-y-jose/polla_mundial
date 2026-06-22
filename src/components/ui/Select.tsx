import { cn } from "./cn";

// Native <select> styled to match Input. Options should set their own dark bg
// (e.g. className="bg-neutral-950") since the native menu doesn't inherit it.
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full px-4 py-2.5 bg-black/50 border rounded-xl text-sm text-white",
        "focus:outline-none focus:ring-2 transition-all",
        invalid ? "border-danger/60 focus:ring-danger" : "border-white/10 focus:ring-primary",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
