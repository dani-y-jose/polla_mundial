"use client";

import { useEffect, useState } from "react";
import { cn } from "@/components/ui";

// Toggle de tema segmentado (auto / claro / oscuro). Escribe `data-theme` en
// <html>; el script anti-flash de layout.tsx resuelve system→light/dark al cargar.
type ThemeChoice = "system" | "light" | "dark";

function applyTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem("theme", choice);
  } catch {}
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const resolved = dark ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    let c: ThemeChoice = "system";
    try {
      c = (localStorage.getItem("theme") as ThemeChoice) || "system";
    } catch {}
    // Leemos localStorage post-montaje para reflejar el tema sin mismatch de
    // hidratación (el server no conoce localStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(c);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let cur: ThemeChoice = "system";
      try {
        cur = (localStorage.getItem("theme") as ThemeChoice) || "system";
      } catch {}
      if (cur === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const opts: { id: ThemeChoice; label: string }[] = [
    { id: "system", label: "Auto" },
    { id: "light", label: "Claro" },
    { id: "dark", label: "Oscuro" },
  ];

  return (
    <div className={cn("inline-flex gap-0.5 rounded-full bg-surface-2 p-0.5", className)}>
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => {
            applyTheme(o.id);
            setChoice(o.id);
          }}
          aria-pressed={choice === o.id}
          className={cn(
            "edge rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            choice === o.id ? "bg-primary text-[var(--on-primary)]" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
