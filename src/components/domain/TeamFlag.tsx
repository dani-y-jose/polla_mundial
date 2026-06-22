import Flag from "react-world-flags";
import { getFlagCode } from "@/lib/flags";
import { cn } from "@/components/ui";

// Bandera SVG del equipo (react-world-flags). Se dimensiona por altura (`size`),
// ancho natural. Esquina redondeada + hairline para que las banderas con blanco
// no se fundan con la superficie. Fallback neutro para equipos sin país (TBD).
export type TeamFlagProps = {
  team: string;
  size?: "sm" | "md";
  className?: string;
};

const SIZES: Record<NonNullable<TeamFlagProps["size"]>, string> = {
  sm: "h-[13px]",
  md: "h-[22px]",
};

export function TeamFlag({ team, size = "sm", className }: TeamFlagProps) {
  const code = getFlagCode(team);
  const cls = cn(SIZES[size], "w-auto shrink-0 rounded-[2px] ring-1 ring-[var(--hairline)]", className);
  const fallback = <span className={cn(cls, "inline-block aspect-[3/2] bg-ink/10")} aria-hidden />;
  if (!code) return fallback;
  return <Flag code={code} aria-hidden className={cls} fallback={fallback} />;
}
