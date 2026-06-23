import { cn } from "./cn";

// Pastilla de estado. Tonos de marca = tinte translúcido + texto del mismo
// color. El podio (gold/silver/bronze) usa el metálico SÓLIDO con texto oscuro,
// como una medalla. Sin borde (no es interactivo).
export type BadgeTone =
  | "primary"
  | "danger"
  | "warning"
  | "neutral"
  | "gold"
  | "silver"
  | "bronze";

const TONES: Record<BadgeTone, string> = {
  primary: "bg-primary/18 text-[var(--primary-strong)]",
  danger: "bg-danger/18 text-[var(--danger)]",
  warning: "bg-warning/20 text-[var(--warning)]",
  neutral: "bg-ink/8 text-ink-muted",
  gold: "bg-gold text-[#2e2200]",
  silver: "bg-silver text-[#1b2226]",
  bronze: "bg-bronze text-[#2a1606]",
};

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
