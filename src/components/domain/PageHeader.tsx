import { cn } from "@/components/ui";

// Cabecera de página: título (display) + subtítulo opcional + acción a la
// derecha (botón, selector, etc.). Usada en login/dashboard/groups/admin.
export type PageHeaderProps = {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-4 flex-wrap", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-muted">{subtitle}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
