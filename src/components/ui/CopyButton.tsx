"use client";

import { useState } from "react";
import { cn } from "./cn";

// Botón de copiar al portapapeles con feedback: el icono pasa a un check (teal)
// por ~1.5s. Reusable para códigos de invitación, enlaces, etc.
export type CopyButtonProps = {
  value: string;
  label?: string;
  className?: string;
};

export function CopyButton({ value, label = "Copiar", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* portapapeles no disponible */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copiado" : label}
      className={cn(
        "edge inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        copied ? "text-[var(--primary-strong)]" : "text-ink-muted hover:text-ink",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {copied ? (
          <path d="M20 6 9 17l-5-5" />
        ) : (
          <>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        )}
      </svg>
    </button>
  );
}
