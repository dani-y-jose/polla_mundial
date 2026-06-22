import { cn } from "./cn";

// Form label. `micro` is the uppercase caption style used by the dashboard/admin
// forms (default); `default` is the larger login-form style. Always pass htmlFor
// so the label is associated with its field.
export type FormLabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  variant?: "micro" | "default";
};

export function FormLabel({ variant = "micro", className, ...props }: FormLabelProps) {
  return (
    <label
      className={cn(
        "block mb-1",
        variant === "micro"
          ? "text-[10px] text-gray-400 uppercase tracking-wider font-semibold"
          : "text-sm font-medium text-gray-300",
        className,
      )}
      {...props}
    />
  );
}
