import { cn } from "./cn";

// Placeholder for empty lists (no matches / no predictions / no groups). Optional
// emoji icon + title, with free-form children for the supporting line.
export type EmptyStateProps = React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode;
  title?: string;
};

export function EmptyState({ icon, title, children, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "p-8 text-center bg-white/5 border border-white/10 rounded-2xl text-gray-500 text-xs",
        className,
      )}
      {...props}
    >
      {icon && <div className="text-2xl mb-2">{icon}</div>}
      {title && <p className="font-semibold text-gray-300 mb-1">{title}</p>}
      {children}
    </div>
  );
}
