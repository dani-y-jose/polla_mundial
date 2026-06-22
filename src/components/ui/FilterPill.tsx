import { cn } from "./cn";

// Toggle pill used by the dashboard prediction filters (status / phase / group
// letter). aria-pressed makes the on/off state available to assistive tech.
export type FilterPillAccent = "primary" | "warning" | "indigo";

const ACTIVE: Record<FilterPillAccent, string> = {
  primary: "bg-primary text-black",
  warning: "bg-warning text-black",
  indigo: "bg-indigo-500 text-white",
};

export type FilterPillProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  accent?: FilterPillAccent;
};

export function FilterPill({
  active = false,
  accent = "primary",
  className,
  type = "button",
  ...props
}: FilterPillProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active ? ACTIVE[accent] : "bg-white/5 text-gray-400 hover:text-white",
        className,
      )}
      {...props}
    />
  );
}
