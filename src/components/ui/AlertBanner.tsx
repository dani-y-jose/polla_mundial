import { cn } from "./cn";

// Inline feedback banner — the four tones the login page hand-rolled (error,
// success, warning, neutral). Defaults role to "alert" for errors (assertive)
// and "status" otherwise, so screen readers announce them appropriately.
export type AlertTone = "error" | "success" | "warning" | "neutral";

const TONES: Record<AlertTone, string> = {
  error: "bg-danger/15 border-danger/40 text-red-200",
  success: "bg-primary/15 border-primary/40 text-emerald-200",
  warning: "bg-warning/15 border-warning/40 text-amber-200",
  neutral: "bg-white/5 border-white/10 text-gray-300",
};

export type AlertBannerProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone;
};

export function AlertBanner({ tone = "neutral", className, role, ...props }: AlertBannerProps) {
  return (
    <div
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={cn("p-3 rounded-xl border text-sm", TONES[tone], className)}
      {...props}
    />
  );
}
