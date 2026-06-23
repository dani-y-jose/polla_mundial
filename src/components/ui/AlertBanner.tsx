import { cn } from "./cn";

// Banner de feedback inline (error, success, warning, neutral). El tono se
// transmite por el TINTE del fondo (sin franja lateral, sin borde). role="alert"
// para errores (asertivo) y "status" para el resto.
export type AlertTone = "error" | "success" | "warning" | "neutral";

const TONES: Record<AlertTone, string> = {
  error: "bg-danger/12",
  success: "bg-primary/12",
  warning: "bg-warning/14",
  neutral: "bg-ink/6",
};

export type AlertBannerProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone;
};

export function AlertBanner({ tone = "neutral", className, role, ...props }: AlertBannerProps) {
  return (
    <div
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={cn("p-3 rounded-xl text-sm text-ink", TONES[tone], className)}
      {...props}
    />
  );
}
