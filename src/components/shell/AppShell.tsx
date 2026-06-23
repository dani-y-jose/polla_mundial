"use client";

import { cn } from "@/components/ui";

// Shell responsivo de la app. En ≥lg: sidebar fija a la izquierda (marca +
// selector de grupo + navegación + footer). En <lg: NO hay header (sería un
// logo y nada más) — sólo contenido + bottom-bar fija abajo. Las acciones
// globales (campana) viven dentro del contenido (p. ej. junto al saludo).
export type NavItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
};

export type AppShellProps = {
  items: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  brand?: React.ReactNode;
  /** Slot de la sidebar (≥lg): selector de grupo completo. */
  groupSelector?: React.ReactNode;
  /** Pie de la sidebar (≥lg): toggle de tema, etc. */
  sidebarFooter?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
};

function SideNav({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "edge flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        active ? "bg-primary text-[var(--on-primary)]" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function BottomNav({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold transition-colors focus:outline-none",
        active ? "text-ink" : "text-ink-faint hover:text-ink-muted",
      )}
    >
      <span className={cn("flex h-8 w-12 items-center justify-center rounded-full transition-colors", active && "bg-surface-2")}>
        {item.icon}
      </span>
      <span className="max-w-[72px] truncate">{item.label}</span>
    </button>
  );
}

export function AppShell({
  items,
  activeKey,
  onSelect,
  brand,
  groupSelector,
  sidebarFooter,
  children,
  contentClassName,
}: AppShellProps) {
  return (
    <div className="min-h-screen text-ink">
      {/* Sidebar — ≥lg */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-4 border-r border-[var(--hairline)] bg-surface p-4 lg:flex">
        {brand && <div className="px-2 pt-1">{brand}</div>}
        {groupSelector && <div className="px-0.5">{groupSelector}</div>}
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((it) => (
            <SideNav key={it.key} item={it} active={it.key === activeKey} onClick={() => onSelect(it.key)} />
          ))}
        </nav>
        {sidebarFooter && <div className="border-t border-[var(--hairline)] pt-3">{sidebarFooter}</div>}
      </aside>

      {/* Contenido */}
      <main className="lg:pl-64">
        <div
          className={cn(
            "mx-auto w-full max-w-3xl px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))] lg:px-8 lg:pb-12 lg:pt-8",
            contentClassName,
          )}
        >
          {children}
        </div>
      </main>

      {/* Bottom-bar — sólo <lg */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--hairline)] bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="flex items-stretch justify-around">
          {items.map((it) => (
            <BottomNav key={it.key} item={it} active={it.key === activeKey} onClick={() => onSelect(it.key)} />
          ))}
        </div>
      </nav>
    </div>
  );
}
