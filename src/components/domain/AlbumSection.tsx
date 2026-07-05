"use client";

import { useState } from "react";
import { cn, Badge } from "@/components/ui";
import { TeamFlag } from "./TeamFlag";
import { StickerCell } from "./StickerCell";

// Bloque de un equipo/sección del álbum: cabecera (figurita + nombre + progreso)
// sobre una grilla densa de StickerCell. Colapsable. Aplica el filtro
// tengo/faltan/todas. DELEITE: colapso suave (grid-rows, motion-safe) y, al
// completar el equipo, la figurita se ladea (.tilt) y el contador pasa a un
// sello dorado con check. Presentacional — owned/onToggle vienen del padre.
export type AlbumStickerItem = { code: string; label?: string };
export type AlbumSectionFilter = "all" | "owned" | "missing";

export type AlbumSectionProps = {
  team: string;
  stickers: AlbumStickerItem[];
  owned: Set<string>;
  onToggle?: (code: string) => void;
  filter?: AlbumSectionFilter;
  defaultOpen?: boolean;
  className?: string;
};

const chevron = (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current" aria-hidden>
    <path d="M7 10l5 5 5-5z" />
  </svg>
);
const check = (
  <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 fill-current" aria-hidden>
    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.42z" />
  </svg>
);

export function AlbumSection({
  team,
  stickers,
  owned,
  onToggle,
  filter = "all",
  defaultOpen = true,
  className,
}: AlbumSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const have = stickers.reduce((n, s) => (owned.has(s.code) ? n + 1 : n), 0);
  const complete = stickers.length > 0 && have === stickers.length;
  const shown = stickers.filter((s) =>
    filter === "owned" ? owned.has(s.code) : filter === "missing" ? !owned.has(s.code) : true,
  );

  return (
    <section className={cn("overflow-hidden rounded-2xl bg-surface ring-1 ring-[var(--hairline)]", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <TeamFlag team={team} size="sm" className={cn("transition-transform", complete && "tilt-r")} />
        <span className="flex-1 truncate font-display font-bold text-ink">{team}</span>
        <Badge tone={complete ? "gold" : "neutral"}>
          {complete && check}
          {have}/{stickers.length}
        </Badge>
        <span className={cn("text-ink-faint transition-transform", open && "rotate-180")}>{chevron}</span>
      </button>

      <div
        className={cn(
          "grid ease-out motion-safe:transition-[grid-template-rows] motion-safe:duration-300",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">
            {shown.length === 0 ? (
              <p className="py-2 text-xs text-ink-faint">
                {filter === "owned"
                  ? "Todavía no tienes ninguna de este equipo."
                  : "¡Completo! No te falta ninguna."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {shown.map((s) => (
                  <StickerCell
                    key={s.code}
                    code={s.code}
                    label={s.label}
                    owned={owned.has(s.code)}
                    onToggle={() => onToggle?.(s.code)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
