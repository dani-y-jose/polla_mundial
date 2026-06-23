import { cn } from "./cn";

// Etiqueta de formulario. `micro` = caption chico (sin mayúsculas forzadas, que
// es un tell de AI); `default` = estilo más grande. Pasá siempre htmlFor para
// asociar la etiqueta con su campo.
export type FormLabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  variant?: "micro" | "default";
};

const VARIANTS: Record<NonNullable<FormLabelProps["variant"]>, string> = {
  micro: "text-xs font-semibold text-ink-muted",
  default: "text-sm font-medium text-ink",
};

export function FormLabel({ variant = "micro", className, ...props }: FormLabelProps) {
  return <label className={cn("block mb-1", VARIANTS[variant], className)} {...props} />;
}
