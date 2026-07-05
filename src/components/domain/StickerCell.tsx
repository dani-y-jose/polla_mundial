"use client";

import { useState } from "react";
import { cn } from "@/components/ui";

// Figurita del álbum como CHIP compacto (vista índice, ~10 por fila). Toggle:
// `owned` = pegada (relleno sólido + check), !owned = hueco (borde punteado,
// código apagado). DELEITE: al PEGARLA (pasa a owned por click) se "estampa"
// como una figurita real (@keyframes stamp, motion-safe), y responde al tacto
// (press-down + leve levantada al hover). Presentacional: el estado sale del
// padre. El sello es local y sólo dispara al AGREGAR — no al quitar ni en el
// montaje inicial (así cientos ya pegadas no estampan todas al cargar).
export type StickerCellProps = {
  code: string;
  owned?: boolean;
  onToggle?: () => void;
  label?: string;
  className?: string;
};

const check = (
  <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 fill-current" aria-hidden>
    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.42z" />
  </svg>
);

export function StickerCell({ code, owned = false, onToggle, label, className }: StickerCellProps) {
  const [stamping, setStamping] = useState(false);
  const name = label ? `${label} · ${code}` : code;

  function handleClick() {
    if (!owned) setStamping(true); // sólo al pegar dispara el sello
    onToggle?.();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onAnimationEnd={() => setStamping(false)}
      aria-pressed={owned}
      aria-label={`${name} — ${owned ? "la tengo" : "me falta"}`}
      title={name}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1 font-mono text-[11px] font-bold leading-none tabular-nums",
        "transition-[color,background-color,border-color,transform] duration-150 active:scale-95",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        owned
          ? "bg-primary text-[var(--on-primary)] shadow-sm hover:-translate-y-px hover:bg-[var(--primary-strong)]"
          : "border border-dashed border-[var(--hairline)] bg-surface text-ink-faint hover:border-[var(--primary)] hover:text-ink",
        stamping && "animate-stamp",
        className,
      )}
    >
      {owned && check}
      <span>{code}</span>
    </button>
  );
}
