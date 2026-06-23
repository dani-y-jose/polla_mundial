import { cn } from "./cn";

// Placeholder para listas vacías (sin partidos / sin predicciones / sin grupos).
// Ícono opcional + título, con children libre para la línea de apoyo.
export type EmptyStateProps = React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode;
  title?: string;
};

export function EmptyState({ icon, title, children, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn("p-8 text-center bg-surface rounded-2xl text-ink-muted text-xs", className)}
      {...props}
    >
      {icon && <div className="text-2xl mb-2">{icon}</div>}
      {title && <p className="font-semibold text-ink mb-1">{title}</p>}
      {children}
    </div>
  );
}
