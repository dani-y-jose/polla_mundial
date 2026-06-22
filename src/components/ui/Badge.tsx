import { cn } from "./cn";

// Small status pill. Brand tones use design tokens; the podium tones (gold /
// silver / bronze) match the leaderboard rank badges duplicated in dashboard and
// group detail.
export type BadgeTone =
  | "primary"
  | "danger"
  | "warning"
  | "neutral"
  | "gold"
  | "silver"
  | "bronze";

const TONES: Record<BadgeTone, string> = {
  primary: "bg-primary/20 border-primary/30 text-primary-soft",
  danger: "bg-danger/20 border-danger/30 text-red-300",
  warning: "bg-warning/20 border-warning/30 text-amber-200",
  neutral: "bg-white/5 border-white/10 text-gray-400",
  gold: "bg-yellow-500/20 border-yellow-500/40 text-yellow-200",
  silver: "bg-slate-300/20 border-slate-300/40 text-slate-200",
  bronze: "bg-amber-700/20 border-amber-600/40 text-amber-200",
};

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
