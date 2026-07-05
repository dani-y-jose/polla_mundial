import { cn, ProgressBar, Badge } from "@/components/ui";
import { PointsDisplay } from "./PointsDisplay";

// Resumen "¿cómo voy con el álbum?": % completado + barra (con trama de
// impresión) + cuánto tengo / me falta. DELEITE: al completarlo la barra pasa a
// ORO con una pasada de brillo (foil) y aparece el sello "Álbum completo" — el
// oro sólo como badge sólido, nunca como texto. Presentacional — recibe los
// totales ya calculados.
export type AlbumProgressProps = {
  owned: number;
  total: number;
  className?: string;
};

export function AlbumProgress({ owned, total, className }: AlbumProgressProps) {
  const missing = Math.max(0, total - owned);
  const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
  const complete = total > 0 && owned >= total;
  return (
    <div className={cn("space-y-4 rounded-2xl bg-surface p-5 ring-1 ring-[var(--hairline)]", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PointsDisplay value={`${pct}%`} label={complete ? "¡lo lograste!" : "completado"} />
          {complete && <Badge tone="gold">Álbum completo</Badge>}
        </div>
        <div className="flex gap-5">
          <PointsDisplay size="sm" value={owned} label="tengo" />
          <PointsDisplay size="sm" value={missing} label="me faltan" />
        </div>
      </div>
      <ProgressBar value={owned} max={total} tone={complete ? "gold" : "primary"} texture shine={complete} />
    </div>
  );
}
