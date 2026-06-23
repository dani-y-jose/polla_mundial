import { Badge, cn } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import type { MatchStatus } from "@/types";

// Estado del partido como pill (lifecycle upcoming→locked→finished). `locked`
// = post-kickoff (auto-lock), o sea EN VIVO, con punto pulsante.
const MAP: Record<MatchStatus, { tone: BadgeTone; label: string }> = {
  upcoming: { tone: "accent", label: "Próximo" },
  locked: { tone: "danger", label: "En vivo" },
  finished: { tone: "neutral", label: "Final" },
};

export type MatchStatusBadgeProps = {
  status: MatchStatus;
  className?: string;
};

export function MatchStatusBadge({ status, className }: MatchStatusBadgeProps) {
  const m = MAP[status] ?? MAP.upcoming;
  if (status === "locked") {
    return (
      <Badge tone={m.tone} className={cn("gap-1.5", className)}>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden />
        {m.label}
      </Badge>
    );
  }
  return (
    <Badge tone={m.tone} className={className}>
      {m.label}
    </Badge>
  );
}
