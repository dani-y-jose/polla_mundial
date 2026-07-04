import { cn } from "./cn";

// Toast flotante de feedback. Presentacional: el padre controla `open` y el
// auto-cierre (setTimeout). Se ancla fijo arriba-centro, por encima de todo
// (incluidos los modales, z-[110]) y entra deslizando desde arriba. El tono
// define color + ícono; role/aria-live se ajustan para lectores de pantalla.
export type ToastTone = "success" | "error";

const TONES: Record<ToastTone, string> = {
  success: "bg-primary text-[var(--on-primary)]",
  error: "bg-danger text-white",
};

const ICONS: Record<ToastTone, string> = {
  success: "✓",
  error: "✕",
};

export type ToastProps = {
  open: boolean;
  tone?: ToastTone;
  onDismiss?: () => void;
  children: React.ReactNode;
};

export function Toast({ open, tone = "success", onDismiss, children }: ToastProps) {
  if (!open) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[110] flex justify-center px-4">
      <div
        role={tone === "error" ? "alert" : "status"}
        aria-live={tone === "error" ? "assertive" : "polite"}
        onClick={onDismiss}
        className={cn(
          "pointer-events-auto flex max-w-[92vw] cursor-pointer items-center gap-2.5 rounded-full px-5 py-3 text-sm font-bold shadow-lg shadow-black/30 ring-1 ring-white/15",
          "motion-safe:animate-[toastIn_240ms_cubic-bezier(0.2,0.8,0.2,1)]",
          TONES[tone],
        )}
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/20 text-[11px] leading-none">
          {ICONS[tone]}
        </span>
        <span className="truncate">{children}</span>
      </div>
    </div>
  );
}
