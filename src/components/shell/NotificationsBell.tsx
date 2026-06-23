"use client";

import { useState } from "react";
import { cn } from "@/components/ui";
import { BellIcon } from "./icons";

// Campana de notificaciones: botón con contador de no leídas + panel desplegable
// con la lista. Al abrir, marca todo como leído (onOpen). Pensada para el saludo
// del dashboard (esquina derecha), reemplaza al header-solo-logo en mobile.
export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  read: boolean;
};

export type NotificationsBellProps = {
  items: NotificationItem[];
  onOpen?: () => void;
  className?: string;
};

export function NotificationsBell({ items, onOpen, className }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !n.read).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) onOpen?.();
  }

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={toggle}
        aria-label={unread ? `Notificaciones (${unread} sin leer)` : "Notificaciones"}
        aria-expanded={open}
        className="edge relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-[18px] text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-2 w-72 max-w-[80vw] overflow-hidden rounded-2xl bg-surface-2 shadow-lg ring-1 ring-[var(--hairline)]">
            <div className="border-b border-[var(--hairline)] px-4 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Notificaciones</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-muted">No tienes notificaciones.</p>
              ) : (
                items.map((n) => (
                  <div
                    key={n.id}
                    className={cn("border-b border-[var(--hairline)] px-4 py-3 last:border-0", !n.read && "bg-surface")}
                  >
                    {n.title && <p className="text-sm font-bold text-ink">{n.title}</p>}
                    {n.message && <p className="text-xs text-ink-muted">{n.message}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
