import type { Group } from "@/types";
import { cn } from "@/components/ui";

// Selector del grupo activo, compartido por las tabs del dashboard. No renderiza
// nada si el usuario no tiene grupos. Mantiene su propio <select> (texto en
// negrita) al tono del primitivo Select.
export type GroupSelectorProps = {
  groups: Group[];
  selectedGroup: Group | null;
  onChange: (groupId: string) => void;
  label: string;
  className?: string;
};

export function GroupSelector({
  groups,
  selectedGroup,
  onChange,
  label,
  className,
}: GroupSelectorProps) {
  if (groups.length === 0) return null;
  return (
    <div className={cn("space-y-1", className)}>
      <label className="block text-xs font-semibold text-ink-muted">{label}</label>
      <select
        value={selectedGroup?.id || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-xl text-sm font-bold bg-surface-2 text-ink border-2 border-transparent transition-colors hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id} className="bg-surface text-ink">
            {group.name} ({group.inviteCode})
          </option>
        ))}
      </select>
    </div>
  );
}
