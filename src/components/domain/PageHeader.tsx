import { cn } from "@/components/ui";

// Cabecera de página: título (display) + subtítulo opcional + acción a la
// derecha (botón, selector, etc.). Usada en login/dashboard/groups/admin.
// La acción va SIEMPRE pegada a la derecha (`ml-auto`): si en una pantalla
// angosta no entra en la fila, `flex-wrap` la baja pero `ml-auto` la mantiene a
// la derecha (con `justify-between` caía a la izquierda, y ahí el dropdown de la
// campana se salía del canvas).
export type PageHeaderProps = {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <header className={cn("flex items-start gap-4 flex-wrap", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-muted">{subtitle}</div>}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </header>
  );
}
