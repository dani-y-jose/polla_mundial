import { cn } from "./cn";

// The ubiquitous surface container: `bg-white/5 border border-white/10 rounded-2xl`.
// `padding` covers the common steps; `blur` adds the glassmorphism backdrop used
// by the auth/group cards. Gradient/alert surfaces are their own components.
export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  padding?: "none" | "sm" | "md" | "lg";
  blur?: boolean;
};

const PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function Card({ padding = "md", blur = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white/5 border border-white/10 rounded-2xl",
        PADDING[padding],
        blur && "backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}
