// Tiny class-name joiner: filters out falsy values and joins with spaces. Avoids
// a clsx / tailwind-merge dependency — these primitives don't rely on merging
// conflicting Tailwind classes, so a plain join is enough. Caller-supplied
// `className` always comes last so it can still override.
export type ClassValue = string | number | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
