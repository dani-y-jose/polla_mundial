import { cn } from "./cn";

// <select> nativo, al tono del Input. Las <option> nativas no heredan el tema;
// si hace falta, el caller les pone su propio bg (p. ej. className="bg-surface").
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full px-4 py-2.5 rounded-xl text-sm bg-surface-2 text-ink",
        "border-2 transition-colors focus:outline-none focus-visible:ring-2",
        invalid
          ? "border-[var(--danger)] focus-visible:ring-[var(--danger)]"
          : "border-transparent hover:border-[var(--accent)] focus:border-[var(--accent)] focus-visible:ring-[var(--accent)]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
