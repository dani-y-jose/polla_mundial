import { cn } from "@/components/ui";

// Leaderboard rank indicator. `pill` matches the group-detail podium chips
// ("1º 🏆"); `circle` matches the dashboard's numbered medallion. Ranks beyond
// 3rd render neutral.
const PODIUM: Record<number, { surface: string; text: string; medal: string }> = {
  1: { surface: "bg-yellow-500/20 border-yellow-500/40", text: "text-yellow-200", medal: "🏆" },
  2: { surface: "bg-slate-300/20 border-slate-300/40", text: "text-slate-200", medal: "🥈" },
  3: { surface: "bg-amber-700/20 border-amber-600/40", text: "text-amber-200", medal: "🥉" },
};
const NEUTRAL = { surface: "bg-neutral-800 border-neutral-700", text: "text-gray-400", medal: "" };

export type RankBadgeProps = {
  rank: number; // 1-based standing
  variant?: "pill" | "circle";
  className?: string;
};

export function RankBadge({ rank, variant = "circle", className }: RankBadgeProps) {
  const s = PODIUM[rank] ?? NEUTRAL;

  if (variant === "pill") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
          s.surface,
          s.text,
          className,
        )}
      >
        {rank}º{s.medal && <span aria-hidden>{s.medal}</span>}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold",
        s.surface,
        s.text,
        className,
      )}
    >
      {rank}
    </span>
  );
}
