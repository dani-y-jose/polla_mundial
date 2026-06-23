import Flag from "react-world-flags";
import { getFlagCode } from "@/lib/flags";
import { cn } from "@/components/ui";

// Bandera del equipo como FIGURITA: el SVG (react-world-flags) montado en un
// marco tipo sticker — paspartú claro (surface-2 → casi blanco en claro),
// hairline y un lift mínimo — para que resalte sobre la card y las banderas con
// blanco no se fundan. Se dimensiona por altura (`size`), ancho natural, y crece
// un paso en ≥sm (responsive). `framed={false}` devuelve la bandera pelada para
// usos inline muy compactos. Fallback neutro para equipos sin país (TBD).
export type TeamFlagSize = "xs" | "sm" | "md" | "lg" | "xl";

export type TeamFlagProps = {
  team: string;
  size?: TeamFlagSize;
  framed?: boolean;
  className?: string;
};

// Alto de la bandera por tamaño — escalonado y responsive (un paso más en ≥sm).
const FLAG_H: Record<TeamFlagSize, string> = {
  xs: "h-3.5",            // 14px — inline denso
  sm: "h-5 sm:h-6",       // 20→24
  md: "h-7 sm:h-8",       // 28→32
  lg: "h-10 sm:h-12",     // 40→48
  xl: "h-14 sm:h-[68px]", // 56→68 — hero
};

// Marco del sticker por tamaño: [clases del paspartú, radio interior de la bandera].
const FRAME: Record<TeamFlagSize, { wrap: string; inner: string }> = {
  xs: { wrap: "rounded-[3px] p-px", inner: "rounded-[2px]" },
  sm: { wrap: "rounded-[5px] p-[1.5px]", inner: "rounded-[3px]" },
  md: { wrap: "rounded-md p-0.5", inner: "rounded-[4px]" },
  lg: { wrap: "rounded-lg p-[2.5px]", inner: "rounded-md" },
  xl: { wrap: "rounded-[10px] p-[3px]", inner: "rounded-lg" },
};

export function TeamFlag({ team, size = "md", framed = true, className }: TeamFlagProps) {
  const code = getFlagCode(team);
  const { wrap, inner } = FRAME[size];

  // Ring interior: evita que las banderas con blanco se fundan con el paspartú.
  const imgCls = cn(
    FLAG_H[size],
    "block w-auto shrink-0 ring-1 ring-[var(--hairline)]",
    inner,
    !framed && "shadow-sm",
    !framed && className,
  );
  const fallback = (
    <span className={cn(imgCls, "inline-block aspect-[3/2] bg-ink/10")} aria-hidden />
  );
  const flag = code ? (
    <Flag code={code} aria-hidden className={imgCls} fallback={fallback} />
  ) : (
    fallback
  );

  if (!framed) return flag;

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 bg-surface-2 ring-1 ring-[var(--hairline)] shadow-sm",
        wrap,
        className,
      )}
    >
      {flag}
    </span>
  );
}
