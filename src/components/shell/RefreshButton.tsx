"use client";

import { cn } from "@/components/ui";

// Botón de icono circular para "actualizar", con el MISMO look que la campana de
// notificaciones (h-10 w-10, redondo, bg-surface, icono de trazo 1.8) para que
// las cabeceras se vean uniformes. El icono gira mientras `refreshing`.
export type RefreshButtonProps = {
  onClick?: () => void;
  refreshing?: boolean;
  className?: string;
};

export function RefreshButton({ onClick, refreshing = false, className }: RefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={refreshing}
      aria-label="Actualizar"
      className={cn(
        "edge inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("h-5 w-5", refreshing && "motion-safe:animate-spin")}
        aria-hidden
      >
        <path d="M23 4v6h-6" />
        <path d="M1 20v-6h6" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
        <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  );
}
