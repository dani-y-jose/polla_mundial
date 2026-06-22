import { cn } from "./cn";

// Standard form input. Replaces the `bg-black/50 border border-white/10` field
// copy-pasted across login/admin/groups (with radius/ring drift). Pair with
// <FormLabel htmlFor> for an accessible label. `invalid` wires aria-invalid +
// a danger ring so error states read consistently.
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full px-4 py-2.5 bg-black/50 border rounded-xl text-sm text-white placeholder:text-gray-500",
        "focus:outline-none focus:ring-2 transition-all",
        invalid ? "border-danger/60 focus:ring-danger" : "border-white/10 focus:ring-primary",
        className,
      )}
      {...props}
    />
  );
}
